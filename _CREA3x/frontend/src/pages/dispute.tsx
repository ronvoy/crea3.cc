import React, { useEffect, useMemo, useState, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { api, apiBlob, API_BASE, getAccessToken } from '../api/client'
import { useAuth } from '../store/auth'
import { useI18n } from '../i18n'
import { Card, CardHeader, Button, Input, Select, ErrorBox, Pill, HelpTip } from '../components/ui'
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button as MuiButton,
} from '@mui/material'
import ReconciliationPanel from '../components/reconciliation-panel'
import DocumentsPanel from '../components/documents'
import DisputeStatusBadge from '../components/dispute-status-badge'
import { addRecentDispute, removeRecentDispute } from '../utils/recent'
import { Pie } from 'react-chartjs-2'
import { Chart as ChartJS, ArcElement, Tooltip as ChartTooltip, Legend as ChartLegend } from 'chart.js'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Support address (build-time env; falls back to the current mailbox).
const SUPPORT_EMAIL = (import.meta as any).env?.VITE_SUPPORT_EMAIL || 'support@crea3.cc'

ChartJS.register(ArcElement, ChartTooltip, ChartLegend)

const CHART_PALETTE = ['#2563eb', '#16a34a', '#f59e0b', '#db2777', '#7c3aed', '#0891b2', '#dc2626', '#65a30d', '#ea580c', '#4f46e5']

type Dispute = {
  id: number
  title: string
  method: 'bids' | 'rates'
  status: string
  created_by_id?: number
}

type Agent = {
  id: number
  name: string
  email: string
  entitlement_share: number
  claimed_entitlement_share?: number | null
  role_in_dispute?: string
  invite_status: string
  invite_comment?: string | null
  ready?: boolean
}

type Good = {
  id: number; name: string; estimated_value: number; indivisible: boolean; divisible?: boolean
  // Free-form extras stored server-side: currency, optional description, creator.
  meta?: { currency?: string; description?: string; [k: string]: any }
}
type Proposal = { id: number; outputs: any; metrics: any; explanation: string }

type TabKey = 'agents' | 'goods' | 'prefs' | 'reconcile' | 'proposals' | 'mediation' | 'room'
type StepStatus = 'done' | 'todo' | 'blocked' | 'open'

type InviteStatus = 'joined' | 'accepted' | 'invited' | 'pending' | 'declined' | string

function normalizeStatus(s?: string): InviteStatus {
  return (s || '').toLowerCase() as InviteStatus
}

function statusColorClass(status: InviteStatus) {
  if (status === 'joined' || status === 'accepted') return 'text-emerald-700'
  if (status === 'invited' || status === 'pending') return 'text-amber-700'
  if (status === 'declined') return 'text-rose-700'
  return 'text-slate-800'
}

