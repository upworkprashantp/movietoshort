import React, { useState } from 'react'
import type { CookiesBrowser, SourceInfo, YtDlpStatus } from '@shared/types'
import { formatTime } from '@shared/time'
import { api } from '../lib/api'
import { Button, Card, Field, Pill, ProgressBar, Select } from './ui'

interface Props {
  source: SourceInfo | null
  busy: boolean
  loading: boolean
  loadMessage: string
  loadPercent: number
  cookiesBrowser: CookiesBrowser
  onCookiesChange: (v: CookiesBrowser) => void
  onLoadYouTube: (url: string) => void
  onLoadLocal: (file: string) => void
  onCancel: () => void
  onAudioTrackChange: (index: number) => void
  ytdlp: YtDlpStatus | null
  onUpdateYtDlp: () => void
}

const VIDEO_EXT = /\.(mp4|mkv|mov|avi|webm|m4v|ts|mts|m2ts|wmv|flv|mpg|mpeg|3gp|ogv|vob)$/i

export function SourcePanel(p: Props): JSX.Element {
  const [tab, setTab] = useState<'youtube' | 'file'>('youtube')
  const [url, setUrl] = useState('')
  const [dragging, setDragging] = useState(false)

  const onDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    setDragging(false)
    const file = Array.from(e.dataTransfer.files).find((f) => VIDEO_EXT.test(f.name)) ?? e.dataTransfer.files[0]
    if (!file) return
    const path = api.getPathForFile(file)
    if (path) p.onLoadLocal(path)
  }

  const pick = async (): Promise<void> => {
    const file = await api.pickVideoFile()
    if (file) p.onLoadLocal(file)
  }

  return (
    <Card
      title="1. Source"
      subtitle="Paste a YouTube link or drop any video file."
      right={
        p.ytdlp && (
          <Pill tone={p.ytdlp.installed ? 'ok' : 'warn'}>
            {p.ytdlp.installed ? `yt-dlp ${p.ytdlp.version ?? ''}` : 'yt-dlp downloads on first use'}
          </Pill>
        )
      }
    >
      <div className="tabs">
        <button className={tab === 'youtube' ? 'active' : ''} onClick={() => setTab('youtube')} type="button">
          YouTube link
        </button>
        <button className={tab === 'file' ? 'active' : ''} onClick={() => setTab('file')} type="button">
          Local file
        </button>
      </div>

      {tab === 'youtube' ? (
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault()
            if (url.trim()) p.onLoadYouTube(url.trim())
          }}
        >
          <input
            className="input grow"
            placeholder="https://www.youtube.com/watch?v=…"
            value={url}
            disabled={p.busy}
            onChange={(e) => setUrl(e.target.value)}
            spellCheck={false}
          />
          <Button type="submit" variant="primary" disabled={p.busy || !url.trim()}>
            Load
          </Button>
        </form>
      ) : (
        <div
          className={`dropzone ${dragging ? 'dragging' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => !p.busy && pick()}
          role="button"
          tabIndex={0}
        >
          <strong>Drop a video here</strong>
          <span className="muted">or click to browse · MP4, MKV, MOV, AVI, WEBM, TS and anything ffmpeg can read</span>
        </div>
      )}

      {tab === 'youtube' && (
        <details className="details">
          <summary>Age-restricted or private video?</summary>
          <Field label="Use cookies from browser" hint="Lets yt-dlp use your logged-in session. Close the browser first on Windows.">
            <Select<CookiesBrowser>
              value={p.cookiesBrowser}
              onChange={p.onCookiesChange}
              disabled={p.busy}
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
            <Button size="sm" onClick={p.onUpdateYtDlp} disabled={p.busy}>
              Update yt-dlp
            </Button>
            <span className="muted small">YouTube changes often. If a link fails, update first.</span>
          </div>
        </details>
      )}

      {p.loading && (
        <div className="status">
          <div className="row space-between">
            <span>{p.loadMessage}</span>
            <Button size="sm" variant="ghost" onClick={p.onCancel}>
              Cancel
            </Button>
          </div>
          <ProgressBar percent={p.loadPercent} indeterminate={p.loadPercent <= 0} />
        </div>
      )}

      {p.source && !p.loading && (
        <div className="source-info">
          {p.source.thumbnail && <img className="thumb" src={p.source.thumbnail} alt="" />}
          <div className="source-meta">
            <strong className="ellipsis" title={p.source.title}>
              {p.source.title}
            </strong>
            <div className="meta-grid muted small">
              <span>{formatTime(p.source.durationSec, true)}</span>
              <span>
                {p.source.displayWidth}×{p.source.displayHeight}
              </span>
              <span>{p.source.fps} fps</span>
              <span>{p.source.videoCodec.toUpperCase()}</span>
              <span>{p.source.hasAudio ? (p.source.audioCodec ?? 'audio').toUpperCase() : 'no audio'}</span>
              <span>{p.source.origin === 'youtube' ? 'YouTube' : 'Local'}</span>
            </div>
            {p.source.audioTracks.length > 1 && (
              <Field label="Audio track" inline>
                <Select
                  value={String(p.source.audioStreamIndex ?? p.source.audioTracks[0].index)}
                  onChange={(v) => p.onAudioTrackChange(Number(v))}
                  disabled={p.busy}
                  options={p.source.audioTracks.map((t) => ({ value: String(t.index), label: t.label }))}
                />
              </Field>
            )}
            {!p.source.hasAudio && <Pill tone="warn">This video has no audio track.</Pill>}
          </div>
        </div>
      )}
    </Card>
  )
}
