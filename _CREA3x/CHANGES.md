# CREA3 — Changes in this revision

This revision applies the backend security/workflow/integration fixes and
restructures the chatbots. Below is what changed and why.

## 1. Security fixes

- **Removed the forgeable admin auth.** The old `api/admin.py` minted and
  verified its own HS256 token signed with a default secret (`change-me`),
  letting anyone forge an admin token. Admin access is now granted **only** via
  the Keycloak `admin` realm role (`deps.require_admin`). The self-signed token
  system, the mock admin credentials, and the server-rendered `/admin` HTML page
  (`admin_ui.py`) were deleted.
- **Removed committed secrets.** The leaked Gmail App Password was purged from
  all files (it was even in the `.env.example` templates). All `.env` files were
  removed from the tree; only `*.env.example` placeholders remain. A
  `.gitignore` now prevents `.env` and the SQLite DB from being committed again.
- **Removed the committed database** (`backend/crea3.db`) which contained real
  users' email addresses and 238 access-log rows.
- **Restored input validation.** `schemas.py` had been downgraded to accept
  1-character passwords and unvalidated emails. Restored `EmailStr` and the
  8-character minimum password.
- **Hardened the Keycloak realm** (`infra/keycloak/realm-crea.json`):
  `sslRequired=external`, brute-force protection on, a password policy
  (length ≥ 8 + history), and the `crea-backend` client secret replaced with a
  clearly-placeholder value that **must** match `KEYCLOAK_ADMIN_CLIENT_SECRET`
  in `backend/.env`.
- **Enabled audience checks** in token verification and tightened CORS to
  enumerate methods/headers instead of `*` (credentials are allowed).

## 2. Dead / broken code removed

- `api/auth.py` — referenced model fields, a config key, a Keycloak method, and
  an exception that no longer exist; it would crash if called and the frontend
  never used it (login is Keycloak SSO).
- `core/security.py` — legacy local-JWT helpers with a hardcoded dev secret.
- `api/notifications.py` — a duplicate invite path whose decline **deleted** the
  agent row and whose response didn't match its schema. Kept `api/invitations.py`.
- `api/stats.py` + the `VisitCounter` model — a second, redundant visit counter.
  Kept `api/metrics.py`.
- `schemas.py.orig` — leftover merge artifact.

## 3. Workflow correctness

- **Validated status transitions.** `PATCH /disputes/{id}/status` now rejects
  unknown statuses and illegal jumps (e.g. `draft → finalized`). The canonical
  statuses, roles, and transition rules live in `core/workflow.py`.
- **Edit lock enforced.** Goods and agents could previously be edited at any
  stage, silently invalidating a generated proposal. `goods.py` and `agents.py`
  now enforce the same lock as preferences/strategy via `core/authz.py`
  (`require_can_manage_structure`): structural edits are only allowed while the
  dispute is in `draft`/`collecting`.
- **Entitlement-share invariant.** A dispute can no longer advance to
  `validating` unless the joined non-mediator parties' shares sum to ~1.0.
- **Fixed the GDPR delete.** `DELETE /users/me/data` filtered non-existent
  `user_id` columns on `Preference`/`Strategy` and would crash; it now deletes
  via the user's `agent_id` rows.
- **Centralized RBAC** in `core/authz.py` (was duplicated across ~6 files with
  divergent rules).

## 4. Integration / robustness

- **No double token verification.** `get_current_user` caches claims on
  `request.state`; the access-log middleware reads them instead of re-verifying
  the JWT on every request.
- **Provisioning race** guarded with an `IntegrityError` fallback.

## 5. Chatbots restructured

### Legal AI Assistant (external RAG service)
- Moved to its own page at **`/app/legal-ai`**, linked in the left sidebar as
  **"Legal AI Assistant"** (`frontend/src/pages/legal-ai.tsx`).
- The frontend no longer hardcodes the external URL. It calls the backend proxy
  `POST /api/chat`, which **requires authentication** and reads the upstream URL
  from server config (`LEGAL_AI_URL`). Set this to your RAG service's `/chat`
  endpoint; leave empty to disable the feature.

### Workflow Assistant (local, Ollama-powered)
- Shown at the **bottom of the dispute workspace**
  (`frontend/src/components/workflow-assistant.tsx`).
- Answers "how do I use the platform / what goes in this field" questions, and
  is **grounded on the current dispute's live data** (status, goods, agents, and
  the caller's *own* preferences/strategy only — never another party's).
