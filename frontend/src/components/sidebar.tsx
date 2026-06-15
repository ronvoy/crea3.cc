import React from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../store/auth'
import { useI18n } from '../i18n'
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
  `${itemBase} ${isActive ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'}`

// Inner content shared between mobile drawer and desktop sidebar
function SidebarContent({ onNavClick }: { onNavClick?: () => void }) {
  const { t } = useI18n()
  const { user, logout } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const recents = React.useMemo(() => {
    try { return getRecentDisputes() } catch { return [] }
  }, [loc.pathname])

  const go = (path: string) => { onNavClick?.(); nav(path) }

  return (
    <>
      <Logo />

      <nav className="mt-5 space-y-1">
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
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-white">Quick actions</div>
            <button
              type="button"
              className="text-xs text-white/70 hover:text-white underline underline-offset-2"
              onClick={() => { onNavClick?.(); window.dispatchEvent(new Event('crea3-open-settings')) }}
            >
              Open settings
            </button>
          </div>
          <div className="mt-3 grid gap-2">
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
          <div className="mt-3 text-xs text-white/60">
            Tip: use <span className="font-semibold text-white/80">Tab</span> to navigate and{' '}
            <span className="font-semibold text-white/80">Enter</span> to activate.
          </div>
        </div>

        {recents.length > 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-white">Recent disputes</div>
              <span className="text-[11px] text-white/60">last opened</span>
            </div>
            <div className="mt-2 space-y-1">
              {recents.slice(0, 4).map((d) => (
                <NavLink
                  key={d.id}
                  to={`/app/disputes/${d.id}`}
                  className="block rounded-xl px-3 py-2 text-sm text-white/85 hover:text-white bg-white/0 hover:bg-white/10 border border-white/0 hover:border-white/10 transition"
                  title={d.title}
                  onClick={onNavClick}
                >
                  <div className="truncate">{d.title || `Dispute #${d.id}`}</div>
                  <div className="text-[11px] text-white/55">ID {d.id}</div>
                </NavLink>
              ))}
            </div>
          </div>
        ) : null}

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
          <div className="mt-2 rounded-xl border border-white/10 bg-white/3 p-2">
            <img
              src="/partners.png"
              alt="Project partners"
              className="w-full h-auto rounded-lg opacity-90"
              loading="lazy"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
            />
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
    </>
  )
}

interface SidebarProps {
  open: boolean
  onClose: () => void
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  return (
    <>
      {/* ── Mobile drawer (fixed overlay, hidden on md+) ────────────────── */}
      <aside
        className={[
          'fixed inset-y-0 left-0 z-50 flex flex-col w-[280px]',
          'md:hidden',
          'transition-transform duration-300 ease-in-out',
          open ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
        aria-label="Navigation"
        aria-hidden={!open}
      >
        <div className="flex flex-col h-full overflow-y-auto rounded-r-3xl border-r border-white/10 bg-slate-950/95 backdrop-blur p-4 shadow-2xl">
          {/* Close button */}
          <div className="flex justify-end mb-3">
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

      {/* ── Desktop sidebar (in grid flow, hidden on mobile) ────────────── */}
      <aside className="hidden md:flex md:flex-col" aria-label="Navigation">
        <div className="h-full rounded-3xl border border-white/10 bg-slate-950/30 backdrop-blur p-4 shadow-sm">
          <SidebarContent />
        </div>
      </aside>
    </>
  )
}
