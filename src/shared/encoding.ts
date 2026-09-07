import type { QualityPreset } from './types'

/** ffmpeg video encoder arguments for a given encoder name (null = software libx264). */
export function videoEncoderArgs(encoder: string | null, quality: QualityPreset): string[] {
  const q = quality === 'fast' ? 0 : quality === 'high' ? 2 : 1
  switch (encoder) {
    case 'h264_videotoolbox':
      return ['-c:v', 'h264_videotoolbox', '-b:v', ['8M', '12M', '18M'][q], '-profile:v', 'high', '-allow_sw', '1']
    case 'h264_nvenc':
      return ['-c:v', 'h264_nvenc', '-preset', ['p3', 'p5', 'p7'][q], '-rc', 'vbr', '-cq', ['24', '20', '18'][q], '-b:v', '0', '-profile:v', 'high']
    case 'h264_qsv':
      return ['-c:v', 'h264_qsv', '-preset', ['veryfast', 'medium', 'slow'][q], '-global_quality', ['24', '20', '18'][q], '-profile:v', 'high']
    case 'h264_amf':
      return ['-c:v', 'h264_amf', '-quality', ['speed', 'balanced', 'quality'][q], '-rc', 'cqp', '-qp_i', ['24', '20', '18'][q], '-qp_p', ['24', '20', '18'][q]]
    default:
      return ['-c:v', 'libx264', '-preset', ['veryfast', 'medium', 'slow'][q], '-crf', ['23', '20', '18'][q], '-profile:v', 'high', '-level', '4.2', '-g', '60', '-bf', '2']
  }
}

/** AAC stereo 48 kHz: what every short-form platform re-encodes from cleanly. */
export const AUDIO_ARGS = ['-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2']
