/** Strip Electron's IPC wrapper ("Error invoking remote method 'x': Error: ...") from a message. */
export function errorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  return raw.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}