function statusPill(status: InviteStatus) {
  const label =
    status === 'accepted' ? 'joined' :
    status === 'pending' ? 'invited' :
    status

  const cls =
    status === 'joined' || status === 'accepted'
      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
      : status === 'invited' || status === 'pending'
        ? 'bg-amber-50 border-amber-200 text-amber-900'
        : status === 'declined'
          ? 'bg-rose-50 border-rose-200 text-rose-900'
          : 'bg-slate-50 border-slate-200 text-slate-900'

  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${cls}`}>{label}</span>
}

function dotClass(status: StepStatus) {
  if (status === 'done') return 'bg-emerald-500'
  if (status === 'todo') return 'bg-amber-400'
  if (status === 'open') return 'bg-indigo-400'
  return 'bg-rose-500'
}

// Currencies offered for an asset's value (code + display symbol).
const CURRENCIES = [
  { code: 'EUR', symbol: '€' }, { code: 'USD', symbol: '$' }, { code: 'GBP', symbol: '£' },
  { code: 'CHF', symbol: 'Fr' }, { code: 'SEK', symbol: 'kr' }, { code: 'DKK', symbol: 'kr' },
  { code: 'NOK', symbol: 'kr' }, { code: 'PLN', symbol: 'zł' }, { code: 'CZK', symbol: 'Kč' },
  { code: 'RON', symbol: 'lei' }, { code: 'HUF', symbol: 'Ft' }, { code: 'BGN', symbol: 'лв' },
]

export default function DisputeDetail() {
  const { id } = useParams()
  const disputeId = Number(id)
  const nav = useNavigate()
  const { user } = useAuth()
  const { t, lang } = useI18n()

  const [dispute, setDispute] = useState<Dispute | null>(null)
  const [agents, setAgents] = useState<Agent[]>([])
  const [goods, setGoods] = useState<Good[]>([])
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [meParticipation, setMeParticipation] = useState<Agent | null>(null)

  const [err, setErr] = useState<string | null>(null)
  // Active tab persists in the URL (?tab=…): refreshing the page — e.g. on the
  // reconciliation step while waiting for the other party — stays on that step
  // instead of falling back to the first tab.
  const [searchParams, setSearchParams] = useSearchParams()
  const TAB_KEYS: TabKey[] = ['agents', 'goods', 'prefs', 'reconcile', 'proposals', 'mediation', 'room']
  const urlTab = searchParams.get('tab') as TabKey | null
  const [tab, setTabState] = useState<TabKey>(urlTab && TAB_KEYS.includes(urlTab) ? urlTab : 'agents')
  const setTab = (t2: TabKey) => {
    setTabState(t2)
    setSearchParams((prev) => { const p = new URLSearchParams(prev); p.set('tab', t2); return p }, { replace: true })
  }

  // Forms
  const [aname, setAname] = useState('')
  const [aemail, setAemail] = useState('')
  const [ashare, setAshare] = useState('')
  const [arole, setArole] = useState('') // '' | 'agent' | 'mediator'

  const [gname, setGname] = useState('')
  const [gval, setGval] = useState('')
  const [gdiv, setGdiv] = useState(false)
  const [gcur, setGcur] = useState<string>(() => {
    try { return localStorage.getItem(`crea3_goods_currency_${window.location.pathname.split('/').pop()}`) || 'EUR' } catch { return 'EUR' }
  })
  const [gdescOn, setGdescOn] = useState(false)
  const [gdesc, setGdesc] = useState('')

  // Live FX rates (server-cached ECB reference rates) power the section-level
  // currency switch: changing it restates the amounts instead of relabelling them.
  const [fxRates, setFxRates] = useState<Record<string, number> | null>(null)
  const [fxDate, setFxDate] = useState<string | null>(null)
  const [fxBusy, setFxBusy] = useState(false)

  // Quick estimate for the asset being typed in (no good exists yet).
  const [draftBusy, setDraftBusy] = useState(false)
  const [draftEst, setDraftEst] = useState<{ min: number; avg: number; max: number; currency: string } | null>(null)
  const [draftText, setDraftText] = useState('')
  const [draftFallback, setDraftFallback] = useState(false)
  const [draftApplied, setDraftApplied] = useState<number | null>(null)
  const [claimShare, setClaimShare] = useState('')
  const [claimPosition, setClaimPosition] = useState('')
  const [claimMsg, setClaimMsg] = useState<string | null>(null)

  // Preferences (rates only)
  const [selectedGood, setSelectedGood] = useState<number>(0)
  const [stars, setStars] = useState('5')
  const [myPrefs, setMyPrefs] = useState<Array<{ good_id: number; stars: number | null }>>([])
  // Each party's OWN monetary valuation per good (good_id -> value). Separate
  // from the good's reference value and from stars.
  const [myValues, setMyValues] = useState<Record<string, { value_amount: number | null; divisible: boolean | null }>>({})
  const [valueDraft, setValueDraft] = useState<Record<number, string>>({})
  const [divisibleDraft, setDivisibleDraft] = useState<Record<number, boolean>>({})
  const [valueEditIds, setValueEditIds] = useState<Set<number>>(() => new Set())
  const [lockStatus, setLockStatus] = useState<{ all_locked: boolean; my_locked: boolean; pending_count?: number; pending_names?: string[]; parties: { name: string; locked: boolean }[] }>({ all_locked: false, my_locked: false, parties: [] })
  const [editingGoodId, setEditingGoodId] = useState<number | null>(null)
  const [editGoodDesc, setEditGoodDesc] = useState('')
  // Which good's "AI Estimate" chat is expanded (only one at a time).
  const [estimateOpen, setEstimateOpen] = useState<number | null>(null)
  // Good pending deletion — drives the confirmation dialog.
  const [goodToDelete, setGoodToDelete] = useState<any | null>(null)
  const [deletingGood, setDeletingGood] = useState(false)
  // "Agent management" card is collapsible; it starts open.
  const [agentsOpen, setAgentsOpen] = useState(true)
  const [editGoodName, setEditGoodName] = useState('')

  const latestProposal = proposals[0]
  // A proposal is "decided" when any party rejected it (a single rejection makes
  // the whole proposal rejected) or when every party accepted it
  // (dispute.status === 'accepted'). Downloads and re-generation unlock only then.
  const proposalRejected = (latestProposal as any)?.rejected === true
  const proposalDecided = !!latestProposal && (dispute?.status === 'accepted' || proposalRejected)
  // Proposals stay LOCKED (red tab) until every agent finished reconciliation —
  // i.e. the dispute has moved past the 'reconciling' stage.
  const proposalsLocked = ['draft', 'collecting', 'validating', 'reconciling'].includes((dispute?.status || '').toLowerCase())
  const myAcceptedProposal = (latestProposal as any)?.my_decision === true
  // One-shot "Generate proposal": once pressed (final report built) it stays
  // greyed — persisted per proposal so a refresh keeps it idempotent.
  const genKey = latestProposal ? `crea3_prop_gen:${disputeId}:${latestProposal.id}` : ''
  const [reportGenerated, setReportGenerated] = useState(false)
  useEffect(() => {
    try { setReportGenerated(!!genKey && localStorage.getItem(genKey) === '1') } catch { setReportGenerated(false) }
  }, [genKey])

  const isMediator = useMemo(() => {
    const invitedAsMediator = (meParticipation?.role_in_dispute || '').toLowerCase() === 'mediator'
    return user?.role === 'mediator' || invitedAsMediator
  }, [user?.role, meParticipation?.role_in_dispute])

  // If /agents/me is 404, it’s most likely owner/admin (created_by) not listed as DisputeAgent.
  const isOwnerMaybe = useMemo(() => {
    return meParticipation === null
  }, [meParticipation])

  // The dispute owner (first claimant). Only the owner can add PARTIES; others
  // may only invite mediators (#4).
  const isOwner = useMemo(() => {
    if (user?.role === 'admin') return true
    if (dispute?.created_by_id != null && user?.id != null) {
      return dispute.created_by_id === user.id
    }
    return meParticipation === null // fallback
  }, [dispute?.created_by_id, user, meParticipation])

  const isJoined = useMemo(() => {
    if (!meParticipation) return true // owner/admin path
    return normalizeStatus(meParticipation.invite_status) === 'joined' || normalizeStatus(meParticipation.invite_status) === 'accepted'
  }, [meParticipation])

  const canEditWorkflow = useMemo(() => {
    // mediator never edits anything
    if (isMediator) return false
    // invited agent cannot edit until joined; owner/admin can
    return isOwnerMaybe || isJoined
  }, [isMediator, isOwnerMaybe, isJoined])

  const joinedNonMediatorAgents = useMemo(() => {
    return agents.filter((a) => (a.role_in_dispute || 'agent').toLowerCase() !== 'mediator' && (normalizeStatus(a.invite_status) === 'joined' || normalizeStatus(a.invite_status) === 'accepted'))
  }, [agents])

  const readyCount = useMemo(() => {
    return joinedNonMediatorAgents.filter((a) => Boolean((a as any).ready)).length
  }, [joinedNonMediatorAgents])

  const joinedCount = useMemo(() => {
    return agents.filter(a => {
      const s = normalizeStatus(a.invite_status)
      return s === 'joined' || s === 'accepted'
    }).length
  }, [agents])

  const pendingCount = useMemo(() => {
    return agents.filter(a => {
      const s = normalizeStatus(a.invite_status)
      return s === 'invited' || s === 'pending'
    }).length
  }, [agents])

  const declinedCount = useMemo(() => {
    return agents.filter(a => normalizeStatus(a.invite_status) === 'declined').length
  }, [agents])

  // Build the "control box" props for the current workflow step (agents -> goods
  // -> prefs -> reconcile). Each step shows party-status chips, what's blocking,
  // and the action that advances the workflow.
  const stepControl = useMemo(() => {
    const STEPS = ['agents', 'goods', 'prefs', 'reconcile']
    const idx = STEPS.indexOf(tab as string)
    if (idx === -1) return null // proposals/mediation/room have their own UI
    const stepNo = idx + 1
    const stepCount = STEPS.length
    const partyChip = (a: Agent): StepChip => ({
      label: `${a.name}: ${normalizeStatus(a.invite_status) === 'joined' || normalizeStatus(a.invite_status) === 'accepted' ? t('goodsDoneWord') : normalizeStatus(a.invite_status)}`,
      done: normalizeStatus(a.invite_status) === 'joined' || normalizeStatus(a.invite_status) === 'accepted',
    })

    if (tab === 'agents') {
      const parties = agents.filter(a => (a.role_in_dispute || 'agent').toLowerCase() !== 'mediator')
      const allJoined = parties.length >= 2 && pendingCount === 0
      return {
        stepIndex: stepNo, stepCount,
        title: t('stepAgentsTitle'),
        description: t('stepAgentsDesc'),
        chips: parties.map(partyChip),
        done: allJoined,
        blockedReason: allJoined ? null : t('stepAgentsBlocked'),
        actionLabel: allJoined ? t('goToGoods') : null,
        onAction: () => setTab('goods'),
        actionDisabled: false,
        secondaryLabel: null, onSecondary: undefined,
      }
    }
    if (tab === 'goods') {
      const chips: StepChip[] = (lockStatus.parties || []).map(p => ({
        label: `${p.name}: ${p.locked ? t('goodsDoneWord') : t('goodsPendingWord')}`,
        done: p.locked,
      }))
      return {
        stepIndex: stepNo, stepCount,
        title: t('goodsFinishTitle'),
        description: t('goodsFinishHint'),
        chips,
        done: lockStatus.all_locked,
        blockedReason: lockStatus.all_locked ? null : (pendingCount > 0 ? t('stepAgentsBlocked') : t('waitingOthersNote')),
        actionLabel: !lockStatus.my_locked ? t('goodsFinishButton') : (lockStatus.all_locked ? t('goToPreferences') : null),
        onAction: !lockStatus.my_locked ? finishGoods : () => setTab('prefs'),
        actionDisabled: !lockStatus.my_locked ? (!canEditWorkflow || goods.length === 0) : false,
        secondaryLabel: lockStatus.my_locked && !lockStatus.all_locked ? t('goodsReopenButton') : null,
        onSecondary: reopenGoods,
      }
    }
    if (tab === 'prefs') {
      const chips: StepChip[] = joinedNonMediatorAgents.map(a => ({
        label: `${a.name}: ${(a as any).ready ? t('prefsConfirmedWord') : t('goodsPendingWord')}`,
        done: Boolean((a as any).ready),
      }))
      const blocked = !lockStatus.all_locked
      const reconcileReachable = dispute?.status === 'reconciling' || dispute?.status === 'proposed' || readyCount >= 2
      const iStillNeedNext = !blocked && !meParticipation?.ready
      // I can only CONFIRM I'm done once I've given a star rating to every asset.
      const myRatedIds = new Set(myPrefs.filter(p => p.stars != null).map(p => p.good_id))
      const allRatedByMe = goods.length > 0 && goods.every(g => myRatedIds.has(g.id))
      return {
        stepIndex: stepNo, stepCount,
        title: t('stepPrefsTitle'),
        description: t('stepPrefsDesc'),
        chips: blocked ? [] : chips,
        done: !blocked && readyCount >= 2,
        blockedReason: blocked
          ? ((lockStatus.pending_count ?? 0) > 0 ? `${t('prefsWaitingAccept')} ${(lockStatus.pending_names || []).join(', ')}` : t('prefsLockedUntilGoods'))
          : (iStillNeedNext
              ? (allRatedByMe ? t('prefsConfirmHint') : t('prefsRateAllFirst'))
              : (reconcileReachable ? null : t('waitingOthersNote'))),
        // Primary action: rate every asset, then CONFIRM you're done. After
        // confirming we wait for the other party (or move on if they're ready).
        actionLabel: iStillNeedNext ? t('prefsConfirmDone') : (reconcileReachable ? t('goToReconcile') : null),
        onAction: iStillNeedNext ? submitNext : () => setTab('reconcile'),
        actionDisabled: iStillNeedNext ? (!canEditWorkflow || !allRatedByMe) : false,
        secondaryLabel: null,
        onSecondary: undefined,
      }
    }
    if (tab === 'reconcile') {
      const proposed = dispute?.status === 'proposed' || proposals.length > 0
      return {
        stepIndex: stepNo, stepCount,
        title: t('stepReconcileTitle'),
        description: t('stepReconcileDesc'),
        chips: [],
        done: proposed,
        blockedReason: proposed ? null : t('stepReconcileHint'),
        actionLabel: t('tabProposals'),
        onAction: () => setTab('proposals'),
        actionDisabled: proposalsLocked,
        secondaryLabel: null, onSecondary: undefined,
      }
    }
    return null
  }, [tab, agents, pendingCount, lockStatus, goods.length, myPrefs, joinedNonMediatorAgents, readyCount, meParticipation, dispute?.status, proposals.length, canEditWorkflow]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (proposalsLocked && tab === 'proposals') setTab('reconcile')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposalsLocked, tab])

  async function loadAll() {
    setErr(null)
    try {
      const d = await api(`/api/disputes/${disputeId}`)
      setDispute(d)
      try {
        if ((d.status || '').toLowerCase() === 'abandoned') removeRecentDispute(d.id)
        else addRecentDispute(d.id, d.title, d.status)
      } catch {}

      const [a, g, p] = await Promise.all([
        api(`/api/disputes/${disputeId}/agents`),
        api(`/api/disputes/${disputeId}/goods`),
        api(`/api/disputes/${disputeId}/proposals`),
      ])
      setAgents(a)
      setGoods(g)
      setProposals(p)

      // Load my own preferences (to show each good's current rating inline).
      // Mediators get 403 here — that's fine, they don't rate.
      try {
        const prefs = await api(`/api/disputes/${disputeId}/preferences`)
        setMyPrefs(Array.isArray(prefs) ? prefs : [])
      } catch {
        setMyPrefs([])
      }
      // Load my own monetary valuations per good.
      try {
        const vals = await api(`/api/disputes/${disputeId}/goods/my-valuations`)
        setMyValues(vals && typeof vals === 'object' ? vals : {})
      } catch {
        setMyValues({})
      }

      // Per-party goods-lock status (drives the Finish/Next two-phase flow).
      try {
        const ls = await api(`/api/disputes/${disputeId}/goods/lock-status`)
        setLockStatus(ls)
      } catch {
        setLockStatus({ all_locked: false, my_locked: false, parties: [] })
      }

      // Resolve my participation from the agents list (matched by email).
      // (There is no /agents/me endpoint; we derive it from data we already have.)
      try {
        const me = await api(`/api/users/me`)
        const myEmail = (me?.email || '').trim().toLowerCase()
        const mine = (a || []).find((ag: any) => (ag.email || '').trim().toLowerCase() === myEmail) || null
        setMeParticipation(mine)
      } catch {
        setMeParticipation(null)
      }
    } catch (e: any) {
      setErr(e.message ?? 'Failed to load dispute')
    }
  }

  useEffect(() => {
    if (disputeId) loadAll()
  }, [disputeId])

  // Auto-refresh the dispute every 2s so counterpart actions (joins, goods,
  // ratings, status changes) appear without a manual refresh. Only server-side
  // state is replaced; the user's in-progress form inputs are local and untouched.
  useEffect(() => {
    if (!disputeId) return
    const id = setInterval(() => { loadAll() }, 2000)
    return () => clearInterval(id)
  }, [disputeId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Force mediator view: proposals (and read-only reconciliation)
  useEffect(() => {
    if (isMediator && tab !== 'proposals' && tab !== 'reconcile') setTab(proposalsLocked ? 'reconcile' : 'proposals')
  }, [isMediator, tab])

  async function addAgent() {
    // Non-owners may only add mediators (#4).
    const effectiveRole = isOwner ? (arole || '') : 'mediator'
    const isMed = effectiveRole.toLowerCase() === 'mediator'
    let shareDecimal = 0
    if (!isMed) {
      const pct = Number(ashare)
      if (Number.isNaN(pct) || pct < 1 || pct > 99) {
        setErr(t('entitlementPctError'))
        return
      }
      shareDecimal = pct / 100
    }
    try {
      await api(`/api/disputes/${disputeId}/agents`, {
        method: 'POST',
        body: {
          name: aname,
          email: aemail,
          entitlement_share: shareDecimal,
          role_in_dispute: effectiveRole || null,
        },
      })
      setAname('')
      setAemail('')
      setAshare('')
      setArole('')
      await loadAll()
    } catch (e: any) {
      setErr(e.message)
    }
  }

  async function resendInvite(agentId: number) {
    try {
      await api(`/api/disputes/${disputeId}/agents/${agentId}/resend-invite`, { method: 'POST' })
      await loadAll()
    } catch (e: any) {
      setErr(e.message)
    }
  }

  async function removeFromDashboard(agentId: number) {
    try {
      await api(`/api/disputes/${disputeId}/agents/${agentId}`, { method: 'DELETE' })
      await loadAll()
    } catch (e: any) {
      setErr(e.message)
    }
  }

  async function submitClaimedShare() {
    setClaimMsg(null)
    const pct = Number(claimShare)
    if (Number.isNaN(pct) || pct < 1 || pct > 99) {
      setErr('Your claimed share must be between 1% and 99%.')
      return
    }
    try {
      await api(`/api/disputes/${disputeId}/agents/me/claimed-share`, {
        method: 'POST',
        body: { claimed_entitlement_share: pct / 100, position: claimPosition.trim() || null },
      })
      setClaimMsg(t('claimShareSaved'))
      await loadAll()
    } catch (e: any) {
      setErr(e.message)
    }
  }

  async function addGood() {
    try {
      const created = await api(`/api/disputes/${disputeId}/goods`, {
        method: 'POST',
        body: {
          name: gname, estimated_value: Number(gval || 0),
          indivisible: !gdiv, divisible: gdiv,
          meta: { currency: gcur, description: gdesc.trim() || undefined },
        },
      })
      // Carry the quick estimate (question, reasoning, range, applied figure)
      // into the new good's AI Estimate thread, so the reason behind the number
      // stays with the asset and the conversation can be continued there.
      if (created?.id && draftText) {
        try {
          await api(`/api/disputes/${disputeId}/goods/${created.id}/estimate/seed`, {
            method: 'POST',
            body: {
              question: t('aiEstimateSeedQuestion', { name: gname.trim() }),
              text: draftText, estimate: draftEst, fallback: draftFallback,
              applied: draftApplied, currency: gcur,
            },
          })
        } catch { /* the good is created either way */ }
      }
      setGname('')
      setGval('')
      setGdiv(false)
      setGdesc('')
      setGdescOn(false)
      setDraftEst(null); setDraftText(''); setDraftApplied(null); setDraftFallback(false)
      await loadAll()
    } catch (e: any) {
      setErr(e.message)
    }
  }

  // Rename a good (allowed before this party finishes goods, or when reopened).
  async function ensureRates(): Promise<Record<string, number> | null> {
    if (fxRates) return fxRates
    try {
      setFxBusy(true)
      const r = await api(`/api/disputes/${disputeId}/fx/rates`)
      setFxRates(r.rates || null)
      setFxDate(r.date || null)
      return r.rates || null
    } catch {
      return null
    } finally {
      setFxBusy(false)
    }
  }

  function convertAmount(amount: number, from: string, to: string, rates: Record<string, number> | null): number | null {
    if (!Number.isFinite(amount)) return null
    if (from === to) return amount
    if (!rates || !rates[from] || !rates[to]) return null
    return (amount / rates[from]) * rates[to]
  }

  // Switching the section currency converts the amount already typed in.
  async function changeSectionCurrency(next: string) {
    const prev = gcur
    if (next === prev) return
    const rates = await ensureRates()
    setGcur(next)
    const typed = Number(gval)
    if (gval.trim() && Number.isFinite(typed)) {
      const conv = convertAmount(typed, prev, next, rates)
      if (conv != null) setGval(String(Math.round(conv * 100) / 100))
    }
    if (draftEst) {
      const c = (v: number) => convertAmount(v, draftEst.currency || prev, next, rates)
      const lo = c(draftEst.min), av = c(draftEst.avg), hi = c(draftEst.max)
      if (lo != null && av != null && hi != null) setDraftEst({ min: lo, avg: av, max: hi, currency: next })
    }
    try { localStorage.setItem(`crea3_goods_currency_${disputeId}`, next) } catch { /* ignore */ }
  }

  async function runDraftEstimate() {
    if (!gname.trim() || draftBusy) return
    setDraftBusy(true); setErr(null); setDraftEst(null); setDraftText(''); setDraftApplied(null)
    try {
      const r = await api(`/api/disputes/${disputeId}/goods/estimate-draft`, {
        method: 'POST',
        body: { name: gname.trim(), description: gdesc.trim(), currency: gcur, lang },
      })
      setDraftEst(r.estimate || null)
      setDraftText(r.text || '')
      setDraftFallback(!!r.fallback)
    } catch (e: any) {
      setErr(e?.message || t('aiWidgetUnavailable'))
    } finally {
      setDraftBusy(false)
    }
  }

  // Apply a figure the AI Estimator proposed: it fills this good's value input
  // (and remembers the currency on the good) rather than saving silently.
  async function applyEstimatePrice(good: any, amount: number, currency: string) {
    openGoodEdit(good)
    setValueDraft((d) => ({ ...d, [good.id]: String(Math.round(amount * 100) / 100) }))
    if (currency && (good.meta?.currency || 'EUR') !== currency) {
      try {
        await api(`/api/disputes/${disputeId}/goods/${good.id}`, {
          method: 'PATCH',
          body: {
            name: good.name, estimated_value: Number(good.estimated_value || 0),
            indivisible: !good.divisible, divisible: !!good.divisible,
            meta: { ...(good.meta || {}), currency },
          },
        })
        await loadAll()
      } catch { /* the value draft still applies */ }
    }
  }

  // Apply the name + description the AI Estimator proposed.
  async function applyEstimateDetails(good: any, title: string, description: string) {
    setErr(null)
    try {
      await api(`/api/disputes/${disputeId}/goods/${good.id}`, {
        method: 'PATCH',
        body: {
          name: (title || good.name).slice(0, 200),
          estimated_value: Number(good.estimated_value || 0),
          indivisible: !good.divisible, divisible: !!good.divisible,
          meta: { ...(good.meta || {}), description: description || good.meta?.description },
        },
      })
      await loadAll()
    } catch (e: any) {
      setErr(e?.message || 'Could not apply the suggested details')
    }
  }

  // Single "Edit" on a goods card: saves the asset's name/description (when
  // this party may edit structure and has not locked) AND this party's own
  // price + divisibility opinion, then reloads once.
  function openGoodEdit(g: any) {
    setEditingGoodId(g.id)
    setEditGoodName(g.name)
    setEditGoodDesc(g.meta?.description || '')
    setValueDraft((d) => ({ ...d, [g.id]: myValueFor(g.id) }))
    setDivisibleDraft((d) => ({ ...d, [g.id]: myDivisibleFor(g.id) }))
  }

  async function saveGoodEdit(g: any) {
    setErr(null)
    const raw = (valueDraft[g.id] ?? myValueFor(g.id) ?? '').trim()
    const value_amount = raw === '' ? null : Number(raw)
    if (value_amount !== null && (Number.isNaN(value_amount) || value_amount < 0)) {
      setErr(t('valueMustBeNumber')); return
    }
    const divisible = divisibleDraft[g.id] !== undefined ? divisibleDraft[g.id] : myDivisibleFor(g.id)
    try {
      const canEditStructure = canEditWorkflow && !lockStatus.my_locked
      const newName = editGoodName.trim()
      if (canEditStructure && editingGoodId === g.id && newName) {
        await api(`/api/disputes/${disputeId}/goods/${g.id}`, {
          method: 'PATCH',
          body: {
            name: newName,
            estimated_value: Number(g.estimated_value),
            indivisible: !g.divisible,
            divisible: !!g.divisible,
            meta: { ...(g.meta || {}), description: editGoodDesc.trim() || undefined },
          },
        })
      }
      await api(`/api/disputes/${disputeId}/goods/${g.id}/valuation`, {
        method: 'POST',
        body: { value_amount, divisible },
      })
      setEditingGoodId(null)
      setValueEditIds((set) => { const n = new Set(set); n.delete(g.id); return n })
      await loadAll()
    } catch (e: any) {
      setErr(e?.message || 'Could not save this asset')
    }
  }

  async function confirmDeleteGood() {
    if (!goodToDelete) return
    setDeletingGood(true)
    setErr(null)
    try {
      await api(`/api/disputes/${disputeId}/goods/${goodToDelete.id}`, { method: 'DELETE' })
      if (estimateOpen === goodToDelete.id) setEstimateOpen(null)
      setGoodToDelete(null)
      await loadAll()
    } catch (e: any) {
      setErr(e?.message || 'Could not delete this asset')
    } finally {
      setDeletingGood(false)
    }
  }

  async function renameGood(g: { id: number; estimated_value: number; divisible?: boolean; meta?: any }) {
    const newName = editGoodName.trim()
    if (!newName) { setEditingGoodId(null); return }
    try {
      await api(`/api/disputes/${disputeId}/goods/${g.id}`, {
        method: 'PATCH',
        body: {
          name: newName,
          estimated_value: Number(g.estimated_value),
          indivisible: !g.divisible,
          divisible: !!g.divisible,
          // The edit form updates the optional description alongside the name.
          meta: { ...(g.meta || {}), description: editGoodDesc.trim() || undefined },
        },
      })
      setEditingGoodId(null)
      setEditGoodName('')
      await loadAll()
    } catch (e: any) {
      setErr(e.message)
    }
  }

  async function submitPreference() {
    try {
      // The monetary value is the good's estimated_value (set at creation); the
      // party only expresses how much they WANT each good, via stars.
      const body: any = { good_id: selectedGood, stars: Number(stars) }
      await api(`/api/disputes/${disputeId}/preferences`, { method: 'POST', body })
      await loadAll()
    } catch (e: any) {
      setErr(e.message)
    }
  }

  // Rate a specific good inline (used by the merged Assets & Preferences tab).
  async function ratePreference(goodId: number, starValue: number) {
    try {
      await api(`/api/disputes/${disputeId}/preferences`, {
        method: 'POST',
        body: { good_id: goodId, stars: starValue },
      })
      await loadAll()
    } catch (e: any) {
      setErr(e.message)
    }
  }

  // Total-star budget by number of goods: 1→5, 2→8, 3→12, 4→15, 5→19 …
  function starBudget(nGoods: number): number {
    if (nGoods <= 0) return 0
    let total = 5
    for (let i = 2; i <= nGoods; i++) total += i % 2 === 0 ? 3 : 4
    return total
  }
  const starsUsed = myPrefs.reduce((a, p) => a + (p.stars != null ? Number(p.stars) : 0), 0)
  const starsTotal = starBudget(goods.length)

  function myStarsFor(goodId: number): number {
    const p = myPrefs.find((x) => x.good_id === goodId)
    return p && p.stars != null ? Number(p.stars) : 0
  }

  // The current party's saved monetary valuation for a good (or '' if none).
  function myValueFor(goodId: number): string {
    const v = myValues[String(goodId)]?.value_amount
    return v === undefined || v === null ? '' : String(v)
  }

  // This party's divisibility opinion for a good; defaults to the good's own
  // current divisibility until the party sets their own.
  function myDivisibleFor(goodId: number): boolean {
    const d = myValues[String(goodId)]?.divisible
    if (d === undefined || d === null) {
      const g = goods.find(x => x.id === goodId)
      return !!(g && g.divisible)
    }
    return !!d
  }

  // Persist this party's own valuation + divisibility opinion for a good.
  async function submitValuation(goodId: number) {
    const raw = valueDraft[goodId] ?? myValueFor(goodId)
    const trimmed = (raw ?? '').trim()
    const value_amount = trimmed === '' ? null : Number(trimmed)
    if (value_amount !== null && (Number.isNaN(value_amount) || value_amount < 0)) {
      setErr(t('valueMustBeNumber')); return
    }
    const divisible = divisibleDraft[goodId] !== undefined ? divisibleDraft[goodId] : myDivisibleFor(goodId)
    try {
      await api(`/api/disputes/${disputeId}/goods/${goodId}/valuation`, {
        method: 'POST',
        body: { value_amount, divisible },
      })
      setValueEditIds(s => { const n = new Set(s); n.delete(goodId); return n })
      await loadAll()
    } catch (e: any) {
      setErr(e.message)
    }
  }

  async function finishGoods() {
    try {
      await api(`/api/disputes/${disputeId}/goods/finish`, { method: 'POST' })
      await loadAll()
    } catch (e: any) {
      setErr(e.message)
    }
  }

  async function reopenGoods() {
    try {
      await api(`/api/disputes/${disputeId}/goods/reopen`, { method: 'POST' })
      await loadAll()
    } catch (e: any) {
      setErr(e.message)
    }
  }

  // "Next" on the Preferences step = mark myself ready (moves toward reconcile
  // once everyone is ready).
  async function submitNext() {
    try {
      await api(`/api/disputes/${disputeId}/ready`, { method: 'POST', body: { ready: true } })
      await loadAll()
    } catch (e: any) {
      setErr(e.message)
    }
  }

  async function generateProposal() {
    try {
      await api(`/api/disputes/${disputeId}/proposals`, { method: 'POST' })
      await loadAll()
      setTab('proposals')
    } catch (e: any) {
      setErr(e.message)
    }
  }

  async function acceptProposal(proposalId: number, accepted: boolean, comment?: string) {
    try {
      await api(`/api/disputes/${disputeId}/proposals/${proposalId}/accept`, {
        method: 'POST',
        body: { accepted, comment: comment && comment.trim() ? comment.trim() : null },
      })
      await loadAll()
    } catch (e: any) {
      setErr(e.message)
    }
  }

  // Authenticated file download: fetches with the Bearer token (window.open
  // cannot send it -> 401) and saves under the server's sealed filename.
  async function downloadAuthedFile(path: string, fallbackName: string) {
    const token = getAccessToken()
    const res = await fetch(`${API_BASE}${path}`, {
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) throw new Error(`Download failed (${res.status})`)
    const cd = res.headers.get('content-disposition') || ''
    const m = /filename="?([^";]+)"?/i.exec(cd)
    const name = (m && m[1]) || fallbackName
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = name
    document.body.appendChild(a); a.click(); a.remove()
    URL.revokeObjectURL(url)
  }

  async function generateReport() {
    try {
      await api(`/api/disputes/${disputeId}/report?lang=${lang}`, { method: 'POST' })
      await loadAll()
      await downloadAuthedFile(`/api/disputes/${disputeId}/report`, `CREA3_allocation_dispute_${disputeId}.pdf`)
    } catch (e: any) {
      setErr(e.message)
    }
  }

  const [reportBusy, setReportBusy] = useState(false)

  async function generateProposalReport() {
    setErr(null)
    setReportBusy(true)
    try {
      await api(`/api/disputes/${disputeId}/report/proposal?lang=${lang}`, { method: 'POST' })
      // Download the freshly generated PDF (authenticated; sealed filename).
      await downloadAuthedFile(`/api/disputes/${disputeId}/report`, `CREA3_allocation_dispute_${disputeId}.pdf`)
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setReportBusy(false)
    }
  }

  async function downloadAuditLog() {
    setErr(null)
    try {
      await downloadAuthedFile(`/api/disputes/${disputeId}/report/audit.csv`, `CREA3_audit_dispute_${disputeId}.csv`)
    } catch (e: any) {
      setErr(e?.message || 'Could not export the audit log')
    }
  }

  async function downloadReport() {
    try {
      // Ensure a fresh proposal PDF exists, then download it. This makes the
      // "Download PDF" button work in one click even if no report was generated
      // yet (it 404s otherwise).
      try {
        await api(`/api/disputes/${disputeId}/report/proposal?lang=${lang}`, { method: 'POST' })
      } catch {
        // If proposal-report generation isn't applicable, fall through and try
        // to download whatever report exists.
      }
      await downloadAuthedFile(`/api/disputes/${disputeId}/report`, `CREA3_allocation_dispute_${disputeId}.pdf`)
    } catch (e: any) {
      setErr(e?.message || 'Could not download the report')
    }
  }

  async function downloadExcel() {
    setErr(null)
    try {
      // The backend builds the workbook from the latest proposal on demand, so
      // it always reflects the current allocation and the accept/reject decisions.
      await downloadAuthedFile(`/api/disputes/${disputeId}/report/xlsx?lang=${lang}`, `CREA3_allocation_dispute_${disputeId}.xlsx`)
    } catch (e: any) {
      setErr(e?.message || 'Could not download the Excel file')
    }
  }

  async function respondInvite(accept: boolean) {
    try {
      await api(`/api/invitations/${disputeId}/respond`, { method: 'POST', body: { accept } })
      await loadAll()
    } catch (e: any) {
      setErr(e.message)
    }
  }

  async function abandonDispute() {
    const ok = window.confirm(
      t('abandonConfirm')
    )
    if (!ok) return
    try {
      await api(`/api/disputes/${disputeId}/abandon`, { method: 'POST' })
      // Abandon clears both sides: drop it from the recent list and leave the
      // dispute view (the center) so it no longer appears anywhere.
      removeRecentDispute(disputeId)
      nav('/app')
    } catch (e: any) {
      setErr(e.message)
    }
  }

  function shortId(id?: number | string) {
    if (id === null || id === undefined) return ''
    const s = String(id)
    if (s.length <= 14) return s
    return `${s.slice(0, 8)}…${s.slice(-4)}`
  }

  function stepStatus(key: TabKey): StepStatus {
    if (isMediator) {
      // mediator: proposals + read-only reconciliation view
      if (key === 'proposals') return proposals.length > 0 ? 'done' : 'todo'
      if (key === 'reconcile') return dispute?.status === 'reconciling' ? 'todo' : 'blocked'
      return 'blocked'
    }

    // invited but not joined cannot do prefs/proposals
    const blockedByInvite = !isOwnerMaybe && !isJoined

    if (key === 'agents') {
      // show as done when at least 2 joined agents exist (proposal needs >=2)
      return joinedNonMediatorAgents.length >= 2 ? 'done' : 'todo'
    }
    if (key === 'goods') {
      if (blockedByInvite) return 'blocked'
      if (goods.length === 0) return 'todo'
      return lockStatus.my_locked ? 'done' : 'todo'
    }
    if (key === 'prefs') {
      if (blockedByInvite) return 'blocked'
      if (!lockStatus.all_locked) return 'blocked'
      return readyCount >= 2 ? 'done' : 'todo'
    }
    if (key === 'reconcile') {
      if (blockedByInvite) return 'blocked'
      if (proposals.length > 0) return 'done'
      return dispute?.status === 'reconciling' ? 'todo' : 'blocked'
    }
    if (key === 'proposals') {
      if (blockedByInvite) return 'blocked'
      if (proposals.length > 0) return 'done'
      // can be generated when >=2 ready agents and at least one good
      const canGenerate = goods.length > 0 && readyCount >= 2
      return canGenerate ? 'todo' : 'blocked'
    }
    if (key === 'mediation') {
      if (blockedByInvite) return 'blocked'
      return proposals.length > 0 ? 'todo' : 'blocked'
    }
    if (key === 'room') {
      // The Dispute Room (video) is independent from the workflow: it is always
      // available, so it never shows a "todo" (yellow) state.
      return 'open'
    }
    return 'todo'
  }

  const methodLabel = t('overviewMethodValue') // single rating-based procedure (legacy 'bids' retired)

  const sortedAgents = useMemo(() => {
    const order = (s: InviteStatus) => {
      if (s === 'joined' || s === 'accepted') return 0
      if (s === 'invited' || s === 'pending') return 1
      if (s === 'declined') return 2
      return 3
    }
    return [...agents].sort((a, b) => {
      const sa = normalizeStatus(a.invite_status)
      const sb = normalizeStatus(b.invite_status)
      const oa = order(sa)
      const ob = order(sb)
      if (oa !== ob) return oa - ob
      const ra = (a.role_in_dispute || 'agent').toLowerCase()
      const rb = (b.role_in_dispute || 'agent').toLowerCase()
      if (ra !== rb) return ra.localeCompare(rb)
      return a.name.localeCompare(b.name)
    })
  }, [agents])

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader
          title={dispute ? dispute.title : t('dispute')}
          subtitle={dispute ? `ID ${shortId(dispute.id)} · ${t('overviewMethod')}: ${methodLabel}` : ''}
          right={
            <div className="flex min-w-0 flex-col items-end gap-3">
              {dispute ? <DisputeStatusBadge status={dispute.status} theme="light" /> : null}
              {dispute && dispute.status !== 'abandoned' && dispute.status !== 'finalized' ? (
                <Button
                  variant="danger"
                  onClick={abandonDispute}
                  className="mt-1"
                  style={{ fontSize: 12, padding: '3px 12px', minWidth: 0, lineHeight: 1.5 }}
                >
                  {t('abandonButton')}
                </Button>
              ) : null}
            </div>
          }
        />

        <div className="p-4">
          <ErrorBox message={err} />

          {/* Invite box (agents only). Mediator invited still sees only proposals. */}
          {!isMediator && meParticipation && (normalizeStatus(meParticipation.invite_status) === 'invited' || normalizeStatus(meParticipation.invite_status) === 'pending') ? (
            <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="font-semibold text-amber-900">{t('dispInviteTitle')}</div>
              <div className="text-sm text-amber-800 mt-1">
                {t('dispInviteBody')}
              </div>
              <div className="mt-3 flex gap-2 flex-wrap">
                <Button onClick={() => respondInvite(true)}>Accept</Button>
                <Button variant="ghost" onClick={() => respondInvite(false)}>
                  Decline
                </Button>
              </div>
            </div>
          ) : null}

          {/* ✅ TOP SUMMARY — compact, content-sized; Participants (widest) last */}
          <div className="mt-4 flex flex-wrap gap-2">
            <SummaryCard title={t('overviewStatus')} value={dispute?.status || '—'} />
            <SummaryCard title={t('overviewMethod')} value={methodLabel} />
            <SummaryCard title={t('tabGoods')} value={`${goods.length} goods`} />
            <SummaryCard title={t('tabPreferences')} value={`${readyCount} ready`} />
            <SummaryCard title={t('tabProposals')} value={proposals.length > 0 ? 'available' : 'not yet'} />
            <SummaryCard title={t('summaryParticipants')} value={`${joinedCount} joined · ${pendingCount} pending · ${declinedCount} declined`} />
          </div>

          {/* Closed banner (abandon control moved to the header, top-right) */}
          {dispute && (dispute.status === 'abandoned' || dispute.status === 'finalized') ? (
            <div className={`mt-3 rounded-2xl border p-3 text-sm ${dispute.status === 'abandoned' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
              {dispute.status === 'abandoned'
                ? t('abandonedBanner')
                : t('finalizedBanner')}
            </div>
          ) : null}

          {/* Tabs — the five workflow phases end at Mediation; the Dispute Room
              is shown separately because it is independent and always available. */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Tab label={t('tabAgents')} active={tab === 'agents'} status={stepStatus('agents')} onClick={() => setTab('agents')} />
            <Tab label={t('tabGoods')} active={tab === 'goods'} status={stepStatus('goods')} onClick={() => setTab('goods')} />
            <Tab label={t('tabPreferences')} active={tab === 'prefs'} status={stepStatus('prefs')} onClick={() => setTab('prefs')} />
            <Tab label={t('tabReconcile')} active={tab === 'reconcile'} status={stepStatus('reconcile')} onClick={() => setTab('reconcile')} />
            <Tab label={t('tabProposals')} active={tab === 'proposals'} status={stepStatus('proposals')} onClick={() => setTab('proposals')} danger={proposalsLocked} dangerHint={t('proposalsLockedHint')} />
            <Tab label={t('tabMediation')} active={tab === 'mediation'} status={stepStatus('mediation')} onClick={() => setTab('mediation')} />
            <span className="mx-1 hidden h-6 w-px shrink-0 self-center bg-slate-200 sm:block" aria-hidden />
            <Tab label={t('tabRoom')} active={tab === 'room'} status={stepStatus('room')} onClick={() => setTab('room')} />
          </div>

          {/* Workflow step control (agents -> goods -> prefs -> reconcile) */}
          {stepControl && !(dispute && (dispute.status === 'abandoned' || dispute.status === 'finalized')) ? (
            <WorkflowStepControl {...stepControl} helpText={({
              agents: t('helpStepAgents'),
              goods: t('helpStepGoods'),
              prefs: t('helpStepPrefs'),
              reconcile: t('helpStepReconcile'),
              proposals: t('helpStepProposals'),
              mediation: t('helpStepMediation'),
              room: t('helpStepRoom'),
            } as Record<string, string>)[tab]} />
          ) : null}

          {/* Main */}
          <div className="mt-4 space-y-4">
            {/* AGENTS */}
            {tab === 'agents' ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                {/* The whole card collapses on click — the header stays as the toggle. */}
                <button
                  type="button"
                  onClick={() => setAgentsOpen((v) => !v)}
                  aria-expanded={agentsOpen}
                  className="flex w-full items-start justify-between gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 rounded-lg"
                >
                  <span className="min-w-0">
                    <span className="block text-base font-semibold text-slate-900">{t('agentManagementTitle')}</span>
                    <span className="block text-sm text-slate-600 mt-1">{t('agentManagementSubtitle')}</span>
                  </span>
                  <span className="shrink-0 text-slate-500 text-sm mt-1" aria-hidden>{agentsOpen ? '▴' : '▾'}</span>
                </button>

                {!agentsOpen ? null : <>

                {meParticipation && (meParticipation.role_in_dispute || '').toLowerCase() !== 'mediator' ? (
                  <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/60 p-3">
                    <div className="text-sm font-semibold text-slate-800">{t('claimShareTitle')}</div>
                    <div className="text-xs text-slate-600 mt-1">{t('claimShareHint')}</div>
                    <div className="mt-2 text-xs text-slate-700">
                      {t('claimShareAssigned')}: <b>{Math.round((meParticipation.entitlement_share || 0) * 100)}%</b>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Input
                        type="number"
                        value={claimShare}
                        onChange={(e) => setClaimShare(e.target.value)}
                        placeholder="50"
                        aria-label={t('claimShareTitle')}
                        className="max-w-[120px]"
                      />
                      <span className="text-sm text-slate-600">%</span>
                    </div>
                    <div className="mt-2">
                      <Input
                        type="text"
                        value={claimPosition}
                        maxLength={50}
                        onChange={(e) => setClaimPosition(e.target.value.slice(0, 50))}
                        placeholder={t('claimPositionPlaceholder')}
                        aria-label={t('claimPositionLabel')}
                      />
                      <div className="text-xs text-slate-500 mt-1">
                        {t('claimPositionHint')} · {claimPosition.length}/50
                      </div>
                    </div>
                    <div className="mt-2">
                      <Button onClick={submitClaimedShare} disabled={claimShare.trim() === ''}>
                        {t('claimShareSave')}
                      </Button>
                    </div>
                    {claimMsg ? <div className="mt-2 text-xs text-emerald-700">{claimMsg}</div> : null}
                  </div>
                ) : null}

                {isMediator ? (
                  <div className="mt-3 text-sm text-rose-700">{t('dispNotAuthorized')}</div>
                ) : (
                  <div className="mt-4 grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="text-sm font-semibold">{t('addNewAgent')}</div>
                      <Input value={aname} onChange={(e) => setAname(e.target.value)} placeholder={t('nameLabel')} />
                      <Input value={aemail} onChange={(e) => setAemail(e.target.value)} placeholder={t('emailLabel')} />
                      {isOwner ? (
                        <Select value={arole} onChange={(e) => setArole(e.target.value)}>
                          <option value="">{t('rolePlaceholder')}</option>
                          <option value="agent">agent</option>
                          <option value="mediator">mediator</option>
                        </Select>
                      ) : (
                        <div>
                          <Select value="mediator" disabled>
                            <option value="mediator">mediator</option>
                          </Select>
                          <div className="text-xs text-slate-500 mt-1">{t('onlyOwnerAddsParties')}</div>
                        </div>
                      )}
                      {isOwner && arole !== 'mediator' ? (
                        <div>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              value={ashare}
                              onChange={(e) => setAshare(e.target.value)}
                              placeholder="50"
                              aria-label={t('entitlementPctLabel')}
                              className="max-w-[120px]"
                            />
                            <span className="text-sm text-slate-600">%</span>
                            <HelpTip text={t('helpEntitlement')} />
                          </div>
                          <div className="text-xs text-slate-500 mt-1">{t('entitlementPctHint')}</div>
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500">{t('mediatorNoShareHint')}</div>
                      )}

                      <Button onClick={addAgent} disabled={!canEditWorkflow || !aname.trim() || !aemail.trim()}>
                        {t('addAgent')}
                      </Button>

                      {!canEditWorkflow ? (
                        <div className="text-xs text-slate-600">You must accept the invite first (or be owner/admin).</div>
                      ) : null}
                    </div>

                    <div>
                      <div className="text-sm font-semibold mb-2">{t('agentsList')}</div>

                      <div className="grid gap-2">
                        {sortedAgents.map((a) => (
                          <ParticipantRow
                            key={a.id}
                            agent={a}
                            canManage={canEditWorkflow}
                            onResend={() => resendInvite(a.id)}
                            onRemove={() => removeFromDashboard(a.id)}
                          />
                        ))}
                        {agents.length === 0 ? <div className="text-sm text-slate-600">{t('dispNoAgents')}</div> : null}
                      </div>
                    </div>
                  </div>
                )}

                </>}
              </div>
            ) : null}

            {/* GOODS */}
            {/* GOODS — add assets, then "Finish adding goods" to lock */}
            {tab === 'goods' ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="text-base font-semibold text-slate-900">{t('tabGoods')}</div>
                    <div className="text-sm text-slate-600 mt-1">{t('goodsTabSubtitle')}</div>
                  </div>
                  {/* Section currency — switching it converts the amounts using
                      today's ECB reference rates (fetched once, cached). */}
                  <div className="flex items-center gap-2">
                    <label htmlFor="goodsCurrency" className="text-xs text-slate-600">{t('currencyLabel')}</label>
                    <select
                      id="goodsCurrency"
                      value={gcur}
                      onChange={(e) => changeSectionCurrency(e.target.value)}
                      disabled={fxBusy}
                      className="h-9 rounded-xl border border-slate-300 bg-white px-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
                    >
                      {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} {c.symbol}</option>)}
                    </select>
                    <HelpTip text={fxDate ? t('fxRatesOn', { date: fxDate }) : t('fxRatesHint')} />
                  </div>
                </div>

                {isMediator ? (
                  <div className="mt-3 text-sm text-rose-700">{t('dispNotAuthorized')}</div>
                ) : (
                  <div className="mt-4 space-y-5">
                    {/* Add a new good (hidden once this party has locked) */}
                    {!lockStatus.my_locked ? (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        {/* Row 1 — the asset name; its placeholder names the field */}
                        <Input
                          value={gname}
                          onChange={(e) => setGname(e.target.value)}
                          placeholder={t('goodNamePlaceholder')}
                          aria-label={t('goodNamePlaceholder')}
                          className="w-full"
                        />

                        {/* Row 2 — the two switches; the second wraps on mobile */}
                        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                          <div className="flex w-full items-center gap-2 sm:w-auto">
                            <Switch2 on={gdiv} onToggle={() => setGdiv(!gdiv)} label={t('divisibleLabel')} />
                            <span>{t('divisibleLabel')}</span>
                            <HelpTip text={t('divisibleHint')} />
                          </div>
                          <div className="flex w-full items-center gap-2 sm:w-auto">
                            <Switch2 on={gdescOn} onToggle={() => setGdescOn(!gdescOn)} label={t('goodsDescriptionToggle')} />
                            <span>{t('goodsDescriptionToggle')}</span>
                            <HelpTip text={t('goodsDescriptionHint')} />
                          </div>
                        </div>

                        {/* Conditional — the description box appears only when asked for */}
                        {gdescOn ? (
                          <textarea
                            value={gdesc}
                            onChange={(e) => setGdesc(e.target.value.slice(0, 2000))}
                            placeholder={t('goodsDescriptionPlaceholder')}
                            rows={5}
                            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm leading-relaxed focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
                          />
                        ) : null}

                        {/* Row 3 — <CUR> price, then "or ✦ AI Estimate" (wraps on mobile) */}
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="inline-flex h-10 shrink-0 items-center rounded-xl border border-slate-300 bg-slate-100 px-2 text-xs font-semibold text-slate-700">
                              {gcur} {CURRENCIES.find((c) => c.code === gcur)?.symbol || ''}
                            </span>
                            <Input
                              value={gval}
                              onChange={(e) => setGval(e.target.value)}
                              placeholder={t('priceWord')}
                              // Inline width: the styled input sets width:100%,
                              // which a Tailwind width class cannot override.
                              style={{ width: '14ch', flex: '0 0 auto' }}
                              inputMode="decimal"
                              maxLength={14}
                            />
                          </div>
                          <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto">
                            <span className="text-xs text-slate-500">{t('orWord')}</span>
                            <button
                              type="button"
                              onClick={runDraftEstimate}
                              disabled={!gname.trim() || draftBusy}
                              title={t('aiEstimateDraftHint')}
                              className="rounded-xl border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              ✦ {draftBusy ? t('aiEstimateWorking') : t('aiEstimate')}
                            </button>
                          </div>
                        </div>

                        {draftBusy ? (
                          <div className="mt-2 rounded-xl border border-slate-200 bg-white p-2">
                            <div className="crea3-skel-line" style={{ width: '70%' }} />
                            <div className="crea3-skel-line" style={{ width: '45%' }} />
                          </div>
                        ) : null}
                        {!draftBusy && draftEst ? (
                          <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 p-2.5">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
                                {t('aiEstimateTldr')}
                              </div>
                              {draftFallback ? <ExternalModelChip t={t} /> : null}
                            </div>
                            <div className="mt-1.5 grid grid-cols-3 gap-2">
                              {([['aiEstimateMin', draftEst.min], ['aiEstimateAvg', draftEst.avg], ['aiEstimateMax', draftEst.max]] as const).map(([k, amt]) => (
                                <button
                                  key={k}
                                  type="button"
                                  onClick={() => {
                                    const applied = Math.round(Number(amt) * 100) / 100
                                    setGval(String(applied))
                                    setGcur(draftEst.currency || gcur)
                                    setDraftApplied(applied)   // carried into the new good's chat
                                  }}
                                  className="rounded-lg border border-emerald-300 bg-white px-2 py-1.5 text-center transition hover:bg-emerald-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                                >
                                  <div className="text-[10px] uppercase tracking-wide text-slate-500">{t(k)}</div>
                                  <div className="text-sm font-bold text-emerald-900">
                                    {Number(amt).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                  </div>
                                </button>
                              ))}
                            </div>
                            <div className="mt-1.5 text-[11px] text-emerald-800">{t('aiEstimateApplyHint')} · {draftEst.currency}</div>
                            {draftText ? (
                              <details className="mt-1.5">
                                <summary className="cursor-pointer text-[11px] text-emerald-900">{t('aiEstimateWhy')}</summary>
                                <div className="estimate-md mt-1 text-xs text-slate-700">
                                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{draftText}</ReactMarkdown>
                                </div>
                              </details>
                            ) : null}
                          </div>
                        ) : null}

                        <div className="mt-3">
                          <Button onClick={addGood} disabled={!canEditWorkflow || !gname.trim()}>
                            {t('addGood')}
                          </Button>
                        </div>
                        {!canEditWorkflow ? (
                          <div className="text-xs text-slate-600 mt-1">You must accept the invite first (or be owner/admin).</div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                        {t('goodsLockedNote')}
                      </div>
                    )}

                    {/* Live goods list */}
                    <div>
                      <div className="text-sm font-semibold mb-2">{t('goodsList')}</div>
                      {(() => {
                        if (isMediator || !isJoined) return null
                        const unvalued = goods.filter(g => (myValues[String(g.id)]?.value_amount ?? null) === null)
                        if (unvalued.length === 0) return null
                        return (
                          <div className="mb-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                            {t('goodsUnvaluedNotice')} <b>{unvalued.map(g => g.name).join(', ')}</b>
                          </div>
                        )
                      })()}
                      <div className="grid gap-2">
                        {goods.map((g) => (
                          <div key={g.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 flex items-center justify-between gap-2 flex-wrap">
                            {(editingGoodId === g.id || (canEditWorkflow && isJoined && !isMediator && myValues[String(g.id)]?.value_amount == null)) ? (
                              <div className="w-full min-w-0">
                                {(() => {
                                  const canEditStructure = canEditWorkflow && !lockStatus.my_locked
                                  const hasVal = myValues[String(g.id)]?.value_amount != null
                                  const curCode = g.meta?.currency || gcur
                                  const curSym = CURRENCIES.find((c) => c.code === curCode)?.symbol || ''
                                  const isFull = editingGoodId === g.id
                                  return (
                                    <>
                                      {!isFull ? <div className="font-medium mb-2">{g.name}</div> : null}
                                      <div className={`grid gap-2 ${isFull ? 'sm:grid-cols-[1fr_auto] sm:items-center' : ''}`}>
                                        {isFull ? (
                                          <Input
                                            value={editGoodName}
                                            onChange={(e) => setEditGoodName(e.target.value)}
                                            placeholder={t('goodNamePlaceholder')}
                                            aria-label={t('goodNamePlaceholder')}
                                            disabled={!canEditStructure}
                                            className="w-full"
                                          />
                                        ) : null}
                                        {/* This party's own price for the asset */}
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className="text-xs text-slate-500 whitespace-nowrap">{t('yourValueWord')}:</span>
                                          <span className="inline-flex h-10 shrink-0 items-center rounded-xl border border-slate-300 bg-slate-100 px-2 text-xs font-semibold text-slate-700">
                                            {curCode} {curSym}
                                          </span>
                                          <Input
                                            type="number"
                                            placeholder={t('yourValuePlaceholder')}
                                            value={valueDraft[g.id] ?? myValueFor(g.id)}
                                            onChange={(e) => setValueDraft((d) => ({ ...d, [g.id]: e.target.value }))}
                                            onKeyDown={(e) => { if (e.key === 'Enter') saveGoodEdit(g) }}
                                            style={{ width: '14ch', flex: '0 0 auto' }}
                                            inputMode="decimal"
                                          />
                                        </div>
                                      </div>
                                      {isFull ? (
                                        <textarea
                                          value={editGoodDesc}
                                          onChange={(e) => setEditGoodDesc(e.target.value.slice(0, 2000))}
                                          placeholder={t('goodsDescriptionPlaceholder')}
                                          disabled={!canEditStructure}
                                          rows={3}
                                          className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm leading-relaxed focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:opacity-60"
                                        />
                                      ) : null}
                                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                                        <div className="flex items-center gap-2 text-sm">
                                          <Switch2
                                            on={divisibleDraft[g.id] !== undefined ? divisibleDraft[g.id] : myDivisibleFor(g.id)}
                                            onToggle={() => setDivisibleDraft((d) => ({ ...d, [g.id]: !(d[g.id] !== undefined ? d[g.id] : myDivisibleFor(g.id)) }))}
                                            label={t('divisibleLabel')}
                                          />
                                          <span>{t('divisibleLabel')}</span>
                                          <HelpTip text={t('divisibleHint')} />
                                        </div>
                                        <div className="flex items-center gap-2 ml-auto">
                                          <Button onClick={() => saveGoodEdit(g)}>{t('saveWord')}</Button>
                                          {hasVal ? (
                                            <Button variant="ghost" onClick={() => { setEditingGoodId(null); setEditGoodName(''); setEditGoodDesc('') }}>
                                              {t('cancelWord')}
                                            </Button>
                                          ) : null}
                                        </div>
                                      </div>
                                    </>
                                  )
                                })()}
                              </div>
                            ) : (
                              <>
                                <div className="min-w-[180px] max-w-full">
                                  <div className="font-medium">{g.name}</div>
                                  {g.meta?.description ? (
                                    <div className="text-xs text-slate-600 mt-0.5 whitespace-pre-wrap break-words">
                                      {g.meta.description}
                                    </div>
                                  ) : null}
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  {canEditWorkflow && isJoined && !isMediator && myValues[String(g.id)]?.value_amount != null ? (
                                    <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
                                      <span className="text-slate-600">{t('yourValueWord')}:</span>
                                      <b>
                                        {CURRENCIES.find((c) => c.code === (g.meta?.currency || gcur))?.symbol || ''}
                                        {Number(myValues[String(g.id)]?.value_amount || 0).toLocaleString('it-IT')}
                                      </b>
                                      <span className="text-slate-500">·</span>
                                      <span>{myDivisibleFor(g.id) ? t('divisibleLabel').toLowerCase() : t('indivisibleWord')}</span>
                                      <span aria-hidden>✓</span>
                                      <span className="text-emerald-700">{t('savedWord')}</span>
                                    </span>
                                  ) : null}
                                  {canEditWorkflow && isJoined && !isMediator ? (
                                    <Button variant="ghost" className="text-xs" onClick={() => openGoodEdit(g)}>
                                      {t('editWord')}
                                    </Button>
                                  ) : null}
                                  {!lockStatus.my_locked && canEditWorkflow ? (
                                    <button
                                      type="button"
                                      onClick={() => setGoodToDelete(g)}
                                      className="rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
                                    >
                                      {t('deleteWord')}
                                    </button>
                                  ) : null}
                                  {/* Per-asset market-valuation assistant */}
                                  <button
                                    type="button"
                                    aria-expanded={estimateOpen === g.id}
                                    onClick={() => setEstimateOpen(estimateOpen === g.id ? null : g.id)}
                                    className={`rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 ${
                                      estimateOpen === g.id
                                        ? 'border-indigo-300 bg-indigo-100 text-indigo-800'
                                        : 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                                    }`}
                                  >
                                    ✦ {t('aiEstimate')} {estimateOpen === g.id ? '▴' : '▾'}
                                  </button>
                                </div>
                              </>
                            )}
                            {/* Drops down inside this good's own card */}
                            {estimateOpen === g.id ? (
                              <div className="w-full basis-full min-w-0 max-w-full mt-2">
                                <EstimatePanel
                                  disputeId={disputeId} good={g} t={t} lang={lang} currency={gcur}
                                  onApplyPrice={(amt, curr) => applyEstimatePrice(g, amt, curr)}
                                  onApplyDetails={(title, desc) => applyEstimateDetails(g, title, desc)}
                                />
                              </div>
                            ) : null}
                          </div>
                        ))}
                        {goods.length === 0 ? <div className="text-sm text-slate-600">{t('noGoodsYet')}</div> : null}
                      </div>
                    </div>

                  </div>
                )}
              </div>
            ) : null}

            {/* PREFERENCES — rate goods, then "Next" */}
            {tab === 'prefs' ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-base font-semibold text-slate-900">{t('tabPreferences')}</div>
                <div className="text-sm text-slate-600 mt-1">{t('prefsTabSubtitle')}</div>

                {isMediator ? (
                  <div className="mt-3 text-sm text-rose-700">{t('dispNotAuthorized')}</div>
                ) : !lockStatus.all_locked ? (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    {(lockStatus.pending_count ?? 0) > 0
                      ? `${t('prefsWaitingAccept')} ${(lockStatus.pending_names || []).join(', ')}`
                      : t('prefsLockedUntilGoods')}
                  </div>
                ) : (
                  <div className="mt-4 space-y-5">
                    {/* Star budget banner */}
                    {!isMediator ? (
                      <div className={`rounded-xl border px-3 py-2 text-sm flex items-center justify-between gap-2 flex-wrap ${starsUsed >= starsTotal ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-blue-200 bg-blue-50 text-blue-800'}`}>
                        <span>⭐ {t('starBudgetLabel', { used: starsUsed, total: starsTotal })}</span>
                        <span className="text-xs opacity-80">{t('starBudgetHint')}</span>
                      </div>
                    ) : null}
                    {/* Goods list with inline star rating */}
                    <div className="grid gap-2">
                      {goods.map((g) => {
                        const current = myStarsFor(g.id)
                        return (
                          <div key={g.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 flex items-center justify-between gap-3 flex-wrap">
                            <div className="min-w-[180px]">
                              <div className="font-medium">{g.name}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-slate-500">{t('yourRatingWord')}:</span>
                              <HelpTip text={t('helpStars')} />
                              <div className="flex items-center gap-1" role="group" aria-label={`Rate ${g.name}`}>
                                {[1, 2, 3, 4, 5].map((s) => {
                                  // Stars still available for THIS good = budget left + its current stars.
                                  const maxForGood = Math.min(5, starsTotal - starsUsed + current)
                                  const overBudget = s > maxForGood
                                  return (
                                  <button
                                    key={s}
                                    type="button"
                                    disabled={!canEditWorkflow || meParticipation?.ready || overBudget}
                                    title={overBudget ? t('starBudgetHint') : undefined}
                                    onClick={() => ratePreference(g.id, s)}
                                    aria-label={`${s} star${s > 1 ? 's' : ''}`}
                                    className={`text-lg leading-none ${s <= current ? 'text-amber-500' : 'text-slate-300'} ${overBudget ? 'opacity-30 cursor-not-allowed' : (canEditWorkflow && !meParticipation?.ready) ? 'hover:text-amber-400 cursor-pointer' : 'cursor-not-allowed'}`}
                                  >
                                    ★
                                  </button>
                                )})}
                              </div>
                              {current > 0 ? <span className="text-xs text-emerald-600">{current}/5</span> : <span className="text-xs text-slate-400">{t('notRatedWord')}</span>}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {/* RECONCILE */}
            {tab === 'reconcile' ? (
              <ReconciliationPanel
                disputeId={disputeId!}
                myAgentId={meParticipation?.id ?? null}
                isMediator={isMediator}
                onProposalGenerated={async () => { await loadAll(); setTab('proposals') }}
              />
            ) : null}

            {/* PROPOSALS */}
            {tab === 'proposals' ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-base font-semibold text-slate-900">{t('dispAllocProposalsTitle')}</div>
                    <div className="text-sm text-slate-600 mt-1">
                      {t('dispMediatorViewNote')}
                    </div>
                  </div>

                  {(() => {
                    if (isMediator) return null
                    // The allocation is auto-created at reconciliation finalize and
                    // is NEVER regenerated from here (a regeneration would reset the
                    // parties' decisions). "Generate proposal" is per-user: it
                    // unlocks once THIS user has pressed I agree OR I disagree,
                    // builds their report once, then greys (idempotent).
                    const myDecided = (latestProposal as any)?.my_decision === true || (latestProposal as any)?.my_decision === false
                    const enabled =
                      (!latestProposal && !proposalsLocked) ||
                      (!!latestProposal && myDecided && !reportGenerated)
                    const hint = reportGenerated
                      ? t('proposalGeneratedHint')
                      : latestProposal && !myDecided ? t('generateNeedsDecisionHint') : ''
                    const onClick = async () => {
                      if (!enabled) return
                      if (!latestProposal) { await generateProposal(); return }
                      await generateProposalReport()
                      try { if (genKey) localStorage.setItem(genKey, '1') } catch {}
                      setReportGenerated(true)
                    }
                    return (
                      <div className="flex items-center gap-2">
                        <span title={hint}>
                          <Button onClick={onClick} disabled={!enabled} className={!enabled ? 'opacity-50 cursor-not-allowed' : ''}>
                            {reportGenerated ? `✓ ${t('generateProposalWord')}` : t('generateProposalWord')}
                          </Button>
                        </span>
                        <HelpTip text={t('helpGenerateProposal')} />
                      </div>
                    )
                  })()}
                </div>

                {isMediator ? (
                  <div className="mt-2 text-xs text-slate-600">{t('dispMediatorReadonly')}</div>
                ) : null}

                {stepStatus('proposals') === 'blocked' && !isMediator ? (
                  <div className="mt-3 text-sm text-rose-700">
                    {t('dispProposalBlocked')}
                  </div>
                ) : null}

                <div className="mt-4 space-y-3">
                  {latestProposal ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div>
                          <div className="font-semibold text-slate-900">{t('allocationProposalTitle')}</div>
                          <div className="text-xs text-slate-500">#{latestProposal.id}</div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-slate-500">{t('downloadWord')}</span>
                            <HelpTip text={t('helpDownloads')} />
                            <div className={`inline-flex overflow-hidden rounded-xl border divide-x ${reportGenerated ? 'border-slate-300 divide-slate-300' : 'border-slate-200 divide-slate-200'}`}>
                              <button
                                type="button"
                                onClick={downloadReport}
                                disabled={!reportGenerated}
                                title={reportGenerated ? '' : t('downloadAfterGenerateHint')}
                                className="px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
                              >
                                PDF
                              </button>
                              <button
                                type="button"
                                onClick={downloadExcel}
                                disabled={!reportGenerated}
                                title={reportGenerated ? '' : t('downloadAfterGenerateHint')}
                                className="px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
                              >
                                Excel
                              </button>
                              <button
                                type="button"
                                onClick={downloadAuditLog}
                                disabled={!reportGenerated}
                                title={reportGenerated ? '' : t('downloadAfterGenerateHint')}
                                className="px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
                              >
                                {t('auditWord')}
                              </button>
                            </div>
                          </div>
                          {!reportGenerated ? (
                            <div className="max-w-[240px] text-right text-[11px] leading-snug text-slate-400">
                              {t('downloadAfterGenerateHint')}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      {/* Decision block sits at the top, right under the header. */}
                      {!isMediator ? (
                        <ProposalDecision
                          proposalId={latestProposal.id}
                          disabled={!canEditWorkflow || !isJoined}
                          myDecision={(latestProposal as any).my_decision}
                          onDecide={(accepted, motivation) => acceptProposal(latestProposal.id, accepted, motivation)}
                          t={t}
                        />
                      ) : (
                        <div className="mt-4 text-xs text-slate-500">{t('mediatorViewOnlyProposal')}</div>
                      )}

                      <AllocationView proposal={latestProposal} t={t} agents={agents} disputeId={disputeId} lang={lang} />
                    </div>
                  ) : (
                    <div className="text-sm text-slate-600">{t('noProposalsYet')}</div>
                  )}

                  {dispute?.status === 'accepted' ? (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                      {t('dispAllAccepted')}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* MEDIATION */}
            {tab === 'mediation' ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-base font-semibold text-slate-900">Mediation</div>
                <div className="text-sm text-slate-600 mt-1">{t('dispPlanConfHint')}</div>

                {stepStatus('mediation') === 'blocked' ? (
                  <div className="mt-3 text-sm text-rose-700">{t('dispNotAuthProposal')}</div>
                ) : (
                  <div className="mt-4 space-y-3">
                    <div className="text-sm text-slate-700">
                      Status: <b>{dispute?.status}</b>
                    </div>
                    <MediationPlanner disputeId={disputeId} myAgentId={meParticipation?.id ?? null} />
                  </div>
                )}
              </div>
            ) : null}

            {/* ROOM */}
            {tab === 'room' ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-base font-semibold text-slate-900">{t('dispRoomTitle')}</div>
                <div className="text-sm text-slate-600 mt-1">{t('dispRoomSubtitle')}</div>

                {stepStatus('room') === 'blocked' ? (
                  <div className="mt-3 text-sm text-rose-700">{t('dispNotAuthRoom')}</div>
                ) : (
                  <div className="mt-4 grid md:grid-cols-2 gap-4">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="font-semibold">{t('dispVideoNow')}</div>
                      <div className="text-sm text-slate-600 mt-1">{t('dispVideoNowSub')}</div>
                      <Button
                        className="mt-3"
                        onClick={() =>
                          window.open(`https://meet.jit.si/CREA3-Dispute-${disputeId}#config.prejoinPageEnabled=false`, '_blank')
                        }
                      >
                        {t('dispOpenRoom')}
                      </Button>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="font-semibold">{t('dispPlanConf')}</div>
                      <div className="text-sm text-slate-600 mt-1">{t('dispPlanConfSub')}</div>
                      <Button className="mt-3" variant="ghost" onClick={() => setTab('mediation')}>
                        {t('dispPlanAgreeDate')}
                      </Button>
                    </div>
                  </div>
                )}

                <div className="mt-4">
                  <DocumentsPanel disputeId={disputeId} />
                </div>
              </div>
            ) : null}

          </div>
        </div>
      </Card>

      {/* Delete-asset confirmation — deleting a good also removes its ratings,
          reconciliation answers and AI-Estimate conversation. */}
      <Dialog open={!!goodToDelete} onClose={() => (!deletingGood ? setGoodToDelete(null) : null)} fullWidth maxWidth="xs"
        sx={{ '& .MuiDialog-paper': { m: { xs: 1, sm: 3 }, width: { xs: 'calc(100% - 16px)', sm: '100%' }, borderRadius: 3 } }}>
        <DialogTitle sx={{ pb: 1 }}>{t('deleteGoodTitle')}</DialogTitle>
        <DialogContent>
          <div className="text-sm text-slate-700">
            {t('deleteGoodConfirm', { name: goodToDelete?.name || '' })}
          </div>
          <div className="mt-2 text-xs text-slate-500">{t('deleteGoodWarning')}</div>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1, flexWrap: 'wrap' }}>
          <MuiButton onClick={() => setGoodToDelete(null)} disabled={deletingGood}>{t('cancelWord')}</MuiButton>
          <MuiButton variant="contained" color="error" onClick={confirmDeleteGood} disabled={deletingGood}>
            {deletingGood ? t('deletingWord') : t('deleteWord')}
          </MuiButton>
        </DialogActions>
      </Dialog>
    </div>
  )
}

// Two interactive pie charts (Chart.js): value received by each party, and the
// asset pool by value. Same data feeds the generated PDF (server-side reportlab).
function AllocationCharts({ allocations, money, t }: {
  allocations: any[]
  money: (n: number) => string
  t: (k: any) => string
}) {
  const { agentItems, assetItems } = useMemo(() => {
    const perAgent: Record<string, number> = {}
    const assets: Array<{ name: string; value: number }> = []
    for (const a of allocations || []) {
      const val = Number(a.estimated_value || 0)
      if (val > 0) assets.push({ name: a.good_name || '—', value: val })
      if (val <= 0) continue
      const frby = a.fraction_by_name
      if (a.divisible && frby && Object.keys(frby).length) {
        for (const [name, frac] of Object.entries<any>(frby)) {
          const share = val * Number(frac)
          if (share > 0) perAgent[name] = (perAgent[name] || 0) + share
        }
      } else {
        const name = a.assigned_agent_name || 'Unassigned'
        perAgent[name] = (perAgent[name] || 0) + val
      }
    }
    const agentItems = Object.entries(perAgent).map(([name, value]) => ({ name, value })).filter((x) => x.value > 0)
    return { agentItems, assetItems: assets }
  }, [allocations])

  if (!agentItems.length && !assetItems.length) return null

  const makeData = (items: Array<{ name: string; value: number }>) => ({
    labels: items.map((i) => i.name),
    datasets: [{
      data: items.map((i) => i.value),
      backgroundColor: items.map((_, i) => CHART_PALETTE[i % CHART_PALETTE.length]),
      borderColor: '#ffffff',
      borderWidth: 2,
    }],
  })
  const makeOptions = (items: Array<{ name: string; value: number }>) => {
    const total = items.reduce((s, i) => s + i.value, 0) || 1
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' as const, labels: { boxWidth: 12, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: (ctx: any) => {
              const v = Number(ctx.parsed || 0)
              const pct = Math.round((v / total) * 100)
              return `${ctx.label}: ${money(v)} (${pct}%)`
            },
          },
        },
      },
    }
  }

  return (
    <div className="mt-4">
      <div className="text-sm font-semibold text-slate-900 mb-2">{t('statsTitle')}</div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-xs font-medium text-slate-600 mb-2">{t('statsAgentsTitle')}</div>
          <div style={{ height: 260 }}>
            {agentItems.length ? <Pie data={makeData(agentItems)} options={makeOptions(agentItems)} /> : <div className="text-xs text-slate-400">—</div>}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-xs font-medium text-slate-600 mb-2">{t('statsAssetsTitle')}</div>
          <div style={{ height: 260 }}>
            {assetItems.length ? <Pie data={makeData(assetItems)} options={makeOptions(assetItems)} /> : <div className="text-xs text-slate-400">—</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

// Assemble a compact allocation + statistics summary (the party's own data) to
// send to the "What if …" analysis on the backend.
function buildWhatIfContext(allocations: any[], money: (n: number) => string): string {
  const lines: string[] = ['Proposed allocation (who receives what):']
  const perAgent: Record<string, number> = {}
  const assets: Array<{ name: string; value: number }> = []
  for (const a of allocations || []) {
    const val = Number(a.estimated_value || 0)
    const frby = a.fraction_by_name
    if (a.divisible && frby && Object.keys(frby).length > 1) {
      const parts = Object.entries<any>(frby).map(([n, f]) => `${n} ${Math.round(Number(f) * 100)}%`).join(', ')
      lines.push(`- ${a.good_name}: split ${parts} (value ${money(val)})`)
      for (const [n, f] of Object.entries<any>(frby)) { const s = val * Number(f); if (s > 0) perAgent[n] = (perAgent[n] || 0) + s }
    } else {
      const who = a.assigned_agent_name || 'Unassigned'
      lines.push(`- ${a.good_name} → ${who} (value ${money(val)})`)
      if (val > 0) perAgent[who] = (perAgent[who] || 0) + val
    }
    if (val > 0) assets.push({ name: a.good_name || '—', value: val })
  }
  const agentTotal = Object.values(perAgent).reduce((s, v) => s + v, 0) || 1
  lines.push('', 'Value received by each party:')
  for (const [name, v] of Object.entries(perAgent)) lines.push(`- ${name}: ${money(v)} (${Math.round((v / agentTotal) * 100)}%)`)
  const assetTotal = assets.reduce((s, a) => s + a.value, 0) || 1
  lines.push('', 'Assets by value:')
  for (const a of assets) lines.push(`- ${a.name}: ${money(a.value)} (${Math.round((a.value / assetTotal) * 100)}%)`)
  return lines.join('\n')
}

// "What if …" — agree/disagree are pre-generated in the background and stored per
// dispute; 'differ' lets the user type a custom scenario. Results are fetched from
// the DB (polling while generating), so nothing streams live and freezes.
// Amber "external model" marker — shown when the analysis was produced by the
// hosted fallback because the local legal AI (LexAI) was unavailable.
function ExternalModelChip({ t }: { t: (k: any) => string }) {
  return (
    <span
      title={t('aiExternalModelHint')}
      className="inline-flex items-center gap-1 rounded-full border border-amber-400 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700"
    >
      ⚠ {t('aiExternalModel')}
    </span>
  )
}

// "P2Y9M" / "PY07M" → "2 years, 9 months" / "7 months" (localized); '' → '-'.
function humanDuration(raw: string, t: (k: any) => string): string {
  const v = (raw || '').trim()
  if (!v) return '-'
  const y = /(\d+)\s*Y/i.exec(v)
  const m = /(\d+)\s*M(?!I)/i.exec(v.replace(/^P?\d*Y/i, ''))
  const years = y ? parseInt(y[1], 10) : 0
  const months = m ? parseInt(m[1], 10) : 0
  const parts: string[] = []
  if (years > 0) parts.push(`${years} ${t(years === 1 ? 'durYear' : 'durYears')}`)
  if (months > 0) parts.push(`${months} ${t(months === 1 ? 'durMonth' : 'durMonths')}`)
  return parts.length ? parts.join(', ') : '-'
}

// Court references for a party who DISAGREES — closest past legal cases from
// the LexAI knowledge base, listed with the court/instance that handled them.
function CourtReferences({ disputeId, t }: { disputeId: number; t: (k: any) => string }) {
  const [state, setState] = useState<{ loading: boolean; available: boolean; courts: any[] }>({
    loading: true, available: true, courts: [],
  })
  const [tick, setTick] = useState(0)   // bump to retry the lookup
  useEffect(() => {
    let alive = true
    setState((s) => ({ ...s, loading: true }))
    ;(async () => {
      try {
        const d = await api(`/api/assistant/what-if/court-references?dispute_id=${disputeId}`)
        if (alive) setState({ loading: false, available: d?.available !== false, courts: d?.courts ?? [] })
      } catch {
        if (alive) setState({ loading: false, available: false, courts: [] })
      }
    })()
    return () => { alive = false }
  }, [disputeId, tick])

  return (
    <details open className="mt-3 rounded-xl border border-slate-200 bg-white">
      <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-slate-800">
        ⚖️ {t('whatIfCourtRefsTitle')}
      </summary>
      <div className="px-3 pb-3">
        <div className="text-xs text-slate-500 mb-2">{t('whatIfCourtRefsHint')}</div>
        {state.loading ? (
          <div className="text-sm text-slate-500">{t('whatIfCourtRefsLoading')}</div>
        ) : !state.available ? (
          <div className="text-sm text-amber-700">
            {t('whatIfCourtRefsUnavailable')}{' '}
            <button className="text-blue-600 hover:underline" onClick={() => setTick((n) => n + 1)}>⟳ {t('refresh')}</button>
          </div>
        ) : !state.courts.length ? (
          <div className="text-sm text-slate-500">
            {t('whatIfCourtRefsEmpty')}{' '}
            <button className="text-blue-600 hover:underline" onClick={() => setTick((n) => n + 1)}>⟳ {t('refresh')}</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                  <th className="py-1.5 pr-3">{t('courtColCourt')}</th>
                  <th className="py-1.5 pr-3">{t('courtColCase')}</th>
                  <th className="py-1.5">{t('courtColDuration')}</th>
                </tr>
              </thead>
              <tbody>
                {state.courts.map((c: any, i: number) => (
                  <tr key={i} className="border-b border-slate-100 align-top">
                    <td className="py-1.5 pr-3 font-medium text-slate-800">
                      {c.country} — {c.court_name || t('courtUnspecified')}
                    </td>
                    <td className="py-1.5 pr-3">
                      {c.case_url ? (
                        <a href={c.case_url} target="_blank" rel="noopener noreferrer"
                          className="text-blue-600 hover:underline">{c.case_id || '-'}</a>
                      ) : (c.case_id || '-')}
                    </td>
                    <td className="py-1.5 text-slate-600">{humanDuration(c.duration, t)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </details>
  )
}

function WhatIfAnswer({ row, t }: { row: any; t: (k: any) => string }) {
  // Typewriter reveal — plays only when THIS mount watched the row generate
  // (a stored analysis reopened later renders instantly).
  const sawGenerating = useRef(false)
  const [shown, setShown] = useState<number | null>(null)
  useEffect(() => {
    if (row?.status === 'generating') { sawGenerating.current = true; setShown(null); return }
    if (row?.status === 'done' && sawGenerating.current && row.answer) {
      sawGenerating.current = false
      let i = 0
      setShown(0)
      const id = window.setInterval(() => {
        const len = String(row.answer || '').length
        i = Math.min(len, i + Math.max(4, Math.ceil((len - i) / 25)))
        setShown(i)
        if (i >= len) window.clearInterval(id)
      }, 30)
      return () => window.clearInterval(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row?.status, row?.id])

  if (!row || row.status === 'generating') {
    // Shimmer skeleton while the analysis generates in the background.
    return (
      <div aria-label={t('whatIfThinking')} className="py-1">
        <div className="text-xs text-slate-500 mb-1.5">{t('whatIfThinking')}</div>
        <div className="crea3-skel-line" style={{ width: '95%' }} />
        <div className="crea3-skel-line" style={{ width: '100%' }} />
        <div className="crea3-skel-line" style={{ width: '88%' }} />
        <div className="crea3-skel-line" style={{ width: '96%' }} />
        <div className="crea3-skel-line" style={{ width: '52%' }} />
      </div>
    )
  }
  if (row.status === 'error') return <div className="text-rose-700 text-sm">{row.answer || 'Error'}</div>
  const fullText = String(row.answer || '—')
  const displayText = shown != null && shown < fullText.length ? fullText.slice(0, shown) : fullText
  return (
    <div className="whatif-md space-y-2 leading-relaxed text-sm text-slate-800">
      {row.fallback ? <div><ExternalModelChip t={t} /></div> : null}
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Case-reference links open the KB source page in a new tab.
          a: (props: any) => (
            <a {...props} target="_blank" rel="noopener noreferrer"
              className="text-blue-600 hover:underline" />
          ),
        }}
      >{displayText}</ReactMarkdown>
      {row.fallback ? <div className="pt-1"><ExternalModelChip t={t} /></div> : null}
    </div>
  )
}

function WhatIfSection({ disputeId, allocations, money, t, lang }: {
  disputeId: number
  allocations: any[]
  money: (n: number) => string
  t: (k: any) => string
  lang: string
}) {
  const [data, setData] = useState<{ agree: any; disagree: any; differ: any[] }>({ agree: null, disagree: null, differ: [] })
  const [view, setView] = useState<'agree' | 'disagree' | null>(null)
  const [differText, setDifferText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const context = useMemo(() => buildWhatIfContext(allocations, money), [allocations])
  const startedRef = React.useRef(false)

  async function loadList() {
    try {
      const d = await api(`/api/assistant/what-if/list?dispute_id=${disputeId}`)
      setData({ agree: d?.agree ?? null, disagree: d?.disagree ?? null, differ: d?.differ ?? [] })
      return d
    } catch { return null }
  }

  async function generate(scenario: 'agree' | 'disagree' | 'differ', custom?: string) {
    try {
      await api('/api/assistant/what-if/generate', {
        method: 'POST',
        body: { dispute_id: disputeId, scenario, context, custom_question: custom, lang },
      })
    } catch (e: any) { setErr(e?.message || 'Could not start the analysis.') }
  }

  // On first mount: load stored results, and pre-generate agree/disagree if absent.
  useEffect(() => {
    if (!allocations?.length || startedRef.current) return
    startedRef.current = true
    ;(async () => {
      const d = await loadList()
      if (d && !d.agree) await generate('agree')
      if (d && !d.disagree) await generate('disagree')
      if (d && (!d.agree || !d.disagree)) loadList()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disputeId, allocations?.length])

  // Poll while anything is still generating.
  useEffect(() => {
    const generating = data.agree?.status === 'generating'
      || data.disagree?.status === 'generating'
      || (data.differ || []).some((r: any) => r.status === 'generating')
    if (!generating) return
    const id = setInterval(loadList, 3000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  async function submitDiffer() {
    const q = differText.trim()
    if (!q || submitting) return
    setSubmitting(true); setErr(null)
    await generate('differ', q)
    setDifferText('')
    await loadList()
    setSubmitting(false)
  }

  async function del(id: number) {
    try { await api(`/api/assistant/what-if/${id}`, { method: 'DELETE' }); loadList() } catch { /* ignore */ }
  }

  // Re-run a stored scenario with the CURRENT parameters and overwrite it.
  async function regenerate(id: number) {
    setErr(null)
    try { await api('/api/assistant/what-if/regenerate', { method: 'POST', body: { id, context, lang } }); await loadList() }
    catch (e: any) { setErr(e?.message || 'Could not reevaluate.') }
  }
  async function reevaluate(scenario: 'agree' | 'disagree') {
    const row = scenario === 'agree' ? data.agree : data.disagree
    if (row?.id) await regenerate(row.id)
    else { await generate(scenario); await loadList() }
  }

  if (!allocations || !allocations.length) return null

  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-sm font-semibold text-slate-900">{t('whatIfTitle')}</div>
      <div className="text-sm text-slate-600 mt-1">{t('whatIfSubtitle')}</div>
      {err ? <div className="mt-2 text-sm text-rose-700">{err}</div> : null}

      {/* Pre-generated agree / disagree */}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant={view === 'agree' ? 'primary' : 'outline'} onClick={() => setView('agree')}>
          {t('whatIfAgree')}{data.agree?.status === 'generating' ? ' …' : ''}
        </Button>
        <Button variant={view === 'disagree' ? 'primary' : 'outline'} onClick={() => setView('disagree')}>
          {t('whatIfDisagree')}{data.disagree?.status === 'generating' ? ' …' : ''}
        </Button>
      </div>
      {view ? (
        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex justify-end">
            <button
              className="text-xs text-blue-600 hover:underline disabled:opacity-50"
              onClick={() => reevaluate(view)}
              disabled={(view === 'agree' ? data.agree : data.disagree)?.status === 'generating'}
            >
              ⟳ {t('whatIfReeval')}
            </button>
          </div>
          <WhatIfAnswer row={view === 'agree' ? data.agree : data.disagree} t={t} />
          {/* Court references — only when the party leans toward DISAGREEING;
              hidden entirely when they switch back to "I agree". */}
          {view === 'disagree' ? <CourtReferences disputeId={disputeId} t={t} /> : null}
        </div>
      ) : null}

      {/* Differ — custom scenario + history */}
      <div className="mt-4">
        <div className="text-sm font-medium text-slate-800">{t('whatIfDiffer')}</div>
        <div className="text-xs text-slate-500 mt-0.5 mb-2">{t('whatIfDifferHint')}</div>
        <div className="flex flex-col sm:flex-row gap-2">
          <textarea
            value={differText}
            onChange={(e) => setDifferText(e.target.value)}
            placeholder={t('whatIfDifferPlaceholder')}
            rows={2}
            className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          <div>
            <Button onClick={submitDiffer} disabled={submitting || !differText.trim()}>
              {submitting ? '…' : t('whatIfAnalyze')}
            </Button>
          </div>
        </div>

        {(data.differ || []).length ? (
          <div className="mt-3 space-y-2">
            {data.differ.map((row: any) => (
              <details key={row.id} className="rounded-xl border border-slate-200 bg-white">
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-slate-700">
                  {row.title}{row.status === 'generating' ? ` — ${t('whatIfThinking')}` : ''}
                </summary>
                <div className="px-3 pb-3">
                  <WhatIfAnswer row={row} t={t} />
                  <div className="mt-2 flex gap-3">
                    <button
                      className="text-xs text-blue-600 hover:underline disabled:opacity-50"
                      onClick={() => regenerate(row.id)}
                      disabled={row.status === 'generating'}
                    >
                      ⟳ {t('whatIfReeval')}
                    </button>
                    <button className="text-xs text-rose-600 hover:underline" onClick={() => del(row.id)}>
                      {t('whatIfDelete')}
                    </button>
                  </div>
                </div>
              </details>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function SummaryCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 leading-tight">{title}</div>
      <div className="text-xs text-slate-800 mt-0.5 whitespace-nowrap leading-tight">{value}</div>
    </div>
  )
}

type StepChip = { label: string; done: boolean }

// Dedicated "do you agree with this proposal?" block. On disagree, the party may
// add an optional motivation. Submitting records the decision (accept/reject +
// comment) via the accept endpoint.
function ProposalDecision({
  proposalId,
  disabled,
  onDecide,
  t,
  myDecision,
}: {
  proposalId: number
  disabled?: boolean
  onDecide: (accepted: boolean, motivation?: string) => void
  t: (k: any) => string
  myDecision?: boolean | null
}) {
  const [choice, setChoice] = useState<'agree' | 'disagree' | null>(null)
  const [motivation, setMotivation] = useState('')
  void proposalId

  // Once this party has recorded a decision, hide the controls and show that we
  // are waiting for the other party (no double submission / CRUD violation).
  if (myDecision === true || myDecision === false) {
    return (
      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <div className="text-sm font-semibold text-slate-900">{t('decisionTitle')}</div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium text-emerald-700">✓ {myDecision ? t('agreeWord') : t('disagreeWord')}</span>
          <span className="rounded-lg bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">{t('reconcileWaitingOther')}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-sm font-semibold text-slate-900">{t('decisionTitle')}</div>
      <div className="text-xs text-slate-600 mt-1">{t('decisionHint')}</div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setChoice('agree')}
          disabled={disabled}
          className={[
            'rounded-xl px-4 py-2 min-h-[44px] text-sm font-semibold border transition focus:outline-none focus-visible:ring-2',
            choice === 'agree'
              ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700 focus-visible:ring-emerald-300'
              : 'bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-50 focus-visible:ring-emerald-300',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          ].join(' ')}
        >
          {t('agreeWord')}
        </button>
        <button
          type="button"
          onClick={() => setChoice('disagree')}
          disabled={disabled}
          className={[
            'rounded-xl px-4 py-2 min-h-[44px] text-sm font-semibold border transition focus:outline-none focus-visible:ring-2',
            choice === 'disagree'
              ? 'bg-rose-600 text-white border-rose-600 hover:bg-rose-700 focus-visible:ring-rose-300'
              : 'bg-white text-rose-700 border-rose-300 hover:bg-rose-50 focus-visible:ring-rose-300',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          ].join(' ')}
        >
          {t('disagreeWord')}
        </button>
      </div>

      {choice === 'disagree' ? (
        <div className="mt-3">
          <label className="text-xs font-medium text-slate-700">{t('motivationLabel')}</label>
          <textarea
            value={motivation}
            onChange={(e) => setMotivation(e.target.value)}
            placeholder={t('motivationPlaceholder')}
            maxLength={1000}
            rows={3}
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
          />
          <div className="text-[11px] text-slate-400 text-right">{motivation.length}/1000</div>
        </div>
      ) : null}

      {choice ? (
        <div className="mt-3">
          <Button
            onClick={() => onDecide(choice === 'agree', choice === 'disagree' ? motivation : undefined)}
            disabled={disabled}
          >
            {t('submitDecisionWord')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

// Professional, human-readable view of an allocation proposal: who receives what
// (with divisible splits), each party's own valuation, and the cash settlement.
function AllocationView({ proposal, t, agents, disputeId, lang }: { proposal: any; t: (k: any) => string; agents?: { id: number; name: string; entitlement_share?: number }[]; disputeId?: number; lang?: string }) {
  // Per-asset expandable detail rows (initializer / divisibility / set values /
  // per-asset balancing).
  const [openRows, setOpenRows] = useState<Set<number>>(new Set())
  const entByAid: Record<string, number> = Object.fromEntries((agents || []).map((a) => [String(a.id), Number(a.entitlement_share ?? 0)]))
  const toggleRow = (i: number) => setOpenRows((prev) => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n })
  const out = proposal?.outputs || {}
  const allocations: any[] = out.allocations || []
  const comp: Record<string, number> = out.compensation_by_agent || {}
  const compNote: string = out.compensation_note || ''
  const nameByAid: Record<string, string> = Object.fromEntries((agents || []).map(a => [String(a.id), a.name]))
  const money = (n: number) => `€${Number(n || 0).toLocaleString('it-IT', { maximumFractionDigits: 0 })}`

  // Net cash per party: positive = receives, negative = pays.
  const compEntries = Object.entries(comp)
  const anyCash = compEntries.some(([, v]) => Math.abs(Number(v)) > 0.5)

  return (
    <div className="mt-4 space-y-5">
      {/* Allocation table: Asset | common reconciled price | per-agent reconciled
          price | per-agent allocation %. Each asset row expands (▸) to show who
          it is assigned to and whether it is divisible. */}
      <div>
        <div className="text-sm font-semibold text-slate-900 mb-2">{t('whoGetsWhat')}</div>
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          {(() => {
            const ids = new Set<string>()
            allocations.forEach((a) => Object.keys(a.party_valuations || {}).forEach((k) => ids.add(k)))
            Object.keys(comp).forEach((k) => ids.add(k))
            const agentIds = Array.from(ids).sort()
            const nCols = 2 + agentIds.length * 2
            return (
              <table className="w-full min-w-[640px] text-xs sm:text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th rowSpan={2} className="text-left font-medium px-3 py-2 align-bottom sticky left-0 bg-slate-50 z-10">{t('assetWord')}</th>
                    <th rowSpan={2} className="text-right font-medium px-3 py-2 align-bottom border-l border-slate-200">{t('priceCommonCol')}</th>
                    <th colSpan={agentIds.length} className="text-center font-semibold px-2 py-1.5 border-l border-slate-200">{t('priceReconciledCol')}</th>
                    <th colSpan={agentIds.length} className="text-center font-semibold px-2 py-1.5 border-l border-slate-200">{t('allocationCol')}</th>
                  </tr>
                  <tr className="text-[11px]">
                    {agentIds.map((aid) => (
                      <th key={`r${aid}`} className="font-medium px-2 py-1 text-right border-l border-slate-200">{nameByAid[aid] || `#${aid}`}</th>
                    ))}
                    {agentIds.map((aid) => (
                      <th key={`p${aid}`} className="font-medium px-2 py-1 text-center border-l border-slate-200">{nameByAid[aid] || `#${aid}`}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allocations.map((a, i) => {
                    const common = a.perceived_value ?? a.reconciled_value ?? a.estimated_value
                    const isOpen = openRows.has(i)
                    return (
                      <React.Fragment key={i}>
                        <tr className="border-t border-slate-100">
                          <td className="px-3 py-2 font-medium text-slate-800 sticky left-0 bg-white z-10">
                            <button type="button" onClick={() => toggleRow(i)}
                              className="inline-flex items-center gap-1.5 hover:text-blue-700"
                              aria-expanded={isOpen}>
                              <span className={`transition-transform ${isOpen ? 'rotate-90' : ''}`}>▸</span>
                              {a.good_name}
                            </button>
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-slate-800 border-l border-slate-100">{money(Number(common || 0))}</td>
                          {agentIds.map((aid) => {
                            // What this agent RECORDED during reconciliation (their
                            // mean/keep/other choice); '—' when the asset had no
                            // value disagreement to reconcile.
                            const rv = a.party_reconciled?.[aid]
                            return (
                              <td key={`rv${aid}`} className="px-2 py-2 text-right text-slate-700 border-l border-slate-100">
                                {rv != null ? money(Number(rv)) : '—'}
                              </td>
                            )
                          })}
                          {agentIds.map((aid) => {
                            let pct: number | null = null
                            if (a.divisible && a.fractions) pct = Math.round(Number(a.fractions[aid] || 0) * 100)
                            else pct = String(a.assigned_agent_id) === aid ? 100 : 0
                            return (
                              <td key={`al${aid}`} className={`px-2 py-2 text-center border-l border-slate-100 ${pct ? 'font-semibold text-emerald-700' : 'text-slate-400'}`}>
                                {pct ? `${pct}%` : '—'}
                              </td>
                            )
                          })}
                        </tr>
                        {isOpen ? (
                          <tr className="border-t border-slate-100 bg-slate-50/70">
                            <td colSpan={nCols} className="px-4 py-2.5 text-xs text-slate-600">
                              <div className="flex flex-col gap-y-1.5">
                                <span><b>{t('initializedByLabel')}:</b> {a.initialized_by_name || '—'}</span>
                                {/* Indivisible is PARAMOUNT: one party marking it
                                    indivisible makes the asset indivisible. */}
                                <span><b>{t('divisibleLabel')}:</b> {a.divisible ? t('yesShort') : t('noShort')}</span>
                                <span>
                                  <b>{t('setValuesLabel')}:</b>{' '}
                                  {agentIds.map((aid, k) => (
                                    <span key={aid}>{k > 0 ? ' · ' : ''}{nameByAid[aid] || `#${aid}`}: {a.party_set_values?.[aid] != null ? money(Number(a.party_set_values[aid])) : '—'}</span>
                                  ))}
                                </span>
                                <span>
                                  <b>{t('assetBalancingLabel')}:</b>{' '}
                                  {(() => {
                                    const common = Number(a.perceived_value ?? a.reconciled_value ?? a.estimated_value ?? 0)
                                    const parts: string[] = []
                                    agentIds.forEach((aid) => {
                                      const ent = entByAid[aid] ?? (agentIds.length ? 1 / agentIds.length : 0)
                                      const frac = a.divisible && a.fractions
                                        ? Number(a.fractions[aid] || 0)
                                        : (String(a.assigned_agent_id) === aid ? 1 : 0)
                                      const delta = (frac - ent) * common
                                      if (Math.abs(delta) > 0.5) {
                                        parts.push(`${nameByAid[aid] || `#${aid}`} ${delta > 0 ? t('paysWord') : t('receivesWord')} ${money(Math.abs(delta))}`)
                                      }
                                    })
                                    return parts.length ? parts.join(' · ') : t('noCashNeeded')
                                  })()}
                                </span>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </React.Fragment>
                    )
                  })}
                  {allocations.length === 0 ? (
                    <tr><td colSpan={nCols} className="px-3 py-3 text-slate-500">—</td></tr>
                  ) : null}
                </tbody>
              </table>
            )
          })()}
        </div>
      </div>

      {/* Cash settlement */}
      <div>
        <div className="text-sm font-semibold text-slate-900 mb-2">{t('cashSettlementTitle')}</div>
        {anyCash ? (
          <div className="grid sm:grid-cols-2 gap-2">
            {compEntries.map(([aid, v], i) => {
              const val = Number(v)
              if (Math.abs(val) < 0.5) return null
              const receives = val > 0
              const displayName = nameByAid[aid] || `#${aid}`
              return (
                <div key={i} className={`rounded-xl border px-3 py-2 ${receives ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                  <div className="text-sm font-medium text-slate-800">{displayName}</div>
                  <div className={`text-sm ${receives ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {receives ? t('receivesWord') : t('paysWord')} {money(Math.abs(val))}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="text-sm text-slate-600">{compNote || t('noCashNeeded')}</div>
        )}
        {anyCash && compNote ? <div className="mt-2 text-xs text-slate-500">{compNote}</div> : null}
      </div>

      {/* Division statistics — two interactive pie charts */}
      <AllocationCharts allocations={allocations} money={money} t={t} />

      {/* What if … — AI scenario analysis (agree / disagree / differ) */}
      {disputeId ? (
        <WhatIfSection disputeId={disputeId} allocations={allocations} money={money} t={t} lang={lang || 'en'} />
      ) : null}
    </div>
  )
}

// A consistent "control box" for the current workflow step: title, what it is,
// per-party status chips, a blocking message, and the action that advances it.
// Used for every step up to reconciliation so the user always knows where they
// are and what unblocks the next step.
function WorkflowStepControl({
  stepIndex,
  stepCount,
  title,
  description,
  chips,
  done,
  blockedReason,
  actionLabel,
  onAction,
  actionDisabled,
  secondaryLabel,
  onSecondary,
  helpText,
}: {
  stepIndex: number
  stepCount: number
  title: string
  description: string
  chips: StepChip[]
  done: boolean
  blockedReason?: string | null
  actionLabel?: string | null
  onAction?: () => void
  actionDisabled?: boolean
  secondaryLabel?: string | null
  onSecondary?: () => void
  helpText?: string | null
}) {
  const { t } = useI18n()
  return (
    <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          {helpText ? <HelpTip text={helpText} /> : null}
        </div>
        <span className="text-xs text-slate-500">Step {stepIndex} / {stepCount}</span>
      </div>
      <div className="text-xs text-slate-600 mt-1">{description}</div>

      {chips.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {chips.map((c, i) => (
            <span
              key={i}
              className={`text-xs px-2 py-1 rounded-full ${c.done ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}
            >
              {c.label}
            </span>
          ))}
        </div>
      ) : null}

      {(actionLabel || secondaryLabel) ? (
        <div className="mt-3 flex flex-wrap gap-2 items-center">
          {actionLabel ? (
            <Button onClick={onAction} disabled={actionDisabled}>{actionLabel}</Button>
          ) : null}
          {secondaryLabel ? (
            <Button variant="ghost" onClick={onSecondary}>{secondaryLabel}</Button>
          ) : null}
        </div>
      ) : null}

      <div className={`mt-2 text-xs ${done ? 'text-emerald-700' : blockedReason ? 'text-amber-700' : 'text-slate-500'}`}>
        {done ? t('stepComplete') : (blockedReason || t('stepInProgress'))}
      </div>
    </div>
  )
}

function ParticipantRow({
  agent,
  canManage,
  onResend,
  onRemove,
}: {
  agent: Agent
  canManage: boolean
  onResend: () => void
  onRemove: () => void
}) {
  const { t } = useI18n()
  const [showMsg, setShowMsg] = useState(false)
  const status = normalizeStatus(agent.invite_status)
  const role = (agent.role_in_dispute || 'agent').toLowerCase()

  const canResend = canManage && (status === 'invited' || status === 'pending')
  const canRemove = canManage && status === 'declined'

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={`font-semibold truncate ${statusColorClass(status)}`}>
            {agent.name}{' '}
            <span className="text-slate-400 font-normal">·</span>{' '}
            <span className="text-slate-700 font-medium">{role}</span>
          </div>
          <div className="text-xs text-slate-600 truncate">{agent.email}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {statusPill(status)}
            <span className="text-xs text-slate-600">{t('dispShare')}: {Math.round((agent.entitlement_share || 0) * 100)}%</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {canResend ? (
            <Button variant="ghost" onClick={onResend}>{t('dispResendInvite')}</Button>
          ) : null}

          {canRemove ? (
            <Button variant="ghost" onClick={onRemove}>{t('dispRemoveFromDash')}</Button>
          ) : null}

          {agent.invite_comment ? (
            <Button variant="ghost" onClick={() => setShowMsg(v => !v)}>
              {showMsg ? t('dispHideMsg') : t('dispShowMsg')}
            </Button>
          ) : null}
        </div>
      </div>

      {showMsg && agent.invite_comment ? (
        <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 whitespace-pre-wrap">
          {agent.invite_comment}
        </div>
      ) : null}
    </div>
  )
}

type SlotParticipant = { agent_id: number; name: string; role: string; agreed: boolean; timezone?: string | null; country?: string | null }
type Slot = {
  id: number; when: string; when_local?: string | null; tz?: string | null; agreed_agent_ids: number[]; confirmed: boolean
  proposed_by_agent_id: number | null; proposed_by_name: string | null
  participants: SlotParticipant[]; agreed_count: number; total_count: number
}

function MediationPlanner({ disputeId, myAgentId }: { disputeId: number; myAgentId: number | null }) {
  const { t } = useI18n()
  const [slots, setSlots] = useState<Slot[]>([])
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    setErr(null)
    try {
      const data = await api(`/api/disputes/${disputeId}/mediation/slots`)
      setSlots(Array.isArray(data) ? data : [])
    } catch (e: any) {
      setErr(e.message ?? 'Failed to load')
    }
  }
  useEffect(() => { load() }, [disputeId]) // eslint-disable-line

  async function propose() {
    if (!date || !time) return
    setErr(null); setBusy(true)
    try {
      // Send the raw wall-clock time (no browser-tz conversion). The backend
      // interprets it in the proposer's provenance timezone, so "12:47" means
      // 12:47 in the user's own zone regardless of the browser's timezone.
      const naive = `${date}T${time}:00`
      await api(`/api/disputes/${disputeId}/mediation/slots`, { method: 'POST', body: { when: naive } })
      setDate(''); setTime('')
      await load()
    } catch (e: any) {
      setErr(e.message ?? 'Failed to propose')
    } finally { setBusy(false) }
  }

  async function act(slotId: number, action: 'agree' | 'decline') {
    setErr(null); setBusy(true)
    try {
      await api(`/api/disputes/${disputeId}/mediation/slots/${slotId}/${action}`, { method: 'POST' })
      await load()
    } catch (e: any) {
      setErr(e.message ?? 'Failed')
    } finally { setBusy(false) }
  }

  async function remove(slotId: number) {
    setErr(null); setBusy(true)
    try {
      await api(`/api/disputes/${disputeId}/mediation/slots/${slotId}`, { method: 'DELETE' })
      await load()
    } catch (e: any) {
      setErr(e.message ?? 'Failed')
    } finally { setBusy(false) }
  }

  // Prefer the server-computed time in the user's provenance timezone (when_local
  // + tz). Fall back to the browser's local formatting of the raw UTC instant.
  function fmt(slot: { when: string; when_local?: string | null; tz?: string | null }) {
    if (slot.when_local) {
      return slot.tz ? `${slot.when_local} (${slot.tz})` : slot.when_local
    }
    try {
      return new Date(slot.when).toLocaleString(undefined, {
        weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    } catch { return slot.when }
  }

  const confirmed = slots.find(s => s.confirmed)

  // Gather each participant's provenance timezone from the loaded slots (the
  // states repeat across slots; we just need one occurrence per agent).
  const provById = new Map<number, { name: string; timezone?: string | null; country?: string | null }>()
  for (const s of slots) {
    for (const p of s.participants) {
      if (!provById.has(p.agent_id)) provById.set(p.agent_id, { name: p.name, timezone: p.timezone, country: p.country })
    }
  }
  const me = myAgentId != null ? provById.get(myAgentId) : undefined
  const others = Array.from(provById.entries()).filter(([id]) => id !== myAgentId).map(([, v]) => v)
  const myTz = me?.timezone || null
  const someoneMissingTz = (me && !me.timezone) || others.some((o) => !o.timezone)

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-base font-semibold text-slate-900">{t('schedTitle')}</div>
      <div className="text-sm text-slate-600 mt-1">{t('schedIntro')}</div>
      {err ? <div className="mt-2 text-sm text-rose-700">{err}</div> : null}

      {/* Timezone confirmation: make explicit which zone the entered time is in,
          and show the counterpart's zone so both sides are aware. */}
      {provById.size > 0 ? (
        <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50/60 p-3 text-sm">
          <div className="font-medium text-slate-800">{t('tzConfirmTitle')}</div>
          <div className="mt-1 text-slate-700">
            {t('tzYouLabel')}: <span className="font-medium">{myTz || t('tzNotSet')}</span>
          </div>
          {others.map((o, i) => (
            <div key={i} className="text-slate-700">
              {o.name}: <span className="font-medium">{o.timezone || t('tzNotSet')}</span>
            </div>
          ))}
          <div className="mt-2 text-xs text-slate-600">
            {myTz ? `${t('tzEnteredInYourZone')} (${myTz}).` : t('tzSetCountryHint')}
          </div>
          {someoneMissingTz ? (
            <div className="mt-1 text-xs text-amber-700">{t('tzMissingWarning')}</div>
          ) : null}
        </div>
      ) : null}

      {confirmed ? (
        <div className="mt-3 rounded-xl border border-emerald-300 bg-emerald-50 p-3">
          <div className="text-sm font-semibold text-emerald-800">{t('schedConfirmedTitle')}</div>
          <div className="text-emerald-900 font-medium mt-0.5">{fmt(confirmed)}</div>
        </div>
      ) : null}

      {/* Propose a new time */}
      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="text-sm font-medium text-slate-800 mb-2">{t('schedProposeTitle')}{myTz ? ` · ${myTz}` : ''}</div>
        <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400" />
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400" />
          <Button onClick={propose} disabled={busy || !date || !time}>{t('schedPropose')}</Button>
        </div>
      </div>

      {/* Proposed times */}
      <div className="mt-4 space-y-3">
        {slots.length === 0 ? (
          <div className="text-sm text-slate-600">{t('schedNone')}</div>
        ) : (
          slots.map((s) => {
            const iAgreed = myAgentId != null && s.agreed_agent_ids.includes(myAgentId)
            const mineToRemove = myAgentId != null && s.proposed_by_agent_id === myAgentId
            return (
              <div key={s.id}
                className={`rounded-xl border p-3 ${s.confirmed ? 'border-emerald-300 bg-emerald-50/60' : 'border-slate-200 bg-slate-50'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-slate-900">{fmt(s)}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {t('schedProposedBy')} {s.proposed_by_name || '—'} · {s.agreed_count}/{s.total_count} {t('schedAgreed')}
                      {s.confirmed ? ` · ${t('schedConfirmedTag')}` : ''}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {iAgreed ? (
                      <Button variant="ghost" onClick={() => act(s.id, 'decline')} disabled={busy}>{t('schedDecline')}</Button>
                    ) : (
                      <Button onClick={() => act(s.id, 'agree')} disabled={busy}>{t('schedAgree')}</Button>
                    )}
                    {mineToRemove ? (
                      <Button variant="ghost" onClick={() => remove(s.id)} disabled={busy}>{t('schedRemove')}</Button>
                    ) : null}
                  </div>
                </div>
                {/* Per-participant agreement chips */}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {s.participants.map((p) => (
                    <span key={p.agent_id}
                      className={`text-xs rounded-full px-2 py-0.5 border ${p.agreed
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                        : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
                      {p.agreed ? '✓ ' : '○ '}{p.name}{p.role === 'mediator' ? ` (${t('schedMediator')})` : ''}
                    </span>
                  ))}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function Tab({
  label,
  active,
  status,
  onClick,
  danger,
  dangerHint,
}: {
  label: string
  active: boolean
  status: StepStatus
  onClick: () => void
  danger?: boolean
  dangerHint?: string
}) {
  const disabled = status === 'blocked' || !!danger
  const dot = danger ? 'bg-rose-500' : dotClass(status)

  return (
    <button
      onClick={() => (!disabled ? onClick() : null)}
      disabled={disabled}
      className={[
        'rounded-xl px-3 py-2 text-sm border flex items-center gap-2',
        active && !disabled ? 'bg-blue-50 text-slate-900 border-blue-500 ring-2 ring-blue-400 font-semibold' : 'bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-50',
        disabled ? 'opacity-60 cursor-not-allowed' : '',
      ].join(' ')}
      title={danger ? (dangerHint || '') : disabled ? 'Blocked / not authorized' : ''}
    >
      <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
      {label}
    </button>
  )
}

/** Minimal on/off switch used by the goods form (divisible, description). */
function Switch2({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 ${
        on ? 'bg-blue-600 border-blue-600' : 'bg-slate-200 border-slate-300'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
          on ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

/**
 * "AI Estimate" — the per-good market-valuation chat.
 *
 * Opens inside the good's own card. The first opening automatically asks for an
 * estimate using everything the platform already knows about the asset; the
 * assistant replies with a value range, or — when the description is too thin
 * to price honestly — with the specific questions it needs answered (model and
 * mileage for a car, location and floor area for a property, and so on).
 * Answers produced by the external secondary model carry the same chip as the
 * Legal AI assistant. History is stored server-side per good and disappears
 * with the good.
 */
function EstimatePanel({ disputeId, good, t, lang, currency, onApplyPrice, onApplyDetails }: {
  disputeId: string | number; good: any; lang: string; currency?: string
  t: (k: any, vars?: Record<string, any>) => string
  onApplyPrice?: (amount: number, currency: string) => void
  onApplyDetails?: (title: string, description: string) => void
}) {
  const [msgs, setMsgs] = useState<Array<{
    id?: number; role: string; text: string; fallback?: boolean
    estimate?: { min: number; avg: number; max: number; currency: string } | null
    details?: { title: string; description: string } | null
  }>>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [full, setFull] = useState(false)
  const bootstrapped = useRef(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // Report an inaccurate valuation to support (same flow as the Legal AI report).
  const [repOpen, setRepOpen] = useState(false)
  const [repTitle, setRepTitle] = useState('')
  const [repNote, setRepNote] = useState('')
  const [repBusy, setRepBusy] = useState(false)
  const [repDone, setRepDone] = useState<string | null>(null)

  async function send(message: string) {
    setBusy(true); setErr(null)
    if (message.trim()) setMsgs((m) => [...m, { role: 'user', text: message.trim() }])
    try {
      const r = await api(`/api/disputes/${disputeId}/goods/${good.id}/estimate`, {
        method: 'POST', body: { message, lang, currency: currency || '' },
      })
      setMsgs((m) => [...m, {
        id: r.id, role: 'assistant', text: r.text, fallback: !!r.fallback,
        estimate: r.estimate || null, details: r.details || null,
      }])
    } catch (e: any) {
      setErr(e?.message || t('aiWidgetUnavailable'))
    } finally {
      setBusy(false)
    }
  }

  async function sendReport() {
    if (repBusy) return
    setRepBusy(true)
    try {
      await api(`/api/disputes/${disputeId}/goods/${good.id}/estimate/report`, {
        method: 'POST', body: { title: repTitle.trim(), note: repNote.trim() },
      })
      setRepDone(t('aiReportSent'))
      setRepOpen(false); setRepTitle(''); setRepNote('')
    } catch (e: any) {
      setRepDone(e?.message || t('aiReportFailed'))
    } finally {
      setRepBusy(false)
    }
  }

  // Load the stored thread; ask for a first estimate when there is none yet.
  useEffect(() => {
    if (bootstrapped.current) return
    bootstrapped.current = true
    ;(async () => {
      try {
        const r = await api(`/api/disputes/${disputeId}/goods/${good.id}/estimate`)
        const rows = r?.messages || []
        setMsgs(rows)
        if (!rows.length) await send('')
      } catch (e: any) {
        setErr(e?.message || t('aiWidgetUnavailable'))
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [msgs.length, busy])

  // Latest structured results drive the TLDR card and the one-click actions.
  const lastEstimate = [...msgs].reverse().find((m) => m.estimate)?.estimate || null
  const lastDetails = [...msgs].reverse().find((m) => m.details)?.details || null
  const cur = CURRENCIES.find((c) => c.code === (lastEstimate?.currency || 'EUR'))
  const money = (n: number) =>
    `${cur?.symbol || ''}${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

  const body = (
    <div className={`w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-indigo-200 bg-white/80 p-2 sm:p-3 [overflow-wrap:anywhere] ${full ? 'h-full flex flex-col' : ''}`}>
      {/* Header stacks on phones: title on its own line, controls below */}
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between mb-2">
        <div className="min-w-0 text-xs font-semibold text-indigo-800 break-words">✦ {t('aiEstimateTitle', { name: good.name })}</div>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <div className="hidden sm:block text-[11px] text-slate-500">{t('aiEstimateDisclaimer')}</div>
          <button
            type="button"
            onClick={() => setRepOpen(true)}
            aria-label={t('aiEstimateReport')}
            title={t('aiEstimateReport')}
            className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800 transition hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
          >
            ⚠
          </button>
          <button
            type="button"
            onClick={() => setFull(!full)}
            aria-label={full ? t('aiEstimateExit') : t('aiEstimateEnlarge')}
            title={full ? t('aiEstimateExit') : t('aiEstimateEnlarge')}
            className="rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs text-indigo-700 transition hover:bg-indigo-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
          >
            {full ? '✕' : '⤢'}
          </button>
        </div>
      </div>

      <div ref={scrollRef} className={`min-w-0 max-w-full overflow-y-auto overflow-x-hidden pr-1 space-y-2 ${full ? 'flex-1 min-h-0' : 'max-h-72'}`}>
        {msgs.map((m, i) => (
          <div key={m.id ?? i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              // The global light-mode CSS net rewrites `text-white`, which turned
              // the user's own bubble text dark-on-indigo. Paint it inline instead.
              style={m.role === 'user' ? { backgroundColor: '#4f46e5', color: '#ffffff' } : undefined}
              className={`min-w-0 max-w-[92%] break-words rounded-xl px-3 py-2 text-sm ${
                m.role === 'user' ? '' : 'bg-slate-50 text-slate-800 border border-slate-200'
              }`}
            >
              {m.role === 'assistant' ? (
                <>
                  {m.fallback ? <div className="mb-1"><ExternalModelChip t={t} /></div> : null}
                  {/* The model answers in Markdown (headings, bold, lists,
                      tables) — render it, don't print the syntax. */}
                  <div className="estimate-md leading-relaxed">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
                  </div>
                </>
              ) : (
                <div className="whitespace-pre-wrap">{m.text}</div>
              )}
            </div>
          </div>
        ))}
        {busy ? (
          <div className="flex justify-start">
            <div className="w-full max-w-[92%] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="crea3-skel-line" style={{ width: '88%' }} />
              <div className="crea3-skel-line" style={{ width: '96%' }} />
              <div className="crea3-skel-line" style={{ width: '60%' }} />
            </div>
          </div>
        ) : null}
      </div>

      {err ? <div className="mt-2 text-xs text-rose-700">{err}</div> : null}

      {/* TLDR — the figures at a glance; each one can be applied to the asset. */}
      {lastEstimate ? (
        <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 p-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
            {t('aiEstimateTldr')}
          </div>
          <div className="mt-1.5 grid grid-cols-3 gap-1.5 sm:gap-2">
            {([
              ['aiEstimateMin', lastEstimate.min],
              ['aiEstimateAvg', lastEstimate.avg],
              ['aiEstimateMax', lastEstimate.max],
            ] as const).map(([labelKey, amount]) => (
              <button
                key={labelKey}
                type="button"
                onClick={() => onApplyPrice?.(Number(amount), lastEstimate.currency)}
                title={t('aiEstimateApplyHint')}
                className="min-w-0 rounded-lg border border-emerald-300 bg-white px-1.5 py-1.5 text-center transition hover:bg-emerald-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 sm:px-2"
              >
                <div className="text-[10px] uppercase tracking-wide text-slate-500">{t(labelKey)}</div>
                <div className="text-xs sm:text-sm font-bold text-emerald-900 break-words">{money(Number(amount))}</div>
              </button>
            ))}
          </div>
          <div className="mt-1.5 text-[11px] text-emerald-800">
            {t('aiEstimateApplyHint')} · {lastEstimate.currency}
          </div>
        </div>
      ) : null}

      {/* Preset: let the assistant propose a clearer name + description. */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => send(t('aiEstimateAskDetailsPrompt'))}
          className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-50"
        >
          ✎ {t('aiEstimateSuggestDetails')}
        </button>
        {lastDetails ? (
          <button
            type="button"
            onClick={() => onApplyDetails?.(lastDetails.title, lastDetails.description)}
            className="rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100"
            title={lastDetails.title}
          >
            ✓ {t('aiEstimateApplyDetails')}
          </button>
        ) : null}
      </div>

      <form
        className="mt-2 flex min-w-0 items-center gap-2"
        onSubmit={(e) => { e.preventDefault(); const v = input.trim(); if (!v || busy) return; setInput(''); send(v) }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('aiEstimatePlaceholder')}
          aria-label={t('aiEstimatePlaceholder')}
          disabled={busy}
          className="flex-1 min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="shrink-0 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t('send')}
        </button>
      </form>

      {/* Report modal — title becomes part of the email subject, the note goes
          in the body, and the whole conversation travels as an attachment. */}
      <Dialog open={repOpen} onClose={() => (!repBusy ? setRepOpen(false) : null)} fullWidth maxWidth="sm"
        sx={{ zIndex: 1500, '& .MuiDialog-paper': { m: { xs: 1, sm: 3 }, width: { xs: 'calc(100% - 16px)', sm: '100%' }, borderRadius: 3 } }}>
        <DialogTitle sx={{ pb: 1 }}>{t('aiEstimateReportTitle')}</DialogTitle>
        <DialogContent>
          <div className="text-sm text-slate-600 mb-3">{t('aiEstimateReportHint')}</div>
          <div className="space-y-2">
            <input
              value={repTitle}
              onChange={(e) => setRepTitle(e.target.value.slice(0, 150))}
              placeholder={t('aiReportTitleLabel')}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
            />
            <textarea
              value={repNote}
              onChange={(e) => setRepNote(e.target.value.slice(0, 2000))}
              placeholder={t('aiReportMessageLabel')}
              rows={4}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
            />
          </div>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1, flexWrap: 'wrap' }}>
          <MuiButton onClick={() => setRepOpen(false)} disabled={repBusy}>{t('cancelWord')}</MuiButton>
          <MuiButton variant="contained" color="warning" onClick={sendReport} disabled={repBusy}>
            {repBusy ? t('aiReportSending') : t('aiReportSend')}
          </MuiButton>
        </DialogActions>
      </Dialog>
      {repDone ? <div className="mt-2 text-xs text-emerald-700">{repDone}</div> : null}
    </div>
  )

  // Enlarged: a responsive full-viewport overlay (works on phones too).
  if (full) {
    return (
      <div className="fixed inset-0 z-[1400] flex flex-col bg-black/50 p-0 sm:p-6" role="dialog" aria-modal="true">
        <div className="mx-auto flex h-full w-full max-w-4xl flex-col overflow-hidden bg-white shadow-2xl sm:rounded-2xl">
          <div className="flex-1 min-h-0 overflow-hidden p-1.5 sm:p-3">{body}</div>
        </div>
      </div>
    )
  }
  return body
}
