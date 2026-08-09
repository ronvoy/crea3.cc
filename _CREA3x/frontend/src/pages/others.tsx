import React from 'react'
import { Link } from 'react-router-dom'
import { Card, CardHeader } from '../components/ui'
import { useI18n } from '../i18n'

const projectWebsite = import.meta.env.VITE_PROJECT_WEBSITE || ''

type Res = { to?: string; href?: string; title: string; body: string; icon: React.ReactNode }

const Icon = (d: string) => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
)

const ICONS = {
  scope: 'M12 3l9 4-9 4-9-4 9-4zM3 12l9 4 9-4M3 17l9 4 9-4',
  partners: 'M9 11a3 3 0 100-6 3 3 0 000 6zM2 20a7 7 0 0114 0M17 11a3 3 0 10-1-5.8M22 20a7 7 0 00-5-6.7',
  faq: 'M9.1 9a3 3 0 015.8 1c0 2-3 3-3 3M12 17h.01M12 21a9 9 0 110-18 9 9 0 010 18z',
  legal: 'M12 3v18M5 7h14M7 7l-3 6a3 3 0 006 0L7 7zM17 7l-3 6a3 3 0 006 0l-3-6z',
  mediators: 'M3 6h13a2 2 0 012 2v6a2 2 0 01-2 2H8l-4 3V6zM7 10h8M7 13h5',
  account: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
  ext: 'M14 4h6v6M20 4l-9 9M19 13v6a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1h6',
}

function ResourceTile({ r }: { r: Res }) {
  const inner = (
    <div className="group flex h-full gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-100">{r.icon}</div>
      <div className="min-w-0">
        <div className="flex items-center gap-1 font-semibold text-slate-900">
          {r.title}
          {r.href ? <span className="text-slate-400 transition group-hover:text-blue-600">↗</span> : null}
        </div>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">{r.body}</p>
      </div>
    </div>
  )
  if (r.to) return <Link to={r.to} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded-2xl">{inner}</Link>
  return (
    <a href={r.href} target="_blank" rel="noreferrer" className="block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
      {inner}
    </a>
  )
}

export default function Others() {
  const { t } = useI18n()
  const c = {
    intro: t('othersIntro'),
    onPlatform: t('othersOnPlatform'),
    references: t('othersReferences'),
    refsIntro: t('othersRefsIntro'),
    internal: [
      { to: '/app/scope', title: t('othersInt1Title'), body: t('othersInt1Body'), icon: Icon(ICONS.scope) },
      { to: '/app/partners', title: t('othersInt2Title'), body: t('othersInt2Body'), icon: Icon(ICONS.partners) },
      { to: '/app/mediators', title: t('othersInt3Title'), body: t('othersInt3Body'), icon: Icon(ICONS.mediators) },
      { to: '/app/faq', title: t('othersInt4Title'), body: t('othersInt4Body'), icon: Icon(ICONS.faq) },
      { to: '/app/account', title: t('othersInt5Title'), body: t('othersInt5Body'), icon: Icon(ICONS.account) },
    ] as Res[],
    external: [
      { href: 'https://e-justice.europa.eu', title: t('othersExt1Title'), body: t('othersExt1Body'), icon: Icon(ICONS.ext) },
      { href: 'https://eur-lex.europa.eu', title: t('othersExt2Title'), body: t('othersExt2Body'), icon: Icon(ICONS.ext) },
      { href: 'https://europa.eu/youreurope', title: t('othersExt3Title'), body: t('othersExt3Body'), icon: Icon(ICONS.ext) },
    ] as Res[],
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader title={t('othersTitle')} subtitle={c.intro} />
        <div className="p-5">
          <div className="text-sm font-semibold uppercase tracking-wide text-slate-500">{c.references}</div>
          <p className="mt-1 text-sm text-slate-600">{c.refsIntro}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {c.external.map((r) => (
              <ResourceTile key={r.title} r={r} />
            ))}
            {projectWebsite ? (
              <ResourceTile
                r={{
                  href: projectWebsite,
                  title: t('othersWebsiteTitle'),
                  body: t('othersWebsiteBody'),
                  icon: Icon(ICONS.ext),
                }}
              />
            ) : null}
          </div>
        </div>
      </Card>
    </div>
  )
}
