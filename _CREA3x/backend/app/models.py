from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from pydantic import BaseModel as _PydBaseModel
from sqlmodel import SQLModel, Field, Relationship, Column, JSON, UniqueConstraint

def utcnow():
    return datetime.now(timezone.utc)


class SourceRef(_PydBaseModel):
    """A KB source citation in a chat answer: the document id (for download/open)
    and its display name (filename). id is None for legacy string-only sources.
    `url` (when set) points at an external viewer page — e.g. the LexAI chatbot's
    /source/view — opened in a new tab instead of the platform KB download."""
    id: Optional[int] = None
    name: str
    url: Optional[str] = None

class AccessLog(SQLModel, table=True):
    """A simple request log used by the admin 'control room'."""

    id: Optional[int] = Field(default=None, primary_key=True)
    ts: datetime = Field(default_factory=utcnow, index=True)

    method: str = Field(index=True)
    path: str = Field(index=True)
    status_code: int = Field(index=True)

    ip: str = Field(default="")
    user_agent: str = Field(default="")
    user_email: Optional[str] = Field(default=None, index=True)

    duration_ms: Optional[int] = Field(default=None)
class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    # Keycloak JWT subject (UUID-like string). Used to map Keycloak identities to local rows.
    keycloak_sub: Optional[str] = Field(default=None, index=True, unique=True)
    email: str = Field(index=True, unique=True)
    username: str = Field(index=True, unique=True)
    # When using Keycloak, we don't store passwords locally.
    # Kept for compatibility with earlier local-auth versions.
    hashed_password: str = Field(default="")
    role: str = Field(default="agent", index=True)  # agent|mediator
    email_verified: bool = Field(default=False, index=True)
    # For local/dev flows we persist the verification token so users can copy/paste it
    email_verification_token: Optional[str] = Field(default=None, index=True)
    email_verification_expires_at: Optional[datetime] = Field(default=None)
    # 6-digit email verification code + last-sent timestamp (resend throttle).
    email_verification_code: Optional[str] = Field(default=None, index=True)
    email_verification_sent_at: Optional[datetime] = Field(default=None)
    # Password reset (forgot-password) one-time code lifecycle.
    password_reset_code: Optional[str] = Field(default=None, index=True)
    password_reset_expires_at: Optional[datetime] = Field(default=None)
    password_reset_sent_at: Optional[datetime] = Field(default=None)
    # Account + activity timestamps (self-contained auth).
    created_at: datetime = Field(default_factory=utcnow)
    last_login_at: Optional[datetime] = Field(default=None)
    # Provenance: the user's country drives their timezone (for meeting times) and
    # default UI language. Set at first login (onboarding) and editable in Account.
    country: Optional[str] = Field(default=None, index=True)   # ISO-ish code: IT, BE, SI, LT, HR, EE, ...
    timezone: Optional[str] = Field(default=None)              # IANA tz, e.g. "Europe/Rome"
    locale: Optional[str] = Field(default=None)                # UI language code, e.g. "it"
    # Notification preferences. When false, the corresponding emails are suppressed
    # (in-app notifications are unaffected).
    notify_email_invitations: bool = Field(default=True)
    notify_email_meetings: bool = Field(default=True)
    notify_email_milestones: bool = Field(default=True)
    created_at: datetime = Field(default_factory=utcnow)

    disputes_created: List["Dispute"] = Relationship(back_populates="created_by")

