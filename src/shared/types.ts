/** Shared types between main, preload and renderer. Keep this file free of Node/DOM imports. */

export type Platform = 'win32' | 'darwin' | 'linux'

export interface SourceInfo {
  /** Absolute path to the playable file on disk. */
  path: string
  /** Human title (page title for links, filename without extension for files). */
  title: string
  /** Where it came from: a local file or a link handled by yt-dlp. */
  origin: 'local' | 'link'
  url?: string
  /** Site name for links (e.g. "YouTube", "Vimeo", "TikTok"). */
  site?: string
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
/**
 * What the app is doing:
 *  - split:      one long video -> numbered shorts (or one branded clip if it is already short)
 *  - highlights: one long video -> one silent recap built from short snippets spread across it
 *  - combine:    many clips (links and files) -> one longer video, or just download them all
 */
export type AppMode = 'split' | 'highlights' | 'combine'
/** How many files to produce: split into parts, one clip, or decide from the source length. */
export type OutputMode = 'auto' | 'split' | 'single'
/** 'auto' keeps portrait/square sources at their own size and converts landscape to 9:16. */
export type SizeMode = 'auto' | 'vertical' | 'source'
export type FpsMode = 'source' | '30' | '60'
export type CookiesBrowser = 'none' | 'chrome' | 'firefox' | 'edge' | 'safari' | 'brave'

export interface Settings {
  mode: AppMode

  // trimming / splitting
  outputMode: OutputMode
  skipStartSec: number
  skipEndSec: number
  targetLengthSec: number
  maxLengthSec: number
  smartCut: boolean
  searchWindowSec: number

  // look
  sizeMode: SizeMode
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

  // branding (mainly for single-clip exports, where there is no part number)
  introEnabled: boolean
  introText: string
  introSeconds: number

  ctaEnabled: boolean
  ctaText: string
  ctaSeconds: number

  // highlights: many short snippets spread across a long video, played back to back
  highlightTargetSec: number
  highlightClipSec: number

  // combine
  combineName: string

  // audio
  normalizeAudio: boolean

  // export
  quality: QualityPreset
  fpsMode: FpsMode
  hardwareEncode: boolean
  outputDir: string
  /** Also render the whole trimmed range as one continuous vertical video. */
  saveFullVideo: boolean
  /** For links: copy the downloaded original next to the parts. */
  keepOriginal: boolean

  // link downloads (yt-dlp)
  cookiesBrowser: CookiesBrowser
  /** Netscape cookies.txt exported from a logged-in browser. Takes precedence over cookiesBrowser. */
  cookiesFile: string
}

export interface YtAuth {
  browser: CookiesBrowser
  file?: string
}

export const DEFAULT_SETTINGS: Settings = {
  mode: 'split',

  outputMode: 'auto',
  skipStartSec: 0,
  skipEndSec: 0,
  targetLengthSec: 120,
  maxLengthSec: 180,
  smartCut: true,
  searchWindowSec: 12,

  sizeMode: 'auto',
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

  introEnabled: true,
  introText: '',
  introSeconds: 3,

  ctaEnabled: true,
  ctaText: 'Follow for more',
  ctaSeconds: 3,

  highlightTargetSec: 120,
  highlightClipSec: 2.5,

  combineName: 'Compilation',

  normalizeAudio: true,

  quality: 'balanced',
  fpsMode: 'source',
  hardwareEncode: false,
  outputDir: '',
  saveFullVideo: false,
  keepOriginal: false,

  cookiesBrowser: 'none',
  cookiesFile: ''
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
  /** Fade out over this many seconds before it disappears (render only). */
  fadeOut?: number
  /** Small upward slide as it appears. */
  animate?: 'rise'
  /** Extra vertical offset in px (positive moves down). */
  offsetY?: number
}

export interface PartOverlays {
  badge?: OverlayImage
  title?: OverlayImage
  watermark?: OverlayImage
  teaser?: OverlayImage
  intro?: OverlayImage
  cta?: OverlayImage
}

export interface RenderJob {
  source: SourceInfo
  settings: Settings
  parts: PartPlan[]
  overlays: PartOverlays[] // one entry per part
  /** Present when settings.saveFullVideo is on: the whole trimmed range as one clip. */
  full?: { part: PartPlan; overlays: PartOverlays }
  /** Folder inside the output folder. Defaults to the source title. */
  outDirName?: string
  /** File name without extension, for a one-part job. Defaults to "<title> - Part 01". */
  fileName?: string
  /** Write captions.txt and manifest.json next to the videos. Defaults to true. */
  sidecars?: boolean
}

export interface PreviewRequest {
  source: SourceInfo
  settings: Settings
  part: PartPlan
  overlays: PartOverlays
  /** Seconds into the part to grab the frame from (the output clock, drives overlays). */
  offsetSec: number
  /** Where to read the frame in the source, when it differs from part.start + offsetSec. */
  sourceTimeSec?: number
  /** Force this output frame instead of deriving it from the source. */
  outSize?: { width: number; height: number }
}

/** One snippet of a highlights recap. */
export interface Segment {
  index: number
  /** Where the snippet starts in the source video. */
  start: number
  /** Frame-exact length. */
  duration: number
  /** Where the snippet starts in the finished recap. */
  at: number
}

/** A clip's place in a combined video. `index` points back into the clip list. */
export interface TimelineItem {
  index: number
  duration: number
  at: number
}

export interface HighlightsJob {
  source: SourceInfo
  settings: Settings
  segments: Segment[]
  fps: number
  /** Overlays timed against the finished recap. */
  overlays: PartOverlays
}

export interface CombineJob {
  clips: SourceInfo[]
  settings: Settings
  fps: number
  frame: { width: number; height: number }
  /** Overlays timed against the finished combined video. */
  overlays: PartOverlays
}

export interface SavedCopies {
  outputDir: string
  files: string[]
}

/** Everything the renderer and the preview need to agree on about the output frame. */
export interface FrameInfo {
  width: number
  height: number
  uiScale: number
  keptSource: boolean
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
  fullFile?: string
  originalFile?: string
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
  smoke?: { file?: string; files?: string[]; mode?: AppMode; render?: boolean; single?: boolean; outputDir?: string }
}

export interface EncoderInfo {
  name: string
  label: string
}
