import React from 'react'
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../store/auth'
import { api } from '../api/client'
import { Button, Pill } from './ui'
import ChatWidget from './chat'
import NotificationsBell from './notifications'
import NetworkBackground from './background'
import Sidebar from './sidebar'

export function Shell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  return (
    <div className="min-h-screen flex flex-col relative">
      <NetworkBackground />
      <Header />
      <main className="flex-1 relative z-10">
        <div className="mx-auto max-w-6xl p-4">{children}</div>
      </main>
      <Footer />
      {user ? <ChatWidget /> : null}
    </div>
  )
}

export function Header() {
  const { user, logout } = useAuth()
  const nav = useNavigate()
  return (
    <header className="sticky top-0 z-30 bg-slate-950/40 backdrop-blur border-b border-white/10">
      <div className="mx-auto max-w-6xl px-4 py-3 text-white flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <img src="/crea-logo.jpeg" alt="CREA3" className="h-8 w-8 rounded-lg object-contain bg-slate-950/30 backdrop-blur border border-slate-200" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none" }} />
          <span className="text-white font-semibold text-lg">CREA3</span>
        </Link>
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <NotificationsBell />
              <nav className="hidden sm:flex items-center gap-2">
                <NavLink to="/app" className={({isActive}) => `px-2 py-1 rounded-lg text-sm ${isActive ? 'bg-slate-100' : ''}`}>Home</NavLink>
                <NavLink to="/app/faq" className={({isActive}) => `px-2 py-1 rounded-lg text-sm ${isActive ? 'bg-slate-100' : ''}`}>FAQs</NavLink>
              </nav>
              <Pill>{user.role}</Pill>
              <div className="text-sm text-white/70">{user.username}</div>
              <Button variant="ghost" onClick={() => { logout(); nav('/'); }}>Logout</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => nav('/login')}>Login</Button>
              <Button onClick={() => nav('/register')}>Register</Button>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

export function Footer() {
  const [summary, setSummary] = React.useState<{ visits: number; registered_users: number; disputes: number } | null>(null)

  React.useEffect(() => {
    api('/api/metrics/summary').then(setSummary).catch(() => {})
  }, [])

  return (
    <footer className="border-t relative z-10 border-slate-200 bg-slate-950/30 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 py-6 text-sm text-white/70">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="max-w-3xl">
            <div className="flex items-center gap-3">
              <div>© {new Date().getFullYear()} CREA3</div>
              {summary ? (
                <div className="text-xs text-white/55">
                  • Visits: <span className="text-white/80">{summary.visits}</span>
                  {' '}• Users: <span className="text-white/80">{summary.registered_users}</span>
                </div>
              ) : null}
            </div>

            <div className="text-xs text-white/55 mt-2 leading-relaxed">
              CREA2 project builds on the results of CREA (2017–19) and introduces AI-driven tools and innovative
              game-theoretical algorithms to guide parties step-by-step through dispute resolution procedures, including
              smart conversational assistance and certified agreements via smart-contract blockchain technology.
            </div>

            <div className="text-xs mt-3 flex flex-wrap gap-3">
              <a className="text-white/70 hover:text-white" href="/scope">Scope</a>
              <a className="text-white/70 hover:text-white" href="/partners">Partners</a>
              <a className="text-white/70 hover:text-white" href="/app/faq">FAQs</a>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <a href="mailto:contact@example.com" className="hover:text-white">Contact</a>
            <a href="https://example.com/legal" target="_blank" rel="noreferrer" className="hover:text-white">Legal</a>
          </div>
        </div>
      </div>
    </footer>
  )
}


