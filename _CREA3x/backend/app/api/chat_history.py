"""Per-user chat history: sessions + messages for the assistant sidebar.

All routes are scoped to the authenticated user — a session can only ever be
read, renamed or deleted by its owner. The assistant's /ask endpoint persists
each turn here via the helpers below.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from .deps import get_current_user
from ..db import get_session
from ..models import ChatSession, ChatMessage, User, SourceRef

router = APIRouter(prefix="/api/assistant/sessions", tags=["assistant-history"])


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ── persistence helpers (used by assistant.assistant_ask) ────────────────────
def _title_from(text: str) -> str:
    t = " ".join((text or "").split())
    return (t[:57] + "…") if len(t) > 60 else (t or "New chat")


def get_or_create_session(session: Session, user: User, session_id: int | None,
                          first_question: str) -> ChatSession:
    """Return the user's session by id (ownership enforced), or create a new one."""
    if session_id is not None:
        sess = session.get(ChatSession, session_id)
        if sess and sess.user_id == user.id:
            return sess
    sess = ChatSession(user_id=user.id, title=_title_from(first_question))
    session.add(sess)
    session.commit()
    session.refresh(sess)
    return sess


def save_message(session: Session, sess: ChatSession, user: User, role: str, text: str,
                 *, intent: str | None = None, sources: list | None = None,
                 files: list[str] | None = None, transcript: str | None = None,
                 audio_in_b64: str | None = None, audio_in_mime: str | None = None) -> ChatMessage:
    msg = ChatMessage(
        session_id=sess.id, user_id=user.id, role=role, text=text, intent=intent,
        sources_json=json.dumps(sources or []), files_json=json.dumps(files or []),
        transcript=transcript, audio_in_b64=audio_in_b64, audio_in_mime=audio_in_mime,
    )
    session.add(msg)
    sess.updated_at = _now()
    session.add(sess)
    session.commit()
    session.refresh(msg)
    return msg


# ── schemas ──────────────────────────────────────────────────────────────────
class SessionOut(BaseModel):
    id: int
    title: str
    created_at: str
    updated_at: str
    message_count: int


class MessageOut(BaseModel):
    id: int
    role: str
    text: str
    intent: str | None = None
    sources: list[SourceRef] = Field(default_factory=list)
    files: list[str] = Field(default_factory=list)
    has_audio: bool = False       # bot answer has stored TTS audio
    has_audio_in: bool = False    # user message has stored recorded audio
    transcript: str | None = None
    created_at: str


class SessionDetailOut(BaseModel):
    id: int
    title: str
    messages: list[MessageOut]


class RenameIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)


def _session_out(session: Session, s: ChatSession) -> SessionOut:
    count = len(session.exec(select(ChatMessage.id).where(ChatMessage.session_id == s.id)).all())
    return SessionOut(
        id=s.id, title=s.title, message_count=count,
        created_at=s.created_at.isoformat() if s.created_at else "",
        updated_at=s.updated_at.isoformat() if s.updated_at else "",
    )


def _owned(session: Session, sid: int, user: User) -> ChatSession:
    s = session.get(ChatSession, sid)
    if not s or s.user_id != user.id:
        raise HTTPException(status_code=404, detail="Chat not found.")
    return s


# ── routes ───────────────────────────────────────────────────────────────────
@router.get("", response_model=list[SessionOut])
def list_sessions(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    rows = session.exec(
        select(ChatSession).where(ChatSession.user_id == user.id).order_by(ChatSession.updated_at.desc())
    ).all()
    return [_session_out(session, s) for s in rows]


@router.get("/{sid}", response_model=SessionDetailOut)
def get_session_detail(sid: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    s = _owned(session, sid, user)
    msgs = session.exec(
        select(ChatMessage).where(ChatMessage.session_id == sid).order_by(ChatMessage.created_at, ChatMessage.id)
    ).all()
    out = []
    for m in msgs:
        try:
            raw_sources = json.loads(m.sources_json or "[]")
        except Exception:
            raw_sources = []
        # Legacy rows stored bare filename strings; normalize to {id, name}.
        sources = [{"id": None, "name": s} if isinstance(s, str) else s for s in raw_sources]
        try:
            files = json.loads(m.files_json or "[]")
        except Exception:
            files = []
        out.append(MessageOut(
            id=m.id, role=m.role, text=m.text, intent=m.intent, sources=sources, files=files,
            has_audio=bool(m.audio_out_b64), has_audio_in=bool(m.audio_in_b64), transcript=m.transcript,
            created_at=m.created_at.isoformat() if m.created_at else "",
        ))
    return SessionDetailOut(id=s.id, title=s.title, messages=out)


@router.patch("/{sid}", response_model=SessionOut)
def rename_session(sid: int, body: RenameIn, user: User = Depends(get_current_user),
                   session: Session = Depends(get_session)):
    s = _owned(session, sid, user)
    s.title = body.title.strip() or s.title
    s.updated_at = _now()
    session.add(s)
    session.commit()
    session.refresh(s)
    return _session_out(session, s)


@router.delete("/{sid}")
def delete_session(sid: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    s = _owned(session, sid, user)
    for m in session.exec(select(ChatMessage).where(ChatMessage.session_id == sid)).all():
        session.delete(m)
    session.delete(s)
    session.commit()
    return {"ok": True}


@router.get("/{sid}/messages/{mid}/audio")
def message_audio(sid: int, mid: int, kind: str = "out", user: User = Depends(get_current_user),
                  session: Session = Depends(get_session)):
    """Return stored audio for a message (base64). kind=out (TTS) or in (recording)."""
    _owned(session, sid, user)
    m = session.get(ChatMessage, mid)
    if not m or m.session_id != sid:
        raise HTTPException(status_code=404, detail="Message not found.")
    if kind == "in":
        if not m.audio_in_b64:
            raise HTTPException(status_code=404, detail="No recording for this message.")
        return {"audio_b64": m.audio_in_b64, "mime": m.audio_in_mime or "audio/webm"}
    if not m.audio_out_b64:
        raise HTTPException(status_code=404, detail="No audio for this message.")
    return {"audio_b64": m.audio_out_b64, "mime": m.audio_mime or "audio/mpeg"}
