import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  AppInfo,
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

const api = {
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke('app:info'),
  pickVideoFile: (): Promise<string | null> => ipcRenderer.invoke('dialog:pickVideo'),
  pickVideoFiles: (): Promise<string[]> => ipcRenderer.invoke('dialog:pickVideos'),
  pickOutputDir: (current?: string): Promise<string | null> => ipcRenderer.invoke('dialog:pickDir', current),
  loadLocal: (file: string): Promise<SourceInfo> => ipcRenderer.invoke('source:loadLocal', file),
  loadUrl: (url: string, auth: YtAuth): Promise<SourceInfo> => ipcRenderer.invoke('source:loadUrl', url, auth),
  pickCookiesFile: (): Promise<string | null> => ipcRenderer.invoke('dialog:pickCookies'),
  analyzeSilence: (file: string, audioStreamIndex: number, durationSec: number): Promise<Silence[]> =>
    ipcRenderer.invoke('silence:analyze', file, audioStreamIndex, durationSec),
  renderPreview: (req: PreviewRequest): Promise<string> => ipcRenderer.invoke('preview:render', req),
  startRender: (job: RenderJob): Promise<RenderResult> => ipcRenderer.invoke('render:start', job),
  renderHighlights: (job: HighlightsJob): Promise<RenderResult> => ipcRenderer.invoke('render:highlights', job),
  renderCombine: (job: CombineJob): Promise<RenderResult> => ipcRenderer.invoke('render:combine', job),
  saveCopies: (items: Array<{ path: string; title: string }>, outputDir: string, folder: string): Promise<SavedCopies> =>
    ipcRenderer.invoke('files:saveCopies', items, outputDir, folder),
  cancel: (): Promise<void> => ipcRenderer.invoke('job:cancel'),
  detectEncoder: (): Promise<string | null> => ipcRenderer.invoke('encoder:detect'),
  ytdlpStatus: (): Promise<YtDlpStatus> => ipcRenderer.invoke('ytdlp:status'),
  ytdlpInstall: (): Promise<YtDlpStatus> => ipcRenderer.invoke('ytdlp:install'),
  clearCache: (): Promise<number> => ipcRenderer.invoke('cache:clear'),
  openPath: (p: string): Promise<string> => ipcRenderer.invoke('shell:openPath', p),
  showInFolder: (p: string): Promise<void> => ipcRenderer.invoke('shell:showItem', p),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:openExternal', url),
  /** Smoke-test hook: tells the main process the scripted flow finished. */
  smokeDone: (status: string): void => ipcRenderer.send('smoke:done', status),
  /** Absolute path of a File dropped onto the window. */
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
  onProgress: (cb: (e: ProgressEvent) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, payload: ProgressEvent): void => cb(payload)
    ipcRenderer.on('progress', handler)
    return () => ipcRenderer.removeListener('progress', handler)
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
