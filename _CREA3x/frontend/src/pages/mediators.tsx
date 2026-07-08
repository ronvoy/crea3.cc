import React, { useEffect, useState } from 'react'
import { Card, CardHeader, ErrorBox, Pill } from '../components/ui'
import { api } from '../api/client'
import { useI18n } from '../i18n'

type Mediator = {
  id: number
  email: string
  username: string
  role: string
  country?: string | null
  locale?: string | null
  timezone?: string | null
}

const COUNTRY_NAMES: Record<string, string> = {
  IT: 'Italy', BE: 'Belgium', HR: 'Croatia', LT: 'Lithuania', SI: 'Slovenia', EE: 'Estonia',
  FR: 'France', DE: 'Germany', ES: 'Spain', PT: 'Portugal', NL: 'Netherlands', AT: 'Austria',
  IE: 'Ireland', GR: 'Greece', PL: 'Poland', RO: 'Romania', SE: 'Sweden', FI: 'Finland', DK: 'Denmark',
}
const LANG_NAMES: Record<string, string> = {
  en: 'English', it: 'Italian', sl: 'Slovenian', et: 'Estonian', be: 'French', lt: 'Lithuanian',
  hr: 'Croatian', fr: 'French', de: 'German', es: 'Spanish', nl: 'Dutch', pt: 'Portuguese',
}
const COUNTRY_LANG: Record<string, string> = { IT: 'it', BE: 'fr', HR: 'hr', LT: 'lt', SI: 'sl', EE: 'et', FR: 'fr' }

function flagEmoji(code?: string | null): string {
  if (!code || code.length !== 2) return '🌍'
  const base = 0x1f1e6
  const cc = code.toUpperCase()
  return String.fromCodePoint(base + (cc.charCodeAt(0) - 65), base + (cc.charCodeAt(1) - 65))
}

const Icon = (d: string) => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
)
const MAIL = 'M4 6h16v12H4zM4 7l8 6 8-6'
const GLOBE = 'M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3C9.5 5.7 9.5 18.3 12 21'
const PIN = 'M12 21s-7-5.5-7-11a7 7 0 0114 0c0 5.5-7 11-7 11zM12 12a2.5 2.5 0 100-5 2.5 2.5 0 000 5z'

export default function MediatorsPage() {
  const { t } = useI18n()
  const [items, setItems] = useState<Mediator[]>([])
  const [err, setErr] = useState<string | null>(null)

  async function load() {
    setErr(null)
    try {
      setItems(await api('/api/users/mediators'))
    } catch (e: any) {
      setErr(t('mediatorsLoadError'))
    }
  }
  useEffect(() => { load() }, [])

  function languageOf(m: Mediator): string {
    const code = m.locale || (m.country ? COUNTRY_LANG[m.country.toUpperCase()] : '') || ''
    return code ? (LANG_NAMES[code] || code.toUpperCase()) : t('mediatorsNotSpecified')
  }
  function countryOf(m: Mediator): string {
    if (!m.country) return t('mediatorsNotSpecified')
    return COUNTRY_NAMES[m.country.toUpperCase()] || m.country.toUpperCase()
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader title={t('mediatorsTitle')} subtitle={t('mediatorsSubtitle')} />
        <div className="p-5">
          <p className="max-w-3xl text-sm leading-relaxed text-slate-600">{t('mediatorsIntro')}</p>

          <div className="mt-5">
            <ErrorBox message={err} />
          </div>

          {items.length === 0 && !err ? (
            <div className="mt-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
              {t('mediatorsEmpty')}
            </div>
          ) : (
            <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((m) => (
                <div key={m.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue-50 text-base font-semibold text-blue-700 ring-1 ring-blue-100">
                      {(m.username?.[0] || 'M').toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-slate-900">{m.username}</div>
                      <Pill className="mt-0.5">{m.role}</Pill>
                    </div>
                    <span className="ml-auto text-2xl leading-none" title={countryOf(m)}>{flagEmoji(m.country)}</span>
                  </div>

                  <dl className="mt-4 space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      {Icon(MAIL)}
                      <a href={`mailto:${m.email}`} className="truncate text-slate-700 underline-offset-2 hover:text-blue-700 hover:underline">
                        {m.email}
                      </a>
                    </div>
                    <div className="flex items-center gap-2">
                      {Icon(GLOBE)}
                      <span className="text-slate-700"><span className="text-slate-500">{t('mediatorsLanguages')}:</span> {languageOf(m)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {Icon(PIN)}
                      <span className="text-slate-700"><span className="text-slate-500">{t('mediatorsCountry')}:</span> {countryOf(m)}</span>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm font-semibold text-slate-900">{t('mediatorsTipTitle')}</div>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">{t('mediatorsTipBody')}</p>
          </div>
        </div>
      </Card>
    </div>
  )
}
