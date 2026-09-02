from __future__ import annotations

import os
import smtplib
from email.message import EmailMessage
from email.mime.text import MIMEText
from email.utils import formataddr

from .config import settings

# Public site links used in OUTBOUND emails. Recipients open these from their
# own inbox, so they must always point at the main public domain — never at a
# localhost / dev / tunnel address the deployment happens to run on. An explicit
# PUBLIC_INVITE_LINK / PUBLIC_REGISTER_LINK in .env still wins.
_MAIN_APP_LINK = "https://crea3.cc/app"
_MAIN_REGISTER_LINK = "https://crea3.cc/register"


def _public_links() -> tuple[str, str]:
    """(app_link, register_link) for emails: explicit env override or crea3.cc."""
    app_link = (os.getenv("PUBLIC_INVITE_LINK") or "").strip() or _MAIN_APP_LINK
    register_link = (os.getenv("PUBLIC_REGISTER_LINK") or "").strip() or _MAIN_REGISTER_LINK
    return app_link, register_link


def _deliver(msg) -> None:
    """Open an SMTP connection (per current settings) and send a prepared msg."""
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


def _send_email(*, to_email: str, subject: str, body_text: str) -> None:
    msg = MIMEText(body_text, "plain", "utf-8")
    msg["Subject"] = subject
    msg["From"] = formataddr((settings.smtp_from_name, settings.smtp_from))
    msg["To"] = to_email
    _deliver(msg)


def send_email_with_attachments(
    *,
    to_email: str,
    subject: str,
    body_text: str,
    attachments: list[tuple[str, str, bytes]] | None = None,
    from_email: str | None = None,
    from_name: str | None = None,
    reply_to: str | None = None,
) -> None:
    """Send a plain-text email with optional file attachments.

    attachments: list of (filename, content_type, data). from_email/from_name
    override the default SMTP sender (auth still uses the SMTP_* credentials).
    """
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = formataddr((from_name or settings.smtp_from_name, from_email or settings.smtp_from))
    msg["To"] = to_email
    if reply_to:
        msg["Reply-To"] = reply_to
    msg.set_content(body_text)

    for filename, content_type, data in attachments or []:
        maintype, _, subtype = (content_type or "application/octet-stream").partition("/")
        msg.add_attachment(data, maintype=maintype or "application", subtype=subtype or "octet-stream", filename=filename)

    _deliver(msg)


def send_verification_code_email(to_email: str, code: str) -> None:
    """Send the 6-digit email-verification code (alternative to the link)."""
    subject = "CREA3 — Your verification code"
    body = (
        "Dear User,\n\n"
        "Thank you for registering with the CREA3 platform.\n\n"
        f"Your 6-digit verification code is: {code}\n\n"
        "Enter this code on the verification page to activate your account. "
        "The code expires in 30 minutes.\n\n"
        "If you did not create a CREA3 account, please ignore this message.\n\n"
        "— CREA3"
    )
    _send_email(to_email=to_email, subject=subject, body_text=body)


def send_password_reset_code_email(to_email: str, code: str) -> None:
    """Send the 6-digit password-reset code (no URL — reliable delivery)."""
    subject = "CREA3 — Your password reset code"
    body = (
        "Dear User,\n\n"
        "We received a request to reset the password for your CREA3 account.\n\n"
        f"Your 6-digit password reset code is: {code}\n\n"
        "Enter this code on the reset-password page to choose a new password. "
        "The code expires in 15 minutes.\n\n"
        "If you did not request this, you can safely ignore this email — your "
        "password will not change.\n\n"
        "— CREA3"
    )
    _send_email(to_email=to_email, subject=subject, body_text=body)


# Existing function (kept)
def send_verification_email(to_email: str, token: str) -> None:
    subject = "CREA3 — Email verification"
    body = f"""Dear User,

Thank you for registering with the CREA3 platform.

To complete your registration and activate your account, please enter the
verification code below in the application:

    {token}

If you did not request this registration, you may disregard this message.

Kind regards,
The CREA3 Team
"""
    _send_email(to_email=to_email, subject=subject, body_text=body)


# Dispute invitation email
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
    # Always the public site (crea3.cc) unless PUBLIC_*_LINK is set explicitly —
    # settings.public_*_link can resolve to a localhost/dev address that the
    # invited person cannot open from their inbox.
    app_link, register_link = _public_links()

    share_line = ""
    if entitlement_share is not None:
        share_line = f"  - Entitlement share: {entitlement_share}\n"

    subject = f"CREA3 — Invitation to dispute #{dispute_id}: {dispute_title}"

    body = f"""Dear {invited_name},

You have been invited to take part in a dispute resolution procedure on the
CREA3 platform.

DISPUTE DETAILS
  - Reference: #{dispute_id}
  - Title: {dispute_title}

ASSIGNED ROLE
  - Role: {invited_role}
{share_line}
INVITING PARTY
  - Name: {invited_by_name}
  - Email: {invited_by_email}

HOW TO PROCEED
  1. If you do not yet have an account, please register here:
     {register_link}
     Please register using exactly this email address: {to_email}
  2. If you already have an account, sign in to the platform:
     {app_link}
  3. Once signed in, open the "Pending invitations" panel, where you may
     accept or decline this dispute (a comment may be added if you decline).

Should you have any questions, please contact the inviting party at the email
address shown above.

Kind regards,
The CREA3 Team
"""
    _send_email(to_email=to_email, subject=subject, body_text=body)


def send_meeting_reminder_email(
    *,
    to_email: str,
    participant_name: str,
    dispute_id: int,
    dispute_title: str,
    when_text: str,
    conference_url: str,
) -> None:
    """Notify a participant that a mediation meeting has been confirmed, including
    the link to join the video conference."""
    subject = f"CREA3 — Confirmed mediation meeting for dispute #{dispute_id}: {dispute_title}"
    body = f"""Dear {participant_name},

We are writing to confirm that a mediation meeting for your CREA3 dispute has
been scheduled.

DISPUTE
  - Reference: #{dispute_id}
  - Title: {dispute_title}

MEETING
  - Date and time: {when_text}

JOINING THE VIDEO CONFERENCE
  {conference_url}

Please open the link above at the scheduled time to join the session. You may
also join from the "Dispute Room" tab within the platform.

Kind regards,
The CREA3 Team
"""
    _send_email(to_email=to_email, subject=subject, body_text=body)