class Dispute(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    method: str = Field(index=True)  # bids|rates
    status: str = Field(default="draft", index=True)  # draft|collecting|validating|proposed|accepted|finalized
    created_by_id: int = Field(foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=utcnow)
    # Soft-delete: an abandoned dispute can be removed from the active list while
    # remaining visible in the archive (with its PDF). Never hard-deleted so the
    # record and its report are preserved.
    hidden_from_active: bool = Field(default=False, index=True)
    # Optional deadline for the current phase. When set and passed, the dispute is
    # flagged as overdue (a reminder may be sent). Informational, not enforced.
    deadline_at: Optional[datetime] = Field(default=None, index=True)
    deadline_reminded: bool = Field(default=False)

    created_by: Optional[User] = Relationship(back_populates="disputes_created")
    agents: List["DisputeAgent"] = Relationship(back_populates="dispute")
    goods: List["Good"] = Relationship(back_populates="dispute")
    proposals: List["AllocationProposal"] = Relationship(back_populates="dispute")
    audit_events: List["AuditEvent"] = Relationship(back_populates="dispute")
class DisputeAgent(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("dispute_id", "email", name="uq_dispute_agent_email"),)
    id: Optional[int] = Field(default=None, primary_key=True)

    dispute_id: int = Field(foreign_key="dispute.id", index=True)
    user_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)

    name: str
    email: str = Field(index=True)

    entitlement_share: float = Field(default=0.0)
    # The share the dispute owner assigned to this party (authoritative starting
    # point). claimed_entitlement_share is what THIS party says they are entitled
    # to; when it differs from the assigned share the engine records a mismatch
    # and normalizes the claimed shares proportionally so they sum to 1.
    claimed_entitlement_share: Optional[float] = Field(default=None)
    # Short free-text (<=50 chars) where the party explains/justifies their
    # claimed share, surfaced in the report when there is a mismatch.
    entitlement_position: Optional[str] = Field(default=None, max_length=50)
    role_in_dispute: Optional[str] = None

    # Invitation lifecycle
    invite_status: str = Field(default="invited", index=True)  # invited|joined|declined
    invite_comment: Optional[str] = Field(default=None)
    invited_by_user_id: Optional[int] = Field(default=None, index=True)
    invited_at: datetime = Field(default_factory=utcnow)
    responded_at: Optional[datetime] = Field(default=None)

    ready: bool = Field(default=False, index=True)
    # Each party locks their own goods additions when they finish adding assets.
    # Preferences open for everyone only once ALL joined non-mediator parties
    # have locked. (Distinct from `ready`, which signals "done rating".)
    goods_locked: bool = Field(default=False, index=True)

    dispute: Optional[Dispute] = Relationship(back_populates="agents")
    preferences: List["Preference"] = Relationship(back_populates="agent")
    acceptances: List["Acceptance"] = Relationship(back_populates="agent")

class Good(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    dispute_id: int = Field(foreign_key="dispute.id", index=True)
    name: str
    estimated_value: float = Field(default=0.0)
    indivisible: bool = Field(default=True)
    # When True the good can be split into fractions and the engine may award a
    # fraction of it to each party to balance their entitlement-weighted shares
    # (reducing the cash transfer). "indivisible" is kept for backward
    # compatibility; divisible == not indivisible.
    divisible: bool = Field(default=False)
    meta: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))

    dispute: Optional[Dispute] = Relationship(back_populates="goods")
    preferences: List["Preference"] = Relationship(back_populates="good")

class Preference(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("dispute_id", "agent_id", "good_id", name="uq_preference"),)
    id: Optional[int] = Field(default=None, primary_key=True)
    dispute_id: int = Field(foreign_key="dispute.id", index=True)
    agent_id: int = Field(foreign_key="disputeagent.id", index=True)
    good_id: int = Field(foreign_key="good.id", index=True)
    method: str  # bids|rates
    bid_amount: Optional[float] = None
    stars: Optional[int] = None
    created_at: datetime = Field(default_factory=utcnow)

    agent: Optional[DisputeAgent] = Relationship(back_populates="preferences")
    good: Optional[Good] = Relationship(back_populates="preferences")

class Strategy(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("dispute_id", "agent_id", name="uq_strategy"),)
    id: Optional[int] = Field(default=None, primary_key=True)
    dispute_id: int = Field(foreign_key="dispute.id", index=True)
    agent_id: int = Field(foreign_key="disputeagent.id", index=True)
    text: str = Field(default="")
    created_at: datetime = Field(default_factory=utcnow)

class AllocationProposal(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    dispute_id: int = Field(foreign_key="dispute.id", index=True)
    algorithm_version: str = Field(default="v0")
    inputs_hash: str = Field(index=True)
    outputs: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    metrics: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    explanation: str = Field(default="")
    created_at: datetime = Field(default_factory=utcnow)

    dispute: Optional[Dispute] = Relationship(back_populates="proposals")
    acceptances: List["Acceptance"] = Relationship(back_populates="proposal")

class Acceptance(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("proposal_id", "agent_id", name="uq_acceptance"),)
    id: Optional[int] = Field(default=None, primary_key=True)
    proposal_id: int = Field(foreign_key="allocationproposal.id", index=True)
    agent_id: int = Field(foreign_key="disputeagent.id", index=True)
    accepted: bool = Field(default=False)
    comment: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)

    proposal: Optional[AllocationProposal] = Relationship(back_populates="acceptances")
    agent: Optional[DisputeAgent] = Relationship(back_populates="acceptances")


