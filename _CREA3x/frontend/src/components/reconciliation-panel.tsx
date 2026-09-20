import React, { useEffect, useState } from 'react'
import { Input, HelpTip } from './ui'
import { api } from '../api/client'
import { useI18n } from '../i18n'

type ValueItem = {
  good_id: number
  good_name: string
  valuations: Record<string, number>
  mean: number
  gap: number
  responses: Record<string, number | null>
  settled_to_mean: boolean
  settled_value: number | null
  settled_kind?: 'majority' | 'mean' | null
  all_responded: boolean
}
type OmittedItem = {
  good_id: number
  good_name: string
  estimated_value: number
  acknowledged_by_names: string[]
  omitted_by: number[]
  omitted_by_names: string[]
  values_by_ack: Record<string, number>
  responses: Record<string, { value_amount: number | null; stars: number | null } | null>
}
type Recon = {
  value_items: ValueItem[]
  omitted_items: OmittedItem[]
  agents: { id: number; name: string }[]
  complete: boolean
  has_items: boolean
}

// € with European thousands separators (1000 -> 1.000).
function money(v: number) {
  try { return '€' + Number(v).toLocaleString('it-IT', { maximumFractionDigits: 2 }) } catch { return '€' + v }
}
// Group a raw typed string into thousands with dots (digits only).
function groupThousands(s: string) {
  const d = (s || '').replace(/\D/g, '')
  return d ? d.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : ''
}
function parseGrouped(s: string): number | null {
  const d = (s || '').replace(/\./g, '').replace(/\s/g, '').trim()
  if (d === '' || Number.isNaN(Number(d))) return null
  return Number(d)
}

const GREEN =
  'rounded-xl px-4 py-2 min-h-[44px] text-sm font-semibold bg-emerald-600 text-white border border-emerald-600 transition hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed'
const OUTLINE =
  'rounded-xl px-4 py-2 min-h-[44px] text-sm font-medium bg-white text-slate-700 border border-slate-300 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:opacity-50 disabled:cursor-not-allowed'

