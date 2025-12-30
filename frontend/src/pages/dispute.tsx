import React, { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api, API_BASE } from '../api/client'
import { useAuth } from '../store/auth'
import { Card, CardHeader, Button, Input, Select, Textarea, ErrorBox, Pill } from '../components/ui'
import DisputeChatBox from '../components/dispute-chatbox'

type Dispute = { id: number; title: string; method: 'bids'|'rates'; status: string }
type Agent = { id: number; name: string; email: string; entitlement_share: number; role_in_dispute?: string; invite_status: string }
type Good = { id: number; name: string; estimated_value: number; indivisible: boolean }
type Proposal = { id: number; outputs: any; metrics: any; explanation: string }

export default function DisputeDetail() {
  const { id } = useParams()
  const disputeId = Number(id)
  const { user } = useAuth()

  const [dispute, setDispute] = useState<Dispute | null>(null)
  const [agents, setAgents] = useState<Agent[]>([])
  const [goods, setGoods] = useState<Good[]>([])
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [tab, setTab] = useState<'agents'|'goods'|'prefs'|'proposals'|'mediation'|'room'>('agents')

  const isOwnerLike = useMemo(() => user?.role !== 'mediator', [user?.role])

  async function loadAll() {
    setErr(null)
    try {
      const d = await api(`/api/disputes/${disputeId}`)
      setDispute(d)
      const a = await api(`/api/disputes/${disputeId}/agents`)
      const g = await api(`/api/disputes/${disputeId}/goods`)
      const p = await api(`/api/disputes/${disputeId}/proposals`)
      const st = await api(`/api/disputes/${disputeId}/strategy`)
      setAgents(a); setGoods(g); setProposals(p)
      if (st && typeof st === 'object' && 'text' in st) setStrategyText((st as any).text ?? '')

    } catch (e: any) {
      setErr(e.message ?? 'Failed to load dispute')
    }
  }

  useEffect(() => { if (disputeId) loadAll() }, [disputeId])

  // Agents form
  const [aname, setAname] = useState('')
  const [aemail, setAemail] = useState('')
  const [ashare, setAshare] = useState('0.0')
  const [arole, setArole] = useState('')

  // Goods form
  const [gname, setGname] = useState('')
  const [gval, setGval] = useState('0')
  const [gind, setGind] = useState(true)

  // Strategy (mixed with preferences)
  const [strategyText, setStrategyText] = useState('')

  // Preferences form
  const [selectedGood, setSelectedGood] = useState<number>(0)
  const [bidAmount, setBidAmount] = useState('0')
  const [stars, setStars] = useState('5')

  async function addAgent() {
    try {
      await api(`/api/disputes/${disputeId}/agents`, { method: 'POST', body: { name: aname, email: aemail, entitlement_share: Number(ashare), role_in_dispute: arole || null } })
      setAname(''); setAemail(''); setAshare('0.0'); setArole('')
      await loadAll()
    } catch (e: any) { setErr(e.message) }
  }

  async function addGood() {
    try {
      await api(`/api/disputes/${disputeId}/goods`, { method: 'POST', body: { name: gname, estimated_value: Number(gval), indivisible: gind, meta: {} } })
      setGname(''); setGval('0'); setGind(true)
      await loadAll()
    } catch (e: any) { setErr(e.message) }
  }

  async function saveStrategy() {
    try {
      await api(`/api/disputes/${disputeId}/strategy`, { method: 'POST', body: { text: strategyText } })
      await loadAll()
    } catch (e: any) { setErr(e.message) }
  }

  async function setReady() {
    try {
      await api(`/api/disputes/${disputeId}/ready`, { method: 'POST', body: { ready: true } })
      await loadAll()
    } catch (e: any) { setErr(e.message) }
  }

  async function submitPreference() {
    try {
      const body: any = { good_id: selectedGood }
      if (dispute?.method === 'bids') body.bid_amount = Number(bidAmount)
      else body.stars = Number(stars)
      await api(`/api/disputes/${disputeId}/preferences`, { method: 'POST', body })
      await loadAll()
    } catch (e: any) { setErr(e.message) }
  }

  async function generateProposal() {
    try {
      await api(`/api/disputes/${disputeId}/proposals`, { method: 'POST' })
      await loadAll()
      setTab('proposals')
    } catch (e: any) { setErr(e.message) }
  }

  async function acceptProposal(proposalId: number, accepted: boolean) {
    try {
      await api(`/api/disputes/${disputeId}/proposals/${proposalId}/accept`, { method: 'POST', body: { accepted } })
      await loadAll()
    } catch (e: any) { setErr(e.message) }
  }

  async function generateReport() {
    try {
      await api(`/api/disputes/${disputeId}/report`, { method: 'POST' })
      await loadAll()
      window.open(`${API_BASE}/api/disputes/${disputeId}/report`, '_blank')
    } catch (e: any) { setErr(e.message) }
  }

  const latestProposal = proposals[0]

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader
          title={dispute ? `Dispute: ${dispute.title}` : 'Dispute'}
          subtitle={dispute ? `ID ${dispute.id} · method ${dispute.method}` : ''}
          right={
            <div className="flex items-center gap-2">
              {dispute ? <Pill>{dispute.status}</Pill> : null}
              <Button variant="ghost" onClick={loadAll}>Refresh</Button>
            </div>
          }
        />
        <div className="p-4">
          <ErrorBox message={err} />
          <div className="flex flex-wrap gap-2 mt-3">
            <Tab label="Agents" active={tab==='agents'} onClick={() => setTab('agents')} />
            <Tab label="Goods" active={tab==='goods'} onClick={() => setTab('goods')} />
            <Tab label="Preferences" active={tab==='prefs'} onClick={() => setTab('prefs')} />
            <Tab label="Proposals" active={tab==='proposals'} onClick={() => setTab('proposals')} />
            <Tab label="Mediation" active={tab==='mediation'} onClick={() => setTab('mediation')} />
            <Tab label="Dispute Room" active={tab==='room'} onClick={() => setTab('room')} />
          </div>
        </div>
      </Card>

      {tab === 'agents' ? (
        <Card>
          <CardHeader title="Agent Management" subtitle="Invite agents by name, email, and entitlement share." />
          <div className="p-4 grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="text-sm font-semibold">Add New Agent</div>
              <Input value={aname} onChange={(e) => setAname(e.target.value)} placeholder="Name" />
              <Input value={aemail} onChange={(e) => setAemail(e.target.value)} placeholder="Email" />
              <Input value={ashare} onChange={(e) => setAshare(e.target.value)} placeholder="Entitlement share (e.g. 0.5)" />
              <Select value={arole} onChange={(e) => setArole(e.target.value)}>
                <option value="">Role in dispute…</option>
                <option value="agent">agent</option>
                <option value="mediator">mediator</option>
              </Select>
              <Button onClick={addAgent} disabled={!isOwnerLike || !aname.trim() || !aemail.trim()}>Add Agent</Button>
              {!isOwnerLike ? <div className="text-xs text-slate-600">Only owners/admin can invite agents.</div> : null}
            </div>
            <div>
              <div className="text-sm font-semibold mb-2">Agents</div>
              <div className="grid gap-2">
                {agents.map(a => (
                  <div key={a.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                    <div className="font-medium">{a.name}</div>
                    <div className="text-xs text-slate-600">{a.email}</div>
                    <div className="text-xs text-slate-600">share: {a.entitlement_share} · role: {(a as any).role_in_dispute ?? 'agent'} · status: {a.invite_status} · ready: {String((a as any).ready)}</div>
                  </div>
                ))}
                {agents.length === 0 ? <div className="text-sm text-slate-600">No agents yet.</div> : null}
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      {tab === 'goods' ? (
        <Card>
          <CardHeader title="Goods & Assets Management" subtitle="Add goods with estimated value and indivisibility." />
          <div className="p-4 grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="text-sm font-semibold">Add New Good</div>
              <Input value={gname} onChange={(e) => setGname(e.target.value)} placeholder="Good name" />
              <Input value={gval} onChange={(e) => setGval(e.target.value)} placeholder="Estimated value" />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={gind} onChange={(e) => setGind(e.target.checked)} />
                Indivisible
              </label>
              <Button onClick={addGood} disabled={!isOwnerLike || !gname.trim()}>Add Good</Button>
              {!isOwnerLike ? <div className="text-xs text-slate-600">Only owners/admin can add goods.</div> : null}
            </div>
            <div>
              <div className="text-sm font-semibold mb-2">Goods</div>
              <div className="grid gap-2">
                {goods.map(g => (
                  <div key={g.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                    <div className="font-medium">{g.name}</div>
                    <div className="text-xs text-slate-600">value: {g.estimated_value} · indivisible: {String(g.indivisible)}</div>
                  </div>
                ))}
                {goods.length === 0 ? <div className="text-sm text-slate-600">No goods yet.</div> : null}
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      {tab === 'prefs' ? (
        <Card>
          <CardHeader title="Preferences" subtitle="Agents input preferences using the dispute method." />
          <div className="p-4 grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="text-sm font-semibold">Strategy / Preferences</div>
              <div className="text-xs text-slate-600">Strategy is stored per party and is visible to the mediator. Preferences are per-good (bids or rates).</div>
              <div className="text-sm font-medium mt-2">Strategy / Notes</div>
              <Textarea value={strategyText} onChange={(e) => setStrategyText(e.target.value)} rows={5} placeholder="Explain your approach, constraints, or negotiation notes…" />
              <div className="flex gap-2">
                <Button onClick={saveStrategy} disabled={user?.role === 'mediator'}>Save Strategy</Button>
                <Button variant="ghost" onClick={setReady} disabled={user?.role === 'mediator'}>Submit for validation</Button>
              </div>

              <div className="mt-4 text-sm font-semibold">Submit Preference</div>
              <div className="text-xs text-slate-600">You must be signed in as an agent assigned to this dispute.</div>
              <Select value={selectedGood} onChange={(e) => setSelectedGood(Number(e.target.value))}>
                <option value={0}>Select a good…</option>
                {goods.map(g => <option key={g.id} value={g.id}>{g.name} (ID {g.id})</option>)}
              </Select>
              {dispute?.method === 'bids' ? (
                <Input value={bidAmount} onChange={(e) => setBidAmount(e.target.value)} placeholder="Bid amount" />
              ) : (
                <Select value={stars} onChange={(e) => setStars(e.target.value)}>
                  <option value="1">1 star</option>
                  <option value="2">2 stars</option>
                  <option value="3">3 stars</option>
                  <option value="4">4 stars</option>
                  <option value="5">5 stars</option>
                </Select>
              )}
              <Button onClick={submitPreference} disabled={user?.role === 'mediator' || selectedGood === 0}>Submit</Button>
              {user?.role === 'mediator' ? <div className="text-xs text-slate-600">Mediators can’t submit preferences.</div> : null}
            </div>
            <div className="space-y-2">
              <div className="text-sm font-semibold">Tip</div>
              <div className="text-sm text-slate-700">
                After preferences are submitted, the dispute owner generates a proposal. Agents can then accept or reject it.
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      {tab === 'proposals' ? (
        <Card>
          <CardHeader
            title="Allocation Proposals"
            subtitle="Generate proposals, collect acceptance, and finalize with a report."
            right={
              <div className="flex items-center gap-2">
                <Button onClick={generateProposal} disabled={!isOwnerLike}>Generate Proposal</Button>
                <Button variant="ghost" onClick={generateReport} disabled={!isOwnerLike || dispute?.status !== 'accepted'}>Generate Report</Button>
              </div>
            }
          />
          <div className="p-4 space-y-3">
            <div className="text-xs text-slate-600">
              Current allocator is a baseline (max bid/stars). Replace in backend: <code>/api/disputes/&lt;id&gt;/proposals</code>.
            </div>

            {latestProposal ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">Latest proposal (ID {latestProposal.id})</div>
                  {user?.role !== 'mediator' ? (
                    <div className="flex gap-2">
                      <Button onClick={() => acceptProposal(latestProposal.id, true)}>Accept</Button>
                      <Button variant="ghost" onClick={() => acceptProposal(latestProposal.id, false)}>Reject</Button>
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
                          Good {a.good_id} → Agent {a.assigned_agent_id} (score {String(a.score)})
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
        </Card>
      ) : null}

      {tab === 'mediation' ? (
        <Card>
          <CardHeader title="Mediator Page" subtitle="If the proposal is declined, coordinate mediation and agree on a conference time." />
          <div className="p-4 space-y-3">
            <div className="text-sm text-slate-700">
              Status: <b>{dispute?.status}</b>. If a proposal is rejected, the dispute moves to <b>mediation</b>.
            </div>

            <MediationPlanner disputeId={disputeId} />

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="font-semibold">Preferences & strategies (read-only for mediators)</div>
              <div className="mt-2 text-sm text-slate-700">
                Mediators can review the goods list, strategies, and the latest proposal metrics to guide parties.
              </div>
              <div className="mt-3 text-xs text-slate-600">
                Tip: use the Dispute Room to start a live call or join at the planned time.
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      {tab === 'room' ? (
        <Card>
          <CardHeader title="Dispute Room" subtitle="Open video now or plan a conference date with the parties." />
          <div className="p-4 grid md:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="font-semibold">Video conference now</div>
              <div className="text-sm text-slate-600 mt-1">Open the Jitsi room immediately.</div>
              <Button className="mt-3" onClick={() => window.open(`https://meet.jit.si/CREA3-Dispute-${disputeId}#config.prejoinPageEnabled=false`, '_blank')}>Open room</Button>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="font-semibold">Plan a conference</div>
              <div className="text-sm text-slate-600 mt-1">Propose time slots and get agreement from all agents.</div>
              <Button className="mt-3" variant="ghost" onClick={() => setTab('mediation')}>Plan / Agree on a date</Button>
            </div>
          </div>
        </Card>
      ) : null}


      {/* Dispute chat (available only when logged in) */}
      <DisputeChatBox disputeId={disputeId} />

    </div>
  )
}


function MediationPlanner({ disputeId }: { disputeId: number }) {
  const [slots, setSlots] = useState<{id:number; when:string; agreed_agent_ids:number[]; confirmed:boolean}[]>([])
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

  useEffect(() => { load() }, [disputeId])

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
        <Button onClick={propose} disabled={user?.role === 'mediator' || !when.trim()}>Propose</Button>
      </div>

      <div className="mt-3 space-y-2">
        {slots.length === 0 ? (
          <div className="text-sm text-slate-600">No proposed slots yet.</div>
        ) : slots.map(s => (
          <div key={s.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 flex items-center justify-between gap-3">
            <div>
              <div className="font-medium">{s.when}</div>
              <div className="text-xs text-slate-600">Agreed agent IDs: {s.agreed_agent_ids?.join(', ') || '—'} {s.confirmed ? '· CONFIRMED' : ''}</div>
            </div>
            <Button variant="ghost" onClick={() => agree(s.id)} disabled={user?.role === 'mediator'}>Agree</Button>
          </div>
        ))}
      </div>
    </div>
  )
}


function Tab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl px-3 py-2 text-sm border ${active ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50'}`}
    >
      {label}
    </button>
  )
}