- Runs entirely on a **local Ollama** model. Endpoints:
  `POST /api/assistant` (general), `POST /api/assistant/disputes/{id}`
  (grounded), `GET /api/assistant/models` (for the model picker).
- **Swap the model easily**: change `OLLAMA_MODEL` in `backend/.env`, or pick a
  model from the dropdown in the assistant header (lists everything installed in
  Ollama). The Ollama client is in `core/ollama.py`.

The old floating FAQ-stub widget and the old in-dispute chatbox (which had the
hardcoded external URL) were removed.

## Verification

- Backend: every module byte-compiles; the FastAPI app boots and serves 30
  routes; `/api/chat`, `/api/assistant/*`, and `/api/admin/access-logs` all
  return 401 without a valid token.
- Frontend: `tsc --noEmit` passes (the original never type-checked) and
  `npm run build` succeeds.

---

# Revision 3 — Professional reports + chatbot UX + multilingual chatbots

## Professional proposal/decision PDF
- New `backend/app/services/report_pdf.py` produces a branded A4 PDF with the
  CREA3 logo header, a consortium-partners strip, parties/goods/allocation
  tables, a **fairness summary** (value share vs. entitlement, colour-coded
  deviation), and two **charts** (value-share pie + assigned-vs-entitlement bar)
  drawn with `reportlab.graphics` (no new dependencies).
- New endpoint `POST /api/disputes/{id}/report/proposal` generates this PDF
  **as soon as a proposal exists** (i.e. during the preferences phase), so it is
  available before final acceptance. `POST /api/disputes/{id}/report` still
  produces the final report after acceptance.
- `GET /api/disputes/{id}/report` (download) is accessible to **every
  participant — all parties and mediators** — and the owner/admin.
- Logos are bundled in `backend/app/assets/`.
- The preferences tab now has a "Proposal report (PDF)" panel with Generate /
  Download buttons.

## Legal AI Assistant — friendlier UX
- Rewritten with a single **segmented mode selector** (Text / Transcription /
  Speech) instead of many buttons:
  - **Text**: type and send.
  - **Transcription**: Record → speak → it transcribes into the box after **3s
    of silence** (or Stop); you review and Send.
  - **Speech**: hands-free call — Start call → speak → after **3s of silence**
    it sends, reads the answer aloud, then listens again until you End call.
- The call no longer ends prematurely: a silence timer waits a full 3 seconds of
  no audible speech before stopping/transcribing, and resets on every utterance.

## Multilingual chatbots
- Changing the platform language now also switches the chatbots:
  - speech recognition + spoken-answer voice follow the language,
  - greetings/labels are translated (added 29 new i18n keys across all 7
    languages),
  - the local **Ollama** assistant is instructed to reply in the selected
    language (the frontend sends `lang`; the backend adds a language directive),
  - the external **Legal AI** proxy forwards `lang` to the upstream service.

All changes verified: backend compiles + boots (report endpoints live, auth
enforced); frontend `tsc` clean and `npm run build` succeeds; the PDF renders
correctly (logos, tables, charts).

---

# Revision 4 — Equitable algorithm (divergent valuations) + far more professional report

## Algorithm: now genuinely accounts for divergent valuations
- `backend/app/services/proposals_service.py` rewritten (`v2-equitable-divergent`).
- The previous engine collapsed everything to a single owner-set `estimated_value`
  and 1–5 stars used only to pick a winner. It now builds a **per-party subjective
  valuation matrix**:
  - parties may enter their **own monetary valuation** of each good (new optional
    field in the preferences UI; stored in `Preference.bid_amount`),
  - if only stars are given, a valuation is derived (1–5 stars → 0.4×–1.6× of the
    estimated value), so divergent intensity is still captured.
- Each indivisible asset is awarded to the party who **values it most**, then a
  **balancing cash payment** (adjusted-winner / Knaster-style equalization) is
  computed so each party's value received — *in their own valuation* — is
  proportional to their entitlement. The valuation gap per asset and the total
  gap are reported.

