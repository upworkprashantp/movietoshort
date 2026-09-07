import type { PartPlan, Silence } from './types'
import { clamp } from './time'

export interface PlanOptions {
  durationSec: number
  skipStartSec: number
  skipEndSec: number
  targetLengthSec: number
  /** Hard cap per part (platform limit). */
  maxLengthSec: number
  smartCut: boolean
  silences?: Silence[]
  /** How far (seconds) a cut may move from the ideal point to land on a silence. */
  searchWindowSec: number
}

/** Smallest part we are willing to produce (as a fraction of the ideal length). */
const MIN_PART_FRACTION = 0.6

/**
 * Split a time range into parts of (nearly) equal length.
 *
 * Instead of greedily cutting every `target` seconds (which produces a stubby last part),
 * we compute how many parts are needed, spread them evenly, and then optionally move every
 * boundary to the best nearby silence so no part ends mid-sentence.
 */
export function planParts(o: PlanOptions): PartPlan[] {
  const duration = Math.max(0, o.durationSec)
  const start = clamp(o.skipStartSec, 0, duration)
  const end = clamp(duration - Math.max(0, o.skipEndSec), 0, duration)
  const range = end - start
  if (range < 1) return []

  const maxLen = Math.max(5, o.maxLengthSec)
  const target = clamp(o.targetLengthSec, 5, maxLen)
  const count = Math.max(1, Math.ceil(range / target - 1e-9))
  const ideal = range / count
  const minPart = ideal * MIN_PART_FRACTION

  const bounds: number[] = [start]
  const snapped: boolean[] = [false]
  for (let i = 1; i < count; i++) {
    const idealPoint = start + ideal * i
    const prev = bounds[i - 1]
    const nextIdeal = i + 1 < count ? start + ideal * (i + 1) : end
    // Hard limits: this part may not exceed maxLen, and whatever remains after this cut must
    // still fit into the remaining parts. Together they guarantee no part ever exceeds maxLen,
    // however the cuts before or after this one move.
    const hardLo = end - (count - i) * maxLen
    const hardHi = prev + maxLen
    let point = clamp(idealPoint, hardLo, hardHi)
    let didSnap = false
    if (o.smartCut && o.silences && o.silences.length) {
      const lo = Math.max(idealPoint - o.searchWindowSec, prev + minPart, hardLo)
      const hi = Math.min(idealPoint + o.searchWindowSec, nextIdeal - minPart, hardHi)
      const best = bestSilence(o.silences, idealPoint, lo, hi)
      if (best !== null) {
        point = best
        didSnap = true
      }
    }
    bounds.push(point)
    snapped.push(didSnap)
  }
  bounds.push(end)
  snapped.push(false)

  const parts: PartPlan[] = []
  for (let i = 0; i < count; i++) {
    const s = bounds[i]
    const e = bounds[i + 1]
    parts.push({
      index: i + 1,
      start: round3(s),
      end: round3(e),
      duration: round3(e - s),
      snappedStart: snapped[i],
      snappedEnd: snapped[i + 1]
    })
  }
  return parts
}

/**
 * Pick the best silence midpoint inside [lo, hi].
 * Longer silences (scene breaks) are preferred, closeness to the ideal point is the tie-breaker.
 */
function bestSilence(silences: Silence[], ideal: number, lo: number, hi: number): number | null {
  if (hi < lo) return null
  let best: number | null = null
  let bestScore = -Infinity
  for (const s of silences) {
    const mid = (s.start + s.end) / 2
    if (mid < lo || mid > hi) continue
    const dur = Math.max(0, s.end - s.start)
    const dist = Math.abs(mid - ideal)
    const score = Math.min(dur, 3) * 4 - dist
    if (score > bestScore) {
      bestScore = score
      best = mid
    }
  }
  return best
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

/** Parse ffmpeg's silencedetect stderr output into ranges. */
export function parseSilenceOutput(text: string): Silence[] {
  const out: Silence[] = []
  let pendingStart: number | null = null
  const re = /silence_(start|end):\s*(-?\d+(?:\.\d+)?)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const val = Number(m[2])
    if (m[1] === 'start') pendingStart = val
    else if (pendingStart !== null) {
      out.push({ start: pendingStart, end: val })
      pendingStart = null
    }
  }
  return out
}

/** Zero-padded label width for N parts ("01".."99" or "001".."999"). */
export function padWidth(total: number): number {
  return Math.max(2, String(total).length)
}

/** Render "Part {n}" style templates. */
export function renderTemplate(template: string, n: number, total: number): string {
  return template.replace(/\{n\}/gi, String(n)).replace(/\{total\}/gi, String(total)).trim()
}

/** Make a string safe to use as a file/folder name on Windows and macOS. */
export function safeFileName(name: string, max = 80): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\p{Cc}/gu, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.]+|[\s.]+$/g, '')
  const trimmed = cleaned.slice(0, max).trim()
  return trimmed || 'video'
}
