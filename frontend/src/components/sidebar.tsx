import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../store/auth'
import { Button, Pill } from './ui'

function Logo() {
  return (
    <div className="flex items-center gap-2">
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
    </div>
  )
}

const itemBase = "flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition"
const item = ({ isActive }: { isActive: boolean }) =>
  `${itemBase} ${isActive ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'}`

export default function Sidebar() {
  const { user, logout } = useAuth()
  const nav = useNavigate()

  return (
    <aside className="hidden md:flex md:flex-col md:w-[260px] md:shrink-0">
      <div className="h-full rounded-3xl border border-white/10 bg-slate-950/30 backdrop-blur p-4 shadow-sm">
        <Logo />

        <div className="mt-5 space-y-1">
          <NavLink to="/app" className={item}>My disputes</NavLink>
          <NavLink to="/app/mediators" className={item}>Mediators</NavLink>
          <NavLink to="/app/faq" className={item}>FAQs</NavLink>
          <NavLink to="/app/scope" className={item}>Scope</NavLink>
          <NavLink to="/app/partners" className={item}>Partners</NavLink>
          <NavLink to="/app/account" className={item}>Account</NavLink>
          <NavLink to="/app/others" className={item}>Other resources</NavLink>
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
