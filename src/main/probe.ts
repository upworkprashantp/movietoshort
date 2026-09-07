import path from 'node:path'
import { ffmpegPath, ffprobePath } from './binaries'
import { runOk } from './proc'
import type { AudioTrack, SourceInfo } from '@shared/types'
import { formatFfmpegTime } from '@shared/time'

interface FfprobeStream {
  index: number
  codec_type: string
  codec_name?: string
  width?: number
  height?: number
  sample_aspect_ratio?: string
  avg_frame_rate?: string
  r_frame_rate?: string
  duration?: string
  channels?: number
  disposition?: { attached_pic?: number }
  tags?: Record<string, string>
  side_data_list?: Array<{ rotation?: number }>
}

interface FfprobeOutput {
  format?: { duration?: string; tags?: Record<string, string> }
  streams?: FfprobeStream[]
}

function parseRatio(s: string | undefined): number {
  if (!s) return 0
  const [a, b] = s.split(/[/:]/).map(Number)
  if (!a || !b) return 0
  return a / b
}

function rotationOf(stream: FfprobeStream): number {
  const fromSide = stream.side_data_list?.find((d) => typeof d.rotation === 'number')?.rotation
  if (typeof fromSide === 'number') return fromSide
  const tag = stream.tags?.rotate
  return tag ? Number(tag) : 0
}

export async function probeFile(
  file: string,
  title?: string,
  origin: SourceInfo['origin'] = 'local',
  url?: string
): Promise<SourceInfo> {
  const res = await runOk(ffprobePath(), [
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    file
  ])
  const data = JSON.parse(res.stdout.toString('utf8')) as FfprobeOutput
  const streams = data.streams ?? []
  const video = streams.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic)
  if (!video || !video.width || !video.height) throw new Error('No video stream found in this file.')
  const audios = streams.filter((s) => s.codec_type === 'audio')

  const duration = Number(data.format?.duration ?? video.duration ?? 0)
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Could not read the video duration.')

  const sar = parseRatio(video.sample_aspect_ratio) || 1
  let dw = Math.round(video.width * sar)
  let dh = video.height
  const rot = Math.abs(rotationOf(video)) % 180
  if (rot === 90) [dw, dh] = [dh, dw]

  const fps = parseRatio(video.avg_frame_rate) || parseRatio(video.r_frame_rate) || 30

  const audioTracks: AudioTrack[] = audios.map((a, i) => {
    const lang = a.tags?.language ? a.tags.language.toUpperCase() : ''
    const name = a.tags?.title ?? ''
    const ch = a.channels ? `${a.channels}ch` : ''
    const label = [`Track ${i + 1}`, lang, name, a.codec_name?.toUpperCase(), ch].filter(Boolean).join(' · ')
    return { index: a.index, label }
  })

  const thumbnail = await grabThumbnail(file, Math.min(duration * 0.1, 120)).catch(() => undefined)

  return {
    path: file,
    title: title ?? path.basename(file, path.extname(file)),
    origin,
    url,
    durationSec: duration,
    width: video.width,
    height: video.height,
    displayWidth: dw,
    displayHeight: dh,
    fps: Math.round(fps * 1000) / 1000,
    hasAudio: audios.length > 0,
    videoCodec: video.codec_name ?? 'unknown',
    audioCodec: audios[0]?.codec_name,
    thumbnail,
    audioTracks,
    videoStreamIndex: video.index,
    audioStreamIndex: audios[0]?.index
  }
}

async function grabThumbnail(file: string, at: number): Promise<string> {
  const res = await runOk(ffmpegPath(), [
    '-hide_banner',
    '-loglevel',
    'error',
    '-ss',
    formatFfmpegTime(at),
    '-i',
    file,
    '-frames:v',
    '1',
    '-vf',
    'scale=480:-2',
    '-f',
    'image2pipe',
    '-c:v',
    'mjpeg',
    '-q:v',
    '5',
    'pipe:1'
  ])
  if (!res.stdout.length) throw new Error('empty thumbnail')
  return `data:image/jpeg;base64,${res.stdout.toString('base64')}`
}
