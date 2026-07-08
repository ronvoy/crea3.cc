import React, { useEffect, useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../store/auth'
import { useI18n } from '../i18n'
import { Button } from './ui'

type Country = { code: string; name: string }

// Maps backend locale codes to the app's i18n Lang union.
function localeToLang(locale?: string | null): any {
  const m: Record<string, string> = { en: 'en', it: 'it', sl: 'sl', et: 'et', be: 'be', lt: 'lt', hr: 'hr' }
  return locale && m[locale] ? m[locale] : null
}

/**
 * Prompts the user to choose their country on first login (when no country is
 * set yet). Country auto-sets timezone + default language. Rendered globally;
 * shows nothing once a country is set.
 */
export function CountryOnboarding() {
  const { user, loadMe } = useAuth()
  const { t, setLang } = useI18n()
  const [countries, setCountries] = useState<Country[]>([])
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const needsCountry = !!user && !user.country

  useEffect(() => {
    if (!needsCountry) return
    api('/api/users/countries').then((c) => setCountries(Array.isArray(c) ? c : [])).catch(() => setCountries([]))
  }, [needsCountry])

  if (!needsCountry) return null

  async function save() {
    if (!code) { setErr(t('selectCountryError')); return }
    setBusy(true); setErr(null)
    try {
      const updated = await api('/api/users/me/profile', { method: 'PATCH', body: { country: code } })
      const lang = localeToLang(updated?.locale)
      if (lang) setLang(lang) // apply country's default language
      await loadMe()
    } catch (e: any) {
      setErr(e?.message || 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-slate-50 p-6 shadow-xl">
        <div className="text-lg font-semibold text-slate-900">{t('onboardingTitle')}</div>
        <div className="text-sm text-slate-600 mt-1">{t('onboardingHint')}</div>

        <label className="block text-sm font-medium text-slate-700 mt-4">{t('countryLabel')}</label>
        <select
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        >
          <option value="">{t('selectCountryPlaceholder')}</option>
          {countries.map((c) => (
            <option key={c.code} value={c.code}>{c.name}</option>
          ))}
        </select>

        {err ? <div className="mt-2 text-sm text-rose-600">{err}</div> : null}

        <div className="mt-5 flex justify-end">
          <Button onClick={save} disabled={busy || !code}>
            {busy ? t('savingWord') : t('continueWord')}
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * The country/timezone control for the Account page (editable any time).
 */
export function CountrySettings() {
  const { user, loadMe } = useAuth()
  const { t, setLang } = useI18n()
  const [countries, setCountries] = useState<Country[]>([])
  const [code, setCode] = useState(user?.country || '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    api('/api/users/countries').then((c) => setCountries(Array.isArray(c) ? c : [])).catch(() => setCountries([]))
  }, [])
  useEffect(() => { setCode(user?.country || '') }, [user?.country])

  async function save() {
    setBusy(true); setMsg(null)
    try {
      const updated = await api('/api/users/me/profile', { method: 'PATCH', body: { country: code } })
      const lang = localeToLang(updated?.locale)
      if (lang) setLang(lang)
      await loadMe()
      setMsg(t('savedWord'))
    } catch (e: any) {
      setMsg(e?.message || 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-base font-semibold text-slate-900">{t('provenanceTitle')}</div>
      <div className="text-sm text-slate-600 mt-1">{t('provenanceHint')}</div>

      <div className="mt-3 grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-slate-700">{t('countryLabel')}</label>
          <select
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            <option value="">{t('selectCountryPlaceholder')}</option>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">{t('timezoneLabel')}</label>
          <div className="mt-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            {user?.timezone || 'UTC'}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <Button onClick={save} disabled={busy || !code || code === user?.country}>
          {busy ? t('savingWord') : t('saveWord')}
        </Button>
        {msg ? <span className="text-sm text-emerald-600">{msg}</span> : null}
      </div>
    </div>
  )
}

/**
 * Notification preferences (email opt-outs) for the Account page.
 */
export function NotificationSettings() {
  const { user, loadMe } = useAuth()
  const { t } = useI18n()
  const [inv, setInv] = useState(user?.notify_email_invitations ?? true)
  const [meet, setMeet] = useState(user?.notify_email_meetings ?? true)
  const [mile, setMile] = useState(user?.notify_email_milestones ?? true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    setInv(user?.notify_email_invitations ?? true)
    setMeet(user?.notify_email_meetings ?? true)
    setMile(user?.notify_email_milestones ?? true)
  }, [user?.notify_email_invitations, user?.notify_email_meetings, user?.notify_email_milestones])

  async function save() {
    setBusy(true); setMsg(null)
    try {
      await api('/api/users/me/profile', { method: 'PATCH', body: {
        notify_email_invitations: inv, notify_email_meetings: meet, notify_email_milestones: mile,
      } })
      await loadMe()
      setMsg(t('savedWord'))
    } catch (e: any) {
      setMsg(e?.message || 'Could not save')
    } finally { setBusy(false) }
  }

  const Row = ({ label, val, set }: { label: string; val: boolean; set: (b: boolean) => void }) => (
    <label className="flex items-center justify-between gap-3 py-1.5 cursor-pointer">
      <span className="text-sm text-slate-700">{label}</span>
      <input type="checkbox" checked={val} onChange={(e) => set(e.target.checked)} className="h-4 w-4" />
    </label>
  )

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-base font-semibold text-slate-900">{t('notifyPrefsTitle')}</div>
      <div className="text-sm text-slate-600 mt-1">{t('notifyPrefsHint')}</div>
      <div className="mt-3 divide-y divide-slate-100">
        <Row label={t('notifyInvitations')} val={inv} set={setInv} />
        <Row label={t('notifyMeetings')} val={meet} set={setMeet} />
        <Row label={t('notifyMilestones')} val={mile} set={setMile} />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Button onClick={save} disabled={busy}>{busy ? t('savingWord') : t('saveWord')}</Button>
        {msg ? <span className="text-sm text-emerald-600">{msg}</span> : null}
      </div>
    </div>
  )
}
