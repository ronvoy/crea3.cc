"""Admin Knowledge Base API (RAG document management).

Gated by the admin-panel JWT (admin.require_admin_panel), same as the other
admin tabs. Lets the admin upload documents into three sections, choose the
indexing engine + preset, list/delete documents, and reindex.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from pydantic import BaseModel
from sqlmodel import Session, select

from .admin import require_admin_panel
from ..db import get_session
from ..core import knowledge
from ..models import KbDocument, KB_SECTIONS

router = APIRouter(prefix="/api/admin/kb", tags=["admin-knowledge"])


def _check_section(section: str) -> None:
    if section not in KB_SECTIONS:
        raise HTTPException(status_code=400, detail=f"Unknown section '{section}'.")


class KbDocOut(BaseModel):
    id: int
    section: str
    filename: str
    content_type: str
    size: int
    chunk_count: int
    indexed: bool
    seeded: bool
    uploaded_at: str


class KbConfigIn(BaseModel):
    section: str
    engine: str
    preset: str
    params: dict | None = None


def _doc_out(d: KbDocument) -> KbDocOut:
    return KbDocOut(
        id=d.id, section=d.section, filename=d.filename, content_type=d.content_type,
        size=d.size, chunk_count=d.chunk_count, indexed=d.indexed, seeded=d.seeded,
        uploaded_at=d.uploaded_at.isoformat() if d.uploaded_at else "",
    )


@router.get("/status")
def kb_status(_admin: str = Depends(require_admin_panel), session: Session = Depends(get_session)):
    return knowledge.status(session)


@router.get("/config")
def kb_get_config(section: str = Query(...), _admin: str = Depends(require_admin_panel),
                  session: Session = Depends(get_session)):
    _check_section(section)
    cfg = knowledge.get_config(session, section)
    return {
        "section": section, "engine": cfg.engine, "preset": cfg.preset,
        "params": knowledge.config_params(cfg),
        "presets": knowledge.PRESETS, "engines": list(knowledge.ENGINES),
        "embeddings_available": knowledge.embeddings.is_configured(),
    }


@router.post("/config")
def kb_set_config(body: KbConfigIn, _admin: str = Depends(require_admin_panel),
                  session: Session = Depends(get_session)):
    _check_section(body.section)
    cfg = knowledge.set_config(session, body.section, body.engine, body.preset, body.params)
    return {"section": body.section, "engine": cfg.engine, "preset": cfg.preset,
            "params": knowledge.config_params(cfg)}


@router.get("/documents", response_model=list[KbDocOut])
def kb_documents(section: str = Query(...), _admin: str = Depends(require_admin_panel),
                 session: Session = Depends(get_session)):
    _check_section(section)
    docs = session.exec(
        select(KbDocument).where(KbDocument.section == section).order_by(KbDocument.uploaded_at.desc())
    ).all()
    return [_doc_out(d) for d in docs]


@router.post("/upload")
async def kb_upload(
    section: str = Form(...),
    files: list[UploadFile] = File(...),
    _admin: str = Depends(require_admin_panel),
    session: Session = Depends(get_session),
):
    """Single or bulk upload into one section. Each file is parsed, chunked and
    (if a Gemini key is set) embedded, then stored."""
    _check_section(section)
    results = []
    for f in files:
        data = await f.read()
        if not data:
            continue
        doc = knowledge.add_document(session, section, f.filename or "document",
                                     f.content_type or "text/plain", data)
        results.append(_doc_out(doc))
    if not results:
        raise HTTPException(status_code=400, detail="No usable files were uploaded.")
    return {"uploaded": len(results), "documents": results,
            "embeddings_available": knowledge.embeddings.is_configured()}


@router.delete("/documents/{doc_id}")
def kb_delete_document(doc_id: int, _admin: str = Depends(require_admin_panel),
                       session: Session = Depends(get_session)):
    if not knowledge.delete_document(session, doc_id):
        raise HTTPException(status_code=404, detail="Document not found.")
    return {"ok": True}


@router.post("/reindex")
def kb_reindex(section: str = Query(...), _admin: str = Depends(require_admin_panel),
               session: Session = Depends(get_session)):
    _check_section(section)
    embedded = knowledge.reindex(session, section)
    return {"section": section, "chunks_embedded": embedded,
            "embeddings_available": knowledge.embeddings.is_configured()}
