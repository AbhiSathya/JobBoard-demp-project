"""Outbound email over stdlib SMTP.

No third-party mail library: `smtplib` + `email.message.EmailMessage` already do SMTP
with STARTTLS and multipart text/HTML, so adding a dependency would buy nothing and cost
the cross-platform install guarantee.

If SMTP_HOST is unset the message is written to the log instead of sent. That is what
makes every email flow demoable and testable on a laptop with no mail account — the
verification link is right there in `backend/logs/jobboard-<date>.log`.
"""

import logging
import smtplib
from dataclasses import dataclass
from email.message import EmailMessage
from html import escape

from app.core.config import Settings, get_settings

logger = logging.getLogger("jobboard.mail")


@dataclass
class Email:
    to: str
    subject: str
    heading: str
    body: str
    cta_label: str | None = None
    cta_url: str | None = None


_HTML_SHELL = """\
<!doctype html>
<html><body style="margin:0;padding:32px;background:#f6f7f9;
  font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#14161a">
  <table role="presentation" width="100%" style="max-width:520px;margin:0 auto;
    background:#ffffff;border:1px solid #e3e6ea;border-collapse:collapse">
    <tr><td style="padding:28px 32px">
      <p style="margin:0 0 20px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;
        color:#697180">Job Board</p>
      <h1 style="margin:0 0 14px;font-size:20px;font-weight:600">{heading}</h1>
      <div style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#3c434f">{body}</div>
      {cta}
    </td></tr>
  </table>
  <p style="max-width:520px;margin:16px auto 0;font-size:12px;color:#8a919c">
    You received this because someone used this address on Job Board.
    If that wasn't you, you can ignore this message.</p>
</body></html>
"""

_CTA = (
    '<a href="{url}" style="display:inline-block;background:#2a5bd7;color:#ffffff;'
    'text-decoration:none;padding:11px 20px;font-size:14px;font-weight:500">{label}</a>'
    '<p style="margin:18px 0 0;font-size:12px;color:#8a919c;word-break:break-all">'
    "Or paste this link into your browser:<br>{url}</p>"
)


def render(email: Email) -> tuple[str, str]:
    """Returns (plain_text, html). Body may contain simple <p>/<strong> markup."""
    cta = _CTA.format(url=escape(email.cta_url), label=escape(email.cta_label)) if email.cta_url else ""
    html = _HTML_SHELL.format(heading=escape(email.heading), body=email.body, cta=cta)

    text = f"{email.heading}\n\n{_strip_tags(email.body)}"
    if email.cta_url:
        text += f"\n\n{email.cta_label}: {email.cta_url}"
    return text, html


def _strip_tags(markup: str) -> str:
    import re

    text = re.sub(r"</p>|<br\s*/?>", "\n", markup)
    return re.sub(r"<[^>]+>", "", text).strip()


def send_email(email: Email, settings: Settings | None = None) -> None:
    """Send one message. Never raises — a mail failure must not break an API request."""
    settings = settings or get_settings()
    text, html = render(email)

    if not settings.smtp_host:
        logger.info(
            "EMAIL (not sent — SMTP_HOST unset)\n  to: %s\n  subject: %s\n%s",
            email.to,
            email.subject,
            "\n".join(f"  | {line}" for line in text.splitlines()),
        )
        return

    message = EmailMessage()
    message["From"] = settings.smtp_from
    message["To"] = email.to
    message["Subject"] = email.subject
    message.set_content(text)
    message.add_alternative(html, subtype="html")

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as server:
            if settings.smtp_starttls:
                server.starttls()
            if settings.smtp_user and settings.smtp_password:
                server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(message)
    except Exception as exc:  # noqa: BLE001 — a dead mail server must never fail the request
        logger.error("Failed to send %r to %s: %s", email.subject, email.to, exc)
        return

    logger.info("Sent %r to %s", email.subject, email.to)
