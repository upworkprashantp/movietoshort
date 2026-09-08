import fs from 'node:fs'
import path from 'node:path'
import { ffmpegPath, tempDir } from './binaries'
import { run, CancelledError, ProcessError } from './proc'
import { buildGraph, type OverlayFile } from './filtergraph'
import { detectHardwareEncoder } from './encoders'
import { AUDIO_ARGS, videoEncoderArgs } from '@shared/encoding'
import type {
  PartOverlays,
  PartPlan,
  PreviewRequest,
  ProgressEvent,
  RenderJob,
  RenderResult,
  Settings,
  SourceInfo
} from '@shared/types'
import { formatFfmpegTime, formatTime } from '@shared/time'
import { padWidth, renderTemplate, safeFileName } from '@shared/plan'

const OVERLAY_ORDER: Array<keyof PartOverlays> = ['badge', 'title', 'watermark', 'teaser']

function writeDataUrl(dataUrl: string, file: string): void {
  const comma = dataUrl.indexOf(',')
  fs.writeFileSync(file, Buffer.from(dataUrl.slice(comma + 1), 'base64'))
}

/** Persist the renderer-generated PNGs for one part and describe them for the graph builder. */
function materialiseOverlays(overlays: PartOverlays, dir: string, tag: string): OverlayFile[] {
  const out: OverlayFile[] = []
  for (const key of OVERLAY_ORDER) {
    const ov = overlays[key]
    if (!ov) continue
    const file = path.join(dir, `${tag}-${key}.png`)
    writeDataUrl(ov.dataUrl, file)
    out.push({ path: file, position: ov.position, from: ov.from, to: ov.to, fadeIn: ov.fadeIn, offsetY: ov.offsetY })
  }
  return out
}

function targetFps(settings: Settings, source: SourceInfo): number | null {
  if (settings.fpsMode === '30') return 30
  if (settings.fpsMode === '60') return 60
  return source.fps > 60 ? 60 : null
}

function baseInputArgs(source: SourceInfo, part: PartPlan): string[] {
  return ['-ss', formatFfmpegTime(part.start), '-t', formatFfmpegTime(part.duration), '-i', source.path]
}

function parseProgressLine(line: string): { outTimeSec?: number; fps?: number; speed?: string; end?: boolean } {
  const m = /^(\w+)=(.*)$/.exec(line)
  if (!m) return {}
  const [, key, value] = m
  if (key === 'out_time_us' || key === 'out_time_ms') return { outTimeSec: Number(value) / 1_000_000 }
  if (key === 'fps') return { fps: Number(value) }
  if (key === 'speed') return { speed: value.trim() }
  if (key === 'progress') return { end: value.trim() === 'end' }
  return {}
}

export interface RenderContext {
  signal: AbortSignal
  onProgress: (e: ProgressEvent) => void
}

interface RenderUnit {
  /** 'part' units are numbered shorts, 'full' is the whole trimmed range in one file. */
  kind: 'part' | 'full'
  part: PartPlan
  overlays: PartOverlays
  outFile: string
  label: string
  metaTitle: string
}

