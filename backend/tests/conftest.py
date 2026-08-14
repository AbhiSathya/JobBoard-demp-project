import os
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import get_settings
from app.core.db import Base, get_db
from app.core.mail import Email
from app.core.security import create_token
from app.main import app
from app.models.user import User

# Environment variables beat the .env file in pydantic-settings, so this guarantees the
# suite never reaches OpenRouter or an SMTP server even on a machine where both are
# configured. Tests that exercise the AI path do it with a fake transport.
os.environ["OPENROUTER_API_KEY"] = ""
os.environ["SMTP_HOST"] = ""
get_settings.cache_clear()


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def outbox(monkeypatch) -> list[Email]:
    """Capture outgoing mail instead of sending it.

    Patched at `app.core.mail.send_email` *and* at the name each notification function
    already imported, so tests assert on which message was queued to whom rather than on
    SMTP working.
    """
    sent: list[Email] = []

    def fake_send(email: Email, settings=None) -> None:
        sent.append(email)

    monkeypatch.setattr("app.core.mail.send_email", fake_send)
    monkeypatch.setattr("app.services.notifications.send_email", fake_send)
    return sent


@pytest.fixture()
def client(db_session, outbox):
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def register(
    client,
    email="candidate@example.com",
    password="password123",
    role="candidate",
    company_name=None,
    *,
    verified=True,
):
    """Register a user, verified by default.

    Verification goes through the real endpoint rather than poking the row directly, so
    every suite that leans on this helper is also, incidentally, exercising the verify
    flow. The email gate itself is tested explicitly in test_email_flows.py.
    """
    payload = {"email": email, "password": password, "role": role}
    if company_name:
        payload["company_name"] = company_name
    resp = client.post("/api/auth/register", json=payload)

    if verified and resp.status_code == 201:
        token = create_token("verify", resp.json()["user"]["id"], token_version=0)
        client.post("/api/auth/verify-email", json={"token": token})
    return resp


def verify_user(db, email: str) -> None:
    user = db.query(User).filter(User.email == email).first()
    user.email_verified_at = datetime.now(UTC)
    db.commit()


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}
