from tests.conftest import auth_headers, register


def test_register_candidate(client):
    resp = register(client, email="a@example.com", role="candidate")
    assert resp.status_code == 201
    body = resp.json()
    assert body["user"]["role"] == "candidate"
    assert "access_token" in body


def test_register_admin_requires_company_name(client):
    resp = client.post(
        "/api/auth/register",
        json={"email": "admin@example.com", "password": "password123", "role": "admin"},
    )
    assert resp.status_code == 422


def test_register_admin_with_company(client):
    resp = register(client, email="admin@example.com", role="admin", company_name="Acme")
    assert resp.status_code == 201
    assert resp.json()["user"]["company_name"] == "Acme"


def test_duplicate_email_rejected(client):
    register(client, email="dup@example.com")
    resp = register(client, email="dup@example.com")
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "conflict"


def test_login_success(client):
    register(client, email="login@example.com", password="password123")
    resp = client.post("/api/auth/login", json={"email": "login@example.com", "password": "password123"})
    assert resp.status_code == 200
    assert "access_token" in resp.json()


def test_login_wrong_password(client):
    register(client, email="wrong@example.com", password="password123")
    resp = client.post("/api/auth/login", json={"email": "wrong@example.com", "password": "nope12345"})
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "unauthorized"


def test_login_unknown_email(client):
    resp = client.post("/api/auth/login", json={"email": "nobody@example.com", "password": "password123"})
    assert resp.status_code == 401


def test_me_requires_token(client):
    resp = client.get("/api/auth/me")
    assert resp.status_code == 401


def test_me_with_valid_token(client):
    reg = register(client, email="me@example.com")
    token = reg.json()["access_token"]
    resp = client.get("/api/auth/me", headers=auth_headers(token))
    assert resp.status_code == 200
    assert resp.json()["email"] == "me@example.com"


def test_me_with_bad_token(client):
    resp = client.get("/api/auth/me", headers=auth_headers("not-a-real-token"))
    assert resp.status_code == 401