export async function renderJob(job: RenderJob, ctx: RenderContext): Promise<RenderResult> {
  const { source, settings, parts } = job
  if (!parts.length) throw new Error('Nothing to render: the plan has no parts.')
  if (!settings.outputDir) throw new Error('Choose an output folder first.')

  const title = safeFileName(source.title)
  const outDir = path.join(settings.outputDir, title)
  fs.mkdirSync(outDir, { recursive: true })
  const work = fs.mkdtempSync(path.join(tempDir(), 'job-'))

  const encoder = settings.hardwareEncode ? await detectHardwareEncoder() : null
  const fps = targetFps(settings, source)
  const width = padWidth(parts.length)

  const units: RenderUnit[] = parts.map((part, i) => ({
    kind: 'part',
    part,
    overlays: job.overlays[i] ?? {},
    outFile: path.join(outDir, `${title} - Part ${String(part.index).padStart(width, '0')}.mp4`),
    label: `part ${part.index} of ${parts.length}`,
    metaTitle: `${source.title} - ${renderTemplate(settings.badgeTemplate || 'Part {n}', part.index, parts.length)}`
  }))
  if (settings.saveFullVideo && job.full) {
    units.push({
      kind: 'full',
      part: job.full.part,
      overlays: job.full.overlays,
      outFile: path.join(outDir, `${title} - Full.mp4`),
      label: 'full-length video',
      metaTitle: source.title
    })
  }

  const files: string[] = []
  let fullFile: string | undefined
  let originalFile: string | undefined
  let cancelled = false
  const total = units.length

  try {
    for (let i = 0; i < units.length; i++) {
      const unit = units[i]
      const { part } = unit
      const overlays = materialiseOverlays(unit.overlays, work, unit.kind === 'full' ? 'full' : `p${part.index}`)
      const progress = (partPercent: number, message: string, extra: { fps?: number; speed?: string } = {}): void =>
        ctx.onProgress({
          kind: 'render',
          partIndex: i + 1,
          totalParts: total,
          partPercent,
          overallPercent: ((i + partPercent / 100) / total) * 100,
          message,
          ...extra
        })

      const attempt = async (enc: string | null): Promise<void> => {
        const graph = buildGraph({
          settings,
          srcW: source.displayWidth,
          srcH: source.displayHeight,
          storedW: source.width,
          storedH: source.height,
          videoStreamIndex: source.videoStreamIndex,
          audioStreamIndex: source.hasAudio ? source.audioStreamIndex : undefined,
          fps,
          partDuration: part.duration,
          overlays
        })
        const args = [
          '-hide_banner',
          '-nostats',
          '-loglevel',
          'error',
          '-y',
          ...baseInputArgs(source, part),
          ...graph.inputArgs,
          '-filter_complex',
          graph.filterComplex,
          '-map',
          graph.videoLabel,
          ...(graph.audioLabel ? ['-map', graph.audioLabel] : []),
          ...videoEncoderArgs(enc, settings.quality),
          '-pix_fmt',
          'yuv420p',
          ...(fps ? [] : ['-fps_mode', 'cfr']),
          ...(graph.audioLabel ? AUDIO_ARGS : ['-an']),
          '-movflags',
          '+faststart',
          '-metadata',
          `title=${unit.metaTitle}`,
          '-metadata',
          'comment=Made with MovieToShort',
          '-progress',
          'pipe:1',
          unit.outFile
        ]

        let lastEmit = 0
        let fpsNow: number | undefined
        let speed: string | undefined
        const res = await run(ffmpegPath(), args, {
          signal: ctx.signal,
          onStdoutLine: (line) => {
            const p = parseProgressLine(line)
            if (p.fps !== undefined) fpsNow = p.fps
            if (p.speed !== undefined) speed = p.speed
            if (p.outTimeSec === undefined) return
            const now = Date.now()
            if (now - lastEmit < 200) return
            lastEmit = now
            progress(Math.min(99, (p.outTimeSec / part.duration) * 100), `Rendering ${unit.label}`, { fps: fpsNow, speed })
          }
        })
        if (res.code !== 0) throw new ProcessError('ffmpeg', res.code, res.stderr)
      }

      try {
        await attempt(encoder)
      } catch (err) {
        if (err instanceof CancelledError) throw err
        if (encoder) {
          // Hardware encoders fail in surprising ways (driver limits, odd sizes). Fall back once.
          progress(0, `${encoder} failed, retrying ${unit.label} with software encoder`)
          await attempt(null)
        } else throw err
      }
      if (unit.kind === 'full') fullFile = unit.outFile
      else files.push(unit.outFile)
      progress(100, `Finished ${unit.label}`)
    }

    if (settings.keepOriginal && source.origin === 'link') {
      ctx.onProgress({
        kind: 'render',
        partIndex: total,
        totalParts: total,
        partPercent: 100,
        overallPercent: 100,
        message: 'Copying original download…'
      })
      const ext = path.extname(source.path) || '.mp4'
      originalFile = path.join(outDir, `${title} - Original${ext}`)
      fs.copyFileSync(source.path, originalFile)
    }
  } catch (err) {
    if (err instanceof CancelledError) cancelled = true
    else throw err
  } finally {
    fs.rmSync(work, { recursive: true, force: true })
  }

  if (!cancelled) writeSidecars(outDir, title, job, files, fullFile, originalFile)
  return { outputDir: outDir, files, fullFile, originalFile, cancelled }
}

