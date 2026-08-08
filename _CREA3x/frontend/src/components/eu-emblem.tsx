import React from 'react'
import { useI18n } from '../i18n'

// Five-pointed star polygon points, centred at (cx,cy) with outer radius R.
function starPoints(cx: number, cy: number, R: number): string {
  const r = R * 0.382
  const pts: string[] = []
  for (let i = 0; i < 10; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / 5
    const rad = i % 2 === 0 ? R : r
    pts.push(`${(cx + rad * Math.cos(ang)).toFixed(2)},${(cy + rad * Math.sin(ang)).toFixed(2)}`)
  }
  return pts.join(' ')
}

/** Official European Union emblem: 12 gold stars in a circle on a blue field. */
export default function EuEmblem({ className = '' }: { className?: string }) {
  const { t } = useI18n()
  const cx = 45
  const cy = 30
  const ring = 18 // radius of the circle the stars sit on
  const star = 3.6 // outer radius of each star
  const stars = Array.from({ length: 12 }, (_, k) => {
    const a = -Math.PI / 2 + (k * Math.PI) / 6 // 30° apart, first at top
    return starPoints(cx + ring * Math.cos(a), cy + ring * Math.sin(a), star)
  })
  return (
    <svg viewBox="0 0 90 60" className={className} role="img" aria-label={t('ariaEmblem')}>
      <rect width="90" height="60" rx="4" fill="#003399" />
      {stars.map((p, i) => (
        <polygon key={i} points={p} fill="#FFCC00" />
      ))}
    </svg>
  )
}
