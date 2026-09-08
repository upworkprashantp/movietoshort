import fs from 'node:fs'
import path from 'node:path'
import { net } from 'electron'
import { cacheDir, ffmpegPath, ytdlpDownloadUrl, ytdlpPath } from './binaries'
import { run, runOk, CancelledError } from './proc'
import type { YtAuth, YtDlpStatus } from '@shared/types'

let versionCache: string | undefined

export function isInstalled(): boolean {
  return fs.existsSync(ytdlpPath())
}

export async function status(): Promise<YtDlpStatus> {
  if (!isInstalled()) return { installed: false }
  if (!versionCache) {
    try {
      const res = await runOk(ytdlpPath(), ['--version'])
      versionCache = res.stdout.toString('utf8').trim()
    } catch {
      versionCache = 'unknown'
    }
  }
  return { installed: true, path: ytdlpPath(), version: versionCache }
}

/** Download (or re-download) the latest yt-dlp release for this platform. */
export async function install(onProgress?: (percent: number, message: string) => void): Promise<YtDlpStatus> {
  const target = ytdlpPath()
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const url = ytdlpDownloadUrl()
  onProgress?.(0, 'Downloading yt-dlp…')

  const res = await net.fetch(url, { redirect: 'follow' })
  if (!res.ok || !res.body) throw new Error(`Could not download yt-dlp (${res.status} ${res.statusText}).`)
  const total = Number(res.headers.get('content-length') ?? 0)
  const tmp = target + '.download'
  const out = fs.createWriteStream(tmp)
  const reader = res.body.getReader()
  let received = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.byteLength
      if (!out.write(Buffer.from(value))) await new Promise<void>((r) => out.once('drain', () => r()))
      if (total) onProgress?.(Math.round((received / total) * 100), 'Downloading yt-dlp…')
    }
  } finally {
    await new Promise<void>((r) => out.end(() => r()))
  }
  if (received < 1_000_000) {
    fs.rmSync(tmp, { force: true })
    throw new Error('yt-dlp download looks incomplete. Please try again.')
  }
  fs.renameSync(tmp, target)
  if (process.platform !== 'win32') fs.chmodSync(target, 0o755)
  versionCache = undefined
  onProgress?.(100, 'yt-dlp ready')
  return status()
}

export async function ensureInstalled(onProgress?: (percent: number, message: string) => void): Promise<void> {
  if (!isInstalled()) await install(onProgress)
}

export interface YtInfo {
  id: string
  title: string
  duration?: number
  thumbnail?: string
  webpage_url?: string
  extractor_key?: string
  extractor?: string
}

/** "YoutubeTab" -> "YouTube", "TwitterSpaces" -> "Twitter Spaces", "vimeo" -> "Vimeo". */
export function siteName(info: YtInfo): string {
  const key = (info.extractor_key ?? info.extractor ?? '').replace(/:.*$/, '')
  if (!key) return 'Link'
  if (/^youtube/i.test(key)) return 'YouTube'
  if (/^tiktok/i.test(key)) return 'TikTok'
  return key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^\w/, (c) => c.toUpperCase())
}

function cookieArgs(auth: YtAuth): string[] {
  if (auth.file && fs.existsSync(auth.file)) return ['--cookies', auth.file]
  return auth.browser && auth.browser !== 'none' ? ['--cookies-from-browser', auth.browser] : []
}

/**
 * YouTube now requires a JavaScript runtime (Node 22+) to solve its player challenges, otherwise
 * most formats are missing. The app's own Electron binary is a full Node when started with
 * ELECTRON_RUN_AS_NODE=1, so every user has a runtime without installing anything.
 */
function runtimeArgs(): string[] {
  return ['--js-runtimes', `node:${process.execPath}`]
}

