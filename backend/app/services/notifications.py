"""Every outbound email the product sends, in one place so the wording stays consistent.

Each function builds an `Email` and hands it to `send_email`. Callers schedule these on
FastAPI's `BackgroundTasks`, so a slow SMTP server can never delay an API response.
"""

import functools
import logging
from collections.abc import Callable
from html import escape
from typing import TypeVar

from app.core.config import get_settings
from app.core.mail import Email, send_email
from app.models.application import Application
from app.models.enums import ApplicationStatus, Role
from app.models.job import Job
from app.models.user import User

logger = logging.getLogger("jobboard.notifications")

F = TypeVar("F", bound=Callable[..., None])


def best_effort(fn: F) -> F:
    """Never let a notification break the thing that triggered it.

    These run on FastAPI BackgroundTasks, i.e. after the response is already on its way.
    An exception there is invisible to the caller but noisy in the server, so it is logged
    and swallowed — a missing email is worth less than a broken signup.
    """

    @functools.wraps(fn)
    def wrapper(*args, **kwargs) -> None:
        try:
            fn(*args, **kwargs)
        except Exception:
            logger.exception("Notification %s failed", fn.__name__)

    return wrapper  # type: ignore[return-value]


def _link(path: str) -> str:
    return f"{get_settings().frontend_base_url.rstrip('/')}{path}"


@best_effort
def send_verification(user: User, token: str) -> None:
    send_email(
        Email(
            to=user.email,
            subject="Verify your Job Board email",
            heading="Confirm your email address",
            body=(
                "<p>Thanks for signing up. Confirm this address to finish setting up your "
                "account — the link is good for 24 hours.</p>"
            ),
            cta_label="Verify email",
            cta_url=_link(f"/verify-email?token={token}"),
        )
    )


@best_effort
def send_welcome(user: User) -> None:
    if user.role == Role.admin:
        body = (
            "<p>Your company account is ready. Post your first role and candidates will "
            "start showing up in your dashboard.</p>"
        )
        cta_label, cta_path = "Post a job", "/admin/jobs/new"
    else:
        body = (
            "<p>Your account is verified. Fill in your profile next — it's what the AI "
            "matcher uses to rank roles for you, and you'll need it to apply.</p>"
        )
        cta_label, cta_path = "Complete your profile", "/profile"

    send_email(
        Email(
            to=user.email,
            subject="Welcome to Job Board",
            heading="You're all set",
            body=body,
            cta_label=cta_label,
            cta_url=_link(cta_path),
        )
    )


@best_effort
def send_password_reset(user: User, token: str) -> None:
    send_email(
        Email(
            to=user.email,
            subject="Reset your Job Board password",
            heading="Reset your password",
            body=(
                "<p>Use the link below to choose a new password. It expires in 30 minutes "
                "and can only be used once.</p>"
                "<p>If you didn't ask for this, nothing has changed and you can ignore "
                "this email.</p>"
            ),
            cta_label="Choose a new password",
            cta_url=_link(f"/reset-password?token={token}"),
        )
    )


@best_effort
def send_password_changed(user: User) -> None:
    send_email(
        Email(
            to=user.email,
            subject="Your Job Board password was changed",
            heading="Your password was changed",
            body=(
                "<p>This is a confirmation that the password on your account was just "
                "changed, and every device signed in with the old password was signed out.</p>"
                "<p>If this wasn't you, reset your password immediately.</p>"
            ),
            cta_label="Reset password",
            cta_url=_link("/forgot-password"),
        )
    )


@best_effort
def send_application_received(candidate: User, job: Job) -> None:
    send_email(
        Email(
            to=candidate.email,
            subject=f"Application sent — {job.title}",
            heading="Your application is in",
            body=(
                f"<p>We've sent your profile to <strong>{escape(job.company_name)}</strong> "
                f"for the <strong>{escape(job.title)}</strong> role in "
                f"{escape(job.location)}.</p>"
                "<p>You'll get an email here as soon as the hiring team moves it forward.</p>"
            ),
            cta_label="View your applications",
            cta_url=_link("/applications"),
        )
    )


@best_effort
def send_new_applicant(admin: User, job: Job, application: Application) -> None:
    snapshot = application.profile_snapshot or {}
    name = escape(str(snapshot.get("name") or "A candidate"))
    headline = snapshot.get("headline")
    skills = [str(s) for s in (snapshot.get("skills") or [])][:8]

    detail = f"<p><strong>{name}</strong>"
    if headline:
        detail += f" — {escape(str(headline))}"
    detail += "</p>"
    if skills:
        detail += f"<p>Skills: {escape(', '.join(skills))}</p>"

    send_email(
        Email(
            to=admin.email,
            subject=f"New application — {job.title}",
            heading=f"New application for {job.title}",
            body=detail,
            cta_label="Review application",
            cta_url=_link(f"/admin/jobs/{job.id}/applications"),
        )
    )


@best_effort
def send_status_change(candidate: User, job: Job, status: ApplicationStatus) -> None:
    if status == ApplicationStatus.shortlisted:
        subject = f"You've been shortlisted — {job.title}"
        heading = "You've been shortlisted"
        body = (
            f"<p><strong>{escape(job.company_name)}</strong> has shortlisted you for the "
            f"<strong>{escape(job.title)}</strong> role. They'll be in touch about next steps.</p>"
        )
    else:
        subject = f"Update on your application — {job.title}"
        heading = "Update on your application"
        body = (
            f"<p><strong>{escape(job.company_name)}</strong> has decided not to move forward "
            f"with your application for <strong>{escape(job.title)}</strong> this time.</p>"
            "<p>There are other open roles that match your profile.</p>"
        )

    send_email(
        Email(
            to=candidate.email,
            subject=subject,
            heading=heading,
            body=body,
            cta_label="Browse open roles",
            cta_url=_link("/jobs"),
        )
    )
