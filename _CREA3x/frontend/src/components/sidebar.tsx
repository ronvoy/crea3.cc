import React from 'react'
import { NavLink, Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../store/auth'
import { useI18n } from '../i18n'
import { Button, Pill } from './ui'
import { getRecentDisputes, removeRecentDispute, clearRecentDisputes } from '../utils/recent'
import DisputeStatusBadge from './dispute-status-badge'


function Logo() {
  return (
    <Link to="/app" aria-label="CREA3 — home" className="flex items-center gap-2 rounded-xl transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300">
      <img
        src="/crea3-logo.png"
        alt="CREA3"
        className="h-9 w-9 rounded-xl bg-white/70 border border-white/20 object-contain"
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none" }}
      />
      <div>
        <div className="text-white font-semibold leading-tight">CREA3</div>
        <div className="text-white/60 text-xs">Dispute resolution platform</div>
      </div>
    </Link>
  )
}

const itemBase = "flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition"
const item = ({ isActive }: { isActive: boolean }) =>
  `${itemBase} ${isActive ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'}`

export default function Sidebar() {
  const { t } = useI18n()
  const { user, logout } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const [recents, setRecents] = React.useState(() => {
    try { return getRecentDisputes() } catch { return [] }
  })
  React.useEffect(() => {
    try { setRecents(getRecentDisputes()) } catch { setRecents([]) }
  }, [loc.pathname])
  const removeRecent = (id: number) => setRecents(removeRecentDispute(id))
  const clearRecents = () => { clearRecentDisputes(); setRecents([]) }
  const activeId = (() => {
    const m = loc.pathname.match(/\/app\/disputes\/(\d+)/)
    return m ? Number(m[1]) : null
  })()

  return (
    <aside className="hidden md:flex md:flex-col md:w-[300px] md:shrink-0">
      <div className="h-full rounded-3xl border border-white/10 bg-slate-950/30 backdrop-blur p-4 shadow-sm">
        <Logo />

        <div className="mt-5 space-y-1">
          <NavLink to="/app" className={item}>{t('navMyDisputes')}</NavLink>
          <NavLink to="/app/legal-ai" className={item}>{t('navLegalAi')}</NavLink>
          <NavLink to="/app/mediators" className={item}>{t('navMediators')}</NavLink>
          <NavLink to="/app/faq" className={item}>{t('navFaqs')}</NavLink>
          <NavLink to="/app/scope" className={item}>{t('navScope')}</NavLink>
          <NavLink to="/app/partners" className={item}>{t('navPartners')}</NavLink>
          <NavLink to="/app/account" className={item}>{t('navAccount')}</NavLink>
          <NavLink to="/app/others" className={item}>{t('navOtherResources')}</NavLink>
        </div>


        <div className="mt-5 grid gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-white">Quick actions</div>
              <button
                type="button"
                className="text-xs text-white/70 hover:text-white underline underline-offset-2"
                onClick={() => window.dispatchEvent(new Event('crea3-open-settings'))}
              >
                Open settings
              </button>
            </div>
            <div className="mt-3 grid gap-2">
              <Button
                variant="ghost"
                className="w-full justify-start bg-white/5 border border-white/10 text-white hover:bg-white/10"
                onClick={() => nav('/app')}
              >
                + Create / open a dispute
              </Button>
              <Button
                variant="ghost"
                className="w-full justify-start bg-white/5 border border-white/10 text-white hover:bg-white/10"
                onClick={() => nav('/app/faq')}
              >
                Help & procedural guidance
              </Button>
            </div>
            <div className="mt-3 text-xs text-white/60">
              Tip: use <span className="font-semibold text-white/80">Tab</span> to navigate and <span className="font-semibold text-white/80">Enter</span> to activate.
            </div>
          </div>

          {recents.length > 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-white">{t('recentDisputesTitle')}</div>
                <button
                  type="button"
                  onClick={clearRecents}
                  className="text-[11px] text-white/60 underline underline-offset-2 hover:text-white/90"
                >
                  {t('recentClearAll')}
                </button>
              </div>
              <div className="mt-2 space-y-1">
                {recents.slice(0, 3).map((d) => {
                  const active = activeId === d.id
                  return (
                  <div
                    key={d.id}
                    className={`group flex items-center gap-1 rounded-xl border pr-1 transition ${active ? 'border-white/20 bg-white/10' : 'border-white/0 bg-white/0 hover:border-white/10 hover:bg-white/10'}`}
                  >
                    <NavLink
                      to={`/app/disputes/${d.id}`}
                      className="min-w-0 flex-1 rounded-xl px-3 py-2 text-sm text-white/85 hover:text-white"
                      title={d.title || `Dispute #${d.id}`}
                    >
                      <div className="truncate">{d.title || `Dispute #${d.id}`}</div>
                      <div className="mt-1">
                        <DisputeStatusBadge status={d.status} theme="dark" />
                      </div>
                    </NavLink>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        removeRecent(d.id)
                      }}
                      title={t('recentRemove')}
                      aria-label={t('recentRemove')}
                      className="shrink-0 rounded-lg p-2 text-white/40 transition hover:bg-rose-500/20 hover:text-rose-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13M10 11v6M14 11v6" />
                      </svg>
                    </button>
                  </div>
                  )
                })}
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="text-sm font-semibold text-white">{t('sidebarSupportTitle')}</div>
            <div className="mt-1 text-xs text-white/65">{t('sidebarSupportBody')}</div>
            <Button
              className="mt-3 w-full justify-center bg-white/10 border border-white/15 text-white hover:bg-white/15"
              onClick={() => nav('/app/support')}
            >
              {t('sidebarContactSupport')}
            </Button>
            <div className="mt-3 flex flex-wrap gap-2">
              <NavLink
                to="/app/faq"
                className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-medium text-white/80 transition hover:bg-white/15 hover:text-white"
              >
                {t('navFaqs')}
              </NavLink>
              <NavLink
                to="/app/legal-ai"
                className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-medium text-white/80 transition hover:bg-white/15 hover:text-white"
              >
                {t('navLegalAi')}
              </NavLink>
              <NavLink
                to="/app/mediators"
                className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-medium text-white/80 transition hover:bg-white/15 hover:text-white"
              >
                {t('navMediators')}
              </NavLink>
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
            onClick={() => { logout(); nav('/'); }}
          >
            Logout
          </Button>
        </div>
      </div>
    </aside>
  )
}
