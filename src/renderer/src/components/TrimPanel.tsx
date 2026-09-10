import React from 'react'
import type { OutputMode, Settings, SourceInfo } from '@shared/types'
import { formatTime } from '@shared/time'
import { Button, Card, Field, Pill, ProgressBar, Segmented, Slider, TimeInput, Toggle } from './ui'

interface Props {
  source: SourceInfo | null
  settings: Settings
  update: (patch: Partial<Settings>) => void
  busy: boolean
  analyzing: boolean
  analyzePercent: number
  silenceCount: number | null
  onAnalyze: () => void
  onCancel: () => void
}

const LENGTHS = [
  { value: '30', label: '30s' },
  { value: '60', label: '60s' },
  { value: '90', label: '90s' },
  { value: '120', label: '2 min' },
  { value: '180', label: '3 min' }
]

export function TrimPanel(p: Props): JSX.Element {
  const s = p.settings
  const disabled = !p.source || p.busy
  const splitDisabled = disabled || s.outputMode === 'single'
  const dur = p.source?.durationSec ?? 0
  const usable = Math.max(0, dur - s.skipStartSec - s.skipEndSec)
  const preset = LENGTHS.find((l) => Number(l.value) === s.targetLengthSec)?.value ?? 'custom'

  return (
    <Card title="2. Trim & split" subtitle="Skip intros and credits, then choose how long each part should be.">
      <Field label="Output" hint="Auto keeps a video that is already short as one clip">
        <Segmented<OutputMode>
          value={s.outputMode}
          disabled={disabled}
          onChange={(v) => p.update({ outputMode: v })}
          options={[
            { value: 'auto', label: 'Auto', title: 'Split long videos, keep short ones whole' },
            { value: 'split', label: 'Split into parts', title: 'Always split, even a short video' },
            { value: 'single', label: 'Single clip', title: 'Never split: one file for the whole range' }
          ]}
        />
      </Field>

      <div className="grid-2">
        <Field label="Skip from start" hint="intro, logos, cold open">
          <TimeInput value={s.skipStartSec} disabled={disabled} onChange={(v) => p.update({ skipStartSec: v })} />
        </Field>
        <Field label="Skip from end" hint="credits, outro">
          <TimeInput value={s.skipEndSec} disabled={disabled} onChange={(v) => p.update({ skipEndSec: v })} />
        </Field>
      </div>
      {p.source && (
        <p className="muted small">
          Using {formatTime(s.skipStartSec, true)} → {formatTime(dur - s.skipEndSec, true)} ({formatTime(usable)} of{' '}
          {formatTime(dur)})
          {usable < 1 && <Pill tone="warn">Nothing left to cut</Pill>}
        </p>
      )}

      <Field label="Part length" hint="Shorts and Reels allow up to 3 minutes, TikTok up to 10">
        <Segmented
          value={preset}
          disabled={splitDisabled}
          options={[...LENGTHS, { value: 'custom', label: 'Custom' }]}
          onChange={(v) => {
            if (v !== 'custom') p.update({ targetLengthSec: Number(v) })
          }}
        />
      </Field>
      {preset === 'custom' && (
        <Slider
          value={s.targetLengthSec}
          min={15}
          max={s.maxLengthSec}
          step={5}
          disabled={splitDisabled}
          onChange={(v) => p.update({ targetLengthSec: v })}
          format={(v) => formatTime(v)}
        />
      )}
      <Field label="Hard limit per part" hint="never exceed this, even after smart cuts">
        <Segmented
          value={String(s.maxLengthSec)}
          disabled={splitDisabled}
          options={[
            { value: '60', label: '60s' },
            { value: '90', label: '90s' },
            { value: '180', label: '3 min' },
            { value: '600', label: '10 min (TikTok)' }
          ]}
          onChange={(v) => {
            const max = Number(v)
            p.update({ maxLengthSec: max, targetLengthSec: Math.min(s.targetLengthSec, max) })
          }}
        />
      </Field>

      <Toggle
        checked={s.smartCut}
        disabled={splitDisabled}
        onChange={(v) => p.update({ smartCut: v })}
        label="Smart cuts on natural pauses"
        hint="Moves each cut to the nearest silence so parts never end mid-sentence."
      />
      {s.smartCut && s.outputMode !== 'single' && (
        <div className="indent">
          <Field label="Search window" hint="how far a cut may move to find a pause">
            <Slider
              value={s.searchWindowSec}
              min={2}
              max={30}
              step={1}
              disabled={disabled}
              onChange={(v) => p.update({ searchWindowSec: v })}
              format={(v) => `±${v}s`}
            />
          </Field>
          {p.analyzing ? (
            <div className="status">
              <div className="row space-between">
                <span>Finding natural pauses… {p.analyzePercent}%</span>
                <Button size="sm" variant="ghost" onClick={p.onCancel}>
                  Cancel
                </Button>
              </div>
              <ProgressBar percent={p.analyzePercent} />
            </div>
          ) : (
            <div className="row">
              {p.silenceCount === null ? (
                <>
                  <Button size="sm" onClick={p.onAnalyze} disabled={disabled || !p.source?.hasAudio}>
                    Analyze audio
                  </Button>
                  <span className="muted small">
                    {p.source?.hasAudio === false ? 'No audio to analyze.' : 'Not analyzed yet, cuts will be evenly spaced.'}
                  </span>
                </>
              ) : (
                <>
                  <Pill tone="ok">{p.silenceCount} pauses found</Pill>
                  <Button size="sm" variant="ghost" onClick={p.onAnalyze} disabled={disabled}>
                    Re-analyze
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
