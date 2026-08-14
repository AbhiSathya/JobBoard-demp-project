import pytest

from tests.conftest import auth_headers, register


@pytest.fixture()
def admin_token(client):
    return register(client, email="admin@acme.com", role="admin", company_name="Acme").json()["access_token"]


@pytest.fixture()
def candidate_token(client):
    return register(client, email="c@example.com", role="candidate").json()["access_token"]


def make_job(client, token, **overrides):
    payload = {
        "title": "Backend Engineer",
        "description": "Build APIs.",
        "required_skills": ["Python"],
        "experience_level": "mid",
        "location": "Berlin",
    }
    payload.update(overrides)
    return client.post("/api/jobs", json=payload, headers=auth_headers(token)).json()


def make_profile(client, token, **overrides):
    payload = {
        "name": "Jordan Lee",
        "skills": ["Python"],
        "education": [],
        "projects": [],
        "domain_interests": [],
    }
    payload.update(overrides)
    return client.put("/api/candidates/me/profile", json=payload, headers=auth_headers(token))


def test_apply_without_profile_rejected(client, admin_token, candidate_token):
    job = make_job(client, admin_token)
    resp = client.post("/api/applications", json={"job_id": job["id"]}, headers=auth_headers(candidate_token))
    assert resp.status_code == 409
    assert resp.json()["error"]["details"] == ["profile_required"]


def test_apply_success(client, admin_token, candidate_token):
    job = make_job(client, admin_token)
    make_profile(client, candidate_token)
    resp = client.post(
        "/api/applications",
        json={"job_id": job["id"], "cover_note": "Excited to apply."},
        headers=auth_headers(candidate_token),
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "applied"
    assert body["profile_snapshot"]["name"] == "Jordan Lee"


def test_apply_to_missing_job_404(client, candidate_token):
    make_profile(client, candidate_token)
    resp = client.post("/api/applications", json={"job_id": 999}, headers=auth_headers(candidate_token))
    assert resp.status_code == 404


def test_apply_to_closed_job_rejected(client, admin_token, candidate_token):
    job = make_job(client, admin_token)
    client.patch(
        f"/api/jobs/{job['id']}/status", json={"status": "closed"}, headers=auth_headers(admin_token)
    )
    make_profile(client, candidate_token)
    resp = client.post("/api/applications", json={"job_id": job["id"]}, headers=auth_headers(candidate_token))
    assert resp.status_code == 409


def test_duplicate_application_rejected(client, admin_token, candidate_token):
    job = make_job(client, admin_token)
    make_profile(client, candidate_token)
    client.post("/api/applications", json={"job_id": job["id"]}, headers=auth_headers(candidate_token))
    resp = client.post("/api/applications", json={"job_id": job["id"]}, headers=auth_headers(candidate_token))
    assert resp.status_code == 409


def test_my_applications_list(client, admin_token, candidate_token):
    job = make_job(client, admin_token)
    make_profile(client, candidate_token)
    client.post("/api/applications", json={"job_id": job["id"]}, headers=auth_headers(candidate_token))
    resp = client.get("/api/applications/me", headers=auth_headers(candidate_token))
    assert resp.status_code == 200
    assert resp.json()["total"] == 1
    assert len(resp.json()["items"]) == 1


def test_admin_views_job_applications(client, admin_token, candidate_token):
    job = make_job(client, admin_token)
    make_profile(client, candidate_token)
    client.post("/api/applications", json={"job_id": job["id"]}, headers=auth_headers(candidate_token))
    resp = client.get(f"/api/jobs/{job['id']}/applications", headers=auth_headers(admin_token))
    assert resp.status_code == 200
    assert resp.json()["total"] == 1
    assert len(resp.json()["items"]) == 1


def test_non_owner_admin_cannot_view_applications(client, admin_token, candidate_token):
    other_admin = register(client, email="other@globex.com", role="admin", company_name="Globex").json()[
        "access_token"
    ]
    job = make_job(client, admin_token)
    make_profile(client, candidate_token)
    client.post("/api/applications", json={"job_id": job["id"]}, headers=auth_headers(candidate_token))
    resp = client.get(f"/api/jobs/{job['id']}/applications", headers=auth_headers(other_admin))
    assert resp.status_code == 403


def test_valid_status_transition(client, admin_token, candidate_token):
    job = make_job(client, admin_token)
    make_profile(client, candidate_token)
    app_resp = client.post(
        "/api/applications", json={"job_id": job["id"]}, headers=auth_headers(candidate_token)
    ).json()
    resp = client.patch(
        f"/api/applications/{app_resp['id']}/status",
        json={"status": "shortlisted"},
        headers=auth_headers(admin_token),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "shortlisted"


def test_invalid_status_transition_rejected(client, admin_token, candidate_token):
    job = make_job(client, admin_token)
    make_profile(client, candidate_token)
    app_resp = client.post(
        "/api/applications", json={"job_id": job["id"]}, headers=auth_headers(candidate_token)
    ).json()
    client.patch(
        f"/api/applications/{app_resp['id']}/status",
        json={"status": "rejected"},
        headers=auth_headers(admin_token),
    )
    # rejected is terminal — moving back to shortlisted must fail
    resp = client.patch(
        f"/api/applications/{app_resp['id']}/status",
        json={"status": "shortlisted"},
        headers=auth_headers(admin_token),
    )
    assert resp.status_code == 409


def test_invalid_status_value_rejected(client, admin_token, candidate_token):
    job = make_job(client, admin_token)
    make_profile(client, candidate_token)
    app_resp = client.post(
        "/api/applications", json={"job_id": job["id"]}, headers=auth_headers(candidate_token)
    ).json()
    resp = client.patch(
        f"/api/applications/{app_resp['id']}/status",
        json={"status": "in_review"},
        headers=auth_headers(admin_token),
    )
    assert resp.status_code == 422


def test_status_update_on_missing_application_404(client, admin_token):
    resp = client.patch(
        "/api/applications/999/status", json={"status": "rejected"}, headers=auth_headers(admin_token)
    )
    assert resp.status_code == 404
