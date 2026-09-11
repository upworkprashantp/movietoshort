import React, { useState } from 'react'
import { Button, Card, Segmented, Toggle } from './ui'

export type Moment = 'start' | 'middle' | 'end'

interface Props {
  /** How many items the arrows step through (parts, snippets or clips). */
  count: number
  /** 1-based. */
  selected: number
  onSelect: (index: number) => void
  /** "Part", "Snippet" or "Clip". */
  noun: string
  /** Describes the selected item. */
  subtitle?: string
  endLabel?: string
  endHint?: string
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
  const has = p.count > 0 && p.selected >= 1 && p.selected <= p.count
  return (
    <Card
      title="Preview"
      subtitle={has ? (p.subtitle ?? `${p.noun} ${p.selected}`) : 'Exactly what will be rendered.'}
      right={
        <div className="row">
          <Toggle checked={safe} onChange={setSafe} label="Safe zones" />
          <Button size="sm" onClick={p.onRefresh} disabled={p.disabled || !has}>
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
              <span className="safe-label">UI covered on Shorts / Reels / TikTok</span>
            </div>
          )}
        </div>
      </div>
      {p.error && <p className="error small">{p.error}</p>}
      <div className="row space-between wrap">
        <div className="row">
          <Button size="sm" variant="ghost" disabled={!has || p.selected <= 1} onClick={() => p.onSelect(p.selected - 1)}>
            ◀
          </Button>
          <span className="mono small">
            {p.noun} {has ? p.selected : '–'} / {p.count || '–'}
          </span>
          <Button size="sm" variant="ghost" disabled={!has || p.selected >= p.count} onClick={() => p.onSelect(p.selected + 1)}>
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
            { value: 'end', label: p.endLabel ?? 'Last 3s', title: p.endHint ?? 'Shows the next-part teaser' }
          ]}
        />
      </div>
    </Card>
  )
}
