import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  AppInfo,
  AppMode,
  PartPlan,
  PreviewRequest,
  ProgressEvent,
  RenderJob,
  RenderResult,
  Silence,
  SourceInfo,
  YtDlpStatus
} from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/types'
import { planParts } from '@shared/plan'
import { combineFrame, outputSize } from '@shared/output'
import { combineTimeline, highlightsLength, planHighlights, segmentFps } from '@shared/highlights'
import { formatTime } from '@shared/time'
import { api } from './lib/api'
import { errorMessage } from './lib/errors'
import { buildPartOverlays, ensureFonts } from './lib/overlays'
import { useSettings } from './hooks/useSettings'
import { useClips } from './hooks/useClips'
import { ModeTabs } from './components/ModeTabs'
import { SourcePanel } from './components/SourcePanel'
import { TrimPanel } from './components/TrimPanel'
import { PlanPanel } from './components/PlanPanel'
import { HighlightsPanel } from './components/HighlightsPanel'
import { ClipsPanel, CombineSummary } from './components/ClipsPanel'
import { PreviewPanel, type Moment } from './components/PreviewPanel'
import { StylePanel } from './components/StylePanel'
import { ExportPanel } from './components/ExportPanel'
import { Button } from './components/ui'

type Phase = 'idle' | 'loading' | 'analyzing' | 'rendering'

/** A whole-timeline "part" for exports that come out as one file. */
function wholePart(total: number): PartPlan {
  return { index: 1, start: 0, end: total, duration: total, snappedStart: false, snappedEnd: false }
}

