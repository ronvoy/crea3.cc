import React from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../store/auth'
import { useI18n } from '../i18n'
import { useA11y } from './a11y-provider'
import { Button, Pill } from './ui'
import { getRecentDisputes } from '../utils/recent'

function Logo() {
  return (
    <div className="flex items-center gap-2">
      <img
        src="/crea3-logo.png"
        alt="CREA3"
        className="h-9 w-9 rounded-xl bg-white/70 border border-white/20 object-contain"
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
      />
      <div>
        <div className="text-white font-semibold leading-tight">CREA3</div>
        <div className="text-white/60 text-xs">Dispute resolution platform</div>
      </div>
    </div>
  )
}

const itemBase = 'flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition'
const item = ({ isActive }: { isActive: boolean }) =>
  `${itemBase} ${isActive ? 'bg-white/10 text-white font-medium' : 'text-white/70 hover:bg-white/8 hover:text-white'}`

type FontScale = 100 | 112 | 125 | 150
function nextUp(v: FontScale): FontScale { return v === 100 ? 112 : v === 112 ? 125 : 150 }
function nextDown(v: FontScale): FontScale { return v === 150 ? 125 : v === 125 ? 112 : 100 }

// ── Shared nav content ────────────────────────────────────────────────────────
function SidebarContent({ onNavClick }: { onNavClick?: () => void }) {
  const { t } = useI18n()
  const { user, logout } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const {
    lightMode, highContrast, reduceMotion, fontScale,
    setLightMode, setHighContrast, setReduceMotion, setFontScale,
  } = useA11y()

  const recents = React.useMemo(() => {
    try { return getRecentDisputes() } catch { return [] }
  }, [loc.pathname])

  const go = (path: string) => { onNavClick?.(); nav(path) }

  // Button style for quick-settings toggles: active state uses a tinted ring
  const qBtn = (active: boolean) =>
    `flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs border transition w-full justify-start ` +
    (active
      ? 'bg-white/15 border-white/25 text-white font-medium'
      : 'bg-white/5 border-white/10 text-white/65 hover:bg-white/10 hover:text-white')

  return (
    <div className="flex flex-col h-full">
      <Logo />

      <nav className="mt-5 space-y-0.5">
        <NavLink to="/app" end className={item} onClick={onNavClick}>{t('navMyDisputes')}</NavLink>
        <NavLink to="/app/mediators" className={item} onClick={onNavClick}>{t('navMediators')}</NavLink>
        <NavLink to="/app/faq" className={item} onClick={onNavClick}>{t('navFaqs')}</NavLink>
        <NavLink to="/app/scope" className={item} onClick={onNavClick}>{t('navScope')}</NavLink>
        <NavLink to="/app/partners" className={item} onClick={onNavClick}>{t('navPartners')}</NavLink>
        <NavLink to="/app/account" className={item} onClick={onNavClick}>{t('navAccount')}</NavLink>
        <NavLink to="/app/others" className={item} onClick={onNavClick}>{t('navOtherResources')}</NavLink>
      </nav>

      <div className="mt-5 grid gap-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold text-white">Quick actions</div>
          </div>
          <div className="grid gap-2">
            <Button
              variant="ghost"
              className="w-full justify-start bg-white/5 border border-white/10 text-white hover:bg-white/10"
              onClick={() => go('/app')}
            >
              + Create / open a dispute
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start bg-white/5 border border-white/10 text-white hover:bg-white/10"
              onClick={() => go('/app/faq')}
            >
              Help & procedural guidance
            </Button>
          </div>
        </div>

        {recents.length > 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-white">Recent disputes</div>
              <span className="text-[11px] text-white/60">last opened</span>
            </div>
            <div className="mt-2 space-y-0.5">
              {recents.slice(0, 4).map((d) => (
                <NavLink
                  key={d.id}
                  to={`/app/disputes/${d.id}`}
                  className="block rounded-xl px-3 py-2 text-sm text-white/80 hover:text-white hover:bg-white/10 transition"
                  title={d.title}
                  onClick={onNavClick}
                >
                  <div className="truncate">{d.title || `Dispute #${d.id}`}</div>
                  <div className="text-[11px] text-white/50">ID {d.id}</div>
                </NavLink>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
          <div className="text-sm font-semibold text-white">Support</div>
          <div className="mt-1 text-xs text-white/65">
            For assistance, contact
            <div className="mt-1">
              <a className="text-white/85 underline underline-offset-2" href="mailto:albertomoccardi@gmail.com">
                albertomoccardi@gmail.com
              </a>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Pill>WCAG AA</Pill>
            <Pill>Keyboard</Pill>
            <Pill>Screen reader</Pill>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
          <div className="text-sm font-semibold text-white">{t('navPartners')}</div>
          <div className="mt-2 rounded-xl border border-white/10 bg-white/5 p-2">
            <img
              src="/partners.png"
              alt="Project partners"
              className="w-full h-auto rounded-lg opacity-90"
              loading="lazy"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
            />
          </div>
        </div>

        {/* ── Accessibility / theme controls (mobile only — hidden on md+) ── */}
        <div className="md:hidden rounded-2xl border border-white/10 bg-white/5 p-3">
          <div className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">
            Settings
          </div>

          {/* 2-column grid of toggle buttons */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setLightMode(!lightMode)}
              className={qBtn(lightMode)}
              aria-pressed={lightMode}
            >
              <span className="text-base">{lightMode ? '🌙' : '☀️'}</span>
              <span>{lightMode ? 'Dark mode' : 'Light mode'}</span>
            </button>

            <button
              type="button"
              onClick={() => setHighContrast(!highContrast)}
              className={qBtn(highContrast)}
              aria-pressed={highContrast}
            >
              <span className="text-base">◐</span>
              <span>High contrast</span>
            </button>

            <button
              type="button"
              onClick={() => setReduceMotion(!reduceMotion)}
              className={qBtn(reduceMotion)}
              aria-pressed={reduceMotion}
            >
              <span className="text-base">≋</span>
              <span>Reduce motion</span>
            </button>

            <button
              type="button"
              onClick={() => { onNavClick?.(); window.dispatchEvent(new Event('crea3-open-settings')) }}
              className={qBtn(false)}
            >
              <span className="text-base">⚙️</span>
              <span>Full settings</span>
            </button>
          </div>

          {/* Font size row */}
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFontScale(nextDown(fontScale))}
              className="flex-none w-9 h-9 rounded-xl border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white transition text-sm font-bold flex items-center justify-center"
              aria-label="Decrease font size"
            >
              A−
            </button>
            <div className="flex-1 text-center text-xs text-white/60">{fontScale}% font size</div>
            <button
              type="button"
              onClick={() => setFontScale(nextUp(fontScale))}
              className="flex-none w-9 h-9 rounded-xl border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white transition text-sm font-bold flex items-center justify-center"
              aria-label="Increase font size"
            >
              A+
            </button>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-3">
        <div className="text-xs text-white/60">Signed in as</div>
        <div className="mt-1 text-white font-medium">{user?.username}</div>
        <div className="text-white/60 text-xs">{user?.email}</div>
        <div className="mt-2 flex items-center gap-2">
          <Pill>{user?.role ?? 'user'}</Pill>
        </div>
      </div>

      <div className="mt-auto pt-4">
        <Button
          variant="ghost"
          className="w-full bg-white/5 border border-white/10 text-white hover:bg-white/10"
          onClick={() => { logout(); nav('/') }}
        >
          Logout
        </Button>
      </div>
    </div>
  )
}

// ── Sidebar shell ─────────────────────────────────────────────────────────────
interface SidebarProps { open: boolean; onClose: () => void }

export default function Sidebar({ open, onClose }: SidebarProps) {
  return (
    <>
      {/*
        ── Mobile drawer ────────────────────────────────────────────────────
        Always rendered so CSS transitions play. Slides in/out via translate-x.
        z-50 in the ROOT stacking context (parent wrapper has no z-index).
        The panel background uses .sidebar-mobile-panel so CSS can swap it for
        light mode without relying on Tailwind's backdrop-filter stack.
      */}
      <aside
        className={[
          'fixed inset-y-0 left-0 z-50 flex flex-col w-[280px] md:hidden',
          'transition-transform duration-300 ease-in-out',
          open ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
        aria-label="Navigation"
        aria-hidden={!open}
        aria-modal={open}
      >
        <div className="sidebar-mobile-panel flex flex-col h-full overflow-y-auto p-4 shadow-2xl">
          {/* Close button row */}
          <div className="flex items-center justify-between mb-4 flex-shrink-0">
            <span className="text-white/50 text-xs uppercase tracking-wider font-semibold">Menu</span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close navigation"
              className="p-2 rounded-xl border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white transition"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <SidebarContent onNavClick={onClose} />
        </div>
      </aside>

      {/* ── Desktop sidebar (in grid flow) ───────────────────────────────── */}
      <aside className="hidden md:flex md:flex-col" aria-label="Navigation">
        <div className="h-full rounded-3xl border border-white/10 bg-slate-950/30 backdrop-blur p-4 shadow-sm overflow-y-auto">
          <SidebarContent />
        </div>
      </aside>
    </>
  )
}
