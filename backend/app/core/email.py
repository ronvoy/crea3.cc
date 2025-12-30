from __future__ import annotations

import smtplib
from email.mime.text import MIMEText

from .config import settings


def send_verification_email(to_email: str, token: str) -> None:
    """Send a simple email containing the verification token.

    This is best-effort; callers may catch exceptions to avoid blocking the request.
    """

    host = settings.smtp_host
    port = settings.smtp_port
    if not host:
        raise RuntimeError("SMTP_HOST is not configured")

    subject = "CREA - Email verification"
    body = (
        "Thank you for registering.\n\n"
        "To verify your email address, copy and paste the token below in the verification page:\n\n"
        f"{token}\n\n"
        "If you did not request this, you can ignore this message."
    )

    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from
    msg["To"] = to_email

    if settings.smtp_ssl:
        server: smtplib.SMTP = smtplib.SMTP_SSL(host, port)
    else:
        server = smtplib.SMTP(host, port)

    try:
        server.ehlo()
        if settings.smtp_tls and not settings.smtp_ssl:
            server.starttls()
            server.ehlo()
        if settings.smtp_user:
            server.login(settings.smtp_user, settings.smtp_pass)
        server.sendmail(settings.smtp_from, [to_email], msg.as_string())
    finally:
        try:
            server.quit()
        except Exception:
            pass