## Report: much more professional + new content
- `report_pdf.py` substantially upgraded:
  - **Cover page** (brand band, logo, title, metadata box, confidentiality strip).
  - **Executive summary**.
  - **Pre-filled history narrative** of the dispute (`services/history.py`),
    built from the audit log — procedural milestones only.
  - **"Assets and how the parties value them"** section: a table highlighting
    (in green) who values each asset most, the **valuation gap**, and a grouped
    bar chart of each party's valuation per asset — directly surfacing the
    different values the two parties give.
  - **Proposed allocation** shows only the assignment + the awarded party's
    valuation — **individual preferences are never disclosed**.
  - **Balancing-payment callout** explaining the compensation.
  - Fairness summary, objective-share pie chart, methodology, signatures,
    partners footer.

## Privacy
- No individual star ratings or per-good preferences appear anywhere in the PDF
  or the history. The history aggregates "the parties submitted their valuations
  and preferences (kept confidential)"; the allocation shows only outcomes.

Verified: backend compiles + boots; new engine valuation logic unit-checked;
PDF renders to 5 professional pages (cover, summary+history, valuations+
allocation+compensation, fairness, partners); frontend `tsc` clean + build OK.

---

# Revision 5 — Omitted-asset detection + two-sided closing chart

## Algorithm: detects assets one party didn't include
- `proposals_service.py`: each good now tracks which parties **acknowledged** it
  (submitted a star rating or a valuation for it). A good is **"contested by
  omission"** when at least one party acknowledged it and at least one did not.
- A party that did not include an asset is treated as valuing it at **0** (they
  did not claim it), so it is awarded to the party who claimed it. This is the
  inheritance/divorce case of an overlooked, disputed, or undisclosed asset.
- New fields on each allocation (`contested_by_omission`, `acknowledged_by_ids`,
  `omitted_by_ids`/`omitted_by_names`) and new metrics (`omitted_assets`,
  `omitted_assets_count`, `omitted_assets_value`, `disclosure_note`).
- Safe fallback: if NO party acknowledged a good (valuations never collected),
  the neutral estimated value is still used so the allocation works.

## Report
- New **"Assets acknowledged by only one party"** section (red header) listing
  each flagged asset, who acknowledged it, and who did not — so the parties or
  mediator can confirm whether the omission was intentional.
- New **two-sided diverging ("tornado") chart** on a closing page: the two
  parties are placed back-to-back, each asset's valuation extending left for one
  party and right for the other, with omitted-by-one-party assets flagged
  inline. Makes the divergence and any disclosure asymmetry instantly visible.

Verified: omission logic unit-checked; backend compiles + boots; PDF renders to
6 pages including the flagged-assets table and the closing diverging chart;
frontend tsc clean + build OK.

---

# Revision 6 — Pre-proposal reconciliation + lighter report + side-by-side replaces pie

## Reconciliation step (proposal is now uniquely defined)
- New dispute stage **`reconciling`** sits between "all parties ready" and proposal
  generation. The proposal is no longer auto-generated on preference submit; it is
  produced only after reconciliation is finalized, so its inputs are deterministic.
- New `ReconciliationResponse` model + `app/reconciliation.py` service + endpoints
  under `/api/disputes/{id}/reconciliation` (`GET`, `POST /value`, `POST /omitted`,
  `POST /finalize`).
- **Divergent valuations**: where both parties valued the same asset differently,
  each is asked whether to reconcile by taking the **mean**. If ALL agree, that
  asset's valuation becomes the mean for both (spread resolved, shown as
  "✓ averaged"). If anyone disagrees, the spread is preserved and still
  highlighted.
- **Omitted items**: an asset acknowledged by one party but not the other prompts
  the omitting party to OPTIONALLY supply their own valuation/preference; if they
  decline, it stays at 0 (unclaimed) and remains flagged.
- `finalize` refuses to generate the proposal until every party has responded to
  every open item.
