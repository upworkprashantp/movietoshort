import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_SETTINGS, type Settings } from '@shared/types'

const KEY = 'movietoshort.settings.v1'

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    const parsed = JSON.parse(raw) as Partial<Settings>
    return { ...DEFAULT_SETTINGS, ...parsed }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function useSettings(): [Settings, (patch: Partial<Settings>) => void, () => void] {
  const [settings, setSettings] = useState<Settings>(load)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(settings))
    } catch {
      /* ignore quota errors */
    }
  }, [settings])

  const update = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), [])
  const reset = useCallback(() => setSettings({ ...DEFAULT_SETTINGS, outputDir: settings.outputDir }), [settings.outputDir])
  return [settings, update, reset]
}
