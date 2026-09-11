import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { ffmpegPath, ffprobePath } from './binaries'
import { probeFile } from './probe'
import * as ytdlp from './ytdlp'
import { detectSilences } from './silence'
import { renderJob, renderPreview, type RenderContext } from './render'
import { renderCombine, renderHighlights, saveCopies } from './compose'
import { detectHardwareEncoder } from './encoders'
import { CancelledError } from './proc'
import type {
  AppInfo,
  AppMode,
  CombineJob,
  HighlightsJob,
  YtAuth,
  PreviewRequest,
  ProgressEvent,
  RenderJob,
  RenderResult,
  SavedCopies,
  Silence,
  SourceInfo,
  YtDlpStatus
} from '@shared/types'

/** One long-running job at a time (download / analyse / render); previews run independently. */
let job: AbortController | null = null
let preview: AbortController | null = null

function startJob(): AbortController {
  job?.abort()
  job = new AbortController()
  return job
}

function send(win: BrowserWindow, e: ProgressEvent): void {
  if (!win.isDestroyed()) win.webContents.send('progress', e)
}

function friendly(err: unknown): never {
  if (err instanceof CancelledError) throw new Error('Cancelled')
  const msg = err instanceof Error ? err.message : String(err)
  throw new Error(msg)
}

const VIDEO_FILTERS = [
  {
    name: 'Video',
    extensions: ['mp4', 'mkv', 'mov', 'avi', 'webm', 'm4v', 'ts', 'mts', 'm2ts', 'wmv', 'flv', 'mpg', 'mpeg', '3gp', 'ogv', 'vob']
  },
  { name: 'All files', extensions: ['*'] }
]

