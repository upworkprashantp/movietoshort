import type { SizeMode } from './types'

/** The canonical short-form frame: what a landscape source gets converted to. */
export const VERTICAL_W = 1080
export const VERTICAL_H = 1920

/** Never render taller than this, even if the source is 4K vertical. */
const MAX_H = 1920
/** Never render wider than this in "keep source" mode (square and 4:5 sources). */
const MAX_W = 1440

export interface OutputSize {
  width: number
  height: number
  /** Multiplier for overlay text and safe zones, 1 at 1080 wide. */
  uiScale: number
  /** True when the source frame is kept as-is instead of being converted to 9:16. */
  keptSource: boolean
}

function even(n: number): number {
  return Math.max(2, Math.round(n / 2) * 2)
}

/**
 * Decide the output frame size.
 *
 * A video that is already portrait or square (a Reel, a TikTok, a Short) is kept at its own
 * size: re-framing it into 1080x1920 would only add bars or crop away picture. Landscape
 * sources are converted to the vertical frame.
 */
export function outputSize(displayW: number, displayH: number, mode: SizeMode): OutputSize {
  const w0 = Math.max(2, displayW)
  const h0 = Math.max(2, displayH)
  const keep = mode === 'source' || (mode === 'auto' && h0 >= w0)
  if (!keep) return { width: VERTICAL_W, height: VERTICAL_H, uiScale: 1, keptSource: false }

  const shrink = Math.min(1, MAX_H / h0, MAX_W / w0)
  const width = even(w0 * shrink)
  const height = even(h0 * shrink)
  return { width, height, uiScale: width / VERTICAL_W, keptSource: true }
}

export interface SafeZones {
  side: number
  top: number
  bottom: number
  rightColumn: number
}

/** Base safe zones (px at 1080x1920) that stay clear of the Shorts / Reels / TikTok UI. */
const BASE_SAFE: SafeZones = { side: 64, top: 190, bottom: 440, rightColumn: 200 }

/**
 * Safe zones for a given output frame. Scaled with the frame width, then capped so that on a
 * short frame (4:5, square) the reserved bands never eat most of the picture.
 */
export function safeZones(size: OutputSize): SafeZones {
  const s = size.uiScale
  return {
    side: Math.round(BASE_SAFE.side * s),
    top: Math.round(Math.min(BASE_SAFE.top * s, size.height * 0.12)),
    bottom: Math.round(Math.min(BASE_SAFE.bottom * s, size.height * 0.25)),
    rightColumn: Math.round(BASE_SAFE.rightColumn * s)
  }
}

/** True when the source frame and the output frame have the same shape (no re-framing needed). */
export function sameAspect(srcW: number, srcH: number, outW: number, outH: number): boolean {
  return Math.abs(srcW / srcH - outW / outH) < 0.01
}
