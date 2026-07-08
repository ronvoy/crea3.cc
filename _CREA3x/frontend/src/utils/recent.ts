export type RecentDispute = { id: number; title: string; ts: number; status?: string }

const KEY = 'crea3_recent_disputes_v1'

export function getRecentDisputes(): RecentDispute[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr
      .filter((x) => x && typeof x.id === 'number')
      .slice(0, 8)
  } catch {
    return []
  }
}

export function addRecentDispute(id: number, title: string, status?: string) {
  try {
    const curr = getRecentDisputes()
    const next: RecentDispute[] = [
      { id, title: title || `Dispute #${id}`, ts: Date.now(), status },
      ...curr.filter((d) => d.id !== id),
    ].slice(0, 8)
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // ignore
  }
}

export function removeRecentDispute(id: number): RecentDispute[] {
  try {
    const next = getRecentDisputes().filter((d) => d.id !== id)
    localStorage.setItem(KEY, JSON.stringify(next))
    return next
  } catch {
    return getRecentDisputes()
  }
}

export function clearRecentDisputes() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}
