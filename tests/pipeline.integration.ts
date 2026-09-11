/**
 * End-to-end check of the ffmpeg pipeline without Electron.
 * Generates a synthetic video, renders one part per layout, a preview frame and runs silence detection.
 *
 *   npm run test:integration
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import ffmpegStatic from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'
import { buildGraph } from '../src/main/filtergraph'
import { videoEncoderArgs, AUDIO_ARGS } from '../src/shared/encoding'
import { DEFAULT_SETTINGS } from '../src/shared/types'
import { formatFfmpegTime } from '../src/shared/time'
import { parseSilenceOutput, planParts } from '../src/shared/plan'
import { combineFrame, outputSize } from '../src/shared/output'
import { planHighlights, segmentFps } from '../src/shared/highlights'
import { renderCombine, renderHighlights } from '../src/main/compose'
import { probeFile } from '../src/main/probe'
import type { PartOverlays, Settings } from '../src/shared/types'

const ff = String(ffmpegStatic)
const ffprobe = ffprobeStatic.path
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mts-it-'))
const src = path.join(dir, 'test.mp4')
let failed = false

function run(bin: string, args: string[]): { code: number | null; out: string; err: string } {
  const r = spawnSync(bin, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  return { code: r.status, out: r.stdout, err: r.stderr }
}
function check(ok: boolean, label: string, detail = ''): void {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ' ' + detail : ''}`)
  if (!ok) failed = true
}

// 1. synthetic source: 45 s, 1920x800, tone with a 2 s silence every 10 s
run(ff, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1920x800:rate=30', '-f', 'lavfi', '-i',
  "aevalsrc='if(lt(mod(t,10),8),0.4*sin(440*2*PI*t),0)':s=48000", '-t', '45', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', src])
check(fs.existsSync(src), 'synthetic source created')
run(ff, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=red@0.85:s=320x110,format=rgba', '-frames:v', '1', path.join(dir, 'badge.png')])
run(ff, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=white@0.9:s=420x100,format=rgba', '-frames:v', '1', path.join(dir, 'teaser.png')])

// 2. silence detection + planning
const sil = run(ff, ['-hide_banner', '-nostats', '-loglevel', 'info', '-i', src, '-map', '0:1', '-vn', '-sn', '-dn', '-af', 'silencedetect=noise=-30dB:d=0.35', '-f', 'null', '-progress', 'pipe:1', '-'])
const silences = parseSilenceOutput(sil.err)
check(silences.length >= 3, 'silences detected', silences.map((s) => `${s.start.toFixed(1)}-${s.end.toFixed(1)}`).join(' '))
check(sil.out.includes('out_time_us='), 'progress reported on stdout')
const parts = planParts({ durationSec: 45, skipStartSec: 3, skipEndSec: 2, targetLengthSec: 15, maxLengthSec: 180, smartCut: true, silences, searchWindowSec: 6 })
check(parts.length === 3 && parts.every((p) => p.duration <= 180), 'plan built', parts.map((p) => `${p.start}-${p.end}${p.snappedEnd ? '*' : ''}`).join(' '))

// 3. render one part per layout with every overlay type
const settings = { ...DEFAULT_SETTINGS }
for (const layout of ['blur', 'fill', 'solid'] as const) {
  const part = parts[0]
  const graph = buildGraph({
    settings: { ...settings, layout },
    srcW: 1920, srcH: 800, storedW: 1920, storedH: 800,
    videoStreamIndex: 0, audioStreamIndex: 1, fps: null, partDuration: part.duration,
    overlays: [
      { path: path.join(dir, 'badge.png'), position: 'top-left', offsetY: 0 },
      { path: path.join(dir, 'teaser.png'), position: 'bottom-center', from: part.duration - 3, to: part.duration + 1, fadeIn: 0.35, offsetY: 0 }
    ]
  })
  const out = path.join(dir, `out-${layout}.mp4`)
  const t0 = Date.now()
  const r = run(ff, ['-hide_banner', '-nostats', '-loglevel', 'error', '-y', '-ss', formatFfmpegTime(part.start), '-t', formatFfmpegTime(part.duration), '-i', src,
    ...graph.inputArgs, '-filter_complex', graph.filterComplex, '-map', graph.videoLabel, '-map', graph.audioLabel!,
    ...videoEncoderArgs(null, 'fast'), '-pix_fmt', 'yuv420p', '-fps_mode', 'cfr', ...AUDIO_ARGS, '-movflags', '+faststart', '-progress', 'pipe:1', out])
  if (r.code !== 0) {
    check(false, `render ${layout}`, r.err.trim().split('\n').slice(-3).join(' | '))
    console.log('   graph:', graph.filterComplex)
    continue
  }
  const probe = run(ffprobe, ['-v', 'error', '-show_entries', 'stream=codec_type,width,height:format=duration', '-of', 'json', out])
  const info = JSON.parse(probe.out) as { streams: Array<{ codec_type: string; width?: number; height?: number }>; format: { duration: string } }
  const v = info.streams.find((s) => s.codec_type === 'video')
  const a = info.streams.find((s) => s.codec_type === 'audio')
  const durOk = Math.abs(Number(info.format.duration) - part.duration) < 0.3
  check(v?.width === 1080 && v?.height === 1920 && !!a && durOk, `render ${layout}`,
    `${((Date.now() - t0) / 1000).toFixed(1)}s, ${v?.width}x${v?.height}, audio=${!!a}, duration=${Number(info.format.duration).toFixed(2)}s (want ${part.duration})`)
}

// 4. preview frame at the end of a part (teaser visible, progress bar nearly full)
{
  const part = parts[1]
  const graph = buildGraph({
    settings, srcW: 1920, srcH: 800, storedW: 1920, storedH: 800, videoStreamIndex: 0, audioStreamIndex: undefined,
    fps: null, partDuration: part.duration, previewOffset: part.duration - 1.5,
    overlays: [
      { path: path.join(dir, 'badge.png'), position: 'top-right' },
      { path: path.join(dir, 'teaser.png'), position: 'bottom-center', from: part.duration - 3, to: part.duration + 1, fadeIn: 0.35 }
    ]
  })
  const out = path.join(dir, 'preview.jpg')
  const r = run(ff, ['-hide_banner', '-nostats', '-loglevel', 'error', '-y', '-ss', formatFfmpegTime(part.start + part.duration - 1.5), '-t', '1', '-i', src,
    ...graph.inputArgs, '-filter_complex', graph.filterComplex, '-map', graph.videoLabel, '-frames:v', '1', '-q:v', '3', '-f', 'image2', '-update', '1', out])
  check(r.code === 0 && fs.existsSync(out) && fs.statSync(out).size > 10_000, 'preview frame', r.code === 0 ? `${fs.statSync(out).size} bytes` : r.err.trim())
}

// ---------------------------------------------------------------------------
// 5. A source that is already vertical: single clip, kept at its own size,
//    with an animated intro and an end call-to-action.
// ---------------------------------------------------------------------------
{
  const vert = path.join(dir, 'vertical.mp4')
  run(ff, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1080x1920:rate=30', '-f', 'lavfi', '-i',
    'sine=frequency=300:sample_rate=48000', '-t', '20', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', vert])
  check(fs.existsSync(vert), 'vertical source created')

  const size = outputSize(1080, 1920, 'auto')
  check(size.keptSource && size.width === 1080 && size.height === 1920, 'vertical source keeps its frame', `${size.width}x${size.height}`)

  const part = planParts({
    durationSec: 20, skipStartSec: 0, skipEndSec: 0, targetLengthSec: 120,
    maxLengthSec: 180, smartCut: false, searchWindowSec: 10
  })[0]
  check(!!part && part.duration === 20, 'short video plans as one clip')

  const graph = buildGraph({
    settings: { ...DEFAULT_SETTINGS, badgeEnabled: false, teaserEnabled: false },
    srcW: 1080, srcH: 1920, storedW: 1080, storedH: 1920,
    videoStreamIndex: 0, audioStreamIndex: 1, fps: null, partDuration: part.duration,
    overlays: [
      { path: path.join(dir, 'badge.png'), position: 'top-center', from: 0, to: 3, fadeIn: 0.35, fadeOut: 0.5, animate: 'rise' },
      { path: path.join(dir, 'teaser.png'), position: 'bottom-center', from: 17, to: 21, fadeIn: 0.35, animate: 'rise' }
    ]
  })
  check(graph.filterComplex.includes('scale=1080:1920:flags=lanczos'), 'no re-framing: straight scale to the source frame')
  check(!graph.filterComplex.includes('gblur'), 'no blurred backdrop when the frame already fits')

  const out = path.join(dir, 'single.mp4')
  const t0 = Date.now()
  const r = run(ff, ['-hide_banner', '-nostats', '-loglevel', 'error', '-y', '-ss', formatFfmpegTime(part.start), '-t', formatFfmpegTime(part.duration), '-i', vert,
    ...graph.inputArgs, '-filter_complex', graph.filterComplex, '-map', graph.videoLabel, '-map', graph.audioLabel!,
    ...videoEncoderArgs(null, 'fast'), '-pix_fmt', 'yuv420p', '-fps_mode', 'cfr', ...AUDIO_ARGS, '-movflags', '+faststart', out])
  if (r.code !== 0) {
    check(false, 'render single clip', r.err.trim().split('\n').slice(-3).join(' | '))
    console.log('   graph:', graph.filterComplex)
  } else {
    const probe = run(ffprobe, ['-v', 'error', '-show_entries', 'stream=codec_type,width,height:format=duration', '-of', 'json', out])
    const info = JSON.parse(probe.out) as { streams: Array<{ codec_type: string; width?: number; height?: number }>; format: { duration: string } }
    const v = info.streams.find((s) => s.codec_type === 'video')
    const durOk = Math.abs(Number(info.format.duration) - part.duration) < 0.3
    check(v?.width === 1080 && v?.height === 1920 && durOk, 'render single clip',
      `${((Date.now() - t0) / 1000).toFixed(1)}s, ${v?.width}x${v?.height}, duration=${Number(info.format.duration).toFixed(2)}s`)
  }
}

// ---------------------------------------------------------------------------
// 6. Highlights and Combine through the real compose pipeline: cut -> join -> brand.
// ---------------------------------------------------------------------------
interface Probed {
  streams: Array<{ codec_type: string; width?: number; height?: number; duration?: string }>
  format: { duration: string }
}
function probeJson(file: string): Probed {
  return JSON.parse(run(ffprobe, ['-v', 'error', '-show_entries', 'stream=codec_type,width,height,duration:format=duration', '-of', 'json', file]).out) as Probed
}
function meanVolume(file: string, from: number, len: number): number {
  const r = run(ff, ['-hide_banner', '-nostats', '-ss', String(from), '-t', String(len), '-i', file, '-af', 'volumedetect', '-f', 'null', '-'])
  const m = /mean_volume:\s*(-?[\d.]+|-inf) dB/.exec(r.err)
  return !m || m[1] === '-inf' ? -999 : Number(m[1])
}
const dataUrl = (file: string): string => 'data:image/png;base64,' + fs.readFileSync(file).toString('base64')

async function composeChecks(): Promise<void> {
  const outRoot = path.join(dir, 'out')
  const settings: Settings = { ...DEFAULT_SETTINGS, outputDir: outRoot, quality: 'fast' }
  const ctx = { signal: new AbortController().signal, tempRoot: dir, onProgress: () => undefined }
  const overlays: PartOverlays = {
    intro: { dataUrl: dataUrl(path.join(dir, 'badge.png')), position: 'top-center', from: 0, to: 2, fadeIn: 0.3, fadeOut: 0.3, animate: 'rise' }
  }

  // --- highlights: 45 s landscape video -> 12 s silent vertical recap of 1.5 s snippets ---
  const longSrc = await probeFile(src, 'Integration Long', 'local', undefined, { thumbnail: false })
  const fps = segmentFps(longSrc.fps, 'source')
  const segments = planHighlights({ durationSec: longSrc.durationSec, skipStartSec: 0, skipEndSec: 0, targetSec: 12, clipSec: 1.5, fps })
  check(segments.length === 8, 'highlights plan', `${segments.length} snippets at ${fps} fps`)
  const t0 = Date.now()
  const hl = await renderHighlights({ source: longSrc, settings, segments, fps, overlays }, ctx)
  const hlInfo = probeJson(hl.files[0])
  const hlVideo = hlInfo.streams.find((x) => x.codec_type === 'video')
  const hlAudio = hlInfo.streams.find((x) => x.codec_type === 'audio')
  check(
    hlVideo?.width === 1080 && hlVideo?.height === 1920 && !hlAudio && Math.abs(Number(hlInfo.format.duration) - 12) < 0.1,
    'render highlights',
    `${((Date.now() - t0) / 1000).toFixed(1)}s, ${hlVideo?.width}x${hlVideo?.height}, audio=${!!hlAudio}, duration=${Number(hlInfo.format.duration).toFixed(2)}s (want 12, silent)`
  )

  // --- combine: three clips with different sizes, rates, sample rates, one with no sound ---
  const clipA = path.join(dir, 'clipA.mp4')
  const clipB = path.join(dir, 'clipB.mp4')
  const clipC = path.join(dir, 'clipC.mp4')
  run(ff, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1080x1920:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
    '-t', '6', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', clipA])
  run(ff, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=720x1280:rate=25',
    '-t', '4.2', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-an', clipB])
  run(ff, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=24', '-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=44100',
    '-t', '5', '-ac', '1', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', clipC])
  const clips = await Promise.all([clipA, clipB, clipC].map((f) => probeFile(f, path.basename(f, '.mp4'), 'local', undefined, { thumbnail: false })))
  const cFps = segmentFps(clips[0].fps, 'source')
  const frame = combineFrame(clips.map((c) => ({ width: c.displayWidth, height: c.displayHeight })), 'auto')
  check(frame.width === 1080 && frame.height === 1920, 'combine frame for mixed shapes', `${frame.width}x${frame.height}`)

  const t1 = Date.now()
  const cb = await renderCombine(
    { clips, settings: { ...settings, combineName: 'Integration Combine' }, fps: cFps, frame: { width: frame.width, height: frame.height }, overlays },
    ctx
  )
  const cbInfo = probeJson(cb.files[0])
  const cbVideo = cbInfo.streams.find((x) => x.codec_type === 'video')
  const cbAudio = cbInfo.streams.find((x) => x.codec_type === 'audio')
  const vDur = Number(cbVideo?.duration ?? 0)
  const aDur = Number(cbAudio?.duration ?? 0)
  check(
    cbVideo?.width === 1080 && cbVideo?.height === 1920 && Math.abs(vDur - 15.2) < 0.1,
    'render combine',
    `${((Date.now() - t1) / 1000).toFixed(1)}s, ${cbVideo?.width}x${cbVideo?.height}, video=${vDur.toFixed(2)}s (want 15.2)`
  )
  check(!!cbAudio && Math.abs(vDur - aDur) < 0.1, 'combine keeps sound and picture the same length', `audio=${aDur.toFixed(2)}s video=${vDur.toFixed(2)}s`)

  const loudA = meanVolume(cb.files[0], 1, 4)
  const quietB = meanVolume(cb.files[0], 6.6, 3.2)
  const loudC = meanVolume(cb.files[0], 11, 3.5)
  check(loudA > -40 && quietB < -60 && loudC > -40, 'clips joined in order with silence for the clip without sound', `A=${loudA}dB B=${quietB}dB C=${loudC}dB`)
  check(fs.existsSync(path.join(cb.outputDir, 'Integration Combine - sources.txt')), 'combine writes a sources list for credits')

  // --- sync across joins: every clip has a flash and a beep at exactly 2.000 s. After joining they
  //     must still coincide at 2, 8 and 14 s. Any drift that builds up across joins shows here. ---
  const variants = [
    { w: 1080, h: 1920, rate: 30, sr: 48000 },
    { w: 1280, h: 720, rate: 24, sr: 44100 }, // re-framed through the blur layout
    { w: 720, h: 1280, rate: 25, sr: 48000 }
  ]
  const syncFiles = variants.map((v, i) => {
    const f = path.join(dir, `sync${i}.mp4`)
    run(ff, ['-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', `color=c=black:s=${v.w}x${v.h}:r=${v.rate}:d=6,drawbox=x=0:y=0:w=${v.w}:h=${v.h}:color=white:t=fill:enable='between(t,2,2.3)'`,
      '-f', 'lavfi', '-i', `aevalsrc='if(between(t,2,2.3),0.5*sin(1000*2*PI*t),0)':s=${v.sr}:d=6`,
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', f])
    return f
  })
  const syncSources = await Promise.all(syncFiles.map((f) => probeFile(f, path.basename(f, '.mp4'), 'local', undefined, { thumbnail: false })))
  const syncFrame = combineFrame(syncSources.map((c) => ({ width: c.displayWidth, height: c.displayHeight })), 'auto')
  const plain: Settings = { ...settings, combineName: 'Integration Sync', progressBarEnabled: false, watermarkEnabled: false, introEnabled: false, ctaEnabled: false }
  const synced = await renderCombine(
    { clips: syncSources, settings: plain, fps: segmentFps(syncSources[0].fps, 'source'), frame: { width: syncFrame.width, height: syncFrame.height }, overlays: {} },
    ctx
  )
  const aLog = run(ff, ['-hide_banner', '-nostats', '-i', synced.files[0], '-af', 'silencedetect=noise=-35dB:d=0.05', '-vn', '-f', 'null', '-']).err
  const vLog = run(ff, ['-hide_banner', '-nostats', '-i', synced.files[0], '-vf', 'blackdetect=d=0.02:pix_th=0.2', '-an', '-f', 'null', '-']).err
  // Both detectors also report the end of the file as the end of a silent / black stretch: ignore it.
  const syncEnd = syncSources.length * 6 - 0.5
  const beeps = [...aLog.matchAll(/silence_end:\s*([\d.]+)/g)].map((m) => Number(m[1])).filter((t) => t < syncEnd)
  const flashes = [...vLog.matchAll(/black_end:([\d.]+)/g)].map((m) => Number(m[1])).filter((t) => t < syncEnd)
  const offsets = flashes.map((f, i) => Math.round(((beeps[i] ?? Number.NaN) - f) * 1000))
  check(
    flashes.length === 3 && beeps.length === 3 && offsets.every((o) => Math.abs(o) <= 40),
    'joined clips stay in sync',
    `flashes ${flashes.map((x) => x.toFixed(3)).join(' ')} · beeps ${beeps.map((x) => x.toFixed(3)).join(' ')} · sound minus picture ${offsets.join(' / ')} ms`
  )
}

composeChecks()
  .catch((err: unknown) => check(false, 'compose pipeline threw', err instanceof Error ? err.message : String(err)))
  .finally(() => {
    console.log(`
artifacts in ${dir}
`)
    process.exit(failed ? 1 : 0)
  })
