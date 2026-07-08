import React, { useEffect, useRef, useState } from 'react'
import { Button, Pill } from './ui'
import { useA11y } from './a11y-provider'
import { useI18n } from '../i18n'

export default function AccessibilityMenu() {
  const { highContrast, reduceMotion, fontScale, setHighContrast, setReduceMotion, setFontScale, reset } = useA11y()
  const { t } = useI18n()
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

  const inc = () => setFontScale(fontScale === 150 ? 150 : (fontScale === 125 ? 150 : (fontScale === 112 ? 125 : 112)))
  const dec = () => setFontScale(fontScale === 100 ? 100 : (fontScale === 112 ? 100 : (fontScale === 125 ? 112 : 125)))

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="ghost"
        className="bg-white/5 border border-white/10 text-white hover:bg-white/10"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
      >
        {t('accessibility')} <Pill>{fontScale}%</Pill>
      </Button>

      {open ? (
        <div
          role="menu"
          aria-label={t('accessibility')}
          className="absolute right-0 mt-2 w-72 rounded-2xl border border-white/10 bg-slate-950/90 text-white shadow-2xl backdrop-blur p-2 z-50"
        >
          <button
            role="menuitemcheckbox"
            aria-checked={highContrast}
            onClick={() => setHighContrast(!highContrast)}
            className="w-full text-left rounded-xl px-3 py-3 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <div className="font-semibold">{t('highContrast')}</div>
            <div className="text-xs text-white/60">Improves readability</div>
          </button>

          <button
            role="menuitemcheckbox"
            aria-checked={reduceMotion}
            onClick={() => setReduceMotion(!reduceMotion)}
            className="w-full text-left rounded-xl px-3 py-3 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <div className="font-semibold">{t('reduceMotion')}</div>
            <div className="text-xs text-white/60">Disables animated backgrounds</div>
          </button>

          <div className="rounded-xl px-3 py-3">
            <div className="font-semibold">{t('fontSize')}</div>
            <div className="mt-2 flex items-center gap-2">
              <button
                className="min-h-[44px] min-w-[44px] rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-blue-400"
                onClick={dec}
                aria-label="Decrease font size"
              >
                A−
              </button>
              <div className="flex-1 text-center text-sm text-white/70">{fontScale}%</div>
              <button
                className="min-h-[44px] min-w-[44px] rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-blue-400"
                onClick={inc}
                aria-label="Increase font size"
              >
                A+
              </button>
            </div>

            <div className="mt-2 flex justify-end">
              <button
                onClick={reset}
                className="text-xs underline underline-offset-4 text-white/70 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-400 rounded-lg px-2 py-2"
              >
                {t('reset')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
