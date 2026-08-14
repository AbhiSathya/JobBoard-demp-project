import pytest

from tests.conftest import auth_headers, register


@pytest.fixture()
def candidate_token(client):
    resp = register(client, email="c@example.com", role="candidate")
    return resp.json()["access_token"]


@pytest.fixture()
def admin_token(client):
    resp = register(client, email="a@example.com", role="admin", company_name="Acme")
    return resp.json()["access_token"]


def full_profile(**overrides):
    payload = {
        "name": "Jordan Lee",
        "headline": "Backend engineer",
        "years_experience": 5,
        "skills": ["Python", "FastAPI", "PostgreSQL"],
        "education": [
            {"institution": "State University", "degree": "BSc", "field": "Computer Science", "graduation_year": 2019}
        ],
        "projects": [{"name": "Order Service", "summary": "Rebuilt the checkout API.", "skills": ["Python"]}],
        "preferred_location": "Remote",
        "preferred_role_type": "Full-time",
        "domain_interests": ["Healthcare", "Fintech"],
    }
    payload.update(overrides)
    return payload


def test_get_profile_404_when_missing(client, candidate_token):
    resp = client.get("/api/candidates/me/profile", headers=auth_headers(candidate_token))
    assert resp.status_code == 404


def test_create_profile(client, candidate_token):
    resp = client.put("/api/candidates/me/profile", json=full_profile(), headers=auth_headers(candidate_token))
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "Jordan Lee"
    assert body["skills"] == ["Python", "FastAPI", "PostgreSQL"]


def test_update_profile_is_idempotent_upsert(client, candidate_token):
    client.put("/api/candidates/me/profile", json=full_profile(), headers=auth_headers(candidate_token))
    resp = client.put(
        "/api/candidates/me/profile",
        json=full_profile(name="Jordan Lee-Smith"),
        headers=auth_headers(candidate_token),
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Jordan Lee-Smith"

    fetched = client.get("/api/candidates/me/profile", headers=auth_headers(candidate_token))
    assert fetched.json()["name"] == "Jordan Lee-Smith"


def test_admin_cannot_write_candidate_profile(client, admin_token):
    resp = client.put("/api/candidates/me/profile", json=full_profile(), headers=auth_headers(admin_token))
    assert resp.status_code == 403


def test_profile_requires_name(client, candidate_token):
    payload = full_profile()
    payload["name"] = ""
    resp = client.put("/api/candidates/me/profile", json=payload, headers=auth_headers(candidate_token))
    assert resp.status_code == 422


def test_large_skill_list_accepted(client, candidate_token):
    payload = full_profile(skills=[f"skill-{i}" for i in range(100)])
    resp = client.put("/api/candidates/me/profile", json=payload, headers=auth_headers(candidate_token))
    assert resp.status_code == 200
    assert len(resp.json()["skills"]) == 100


def test_oversized_skill_list_rejected(client, candidate_token):
    payload = full_profile(skills=[f"skill-{i}" for i in range(101)])
    resp = client.put("/api/candidates/me/profile", json=payload, headers=auth_headers(candidate_token))
    assert resp.status_code == 422


def test_long_project_summary_accepted(client, candidate_token):
    payload = full_profile(projects=[{"name": "Big Project", "summary": "x" * 4000, "skills": []}])
    resp = client.put("/api/candidates/me/profile", json=payload, headers=auth_headers(candidate_token))
    assert resp.status_code == 200