class ReconciliationResponse(SQLModel, table=True):
    """A party's response, during the reconciliation step, to a disputed item.

    Two kinds of item:
      * kind="value"  -> the parties valued the same good differently. The party
                         agrees (or not) to reconcile by taking the mean.
      * kind="omitted" -> the good was acknowledged by another party but not this
                         one. The party may (optionally) state their own valuation
                         and/or a star preference for it.
    """
    __table_args__ = (UniqueConstraint("dispute_id", "agent_id", "good_id", "kind", name="uq_reconciliation"),)
    id: Optional[int] = Field(default=None, primary_key=True)
    dispute_id: int = Field(foreign_key="dispute.id", index=True)
    agent_id: int = Field(foreign_key="disputeagent.id", index=True)
    good_id: int = Field(foreign_key="good.id", index=True)
    kind: str = Field(index=True)  # value | omitted
    agreed: Optional[bool] = None         # for kind="value": agree to take the mean
    value_amount: Optional[float] = None  # for kind="omitted": the party's valuation
    stars: Optional[int] = None           # for kind="omitted": optional preference
    created_at: datetime = Field(default_factory=utcnow)


class MediationSlot(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    dispute_id: int = Field(foreign_key="dispute.id", index=True)
    when: datetime = Field(default_factory=utcnow)
    agreed_agent_ids: List[int] = Field(default_factory=list, sa_column=Column(JSON))
    confirmed: bool = Field(default=False, index=True)
    proposed_by_agent_id: Optional[int] = Field(default=None, foreign_key="disputeagent.id")
    created_at: datetime = Field(default_factory=utcnow)

class Report(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    dispute_id: int = Field(foreign_key="dispute.id", index=True, unique=True)
    pdf_path: str
    report_hash: str = Field(index=True)
    created_at: datetime = Field(default_factory=utcnow)


class DocumentSignature(SQLModel, table=True):
    """Append-only integrity ledger for every generated document.

    GDPR / EU accountability: generated PDFs are personal-data records, so each
    generation is recorded here as an immutable signature that lets tampering be
    detected. Unlike `Report` (upserted, keeps only the latest render), this
    table keeps ONE ROW PER GENERATION and is never updated or deleted in normal
    operation.

    Two levels of integrity:
      • file_hash  — SHA-256 of the produced file, so any change to the file on
        disk is detectable (SHA-256, not MD5: MD5 is collision-broken and not
        acceptable for tamper-evidence).
      • chain_hash — links each row to the previous one (per dispute), making the
        LEDGER itself tamper-evident: a row cannot be altered or removed without
        breaking every later chain_hash.
    """
    id: Optional[int] = Field(default=None, primary_key=True)
    dispute_id: int = Field(foreign_key="dispute.id", index=True)
    filename: str = Field(index=True)
    kind: str  # "proposal" | "final"
    algorithm: str = Field(default="sha256")
    file_hash: str = Field(index=True)
    file_size: int = 0
    generated_by_id: Optional[int] = Field(default=None, foreign_key="user.id")
    generated_at: datetime = Field(default_factory=utcnow, index=True)
    # Tamper-evident hash chain (per dispute).
    prev_chain_hash: Optional[str] = Field(default=None)
    chain_hash: str = Field(index=True)

class MailMessage(SQLModel, table=True):
    """Persistent cache of fetched inbox messages (admin Mail tab).

    'Fetch Mail' syncs from IMAP into this table: new messages are inserted with
    their full body, existing ones have their read/removed status updated, and
    rows are NEVER erased — a message removed from the server is marked
    status='deleted' but its record is kept.
    """
    __table_args__ = (UniqueConstraint("account", "mailbox", "message_id", name="uq_mail_message"),)
    id: Optional[int] = Field(default=None, primary_key=True)
    account: str = Field(default="info", index=True)  # which mailbox account: info|support
    message_id: str = Field(index=True)              # RFC Message-ID (or synthetic)
    mailbox: str = Field(default="INBOX", index=True)
    imap_uid: Optional[str] = Field(default=None)
    from_addr: str = Field(default="")
    to_addr: str = Field(default="")
    cc: Optional[str] = Field(default=None)
    subject: str = Field(default="")
    date_str: str = Field(default="")                # original Date header
    body: str = Field(default="")
    attachments_json: str = Field(default="[]")      # JSON: [{filename, content_type}]
    seen: bool = Field(default=False, index=True)    # read / unread
    status: str = Field(default="inbox", index=True)  # inbox|archived|spam|deleted
    fetched_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class MailAttachmentRow(SQLModel, table=True):
    """Stored bytes of an email attachment (base64), so it can be downloaded
    from the admin Mail tab without another IMAP round-trip."""
    id: Optional[int] = Field(default=None, primary_key=True)
    mail_id: int = Field(foreign_key="mailmessage.id", index=True)
    filename: str = Field(default="attachment")
    content_type: str = Field(default="application/octet-stream")
    size: int = Field(default=0)
    content_b64: str = Field(default="")  # base64 of the raw file bytes


class UserActivity(SQLModel, table=True):
    """Per-user security/activity log (self-contained auth).

    Captures logins, registrations, verifications and password resets with a
    timestamp and client IP, so the admin panel can show who did what and when.
    """
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    email: Optional[str] = Field(default=None, index=True)
    event: str = Field(index=True)  # login|login_failed|register|verify_email|password_reset|logout|token_refresh
    ip: Optional[str] = Field(default=None)
    user_agent: Optional[str] = Field(default=None)
    detail: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=utcnow, index=True)


class AuditEvent(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    dispute_id: Optional[int] = Field(default=None, foreign_key="dispute.id", index=True)
    actor_user_id: Optional[int] = Field(default=None, index=True)
    event_type: str = Field(index=True)
    payload: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=utcnow)

    dispute: Optional[Dispute] = Relationship(back_populates="audit_events")



class Notification(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    dispute_id: Optional[int] = Field(default=None, foreign_key="dispute.id", index=True)
    type: str = Field(index=True)
    payload: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    read: bool = Field(default=False, index=True)
    created_at: datetime = Field(default_factory=utcnow)


class AppMetric(SQLModel, table=True):
    __tablename__ = "app_metric"
    id: Optional[int] = Field(default=None, primary_key=True)
    key: str = Field(index=True, unique=True)
    value: int = Field(default=0)
    updated_at: datetime = Field(default_factory=utcnow)



class DisputeDocument(SQLModel, table=True):
    """A file attached to a dispute as evidence (deed, valuation, etc.)."""
    __tablename__ = "dispute_document"
    id: Optional[int] = Field(default=None, primary_key=True)
    dispute_id: int = Field(foreign_key="dispute.id", index=True)
    uploaded_by_user_id: Optional[int] = Field(default=None, foreign_key="user.id")
    filename: str = Field(default="")          # original filename (display)
    stored_path: str = Field(default="")        # path on disk
    content_type: str = Field(default="application/octet-stream")
    size_bytes: int = Field(default=0)
    created_at: datetime = Field(default_factory=utcnow)


class MediatorNote(SQLModel, table=True):
    """A private note authored by a mediator on a dispute. Visible only to
    mediators and the owner/admin — never to ordinary parties."""
    __tablename__ = "mediator_note"
    id: Optional[int] = Field(default=None, primary_key=True)
    dispute_id: int = Field(foreign_key="dispute.id", index=True)
    author_user_id: Optional[int] = Field(default=None, foreign_key="user.id")
    author_name: str = Field(default="")
    body: str = Field(default="")
    created_at: datetime = Field(default_factory=utcnow)


# ── Knowledge Base (RAG) ─────────────────────────────────────────────────────
# Admin-uploaded documents, split into chunks, used to ground the chatbot.
# Three sections: "workflow" (CREA3 process), "past_cases" (past dispute cases),
# "legal_statutes" (country law). Retrieval prefers embeddings (FAISS) and
# degrades to BM25 when embeddings are unavailable.

KB_SECTIONS = ("workflow", "past_cases", "legal_statutes")


class KbDocument(SQLModel, table=True):
    """A single uploaded knowledge-base document (original text is kept)."""
    __tablename__ = "kb_document"
    id: Optional[int] = Field(default=None, primary_key=True)
    section: str = Field(index=True)                 # one of KB_SECTIONS
    filename: str = Field(default="")
    content_type: str = Field(default="text/plain")
    size: int = Field(default=0)                      # bytes of the original upload
    text: str = Field(default="")                     # extracted plain text
    chunk_count: int = Field(default=0)
    indexed: bool = Field(default=False, index=True)  # embeddings computed?
    seeded: bool = Field(default=False)               # auto-generated (e.g. workflow doc)
    uploaded_at: datetime = Field(default_factory=utcnow, index=True)


class KbChunk(SQLModel, table=True):
    """A chunk of a KbDocument, with an optional stored embedding (JSON floats)."""
    __tablename__ = "kb_chunk"
    id: Optional[int] = Field(default=None, primary_key=True)
    doc_id: int = Field(foreign_key="kb_document.id", index=True)
    section: str = Field(index=True)
    ordinal: int = Field(default=0)
    text: str = Field(default="")
    embedding_json: Optional[str] = Field(default=None)  # JSON list[float] or None


class KbIndexConfig(SQLModel, table=True):
    """Per-section retrieval configuration chosen by the admin."""
    __tablename__ = "kb_index_config"
    id: Optional[int] = Field(default=None, primary_key=True)
    section: str = Field(index=True, unique=True)
    engine: str = Field(default="faiss")             # faiss|bm25|hybrid
    preset: str = Field(default="balanced")          # optimal|balanced|creative|custom
    params_json: str = Field(default="{}")           # JSON of tuned params
    updated_at: datetime = Field(default_factory=utcnow)


# ── Per-user chat history ────────────────────────────────────────────────────
# Each user's assistant conversations, shown in a sidebar. Voice artifacts
# (recorded audio + spoken answer) are attached per message in later steps.

class ChatSession(SQLModel, table=True):
    __tablename__ = "chat_session"
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    title: str = Field(default="New chat")
    created_at: datetime = Field(default_factory=utcnow, index=True)
    updated_at: datetime = Field(default_factory=utcnow, index=True)


class ChatMessage(SQLModel, table=True):
    __tablename__ = "chat_message"
    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: int = Field(foreign_key="chat_session.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    role: str = Field(default="user")                # user|bot
    text: str = Field(default="")
    intent: Optional[str] = Field(default=None)       # workflow|past_cases|legal_statutes
    # True when the answer came from the external hosted model because the local
    # legal AI service was unavailable — persisted so the "External model" chip
    # renders consistently when a session is reopened.
    fallback: bool = Field(default=False)
    sources_json: str = Field(default="[]")           # JSON list[str] of KB source filenames
    files_json: str = Field(default="[]")             # JSON list[str] of attached filenames
    transcript: Optional[str] = Field(default=None)   # STT transcript when input was voice
    audio_in_b64: Optional[str] = Field(default=None)   # base64 of the user's recorded audio
    audio_in_mime: Optional[str] = Field(default=None)
    audio_out_b64: Optional[str] = Field(default=None)  # base64 TTS audio of a bot answer
    audio_mime: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=utcnow, index=True)


class AssistantQueryLog(SQLModel, table=True):
    """One row per user question to any assistant — powers the admin Stats tab.

    Logged for both the public chatbot (channel='public', user_id=None) and the
    in-app assistant (channel='inapp'), tagged with the classified intent so we
    can chart usage by channel, by type, and per user over time.
    """
    __tablename__ = "assistant_query_log"
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=utcnow, index=True)
    user_id: Optional[int] = Field(default=None, index=True)   # None for anonymous public
    username: str = Field(default="")                          # display snapshot
    channel: str = Field(default="inapp", index=True)          # public | inapp
    intent: Optional[str] = Field(default=None, index=True)    # workflow|legal_statutes|past_cases|public
    lang: Optional[str] = Field(default=None)


class WhatIfAnalysis(SQLModel, table=True):
    """A stored 'What if …' scenario analysis for a dispute (per user).

    agree/disagree are pre-generated once and reused; 'differ' rows are the
    user's custom scenarios, kept as a history. Generation runs in the
    background, so `status` moves generating -> done|error.
    """
    __tablename__ = "what_if_analysis"
    id: Optional[int] = Field(default=None, primary_key=True)
    dispute_id: int = Field(foreign_key="dispute.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    scenario: str = Field(default="agree", index=True)  # agree|disagree|differ
    title: str = Field(default="")                       # button label or custom scenario text
    question: str = Field(default="")                    # the prompt sent to the model
    answer: str = Field(default="")
    status: str = Field(default="generating", index=True)  # generating|done|error
    created_at: datetime = Field(default_factory=utcnow, index=True)
    updated_at: datetime = Field(default_factory=utcnow)