- Frontend: new **Reconcile** tab + `ReconciliationPanel` component (agree-to-mean
  buttons, optional valuation for omitted items, live response state, "Generate
  proposal" gated on completion). Mediators see it read-only. 24 new i18n strings
  across all 7 languages.

## Report
- **Lighter, softer palette** for a less heavy, more professional proposal look
  (gentle blues, very light row tints, soft green/red/gold accents).
- The **side-by-side diverging chart now replaces the pie chart** in the fairness
  summary; the previous separate closing page was removed.
- Valuations table shows "✓ averaged" where a divergent valuation was reconciled
  to the mean.

Verified: reconciliation flow unit-tested (mean when both agree, spread kept
otherwise, omitted-then-valued folded in); backend compiles + boots with all
routes live and auth-enforced; PDF renders to 6 pages with the lighter look and
the side-by-side chart; frontend tsc clean + build OK.

---

# Revision 7 — Formal legal notice + partners on their own page

## Legal notice / intended use
- Added a formal, boxed **"Legal notice and intended use"** section to the report,
  stating prominently that **the document has no legal value** and is an
  automatically generated **decision-support** document. It clarifies the contents
  are not legal advice, an opinion, a binding settlement, a court order, or any
  enforceable instrument; that the algorithmic output is indicative only and may
  contain errors; that it does not replace independent legal advice or a competent
  court/authority; and that the consortium/authors accept no liability for its use.
  The heading and box are kept together on the same page.

## Consortium partners
- The consortium partners now appear on their **own dedicated page** (page break
  before the section), with a title heading, an introductory line, the partner
  logos shown larger, and the EU Justice Programme funding statement.

Verified: report renders correctly (legal notice box on its page, partners on a
separate final page); backend compiles + boots; report endpoint auth-enforced.

---

# Revision 8 — Audit fixes (participant matching, reconciliation gating, GDPR)

A review pass surfaced several issues, now fixed:

1. **Participant matching bug (high impact).** `deps.get_participant` matched only
   on `DisputeAgent.user_id`, which is set only when a party accepts an invitation.
   A party added by email who never went through that flow — most notably the
   dispute **owner who is also a party** — had a null `user_id` and was therefore
   wrongly blocked (403) from submitting preferences, marking ready, reconciling,
   strategy, and mediation. Now matches by `user_id OR email`, consistent with
   `core/authz`, `agents.py`, and the frontend.

2. **Proposal stuck in `reconciling`.** `ensure_latest_proposal` advanced the
   dispute to `proposed` only from `draft/collecting/validating` — not from the
   new `reconciling` stage — so finalizing reconciliation created the proposal but
   left the status stuck. `reconciling` is now included.

3. **Reconciliation bypass.** The legacy `POST /proposals` endpoint generated a
   proposal without checking reconciliation, defeating the "uniquely defined"
   guarantee. It now enforces the same reconciliation-complete gate as
   `reconciliation/finalize`.

4. **GDPR erasure gap.** `DELETE /users/me/data` did not remove the new
   `ReconciliationResponse` rows or `Acceptance` rows (both keyed by agent_id),
   leaving personal data behind and orphaned rows in deleted disputes. Both are
   now cleaned up.

5. **Misleading dead expression** in the reconciliation `complete` flag
   (`... or True`) removed; behaviour unchanged but now correct/legible.

6. **Case-sensitive participant match (frontend).** Party identification compared
   emails case-sensitively; now normalized to lower-case so e.g. `Mario@x.it`
   matches `mario@x.it`.

Verified: full reconciliation flow tested end-to-end (owner-as-party recognised,
complete flips correctly, status moves reconciling→proposed, value reconciled to
mean); backend compiles + boots (35 routes, auth enforced); frontend tsc clean +
build OK.

---

# Revision 8 — Real game theory (Knaster sealed bids) + clearer valuations

## Algorithm: proper cooperative game theory over perceived values
- New `app/game_theory.py` implements the **Knaster method of sealed bids** (with
  the Adjusted-Winner efficiency rule), the classical solution for dividing
  indivisible assets among parties who value them differently using cash.
- The engine (`v3-knaster-game-theory`) now computes, in each party's OWN
  perceived values:
  - **perceived total** (their valuation of all declared assets),
  - **fair share** = entitlement × perceived total,
  - **value received** (own valuation of awarded assets),
  - **surplus** = received − fair share,
  - a **cash settlement** so that every party ends with the SAME advantage over
    their own fair share (the equitability guarantee; cash nets to zero).
- This replaces the previous heuristic that subtracted surpluses measured in two
  different subjective currencies — which was not sound. Verified on worked
  examples: the final advantage is provably equal across parties and the cash
  settlement sums to zero.
- Rates (stars), explicit valuations, and matched vs mismatched (one-sided)
  declared assets all feed the perceived-value matrix.

## Report clarity (addresses the "estimated" confusion)
- The valuations table now leads with the parties' **perceived values** as the
  basis; the owner-entered figure is moved to a muted **"Reference"** column,
  explicitly labelled as context only and not used in the settlement.
- When both parties state the **same** value, the row shows **"agreed"** (not
  "averaged"); "✓ averaged" is reserved for reconciliation-to-mean, and
  "one-sided" marks assets only one party declared.
- The fairness summary is reframed as a **game-theoretic settlement** table
  (perceived total, fair share, value received, surplus, settlement, final
  advantage) with the equitability guarantee shown explicitly, plus a
  methodology paragraph describing the Knaster procedure.

Verified: GT math unit-tested (equal final advantage, zero-sum cash); engine +
report integrate correctly (same-value asset shows "agreed"); backend compiles +
boots; PDF renders the new fairness analysis; frontend tsc clean + build OK.

---

# Revision 9 — Plain-language fairness, full timeline, leaner report

## Fairness / balancing payment (non-expert framing)
- The balancing payment now lives only in the **Fairness summary**, written for
  non-expert readers. It is framed around the **gap** that emerges (value
  received vs. fair share) and an **"evening-out payment"** that closes it.
- The report never instructs a party that they must "compensate". The payment is
  described neutrally in the table ("pays …" / "receives …") as part of the
  proposal, with the emphasis on the gaps that emerged.
- Removed the separate gold "Balancing payment" callout after the allocation.

## Methodology removed
- The Methodology section was removed from the report.

## Intended-use paragraph
- The legal notice now adds a short clause noting the evening-out payment is
  indicative only and is **not an order to pay**.

## Timeline
- Added a **full, chronological "Timeline of the dispute"** immediately after the
  Parties section, listing every recorded procedural event (creation,
  invitations, assets added, acceptances, input completion, reconciliation
  responses, proposal generation, etc.). Private valuations/preferences are never
  disclosed. (`history.py` rewritten to emit the full timeline.)

## Mediator
- The **Parties to the dispute** table now lists only the disputing parties; the
  mediator is no longer shown there (and the Role column was dropped).

Verified: backend compiles + boots; report renders (parties without mediator,
full timeline after parties, plain-language fairness with evening-out framing, no
methodology, evening-out mention in the notice); frontend tsc clean + build OK.

---

# Revision 10 — "Balance" wording + one-sided assets excluded from the balance

## Wording: "evening-out" -> "balance"
- Removed all "evening-out payment" wording. The fairness section now uses
  <b>balance</b> / <b>balancing amount</b> throughout (column header, intro,
  footnote, and the legal notice). The table shows "pays …" / "receives …" with
  the emphasis still on the gap that emerged; no party is told they must
  "compensate".

## One-sided assets no longer distort the balance
- The case where one party declared/valued an asset and the other expressed no
  preference is now handled correctly. Previously such an asset inflated the
  declaring party's fair-share obligation (e.g. a €200k house that both valued
  equally plus a €60k item only one declared produced a €115k balance instead of
  the fair €100k).
