import { app, BrowserWindow, ipcMain, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { registerIpc } from './ipc'

let win: BrowserWindow | null = null

function createWindow(): BrowserWindow {
  const w = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0b0b0f',
    title: 'MovieToShort',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  w.once('ready-to-show', () => w.show())

  // Links open in the user's browser, never inside the app.
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    w.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    w.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  // Smoke test (used by CI): MOVIETOSHORT_SMOKE=<file.png> screenshots the window and quits.
  // With MOVIETOSHORT_SMOKE_FILE the renderer loads that video first (and renders it when
  // MOVIETOSHORT_SMOKE_RENDER=1), then signals 'smoke:done'.
  const smoke = process.env.MOVIETOSHORT_SMOKE
  if (smoke) {
    let finished = false
    const finish = async (reason: string): Promise<void> => {
      if (finished || w.isDestroyed()) return
      finished = true
      const image = await w.webContents.capturePage()
      fs.writeFileSync(smoke, image.toPNG())
      console.log(`smoke: ${reason}, screenshot written to ${smoke}`)
      app.quit()
    }
    w.webContents.on('console-message', (_e, level, message) => {
      if (level >= 2) console.error('[renderer]', message)
    })
    ipcMain.once('smoke:done', (_e, status: string) => {
      console.log('smoke: renderer reported', status)
      setTimeout(() => finish('done'), 800)
    })
    w.webContents.once('did-finish-load', () => {
      // A scripted run (MOVIETOSHORT_SMOKE_FILE, or MOVIETOSHORT_SMOKE_FILES for Combine) reports
      // 'smoke:done' itself, so this timer is only a safety net. A bare launch just screenshots.
      const scripted = !!(process.env.MOVIETOSHORT_SMOKE_FILE || process.env.MOVIETOSHORT_SMOKE_FILES)
      setTimeout(() => finish(scripted ? 'timeout' : 'loaded'), scripted ? 240_000 : 2_000)
    })
  }
  return w
}

app.whenReady().then(() => {
  registerIpc(() => {
    if (!win || win.isDestroyed()) win = createWindow()
    return win
  })
  win = createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) win = createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
