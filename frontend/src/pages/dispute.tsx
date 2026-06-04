import React, { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api, API_BASE } from '../api/client'
import { useAuth } from '../store/auth'
import { useI18n } from '../i18n'
import { Card, CardHeader, Button, Input, Select, ErrorBox, Pill } from '../components/ui'
import DisputeChatBox from '../components/dispute-chatbox'
import { addRecentDispute } from '../utils/recent'

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
  role_in_dispute?: string
  invite_status: string
  invite_comment?: string | null
  ready?: boolean
}

type Good = { id: number; name: string; estimated_value: number; indivisible: boolean }
type Proposal = { id: number; outputs: any; metrics: any; explanation: string }

type TabKey = 'agents' | 'goods' | 'prefs' | 'proposals' | 'mediation' | 'room'
type StepStatus = 'done' | 'todo' | 'blocked'

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
  return 'bg-rose-500'
}

export default function DisputeDetail() {
  const { id } = useParams()
  const disputeId = Number(id)
  const { user } = useAuth()
  const { t } = useI18n()

  const [dispute, setDispute] = useState<Dispute | null>(null)
  const [agents, setAgents] = useState<Agent[]>([])
  const [goods, setGoods] = useState<Good[]>([])
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [meParticipation, setMeParticipation] = useState<Agent | null>(null)

  const [err, setErr] = useState<string | null>(null)
  const [tab, setTab] = useState<TabKey>('agents')

  // Forms
  const [aname, setAname] = useState('')
  const [aemail, setAemail] = useState('')
  const [ashare, setAshare] = useState('0.0')
  const [arole, setArole] = useState('') // '' | 'agent' | 'mediator'

  const [gname, setGname] = useState('')
  const [gval, setGval] = useState('0')
  const [gind, setGind] = useState(true)

  // Preferences (rates only)
  const [selectedGood, setSelectedGood] = useState<number>(0)
  const [stars, setStars] = useState('5')

  const latestProposal = proposals[0]

  const isMediator = useMemo(() => {
    const invitedAsMediator = (meParticipation?.role_in_dispute || '').toLowerCase() === 'mediator'
    return user?.role === 'mediator' || invitedAsMediator
  }, [user?.role, meParticipation?.role_in_dispute])

  // If /agents/me is 404, it’s most likely owner/admin (created_by) not listed as DisputeAgent.
  const isOwnerMaybe = useMemo(() => {
    return meParticipation === null
  }, [meParticipation])

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

  async function loadAll() {
    setErr(null)
    try {
      const d = await api(`/api/disputes/${disputeId}`)
      setDispute(d)
      try {
        addRecentDispute({ id: d.id, title: d.title })
      } catch {}

      const [a, g, p] = await Promise.all([
        api(`/api/disputes/${disputeId}/agents`),
        api(`/api/disputes/${disputeId}/goods`),
        api(`/api/disputes/${disputeId}/proposals`),
      ])
      setAgents(a)
      setGoods(g)
      setProposals(p)

      // Get my participation (invite status + role_in_dispute), best-effort
      try {
        const me = await api(`/api/disputes/${disputeId}/agents/me`)
        setMeParticipation(me)
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

  // Force mediator view: only proposals
  useEffect(() => {
    if (isMediator && tab !== 'proposals') setTab('proposals')
  }, [isMediator, tab])

  async function addAgent() {
    try {
      await api(`/api/disputes/${disputeId}/agents`, {
        method: 'POST',
        body: {
          name: aname,
          email: aemail,
          entitlement_share: Number(ashare),
          role_in_dispute: arole || null,
        },
      })
      setAname('')
      setAemail('')
      setAshare('0.0')
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

  async function addGood() {
    try {
      await api(`/api/disputes/${disputeId}/goods`, {
        method: 'POST',
        body: { name: gname, estimated_value: Number(gval), indivisible: gind, meta: {} },
      })
      setGname('')
      setGval('0')
      setGind(true)
      await loadAll()
    } catch (e: any) {
      setErr(e.message)
    }
  }

  async function submitPreference() {
    try {
      // rates-only
      const body: any = { good_id: selectedGood, stars: Number(stars) }
      await api(`/api/disputes/${disputeId}/preferences`, { method: 'POST', body })
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

  async function acceptProposal(proposalId: number, accepted: boolean) {
    try {
      await api(`/api/disputes/${disputeId}/proposals/${proposalId}/accept`, { method: 'POST', body: { accepted } })
      await loadAll()
    } catch (e: any) {
      setErr(e.message)
    }
  }

  async function generateReport() {
    try {
      await api(`/api/disputes/${disputeId}/report`, { method: 'POST' })
      await loadAll()
      window.open(`${API_BASE}/api/disputes/${disputeId}/report`, '_blank')
    } catch (e: any) {
      setErr(e.message)
    }
  }

  async function respondInvite(accept: boolean) {
    try {
      await api(`/api/disputes/${disputeId}/agents/me/respond`, { method: 'POST', body: { accept } })
      await loadAll()
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
      // mediator: ONLY proposals
      return key === 'proposals' ? (proposals.length > 0 ? 'done' : 'todo') : 'blocked'
    }

    // invited but not joined cannot do prefs/proposals
    const blockedByInvite = !isOwnerMaybe && !isJoined

    if (key === 'agents') {
      // show as done when at least 2 joined agents exist (proposal needs >=2)
      return joinedNonMediatorAgents.length >= 2 ? 'done' : 'todo'
    }
    if (key === 'goods') return goods.length > 0 ? 'done' : 'todo'
    if (key === 'prefs') {
      if (blockedByInvite) return 'blocked'
      return readyCount >= 2 ? 'done' : 'todo'
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
      if (blockedByInvite) return 'blocked'
      return 'todo'
    }
    return 'todo'
  }

  const methodLabel = 'rates' // bids removed from UI (legacy disputes still show rates here)

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
            <div className="flex items-center gap-2">
              {dispute ? <Pill>{dispute.status}</Pill> : null}
              <Button variant="ghost" onClick={loadAll}>
                {t('refresh')}
              </Button>
            </div>
          }
        />

        <div className="p-4">
          <ErrorBox message={err} />

          {/* Invite box (agents only). Mediator invited still sees only proposals. */}
          {!isMediator && meParticipation && (normalizeStatus(meParticipation.invite_status) === 'invited' || normalizeStatus(meParticipation.invite_status) === 'pending') ? (
            <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="font-semibold text-amber-900">You have been invited to this dispute</div>
              <div className="text-sm text-amber-800 mt-1">
                Accept to access drafts and submit preferences. Decline to remove access.
              </div>
              <div className="mt-3 flex gap-2 flex-wrap">
                <Button onClick={() => respondInvite(true)}>Accept</Button>
                <Button variant="ghost" onClick={() => respondInvite(false)}>
                  Decline
                </Button>
              </div>
            </div>
          ) : null}

          {/* ✅ TOP SUMMARY — NO TRAFFIC LIGHTS */}
          <div className="mt-4 grid gap-2 md:grid-cols-4">
            <SummaryCard title="Participants" value={`${joinedCount} joined · ${pendingCount} pending · ${declinedCount} declined`} />
            <SummaryCard title="Goods" value={`${goods.length} goods`} />
            <SummaryCard title="Preferences" value={`${readyCount} ready`} />
            <SummaryCard title="Proposals" value={proposals.length > 0 ? 'available' : 'not yet'} />
          </div>

          {/* Tabs */}
          <div className="flex flex-wrap gap-2 mt-4">
            <Tab label={t('tabAgents')} active={tab === 'agents'} status={stepStatus('agents')} onClick={() => setTab('agents')} />
            <Tab label={t('tabGoods')} active={tab === 'goods'} status={stepStatus('goods')} onClick={() => setTab('goods')} />
            <Tab label={t('tabPreferences')} active={tab === 'prefs'} status={stepStatus('prefs')} onClick={() => setTab('prefs')} />
            <Tab label={t('tabProposals')} active={tab === 'proposals'} status={stepStatus('proposals')} onClick={() => setTab('proposals')} />
            <Tab label={t('tabMediation')} active={tab === 'mediation'} status={stepStatus('mediation')} onClick={() => setTab('mediation')} />
            <Tab label={t('tabRoom')} active={tab === 'room'} status={stepStatus('room')} onClick={() => setTab('room')} />
          </div>

          {/* Main */}
          <div className="mt-4 space-y-4">
            {/* AGENTS */}
            {tab === 'agents' ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-base font-semibold text-slate-900">{t('agentManagementTitle')}</div>
                <div className="text-sm text-slate-600 mt-1">{t('agentManagementSubtitle')}</div>

                {isMediator ? (
                  <div className="mt-3 text-sm text-rose-700">Not authorized.</div>
                ) : (
                  <div className="mt-4 grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="text-sm font-semibold">{t('addNewAgent')}</div>
                      <Input value={aname} onChange={(e) => setAname(e.target.value)} placeholder={t('nameLabel')} />
                      <Input value={aemail} onChange={(e) => setAemail(e.target.value)} placeholder={t('emailLabel')} />
                      <Input value={ashare} onChange={(e) => setAshare(e.target.value)} placeholder={t('entitlementPlaceholder')} />
                      <Select value={arole} onChange={(e) => setArole(e.target.value)}>
                        <option value="">{t('rolePlaceholder')}</option>
                        <option value="agent">agent</option>
                        <option value="mediator">mediator</option>
                      </Select>

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
                        {agents.length === 0 ? <div className="text-sm text-slate-600">No agents yet.</div> : null}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {/* GOODS */}
            {tab === 'goods' ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-base font-semibold text-slate-900">Goods & Assets</div>
                <div className="text-sm text-slate-600 mt-1">Add goods with estimated value and indivisibility.</div>

                {isMediator ? (
                  <div className="mt-3 text-sm text-rose-700">Not authorized.</div>
                ) : (
                  <div className="mt-4 grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="text-sm font-semibold">{t('addNewGood')}</div>
                      <Input value={gname} onChange={(e) => setGname(e.target.value)} placeholder={t('goodNamePlaceholder')} />
                      <Input value={gval} onChange={(e) => setGval(e.target.value)} placeholder={t('estimatedValuePlaceholder')} />

                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={gind} onChange={(e) => setGIndSafe(setGind, e.target.checked)} />
                        Indivisible
                      </label>

                      <Button onClick={addGood} disabled={!canEditWorkflow || !gname.trim()}>
                        {t('addGood')}
                      </Button>

                      {!canEditWorkflow ? (
                        <div className="text-xs text-slate-600">You must accept the invite first (or be owner/admin).</div>
                      ) : null}
                    </div>

                    <div>
                      <div className="text-sm font-semibold mb-2">{t('goodsList')}</div>
                      <div className="grid gap-2">
                        {goods.map((g) => (
                          <div key={g.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                            <div className="font-medium">{g.name}</div>
                            <div className="text-xs text-slate-600">
                              value: {g.estimated_value} · indivisible: {String(g.indivisible)}
                            </div>
                          </div>
                        ))}
                        {goods.length === 0 ? <div className="text-sm text-slate-600">No goods yet.</div> : null}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {/* PREFS (rates only) */}
            {tab === 'prefs' ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-base font-semibold text-slate-900">Preferences (Rates only)</div>
                <div className="text-sm text-slate-600 mt-1">Rate each good from 1 to 5 stars.</div>

                {stepStatus('prefs') === 'blocked' ? (
                  <div className="mt-3 text-sm text-rose-700">
                    Not authorized. Accept the invite first (or you are a mediator).
                  </div>
                ) : (
                  <div className="mt-4 grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="text-sm font-semibold">Submit rating</div>
                      <Select value={selectedGood} onChange={(e) => setSelectedGood(Number(e.target.value))}>
                        <option value={0}>Select a good…</option>
                        {goods.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name} (ID {g.id})
                          </option>
                        ))}
                      </Select>

                      <Select value={stars} onChange={(e) => setStars(e.target.value)}>
                        <option value="1">1 star</option>
                        <option value="2">2 stars</option>
                        <option value="3">3 stars</option>
                        <option value="4">4 stars</option>
                        <option value="5">5 stars</option>
                      </Select>

                      <Button onClick={submitPreference} disabled={!canEditWorkflow || selectedGood === 0}>
                        Submit
                      </Button>

                      {!canEditWorkflow ? (
                        <div className="text-xs text-slate-600">You must accept the invite first (or be owner/admin).</div>
                      ) : null}

                      <div className="mt-3 text-xs text-slate-600">
                        Auto-proposal triggers when <b>at least 2 joined agents</b> have rated <b>all</b> goods.
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-sm font-semibold">Progress</div>
                      <div className="text-sm text-slate-700">
                        Ready agents: <b>{readyCount}</b> / {joinedNonMediatorAgents.length} (joined, non-mediator)
                      </div>
                      <div className="text-sm text-slate-700">
                        Goods: <b>{goods.length}</b>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {/* PROPOSALS */}
            {tab === 'proposals' ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-base font-semibold text-slate-900">Allocation Proposals</div>
                    <div className="text-sm text-slate-600 mt-1">
                      Mediators can view proposals only. Agents can accept or reject.
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button onClick={generateProposal} disabled={isMediator || stepStatus('proposals') === 'blocked'}>
                      Generate Proposal
                    </Button>
                    <Button variant="ghost" onClick={generateReport} disabled={isMediator || dispute?.status !== 'accepted'}>
                      Generate Report
                    </Button>
                  </div>
                </div>

                {isMediator ? (
                  <div className="mt-2 text-xs text-slate-600">Mediator mode: read-only proposals.</div>
                ) : null}

                {stepStatus('proposals') === 'blocked' && !isMediator ? (
                  <div className="mt-3 text-sm text-rose-700">
                    Proposal is blocked: ensure goods exist and at least 2 agents completed ratings.
                  </div>
                ) : null}

                <div className="mt-4 space-y-3">
                  {latestProposal ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="font-semibold">Latest proposal (ID {latestProposal.id})</div>

                        {!isMediator ? (
                          <div className="flex gap-2">
                            <Button
                              onClick={() => acceptProposal(latestProposal.id, true)}
                              disabled={!canEditWorkflow || !isJoined}
                            >
                              Accept
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={() => acceptProposal(latestProposal.id, false)}
                              disabled={!canEditWorkflow || !isJoined}
                            >
                              Reject
                            </Button>
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-2 text-sm text-slate-700">{latestProposal.explanation}</div>

                      <div className="mt-3 grid md:grid-cols-2 gap-3">
                        <div>
                          <div className="text-sm font-semibold">Allocations</div>
                          <div className="mt-2 space-y-1 text-sm">
                            {(latestProposal.outputs?.allocations ?? []).map((a: any, idx: number) => (
                              <div key={idx} className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2">
                                Good {a.good_id} → Agent {a.assigned_agent_id} (stars {String(a.stars ?? a.score)})
                              </div>
                            ))}
                          </div>
                        </div>

                        <div>
                          <div className="text-sm font-semibold">Metrics</div>
                          <pre className="mt-2 text-xs rounded-xl bg-slate-50 border border-slate-200 p-3 overflow-auto">
{JSON.stringify(latestProposal.metrics, null, 2)}
                          </pre>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-slate-600">No proposals yet.</div>
                  )}

                  {dispute?.status === 'accepted' ? (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                      All agents accepted the latest proposal. You can now generate the final report.
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* MEDIATION */}
            {tab === 'mediation' ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-base font-semibold text-slate-900">Mediation</div>
                <div className="text-sm text-slate-600 mt-1">Plan a conference time slot (optional workflow).</div>

                {stepStatus('mediation') === 'blocked' ? (
                  <div className="mt-3 text-sm text-rose-700">Not authorized (or proposal not available yet).</div>
                ) : (
                  <div className="mt-4 space-y-3">
                    <div className="text-sm text-slate-700">
                      Status: <b>{dispute?.status}</b>
                    </div>
                    <MediationPlanner disputeId={disputeId} />
                  </div>
                )}
              </div>
            ) : null}

            {/* ROOM */}
            {tab === 'room' ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-base font-semibold text-slate-900">Dispute Room</div>
                <div className="text-sm text-slate-600 mt-1">Open video now or plan a conference date.</div>

                {stepStatus('room') === 'blocked' ? (
                  <div className="mt-3 text-sm text-rose-700">Not authorized. Accept the invite first (or you are a mediator).</div>
                ) : (
                  <div className="mt-4 grid md:grid-cols-2 gap-4">
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="font-semibold">Video conference now</div>
                      <div className="text-sm text-slate-600 mt-1">Open the Jitsi room immediately.</div>
                      <Button
                        className="mt-3"
                        onClick={() =>
                          window.open(`https://meet.jit.si/CREA3-Dispute-${disputeId}#config.prejoinPageEnabled=false`, '_blank')
                        }
                      >
                        Open room
                      </Button>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="font-semibold">Plan a conference</div>
                      <div className="text-sm text-slate-600 mt-1">Propose time slots and get agreement from agents.</div>
                      <Button className="mt-3" variant="ghost" onClick={() => setTab('mediation')}>
                        Plan / Agree on a date
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {/* Chat (always) */}
            <div className="min-w-0">
              <DisputeChatBox disputeId={disputeId} />
            </div>

            {/* Overview + guide */}
            <div className="grid gap-4 lg:grid-cols-2 items-start">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="font-semibold text-slate-900">{t('overviewTitle')}</div>
                <div className="text-sm text-slate-600 mt-1">{t('overviewSubtitle')}</div>

                <div className="mt-3 grid gap-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-600">{t('overviewStatus')}</span>
                    <span className="font-medium text-slate-900">{dispute?.status || '—'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-600">{t('overviewMethod')}</span>
                    <span className="font-medium text-slate-900">{methodLabel}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-600">{t('overviewAgents')}</span>
                    <span className="font-medium text-slate-900">{agents.length}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-600">{t('overviewGoods')}</span>
                    <span className="font-medium text-slate-900">{goods.length}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="font-semibold text-slate-900">{t('assistantGuideTitle')}</div>
                <div className="text-sm text-slate-600 mt-1">{t('assistantGuideSavedNote')}</div>

                <ul className="mt-3 list-disc pl-5 text-sm text-slate-700 space-y-1">
                  <li>{t('assistantGuideDef')}</li>
                  <li>{t('assistantGuideNext')}</li>
                  <li>{t('assistantGuideHowTo')}</li>
                  <li>{t('assistantGuideExplain')}</li>
                </ul>

                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-sm font-semibold text-slate-900">{t('helpSupportTitle')}</div>
                  <div className="text-sm text-slate-600 mt-1">{t('helpSupportSubtitle')}</div>
                  <div className="mt-2 text-sm text-slate-700">
                    <span className="font-semibold">{t('helpSupportEmailLabel')}:</span> support@crea3.eu
                  </div>
                  <div className="mt-1 text-sm text-slate-700">{t('helpSupportFaqHint')}</div>
                  <div className="mt-1 text-xs text-slate-600">{t('helpSupportKeyboardHint')}</div>

                  <Button className="mt-3" variant="ghost" onClick={() => window.dispatchEvent(new Event('crea3-open-settings'))}>
                    {t('openAccessibilitySettings')}
                  </Button>
                </div>
              </div>
            </div>

          </div>
        </div>
      </Card>
    </div>
  )
}

function SummaryCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <div className="text-sm text-slate-600 mt-0.5">{value}</div>
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
  const [showMsg, setShowMsg] = useState(false)
  const status = normalizeStatus(agent.invite_status)
  const role = (agent.role_in_dispute || 'agent').toLowerCase()

  const canResend = canManage && (status === 'invited' || status === 'pending')
  const canRemove = canManage && status === 'declined'

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
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
            <span className="text-xs text-slate-600">share: {agent.entitlement_share}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {canResend ? (
            <Button variant="ghost" onClick={onResend}>Resend invite</Button>
          ) : null}

          {canRemove ? (
            <Button variant="ghost" onClick={onRemove}>Remove from dashboard</Button>
          ) : null}

          {agent.invite_comment ? (
            <Button variant="ghost" onClick={() => setShowMsg(v => !v)}>
              {showMsg ? 'Hide message' : 'Show message'}
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

function setGIndSafe(setter: (v: boolean) => void, v: boolean) {
  setter(v)
}

function MediationPlanner({ disputeId }: { disputeId: number }) {
  const [slots, setSlots] = useState<{ id: number; when: string; agreed_agent_ids: number[]; confirmed: boolean }[]>([])
  const [when, setWhen] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const { user } = useAuth()

  async function load() {
    setErr(null)
    try {
      const data = await api(`/api/disputes/${disputeId}/mediation/slots`)
      setSlots(data)
    } catch (e: any) {
      setErr(e.message ?? 'Failed to load slots')
    }
  }

  useEffect(() => {
    load()
  }, [disputeId])

  async function propose() {
    setErr(null)
    try {
      await api(`/api/disputes/${disputeId}/mediation/slots`, { method: 'POST', body: { when } })
      setWhen('')
      await load()
    } catch (e: any) {
      setErr(e.message ?? 'Failed to propose slot')
    }
  }

  async function agree(slotId: number) {
    setErr(null)
    try {
      await api(`/api/disputes/${disputeId}/mediation/slots/${slotId}/agree`, { method: 'POST' })
      await load()
    } catch (e: any) {
      setErr(e.message ?? 'Failed to agree')
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="font-semibold">Plan a conference</div>
      <div className="text-sm text-slate-600 mt-1">Propose an ISO datetime (UTC) and have all non-mediator agents agree.</div>
      {err ? <div className="mt-2 text-sm text-rose-700">{err}</div> : null}

      <div className="mt-3 grid md:grid-cols-[1fr_auto] gap-2">
        <Input value={when} onChange={(e) => setWhen(e.target.value)} placeholder="2026-01-15T18:00:00Z" />
        <Button onClick={propose} disabled={user?.role === 'mediator' || !when.trim()}>
          Propose
        </Button>
      </div>

      <div className="mt-3 space-y-2">
        {slots.length === 0 ? (
          <div className="text-sm text-slate-600">No proposed slots yet.</div>
        ) : (
          slots.map((s) => (
            <div
              key={s.id}
              className="rounded-2xl border border-slate-200 bg-slate-50 p-3 flex items-center justify-between gap-3"
            >
              <div>
                <div className="font-medium">{s.when}</div>
                <div className="text-xs text-slate-600">
                  Agreed agent IDs: {s.agreed_agent_ids?.join(', ') || '—'} {s.confirmed ? '· CONFIRMED' : ''}
                </div>
              </div>
              <Button variant="ghost" onClick={() => agree(s.id)} disabled={user?.role === 'mediator'}>
                Agree
              </Button>
            </div>
          ))
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
}: {
  label: string
  active: boolean
  status: StepStatus
  onClick: () => void
}) {
  const disabled = status === 'blocked'
  const dot = dotClass(status)

  return (
    <button
      onClick={() => (!disabled ? onClick() : null)}
      disabled={disabled}
      className={[
        'rounded-xl px-3 py-2 text-sm border flex items-center gap-2',
        active ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50',
        disabled ? 'opacity-60 cursor-not-allowed' : '',
      ].join(' ')}
      title={disabled ? 'Blocked / not authorized' : ''}
    >
      <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
      {label}
    </button>
  )
}
