import React, { useEffect, useRef, useState } from 'react'
import { Button } from './ui'
import { useI18n, Lang } from '../i18n'

export default function LanguageMenu() {
  const { lang, setLang, t } = useI18n()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current) return
      if (!ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  const options: Array<{ code: Lang; label: string }> = [
    { code: 'en', label: 'English' },
    { code: 'it', label: 'Italiano' },
    { code: 'sl', label: 'Slovenščina' },
    { code: 'et', label: 'Eesti' },
    { code: 'be', label: 'Belgium (French)' },
    { code: 'nl', label: 'Belgium (Dutch)' },
    { code: 'lt', label: 'Lietuvių' },
    { code: 'hr', label: 'Hrvatski' },
  ]

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="ghost"
        className="bg-white/5 border border-white/10 text-white hover:bg-white/10"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
      >
        {t('language')}: {lang.toUpperCase()}
      </Button>

      {open ? (
        <div
          role="menu"
          aria-label={t('language')}
          className="absolute right-0 mt-2 w-48 rounded-2xl border border-white/10 bg-slate-950/90 text-white shadow-2xl backdrop-blur p-2 z-50"
        >
          {options.map(o => (
            <button
              key={o.code}
              role="menuitemradio"
              aria-checked={lang === o.code}
              onClick={() => {
                setLang(o.code)
                setOpen(false)
              }}
              className="w-full text-left rounded-xl px-3 py-3 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <div className="font-semibold">{o.label}</div>
              <div className="text-xs text-white/60">{o.code.toUpperCase()}</div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
