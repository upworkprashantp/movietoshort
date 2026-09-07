import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import ffmpegStatic from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'

/** Binaries inside app.asar cannot be executed; electron-builder unpacks them next to it. */
function unpacked(p: string): string {
  return p.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1')
}

export function ffmpegPath(): string {
  const override = process.env.MOVIETOSHORT_FFMPEG
  if (override && fs.existsSync(override)) return override
  return unpacked(String(ffmpegStatic))
}

export function ffprobePath(): string {
  const override = process.env.MOVIETOSHORT_FFPROBE
  if (override && fs.existsSync(override)) return override
  return unpacked(ffprobeStatic.path)
}

/** yt-dlp is downloaded on demand into the user data folder so it can be updated independently. */
export function ytdlpPath(): string {
  const bin = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
  return path.join(app.getPath('userData'), 'bin', bin)
}

export function ytdlpDownloadUrl(): string {
  const base = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/'
  if (process.platform === 'win32') return base + 'yt-dlp.exe'
  if (process.platform === 'darwin') return base + 'yt-dlp_macos'
  return base + 'yt-dlp'
}

export function cacheDir(): string {
  const dir = path.join(app.getPath('userData'), 'cache', 'downloads')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function tempDir(): string {
  const dir = path.join(app.getPath('temp'), 'movietoshort')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}
