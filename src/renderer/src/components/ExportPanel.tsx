import React from 'react'
import type { FpsMode, ProgressEvent, QualityPreset, RenderResult, Settings } from '@shared/types'
import { api } from '../lib/api'
import { Button, Card, Field, Pill, ProgressBar, Segmented, Toggle } from './ui'

interface Props {
  settings: Settings
  update: (patch: Partial<Settings>) => void
  disabled: boolean
  partCount: number
  rendering: boolean
  progress: Extract<ProgressEvent, { kind: 'render' }> | null
  result: RenderResult | null
  error: string | null
  hwEncoder: string | null | undefined
  sourceOrigin?: 'local' | 'link'
  onRender: () => void
  onCancel: () => void
}

export function ExportPanel(p: Props): JSX.Element {
  const s = p.settings
  const d = p.disabled || p.rendering

  const pickDir = async (): Promise<void> => {
    const dir = await api.pickOutputDir(s.outputDir)
    if (dir) p.update({ outputDir: dir })
  }

  return (
    <Card title="5. Export" subtitle="1080×1920 H.264 MP4 with AAC audio, ready for Shorts, Reels and TikTok.">
      <div className="grid-2">
        <Field label="Quality">
          <Segmented<QualityPreset>
            value={s.quality}
            disabled={d}
            onChange={(v) => p.update({ quality: v })}
            options={[
              { value: 'fast', label: 'Fast' },
              { value: 'balanced', label: 'Balanced' },
              { value: 'high', label: 'High' }
            ]}
          />
        </Field>
        <Field label="Frame rate">
          <Segmented<FpsMode>
            value={s.fpsMode}
            disabled={d}
            onChange={(v) => p.update({ fpsMode: v })}
            options={[
              { value: 'source', label: 'Source' },
              { value: '30', label: '30' },
              { value: '60', label: '60' }
            ]}
          />
        </Field>
      </div>
      <Toggle checked={s.normalizeAudio} disabled={d} onChange={(v) => p.update({ normalizeAudio: v })} label="Normalize loudness to −14 LUFS" hint="Consistent volume across parts and platforms." />
      <Toggle
        checked={s.hardwareEncode}
        disabled={d}
        onChange={(v) => p.update({ hardwareEncode: v })}
        label="Hardware encoding"
        hint={
          p.hwEncoder === undefined
            ? 'Uses your GPU when available. Falls back to software automatically.'
            : p.hwEncoder
              ? `Detected ${p.hwEncoder}`
              : 'No supported GPU encoder found, software will be used.'
        }
      />

      <Toggle
        checked={s.saveFullVideo}
        disabled={d}
        onChange={(v) => p.update({ saveFullVideo: v })}
        label="Also save the full-length video"
        hint="One continuous 9:16 file of the whole trimmed range with the same look, minus part badges. Takes about as long as all the parts together."
      />
      {p.sourceOrigin === 'link' && (
        <Toggle
          checked={s.keepOriginal}
          disabled={d}
          onChange={(v) => p.update({ keepOriginal: v })}
          label="Keep a copy of the original download"
          hint="Copies the downloaded source file next to the parts."
        />
      )}

      <Field label="Output folder">
        <div className="row">
          <input className="input grow mono small" value={s.outputDir} readOnly title={s.outputDir} />
          <Button onClick={pickDir} disabled={d}>
            Choose…
          </Button>
        </div>
      </Field>

      {p.rendering ? (
        <div className="status">
          <div className="row space-between">
            <span>{p.progress?.message ?? 'Starting…'}</span>
            <Button size="sm" variant="danger" onClick={p.onCancel}>
              Cancel
            </Button>
          </div>
          <ProgressBar percent={p.progress?.overallPercent ?? 0} />
          <div className="row space-between muted small mono">
            <span>
              {p.progress?.partIndex ?? 0}/{p.progress?.totalParts ?? p.partCount} · {Math.round(p.progress?.partPercent ?? 0)}%
            </span>
            <span>
              {p.progress?.fps ? `${Math.round(p.progress.fps)} fps` : ''} {p.progress?.speed ? `· ${p.progress.speed}` : ''}
            </span>
          </div>
        </div>
      ) : (
        <Button variant="primary" size="lg" onClick={p.onRender} disabled={p.disabled || p.partCount === 0}>
          Render {p.partCount ? `${p.partCount} short${p.partCount === 1 ? '' : 's'}` : ''}
          {p.partCount && s.saveFullVideo ? ' + full video' : ''}
        </Button>
      )}

      {p.error && <p className="error small">{p.error}</p>}

      {p.result && !p.rendering && (
        <div className="result">
          <div className="row space-between">
            <span>
              {p.result.cancelled ? <Pill tone="warn">Cancelled</Pill> : <Pill tone="ok">Done</Pill>} {p.result.files.length} short
              {p.result.files.length === 1 ? '' : 's'}
              {p.result.fullFile ? ' + full video' : ''}
              {p.result.originalFile ? ' + original' : ''}
            </span>
            <div className="row">
              <Button size="sm" onClick={() => api.openPath(p.result!.outputDir)}>
                Open folder
              </Button>
            </div>
          </div>
          {!p.result.cancelled && <p className="muted small">captions.txt in that folder has a ready-to-paste title and hashtags for every part.</p>}
        </div>
      )}
    </Card>
  )
}
