import type { LabelSize, LabelStyle, PartOverlays, PartPlan, Settings, BadgePosition } from '@shared/types'
import { renderTemplate } from '@shared/plan'

/** All overlays are drawn at the output resolution (1080x1920) so nothing is resampled by ffmpeg. */
export const FONT_STACK = '"Inter", "Segoe UI", "SF Pro Display", "Helvetica Neue", Arial, sans-serif'

export interface LabelOptions {
  fontSize: number
  style: LabelStyle
  /** Pill background / accent colour. */
  accent: string
  textColor?: string
  weight?: number
  maxWidth?: number
  align?: 'left' | 'center'
  opacity?: number
  /** Optional emoji/arrow suffix drawn in a system font. */
  suffix?: string
}

export interface LabelImage {
  dataUrl: string
  width: number
  height: number
}

export const BADGE_FONT_SIZE: Record<LabelSize, number> = { small: 44, medium: 58, large: 74 }

let fontReady: Promise<void> | null = null
/** Make sure Inter is loaded before drawing, otherwise the first badge would use a fallback font. */
export function ensureFonts(): Promise<void> {
  if (!fontReady) {
    fontReady = (async () => {
      try {
        await Promise.all([document.fonts.load('800 58px "Inter"'), document.fonts.load('700 58px "Inter"')])
      } catch {
        /* fallback fonts are fine */
      }
    })()
  }
  return fontReady
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (ctx.measureText(candidate).width <= maxWidth || !current) current = candidate
    else {
      lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines.length ? lines : ['']
}

/** Draw a text label as a transparent PNG. */
export function makeLabel(text: string, o: LabelOptions): LabelImage {
  const weight = o.weight ?? 800
  const font = `${weight} ${o.fontSize}px ${FONT_STACK}`
  const measure = document.createElement('canvas').getContext('2d')!
  measure.font = font
  const maxWidth = o.maxWidth ?? 960
  const lines = wrapLines(measure, text, maxWidth)
  const lineHeight = Math.round(o.fontSize * 1.18)
  const textWidth = Math.max(...lines.map((l) => measure.measureText(l).width))

  const padX = o.style === 'pill' ? Math.round(o.fontSize * 0.62) : Math.round(o.fontSize * 0.3)
  const padY = o.style === 'pill' ? Math.round(o.fontSize * 0.36) : Math.round(o.fontSize * 0.3)
  const width = Math.ceil(textWidth + padX * 2)
  const height = Math.ceil(lines.length * lineHeight + padY * 2)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.globalAlpha = o.opacity ?? 1
  ctx.font = font
  ctx.textBaseline = 'middle'
  ctx.textAlign = o.align === 'left' ? 'left' : 'center'

  if (o.style === 'pill') {
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.35)'
    ctx.shadowBlur = o.fontSize * 0.35
    ctx.shadowOffsetY = o.fontSize * 0.08
    ctx.fillStyle = o.accent
    const r = Math.min(height / 2, o.fontSize * 0.55)
    ctx.beginPath()
    ctx.roundRect(o.fontSize * 0.08, o.fontSize * 0.08, width - o.fontSize * 0.16, height - o.fontSize * 0.2, r)
    ctx.fill()
    ctx.restore()
  }

  const x = o.align === 'left' ? padX : width / 2
  lines.forEach((line, i) => {
    const y = padY + lineHeight * i + lineHeight / 2
    if (o.style === 'outline') {
      ctx.lineJoin = 'round'
      ctx.lineWidth = Math.max(4, o.fontSize * 0.16)
      ctx.strokeStyle = 'rgba(0,0,0,0.9)'
      ctx.strokeText(line, x, y)
    } else if (o.style === 'shadow') {
      ctx.shadowColor = 'rgba(0,0,0,0.8)'
      ctx.shadowBlur = o.fontSize * 0.4
      ctx.shadowOffsetY = o.fontSize * 0.06
    }
    ctx.fillStyle = o.textColor ?? '#ffffff'
    ctx.fillText(line, x, y)
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
  })

  return { dataUrl: canvas.toDataURL('image/png'), width, height }
}

/** Pick a text colour that reads on the accent (black on light pills, white on dark ones). */
export function contrastColor(hex: string): string {
  const c = hex.replace('#', '')
  if (c.length < 6) return '#ffffff'
  const r = parseInt(c.slice(0, 2), 16)
  const g = parseInt(c.slice(2, 4), 16)
  const b = parseInt(c.slice(4, 6), 16)
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  return lum > 0.62 ? '#111111' : '#ffffff'
}

interface Stack {
  [pos: string]: number
}

/**
 * Build every overlay for one part. Items sharing a position are stacked so they never overlap:
 * top positions grow downward, bottom positions grow upward.
 */
export function buildPartOverlays(settings: Settings, part: PartPlan, total: number, title: string): PartOverlays {
  const out: PartOverlays = {}
  const stack: Stack = {}
  const place = (pos: BadgePosition, img: LabelImage): number => {
    const used = stack[pos] ?? 0
    const gap = 18
    const offset = pos.startsWith('top') ? used : -used
    stack[pos] = used + img.height + gap
    return offset
  }

  if (settings.badgeEnabled) {
    const text = renderTemplate(settings.badgeTemplate || 'Part {n}', part.index, total) || `Part ${part.index}`
    const img = makeLabel(text, {
      fontSize: BADGE_FONT_SIZE[settings.badgeSize],
      style: settings.badgeStyle,
      accent: settings.badgeAccent,
      textColor: settings.badgeStyle === 'pill' ? contrastColor(settings.badgeAccent) : '#ffffff'
    })
    out.badge = { dataUrl: img.dataUrl, position: settings.badgePosition, offsetY: place(settings.badgePosition, img) }
  }

  if (settings.titleEnabled && (settings.titleText || title).trim()) {
    const img = makeLabel((settings.titleText || title).trim(), {
      fontSize: 52,
      style: 'outline',
      accent: settings.badgeAccent,
      maxWidth: 900
    })
    out.title = { dataUrl: img.dataUrl, position: 'top-center', offsetY: place('top-center', img) }
  }

  if (settings.watermarkEnabled && settings.watermarkText.trim()) {
    const img = makeLabel(settings.watermarkText.trim(), {
      fontSize: 34,
      style: 'shadow',
      accent: settings.badgeAccent,
      weight: 700,
      opacity: 0.9
    })
    out.watermark = { dataUrl: img.dataUrl, position: 'bottom-center', offsetY: place('bottom-center', img) }
  }

  if (settings.teaserEnabled && part.index < total && part.duration > settings.teaserSeconds + 2) {
    const img = makeLabel(`Part ${part.index + 1} ▶`, {
      fontSize: 50,
      style: 'pill',
      accent: '#ffffff',
      textColor: '#111111'
    })
    const from = Math.max(0, part.duration - settings.teaserSeconds)
    out.teaser = {
      dataUrl: img.dataUrl,
      position: 'bottom-center',
      offsetY: place('bottom-center', img),
      from: Math.round(from * 100) / 100,
      to: Math.ceil(part.duration + 1),
      fadeIn: 0.35
    }
  }

  return out
}
