from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .deps import get_current_user
from ..core.config import settings
from ..core.email import _send_email
from ..models import User

router = APIRouter(prefix="/api/support", tags=["support"])


class SupportRequestIn(BaseModel):
    subject: str = Field(min_length=1, max_length=200)
    message: str = Field(min_length=1, max_length=8000)


@router.post("")
def create_support_request(payload: SupportRequestIn, user: User = Depends(get_current_user)):
    """Deliver an in-app support request to the project's support mailbox.

    Falls back to the configured sender address when no dedicated support
    mailbox is set, so the message is never silently dropped.
    """
    to_email = (settings.support_email or settings.smtp_from or "").strip()
    if not to_email:
        raise HTTPException(status_code=503, detail="Support mailbox is not configured.")

    subject = f"[CREA3 Support] {payload.subject.strip()}"
    body = (
        "A support request was submitted from the CREA3 platform.\n\n"
        "FROM\n"
        f"  - Name: {user.username}\n"
        f"  - Email: {user.email}\n"
        f"  - Role: {user.role}\n"
        f"  - User ID: {user.id}\n\n"
        "SUBJECT\n"
        f"  {payload.subject.strip()}\n\n"
        "MESSAGE\n"
        f"{payload.message.strip()}\n\n"
        "—\n"
        "Reply directly to the requester at the email address above.\n"
    )

    try:
        _send_email(to_email=to_email, subject=subject, body_text=body)
    except Exception as exc:  # SMTP unreachable / misconfigured
        raise HTTPException(status_code=502, detail=f"Could not send the support email: {exc}")

    return {"ok": True}
