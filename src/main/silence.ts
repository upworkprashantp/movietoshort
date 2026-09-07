import { ffmpegPath } from './binaries'
import { run, CancelledError, ProcessError } from './proc'
import type { Silence } from '@shared/types'

export interface SilenceOptions {
  /** ffprobe stream index of the audio stream to analyse. */
  audioStreamIndex: number
  durationSec: number
  /** Loudness threshold in dB below which audio counts as silence. */
  noiseDb?: number
  /** Minimum silence length in seconds. */
  minDurationSec?: number
  signal?: AbortSignal
  onProgress?: (percent: number) => void
}

/**
 * Scan the whole file once with ffmpeg's silencedetect filter.
 * Only audio is decoded, so a two hour movie takes well under a minute.
 */
export async function detectSilences(file: string, o: SilenceOptions): Promise<Silence[]> {
  const noise = o.noiseDb ?? -30
  const minDur = o.minDurationSec ?? 0.35
  const silences: Silence[] = []
  let pendingStart: number | null = null

  const args = [
    '-hide_banner',
    '-nostats',
    '-loglevel',
    'info',
    '-i',
    file,
    '-map',
    `0:${o.audioStreamIndex}`,
    '-vn',
    '-sn',
    '-dn',
    '-af',
    `silencedetect=noise=${noise}dB:d=${minDur}`,
    '-f',
    'null',
    '-progress',
    'pipe:1',
    '-'
  ]

  const res = await run(ffmpegPath(), args, {
    signal: o.signal,
    onStderrLine: (line) => {
      const m = /silence_(start|end):\s*(-?\d+(?:\.\d+)?)/.exec(line)
      if (!m) return
      const val = Number(m[2])
      if (m[1] === 'start') pendingStart = val
      else if (pendingStart !== null) {
        silences.push({ start: pendingStart, end: val })
        pendingStart = null
      }
    },
    onStdoutLine: (line) => {
      const m = /^out_time_(?:us|ms)=(\d+)/.exec(line)
      if (m && o.onProgress && o.durationSec > 0) {
        const sec = Number(m[1]) / 1_000_000
        o.onProgress(Math.min(99, Math.round((sec / o.durationSec) * 100)))
      }
    }
  })
  if (o.signal?.aborted) throw new CancelledError()
  if (res.code !== 0) throw new ProcessError('ffmpeg', res.code, res.stderr)
  o.onProgress?.(100)
  return silences
}
