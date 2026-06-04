import React from 'react'

export default function LegalAvatar({
  size = 40,
  state = 'idle',
  label = 'Legal assistant avatar',
}: {
  size?: number
  state?: 'idle' | 'listening' | 'speaking'
  label?: string
}) {
  const ring =
    state === 'listening' ? 'ring-2 ring-emerald-400/60'
    : state === 'speaking' ? 'ring-2 ring-blue-400/60'
    : 'ring-1 ring-white/15'
  const pulse =
    state === 'listening' ? 'animate-pulse'
    : state === 'speaking' ? 'animate-pulse'
    : ''
  return (
    <div
      className={`shrink-0 rounded-2xl bg-white/5 border border-white/10 ${ring} ${pulse}`}
      style={{ width: size, height: size }}
      aria-label={label}
      role="img"
      title={label}
    >
      <svg
        viewBox="0 0 64 64"
        width={size}
        height={size}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="g1" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#1a73e8" stopOpacity="1" />
            <stop offset="1" stopColor="#0d47a1" stopOpacity="1" />
          </linearGradient>
          <linearGradient id="g2" x1="0" x2="1" y1="1" y2="0">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.92" />
            <stop offset="1" stopColor="#e2e8f0" stopOpacity="0.92" />
          </linearGradient>
        </defs>

        {/* background */}
        <circle cx="32" cy="32" r="30" fill="url(#g1)" opacity="0.95" />
        <circle cx="32" cy="32" r="29" fill="none" stroke="#ffffff" strokeOpacity="0.22" />

        {/* head + shoulders */}
        <circle cx="32" cy="27" r="9.5" fill="url(#g2)" />
        <path
          d="M17 55c2-10 10-16 15-16s13 6 15 16"
          fill="url(#g2)"
          opacity="0.98"
        />

        {/* headset */}
        <path d="M22 27c0-7 5-12 10-12s10 5 10 12" fill="none" stroke="#0b1b33" strokeOpacity="0.55" strokeWidth="2.5" />
        <rect x="19" y="27" width="5.5" height="10" rx="2.2" fill="#0b1b33" fillOpacity="0.35" />
        <rect x="39.5" y="27" width="5.5" height="10" rx="2.2" fill="#0b1b33" fillOpacity="0.35" />
        <path d="M45 36c-2 2-4 3-6 3" fill="none" stroke="#0b1b33" strokeOpacity="0.55" strokeWidth="2.2" />
        <circle cx="38" cy="40" r="1.4" fill="#0b1b33" fillOpacity="0.55" />

        {/* legal scales */}
        <path d="M32 34v14" stroke="#0b1b33" strokeOpacity="0.55" strokeWidth="2.4" strokeLinecap="round"/>
        <path d="M24 39h16" stroke="#0b1b33" strokeOpacity="0.55" strokeWidth="2.4" strokeLinecap="round"/>
        <path d="M24 39l-6 7h12l-6-7z" fill="#0b1b33" fillOpacity="0.20" />
        <path d="M40 39l-6 7h12l-6-7z" fill="#0b1b33" fillOpacity="0.20" />
      </svg>
    </div>
  )
}
