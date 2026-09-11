import React from 'react'
import type { AppMode } from '@shared/types'

const MODES: Array<{ value: AppMode; label: string; hint: string }> = [
  { value: 'split', label: 'Split', hint: 'One long video into numbered shorts' },
  { value: 'highlights', label: 'Highlights', hint: 'One long video into a short silent recap of quick snippets' },
  { value: 'combine', label: 'Combine', hint: 'Many clips or links into one longer video, or download them all' }
]

export function ModeTabs({
  value,
  onChange,
  disabled
}: {
  value: AppMode
  onChange: (m: AppMode) => void
  disabled?: boolean
}): JSX.Element {
  return (
    <nav className="mode-tabs" role="tablist" aria-label="What to make">
      {MODES.map((m) => (
        <button
          key={m.value}
          type="button"
          role="tab"
          aria-selected={m.value === value}
          className={m.value === value ? 'active' : ''}
          title={disabled && m.value !== value ? 'Finish or cancel the current job first' : m.hint}
          disabled={disabled && m.value !== value}
          onClick={() => onChange(m.value)}
        >
          {m.label}
        </button>
      ))}
    </nav>
  )
}
