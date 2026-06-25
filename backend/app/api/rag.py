"""Legal RAG API (see rag-plan.md).

Auth model
    * Document/index *management* (/config, /documents*, /indexes*) is gated behind
      a simple admin login (ADMIN/ADMIN by default — see ADMIN_USER/ADMIN_PASS in
      .env) so only an admin curates the knowledge base at /rag.
    * /query and /general require a normal authenticated app user (the logged-in
      chat bubble — agents/mediators).
    * /public-chat is open (the landing-page legal assistant).
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlmodel import Session, select

from ..core.config import settings
from ..db import get_session
from ..models import RagChunk, RagDocument, RagIndex, User
from ..services import rag_service as rag
from .admin import require_admin, _create_admin_token
from .deps import get_current_user

router = APIRouter(prefix="/api/rag", tags=["rag"])


# ── admin auth ─────────────────────────────────────────────────────────────────

class AdminLoginIn(BaseModel):
    username: str
    password: str


class AdminTokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in_seconds: int


@router.post("/admin/login", response_model=AdminTokenOut)
def admin_login(body: AdminLoginIn) -> AdminTokenOut:
    if body.username != settings.admin_user or body.password != settings.admin_pass:
        raise HTTPException(status_code=401, detail="Invalid admin credentials")
    token, expires_in = _create_admin_token(body.username)
    return AdminTokenOut(access_token=token, expires_in_seconds=expires_in)


# ── config (admin) ─────────────────────────────────────────────────────────────

@router.get("/config")
def get_config(_admin: dict = Depends(require_admin)) -> Dict[str, Any]:
    return rag.available_config()


# ── documents (admin) ──────────────────────────────────────────────────────────

def _doc_row(d: RagDocument) -> Dict[str, Any]:
    return {
        "id": d.id,
        "title": d.title,
        "doc_type": d.doc_type,
        "dispute_id": d.dispute_id,
        "filename": d.filename,
        "jurisdiction": d.jurisdiction,
        "lang": d.lang,
        "notes": d.notes,
        "char_count": d.char_count,
        "n_chunks": d.n_chunks,
        "status": d.status,
        "created_at": d.created_at.isoformat() if d.created_at else None,
    }


@router.post("/documents")
async def upload_document(
    file: UploadFile = File(...),
    doc_type: str = Form("statute"),
    title: Optional[str] = Form(None),
    jurisdiction: str = Form(""),
    lang: str = Form("en"),
    notes: str = Form(""),
    dispute_id: Optional[int] = Form(None),
    chunk_size: int = Form(rag.DEFAULT_PARAMS["chunk_size"]),
    chunk_overlap: int = Form(rag.DEFAULT_PARAMS["chunk_overlap"]),
    _admin: dict = Depends(require_admin),
    session: Session = Depends(get_session),
) -> Dict[str, Any]:
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")

    try:
        text = rag.parse_file(file.filename or "", file.content_type or "", data)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Could not parse file: {exc}")

    if not text.strip():
        raise HTTPException(status_code=400, detail="No extractable text in file")

    doc = RagDocument(
        title=(title or (file.filename or "Untitled")).strip(),
        doc_type=(doc_type or "statute").strip().lower(),
        dispute_id=dispute_id,
        filename=file.filename or "",
        content_type=file.content_type or "",
        jurisdiction=jurisdiction.strip(),
        lang=(lang or "en").strip(),
        notes=notes.strip(),
        raw_text=text,
        char_count=len(text),
        uploaded_by_id=None,
        status="parsed",
    )
    session.add(doc)
    session.commit()
    session.refresh(doc)

    chunks = rag.chunk_text(text, chunk_size=chunk_size, chunk_overlap=chunk_overlap)
    for c in chunks:
        session.add(RagChunk(document_id=doc.id, ordinal=c["meta"].get("ordinal", 0), text=c["text"], meta=c["meta"]))
    doc.n_chunks = len(chunks)
    session.add(doc)
    session.commit()
    session.refresh(doc)

    return {"document": _doc_row(doc)}


@router.get("/documents")
def list_documents(
    doc_type: Optional[str] = None,
    _admin: dict = Depends(require_admin),
    session: Session = Depends(get_session),
) -> Dict[str, Any]:
    q = select(RagDocument).order_by(RagDocument.created_at.desc())
    if doc_type:
        q = q.where(RagDocument.doc_type == doc_type)
    docs = session.exec(q).all()
    return {"documents": [_doc_row(d) for d in docs]}


@router.get("/documents/{doc_id}")
def get_document(
    doc_id: int,
    _admin: dict = Depends(require_admin),
    session: Session = Depends(get_session),
) -> Dict[str, Any]:
    doc = session.get(RagDocument, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    chunks = session.exec(
        select(RagChunk).where(RagChunk.document_id == doc_id).order_by(RagChunk.ordinal)
    ).all()
    return {
        "document": _doc_row(doc),
        "chunks": [
            {"id": c.id, "ordinal": c.ordinal, "text": c.text, "meta": c.meta} for c in chunks[:50]
        ],
    }


class DocumentUpdate(BaseModel):
    title: Optional[str] = None
    doc_type: Optional[str] = None
    jurisdiction: Optional[str] = None
    lang: Optional[str] = None
    notes: Optional[str] = None
    dispute_id: Optional[int] = None


@router.patch("/documents/{doc_id}")
def update_document(
    doc_id: int,
    body: DocumentUpdate,
    _admin: dict = Depends(require_admin),
    session: Session = Depends(get_session),
) -> Dict[str, Any]:
    doc = session.get(RagDocument, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(doc, field, value)
    session.add(doc)
    session.commit()
    session.refresh(doc)
    return {"document": _doc_row(doc)}


@router.delete("/documents/{doc_id}")
def delete_document(
    doc_id: int,
    _admin: dict = Depends(require_admin),
    session: Session = Depends(get_session),
) -> Dict[str, Any]:
    doc = session.get(RagDocument, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    for c in session.exec(select(RagChunk).where(RagChunk.document_id == doc_id)).all():
        session.delete(c)
    session.delete(doc)
    session.commit()
    return {"ok": True}


# ── indexes (admin) ────────────────────────────────────────────────────────────

def _index_row(ix: RagIndex) -> Dict[str, Any]:
    return {
        "id": ix.id,
        "name": ix.name,
        "embedding_model": ix.embedding_model,
        "pipeline": ix.pipeline,
        "index_type": ix.index_type,
        "params": ix.params,
        "dims": ix.dims,
        "n_vectors": ix.n_vectors,
        "n_documents": ix.n_documents,
        "status": ix.status,
        "message": ix.message,
        "created_at": ix.created_at.isoformat() if ix.created_at else None,
    }


class BuildIndexIn(BaseModel):
    name: Optional[str] = None
    embedding_model: str = "hashing"
    pipeline: str = "hybrid"
    index_type: str = "flat"
    doc_type: Optional[str] = None
    params: Dict[str, Any] = {}


@router.post("/indexes")
def build_index(
    body: BuildIndexIn,
    _admin: dict = Depends(require_admin),
    session: Session = Depends(get_session),
) -> Dict[str, Any]:
    q = select(RagChunk)
    doc_ids: List[int] = []
    if body.doc_type:
        docs = session.exec(select(RagDocument).where(RagDocument.doc_type == body.doc_type)).all()
        doc_ids = [d.id for d in docs]
        if not doc_ids:
            raise HTTPException(status_code=400, detail="No documents of that type to index")
        q = q.where(RagChunk.document_id.in_(doc_ids))
    chunks = session.exec(q).all()
    if not chunks:
        raise HTTPException(status_code=400, detail="No chunks to index. Upload documents first.")

    params = {**rag.DEFAULT_PARAMS, **(body.params or {})}

    texts = [c.text for c in chunks]
    try:
        vecs = rag.embed(body.embedding_model, texts)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Embedding failed: {exc}")

    n_docs = len({c.document_id for c in chunks})
    for c, v in zip(chunks, vecs):
        emb = dict(c.embeddings or {})
        emb[body.embedding_model] = [round(float(x), 6) for x in v.tolist()]
        c.embeddings = emb
        session.add(c)
    if doc_ids:
        for d in session.exec(select(RagDocument).where(RagDocument.id.in_(doc_ids))).all():
            d.status = "indexed"
            session.add(d)
    else:
        for d in session.exec(select(RagDocument)).all():
            d.status = "indexed"
            session.add(d)

    ix = RagIndex(
        name=body.name or f"{body.pipeline}:{body.embedding_model}:{body.index_type}",
        embedding_model=body.embedding_model,
        pipeline=body.pipeline,
        index_type=body.index_type,
        params=params,
        dims=int(vecs.shape[1]) if vecs.size else 0,
        n_vectors=len(chunks),
        n_documents=n_docs,
        status="ready",
        message="Built successfully",
    )
    session.add(ix)
    session.commit()
    session.refresh(ix)
    return {"index": _index_row(ix)}


@router.get("/indexes")
def list_indexes(
    _admin: dict = Depends(require_admin),
    session: Session = Depends(get_session),
) -> Dict[str, Any]:
    rows = session.exec(select(RagIndex).order_by(RagIndex.created_at.desc())).all()
    return {"indexes": [_index_row(r) for r in rows]}


@router.delete("/indexes/{index_id}")
def delete_index(
    index_id: int,
    _admin: dict = Depends(require_admin),
    session: Session = Depends(get_session),
) -> Dict[str, Any]:
    ix = session.get(RagIndex, index_id)
    if not ix:
        raise HTTPException(status_code=404, detail="Index not found")
    session.delete(ix)
    session.commit()
    return {"ok": True}


# ── query (authenticated app users) ─────────────────────────────────────────────

class QueryIn(BaseModel):
    query: str
    index_id: Optional[int] = None
    embedding_model: Optional[str] = None
    pipeline: Optional[str] = None
    index_type: Optional[str] = None
    doc_type: Optional[str] = None
    dispute_id: Optional[int] = None
    mode: str = "auto"
    generate: bool = True
    params: Dict[str, Any] = {}


def _run_query(body: QueryIn, session: Session) -> Dict[str, Any]:
    q = (body.query or "").strip()
    if not q:
        raise HTTPException(status_code=400, detail="Empty query")

    model_id = body.embedding_model or "hashing"
    pipeline = body.pipeline or "hybrid"
    index_type = body.index_type or "flat"
    params = {**rag.DEFAULT_PARAMS, **(body.params or {})}

    if body.index_id:
        ix = session.get(RagIndex, body.index_id)
        if ix:
            model_id = body.embedding_model or ix.embedding_model
            pipeline = body.pipeline or ix.pipeline
            index_type = body.index_type or ix.index_type
            params = {**ix.params, **params}

    doc_type = body.doc_type
    if body.mode == "statutes":
        doc_type = "statute"
    elif body.mode == "cases":
        doc_type = "case"

    cq = select(RagChunk)
    docs_q = select(RagDocument)
    if doc_type:
        docs_q = docs_q.where(RagDocument.doc_type == doc_type)
    if body.dispute_id is not None:
        docs_q = docs_q.where(RagDocument.dispute_id == body.dispute_id)
    docs = {d.id: d for d in session.exec(docs_q).all()}
    if doc_type or body.dispute_id is not None:
        if not docs:
            return {"answer": rag.generate_answer(q, [])["answer"], "citations": [], "contexts": [], "generator": "fallback"}
        cq = cq.where(RagChunk.document_id.in_(list(docs.keys())))

    chunks = session.exec(cq).all()
    if not chunks and not docs:
        docs = {d.id: d for d in session.exec(select(RagDocument)).all()}

    chunk_dicts: List[Dict[str, Any]] = []
    for c in chunks:
        d = docs.get(c.document_id) or session.get(RagDocument, c.document_id)
        cached = (c.embeddings or {}).get(model_id)
        chunk_dicts.append(
            {
                "text": c.text,
                "vector": cached,
                "meta": c.meta or {},
                "document_id": c.document_id,
                "source_doc": d.title if d else "source",
                "doc_type": d.doc_type if d else "",
            }
        )

    contexts = rag.retrieve(
        q, chunk_dicts, model_id=model_id, pipeline=pipeline, index_type=index_type, params=params
    )

    if not body.generate:
        return {"contexts": contexts, "answer": None, "citations": [], "generator": None}

    result = rag.generate_answer(q, contexts, mode=body.mode)
    result["contexts"] = contexts
    result["retrieval"] = {"model": model_id, "pipeline": pipeline, "index_type": index_type, "n_candidates": len(chunk_dicts)}
    return result


@router.post("/query")
def query(
    body: QueryIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Dict[str, Any]:
    return _run_query(body, session)


class GeneralIn(BaseModel):
    query: str
    history: List[Dict[str, str]] = []


@router.post("/general")
def general(
    body: GeneralIn,
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    q = (body.query or "").strip()
    if not q:
        raise HTTPException(status_code=400, detail="Empty query")
    return rag.general_chat(q, history=body.history)


# ── public landing chatbot (no auth) ───────────────────────────────────────────

@router.post("/public-chat")
def public_chat(body: GeneralIn) -> Dict[str, Any]:
    q = (body.query or "").strip()
    if not q:
        raise HTTPException(status_code=400, detail="Empty query")
    return rag.general_chat(q, history=body.history)
