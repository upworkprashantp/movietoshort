import React, { useState } from 'react'
import type { PartPlan } from '@shared/types'
import { formatTime } from '@shared/time'
import { Button, Card, Segmented, Toggle } from './ui'

export type Moment = 'start' | 'middle' | 'end'

interface Props {
  parts: PartPlan[]
  selected: number
  onSelect: (index: number) => void
  moment: Moment
  onMoment: (m: Moment) => void
  image: string | null
  loading: boolean
  error: string | null
  onRefresh: () => void
  disabled: boolean
}

export function PreviewPanel(p: Props): JSX.Element {
  const [safe, setSafe] = useState(false)
  const part = p.parts.find((x) => x.index === p.selected)
  return (
    <Card
      title="Preview"
      subtitle={part ? `Part ${part.index} · ${formatTime(part.start, true)} → ${formatTime(part.end, true)}` : 'Exactly what will be rendered, at 1080×1920.'}
      right={
        <div className="row">
          <Toggle checked={safe} onChange={setSafe} label="Safe zones" />
          <Button size="sm" onClick={p.onRefresh} disabled={p.disabled || !part}>
            Refresh
          </Button>
        </div>
      }
      className="preview-card"
    >
      <div className="preview-stage">
        <div className="phone">
          {p.image ? <img src={p.image} alt="Preview frame" /> : <div className="phone-empty muted">{p.disabled ? 'Load a video to preview' : 'No preview yet'}</div>}
          {p.loading && <div className="phone-loading">Rendering preview…</div>}
          {safe && (
            <div className="safe-overlay" aria-hidden>
              <div className="safe-top" />
              <div className="safe-bottom" />
              <div className="safe-right" />
              <span className="safe-label">UI covered on Shorts / Reels</span>
            </div>
          )}
        </div>
      </div>
      {p.error && <p className="error small">{p.error}</p>}
      <div className="row space-between wrap">
        <div className="row">
          <Button size="sm" variant="ghost" disabled={!part || part.index <= 1} onClick={() => p.onSelect(p.selected - 1)}>
            ◀
          </Button>
          <span className="mono small">Part {part?.index ?? '–'} / {p.parts.length || '–'}</span>
          <Button size="sm" variant="ghost" disabled={!part || part.index >= p.parts.length} onClick={() => p.onSelect(p.selected + 1)}>
            ▶
          </Button>
        </div>
        <Segmented<Moment>
          value={p.moment}
          onChange={p.onMoment}
          disabled={p.disabled}
          options={[
            { value: 'start', label: 'Start' },
            { value: 'middle', label: 'Middle' },
            { value: 'end', label: 'Last 3s', title: 'Shows the next-part teaser' }
          ]}
        />
      </div>
    </Card>
  )
}
