import React, { useState } from 'react'
import type { CookiesBrowser, Settings, YtDlpStatus } from '@shared/types'
import type { OutputSize } from '@shared/output'
import { formatTime } from '@shared/time'
import { api } from '../lib/api'
import type { ClipItem, Clips } from '../hooks/useClips'
import { Button, Card, Field, Pill, ProgressBar, Select } from './ui'

const VIDEO_EXT = /\.(mp4|mkv|mov|avi|webm|m4v|ts|mts|m2ts|wmv|flv|mpg|mpeg|3gp|ogv|vob)$/i

interface ClipsProps {
  clips: Clips
  /** A render is running: the list is frozen. */
  disabled: boolean
  loadMessage: string
  loadPercent: number
  selectedId: string | null
  onSelect: (id: string) => void
  cookiesBrowser: CookiesBrowser
  onCookiesChange: (v: CookiesBrowser) => void
  cookiesFile: string
  onCookiesFileChange: (v: string) => void
  ytdlp: YtDlpStatus | null
  onUpdateYtDlp: () => void
}

function describe(it: ClipItem): string {
  const s = it.source
  if (!s) return it.input
  const where = s.origin === 'link' ? (s.site ?? 'Link') : 'File'
  return `${formatTime(s.durationSec)} · ${s.displayWidth}×${s.displayHeight} · ${s.hasAudio ? 'sound' : 'no sound'} · ${where}`
}