function runtimeEnv(): NodeJS.ProcessEnv {
  return { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
}

/**
 * When YouTube flags a network with "sign in to confirm you're not a bot", the embedded player
 * clients usually still work. Once a fallback succeeded we try it first for the rest of the session.
 */
const FALLBACK_CLIENTS = ['--extractor-args', 'youtube:player_client=web_embedded,mweb']
let preferFallback = false

function isBlocked(stderr: string): boolean {
  return /confirm you.re not a bot|sign in to confirm|This video is not available|not available on this app/i.test(stderr)
}

function commonArgs(auth: YtAuth): string[] {
  return [
    '--no-playlist',
    '--no-warnings',
    '--ffmpeg-location',
    path.dirname(ffmpegPath()),
    ...runtimeArgs(),
    ...cookieArgs(auth)
  ]
}

function isCookieFailure(stderr: string): boolean {
  return /Could not copy .* cookie database|Failed to decrypt with DPAPI|could not find .* cookies database|cookies database/i.test(
    stderr
  )
}

type RunOut = { code: number | null; stdout: Buffer; stderr: string }

/**
 * Run yt-dlp, retrying when the failure is something we can work around:
 *  - browser cookies unreadable (Chrome/Edge on Windows): retry without cookies
 *  - YouTube bot check / "not available": retry with the embedded player clients
 */
async function runWithFallback(
  auth: YtAuth,
  buildArgs: (auth: YtAuth) => string[],
  opts: { signal?: AbortSignal; onStdoutLine?: (line: string) => void }
): Promise<RunOut> {
  const clientOrder = preferFallback ? [FALLBACK_CLIENTS, []] : [[], FALLBACK_CLIENTS]
  let currentAuth = auth
  let last: RunOut | undefined
  for (let i = 0; i < clientOrder.length; i++) {
    const res = await run(ytdlpPath(), [...clientOrder[i], ...buildArgs(currentAuth)], { ...opts, env: runtimeEnv() })
    if (res.code === 0) {
      if (clientOrder[i].length) preferFallback = true
      return res
    }
    if (opts.signal?.aborted) throw new CancelledError()
    last = res
    if (currentAuth.browser !== 'none' && !currentAuth.file && isCookieFailure(res.stderr)) {
      // Same client set again, just without the unreadable browser cookies.
      currentAuth = { browser: 'none' }
      i--
      continue
    }
    if (!isBlocked(res.stderr)) break
  }
  return last!
}

function extractError(stderr: string, fallback: string): string {
  const line = stderr
    .split(/\r?\n/)
    .reverse()
    .find((l) => l.startsWith('ERROR:'))
  let msg = line ? line.replace(/^ERROR:\s*/, '') : fallback
  const http = /HTTP Error (403|412|429)/i.exec(stderr)
  if (http) {
    return (
      `The site blocked this request (HTTP ${http[1]}, its anti-bot or rate limit). ` +
      'Wait a few minutes and try again, or use a cookies.txt file exported from a browser where you are logged into the site.'
    )
  }
  if (/Could not copy Chrome cookie database|Failed to decrypt with DPAPI|could not find .* cookies database/i.test(msg)) {
    return (
      'Could not read cookies from that browser (it must be closed, and Chrome/Edge on Windows often block it). ' +
      'Use a cookies.txt file instead: install the "Get cookies.txt LOCALLY" extension, export while logged into the site, then choose the file.'
    )
  }
  if (/confirm you.re not a bot|sign in to confirm|age.restricted|login required|private video/i.test(msg)) {
    msg =
      msg.split(/\.\s/)[0] +
      '. Tip: open "Login required, age-restricted or private?" and choose a cookies.txt file exported from a browser where you are logged into the site.'
  }
  return msg
}

export async function fetchInfo(url: string, auth: YtAuth, signal?: AbortSignal): Promise<YtInfo> {
  const res = await runWithFallback(auth, (a) => [...commonArgs(a), '--dump-single-json', url], { signal })
  if (res.code !== 0) throw new Error(extractError(res.stderr, 'yt-dlp could not read this link.'))
  const info = JSON.parse(res.stdout.toString('utf8')) as YtInfo
  if (!info.id) throw new Error('This link does not point to a single video.')
  return info
}

function findCached(id: string): string | undefined {
  const dir = cacheDir()
  const files = fs.readdirSync(dir).filter((f) => f.startsWith(id + '.') && !/\.(part|ytdl|download)$/i.test(f))
  const preferred = files.find((f) => f.endsWith('.mp4')) ?? files[0]
  return preferred ? path.join(dir, preferred) : undefined
}

export interface DownloadProgress {
  percent: number
  message: string
}

/**
 * Download the video (max 1080p, H.264 preferred so ffmpeg decodes it fast) into the cache.
 * Returns the path of the downloaded file. Re-uses a previous download of the same video.
 */
export async function download(
  url: string,
  info: YtInfo,
  auth: YtAuth,
  onProgress: (p: DownloadProgress) => void,
  signal?: AbortSignal
): Promise<string> {
  const cached = findCached(info.id)
  if (cached) {
    onProgress({ percent: 100, message: 'Using cached download' })
    return cached
  }

  const outTemplate = path.join(cacheDir(), '%(id)s.%(ext)s')
  let streamNo = 0
  const buildArgs = (a: YtAuth): string[] => [
    ...commonArgs(a),
    '--newline',
    '--progress',
    '-f',
    'bv*[height<=1080]+ba/b[height<=1080]/bv*+ba/b',
    '-S',
    'vcodec:h264,acodec:aac',
    '--merge-output-format',
    'mp4',
    '-o',
    outTemplate,
    url
  ]

  const res = await runWithFallback(auth, buildArgs, {
    signal,
    onStdoutLine: (line) => {
      if (line.includes('Destination:')) streamNo++
      const m = /\[download\]\s+(\d+(?:\.\d+)?)%/.exec(line)
      if (m) {
        const pct = Number(m[1])
        const label = streamNo >= 2 ? 'Downloading audio' : 'Downloading video'
        const extra = line.replace(/^\[download\]\s+/, '')
        onProgress({ percent: pct, message: `${label} · ${extra}` })
      } else if (line.includes('[Merger]')) {
        onProgress({ percent: 100, message: 'Merging video and audio…' })
      }
    }
  })
  if (signal?.aborted) throw new CancelledError()
  if (res.code !== 0) throw new Error(extractError(res.stderr, 'yt-dlp failed to download this video.'))

  const file = findCached(info.id)
  if (!file) throw new Error('Download finished but the file could not be found.')
  return file
}

export function clearCache(): number {
  const dir = cacheDir()
  let n = 0
  for (const f of fs.readdirSync(dir)) {
    fs.rmSync(path.join(dir, f), { force: true, recursive: true })
    n++
  }
  return n
}
