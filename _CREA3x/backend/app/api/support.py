from __future__ import annotations

import os

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from .deps import get_current_user
from ..core.config import settings
from ..core.email import send_email_with_attachments
from ..models import User

router = APIRouter(prefix="/api/support", tags=["support"])

# Only these file types may be attached to a support request.
ALLOWED_EXT = {".png", ".jpg", ".jpeg", ".pdf", ".docx", ".txt"}
MAX_FILES = 8
MAX_FILE_BYTES = 10 * 1024 * 1024  # 10 MB each
_EXT_MIME = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".txt": "text/plain",
}


@router.post("")
async def create_support_request(
    subject: str = Form(..., min_length=1, max_length=200),
    message: str = Form(..., min_length=1, max_length=8000),
    files: list[UploadFile] = File(default=[]),
    user: User = Depends(get_current_user),
):
    """Deliver an in-app support request (with optional attachments) to the
    project's support mailbox.

    Sent TO settings.support_email FROM settings.support_from, using the SMTP
    credentials in .env. The subject is tagged with "[crea3.cc] ".
    """
    to_email = (settings.support_email or settings.smtp_from or "").strip()
    if not to_email:
        raise HTTPException(status_code=503, detail="Support mailbox is not configured.")

    # Validate + read attachments.
    if files and len(files) > MAX_FILES:
        raise HTTPException(status_code=400, detail=f"At most {MAX_FILES} files are allowed.")
    attachments: list[tuple[str, str, bytes]] = []
    for f in files or []:
        if not f or not f.filename:
            continue
        ext = os.path.splitext(f.filename)[1].lower()
        if ext not in ALLOWED_EXT:
            raise HTTPException(status_code=400, detail=f"File type not allowed: {f.filename}")
        data = await f.read()
        if len(data) > MAX_FILE_BYTES:
            raise HTTPException(status_code=400, detail=f"File too large (max 10 MB): {f.filename}")
        if data:
            attachments.append((f.filename, _EXT_MIME.get(ext, "application/octet-stream"), data))

    subject_clean = subject.strip()
    full_subject = f"[crea3.cc] {subject_clean}"
    body = (
        "A support request was submitted from the CREA3 platform.\n\n"
        "FROM\n"
        f"  - Name: {user.username}\n"
        f"  - Email: {user.email}\n"
        f"  - Role: {user.role}\n"
        f"  - User ID: {user.id}\n\n"
        "SUBJECT\n"
        f"  {subject_clean}\n\n"
        "MESSAGE\n"
        f"{message.strip()}\n\n"
        f"ATTACHMENTS: {len(attachments)}\n\n"
        "—\n"
        "Reply directly to the requester at the email address above.\n"
    )

    try:
        send_email_with_attachments(
            to_email=to_email,
            subject=full_subject,
            body_text=body,
            attachments=attachments,
            from_email=(settings.support_from or None),
            from_name=(settings.support_from_name or None),
            reply_to=user.email,
        )
    except Exception as exc:  # SMTP unreachable / misconfigured
        raise HTTPException(status_code=502, detail=f"Could not send the support email: {exc}")

    return {"ok": True}
