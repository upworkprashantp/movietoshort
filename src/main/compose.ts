import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ffmpegPath, tempDir } from './binaries'
import { run, CancelledError, ProcessError } from './proc'
import { buildGraph } from './filtergraph'
import { probeFile } from './probe'
import { renderJob, type RenderContext } from './render'
import type {
  CombineJob,
  HighlightsJob,
  PartOverlays,
  PartPlan,
  RenderResult,
  SavedCopies,
  Settings,
  SourceInfo
} from '@shared/types'
import { outputSize } from '@shared/output'
import { combineTimeline, highlightsLength } from '@shared/highlights'
import { formatFfmpegTime, formatTime } from '@shared/time'
import { padWidth, safeFileName } from '@shared/plan'

/**
 * Highlights and Combine share one pipeline:
 *
 *   1. cut   every piece is fitted to one frame and one frame rate, frame-exact in length,
 *            and stored as H.264 + PCM in .mov (PCM has no encoder delay, so joins stay in sync)
 *   2. join  the pieces are concatenated without re-encoding
 *   3. brand the joined file goes through the normal single-clip render: title, watermark,
 *            call to action, progress bar, loudness and the final encode
 */

/** Share of the progress bar spent cutting; the rest is joining and the final encode. */
const CUT_SHARE = 0.7

export interface Piece {
  source: SourceInfo
  start: number
  /** Frame-exact length. */
  duration: number
}

export interface PieceOptions {
  settings: Settings
  outSize: { width: number; height: number }
  fps: number
  /** Keep sound (combine) or drop it (highlights). */
  audio: boolean
  signal: AbortSignal
}

/** Cut one piece and fit it to the shared frame. Silence is generated for clips without sound. */
export async function renderPiece(piece: Piece, outFile: string, o: PieceOptions): Promise<void> {
  const { source } = piece
  const graph = buildGraph({
    settings: { ...o.settings, progressBarEnabled: false, normalizeAudio: false },
    srcW: source.displayWidth,
    srcH: source.displayHeight,
    storedW: source.width,
    storedH: source.height,
    videoStreamIndex: source.videoStreamIndex,
    audioStreamIndex: undefined,
    fps: o.fps,
    partDuration: piece.duration,
    overlays: [],
    outSize: o.outSize
  })

  // tpad repeats the last frame if the source runs out. Trim by frame count, not by time: after a
  // re-framing layout the timestamps carry rounding, and a time-based trim then keeps one frame
  // too many. Timestamps are rebuilt from the frame number so every piece is perfectly regular.
  const frames = Math.round(piece.duration * o.fps)
  const chains = [
    graph.filterComplex,
    `[vout]tpad=stop_mode=clone:stop_duration=2,trim=end_frame=${frames},setpts=N/(${o.fps}*TB)[vpiece]`
  ]
  if (o.audio) {
    const fmt = 'aformat=sample_fmts=s16:channel_layouts=stereo'
    const samples = Math.round(piece.duration * 48000)
    if (source.hasAudio && source.audioStreamIndex !== undefined) {
      const loud = o.settings.normalizeAudio ? ',loudnorm=I=-14:TP=-1.5:LRA=11' : ''
      // loudnorm can leave a gap in the timestamps at the start. Joining pieces would close that
      // gap and slide later clips' sound ahead of their picture, so async resampling fills it with
      // silence instead. The piece is then cut by sample count, exactly as long as its video.
      chains.push(
        `[0:${source.audioStreamIndex}]asetpts=PTS-STARTPTS${loud},aresample=48000:async=1:first_pts=0,${fmt},apad,atrim=end_sample=${samples},asetpts=N/SR/TB[apiece]`
      )
    } else {
      chains.push(`anullsrc=r=48000:cl=stereo,${fmt},atrim=end_sample=${samples},asetpts=N/SR/TB[apiece]`)
    }
  }

  const args = [
    '-hide_banner',
    '-nostats',
    '-loglevel',
    'error',
    '-y',
    '-ss',
    formatFfmpegTime(piece.start),
    '-t',
    formatFfmpegTime(piece.duration + 1),
    '-i',
    source.path,
    '-filter_complex',
    chains.join(';'),
    '-map',
    '[vpiece]',
    ...(o.audio ? ['-map', '[apiece]'] : []),
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '16',
    '-bf',
    '0',
    '-g',
    String(o.fps * 2),
    '-pix_fmt',
    'yuv420p',
    '-r',
    String(o.fps),
    ...(o.audio ? ['-c:a', 'pcm_s16le'] : ['-an']),
    '-f',
    'mov',
    outFile
  ]
  const res = await run(ffmpegPath(), args, { signal: o.signal })
  if (res.code !== 0) throw new ProcessError('ffmpeg', res.code, res.stderr)
}

