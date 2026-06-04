import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useA11y } from './a11y-provider'
import { useI18n, Lang } from '../i18n'
import { Pill, Select } from './ui'

function nextUp(v: 100 | 112 | 125 | 150) {
  return v === 100 ? 112 : v === 112 ? 125 : v === 125 ? 150 : 150
}
function nextDown(v: 100 | 112 | 125 | 150) {
  return v === 150 ? 125 : v === 125 ? 112 : v === 112 ? 100 : 100
}

const LANG_OPTIONS: Array<{ code: Lang; label: string; srLang: string }> = [
  { code: 'en', label: 'English', srLang: 'en-US' },
  { code: 'it', label: 'Italiano', srLang: 'it-IT' },
  { code: 'sl', label: 'Slovenščina', srLang: 'sl-SI' },
  { code: 'et', label: 'Eesti', srLang: 'et-EE' },
  { code: 'be', label: 'Français (Belgique)', srLang: 'fr-BE' },
  { code: 'lt', label: 'Lietuvių', srLang: 'lt-LT' },
  { code: 'hr', label: 'Hrvatski', srLang: 'hr-HR' },
]

// Left "Settings" bar with quick accessibility actions + a full settings drawer.
// Visible on public + authenticated areas.
export default function SettingsDock() {
  const { highContrast, reduceMotion, fontScale, setHighContrast, setReduceMotion, setFontScale, reset, announce } = useA11y()
  const { lang, setLang, t } = useI18n()

  const [open, setOpen] = useState(false)
  const closeBtnRef = useRef<HTMLButtonElement | null>(null)
  const lastFocusRef = useRef<HTMLElement | null>(null)

  const currentLabel = useMemo(() => {
    return LANG_OPTIONS.find(o => o.code === lang)?.label || lang.toUpperCase()
  }, [lang])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open) {
      lastFocusRef.current = document.activeElement as HTMLElement | null
      window.setTimeout(() => closeBtnRef.current?.focus(), 0)
    } else {
      lastFocusRef.current?.focus?.()
    }
  }, [open])

  // Allow other UI (e.g., Sidebar) to open Settings via a custom event.
  useEffect(() => {
    const handler = () => setOpen(true)
    window.addEventListener('crea3-open-settings', handler as any)
    return () => window.removeEventListener('crea3-open-settings', handler as any)
  }, [])

  const BarButton = ({
    title,
    children,
    onClick,
    pressed,
  }: {
    title: string
    children: React.ReactNode
    onClick: () => void
    pressed?: boolean
  }) => (
    <button
      type="button"
      onClick={onClick}
      aria-label={title}
      aria-pressed={pressed}
      title={title}
      className={
        'min-h-[44px] min-w-[44px] rounded-2xl border border-white/10 bg-slate-950/50 text-white shadow-lg shadow-black/20 backdrop-blur ' +
        'hover:bg-slate-950/65 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400'
      }
    >
      <span aria-hidden="true" className="text-lg">{children}</span>
    </button>
  )

  return (
    <>
      {/* Left settings + accessibility bar */}
      <nav aria-label={t('accessibilityBar')} className="fixed left-3 top-1/2 -translate-y-1/2 z-[60] flex flex-col gap-2">
        <div className="hidden sm:flex flex-col gap-2">
          <BarButton title={t('openSettings')} onClick={() => setOpen(true)}>
            ⚙️
          </BarButton>
          <BarButton
            title={t('highContrast')}
            pressed={highContrast}
            onClick={() => setHighContrast(!highContrast)}
          >
            ◐
          </BarButton>
          <BarButton
            title={t('reduceMotion')}
            pressed={reduceMotion}
            onClick={() => setReduceMotion(!reduceMotion)}
          >
            ≋
          </BarButton>
          <BarButton title={t('increaseFont')} onClick={() => setFontScale(nextUp(fontScale))}>A+</BarButton>
          <BarButton title={t('decreaseFont')} onClick={() => setFontScale(nextDown(fontScale))}>A−</BarButton>
        </div>

        {/* Mobile: single entry point */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t('openSettings')}
          className="sm:hidden min-h-[44px] min-w-[44px] rounded-2xl border border-white/10 bg-slate-950/60 text-white shadow-lg shadow-black/20 backdrop-blur hover:bg-slate-950/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          ⚙️
        </button>
      </nav>

      {/* Drawer */}
      <div
        className={
          'fixed inset-0 z-[70] transition ' +
          (open ? 'pointer-events-auto' : 'pointer-events-none')
        }
        aria-hidden={!open}
      >
        <div
          onClick={() => setOpen(false)}
          className={
            'absolute inset-0 bg-black/40 transition-opacity ' +
            (open ? 'opacity-100' : 'opacity-0')
          }
        />

        <aside
          role="dialog"
          aria-modal="true"
          aria-label={t('settings')}
          className={
            'absolute left-0 top-0 h-full w-[360px] max-w-[92vw] border-r border-white/10 bg-slate-950/85 text-white shadow-2xl backdrop-blur ' +
            'transition-transform ' +
            (open ? 'translate-x-0' : '-translate-x-full')
          }
        >
          <div className="h-16 px-4 border-b border-white/10 flex items-center justify-between">
            <div className="min-w-0">
              <div className="text-xs font-extrabold tracking-wider text-white/70 uppercase">{t('settings')}</div>
              <div className="text-sm text-white/80">{currentLabel} • <Pill className="bg-white/10 text-white border-white/10">{fontScale}%</Pill></div>
            </div>
            <button
              ref={closeBtnRef}
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t('close')}
              className="min-h-[44px] min-w-[44px] rounded-2xl border border-white/10 bg-white/5 text-white hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              ×
            </button>
          </div>

          <div className="p-4 space-y-6 overflow-auto h-[calc(100%-64px)]">
            <section aria-label={t('accessibility')}>
              <div className="text-xs font-extrabold tracking-wider text-white/70 uppercase">{t('accessibility')}</div>
              <div className="mt-3 space-y-2">
                <button
                  type="button"
                  className="w-full text-left rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 px-4 py-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                  onClick={() => setHighContrast(!highContrast)}
                  aria-pressed={highContrast}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold">{t('highContrast')}</div>
                      <div className="mt-1 text-xs text-white/60">Higher contrast for readability (WCAG)</div>
                    </div>
                    <Pill className="bg-white/10 text-white border-white/10">{highContrast ? 'ON' : 'OFF'}</Pill>
                  </div>
                </button>

                <button
                  type="button"
                  className="w-full text-left rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 px-4 py-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                  onClick={() => setReduceMotion(!reduceMotion)}
                  aria-pressed={reduceMotion}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold">{t('reduceMotion')}</div>
                      <div className="mt-1 text-xs text-white/60">Disables animated backgrounds</div>
                    </div>
                    <Pill className="bg-white/10 text-white border-white/10">{reduceMotion ? 'ON' : 'OFF'}</Pill>
                  </div>
                </button>

                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold">{t('fontSize')}</div>
                      <div className="mt-1 text-xs text-white/60">Stored on this device</div>
                    </div>
                    <Pill className="bg-white/10 text-white border-white/10">{fontScale}%</Pill>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      className="min-h-[44px] min-w-[44px] rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                      aria-label={t('decreaseFont')}
                      onClick={() => setFontScale(nextDown(fontScale))}
                      type="button"
                    >
                      A−
                    </button>
                    <div className="flex-1 text-center text-sm text-white/80">{fontScale}%</div>
                    <button
                      className="min-h-[44px] min-w-[44px] rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                      aria-label={t('increaseFont')}
                      onClick={() => setFontScale(nextUp(fontScale))}
                      type="button"
                    >
                      A+
                    </button>
                  </div>
                  <div className="mt-2 flex justify-end">
                    <button
                      onClick={() => { reset(); announce('Settings reset') }}
                      className="text-xs underline underline-offset-4 text-white/70 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded-lg px-2 py-2"
                    >
                      {t('reset')}
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <section aria-label={t('language')}>
              <div className="text-xs font-extrabold tracking-wider text-white/70 uppercase">{t('language')}</div>
              <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                <label className="block text-sm font-semibold" htmlFor="langSelect">{t('language')}</label>
                <div className="mt-2">
                  <Select
                    id="langSelect"
                    value={lang}
                    onChange={e => setLang(e.target.value as Lang)}
                    className="bg-white/10 text-white border-white/10"
                  >
                    {LANG_OPTIONS.map(o => (
                      <option key={o.code} value={o.code} className="text-slate-900">
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="mt-2 text-xs text-white/60">
                  Language can be changed without losing your session.
                </div>
              </div>
            </section>

            <section aria-label="Support">
              <div className="text-xs font-extrabold tracking-wider text-white/70 uppercase">Support</div>
              <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-white/70 space-y-2">
                <div>
                  • Use the Help page for procedural guidance.
                </div>
                <div>
                  • In a dispute, the assistant can answer questions and guide you through steps.
                </div>
              </div>
            </section>
          </div>
        </aside>
      </div>
    </>
  )
}
