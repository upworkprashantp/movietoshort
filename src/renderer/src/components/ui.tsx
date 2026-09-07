import React, { useEffect, useState } from 'react'
import { formatTime, parseTime } from '@shared/time'

export function Card({
  title,
  subtitle,
  right,
  children,
  className
}: {
  title: string
  subtitle?: string
  right?: React.ReactNode
  children: React.ReactNode
  className?: string
}): JSX.Element {
  return (
    <section className={`card ${className ?? ''}`}>
      <header className="card-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p className="muted">{subtitle}</p>}
        </div>
        {right}
      </header>
      <div className="card-body">{children}</div>
    </section>
  )
}

export function Field({
  label,
  hint,
  children,
  inline
}: {
  label: string
  hint?: string
  children: React.ReactNode
  inline?: boolean
}): JSX.Element {
  return (
    <label className={`field ${inline ? 'field-inline' : ''}`}>
      <span className="field-label">
        {label}
        {hint && <small className="muted">{hint}</small>}
      </span>
      {children}
    </label>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint?: string
  disabled?: boolean
}): JSX.Element {
  return (
    <label className={`toggle ${disabled ? 'disabled' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track">
        <span className="toggle-thumb" />
      </span>
      <span className="toggle-text">
        {label}
        {hint && <small className="muted">{hint}</small>}
      </span>
    </label>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  disabled
}: {
  value: T
  options: Array<{ value: T; label: string; title?: string }>
  onChange: (v: T) => void
  disabled?: boolean
}): JSX.Element {
  return (
    <div className={`segmented ${disabled ? 'disabled' : ''}`} role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'active' : ''}
          title={o.title}
          disabled={disabled}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  disabled
}: {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (v: T) => void
  disabled?: boolean
}): JSX.Element {
  return (
    <select className="select" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

/** Text input that accepts "90", "1:30" or "1:02:03" and reports seconds when valid. */
export function TimeInput({
  value,
  onChange,
  disabled,
  placeholder
}: {
  value: number
  onChange: (sec: number) => void
  disabled?: boolean
  placeholder?: string
}): JSX.Element {
  const [text, setText] = useState(formatTime(value))
  const [invalid, setInvalid] = useState(false)
  useEffect(() => {
    setText(formatTime(value))
    setInvalid(false)
  }, [value])
  return (
    <input
      className={`input mono ${invalid ? 'invalid' : ''}`}
      value={text}
      disabled={disabled}
      placeholder={placeholder ?? '0:00'}
      onChange={(e) => {
        setText(e.target.value)
        const sec = parseTime(e.target.value)
        setInvalid(Number.isNaN(sec))
      }}
      onBlur={() => {
        const sec = parseTime(text)
        if (Number.isNaN(sec)) {
          setText(formatTime(value))
          setInvalid(false)
        } else onChange(sec)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      }}
    />
  )
}

export function Slider({
  value,
  min,
  max,
  step,
  onChange,
  format,
  disabled
}: {
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  format?: (v: number) => string
  disabled?: boolean
}): JSX.Element {
  return (
    <div className="slider">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="mono slider-value">{format ? format(value) : value}</span>
    </div>
  )
}

export function ColorInput({
  value,
  onChange,
  disabled
}: {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}): JSX.Element {
  return (
    <span className="color-input">
      <input type="color" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      <span className="mono">{value.toUpperCase()}</span>
    </span>
  )
}

export function Button({
  children,
  onClick,
  variant = 'default',
  disabled,
  title,
  size,
  type = 'button'
}: {
  children: React.ReactNode
  onClick?: () => void
  variant?: 'default' | 'primary' | 'danger' | 'ghost'
  disabled?: boolean
  title?: string
  size?: 'sm' | 'lg'
  type?: 'button' | 'submit'
}): JSX.Element {
  return (
    <button type={type} className={`btn btn-${variant} ${size ? `btn-${size}` : ''}`} onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  )
}

export function ProgressBar({ percent, indeterminate }: { percent: number; indeterminate?: boolean }): JSX.Element {
  return (
    <div className={`progress ${indeterminate ? 'indeterminate' : ''}`}>
      <div className="progress-fill" style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
    </div>
  )
}

export function Pill({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'ok' | 'warn' | 'accent' }): JSX.Element {
  return <span className={`pill pill-${tone}`}>{children}</span>
}
