import React from 'react'
import type { PartPlan } from '@shared/types'
import { formatTime } from '@shared/time'
import { Card, Pill } from './ui'

interface Props {
  parts: PartPlan[]
  selected: number
  onSelect: (index: number) => void
  smartCut: boolean
  /** True when the whole video goes out as one clip instead of numbered parts. */
  single: boolean
}

export function PlanPanel(p: Props): JSX.Element {
  const total = p.parts.reduce((a, b) => a + b.duration, 0)
  const avg = p.parts.length ? total / p.parts.length : 0
  const snapped = p.parts.filter((x) => x.snappedEnd).length
  return (
    <Card
      title="3. Plan"
      subtitle={
        !p.parts.length
          ? 'Load a video to see the parts.'
          : p.single
            ? `One clip · ${formatTime(total)} · already short enough, exported whole`
            : `${p.parts.length} parts · average ${formatTime(avg)} · ${formatTime(total)} total`
      }
      right={
        p.single ? (
          <Pill tone="accent">Single clip</Pill>
        ) : p.smartCut && p.parts.length > 1 ? (
          <Pill tone={snapped ? 'ok' : 'muted'}>
            {snapped}/{p.parts.length - 1} cuts on pauses
          </Pill>
        ) : undefined
      }
      className="card-scroll"
    >
      <ol className="plan-list">
        {p.parts.map((part) => (
          <li key={part.index} className={part.index === p.selected ? 'active' : ''} onClick={() => p.onSelect(part.index)}>
            <span className="plan-index">{part.index}</span>
            <span className="mono">
              {formatTime(part.start, true)} → {formatTime(part.end, true)}
            </span>
            <span className="plan-dur mono">{formatTime(part.duration)}</span>
            <span className={`plan-snap ${part.snappedEnd ? 'on' : ''}`} title={part.snappedEnd ? 'Ends on a pause' : 'Ends at a fixed time'}>
              {part.snappedEnd ? '◆' : '◇'}
            </span>
          </li>
        ))}
      </ol>
    </Card>
  )
}
