from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlmodel import Session, select
from pathlib import Path
import uuid
import shutil

from ..db import get_session
from ..models import DisputeDocument, AuditEvent, User
from .deps import get_current_user, can_access_dispute

router = APIRouter(prefix="/api/disputes/{dispute_id}/documents", tags=["documents"])

DOC_DIR = Path("uploaded_documents")
DOC_DIR.mkdir(exist_ok=True)

MAX_BYTES = 10 * 1024 * 1024  # 10 MB per file
ALLOWED_EXT = {".pdf", ".png", ".jpg", ".jpeg", ".doc", ".docx", ".txt", ".csv", ".xlsx", ".odt"}


def _serialize(d: DisputeDocument) -> dict:
    return {
        "id": d.id,
        "filename": d.filename,
        "content_type": d.content_type,
        "size_bytes": d.size_bytes,
        "uploaded_by_user_id": d.uploaded_by_user_id,
        "created_at": d.created_at.isoformat() if d.created_at else "",
    }


@router.get("")
def list_documents(dispute_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    can_access_dispute(dispute_id, user, session)
    docs = session.exec(
        select(DisputeDocument).where(DisputeDocument.dispute_id == dispute_id).order_by(DisputeDocument.created_at.asc())
    ).all()
    return [_serialize(d) for d in docs]


@router.post("")
def upload_document(dispute_id: int, file: UploadFile = File(...), user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    can_access_dispute(dispute_id, user, session)
    name = file.filename or "file"
    ext = Path(name).suffix.lower()
    if ext and ext not in ALLOWED_EXT:
        raise HTTPException(status_code=400, detail=f"File type {ext} is not allowed.")

    stored_name = f"{dispute_id}_{uuid.uuid4().hex}{ext}"
    stored_path = DOC_DIR / stored_name
    size = 0
    with stored_path.open("wb") as out:
        while True:
            chunk = file.file.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > MAX_BYTES:
                out.close()
                stored_path.unlink(missing_ok=True)
                raise HTTPException(status_code=400, detail="File exceeds the 10 MB limit.")
            out.write(chunk)

    doc = DisputeDocument(
        dispute_id=dispute_id,
        uploaded_by_user_id=user.id,
        filename=name,
        stored_path=str(stored_path),
        content_type=file.content_type or "application/octet-stream",
        size_bytes=size,
    )
    session.add(doc)
    session.add(AuditEvent(dispute_id=dispute_id, actor_user_id=user.id, event_type="DocumentUploaded", payload={"filename": name}))
    session.commit()
    session.refresh(doc)
    return _serialize(doc)


@router.get("/{doc_id}/download")
def download_document(dispute_id: int, doc_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    can_access_dispute(dispute_id, user, session)
    doc = session.get(DisputeDocument, doc_id)
    if not doc or doc.dispute_id != dispute_id:
        raise HTTPException(status_code=404, detail="Document not found")
    path = Path(doc.stored_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="File missing")
    return FileResponse(str(path), media_type=doc.content_type, filename=doc.filename)


@router.delete("/{doc_id}")
def delete_document(dispute_id: int, doc_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    can_access_dispute(dispute_id, user, session)
    doc = session.get(DisputeDocument, doc_id)
    if not doc or doc.dispute_id != dispute_id:
        raise HTTPException(status_code=404, detail="Document not found")
    # Only the uploader or an admin may delete.
    if user.role != "admin" and doc.uploaded_by_user_id != user.id:
        raise HTTPException(status_code=403, detail="Only the uploader or an admin can delete this document.")
    try:
        Path(doc.stored_path).unlink(missing_ok=True)
    except Exception:
        pass
    session.delete(doc)
    session.add(AuditEvent(dispute_id=dispute_id, actor_user_id=user.id, event_type="DocumentDeleted", payload={"filename": doc.filename}))
    session.commit()
    return {"ok": True}
