import jwt
import pytest

from app.api.auth import REFRESH_COOKIE
from app.core.config import get_settings
from app.core.security import create_token, decode_token
from app.models.enums import Role
from tests.conftest import auth_headers, register


def test_token_types_are_not_interchangeable():
    """A password-reset link must never work as a login, and vice versa."""
    reset = create_token("reset", 1)
    with pytest.raises(jwt.InvalidTokenError):
        decode_token(reset, "access")

    access = create_token("access", 1, role=Role.candidate)
    with pytest.raises(jwt.InvalidTokenError):
        decode_token(access, "refresh")


def test_access_token_carries_role_and_version():
    payload = decode_token(create_token("access", 42, role=Role.admin, token_version=3), "access")
    assert payload["sub"] == "42"
    assert payload["role"] == "admin"
    assert payload["ver"] == 3


def test_login_sets_httponly_refresh_cookie(client):
    register(client)
    resp = client.post("/api/auth/login", json={"email": "candidate@example.com", "password": "password123"})
    assert resp.status_code == 200
    cookie = resp.cookies.jar._cookies["testserver.local"]["/api/auth"][REFRESH_COOKIE]
    assert cookie.has_nonstandard_attr("HttpOnly")


def test_refresh_issues_a_new_access_token(client):
    register(client)
    client.post("/api/auth/login", json={"email": "candidate@example.com", "password": "password123"})
    resp = client.post("/api/auth/refresh")
    assert resp.status_code == 200
    assert resp.json()["access_token"]
    # The new token actually works.
    me = client.get("/api/auth/me", headers=auth_headers(resp.json()["access_token"]))
    assert me.status_code == 200


def test_refresh_without_cookie_is_401(client):
    assert client.post("/api/auth/refresh").status_code == 401


def test_logout_clears_the_cookie_and_refresh_then_fails(client):
    register(client)
    client.post("/api/auth/login", json={"email": "candidate@example.com", "password": "password123"})
    assert client.post("/api/auth/logout").status_code == 200
    assert client.post("/api/auth/refresh").status_code == 401


def test_expired_token_is_rejected(client, db_session):
    from app.models.user import User

    register(client)
    user = db_session.query(User).filter(User.email == "candidate@example.com").first()
    settings = get_settings()
    stale = jwt.encode(
        {"sub": str(user.id), "typ": "access", "ver": 0, "exp": 1},
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )
    assert client.get("/api/auth/me", headers=auth_headers(stale)).status_code == 401


def test_password_change_invalidates_existing_access_tokens(client, db_session):
    from app.models.user import User

    token = register(client).json()["access_token"]
    assert client.get("/api/auth/me", headers=auth_headers(token)).status_code == 200

    user = db_session.query(User).filter(User.email == "candidate@example.com").first()
    reset = create_token("reset", user.id, token_version=user.token_version)
    client.post("/api/auth/reset-password", json={"token": reset, "password": "brand-new-pass"})

    # Same token, now stale: its `ver` no longer matches the user's.
    assert client.get("/api/auth/me", headers=auth_headers(token)).status_code == 401


def test_garbage_token_is_rejected(client):
    assert client.get("/api/auth/me", headers=auth_headers("not-a-jwt")).status_code == 401


def test_missing_token_is_rejected(client):
    assert client.get("/api/auth/me").status_code == 401