- Now only <b>shared</b> assets (those every party expressed a value/preference
  for) enter the Knaster balancing computation. A one-sided asset is still
  awarded to the party who declared it, but is <b>excluded from the balance</b>
  so it does not change what either party pays or receives. It remains flagged in
  the "Assets acknowledged by only one party" section for confirmation.
- Verified: the house-plus-one-sided-item example now yields the fair €100k
  balance; the all-shared case is unchanged (equal final advantage, zero-sum
  cash).

Verified: GT regression check passes; backend compiles + boots; report renders
with the Balance column and the corrected one-sided handling; frontend tsc clean
+ build OK.

---

# Revision 11 — Mismatch evaluated in the algorithm; flagged section removed

## One-sided assets now evaluated inside the game theory
- Reverted the previous exclusion. ALL declared assets now enter the Knaster
  balancing computation. An asset only one party valued is part of that party's
  declared estate: it is awarded to them, and the other party (who valued it at
  0) receives their share of its value through the balance.
- Example: a €200k house both value equally plus a €60k asset only one party
  declared now produces a €115k balance (the €100k half-house plus the other
  party's €15k share of the declared asset), instead of setting the asset aside.

## "Assets acknowledged by only one party" section removed
- The dedicated flagged section/paragraphs were removed from the report
  ("if it happens it happens"). A one-sided asset still appears naturally in the
  valuations and allocation tables (with a neutral "one-sided" status word and
  the party's actual €0 valuation), and is fully reflected in the balance — but
  it is no longer called out as an anomaly to confirm.
- The fairness intro no longer mentions setting such assets aside.

Verified: engine evaluates the mismatch (house+one-sided example => €115k);
report no longer renders the flagged section; backend compiles + boots; frontend
tsc clean + build OK.

---

# Revision 12 — Remove signatures, richer summary, notice+partners together

## Signatures removed
- The "Acknowledgement" / signature-line section was removed from the report.

## More descriptive executive summary
- The executive summary is now three plain-language paragraphs: (1) what the
  document is and which named parties it concerns, (2) how the equitable method
  works in everyday terms (value each asset, award to whoever values it most,
  then a single balancing amount), and (3) what the reader will find in the
  document, with the confidentiality note. The full dispute timeline remains
  immediately after the parties.

## Legal notice + consortium partners on the same page
- The legal notice and the consortium partners (logos + EU funding statement) now
  appear together on a single closing page, instead of the partners having their
  own separate page.

Verified: backend compiles + boots; report renders (no signatures, richer
summary, full timeline, notice+partners on one page); frontend tsc clean + build
OK.

---

# Revision 13 — Bug audit: tie-break fix, notifications wired, first tests

Audited the platform end-to-end. Findings and fixes:

## BUG FIXED — lopsided allocation on tied valuations
- When parties valued items equally, the tie-break sent ALL tied items to one
  party with a large offsetting cash transfer (e.g. two €100k items both to one
  party + a €100k payment), instead of the obvious clean split.
- Fixed the tie-break in game_theory.py: on equal valuations the item now goes to
  the party currently furthest below their entitlement-weighted share, which
  balances the split and minimizes cash. Verified: identical valuations now split
  evenly with zero transfer; divergent cases unchanged (still equitable,
  zero-sum).

## BUG FIXED — notifications bell called a non-existent endpoint
- The notifications bell (mounted on every page) called /api/notifications, which
  has no backend router; accept/decline would have thrown. Rewired it to the real
  /api/invitations API (list + /{dispute_id}/respond). The bell now lists pending
  invitations and accept/decline work.

## Added — first automated test suite
- backend/tests/test_game_theory.py (pytest, 5 tests, no DB/network) locks in the
  engine's properties: even split on ties, equitable + zero-sum on divergent
  valuations, one-sided handling, entitlement weighting. Run:
  `cd backend && python3 -m pytest tests/ -q`.

## Noted (not changed)
- The `Notification` SQLModel table is vestigial: never created, only deleted in
  GDPR cleanup and previously queried by the dead endpoint. Left in place
  (harmless; removing it risks the GDPR-delete import). The live notification
  mechanism is /api/invitations.

Verified: backend compiles + boots; /api/invitations protected; 7/7 engine checks
+ 5/5 pytest pass; frontend tsc clean + build OK.

---

# Revision 14 — Meeting scheduler + preflight test runner

## Calendar-style meeting scheduler
- Replaced the crude "paste an ISO datetime" mediation planner with a proper
  scheduling UI: native date + time pickers, proposed times shown in the user's
  local format, and per-participant agreement chips (by NAME, not raw IDs).
- Mediators now take part: a meeting is CONFIRMED only when every joined
  participant — both parties AND the mediator(s) — has agreed to the same time.
- Added withdraw (decline) and remove (proposer-only) actions; declining a
  confirmed time un-confirms it. New backend endpoints: POST .../slots/{id}/decline
  and DELETE .../slots/{id}. MediationSlot gained a proposed_by_agent_id field;
  the slot API now returns proposer + full participant agreement state.
- 13 new sched* i18n strings across all 7 languages.
- New mediation timeline events (declined / removed) added to the history.

## preflight.sh — full-app test runner
- Added ./preflight.sh: a branded (CREA3 ANSI banner), colour-coded preflight
  that checks the entire app — environment, backend (compile, import, engine
  pytest, server boot + health + protected-route probe, route registration,
  security sweep) and frontend (deps, tsc, production build, i18n key parity).
  Flags: --quick (skip the vite build), --no-color (for CI). Exit 0 = all green.

## Tests
- Added backend/tests/test_mediation.py (3 e2e tests via TestClient): confirm-on-
  all-agree incl. mediator, decline un-confirms, only-proposer-can-remove. Total
  suite now 8 tests, all passing and wired into preflight.

Verified: preflight 13/13 green; pytest 8/8; backend boots with all mediation
routes; frontend tsc clean + build OK.
