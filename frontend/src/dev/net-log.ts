// Lightweight network logger for the dev console. Patches window.fetch once and
// keeps a ring buffer of recent requests with a pub/sub for React subscribers.

export type NetEntry = {
  id: number
  method: string
  url: string
  status: number | null
  ok: boolean
  ms: number
  ts: number
  error?: string
}

const MAX = 80
let entries: NetEntry[] = []
let seq = 0
const listeners = new Set<() => void>()
let patched = false

function emit() {
  for (const l of listeners) l()
}

export function getEntries(): NetEntry[] {
  return entries
}

export function clearEntries() {
  entries = []
  emit()
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function installNetLogger() {
  if (patched || typeof window === 'undefined' || !window.fetch) return
  patched = true
  const orig = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const start = performance.now()
    const method = (init?.method || (typeof input !== 'string' && 'method' in (input as any) ? (input as any).method : 'GET') || 'GET').toUpperCase()
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url
    const id = ++seq
    try {
      const res = await orig(input as any, init)
      const entry: NetEntry = { id, method, url, status: res.status, ok: res.ok, ms: Math.round(performance.now() - start), ts: Date.now() }
      entries = [entry, ...entries].slice(0, MAX)
      emit()
      return res
    } catch (e: any) {
      const entry: NetEntry = { id, method, url, status: null, ok: false, ms: Math.round(performance.now() - start), ts: Date.now(), error: e?.message ?? 'network error' }
      entries = [entry, ...entries].slice(0, MAX)
      emit()
      throw e
    }
  }
}
