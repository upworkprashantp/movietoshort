import fs from 'node:fs'
import path from 'node:path'
import { net } from 'electron'
import { cacheDir, ffmpegPath, ytdlpDownloadUrl, ytdlpPath } from './binaries'
import { run, runOk, CancelledError } from './proc'
import type { CookiesBrowser, YtDlpStatus } from '@shared/types'

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
}

function cookieArgs(browser: CookiesBrowser): string[] {
  return browser && browser !== 'none' ? ['--cookies-from-browser', browser] : []
}

function commonArgs(browser: CookiesBrowser): string[] {
  return ['--no-playlist', '--no-warnings', '--ffmpeg-location', path.dirname(ffmpegPath()), ...cookieArgs(browser)]
}

function extractError(stderr: string, fallback: string): string {
  const line = stderr
    .split(/\r?\n/)
    .reverse()
    .find((l) => l.startsWith('ERROR:'))
  let msg = line ? line.replace(/^ERROR:\s*/, '') : fallback
  if (/confirm you.re not a bot|sign in to confirm|age.restricted|login required|private video/i.test(msg)) {
    msg =
      msg.split(/\.\s/)[0] +
      '. Tip: open "Age-restricted or private video?" and pick the browser you are logged into YouTube with, then try again.'
  }
  return msg
}

export async function fetchInfo(url: string, browser: CookiesBrowser, signal?: AbortSignal): Promise<YtInfo> {
  const res = await run(ytdlpPath(), [...commonArgs(browser), '--dump-single-json', url], { signal })
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
  browser: CookiesBrowser,
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
  const args = [
    ...commonArgs(browser),
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

  const res = await run(ytdlpPath(), args, {
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