/** Join pieces end to end without re-encoding. */
export async function joinPieces(files: string[], outFile: string, workDir: string, signal: AbortSignal): Promise<void> {
  const list = path.join(workDir, 'pieces.txt')
  // Bare file names: the concat demuxer resolves them next to the list, which sidesteps path quoting.
  fs.writeFileSync(list, files.map((f) => `file '${path.basename(f)}'`).join('\n') + '\n')
  const res = await run(
    ffmpegPath(),
    ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-f', 'mov', outFile],
    { signal, cwd: workDir }
  )
  if (res.code !== 0) throw new ProcessError('ffmpeg', res.code, res.stderr)
}

/** Run `fn` over `items` with at most `limit` in flight. The first failure stops the rest. */
async function eachLimit<T>(
  items: T[],
  limit: number,
  signal: AbortSignal,
  fn: (item: T, index: number, signal: AbortSignal) => Promise<void>
): Promise<void> {
  const inner = new AbortController()
  const onAbort = (): void => inner.abort()
  signal.addEventListener('abort', onAbort, { once: true })
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      if (inner.signal.aborted) throw new CancelledError()
      const i = next++
      try {
        await fn(items[i], i, inner.signal)
      } catch (err) {
        inner.abort()
        throw err
      }
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker))
  } finally {
    signal.removeEventListener('abort', onAbort)
  }
  if (signal.aborted) throw new CancelledError()
}

function workers(perPiece: number): number {
  return Math.max(1, Math.min(perPiece, Math.floor(os.cpus().length / 4)))
}

interface Compose {
  settings: Settings
  pieces: Piece[]
  audio: boolean
  frame: { width: number; height: number }
  fps: number
  total: number
  title: string
  outDirName: string
  fileName: string
  overlays: PartOverlays
  noun: string
  concurrency: number
  manifestName: string
  manifest: Record<string, unknown>
  notes?: string
}

async function cutJoinBrand(o: Compose, ctx: RenderContext): Promise<RenderResult> {
  if (!o.settings.outputDir) throw new Error('Choose an output folder first.')
  if (!o.pieces.length) throw new Error('Nothing to render.')
  const work = fs.mkdtempSync(path.join(ctx.tempRoot ?? tempDir(), 'compose-'))
  const n = o.pieces.length
  let done = 0
  const cutProgress = (message: string): void =>
    ctx.onProgress({
      kind: 'render',
      partIndex: Math.min(done + 1, n),
      totalParts: n,
      partPercent: (done / n) * 100,
      overallPercent: (done / n) * CUT_SHARE * 100,
      message
    })

  try {
    cutProgress(`Cutting ${o.noun}s`)
    const files = o.pieces.map((_, i) => path.join(work, `piece-${String(i).padStart(5, '0')}.mov`))
    await eachLimit(o.pieces, o.concurrency, ctx.signal, async (piece, i, signal) => {
      await renderPiece(piece, files[i], { settings: o.settings, outSize: o.frame, fps: o.fps, audio: o.audio, signal })
      done++
      cutProgress(`Cut ${done} of ${n} ${o.noun}s`)
    })

    ctx.onProgress({ kind: 'render', partIndex: n, totalParts: n, partPercent: 100, overallPercent: CUT_SHARE * 100, message: 'Joining…' })
    const joined = path.join(work, 'joined.mov')
    await joinPieces(files, joined, work, ctx.signal)
    const joinedSource = await probeFile(joined, o.title, 'local', undefined, { thumbnail: false })

    const part: PartPlan = { index: 1, start: 0, end: o.total, duration: o.total, snappedStart: false, snappedEnd: false }
    const finalSettings: Settings = {
      ...o.settings,
      sizeMode: 'source', // the joined file already has the final frame
      outputMode: 'single',
      fpsMode: 'source',
      saveFullVideo: false,
      keepOriginal: false,
      normalizeAudio: false // each piece was already normalised on its own
    }
    const result = await renderJob(
      {
        source: joinedSource,
        settings: finalSettings,
        parts: [part],
        overlays: [o.overlays],
        outDirName: o.outDirName,
        fileName: o.fileName,
        sidecars: false
      },
      {
        signal: ctx.signal,
        tempRoot: work,
        onProgress: (e) => {
          if (e.kind !== 'render') return
          ctx.onProgress({
            ...e,
            partIndex: n,
            totalParts: n,
            overallPercent: CUT_SHARE * 100 + e.overallPercent * (1 - CUT_SHARE),
            message: e.partPercent >= 100 ? 'Finished' : 'Adding your branding and encoding the final video'
          })
        }
      }
    )
    if (!result.cancelled) {
      fs.writeFileSync(path.join(result.outputDir, o.manifestName), JSON.stringify(o.manifest, null, 2))
      if (o.notes) fs.writeFileSync(path.join(result.outputDir, `${o.fileName} - sources.txt`), o.notes)
    }
    return result
  } catch (err) {
    if (err instanceof CancelledError) {
      return { outputDir: path.join(o.settings.outputDir, safeFileName(o.outDirName)), files: [], cancelled: true }
    }
    throw err
  } finally {
    fs.rmSync(work, { recursive: true, force: true })
  }
}

