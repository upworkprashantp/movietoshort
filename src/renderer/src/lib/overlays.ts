import type { LabelSize, LabelStyle, PartOverlays, PartPlan, Settings, BadgePosition } from '@shared/types'
import { renderTemplate } from '@shared/plan'
import type { OutputSize } from '@shared/output'

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

interface Placed {
  from: number
  to: number
  height: number
}

const GAP = 18

/**
 * Build every overlay for one part.
 *
 * Items sharing a position are stacked so they never overlap: top positions grow downward,
 * bottom positions grow upward. Only items that are on screen at the same time push each
 * other, so a 3-second intro and an end call-to-action can share the same spot.
 */
export function buildPartOverlays(
  settings: Settings,
  part: PartPlan,
  total: number,
  title: string,
  frame: OutputSize = { width: 1080, height: 1920, uiScale: 1, keptSource: false },
  single = false
): PartOverlays {
  const out: PartOverlays = {}
  const stacks: Record<string, Placed[]> = {}
  const k = frame.uiScale
  const px = (n: number): number => Math.max(8, Math.round(n * k))

  const place = (pos: BadgePosition, img: LabelImage, from = 0, to = Number.MAX_SAFE_INTEGER): number => {
    const list = (stacks[pos] ??= [])
    const overlapping = list.filter((o) => from < o.to && to > o.from)
    const used = overlapping.reduce((sum, o) => sum + o.height + GAP * k, 0)
    list.push({ from, to, height: img.height })
    return Math.round(pos.startsWith('top') ? used : -used)
  }

  // A single clip has no part number and no next part to tease.
  if (settings.badgeEnabled && !single) {
    const text = renderTemplate(settings.badgeTemplate || 'Part {n}', part.index, total) || `Part ${part.index}`
    const img = makeLabel(text, {
      fontSize: px(BADGE_FONT_SIZE[settings.badgeSize]),
      style: settings.badgeStyle,
      accent: settings.badgeAccent,
      textColor: settings.badgeStyle === 'pill' ? contrastColor(settings.badgeAccent) : '#ffffff'
    })
    out.badge = { dataUrl: img.dataUrl, position: settings.badgePosition, offsetY: place(settings.badgePosition, img) }
  }

  if (settings.titleEnabled && (settings.titleText || title).trim()) {
    const img = makeLabel((settings.titleText || title).trim(), {
      fontSize: px(52),
      style: 'outline',
      accent: settings.badgeAccent,
      maxWidth: frame.width - px(150)
    })
    out.title = { dataUrl: img.dataUrl, position: 'top-center', offsetY: place('top-center', img) }
  }

  if (settings.watermarkEnabled && settings.watermarkText.trim()) {
    const img = makeLabel(settings.watermarkText.trim(), {
      fontSize: px(34),
      style: 'shadow',
      accent: settings.badgeAccent,
      weight: 700,
      opacity: 0.9
    })
    out.watermark = { dataUrl: img.dataUrl, position: 'bottom-center', offsetY: place('bottom-center', img) }
  }

  // Intro: the title (or your own hook line) slides in over the opening seconds and fades away.
  if (settings.introEnabled && !settings.titleEnabled) {
    const text = (settings.introText || title).trim()
    const shown = Math.min(settings.introSeconds, Math.max(1, part.duration - 1))
    if (text && shown >= 1) {
      const img = makeLabel(text, {
        fontSize: px(56),
        style: 'pill',
        accent: settings.badgeAccent,
        textColor: contrastColor(settings.badgeAccent),
        maxWidth: frame.width - px(200)
      })
      const to = Math.round(shown * 100) / 100
      out.intro = {
        dataUrl: img.dataUrl,
        position: 'top-center',
        offsetY: place('top-center', img, 0, to),
        from: 0,
        to,
        fadeIn: 0.35,
        fadeOut: 0.5,
        animate: 'rise'
      }
    }
  }

  if (settings.teaserEnabled && !single && part.index < total && part.duration > settings.teaserSeconds + 2) {
    const img = makeLabel(`Part ${part.index + 1} ▶`, {
      fontSize: px(50),
      style: 'pill',
      accent: '#ffffff',
      textColor: '#111111'
    })
    const from = Math.max(0, part.duration - settings.teaserSeconds)
    const to = Math.ceil(part.duration + 1)
    out.teaser = {
      dataUrl: img.dataUrl,
      position: 'bottom-center',
      offsetY: place('bottom-center', img, from, to),
      from: Math.round(from * 100) / 100,
      to,
      fadeIn: 0.35
    }
  }

  // Call to action at the end. On a numbered part the teaser already does that job.
  if (settings.ctaEnabled && settings.ctaText.trim() && !out.teaser) {
    const shown = Math.min(settings.ctaSeconds, Math.max(1, part.duration - 1))
    if (shown >= 1) {
      const img = makeLabel(settings.ctaText.trim(), {
        fontSize: px(48),
        style: 'pill',
        accent: '#ffffff',
        textColor: '#111111',
        maxWidth: frame.width - px(200)
      })
      const from = Math.max(0, part.duration - shown)
      const to = Math.ceil(part.duration + 1)
      out.cta = {
        dataUrl: img.dataUrl,
        position: 'bottom-center',
        offsetY: place('bottom-center', img, from, to),
        from: Math.round(from * 100) / 100,
        to,
        fadeIn: 0.35,
        animate: 'rise'
      }
    }
  }

  return out
}
