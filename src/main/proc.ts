import { spawn, type ChildProcess } from 'node:child_process'

export interface RunOptions {
  signal?: AbortSignal
  onStdoutLine?: (line: string) => void
  onStderrLine?: (line: string) => void
  /** Keep at most this many bytes of stderr for error reporting. */
  stderrTail?: number
  cwd?: string
  env?: NodeJS.ProcessEnv
}

export interface RunResult {
  code: number | null
  stdout: Buffer
  stderr: string
  cancelled: boolean
}

export class CancelledError extends Error {
  constructor() {
    super('Cancelled')
    this.name = 'CancelledError'
  }
}

export class ProcessError extends Error {
  constructor(
    public cmd: string,
    public code: number | null,
    public stderr: string
  ) {
    super(`${cmd} exited with code ${code}: ${lastLines(stderr, 8)}`)
    this.name = 'ProcessError'
  }
}

export function lastLines(text: string, n: number): string {
  const lines = text.trim().split(/\r?\n/)
  return lines.slice(-n).join('\n')
}

/** Kill a process and (on Windows) everything it spawned. */
export function killTree(child: ChildProcess): void {
  if (child.exitCode !== null || child.signalCode !== null) return
  if (process.platform === 'win32' && child.pid) {
    try {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
      return
    } catch {
      /* fall through */
    }
  }
  try {
    child.kill('SIGKILL')
  } catch {
    /* already gone */
  }
}

/**
 * Spawn a process without a shell, stream its output line by line and resolve when it exits.
 * Lines are split on both CR and LF so ffmpeg's progress output is delivered as it arrives.
 */
export function run(cmd: string, args: string[], opts: RunOptions = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) return reject(new CancelledError())

    const child = spawn(cmd, args, {
      windowsHide: true,
      cwd: opts.cwd,
      env: opts.env,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    const stdoutChunks: Buffer[] = []
    let stderr = ''
    const tail = opts.stderrTail ?? 64 * 1024
    let cancelled = false

    const onAbort = (): void => {
      cancelled = true
      killTree(child)
    }
    opts.signal?.addEventListener('abort', onAbort, { once: true })

    const lineSplitter = (cb?: (l: string) => void): ((chunk: Buffer) => void) => {
      let buf = ''
      return (chunk: Buffer) => {
        if (!cb) return
        buf += chunk.toString('utf8')
        let idx: number
        while ((idx = buf.search(/[\r\n]/)) >= 0) {
          const line = buf.slice(0, idx)
          buf = buf.slice(idx + 1)
          if (line.trim()) cb(line)
        }
      }
    }

    const stdoutLines = lineSplitter(opts.onStdoutLine)
    const stderrLines = lineSplitter(opts.onStderrLine)

    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutChunks.push(chunk)
      stdoutLines(chunk)
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
      if (stderr.length > tail) stderr = stderr.slice(-tail)
      stderrLines(chunk)
    })

    child.on('error', (err) => {
      opts.signal?.removeEventListener('abort', onAbort)
      reject(err)
    })
    child.on('close', (code) => {
      opts.signal?.removeEventListener('abort', onAbort)
      if (cancelled) return reject(new CancelledError())
      resolve({ code, stdout: Buffer.concat(stdoutChunks), stderr, cancelled })
    })
  })
}

/** Like run() but rejects when the exit code is not zero. */
export async function runOk(cmd: string, args: string[], opts: RunOptions = {}): Promise<RunResult> {
  const res = await run(cmd, args, opts)
  if (res.code !== 0) throw new ProcessError(cmd.split(/[\\/]/).pop() ?? cmd, res.code, res.stderr)
  return res
}
