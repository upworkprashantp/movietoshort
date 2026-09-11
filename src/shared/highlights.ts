import type { FpsMode, Segment, TimelineItem } from './types'
import { clamp } from './time'

/**
 * Frame rates used for cut-and-join work. Each one divides 48 000, so a whole number of frames is
 * always a whole number of audio samples. That keeps sound and picture locked together no matter
 * how many pieces are joined.
 */
const JOIN_RATES = [24, 25, 30, 60]

/** Pick the frame rate for snippets and joined clips. */
export function segmentFps(sourceFps: number, mode: FpsMode): number {
  if (mode === '30') return 30
  if (mode === '60') return 60
  const f = Number.isFinite(sourceFps) && sourceFps > 0 ? Math.min(sourceFps, 60) : 30
  let best = 30
  let dist = Infinity
  for (const r of JOIN_RATES) {
    const d = Math.abs(r - f)
    if (d < dist) {
      dist = d
      best = r
    }
  }
  return best
}

/** Snap a length to a whole number of frames. */
export function quantize(sec: number, fps: number, how: 'round' | 'floor' = 'round'): number {
  const frames = how === 'floor' ? Math.floor(sec * fps + 1e-6) : Math.round(sec * fps)
  return Math.max(0, frames) / fps
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6
}

export interface HighlightOptions {
  durationSec: number
  skipStartSec: number
  skipEndSec: number
  /** Length of the finished recap. */
  targetSec: number
  /** Length of each snippet. */
  clipSec: number
  fps: number
}

/**
 * Plan a recap: equal snippets spread evenly from the first usable second to the last, so the
 * recap walks through the whole video in order. A 30 minute video with a 2 minute target and
 * 2.5 second snippets gives 48 snippets, one roughly every 37 seconds.
 *
 * If the usable range is already no longer than the target, the "recap" is simply that range.
 */
export function planHighlights(o: HighlightOptions): Segment[] {
  const fps = o.fps
  const duration = Math.max(0, o.durationSec)
  const start = clamp(o.skipStartSec, 0, duration)
  const end = clamp(duration - Math.max(0, o.skipEndSec), 0, duration)
  const range = end - start
  if (range * fps < 2) return []

  const clip = Math.max(quantize(clamp(o.clipSec, 0.5, 10), fps), 1 / fps)
  const target = Math.max(clip, o.targetSec)

  if (range <= target) {
    const d = quantize(range, fps, 'floor')
    return d > 0 ? [{ index: 1, start: round6(start), duration: d, at: 0 }] : []
  }

  const n = Math.max(1, Math.floor(target / clip + 1e-9))
  // range > target >= n * clip, so the gap between snippet starts is always longer than a snippet.
  const step = n > 1 ? (range - clip) / (n - 1) : 0
  const segments: Segment[] = []
  for (let i = 0; i < n; i++) {
    const s = n > 1 ? start + step * i : start + (range - clip) / 2
    segments.push({ index: i + 1, start: round6(s), duration: clip, at: round6(i * clip) })
  }
  return segments
}

/** Total length of a recap. */
export function highlightsLength(segments: Segment[]): number {
  if (!segments.length) return 0
  const last = segments[segments.length - 1]
  return round6(last.at + last.duration)
}

/**
 * Lay clips end to end. Each length is floored to whole frames so a clip never asks for picture
 * past its own end. Clips shorter than one frame are left out.
 */
export function combineTimeline(durations: number[], fps: number): { items: TimelineItem[]; total: number } {
  const items: TimelineItem[] = []
  let at = 0
  durations.forEach((d, index) => {
    const q = quantize(d, fps, 'floor')
    if (q <= 0) return
    items.push({ index, duration: q, at: round6(at) })
    at += q
  })
  return { items, total: round6(at) }
}
