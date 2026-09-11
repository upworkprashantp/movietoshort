import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SourceInfo, YtAuth } from '@shared/types'
import { api } from '../lib/api'
import { errorMessage } from '../lib/errors'

export type ClipStatus = 'queued' | 'loading' | 'ready' | 'error'

export interface ClipItem {
  id: string
  /** The link or the file path as the user gave it. */
  input: string
  kind: 'url' | 'file'
  status: ClipStatus
  source?: SourceInfo
  error?: string
}

const STOPPED = 'Stopped'

let counter = 0
function newId(): string {
  counter += 1
  return `clip-${Date.now().toString(36)}-${counter.toString(36)}`
}

/** Pull http(s) links out of pasted text: one per line, or separated by spaces or commas. */
export function parseLinks(text: string): string[] {
  const found = text.match(/https?:\/\/[^\s,<>"']+/gi) ?? []
  return Array.from(new Set(found.map((u) => u.replace(/[).,;]+$/, ''))))
}

export interface Clips {
  items: ClipItem[]
  ready: SourceInfo[]
  loading: boolean
  paused: boolean
  addLinks: (text: string) => number
  addFiles: (paths: string[]) => void
  remove: (id: string) => void
  move: (id: string, dir: -1 | 1) => void
  retry: (id: string) => void
  stop: () => void
  resume: () => void
  clear: () => void
}

/**
 * The Combine list. Links are downloaded and files are read one at a time, in list order, so
 * progress is easy to follow and a slow site never blocks the whole batch from being stopped.
 */
export function useClips(auth: YtAuth): Clips {
  const [items, setItems] = useState<ClipItem[]>([])
  const [paused, setPaused] = useState(false)
  const [tick, setTick] = useState(0)
  const busy = useRef(false)
  const authRef = useRef(auth)
  authRef.current = auth

  const patch = useCallback((id: string, p: Partial<ClipItem>) => {
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...p } : it)))
  }, [])

  const addLinks = useCallback((text: string): number => {
    const links = parseLinks(text)
    if (links.length) {
      setPaused(false)
      setItems((list) => [...list, ...links.map((input): ClipItem => ({ id: newId(), input, kind: 'url', status: 'queued' }))])
    }
    return links.length
  }, [])

  const addFiles = useCallback((paths: string[]) => {
    if (!paths.length) return
    setPaused(false)
    setItems((list) => [...list, ...paths.map((input): ClipItem => ({ id: newId(), input, kind: 'file', status: 'queued' }))])
  }, [])

  const remove = useCallback((id: string) => {
    setItems((list) => {
      if (list.find((it) => it.id === id)?.status === 'loading') api.cancel()
      return list.filter((it) => it.id !== id)
    })
  }, [])

  const move = useCallback((id: string, dir: -1 | 1) => {
    setItems((list) => {
      const i = list.findIndex((it) => it.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= list.length) return list
      const next = [...list]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }, [])

  const retry = useCallback(
    (id: string) => {
      setPaused(false)
      patch(id, { status: 'queued', error: undefined })
    },
    [patch]
  )

  const stop = useCallback(() => {
    setPaused(true)
    api.cancel()
  }, [])

  const resume = useCallback(() => {
    setPaused(false)
    setItems((list) => list.map((it) => (it.status === 'error' && it.error === STOPPED ? { ...it, status: 'queued', error: undefined } : it)))
  }, [])

  const clear = useCallback(() => {
    if (busy.current) api.cancel()
    setItems([])
    setPaused(false)
  }, [])

  // One worker: pick the first queued clip whenever nothing is loading.
  useEffect(() => {
    if (paused || busy.current) return
    const next = items.find((it) => it.status === 'queued')
    if (!next) return
    busy.current = true
    patch(next.id, { status: 'loading', error: undefined })
    const load = next.kind === 'url' ? api.loadUrl(next.input, authRef.current) : api.loadLocal(next.input)
    load
      .then((source) => patch(next.id, { status: 'ready', source }))
      .catch((err: unknown) => {
        const msg = errorMessage(err)
        patch(next.id, { status: 'error', error: msg === 'Cancelled' ? STOPPED : msg })
      })
      .finally(() => {
        busy.current = false
        setTick((t) => t + 1) // wake the worker for the next clip
      })
  }, [items, paused, tick, patch])

  const ready = useMemo(() => items.filter((it) => it.status === 'ready' && it.source).map((it) => it.source!), [items])
  const loading = items.some((it) => it.status === 'loading')

  return { items, ready, loading, paused, addLinks, addFiles, remove, move, retry, stop, resume, clear }
}