export function ClipsPanel(p: ClipsProps): JSX.Element {
  const { clips } = p
  const [text, setText] = useState('')
  const [dragging, setDragging] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const frozen = p.disabled

  const addLinks = (): void => {
    const n = clips.addLinks(text)
    setNote(n ? null : 'No links found. Paste full addresses starting with http:// or https://')
    if (n) setText('')
  }

  const onDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    setDragging(false)
    if (frozen) return
    const files = Array.from(e.dataTransfer.files)
      .filter((f) => VIDEO_EXT.test(f.name))
      .map((f) => api.getPathForFile(f))
      .filter(Boolean)
    if (files.length) clips.addFiles(files)
    else {
      const dropped = e.dataTransfer.getData('text')
      if (dropped) clips.addLinks(dropped)
    }
  }

  const stopped = clips.items.some((it) => it.status === 'error' && it.error === 'Stopped')
  const waiting = clips.items.some((it) => it.status === 'queued')

  return (
    <Card
      title="1. Clips"
      subtitle="Paste links (one per line) or add video files. They play in this order."
      right={
        <div className="row">
          {p.ytdlp && <Pill tone={p.ytdlp.installed ? 'ok' : 'warn'}>{p.ytdlp.installed ? `yt-dlp ${p.ytdlp.version ?? ''}` : 'yt-dlp downloads on first use'}</Pill>}
          {clips.items.length > 0 && (
            <Button size="sm" variant="ghost" disabled={frozen} onClick={clips.clear} title="Remove every clip from the list">
              ✕ Clear all
            </Button>
          )}
        </div>
      }
    >
      <textarea
        className="input"
        rows={3}
        placeholder={'https://www.instagram.com/reel/…\nhttps://www.tiktok.com/@user/video/…\nhttps://youtube.com/shorts/…'}
        value={text}
        disabled={frozen}
        spellCheck={false}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) addLinks()
        }}
      />
      <div className="row wrap">
        <Button variant="primary" size="sm" disabled={frozen || !text.trim()} onClick={addLinks} title="Ctrl+Enter">
          Add links
        </Button>
        <Button
          size="sm"
          disabled={frozen}
          onClick={async () => {
            const files = await api.pickVideoFiles()
            clips.addFiles(files)
          }}
        >
          Add files…
        </Button>
        {clips.loading && (
          <Button size="sm" variant="ghost" onClick={clips.stop}>
            Stop downloading
          </Button>
        )}
        {!clips.loading && (stopped || (clips.paused && waiting)) && (
          <Button size="sm" variant="ghost" onClick={clips.resume}>
            Resume
          </Button>
        )}
      </div>
      {note && <p className="error small">{note}</p>}

      <div
        className={`dropzone compact ${dragging ? 'dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <span className="muted small">Drop video files or links here</span>
      </div>

      <details className="details">
        <summary>Login required, age-restricted or private?</summary>
        <Field label="Cookies file (recommended)" hint="Export with the “Get cookies.txt LOCALLY” extension while logged into the site.">
          <div className="row">
            <input className="input grow small" value={p.cookiesFile} readOnly placeholder="No file chosen" title={p.cookiesFile} />
            <Button
              size="sm"
              disabled={frozen}
              onClick={async () => {
                const f = await api.pickCookiesFile()
                if (f) p.onCookiesFileChange(f)
              }}
            >
              Choose…
            </Button>
            {p.cookiesFile && (
              <Button size="sm" variant="ghost" disabled={frozen} onClick={() => p.onCookiesFileChange('')}>
                Clear
              </Button>
            )}
          </div>
        </Field>
        <Field label="Or read cookies from a browser" hint="Firefox works best.">
          <Select<CookiesBrowser>
            value={p.cookiesBrowser}
            onChange={p.onCookiesChange}
            disabled={frozen}
            options={[
              { value: 'none', label: 'None' },
              { value: 'chrome', label: 'Chrome' },
              { value: 'edge', label: 'Edge' },
              { value: 'firefox', label: 'Firefox' },
              { value: 'brave', label: 'Brave' },
              { value: 'safari', label: 'Safari (macOS)' }
            ]}
          />
        </Field>
        <div className="row">
          <Button size="sm" onClick={p.onUpdateYtDlp} disabled={frozen || clips.loading}>
            Update yt-dlp
          </Button>
          <span className="muted small">Sites change often. If links stop working, update first.</span>
        </div>
      </details>

      {clips.items.length > 0 && (
        <ol className="clip-list">
          {clips.items.map((it, i) => {
            const selectable = it.status === 'ready'
            const cls = ['clip-row', selectable ? 'selectable' : '', it.id === p.selectedId ? 'active' : '', it.status === 'error' ? 'error' : '']
            return (
              <li key={it.id} className={cls.join(' ')} onClick={() => selectable && p.onSelect(it.id)}>
                <span className="plan-index">{i + 1}</span>
                {it.source?.thumbnail ? (
                  <img className="clip-thumb" src={it.source.thumbnail} alt="" />
                ) : (
                  <span className="clip-thumb">{it.status === 'loading' ? '…' : it.kind === 'url' ? 'link' : 'file'}</span>
                )}
                <div className="clip-main">
                  <strong className="ellipsis small" title={it.source?.title ?? it.input}>
                    {it.source?.title ?? it.input}
                  </strong>
                  {it.status === 'ready' && (
                    <span className="muted small ellipsis" title={describe(it)}>
                      {describe(it)}
                    </span>
                  )}
                  {it.status === 'queued' && <span className="muted small">Waiting</span>}
                  {it.status === 'loading' && (
                    <>
                      <span className="muted small ellipsis">{p.loadMessage || 'Starting…'}</span>
                      <ProgressBar percent={p.loadPercent} indeterminate={p.loadPercent <= 0} />
                    </>
                  )}
                  {it.status === 'error' && (
                    <span className="error small ellipsis" title={it.error}>
                      {it.error}
                    </span>
                  )}
                </div>
                <div className="clip-actions" onClick={(e) => e.stopPropagation()}>
                  {it.status === 'error' && (
                    <Button size="sm" variant="ghost" disabled={frozen} onClick={() => clips.retry(it.id)} title="Try again">
                      ↻
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" disabled={frozen || i === 0} onClick={() => clips.move(it.id, -1)} title="Move up">
                    ↑
                  </Button>
                  <Button size="sm" variant="ghost" disabled={frozen || i === clips.items.length - 1} onClick={() => clips.move(it.id, 1)} title="Move down">
                    ↓
                  </Button>
                  <Button size="sm" variant="ghost" disabled={frozen} onClick={() => clips.remove(it.id)} title="Remove">
                    ✕
                  </Button>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </Card>
  )
}

interface SummaryProps {
  settings: Settings
  update: (patch: Partial<Settings>) => void
  disabled: boolean
  readyCount: number
  failedCount: number
  pendingCount: number
  total: number
  frame: OutputSize | null
}

export function CombineSummary(p: SummaryProps): JSX.Element {
  return (
    <Card title="2. Combine" subtitle="One video, clip after clip, with your branding on top.">
      <Field label="Name" hint="Used for the folder and the file">
        <input className="input" value={p.settings.combineName} disabled={p.disabled} onChange={(e) => p.update({ combineName: e.target.value })} />
      </Field>
      {p.readyCount > 0 ? (
        <p className="muted small">
          {p.readyCount} clip{p.readyCount === 1 ? '' : 's'} · {formatTime(p.total, p.total >= 3600)} total
          {p.frame ? ` · ${p.frame.width}×${p.frame.height}${p.frame.keptSource ? ', their own shape' : ', vertical canvas'}` : ''}
        </p>
      ) : (
        <p className="muted small">Add clips to see the total length.</p>
      )}
      <div className="row wrap">
        {p.pendingCount > 0 && <Pill tone="muted">{p.pendingCount} still loading</Pill>}
        {p.failedCount > 0 && <Pill tone="warn">{p.failedCount} failed, will be left out</Pill>}
        {p.total > 180 && <Pill tone="warn">Over 3 min: fine for YouTube and Facebook, too long for Shorts and Reels</Pill>}
      </div>
    </Card>
  )
}