/** manifest.json for tooling and captions.txt with copy-paste titles and hashtags for each part. */
function writeSidecars(
  outDir: string,
  title: string,
  job: RenderJob,
  files: string[],
  fullFile?: string,
  originalFile?: string
): void {
  const { parts, settings, source } = job
  const manifest = {
    title: source.title,
    source: source.origin === 'link' ? source.url : source.path,
    site: source.site,
    createdAt: new Date().toISOString(),
    settings,
    parts: parts.map((p, i) => ({ ...p, file: path.basename(files[i] ?? '') })),
    full: fullFile ? { ...job.full?.part, file: path.basename(fullFile) } : undefined,
    original: originalFile ? path.basename(originalFile) : undefined
  }
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2))

  const lines: string[] = []
  lines.push(`${source.title}`)
  lines.push(`${parts.length} parts · generated by MovieToShort`)
  lines.push('')
  for (const p of parts) {
    const label = renderTemplate('Part {n}/{total}', p.index, parts.length)
    lines.push(`--- ${label} · ${formatTime(p.start, true)} → ${formatTime(p.end, true)} (${formatTime(p.duration)})`)
    lines.push(`${source.title} | ${label} #shorts #reels #${safeFileName(source.title).replace(/[^a-z0-9]/gi, '').slice(0, 30).toLowerCase() || 'video'}`)
    if (p.index < parts.length) lines.push(`Part ${p.index + 1} is on the channel. Follow so you do not miss it.`)
    lines.push('')
  }
  fs.writeFileSync(path.join(outDir, 'captions.txt'), lines.join('\n'))
}

export async function renderPreview(req: PreviewRequest, signal: AbortSignal): Promise<string> {
  const { source, settings, part } = req
  const work = fs.mkdtempSync(path.join(tempDir(), 'preview-'))
  try {
    const overlays = materialiseOverlays(req.overlays, work, 'preview')
    const offset = Math.min(Math.max(0, req.offsetSec), Math.max(0, part.duration - 0.05))
    const graph = buildGraph({
      settings,
      srcW: source.displayWidth,
      srcH: source.displayHeight,
      storedW: source.width,
      storedH: source.height,
      videoStreamIndex: source.videoStreamIndex,
      audioStreamIndex: undefined,
      fps: null,
      partDuration: part.duration,
      overlays,
      previewOffset: offset
    })
    const outFile = path.join(work, 'frame.jpg')
    const args = [
      '-hide_banner',
      '-nostats',
      '-loglevel',
      'error',
      '-y',
      '-ss',
      formatFfmpegTime(part.start + offset),
      '-t',
      '1',
      '-i',
      source.path,
      ...graph.inputArgs,
      '-filter_complex',
      graph.filterComplex,
      '-map',
      graph.videoLabel,
      '-frames:v',
      '1',
      '-q:v',
      '3',
      '-f',
      'image2',
      '-update',
      '1',
      outFile
    ]
    const res = await run(ffmpegPath(), args, { signal })
    if (res.code !== 0) throw new ProcessError('ffmpeg', res.code, res.stderr)
    const buf = fs.readFileSync(outFile)
    return `data:image/jpeg;base64,${buf.toString('base64')}`
  } finally {
    fs.rmSync(work, { recursive: true, force: true })
  }
}
