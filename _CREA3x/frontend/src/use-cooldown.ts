import { useEffect, useRef, useState } from 'react'

/** Ticking cooldown for resend buttons (mirrors the server's 60s limit).
 *  `start(n)` arms it for n seconds; `left` counts down to 0 once per second. */
export function useCooldown(initialSeconds = 0) {
  const [left, setLeft] = useState(Math.max(0, Math.floor(initialSeconds)))
  const timer = useRef<number | null>(null)

  useEffect(() => {
    if (left <= 0) return
    timer.current = window.setInterval(() => {
      setLeft((s) => (s <= 1 ? 0 : s - 1))
    }, 1000)
    return () => { if (timer.current) window.clearInterval(timer.current) }
  }, [left > 0])

  const start = (seconds: number) => setLeft(Math.max(0, Math.floor(seconds)))
  return { left, start }
}

/** Seconds from a backend 429 detail like "Please wait 45s before…", else fallback. */
export function cooldownFromError(err: any, fallback = 60): number {
  const m = /(\d+)\s*s/.exec(String(err?.message || ''))
  return m ? parseInt(m[1], 10) : fallback
}
