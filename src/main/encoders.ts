import { ffmpegPath } from './binaries'
import { run } from './proc'

const CANDIDATES: Record<string, string[]> = {
  darwin: ['h264_videotoolbox'],
  win32: ['h264_nvenc', 'h264_qsv', 'h264_amf'],
  linux: ['h264_nvenc', 'h264_qsv']
}

let detected: string | null | undefined

/** Find a working hardware H.264 encoder by actually encoding a few frames with it. */
export async function detectHardwareEncoder(): Promise<string | null> {
  if (detected !== undefined) return detected
  detected = null
  const list = CANDIDATES[process.platform] ?? []
  if (!list.length) return null
  const enc = await run(ffmpegPath(), ['-hide_banner', '-encoders'])
  const available = enc.stdout.toString('utf8')
  for (const name of list) {
    if (!available.includes(` ${name} `)) continue
    const test = await run(ffmpegPath(), [
      '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=320x240:r=30:d=0.5', '-c:v', name, '-f', 'null', '-'
    ])
    if (test.code === 0) {
      detected = name
      break
    }
  }
  return detected
}
