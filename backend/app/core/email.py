from __future__ import annotations

import smtplib
from email.mime.text import MIMEText
from email.utils import formataddr

from .config import settings


def _send_email(*, to_email: str, subject: str, body_text: str) -> None:
    msg = MIMEText(body_text, "plain", "utf-8")
    msg["Subject"] = subject
    msg["From"] = formataddr((settings.smtp_from_name, settings.smtp_from))
    msg["To"] = to_email

    if settings.smtp_ssl:
        server = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=20)
    else:
        server = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20)

    try:
        server.ehlo()
        if settings.smtp_tls and not settings.smtp_ssl:
            server.starttls()
            server.ehlo()

        if settings.smtp_user and settings.smtp_pass:
            server.login(settings.smtp_user, settings.smtp_pass)

        server.send_message(msg)
    finally:
        try:
            server.quit()
        except Exception:
            pass


# Existing function (kept)
def send_verification_email(to_email: str, token: str) -> None:
    subject = "Verify your CREA3 email"
    body = f"Your verification token is:\n\n{token}\n\nPaste it in the app to verify."
    _send_email(to_email=to_email, subject=subject, body_text=body)


def _frontend_base() -> str:
    """Best-effort browser base URL for building links inside emails."""
    origins = settings.cors_list()
    return origins[0] if origins else "http://localhost:5173"


def send_verification_code_email(to_email: str, code: str) -> None:
    """Send the 6-digit account verification code (and a convenience link)."""
    link = f"{_frontend_base()}/verify-email?email={to_email}&code={code}"
    subject = "Your CREA3 verification code"
    body = (
        f"Welcome to CREA3!\n\n"
        f"Your verification code is: {code}\n\n"
        f"Enter this code in the app to activate your account. "
        f"The code expires shortly.\n\n"
        f"Or click this link to verify directly:\n{link}\n\n"
        f"If you did not create a CREA3 account, you can ignore this email.\n\n"
        f"— CREA3"
    )
    _send_email(to_email=to_email, subject=subject, body_text=body)


def send_password_reset_code_email(to_email: str, code: str) -> None:
    """Send the 6-digit password-reset code."""
    subject = "Your CREA3 password reset code"
    body = (
        f"We received a request to reset your CREA3 password.\n\n"
        f"Your password reset code is: {code}\n\n"
        f"Enter this code in the app, then choose a new password. "
        f"The code expires shortly.\n\n"
        f"If you did not request a password reset, you can ignore this email — "
        f"your password will stay the same.\n\n"
        f"— CREA3"
    )
    _send_email(to_email=to_email, subject=subject, body_text=body)


# NEW: dispute invitation email (custom)
def send_dispute_invitation_email(
    *,
    to_email: str,
    invited_name: str,
    invited_role: str,
    dispute_id: int,
    dispute_title: str,
    invited_by_name: str,
    invited_by_email: str,
    entitlement_share: float | None = None,
) -> None:
    link = settings.public_invite_link  # hardcoded default, overridable by env

    share_line = ""
    if entitlement_share is not None:
        share_line = f"- Quota di diritto: {entitlement_share}\n"

    subject = f"Invito CREA3 – Disputa #{dispute_id}: {dispute_title}"

    body = f"""Ciao {invited_name},

Sei stato/a invitato/a su CREA3 per risolvere una disputa.

DETTAGLI DISPUTA
- ID: {dispute_id}
- Titolo: {dispute_title}

RUOLO ASSEGNATO
- Ruolo: {invited_role}
{share_line}

CONTROPARTE / INVITANTE
- Nome: {invited_by_name}
- Email: {invited_by_email}

COME PROCEDERE
1) Apri questo link: {link}
2) Accedi oppure registrati usando ESATTAMENTE questa email: {to_email}
3) Dopo l’accesso vedrai un riquadro “Inviti in attesa” dove potrai:
   - Accettare la disputa
   - Rifiutare la disputa (con eventuale commento)

Grazie,
CREA3
"""
    _send_email(to_email=to_email, subject=subject, body_text=body)
