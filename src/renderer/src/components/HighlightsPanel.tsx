import React from 'react'
import type { Segment, Settings, SourceInfo } from '@shared/types'
import { formatTime } from '@shared/time'
import { highlightsLength } from '@shared/highlights'
import { Card, Field, Pill, Segmented, Slider, TimeInput } from './ui'

interface Props {
  source: SourceInfo | null
  settings: Settings
  update: (patch: Partial<Settings>) => void
  busy: boolean
  segments: Segment[]
  selected: number
  onSelect: (index: number) => void
}

const TARGETS = [
  { value: '30', label: '30s' },
  { value: '60', label: '60s' },
  { value: '90', label: '90s' },
  { value: '120', label: '2 min' },
  { value: '180', label: '3 min' }
]

function seconds(n: number): string {
  return `${Math.round(n * 100) / 100}s`
}

export function HighlightsPanel(p: Props): JSX.Element {
  const s = p.settings
  const disabled = !p.source || p.busy
  const dur = p.source?.durationSec ?? 0
  const usable = Math.max(0, dur - s.skipStartSec - s.skipEndSec)
  const total = highlightsLength(p.segments)
  const whole = p.segments.length === 1 && usable <= s.highlightTargetSec
  const every = p.segments.length > 1 ? p.segments[1].start - p.segments[0].start : 0

  return (
    <>
      <Card title="2. Highlights" subtitle="Quick snippets taken evenly from start to end, played back to back.">
        <Field label="Recap length" hint="Shorts and Reels allow up to 3 minutes">
          <Segmented
            value={String(s.highlightTargetSec)}
            disabled={disabled}
            options={TARGETS}
            onChange={(v) => p.update({ highlightTargetSec: Number(v) })}
          />
        </Field>
        <Field label="Each snippet" hint="2 to 3 seconds keeps it moving without feeling jumpy">
          <Slider
            value={s.highlightClipSec}
            min={1}
            max={5}
            step={0.5}
            disabled={disabled}
            onChange={(v) => p.update({ highlightClipSec: v })}
            format={(v) => `${v}s`}
          />
        </Field>
        <div className="grid-2">
          <Field label="Skip from start" hint="intro, logos">
            <TimeInput value={s.skipStartSec} disabled={disabled} onChange={(v) => p.update({ skipStartSec: v })} />
          </Field>
          <Field label="Skip from end" hint="credits, outro">
            <TimeInput value={s.skipEndSec} disabled={disabled} onChange={(v) => p.update({ skipEndSec: v })} />
          </Field>
        </div>

        {p.source && p.segments.length > 0 && (
          <p className="muted small">
            {whole
              ? `After trimming this video is ${formatTime(usable)}, already within the recap length, so the recap is the whole range.`
              : `${p.segments.length} snippets of ${seconds(p.segments[0].duration)} = ${formatTime(total)}, one every ${formatTime(every)} across ${formatTime(usable)} of video.`}
          </p>
        )}
        {p.source && !p.segments.length && <Pill tone="warn">Nothing left after skipping. Reduce the skip times.</Pill>}
        <div className="row">
          <Pill tone="muted">Silent: add a trending sound in the app when you post</Pill>
        </div>
      </Card>

      <Card
        title="3. Snippets"
        subtitle={p.segments.length ? `${p.segments.length} snippets · ${formatTime(total)} recap` : 'Load a video to see the snippets.'}
        className="card-scroll"
      >
        <ol className="plan-list">
          {p.segments.map((seg) => (
            <li key={seg.index} className={seg.index === p.selected ? 'active' : ''} onClick={() => p.onSelect(seg.index)}>
              <span className="plan-index">{seg.index}</span>
              <span className="mono">from {formatTime(seg.start, true)}</span>
              <span className="plan-dur mono">at {formatTime(seg.at)}</span>
              <span />
            </li>
          ))}
        </ol>
      </Card>
    </>
  )
}