/** Where inside a piece of `d` seconds to grab the preview frame. */
function localOffset(moment: Moment, d: number): number {
  if (moment === 'start') return Math.min(0.4, d / 2)
  if (moment === 'middle') return d / 2
  return Math.max(0, d - 0.15)
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

export default function App(): JSX.Element {
  const [settings, update, reset] = useSettings()
  const mode: AppMode = settings.mode
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
  const [selectedSnippet, setSelectedSnippet] = useState(1)
  const [selectedClip, setSelectedClip] = useState(1)
  const [moment, setMoment] = useState<Moment>('middle')
  const [preview, setPreview] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const previewSeq = useRef(0)
  const smokeStep = useRef<'idle' | 'loading' | 'rendering' | 'done'>('idle')

  const auth = useMemo(
    () => ({ browser: settings.cookiesBrowser, file: settings.cookiesFile || undefined }),
    [settings.cookiesBrowser, settings.cookiesFile]
  )
  const clips = useClips(auth)

  // ---- boot ----
  useEffect(() => {
    api.getAppInfo().then((i) => {
      setInfo(i)
      document.body.classList.add(`platform-${i.platform}`)
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

  // ---- split: frame and plan ----
  const frame = useMemo(
    () => (source ? outputSize(source.displayWidth, source.displayHeight, settings.sizeMode) : null),
    [source, settings.sizeMode]
  )

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
            singleClip: settings.outputMode === 'single',
            silences: silences ?? undefined,
            searchWindowSec: settings.searchWindowSec
          })
        : [],
    [source, settings.outputMode, settings.skipStartSec, settings.skipEndSec, settings.targetLengthSec, settings.maxLengthSec, settings.smartCut, silences, settings.searchWindowSec]
  )

  /** One clip: either forced, or the trimmed range already fits in a single short. */
  const single = settings.outputMode !== 'split' && parts.length === 1

  // ---- highlights: snippets ----
  const highlightFps = source ? segmentFps(source.fps, settings.fpsMode) : 30
  const segments = useMemo(
    () =>
      source
        ? planHighlights({
            durationSec: source.durationSec,
            skipStartSec: settings.skipStartSec,
            skipEndSec: settings.skipEndSec,
            targetSec: settings.highlightTargetSec,
            clipSec: settings.highlightClipSec,
            fps: highlightFps
          })
        : [],
    [source, settings.skipStartSec, settings.skipEndSec, settings.highlightTargetSec, settings.highlightClipSec, highlightFps]
  )
  const recapTotal = highlightsLength(segments)

  // ---- combine: ready clips laid end to end ----
  const readyItems = useMemo(() => clips.items.filter((it) => it.status === 'ready' && it.source), [clips.items])
  const readyClips = useMemo(() => readyItems.map((it) => it.source!), [readyItems])
  const combineFps = readyClips[0] ? segmentFps(readyClips[0].fps, settings.fpsMode) : 30
  const timeline = useMemo(() => combineTimeline(readyClips.map((c) => c.durationSec), combineFps), [readyClips, combineFps])
  const combinedFrame = useMemo(
    () => (readyClips.length ? combineFrame(readyClips.map((c) => ({ width: c.displayWidth, height: c.displayHeight })), settings.sizeMode) : null),
    [readyClips, settings.sizeMode]
  )
  const selectedClipId = timeline.items[selectedClip - 1] ? readyItems[timeline.items[selectedClip - 1].index]?.id ?? null : null

  // Keep selections in range as plans change.
  useEffect(() => {
    if (selectedPart > parts.length) setSelectedPart(Math.max(1, parts.length))
  }, [parts.length, selectedPart])
  useEffect(() => {
    if (selectedSnippet > segments.length) setSelectedSnippet(Math.max(1, segments.length))
  }, [segments.length, selectedSnippet])
  useEffect(() => {
    if (selectedClip > timeline.items.length) setSelectedClip(Math.max(1, timeline.items.length))
  }, [timeline.items.length, selectedClip])

  const busy = phase !== 'idle' || clips.loading

  // ---- source loading (split and highlights) ----
  const analyze = useCallback(async (src: SourceInfo) => {
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
  }, [])

  const afterLoad = useCallback(
    async (src: SourceInfo) => {
      setSource(src)
      setSilences(null)
      setRenderResult(null)
      setSelectedPart(1)
      setSelectedSnippet(1)
      setPreview(null)
      // Pause detection only matters when splitting.
      if (settings.mode === 'split' && settings.smartCut) await analyze(src)
    },
    [analyze, settings.mode, settings.smartCut]
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

  const loadUrl = useCallback(
    async (url: string) => {
      setError(null)
      setPhase('loading')
      setProgress({ kind: 'download', percent: 0, message: 'Starting…' })
      try {
        const src = await api.loadUrl(url, auth)
        setPhase('idle')
        await afterLoad(src)
      } catch (err) {
        const msg = errorMessage(err)
        if (msg !== 'Cancelled') setError(msg)
        setPhase('idle')
      }
    },
    [afterLoad, auth]
  )

  const cancel = useCallback(() => {
    api.cancel()
  }, [])

  /** Back to the empty state for the next video. Settings (look, output folder, cookies) stay. */
  const clearSource = useCallback(() => {
    api.cancel()
    previewSeq.current++
    setSource(null)
    setSilences(null)
    setPreview(null)
    setPreviewLoading(false)
    setPreviewError(null)
    setRenderResult(null)
    setRenderError(null)
    setError(null)
    setProgress(null)
    setSelectedPart(1)
    setSelectedSnippet(1)
    setPhase('idle')
  }, [])

  const switchMode = useCallback(
    (next: AppMode) => {
      if (next === settings.mode) return
      previewSeq.current++
      update({ mode: next })
      setPreview(null)
      setPreviewError(null)
      setRenderResult(null)
      setRenderError(null)
      setError(null)
    },
    [settings.mode, update]
  )

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

  // ---- preview: one request builder for all three modes ----
  const buildPreview = useCallback((): PreviewRequest | null => {
    if (mode === 'split') {
      const part = parts.find((x) => x.index === selectedPart)
      if (!source || !part) return null
      const overlays = buildPartOverlays(settings, part, parts.length, source.title, frame ?? undefined, single)
      const offset = moment === 'start' ? Math.min(1, part.duration / 2) : moment === 'middle' ? part.duration / 2 : Math.max(0, part.duration - 1.5)
      return { source, settings, part, overlays, offsetSec: offset }
    }
    if (mode === 'highlights') {
      const seg = segments[selectedSnippet - 1]
      if (!source || !seg) return null
      const part = wholePart(recapTotal)
      const local = localOffset(moment, seg.duration)
      const overlays = buildPartOverlays(settings, part, 1, source.title, frame ?? undefined, true)
      return { source, settings, part, overlays, offsetSec: seg.at + local, sourceTimeSec: seg.start + local }
    }
    const item = timeline.items[selectedClip - 1]
    const clip = item ? readyClips[item.index] : undefined
    if (!item || !clip || !combinedFrame) return null
    const part = wholePart(timeline.total)
    const local = localOffset(moment, item.duration)
    const overlays = buildPartOverlays(settings, part, 1, settings.combineName, combinedFrame, true)
    return {
      source: clip,
      settings,
      part,
      overlays,
      offsetSec: item.at + local,
      sourceTimeSec: local,
      outSize: { width: combinedFrame.width, height: combinedFrame.height }
    }
  }, [mode, parts, selectedPart, source, settings, frame, single, moment, segments, selectedSnippet, recapTotal, timeline, selectedClip, readyClips, combinedFrame])

  const refreshPreview = useCallback(async () => {
    const seq = ++previewSeq.current
    await ensureFonts()
    const req = buildPreview()
    if (!req) return
    setPreviewLoading(true)
    setPreviewError(null)
    try {
      const img = await api.renderPreview(req)
      if (img && seq === previewSeq.current) setPreview(img)
    } catch (err) {
      const msg = errorMessage(err)
      if (seq === previewSeq.current && msg !== 'Cancelled') setPreviewError(msg)
    } finally {
      if (seq === previewSeq.current) setPreviewLoading(false)
    }
  }, [buildPreview])

  const previewKey = useMemo(() => {
    const { outputDir: _o, quality: _q, fpsMode: _f, hardwareEncode: _h, normalizeAudio: _n, cookiesBrowser: _c, cookiesFile: _cf, saveFullVideo: _sf, keepOriginal: _ko, ...look } = settings
    const target =
      mode === 'split'
        ? [source?.path, parts.find((x) => x.index === selectedPart), parts.length]
        : mode === 'highlights'
          ? [source?.path, segments[selectedSnippet - 1], recapTotal]
          : [readyClips.map((c) => c.path), timeline.items[selectedClip - 1], timeline.total, combinedFrame?.width, combinedFrame?.height]
    return JSON.stringify([mode, target, moment, look])
  }, [settings, mode, source, parts, selectedPart, segments, selectedSnippet, recapTotal, readyClips, timeline, selectedClip, combinedFrame, moment])

  const hasPreviewTarget = mode === 'combine' ? timeline.items.length > 0 : !!source
  useEffect(() => {
    if (!hasPreviewTarget || phase === 'rendering') return
    const t = setTimeout(refreshPreview, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey, hasPreviewTarget, phase === 'rendering'])

  // ---- render ----
  const runRender = useCallback(
    async (label: string, job: () => Promise<RenderResult>) => {
      setError(null)
      setRenderError(null)
      setRenderResult(null)
      setPhase('rendering')
      setProgress({ kind: 'render', partIndex: 1, totalParts: 1, partPercent: 0, overallPercent: 0, message: label })
      try {
        await ensureFonts()
        setRenderResult(await job())
      } catch (err) {
        const msg = errorMessage(err)
        if (msg !== 'Cancelled') setRenderError(msg)
      } finally {
        setPhase('idle')
      }
    },
    []
  )

  const render = useCallback(() => {
    if (mode === 'split') {
      if (!source || !parts.length) return
      return runRender('Preparing…', () => {
        const overlays = parts.map((part) => buildPartOverlays(settings, part, parts.length, source.title, frame ?? undefined, single))
        let full: RenderJob['full']
        if (settings.saveFullVideo) {
          const start = parts[0].start
          const end = parts[parts.length - 1].end
          const fullPart = { index: 1, start, end, duration: Math.round((end - start) * 1000) / 1000, snappedStart: false, snappedEnd: false }
          // Same look as the parts, minus the part badge and the next-part teaser.
          full = { part: fullPart, overlays: buildPartOverlays({ ...settings, teaserEnabled: false }, fullPart, 1, source.title, frame ?? undefined, true) }
        }
        return api.startRender({ source, settings, parts, overlays, full })
      })
    }
    if (mode === 'highlights') {
      if (!source || !segments.length) return
      return runRender('Cutting snippets…', () =>
        api.renderHighlights({
          source,
          settings,
          segments,
          fps: highlightFps,
          overlays: buildPartOverlays(settings, wholePart(recapTotal), 1, source.title, frame ?? undefined, true)
        })
      )
    }
    if (!timeline.items.length || !combinedFrame) return
    return runRender('Preparing clips…', () =>
      api.renderCombine({
        clips: readyClips,
        settings,
        fps: combineFps,
        frame: { width: combinedFrame.width, height: combinedFrame.height },
        overlays: buildPartOverlays(settings, wholePart(timeline.total), 1, settings.combineName, combinedFrame, true)
      })
    )
  }, [mode, source, parts, settings, frame, single, segments, highlightFps, recapTotal, timeline, combinedFrame, readyClips, combineFps, runRender])

  const saveClipsOnly = useCallback(() => {
    if (!readyClips.length) return
    return runRender('Saving clips…', async () => {
      const saved = await api.saveCopies(
        readyClips.map((c) => ({ path: c.path, title: c.title })),
        settings.outputDir,
        settings.combineName
      )
      return { outputDir: saved.outputDir, files: saved.files, cancelled: false }
    })
  }, [readyClips, settings.outputDir, settings.combineName, runRender])

  // ---- smoke test driver (see README) ----
  useEffect(() => {
    const smoke = info?.smoke
    if (!smoke || smokeStep.current !== 'idle') return
    const base = { ...DEFAULT_SETTINGS, outputDir: smoke.outputDir || info!.defaultOutputDir, watermarkEnabled: true, quality: 'fast' as const }
    if (smoke.mode === 'combine' && smoke.files?.length) {
      smokeStep.current = 'loading'
      update({ ...base, mode: 'combine', combineName: 'Smoke Combine' })
      clips.addFiles(smoke.files)
    } else if (smoke.file) {
      smokeStep.current = 'loading'
      if (smoke.mode === 'highlights') {
        update({ ...base, mode: 'highlights', highlightTargetSec: 12, highlightClipSec: 1.5 })
      } else {
        update({ ...base, mode: 'split', targetLengthSec: 15, outputMode: smoke.single ? 'single' : 'auto', saveFullVideo: true })
      }
      loadLocal(smoke.file)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info])

  useEffect(() => {
    const smoke = info?.smoke
    if (!smoke || phase !== 'idle') return
    // A load that failed never produces a preview: report it now instead of waiting for the timeout.
    const noClipsLoaded =
      smoke.mode === 'combine' &&
      clips.items.length > 0 &&
      !clips.loading &&
      !clips.items.some((it) => it.status === 'queued' || it.status === 'ready')
    if (smokeStep.current === 'loading' && (error || noClipsLoaded)) {
      smokeStep.current = 'done'
      api.smokeDone(`load failed: ${error ?? clips.items.map((it) => it.error).join('; ')}`)
      return
    }
    if (!preview) return
    if (smoke.mode === 'combine' && (clips.loading || clips.items.some((it) => it.status === 'queued'))) return
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
  }, [info, phase, preview, renderResult, renderError, error, clips.loading, clips.items])

  // ---- view model ----
  const loadProgress = progress && (progress.kind === 'download' || progress.kind === 'ytdlp') ? progress : null
  const analyzeProgress = progress && progress.kind === 'analyze' ? progress : null
  const renderProgress = progress && progress.kind === 'render' ? progress : null

  const view = (() => {
    if (mode === 'split') {
      const part = parts.find((x) => x.index === selectedPart)
      return {
        count: parts.length,
        selected: selectedPart,
        onSelect: setSelectedPart,
        noun: 'Part',
        subtitle: part ? `Part ${part.index} · ${formatTime(part.start, true)} → ${formatTime(part.end, true)}` : undefined,
        endLabel: 'Last 3s',
        endHint: 'Shows the next-part teaser',
        canRender: !!source && parts.length > 0,
        renderLabel: parts.length ? `Render ${plural(parts.length, 'short')}${settings.saveFullVideo ? ' + full video' : ''}` : 'Render',
        itemCount: parts.length,
        styleFrame: frame,
        styleSingle: single,
        styleTitle: source?.title
      }
    }
    if (mode === 'highlights') {
      const seg = segments[selectedSnippet - 1]
      return {
        count: segments.length,
        selected: selectedSnippet,
        onSelect: setSelectedSnippet,
        noun: 'Snippet',
        subtitle: seg ? `Snippet ${seg.index} · from ${formatTime(seg.start, true)} · at ${formatTime(seg.at)}` : undefined,
        endLabel: 'End',
        endHint: 'Pick the last snippet to see the call to action',
        canRender: !!source && segments.length > 0,
        renderLabel: segments.length ? `Render ${formatTime(recapTotal)} highlights` : 'Render highlights',
        itemCount: segments.length,
        styleFrame: frame,
        styleSingle: true,
        styleTitle: source?.title
      }
    }
    const item = timeline.items[selectedClip - 1]
    const clip = item ? readyClips[item.index] : undefined
    return {
      count: timeline.items.length,
      selected: selectedClip,
      onSelect: setSelectedClip,
      noun: 'Clip',
      subtitle: clip && item ? `Clip ${selectedClip} · ${clip.title} · at ${formatTime(item.at)}` : undefined,
      endLabel: 'End',
      endHint: 'Pick the last clip to see the call to action',
      canRender: timeline.items.length > 0,
      renderLabel: timeline.items.length ? `Combine ${plural(timeline.items.length, 'clip')} into one video` : 'Combine',
      itemCount: timeline.items.length,
      styleFrame: combinedFrame,
      styleSingle: true,
      styleTitle: settings.combineName
    }
  })()

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden />
          <strong>MovieToShort</strong>
          <span className="muted small">{info ? `v${info.version}` : ''}</span>
        </div>
        <ModeTabs value={mode} onChange={switchMode} disabled={busy} />
        <div className="row">
          {error && (
            <span className="error small ellipsis" title={error}>
              {error}
            </span>
          )}
          <Button size="sm" variant="ghost" onClick={reset} title="Reset all settings to defaults">
            Reset settings
          </Button>
          <Button size="sm" variant="ghost" onClick={() => api.openExternal('https://github.com/upworkprashantp/movietoshort')}>
            GitHub
          </Button>
        </div>
      </header>

      <main className="columns">
        <div className="column">
          {mode === 'combine' ? (
            <>
              <ClipsPanel
                clips={clips}
                disabled={phase === 'rendering'}
                loadMessage={loadProgress?.message ?? ''}
                loadPercent={loadProgress?.percent ?? 0}
                selectedId={selectedClipId}
                onSelect={(id) => {
                  const pos = readyItems.findIndex((it) => it.id === id)
                  const at = timeline.items.findIndex((t) => t.index === pos)
                  if (at >= 0) setSelectedClip(at + 1)
                }}
                cookiesBrowser={settings.cookiesBrowser}
                onCookiesChange={(v) => update({ cookiesBrowser: v })}
                cookiesFile={settings.cookiesFile}
                onCookiesFileChange={(v) => update({ cookiesFile: v })}
                ytdlp={ytdlp}
                onUpdateYtDlp={updateYtDlp}
              />
              <CombineSummary
                settings={settings}
                update={update}
                disabled={phase === 'rendering'}
                readyCount={timeline.items.length}
                failedCount={clips.items.filter((it) => it.status === 'error').length}
                pendingCount={clips.items.filter((it) => it.status === 'queued' || it.status === 'loading').length}
                total={timeline.total}
                frame={combinedFrame}
              />
            </>
          ) : (
            <>
              <SourcePanel
                source={source}
                busy={busy}
                loading={phase === 'loading'}
                loadMessage={loadProgress?.message ?? ''}
                loadPercent={loadProgress?.percent ?? 0}
                cookiesBrowser={settings.cookiesBrowser}
                onCookiesChange={(v) => update({ cookiesBrowser: v })}
                cookiesFile={settings.cookiesFile}
                onCookiesFileChange={(v) => update({ cookiesFile: v })}
                onLoadUrl={loadUrl}
                onLoadLocal={loadLocal}
                onCancel={cancel}
                onAudioTrackChange={(index) => source && setSource({ ...source, audioStreamIndex: index })}
                ytdlp={ytdlp}
                onUpdateYtDlp={updateYtDlp}
                onClear={clearSource}
              />
              {mode === 'split' ? (
                <>
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
                  <PlanPanel parts={parts} selected={selectedPart} onSelect={setSelectedPart} smartCut={settings.smartCut && silences !== null} single={single} />
                </>
              ) : (
                <HighlightsPanel
                  source={source}
                  settings={settings}
                  update={update}
                  busy={busy}
                  segments={segments}
                  selected={selectedSnippet}
                  onSelect={setSelectedSnippet}
                />
              )}
            </>
          )}
        </div>

        <div className="column column-preview">
          <PreviewPanel
            count={view.count}
            selected={view.selected}
            onSelect={view.onSelect}
            noun={view.noun}
            subtitle={view.subtitle}
            endLabel={view.endLabel}
            endHint={view.endHint}
            moment={moment}
            onMoment={setMoment}
            image={preview}
            loading={previewLoading}
            error={previewError}
            onRefresh={refreshPreview}
            disabled={!hasPreviewTarget || phase === 'rendering'}
          />
        </div>

        <div className="column">
          <StylePanel
            settings={settings}
            update={update}
            disabled={phase === 'rendering'}
            sourceTitle={view.styleTitle}
            frame={view.styleFrame}
            single={view.styleSingle}
          />
          <ExportPanel
            mode={mode}
            settings={settings}
            update={update}
            disabled={mode === 'combine' ? busy : !source || busy}
            canRender={view.canRender}
            renderLabel={view.renderLabel}
            itemCount={view.itemCount}
            rendering={phase === 'rendering'}
            progress={renderProgress}
            result={renderResult}
            error={renderError}
            hwEncoder={settings.hardwareEncode ? hwEncoder : undefined}
            sourceOrigin={source?.origin}
            onRender={render}
            onCancel={cancel}
            secondary={
              mode === 'combine'
                ? {
                    label: 'Save clips only',
                    hint: 'Copies every ready clip to the output folder as it is, numbered in list order.',
                    disabled: !readyClips.length,
                    onClick: saveClipsOnly
                  }
                : undefined
            }
          />
        </div>
      </main>
    </div>
  )
}