export default function ReconciliationPanel({
  disputeId,
  myAgentId,
  isMediator,
  onProposalGenerated,
}: {
  disputeId: number | string
  myAgentId: number | null
  isMediator: boolean
  onProposalGenerated: () => void
}) {
  const { t } = useI18n()
  const [recon, setRecon] = useState<Recon | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [omitDraft, setOmitDraft] = useState<Record<number, string>>({})

  async function load() {
    try {
      const r = await api(`/api/disputes/${disputeId}/reconciliation`)
      setRecon(r)
    } catch (e: any) {
      setErr(e.message)
    }
  }
  useEffect(() => { load() }, [disputeId]) // eslint-disable-line

  async function respondValue(goodId: number, choice: 'mean' | 'other' | 'keep') {
    setErr(null); setBusy(true)
    try {
      const r = await api(`/api/disputes/${disputeId}/reconciliation/value`, { method: 'POST', body: { good_id: goodId, choice } })
      setRecon(r)
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }

  async function respondOmitted(goodId: number, value: string, decline = false) {
    setErr(null); setBusy(true)
    try {
      const body: any = { good_id: goodId }
      const n = parseGrouped(value)
      if (!decline && n != null) body.value_amount = n
      const r = await api(`/api/disputes/${disputeId}/reconciliation/omitted`, { method: 'POST', body })
      setRecon(r)
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }

  async function finalize() {
    setErr(null); setBusy(true)
    try {
      await api(`/api/disputes/${disputeId}/reconciliation/finalize`, { method: 'POST' })
      onProposalGenerated()
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }

  if (!recon) {
    return <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">{t('loading')}…</div>
  }

  const myId = myAgentId != null ? String(myAgentId) : null
  const nameById = Object.fromEntries(recon.agents.map(a => [String(a.id), a.name]))

  // Have I responded to every item that concerns me? (used to show "waiting for
  // the other party" once my part is done but others haven't responded.)
  let iRespondedAllMine = true
  if (myId != null && !isMediator) {
    for (const it of recon.value_items) {
      if (myId in it.valuations && (it.responses[myId] === null || it.responses[myId] === undefined)) iRespondedAllMine = false
    }
    for (const it of recon.omitted_items) {
      if (it.omitted_by.map(String).includes(myId)) {
        const r = it.responses[myId]
        if (r === null || r === undefined) iRespondedAllMine = false
      }
    }
  }

  if (!recon.has_items) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="text-base font-semibold text-slate-900">{t('reconcileTitle')}</div>
        <div className="text-sm text-slate-600 mt-1">{t('reconcileNothing')}</div>
        {!isMediator ? (
          <button type="button" className={`${GREEN} mt-4`} onClick={finalize} disabled={busy}>{t('reconcileFinish')}</button>
        ) : null}
        {err ? <div className="mt-2 text-sm text-rose-700">{err}</div> : null}
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-5">
      <div>
        <div className="text-base font-semibold text-slate-900">{t('reconcileTitle')}</div>
        <div className="text-sm text-slate-600 mt-1">{t('reconcileIntro')}</div>
        <div className="text-xs text-slate-500 mt-1">{t('reconcileOptionalNote')}</div>
      </div>

      {/* VALUE disagreements — both parties must accept the average for it to apply. */}
      {recon.value_items.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center gap-1"><div className="text-sm font-semibold text-slate-800">{t('reconcileValuesHeading')}</div><HelpTip text={t('helpReconcileValues')} /></div>
          {recon.value_items.map(item => {
            const iAmParty = myId != null && myId in item.valuations
            const myResp = myId != null ? item.responses[myId] : undefined
            const iResponded = myResp !== undefined && myResp !== null
            const otherEntries = Object.entries(item.valuations).filter(([aid]) => aid !== myId)
            const otherName = otherEntries.length === 1 ? (nameById[otherEntries[0][0]] || `#${otherEntries[0][0]}`) : t('reconcileCounterpartValue')
            const otherVal = otherEntries.length
              ? (otherEntries.length === 1 ? otherEntries[0][1] : Math.round(otherEntries.reduce((s, [, v]) => s + Number(v), 0) / otherEntries.length))
              : item.mean
            const myOwn = myId != null ? item.valuations[myId] : undefined
            const near = (a: any, b: any) => a != null && b != null && Math.abs(Number(a) - Number(b)) < 0.01
            const myChoice: string | null = !iResponded ? null : (near(myResp, item.mean) ? 'mean' : near(myResp, otherVal) ? 'other' : near(myResp, myOwn) ? 'keep' : null)
            const overall = item.settled_to_mean
              ? <span className="text-emerald-700">{t('reconcileSettledAt')}: <b>{money(item.settled_value ?? item.mean)}</b> <span className="text-xs text-slate-500">({item.settled_kind === 'majority' ? t('reconcileByMajority') : t('reconcileByMean')})</span></span>
              : item.all_responded
                ? <span className="text-slate-600">{t('reconcileDivergentKept')}</span>
                : <span className="text-amber-700">{t('reconcileWaitingOther')}</span>
            return (
              <div key={item.good_id} className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                <div className="font-medium text-slate-900">{item.good_name}</div>
                <div className="mt-1 text-sm text-slate-700 flex flex-wrap gap-x-4 gap-y-1">
                  {Object.entries(item.valuations).map(([aid, v]) => (
                    <span key={aid}>
                      {nameById[aid] || `#${aid}`}{aid === myId ? ` (${t('youWord')})` : ''}: <b>{money(v)}</b>
                    </span>
                  ))}
                  <span className="text-amber-800">{t('reconcileGap')}: {money(item.gap)}</span>
                </div>
                {iAmParty && !isMediator ? (
                  <div className="mt-2 space-y-2">
                    <div className="text-xs text-slate-600">
                      {iResponded ? (
                        <>
                          <span className="text-emerald-700">✓ {t('reconcileYourChoice')}: {money(Number(myResp))}</span>
                          <span className="text-slate-400"> · </span>
                          {overall}
                          <span className="text-slate-400"> · </span>
                          <span className="text-slate-500">{t('reconcileCanChange')}</span>
                        </>
                      ) : (
                        t('reconcileCreatorPrompt')
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" className={`${GREEN} ${myChoice === 'mean' ? 'ring-2 ring-offset-1 ring-blue-500' : ''}`} onClick={() => respondValue(item.good_id, 'mean')} disabled={busy}>
                        {t('reconcileAcceptMean')} ({money(item.mean)})
                      </button>
                      <button type="button" className={`${GREEN} ${myChoice === 'other' ? 'ring-2 ring-offset-1 ring-blue-500' : ''}`} onClick={() => respondValue(item.good_id, 'other')} disabled={busy}>
                        {t('reconcileAgreeWith')} {otherName} ({money(otherVal)})
                      </button>
                      <button type="button" className={`${OUTLINE} ${myChoice === 'keep' ? 'ring-2 ring-offset-1 ring-blue-500' : ''}`} onClick={() => respondValue(item.good_id, 'keep')} disabled={busy}>
                        {t('reconcileKeepDivergent')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 text-xs text-slate-500">{overall}</div>
                )}
              </div>
            )
          })}
        </div>
      ) : null}

      {/* OMITTED items — the party who did not value it fills their estimate (left),
          with the other party's value shown (right). */}
      {recon.omitted_items.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center gap-1"><div className="text-sm font-semibold text-slate-800">{t('reconcileOmittedHeading')}</div><HelpTip text={t('helpReconcileOmitted')} /></div>
          {recon.omitted_items.map(item => {
            const iOmitted = myId != null && item.omitted_by.map(String).includes(myId)
            const myResp = myId ? item.responses[myId] : undefined
            const iResponded = myResp !== undefined && myResp !== null
            const ackEntries = Object.entries(item.values_by_ack || {})
            return (
              <div key={item.good_id} className="rounded-xl border border-rose-200 bg-rose-50/60 p-3">
                <div className="font-medium text-slate-900">{item.good_name}</div>
                <div className="mt-1 text-sm text-slate-700">
                  <span className="text-rose-700">{t('reconcileNotIncludedBy')}: {item.omitted_by_names.join(', ') || '—'}</span>
                </div>
                {iOmitted && !isMediator ? (
                  iResponded ? (
                    <div className="mt-2 text-xs text-emerald-700">
                      {myResp && myResp.value_amount != null ? `✓ ${money(myResp.value_amount)}` : '✓ ' + t('reconcileDeclined')}
                    </div>
                  ) : (
                    <div className="mt-2 flex flex-wrap items-end gap-3">
                      <div>
                        <div className="text-xs text-slate-600 mb-1">{t('reconcileYourEstimate')}</div>
                        <div className="flex items-center gap-1">
                          <span className="text-slate-500">€</span>
                          <Input
                            inputMode="numeric"
                            value={omitDraft[item.good_id] ?? ''}
                            placeholder="0"
                            onChange={(e) => setOmitDraft(d => ({ ...d, [item.good_id]: groupThousands(e.target.value) }))}
                          />
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-600 mb-1">{t('reconcileCounterpartValue')}</div>
                        <div className="text-sm font-semibold text-slate-900">
                          {ackEntries.length
                            ? ackEntries.map(([aid, v]) => `${nameById[aid] || `#${aid}`}: ${money(v)}`).join(' · ')
                            : '—'}
                        </div>
                      </div>
                      <button type="button" className={GREEN} onClick={() => respondOmitted(item.good_id, String(item.estimated_value))} disabled={busy}>
                        {t('reconcileAcceptEstimate')} ({money(item.estimated_value)})
                      </button>
                      <button type="button" className={OUTLINE} onClick={() => respondOmitted(item.good_id, omitDraft[item.good_id] ?? '')} disabled={busy}>
                        {t('reconcileSubmitValue')}
                      </button>
                    </div>
                  )
                ) : (
                  <div className="mt-2 text-xs text-slate-500">{t('reconcileNotYourItem')}</div>
                )}
              </div>
            )
          })}
        </div>
      ) : null}

      {err ? <div className="text-sm text-rose-700">{err}</div> : null}

      <div className="border-t border-slate-200 pt-4 flex items-center gap-3 flex-wrap">
        {!isMediator ? (
          <button type="button" className={GREEN} onClick={finalize} disabled={busy || !recon.complete}>
            {t('reconcileFinish')}
          </button>
        ) : null}
        {recon.complete ? (
          <span className="text-xs text-emerald-700">{t('reconcileReady')}</span>
        ) : iRespondedAllMine && !isMediator ? (
          <span className="rounded-lg bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">{t('reconcileWaitingOther')}</span>
        ) : (
          <span className="text-xs text-slate-500">{t('reconcileWaitingAll')}</span>
        )}
      </div>
    </div>
  )
}
