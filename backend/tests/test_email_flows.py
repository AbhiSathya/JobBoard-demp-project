"""Verification, password reset, and the transactional emails around applications.

`outbox` (see conftest) captures messages instead of sending them, so these assert on
*which* message was queued to *whom* — the product behaviour — rather than on SMTP.
"""

from app.core.security import create_token
from app.models.user import User
from tests.conftest import auth_headers, register


def subjects(outbox) -> list[str]:
    return [email.subject for email in outbox]


def user_id(db, email="candidate@example.com") -> int:
    return db.query(User).filter(User.email == email).first().id


# --- verification -----------------------------------------------------------------


def test_registering_queues_a_verification_email(client, outbox):
    register(client, verified=False)
    assert subjects(outbox) == ["Verify your Job Board email"]
    assert outbox[0].to == "candidate@example.com"
    assert "/verify-email?token=" in outbox[0].cta_url


def test_verifying_marks_the_user_and_sends_a_welcome(client, outbox, db_session):
    register(client, verified=False)
    token = create_token("verify", user_id(db_session))
    resp = client.post("/api/auth/verify-email", json={"token": token})

    assert resp.status_code == 200
    assert resp.json()["is_verified"] is True
    assert "Welcome to Job Board" in subjects(outbox)


def test_welcome_email_is_role_appropriate(client, outbox, db_session):
    register(client, email="hr@acme.com", role="admin", company_name="Acme", verified=False)
    client.post(
        "/api/auth/verify-email", json={"token": create_token("verify", user_id(db_session, "hr@acme.com"))}
    )
    welcome = next(e for e in outbox if e.subject == "Welcome to Job Board")
    assert welcome.cta_label == "Post a job"


def test_verifying_twice_does_not_resend_the_welcome(client, outbox, db_session):
    register(client, verified=False)
    token = create_token("verify", user_id(db_session))
    client.post("/api/auth/verify-email", json={"token": token})
    client.post("/api/auth/verify-email", json={"token": token})
    assert subjects(outbox).count("Welcome to Job Board") == 1


def test_invalid_verification_token_is_401(client):
    assert client.post("/api/auth/verify-email", json={"token": "nope"}).status_code == 401


def test_resend_verification_is_silent_for_unknown_addresses(client, outbox):
    resp = client.post("/api/auth/resend-verification", json={"email": "nobody@example.com"})
    assert resp.status_code == 200
    assert outbox == []


def test_resend_verification_does_nothing_for_already_verified_users(client, outbox):
    register(client)  # verified
    outbox.clear()
    client.post("/api/auth/resend-verification", json={"email": "candidate@example.com"})
    assert outbox == []


# --- the verification gate --------------------------------------------------------


def test_unverified_candidate_cannot_apply(client, db_session):
    admin = register(client, email="hr@acme.com", role="admin", company_name="Acme").json()["access_token"]
    job = client.post(
        "/api/jobs",
        json={
            "title": "Backend Engineer",
            "description": "Build things.",
            "required_skills": ["Python"],
            "experience_level": "mid",
            "location": "Remote",
        },
        headers=auth_headers(admin),
    ).json()

    token = register(client, verified=False).json()["access_token"]
    client.put(
        "/api/candidates/me/profile",
        json={"name": "Ada", "skills": ["Python"]},
        headers=auth_headers(token),
    )
    resp = client.post("/api/applications", json={"job_id": job["id"]}, headers=auth_headers(token))
    assert resp.status_code == 403
    assert "email_not_verified" in resp.json()["error"]["details"]


def test_unverified_admin_cannot_post_a_job(client):
    token = register(client, email="hr@acme.com", role="admin", company_name="Acme", verified=False).json()[
        "access_token"
    ]
    resp = client.post(
        "/api/jobs",
        json={
            "title": "Backend Engineer",
            "description": "Build things.",
            "required_skills": ["Python"],
            "experience_level": "mid",
            "location": "Remote",
        },
        headers=auth_headers(token),
    )
    assert resp.status_code == 403


def test_unverified_user_can_still_browse(client):
    register(client, verified=False)
    assert client.get("/api/jobs").status_code == 200


# --- password reset ---------------------------------------------------------------


def test_forgot_password_sends_a_reset_link(client, outbox):
    register(client)
    outbox.clear()
    resp = client.post("/api/auth/forgot-password", json={"email": "candidate@example.com"})
    assert resp.status_code == 200
    assert subjects(outbox) == ["Reset your Job Board password"]
    assert "/reset-password?token=" in outbox[0].cta_url


def test_forgot_password_response_is_identical_for_unknown_addresses(client, outbox):
    register(client)
    known = client.post("/api/auth/forgot-password", json={"email": "candidate@example.com"})
    unknown = client.post("/api/auth/forgot-password", json={"email": "nobody@example.com"})
    # Same status and same body — this endpoint cannot be used to enumerate accounts.
    assert known.status_code == unknown.status_code == 200
    assert known.json() == unknown.json()
    assert all(e.to == "candidate@example.com" for e in outbox if "Reset" in e.subject)


