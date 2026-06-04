import React, { useEffect, useRef } from 'react'
import { useA11y } from './a11y-provider'

type Point = { x: number; y: number; vx: number; vy: number }

export default function NetworkBackground({ fixed = true }: { fixed?: boolean }) {
  const { reduceMotion } = useA11y()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const ptsRef = useRef<Point[]>([])
  const dprRef = useRef<number>(1)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    function resize() {
      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1))
      dprRef.current = dpr
      const { innerWidth: w, innerHeight: h } = window
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      canvas.style.width = w + 'px'
      canvas.style.height = h + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // seed points based on area (enterprise-friendly, not too busy)
      const target = Math.round((w * h) / 26000) // ~50 on 1366x768
      const pts: Point[] = []
      for (let i = 0; i < target; i++) {
        pts.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.25,
          vy: (Math.random() - 0.5) * 0.25,
        })
      }
      ptsRef.current = pts
    }

    function draw(singleFrame: boolean = false) {
      const w = window.innerWidth
      const h = window.innerHeight
      // background gradient
      const g = ctx.createLinearGradient(0, 0, w, h)
      g.addColorStop(0, '#07161c')
      g.addColorStop(0.55, '#0a1f26')
      g.addColorStop(1, '#08161b')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)

      // subtle overlay vignette
      const vg = ctx.createRadialGradient(w * 0.55, h * 0.4, Math.min(w, h) * 0.1, w * 0.55, h * 0.4, Math.min(w, h) * 0.9)
      vg.addColorStop(0, 'rgba(255,255,255,0.03)')
      vg.addColorStop(1, 'rgba(0,0,0,0.35)')
      ctx.fillStyle = vg
      ctx.fillRect(0, 0, w, h)

      const pts = ptsRef.current
      // animate points
      for (const p of pts) {
        p.x += p.vx
        p.y += p.vy
        if (p.x < -20) p.x = w + 20
        if (p.x > w + 20) p.x = -20
        if (p.y < -20) p.y = h + 20
        if (p.y > h + 20) p.y = -20
      }

      // lines
      const maxDist = Math.min(160, Math.max(110, Math.sqrt(w * h) / 9))
      ctx.lineWidth = 1
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i]
        for (let j = i + 1; j < pts.length; j++) {
          const b = pts[j]
          const dx = a.x - b.x
          const dy = a.y - b.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < maxDist) {
            const t = 1 - dist / maxDist
            ctx.strokeStyle = `rgba(32, 197, 219, ${0.08 + t * 0.18})`
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.stroke()
          }
        }
      }

      // nodes
      for (const p of pts) {
        ctx.fillStyle = 'rgba(32, 197, 219, 0.55)'
        ctx.beginPath()
        ctx.arc(p.x, p.y, 1.2, 0, Math.PI * 2)
        ctx.fill()
      }

      if (!singleFrame) rafRef.current = requestAnimationFrame(() => draw(false))
    }

    resize()
    if (reduceMotion) {
      // Draw a single frame and stop (WCAG: reduced motion)
      draw(true)
    } else {
      draw()
    }
    window.addEventListener('resize', resize)
    return () => {
      window.removeEventListener('resize', resize)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [reduceMotion])

  return (
    <div className={`${fixed ? 'fixed' : 'absolute'} inset-0 -z-10`}>
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  )
}
