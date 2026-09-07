import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AppInfo, ProgressEvent, RenderResult, Silence, SourceInfo, YtDlpStatus } from '@shared/types'
import { planParts } from '@shared/plan'
import { api } from './lib/api'
import { buildPartOverlays, ensureFonts } from './lib/overlays'
import { useSettings } from './hooks/useSettings'
import { SourcePanel } from './components/SourcePanel'
import { TrimPanel } from './components/TrimPanel'
import { PlanPanel } from './components/PlanPanel'
import { PreviewPanel, type Moment } from './components/PreviewPanel'
import { StylePanel } from './components/StylePanel'
import { ExportPanel } from './components/ExportPanel'
import { Button } from './components/ui'

type Phase = 'idle' | 'loading' | 'analyzing' | 'rendering'

function errorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  // Electron prefixes IPC errors with "Error invoking remote method 'x': Error: "
  return raw.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

export default function App(): JSX.Element {
  const [settings, update, reset] = useSettings()
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [ytdlp, setYtdlp] = useState<YtDlpStatus | null>(null)
  const [source, setSource] = useState<SourceInfo | null>(null)
  const [silences, setSilences] = useState<Silence[] | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState<ProgressEvent | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [renderResult, setRenderResult] = useState<RenderResult | null>(null)
  const [renderError, setRenderError] = useState<string | null>(null)
  const [hwEncoder, setHwEncoder] = useState<string | null | undefined>(undefined)

  const [selectedPart, setSelectedPart] = useState(1)
  const [moment, setMoment] = useState<Moment>('middle')
  const [preview, setPreview] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const previewSeq = useRef(0)
  const smokeStep = useRef<'idle' | 'loading' | 'rendering' | 'done'>('idle')

  // ---- boot ----
  useEffect(() => {
    api.getAppInfo().then((i) => {
      setInfo(i)
      if (!settings.outputDir) update({ outputDir: i.defaultOutputDir })
    })
    api.ytdlpStatus().then(setYtdlp)
    ensureFonts()
    return api.onProgress((e) => {
      setProgress(e)
      if (e.kind === 'ytdlp') api.ytdlpStatus().then(setYtdlp)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (settings.hardwareEncode && hwEncoder === undefined) api.detectEncoder().then(setHwEncoder)
  }, [settings.hardwareEncode, hwEncoder])

  // ---- plan ----
  const parts = useMemo(
    () =>
      source
        ? planParts({
            durationSec: source.durationSec,
            skipStartSec: settings.skipStartSec,
            skipEndSec: settings.skipEndSec,
            targetLengthSec: settings.targetLengthSec,
            maxLengthSec: settings.maxLengthSec,
            smartCut: settings.smartCut,
            silences: silences ?? undefined,
            searchWindowSec: settings.searchWindowSec
          })
        : [],
    [source, settings.skipStartSec, settings.skipEndSec, settings.targetLengthSec, settings.maxLengthSec, settings.smartCut, silences, settings.searchWindowSec]
  )

  useEffect(() => {
    if (selectedPart > parts.length) setSelectedPart(Math.max(1, parts.length))
  }, [parts.length, selectedPart])

  const busy = phase !== 'idle'

  // ---- source loading ----
  const analyze = useCallback(
    async (src: SourceInfo) => {
      if (!src.hasAudio || src.audioStreamIndex === undefined) return
      setPhase('analyzing')
      setProgress({ kind: 'analyze', percent: 0, message: 'Finding natural pauses…' })
      try {
        const found = await api.analyzeSilence(src.path, src.audioStreamIndex, src.durationSec)
        setSilences(found)
      } catch (err) {
        const msg = errorMessage(err)
        if (msg !== 'Cancelled') setError(msg)
      } finally {
        setPhase('idle')
      }
    },
    []
  )

  const afterLoad = useCallback(
    async (src: SourceInfo) => {
      setSource(src)
      setSilences(null)
      setRenderResult(null)
      setSelectedPart(1)
      setPreview(null)
      if (settings.smartCut) await analyze(src)
    },
    [analyze, settings.smartCut]
  )

  const loadLocal = useCallback(
    async (file: string) => {
      setError(null)
      setPhase('loading')
      setProgress({ kind: 'download', percent: 0, message: 'Reading file…' })
      try {
        const src = await api.loadLocal(file)
        setPhase('idle')
        await afterLoad(src)
      } catch (err) {
        setError(errorMessage(err))
        setPhase('idle')
      }
    },
    [afterLoad]
  )

  const loadYouTube = useCallback(
    async (url: string) => {
      setError(null)
      setPhase('loading')
      setProgress({ kind: 'download', percent: 0, message: 'Starting…' })
      try {
        const src = await api.loadYouTube(url, settings.cookiesBrowser)
        setPhase('idle')
        await afterLoad(src)
      } catch (err) {
        const msg = errorMessage(err)
        if (msg !== 'Cancelled') setError(msg)
        setPhase('idle')
      }
    },
    [afterLoad, settings.cookiesBrowser]
  )

  const cancel = useCallback(() => {
    api.cancel()
  }, [])

  const updateYtDlp = useCallback(async () => {
    setError(null)
    setPhase('loading')
    setProgress({ kind: 'ytdlp', percent: 0, message: 'Downloading yt-dlp…' })
    try {
      setYtdlp(await api.ytdlpInstall())
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setPhase('idle')
    }
  }, [])

  // ---- preview (debounced, latest request wins) ----
  const refreshPreview = useCallback(async () => {
    if (!source) return
    const part = parts.find((x) => x.index === selectedPart)
    if (!part) return
    const seq = ++previewSeq.current
    setPreviewLoading(true)
    setPreviewError(null)
    try {
      await ensureFonts()
      const overlays = buildPartOverlays(settings, part, parts.length, source.title)
      const offset = moment === 'start' ? Math.min(1, part.duration / 2) : moment === 'middle' ? part.duration / 2 : Math.max(0, part.duration - 1.5)
      const img = await api.renderPreview({ source, settings, part, overlays, offsetSec: offset })
      if (img && seq === previewSeq.current) setPreview(img)
    } catch (err) {
      const msg = errorMessage(err)
      if (seq === previewSeq.current && msg !== 'Cancelled') setPreviewError(msg)
    } finally {
      if (seq === previewSeq.current) setPreviewLoading(false)
    }
  }, [source, parts, selectedPart, settings, moment])

  const previewKey = useMemo(() => {
    const part = parts.find((x) => x.index === selectedPart)
    const { outputDir: _o, quality: _q, fpsMode: _f, hardwareEncode: _h, normalizeAudio: _n, cookiesBrowser: _c, ...look } = settings
    return JSON.stringify([source?.path, part?.start, part?.duration, parts.length, moment, look])
  }, [source, parts, selectedPart, settings, moment])

  useEffect(() => {
    if (!source || phase === 'rendering') return
    const t = setTimeout(refreshPreview, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey, phase === 'rendering'])

  // ---- render ----
  const render = useCallback(async () => {
    if (!source || !parts.length) return
    setError(null)
    setRenderError(null)
    setRenderResult(null)
    setPhase('rendering')
    setProgress({ kind: 'render', partIndex: 1, totalParts: parts.length, partPercent: 0, overallPercent: 0, message: 'Preparing…' })
    try {
      await ensureFonts()
      const overlays = parts.map((part) => buildPartOverlays(settings, part, parts.length, source.title))
      const res = await api.startRender({ source, settings, parts, overlays })
      setRenderResult(res)
    } catch (err) {
      const msg = errorMessage(err)
      if (msg !== 'Cancelled') setRenderError(msg)
    } finally {
      setPhase('idle')
    }
  }, [source, parts, settings])

  // ---- smoke test driver (MOVIETOSHORT_SMOKE_FILE): load -> analyze -> preview -> optional render ----
  useEffect(() => {
    const smoke = info?.smoke
    if (!smoke?.file || smokeStep.current !== 'idle') return
    smokeStep.current = 'loading'
    update({
      outputDir: smoke.outputDir || settings.outputDir || info!.defaultOutputDir,
      targetLengthSec: 15,
      titleEnabled: true,
      watermarkEnabled: true,
      quality: 'fast'
    })
    loadLocal(smoke.file)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info])

  useEffect(() => {
    const smoke = info?.smoke
    if (!smoke?.file || phase !== 'idle' || !preview) return
    if (smokeStep.current === 'loading') {
      if (smoke.render) {
        smokeStep.current = 'rendering'
        render()
      } else {
        smokeStep.current = 'done'
        api.smokeDone('preview ok')
      }
    } else if (smokeStep.current === 'rendering' && (renderResult || renderError)) {
      smokeStep.current = 'done'
      api.smokeDone(renderError ? `render failed: ${renderError}` : `rendered ${renderResult!.files.length} files to ${renderResult!.outputDir}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info, phase, preview, renderResult, renderError])

  const loadProgress = progress && (progress.kind === 'download' || progress.kind === 'ytdlp') ? progress : null
  const analyzeProgress = progress && progress.kind === 'analyze' ? progress : null
  const renderProgress = progress && progress.kind === 'render' ? progress : null

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden />
          <strong>MovieToShort</strong>
          <span className="muted small">{info ? `v${info.version}` : ''}</span>
        </div>
        <div className="row">
          {error && (
            <span className="error small ellipsis" title={error}>
              {error}
            </span>
          )}
          <Button size="sm" variant="ghost" onClick={reset} title="Reset all settings to defaults">
            Reset settings
          </Button>
          <Button size="sm" variant="ghost" onClick={() => api.openExternal('https://github.com/movietoshort/movietoshort')}>
            GitHub
          </Button>
        </div>
      </header>

      <main className="columns">
        <div className="column">
          <SourcePanel
            source={source}
            busy={busy}
            loading={phase === 'loading'}
            loadMessage={loadProgress?.message ?? ''}
            loadPercent={loadProgress?.percent ?? 0}
            cookiesBrowser={settings.cookiesBrowser}
            onCookiesChange={(v) => update({ cookiesBrowser: v })}
            onLoadYouTube={loadYouTube}
            onLoadLocal={loadLocal}
            onCancel={cancel}
            onAudioTrackChange={(index) => source && setSource({ ...source, audioStreamIndex: index })}
            ytdlp={ytdlp}
            onUpdateYtDlp={updateYtDlp}
          />
          <TrimPanel
            source={source}
            settings={settings}
            update={update}
            busy={busy}
            analyzing={phase === 'analyzing'}
            analyzePercent={analyzeProgress?.percent ?? 0}
            silenceCount={silences ? silences.length : null}
            onAnalyze={() => source && analyze(source)}
            onCancel={cancel}
          />
          <PlanPanel parts={parts} selected={selectedPart} onSelect={setSelectedPart} smartCut={settings.smartCut && silences !== null} />
        </div>

        <div className="column column-preview">
          <PreviewPanel
            parts={parts}
            selected={selectedPart}
            onSelect={setSelectedPart}
            moment={moment}
            onMoment={setMoment}
            image={preview}
            loading={previewLoading}
            error={previewError}
            onRefresh={refreshPreview}
            disabled={!source || phase === 'rendering'}
          />
        </div>

        <div className="column">
          <StylePanel settings={settings} update={update} disabled={phase === 'rendering'} sourceTitle={source?.title} />
          <ExportPanel
            settings={settings}
            update={update}
            disabled={!source || busy}
            partCount={parts.length}
            rendering={phase === 'rendering'}
            progress={renderProgress}
            result={renderResult}
            error={renderError}
            hwEncoder={settings.hardwareEncode ? hwEncoder : undefined}
            onRender={render}
            onCancel={cancel}
          />
        </div>
      </main>
    </div>
  )
}
