/** Parse "ss", "mm:ss" or "hh:mm:ss" (decimals allowed) into seconds. Returns NaN when invalid. */
export function parseTime(input: string): number {
  const s = input.trim()
  if (!s) return 0
  const parts = s.split(':').map((p) => p.trim())
  if (parts.length > 3 || parts.some((p) => p === '' || !/^\d+(\.\d+)?$/.test(p))) return NaN
  let total = 0
  for (const p of parts) total = total * 60 + Number(p)
  return total
}

/** Format seconds as m:ss or h:mm:ss. */
export function formatTime(sec: number, withHours = false): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0
  const total = Math.round(sec)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number): string => n.toString().padStart(2, '0')
  if (h > 0 || withHours) return `${h}:${pad(m)}:${pad(s)}`
  return `${m}:${pad(s)}`
}

/** Format seconds as hh:mm:ss.mmm for ffmpeg. */
export function formatFfmpegTime(sec: number): string {
  const ms = Math.max(0, Math.round(sec * 1000))
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  const rem = ms % 1000
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s
    .toString()
    .padStart(2, '0')}.${rem.toString().padStart(3, '0')}`
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}