/** One long video in, one silent recap out. */
export async function renderHighlights(job: HighlightsJob, ctx: RenderContext): Promise<RenderResult> {
  const { source, settings, segments, fps } = job
  if (!segments.length) throw new Error('Nothing to cut: the recap has no snippets. Check the skip times.')
  const frame = outputSize(source.displayWidth, source.displayHeight, settings.sizeMode)
  const title = safeFileName(source.title)
  const total = highlightsLength(segments)
  return cutJoinBrand(
    {
      settings,
      pieces: segments.map((s) => ({ source, start: s.start, duration: s.duration })),
      audio: false,
      frame,
      fps,
      total,
      title: source.title,
      outDirName: source.title,
      fileName: `${title} - Highlights`,
      overlays: job.overlays,
      noun: 'snippet',
      concurrency: workers(3),
      manifestName: `${title} - Highlights.json`,
      manifest: {
        kind: 'highlights',
        title: source.title,
        source: source.origin === 'link' ? source.url : source.path,
        createdAt: new Date().toISOString(),
        lengthSec: total,
        fps,
        frame: { width: frame.width, height: frame.height },
        snippets: segments
      }
    },
    ctx
  )
}

/** Many clips in, one video out, in the order given. */
export async function renderCombine(job: CombineJob, ctx: RenderContext): Promise<RenderResult> {
  const { clips, settings, fps, frame } = job
  const { items, total } = combineTimeline(
    clips.map((c) => c.durationSec),
    fps
  )
  if (!items.length) throw new Error('Add at least one clip to combine.')
  const name = safeFileName(settings.combineName || 'Compilation')
  const credits = items.map((it, n) => {
    const c = clips[it.index]
    const where = c.origin === 'link' ? `${c.site ?? 'Link'} · ${c.url ?? ''}` : path.basename(c.path)
    return `${n + 1}. ${c.title} (${formatTime(it.duration)}) · ${where}`
  })
  return cutJoinBrand(
    {
      settings,
      pieces: items.map((it) => ({ source: clips[it.index], start: 0, duration: it.duration })),
      audio: true,
      frame,
      fps,
      total,
      title: name,
      outDirName: name,
      fileName: name,
      overlays: job.overlays,
      noun: 'clip',
      concurrency: workers(2),
      manifestName: `${name}.json`,
      manifest: {
        kind: 'combine',
        name,
        createdAt: new Date().toISOString(),
        lengthSec: total,
        fps,
        frame,
        clips: items.map((it) => {
          const c = clips[it.index]
          return { at: it.at, duration: it.duration, title: c.title, site: c.site, url: c.url, file: c.origin === 'local' ? c.path : undefined }
        })
      },
      notes: ['Clips in this video, in order. Credit the creators when you post.', '', ...credits, ''].join('\n')
    },
    ctx
  )
}

/** Copy downloaded or picked clips into one folder, numbered in list order. */
export function saveCopies(items: Array<{ path: string; title: string }>, outputDir: string, folder: string): SavedCopies {
  if (!outputDir) throw new Error('Choose an output folder first.')
  if (!items.length) throw new Error('There are no ready clips to save.')
  const dir = path.join(outputDir, safeFileName(folder || 'Downloads'))
  fs.mkdirSync(dir, { recursive: true })
  const width = padWidth(items.length)
  const files = items.map((it, i) => {
    const ext = path.extname(it.path) || '.mp4'
    const dest = path.join(dir, `${String(i + 1).padStart(width, '0')} - ${safeFileName(it.title, 70)}${ext}`)
    fs.copyFileSync(it.path, dest)
    return dest
  })
  return { outputDir: dir, files }
}