def test_reset_password_changes_the_password_and_notifies(client, outbox, db_session):
    register(client)
    outbox.clear()
    token = create_token("reset", user_id(db_session))

    assert (
        client.post(
            "/api/auth/reset-password", json={"token": token, "password": "a-new-password"}
        ).status_code
        == 200
    )
    assert "Your Job Board password was changed" in subjects(outbox)

    assert (
        client.post(
            "/api/auth/login", json={"email": "candidate@example.com", "password": "password123"}
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/api/auth/login", json={"email": "candidate@example.com", "password": "a-new-password"}
        ).status_code
        == 200
    )


def test_reset_token_cannot_be_reused(client, db_session):
    register(client)
    token = create_token("reset", user_id(db_session))
    assert (
        client.post(
            "/api/auth/reset-password", json={"token": token, "password": "first-password"}
        ).status_code
        == 200
    )
    # The version bump from the first reset invalidates the token it was minted against.
    second = client.post("/api/auth/reset-password", json={"token": token, "password": "second-password"})
    assert second.status_code == 401


def test_reset_rejects_a_short_password(client, db_session):
    register(client)
    token = create_token("reset", user_id(db_session))
    assert (
        client.post("/api/auth/reset-password", json={"token": token, "password": "short"}).status_code == 422
    )


def test_reset_with_an_access_token_is_rejected(client):
    token = register(client).json()["access_token"]
    assert (
        client.post("/api/auth/reset-password", json={"token": token, "password": "long-enough"}).status_code
        == 401
    )


# --- application notifications ----------------------------------------------------


def _job_and_candidate(client):
    admin = register(client, email="hr@acme.com", role="admin", company_name="Acme").json()["access_token"]
    job = client.post(
        "/api/jobs",
        json={
            "title": "Backend Engineer",
            "description": "Build things.",
            "required_skills": ["Python"],
            "experience_level": "mid",
            "location": "Remote",
        },
        headers=auth_headers(admin),
    ).json()
    candidate = register(client).json()["access_token"]
    client.put(
        "/api/candidates/me/profile",
        json={"name": "Ada Lovelace", "skills": ["Python"], "headline": "Backend engineer"},
        headers=auth_headers(candidate),
    )
    return admin, candidate, job


def test_applying_emails_both_the_candidate_and_the_admin(client, outbox):
    admin, candidate, job = _job_and_candidate(client)
    outbox.clear()
    client.post("/api/applications", json={"job_id": job["id"]}, headers=auth_headers(candidate))

    by_recipient = {e.to: e for e in outbox}
    assert by_recipient["candidate@example.com"].subject == "Application sent — Backend Engineer"
    assert by_recipient["hr@acme.com"].subject == "New application — Backend Engineer"
    # The admin's notification is built from the snapshot, not from a live profile read.
    assert "Ada Lovelace" in by_recipient["hr@acme.com"].body


def test_shortlisting_emails_the_candidate(client, outbox):
    admin, candidate, job = _job_and_candidate(client)
    app_id = client.post(
        "/api/applications", json={"job_id": job["id"]}, headers=auth_headers(candidate)
    ).json()["id"]
    outbox.clear()

    client.patch(
        f"/api/applications/{app_id}/status", json={"status": "shortlisted"}, headers=auth_headers(admin)
    )
    assert subjects(outbox) == ["You've been shortlisted — Backend Engineer"]


def test_rejecting_emails_the_candidate_with_different_wording(client, outbox):
    admin, candidate, job = _job_and_candidate(client)
    app_id = client.post(
        "/api/applications", json={"job_id": job["id"]}, headers=auth_headers(candidate)
    ).json()["id"]
    outbox.clear()

    client.patch(
        f"/api/applications/{app_id}/status", json={"status": "rejected"}, headers=auth_headers(admin)
    )
    assert subjects(outbox) == ["Update on your application — Backend Engineer"]


def test_setting_the_same_status_twice_does_not_resend(client, outbox):
    admin, candidate, job = _job_and_candidate(client)
    app_id = client.post(
        "/api/applications", json={"job_id": job["id"]}, headers=auth_headers(candidate)
    ).json()["id"]
    client.patch(
        f"/api/applications/{app_id}/status", json={"status": "shortlisted"}, headers=auth_headers(admin)
    )
    outbox.clear()
    client.patch(
        f"/api/applications/{app_id}/status", json={"status": "shortlisted"}, headers=auth_headers(admin)
    )
    assert outbox == []


def test_a_dead_mail_server_does_not_fail_the_request(client, monkeypatch):
    """Mail is best-effort by design: an SMTP outage must not break signup."""

    def explode(*args, **kwargs):
        raise OSError("smtp is down")

    monkeypatch.setattr("app.services.notifications.send_email", explode)
    assert register(client, verified=False).status_code == 201
