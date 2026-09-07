/** Shared types between main, preload and renderer. Keep this file free of Node/DOM imports. */

export type Platform = 'win32' | 'darwin' | 'linux'

export interface SourceInfo {
  /** Absolute path to the playable file on disk. */
  path: string
  /** Human title (YouTube title or filename without extension). */
  title: string
  /** Where it came from. */
  origin: 'local' | 'youtube'
  url?: string
  durationSec: number
  width: number
  height: number
  /** Effective display size after SAR + rotation are applied. */
  displayWidth: number
  displayHeight: number
  fps: number
  hasAudio: boolean
  videoCodec: string
  audioCodec?: string
  /** JPEG data URL of a frame roughly 10% in. */
  thumbnail?: string
  /** ffprobe stream index of the video stream to use. */
  videoStreamIndex: number
  /** ffprobe stream index of the audio stream to use (user selectable). */
  audioStreamIndex?: number
  audioTracks: AudioTrack[]
}

export interface AudioTrack {
  index: number
  label: string
}

export interface Silence {
  start: number
  end: number
}

export interface PartPlan {
  index: number // 1-based
  start: number
  end: number
  duration: number
  /** True when the boundary was snapped to a silence. */
  snappedStart: boolean
  snappedEnd: boolean
}

export type Layout = 'blur' | 'fill' | 'solid'
export type CropFocus = 'left' | 'center' | 'right'
export type BadgePosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
export type LabelStyle = 'pill' | 'outline' | 'shadow'
export type LabelSize = 'small' | 'medium' | 'large'
export type QualityPreset = 'fast' | 'balanced' | 'high'
export type FpsMode = 'source' | '30' | '60'
export type CookiesBrowser = 'none' | 'chrome' | 'firefox' | 'edge' | 'safari' | 'brave'

export interface Settings {
  // trimming / splitting
  skipStartSec: number
  skipEndSec: number
  targetLengthSec: number
  maxLengthSec: number
  smartCut: boolean
  searchWindowSec: number

  // look
  layout: Layout
  cropFocus: CropFocus
  fgScale: number // 1.0 - 1.6, only for blur/solid
  padColor: string // hex, only for solid
  blurStrength: number // 0-100

  badgeEnabled: boolean
  badgeTemplate: string // e.g. "Part {n}" or "Part {n}/{total}"
  badgePosition: BadgePosition
  badgeStyle: LabelStyle
  badgeSize: LabelSize
  badgeAccent: string // hex used for pill background

  titleEnabled: boolean
  titleText: string

  watermarkEnabled: boolean
  watermarkText: string

  progressBarEnabled: boolean
  progressBarColor: string

  teaserEnabled: boolean
  teaserSeconds: number

  // audio
  normalizeAudio: boolean

  // export
  quality: QualityPreset
  fpsMode: FpsMode
  hardwareEncode: boolean
  outputDir: string

  // youtube
  cookiesBrowser: CookiesBrowser
}

export const DEFAULT_SETTINGS: Settings = {
  skipStartSec: 0,
  skipEndSec: 0,
  targetLengthSec: 120,
  maxLengthSec: 180,
  smartCut: true,
  searchWindowSec: 12,

  layout: 'blur',
  cropFocus: 'center',
  fgScale: 1.0,
  padColor: '#0b0b0f',
  blurStrength: 60,

  badgeEnabled: true,
  badgeTemplate: 'Part {n}',
  badgePosition: 'top-left',
  badgeStyle: 'pill',
  badgeSize: 'medium',
  badgeAccent: '#ff2d55',

  titleEnabled: false,
  titleText: '',

  watermarkEnabled: false,
  watermarkText: '@yourchannel',

  progressBarEnabled: true,
  progressBarColor: '#ff2d55',

  teaserEnabled: true,
  teaserSeconds: 3,

  normalizeAudio: true,

  quality: 'balanced',
  fpsMode: 'source',
  hardwareEncode: false,
  outputDir: '',

  cookiesBrowser: 'none'
}

/** A PNG (data URL) with a placement, produced by the renderer's canvas. */
export interface OverlayImage {
  dataUrl: string
  position: BadgePosition
  /** Show only during [from, to] seconds of the part. Omit for always. */
  from?: number
  to?: number
  /** Fade in over this many seconds when it appears (render only). */
  fadeIn?: number
  /** Extra vertical offset in px (positive moves down). */
  offsetY?: number
}

export interface PartOverlays {
  badge?: OverlayImage
  title?: OverlayImage
  watermark?: OverlayImage
  teaser?: OverlayImage
}

export interface RenderJob {
  source: SourceInfo
  settings: Settings
  parts: PartPlan[]
  overlays: PartOverlays[] // one entry per part
}

export interface PreviewRequest {
  source: SourceInfo
  settings: Settings
  part: PartPlan
  overlays: PartOverlays
  /** Seconds into the part to grab the frame from. */
  offsetSec: number
}

export type ProgressEvent =
  | { kind: 'download'; percent: number; message: string }
  | { kind: 'analyze'; percent: number; message: string }
  | {
      kind: 'render'
      partIndex: number
      totalParts: number
      partPercent: number
      overallPercent: number
      fps?: number
      speed?: string
      message: string
    }
  | { kind: 'ytdlp'; percent: number; message: string }

export interface RenderResult {
  outputDir: string
  files: string[]
  cancelled: boolean
}

export interface YtDlpStatus {
  installed: boolean
  path?: string
  version?: string
}

export interface AppInfo {
  platform: Platform
  version: string
  defaultOutputDir: string
  ffmpegPath: string
  ffprobePath: string
  /** Present only when the app was started in smoke-test mode (see README). */
  smoke?: { file?: string; render?: boolean; outputDir?: string }
}

export interface EncoderInfo {
  name: string
  label: string
}
