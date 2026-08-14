import pytest

from tests.conftest import auth_headers, register


@pytest.fixture()
def admin_token(client):
    resp = register(client, email="admin@acme.com", role="admin", company_name="Acme Corp")
    return resp.json()["access_token"]


@pytest.fixture()
def other_admin_token(client):
    resp = register(client, email="admin@globex.com", role="admin", company_name="Globex")
    return resp.json()["access_token"]


@pytest.fixture()
def candidate_token(client):
    resp = register(client, email="candidate@example.com", role="candidate")
    return resp.json()["access_token"]


def make_job(client, token, **overrides):
    payload = {
        "title": "Backend Engineer",
        "description": "Build APIs with FastAPI and PostgreSQL.",
        "required_skills": ["Python", "FastAPI", "PostgreSQL"],
        "experience_level": "mid",
        "location": "Berlin",
        "employment_type": "full_time",
        "domain": "healthcare",
    }
    payload.update(overrides)
    return client.post("/api/jobs", json=payload, headers=auth_headers(token))


def test_candidate_cannot_create_job(client, candidate_token):
    resp = make_job(client, candidate_token)
    assert resp.status_code == 403


def test_admin_creates_job(client, admin_token):
    resp = make_job(client, admin_token)
    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "open"
    assert body["company_name"] == "Acme Corp"


def test_get_job_detail(client, admin_token):
    created = make_job(client, admin_token).json()
    resp = client.get(f"/api/jobs/{created['id']}")
    assert resp.status_code == 200
    assert resp.json()["title"] == "Backend Engineer"


def test_get_missing_job_404(client):
    resp = client.get("/api/jobs/999")
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "not_found"


def test_browse_defaults_to_open_only(client, admin_token):
    open_job = make_job(client, admin_token, title="Open Role").json()
    closed_job = make_job(client, admin_token, title="Closed Role").json()
    client.patch(
        f"/api/jobs/{closed_job['id']}/status", json={"status": "closed"}, headers=auth_headers(admin_token)
    )

    resp = client.get("/api/jobs")
    titles = [j["title"] for j in resp.json()["items"]]
    assert "Open Role" in titles
    assert "Closed Role" not in titles


def test_filter_by_skill(client, admin_token):
    make_job(client, admin_token, title="Python Role", required_skills=["Python"])
    make_job(client, admin_token, title="Java Role", required_skills=["Java"])

    resp = client.get("/api/jobs", params={"skills": "python"})
    titles = [j["title"] for j in resp.json()["items"]]
    assert titles == ["Python Role"]


def test_filter_by_location(client, admin_token):
    make_job(client, admin_token, title="Berlin Role", location="Berlin")
    make_job(client, admin_token, title="Remote Role", location="Remote")

    resp = client.get("/api/jobs", params={"location": "remote"})
    titles = [j["title"] for j in resp.json()["items"]]
    assert titles == ["Remote Role"]


def test_filter_by_experience_level(client, admin_token):
    make_job(client, admin_token, title="Senior Role", experience_level="senior")
    make_job(client, admin_token, title="Entry Role", experience_level="entry")

    resp = client.get("/api/jobs", params={"experience_level": "senior"})
    titles = [j["title"] for j in resp.json()["items"]]
    assert titles == ["Senior Role"]


def test_combined_filters_no_results(client, admin_token):
    make_job(client, admin_token, title="Python Role", required_skills=["Python"], location="Berlin")
    resp = client.get("/api/jobs", params={"skills": "python", "location": "remote"})
    assert resp.json()["items"] == []


def test_search_empty_input_returns_all_open(client, admin_token):
    make_job(client, admin_token, title="Role A")
    make_job(client, admin_token, title="Role B")
    resp = client.get("/api/jobs", params={"search": ""})
    assert len(resp.json()["items"]) == 2


def test_owner_can_edit_job(client, admin_token):
    created = make_job(client, admin_token).json()
    resp = client.patch(
        f"/api/jobs/{created['id']}", json={"title": "Senior Backend Engineer"}, headers=auth_headers(admin_token)
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "Senior Backend Engineer"


def test_non_owner_cannot_edit_job(client, admin_token, other_admin_token):
    created = make_job(client, admin_token).json()
    resp = client.patch(
        f"/api/jobs/{created['id']}", json={"title": "Hijacked"}, headers=auth_headers(other_admin_token)
    )
    assert resp.status_code == 403


def test_owner_can_toggle_status(client, admin_token):
    created = make_job(client, admin_token).json()
    resp = client.patch(
        f"/api/jobs/{created['id']}/status", json={"status": "closed"}, headers=auth_headers(admin_token)
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "closed"


def test_invalid_status_value_rejected(client, admin_token):
    created = make_job(client, admin_token).json()
    resp = client.patch(
        f"/api/jobs/{created['id']}/status", json={"status": "archived"}, headers=auth_headers(admin_token)
    )
    assert resp.status_code == 422


def test_mine_scopes_to_own_jobs(client, admin_token, other_admin_token):
    make_job(client, admin_token, title="Mine")
    make_job(client, other_admin_token, title="Theirs")

    resp = client.get("/api/jobs/mine", headers=auth_headers(admin_token))
    titles = [j["title"] for j in resp.json()["items"]]
    assert titles == ["Mine"]