export function registerIpc(getWindow: () => BrowserWindow): void {
  /** Run a render-type job as the single active job, streaming progress to the window. */
  const asJob = async <T>(fn: (ctx: RenderContext) => Promise<T>): Promise<T> => {
    const win = getWindow()
    const ctrl = startJob()
    try {
      return await fn({ signal: ctrl.signal, onProgress: (e) => send(win, e) })
    } catch (err) {
      friendly(err)
    } finally {
      if (job === ctrl) job = null
    }
  }

  ipcMain.handle('app:info', (): AppInfo => ({
    platform: process.platform as AppInfo['platform'],
    version: app.getVersion(),
    defaultOutputDir: path.join(app.getPath('videos'), 'MovieToShort'),
    ffmpegPath: ffmpegPath(),
    ffprobePath: ffprobePath(),
    smoke: process.env.MOVIETOSHORT_SMOKE
      ? {
          file: process.env.MOVIETOSHORT_SMOKE_FILE,
          files: process.env.MOVIETOSHORT_SMOKE_FILES?.split(path.delimiter).filter(Boolean),
          mode: process.env.MOVIETOSHORT_SMOKE_MODE as AppMode | undefined,
          render: process.env.MOVIETOSHORT_SMOKE_RENDER === '1',
          single: process.env.MOVIETOSHORT_SMOKE_SINGLE === '1',
          outputDir: process.env.MOVIETOSHORT_SMOKE_OUT
        }
      : undefined
  }))

  ipcMain.handle('dialog:pickVideo', async () => {
    const res = await dialog.showOpenDialog(getWindow(), {
      title: 'Choose a video',
      properties: ['openFile'],
      filters: VIDEO_FILTERS
    })
    return res.canceled ? null : res.filePaths[0]
  })

  ipcMain.handle('dialog:pickVideos', async (): Promise<string[]> => {
    const res = await dialog.showOpenDialog(getWindow(), {
      title: 'Choose videos to combine',
      properties: ['openFile', 'multiSelections'],
      filters: VIDEO_FILTERS
    })
    return res.canceled ? [] : res.filePaths
  })

  ipcMain.handle('dialog:pickDir', async (_e, current?: string) => {
    const res = await dialog.showOpenDialog(getWindow(), {
      title: 'Choose the output folder',
      defaultPath: current || undefined,
      properties: ['openDirectory', 'createDirectory']
    })
    return res.canceled ? null : res.filePaths[0]
  })

  ipcMain.handle('source:loadLocal', async (_e, file: string): Promise<SourceInfo> => {
    if (!fs.existsSync(file)) throw new Error('File not found: ' + file)
    try {
      return await probeFile(file)
    } catch (err) {
      friendly(err)
    }
  })

  ipcMain.handle('dialog:pickCookies', async () => {
    const res = await dialog.showOpenDialog(getWindow(), {
      title: 'Choose a cookies.txt file',
      properties: ['openFile'],
      filters: [
        { name: 'Cookies', extensions: ['txt'] },
        { name: 'All files', extensions: ['*'] }
      ]
    })
    return res.canceled ? null : res.filePaths[0]
  })

  ipcMain.handle('source:loadUrl', async (_e, url: string, auth: YtAuth): Promise<SourceInfo> => {
    const win = getWindow()
    const ctrl = startJob()
    try {
      await ytdlp.ensureInstalled((percent, message) => send(win, { kind: 'ytdlp', percent, message }))
      send(win, { kind: 'download', percent: 0, message: 'Reading video info…' })
      const info = await ytdlp.fetchInfo(url, auth, ctrl.signal)
      const file = await ytdlp.download(
        url,
        info,
        auth,
        (p) => send(win, { kind: 'download', percent: p.percent, message: p.message }),
        ctrl.signal
      )
      send(win, { kind: 'download', percent: 100, message: 'Reading file…' })
      const src = await probeFile(file, info.title, 'link', info.webpage_url ?? url)
      src.site = ytdlp.siteName(info)
      return src
    } catch (err) {
      friendly(err)
    } finally {
      if (job === ctrl) job = null
    }
  })

  ipcMain.handle(
    'silence:analyze',
    async (_e, file: string, audioStreamIndex: number, durationSec: number): Promise<Silence[]> => {
      const win = getWindow()
      const ctrl = startJob()
      try {
        return await detectSilences(file, {
          audioStreamIndex,
          durationSec,
          signal: ctrl.signal,
          onProgress: (percent) => send(win, { kind: 'analyze', percent, message: 'Finding natural pauses…' })
        })
      } catch (err) {
        friendly(err)
      } finally {
        if (job === ctrl) job = null
      }
    }
  )

  ipcMain.handle('preview:render', async (_e, req: PreviewRequest): Promise<string> => {
    preview?.abort()
    const ctrl = new AbortController()
    preview = ctrl
    try {
      return await renderPreview(req, ctrl.signal)
    } catch (err) {
      // A newer preview superseded this one: not an error, the renderer ignores empty results.
      if (err instanceof CancelledError) return ''
      friendly(err)
    } finally {
      if (preview === ctrl) preview = null
    }
  })

  ipcMain.handle('render:start', (_e, req: RenderJob): Promise<RenderResult> => asJob((ctx) => renderJob(req, ctx)))
  ipcMain.handle('render:highlights', (_e, req: HighlightsJob): Promise<RenderResult> => asJob((ctx) => renderHighlights(req, ctx)))
  ipcMain.handle('render:combine', (_e, req: CombineJob): Promise<RenderResult> => asJob((ctx) => renderCombine(req, ctx)))

  ipcMain.handle(
    'files:saveCopies',
    (_e, items: Array<{ path: string; title: string }>, outputDir: string, folder: string): SavedCopies => {
      try {
        return saveCopies(items, outputDir, folder)
      } catch (err) {
        friendly(err)
      }
    }
  )

  ipcMain.handle('job:cancel', () => {
    job?.abort()
    job = null
  })

  ipcMain.handle('encoder:detect', async () => detectHardwareEncoder())

  ipcMain.handle('ytdlp:status', async (): Promise<YtDlpStatus> => ytdlp.status())
  ipcMain.handle('ytdlp:install', async (): Promise<YtDlpStatus> => {
    const win = getWindow()
    try {
      return await ytdlp.install((percent, message) => send(win, { kind: 'ytdlp', percent, message }))
    } catch (err) {
      friendly(err)
    }
  })
  ipcMain.handle('cache:clear', () => ytdlp.clearCache())

  ipcMain.handle('shell:openPath', (_e, p: string) => shell.openPath(p))
  ipcMain.handle('shell:showItem', (_e, p: string) => shell.showItemInFolder(p))
  ipcMain.handle('shell:openExternal', (_e, url: string) => {
    if (/^https?:\/\//i.test(url)) return shell.openExternal(url)
    return undefined
  })
}
