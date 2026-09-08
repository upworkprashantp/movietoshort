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
  cookiesFile: string
  onCookiesFileChange: (v: string) => void
  onLoadUrl: (url: string) => void
  onLoadLocal: (file: string) => void
  onCancel: () => void
  onAudioTrackChange: (index: number) => void
  ytdlp: YtDlpStatus | null
  onUpdateYtDlp: () => void
  /** Forget the current video so the next one can be loaded. Settings are kept. */
  onClear: () => void
}

const VIDEO_EXT = /\.(mp4|mkv|mov|avi|webm|m4v|ts|mts|m2ts|wmv|flv|mpg|mpeg|3gp|ogv|vob)$/i

export function SourcePanel(p: Props): JSX.Element {
  const [tab, setTab] = useState<'link' | 'file'>('link')
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
      subtitle="Paste a video link from 1,000+ sites, or drop any video file."
      right={
        <div className="row">
          {p.ytdlp && (
            <Pill tone={p.ytdlp.installed ? 'ok' : 'warn'}>
              {p.ytdlp.installed ? `yt-dlp ${p.ytdlp.version ?? ''}` : 'yt-dlp downloads on first use'}
            </Pill>
          )}
          {(p.source || url) && (
            <Button
              size="sm"
              variant="ghost"
              disabled={p.busy}
              title="Clear the current video and start with a new one (settings are kept)"
              onClick={() => {
                setUrl('')
                p.onClear()
              }}
            >
              ✕ New video
            </Button>
          )}
        </div>
      }
    >
      <div className="tabs">
        <button className={tab === 'link' ? 'active' : ''} onClick={() => setTab('link')} type="button">
          Video link
        </button>
        <button className={tab === 'file' ? 'active' : ''} onClick={() => setTab('file')} type="button">
          Local file
        </button>
      </div>

      {tab === 'link' ? (
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault()
            if (url.trim()) p.onLoadUrl(url.trim())
          }}
        >
          <input
            className="input grow"
            placeholder="YouTube, Vimeo, TikTok, X, Instagram, Facebook, Twitch, Dailymotion, Reddit…"
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

      {tab === 'link' && (
        <p className="muted small">
          Any public video page that{' '}
          <a href="#" onClick={(e) => { e.preventDefault(); api.openExternal('https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md') }}>
            yt-dlp supports
          </a>{' '}
          works: YouTube, Vimeo, TikTok, X/Twitter, Instagram, Facebook, Twitch VODs, Dailymotion, Reddit, Rumble, Bilibili and 1,000+ more.
          Use your own videos, or ones you have permission to cut.
        </p>
      )}

      {tab === 'link' && (
        <details className="details">
          <summary>Login required, age-restricted or private?</summary>
          <Field
            label="Cookies file (recommended)"
            hint="Install the “Get cookies.txt LOCALLY” extension, export while logged into the site, then choose the file."
          >
            <div className="row">
              <input className="input grow small" value={p.cookiesFile} readOnly placeholder="No file chosen" title={p.cookiesFile} />
              <Button
                size="sm"
                disabled={p.busy}
                onClick={async () => {
                  const f = await api.pickCookiesFile()
                  if (f) p.onCookiesFileChange(f)
                }}
              >
                Choose…
              </Button>
              {p.cookiesFile && (
                <Button size="sm" variant="ghost" disabled={p.busy} onClick={() => p.onCookiesFileChange('')}>
                  Clear
                </Button>
              )}
            </div>
          </Field>
          <Field label="Or read cookies from a browser" hint="Firefox works best. Chrome and Edge must be closed and often block this on Windows.">
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
            <span className="muted small">Sites change often. If a link stops working, update first.</span>
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
              <span>{p.source.origin === 'link' ? (p.source.site ?? 'Link') : 'Local file'}</span>
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
