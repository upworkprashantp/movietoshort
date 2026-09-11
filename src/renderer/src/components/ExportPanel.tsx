import React from 'react'
import type { AppMode, FpsMode, ProgressEvent, QualityPreset, RenderResult, Settings } from '@shared/types'
import { api } from '../lib/api'
import { Button, Card, Field, Pill, ProgressBar, Segmented, Toggle } from './ui'

interface Props {
  mode: AppMode
  settings: Settings
  update: (patch: Partial<Settings>) => void
  disabled: boolean
  /** Enough is loaded to render. */
  canRender: boolean
  /** Text on the main button, e.g. "Render 6 shorts". */
  renderLabel: string
  /** Fallback for the progress counter before the first event arrives. */
  itemCount: number
  rendering: boolean
  progress: Extract<ProgressEvent, { kind: 'render' }> | null
  result: RenderResult | null
  error: string | null
  hwEncoder: string | null | undefined
  sourceOrigin?: 'local' | 'link'
  onRender: () => void
  onCancel: () => void
  /** Combine only: save the clips as they are, without joining them. */
  secondary?: { label: string; hint: string; disabled: boolean; onClick: () => void }
}

const SUBTITLE: Record<AppMode, string> = {
  split: 'H.264 MP4 with AAC audio, ready for Shorts, Reels and TikTok.',
  highlights: 'One silent H.264 MP4, ready for Shorts, Reels and TikTok.',
  combine: 'One H.264 MP4 with sound, clip after clip.'
}

export function ExportPanel(p: Props): JSX.Element {
  const s = p.settings
  const d = p.disabled || p.rendering
  const silent = p.mode === 'highlights'

  const pickDir = async (): Promise<void> => {
    const dir = await api.pickOutputDir(s.outputDir)
    if (dir) p.update({ outputDir: dir })
  }

  return (
    <Card title="5. Export" subtitle={SUBTITLE[p.mode]}>
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
      <Toggle
        checked={s.normalizeAudio && !silent}
        disabled={d || silent}
        onChange={(v) => p.update({ normalizeAudio: v })}
        label="Normalize loudness to −14 LUFS"
        hint={
          silent
            ? 'Not used: highlights are silent.'
            : p.mode === 'combine'
              ? 'Evens out clips from different creators so none is louder than the rest.'
              : 'Consistent volume across parts and platforms.'
        }
      />
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

      {p.mode === 'split' && (
        <>
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
        </>
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
              {p.progress?.partIndex ?? 0}/{p.progress?.totalParts ?? p.itemCount} · {Math.round(p.progress?.overallPercent ?? 0)}%
            </span>
            <span>
              {p.progress?.fps ? `${Math.round(p.progress.fps)} fps` : ''} {p.progress?.speed ? `· ${p.progress.speed}` : ''}
            </span>
          </div>
        </div>
      ) : (
        <>
          <Button variant="primary" size="lg" onClick={p.onRender} disabled={p.disabled || !p.canRender}>
            {p.renderLabel}
          </Button>
          {p.secondary && (
            <div className="row">
              <Button size="sm" onClick={p.secondary.onClick} disabled={p.disabled || p.secondary.disabled}>
                {p.secondary.label}
              </Button>
              <span className="muted small">{p.secondary.hint}</span>
            </div>
          )}
        </>
      )}

      {p.error && <p className="error small">{p.error}</p>}

      {p.result && !p.rendering && (
        <div className="result">
          <div className="row space-between">
            <span>
              {p.result.cancelled ? <Pill tone="warn">Cancelled</Pill> : <Pill tone="ok">Done</Pill>}{' '}
              {p.mode === 'split' ? (
                <>
                  {p.result.files.length} short{p.result.files.length === 1 ? '' : 's'}
                  {p.result.fullFile ? ' + full video' : ''}
                  {p.result.originalFile ? ' + original' : ''}
                </>
              ) : (
                <>
                  {p.result.files.length} file{p.result.files.length === 1 ? '' : 's'}
                </>
              )}
            </span>
            <Button size="sm" onClick={() => api.openPath(p.result!.outputDir)}>
              Open folder
            </Button>
          </div>
          {!p.result.cancelled && p.mode === 'split' && (
            <p className="muted small">captions.txt in that folder has a ready-to-paste title and hashtags for every part.</p>
          )}
          {!p.result.cancelled && p.mode === 'combine' && p.result.files.length === 1 && (
            <p className="muted small">A sources list sits next to the video so you can credit each creator.</p>
          )}
        </div>
      )}
    </Card>
  )
}
