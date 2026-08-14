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
        "description": "Build APIs for a healthcare startup using Python.",
        "required_skills": ["Python", "FastAPI"],
        "experience_level": "mid",
        "location": "Berlin",
        "domain": "healthcare",
    }
    payload.update(overrides)
    return client.post("/api/jobs", json=payload, headers=auth_headers(token)).json()


def test_match_requires_candidate_role(client, admin_token):
    resp = client.post("/api/match", json={"query": "python role"}, headers=auth_headers(admin_token))
    assert resp.status_code == 403


def test_match_with_no_open_jobs_returns_empty(client, candidate_token):
    resp = client.post(
        "/api/match", json={"query": "python backend role"}, headers=auth_headers(candidate_token)
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["results"] == []
    assert body["used_ai"] is False


def test_match_ranks_relevant_job_first(client, admin_token, candidate_token):
    make_job(client, admin_token, title="Python Backend Engineer", required_skills=["Python", "FastAPI"])
    make_job(client, admin_token, title="Java Frontend Developer", required_skills=["Java", "Angular"])

    resp = client.post(
        "/api/match",
        json={"query": "I want a Python backend role in a healthcare startup"},
        headers=auth_headers(candidate_token),
    )
    assert resp.status_code == 200
    results = resp.json()["results"]
    assert len(results) >= 1
    assert results[0]["job"]["title"] == "Python Backend Engineer"
    assert results[0]["explanation"]

    # explanation must be grounded: skills it claims are matched really are required skills
    for skill in results[0]["skills_matched"]:
        assert skill in results[0]["job"]["required_skills"]


def test_match_only_considers_open_jobs(client, admin_token, candidate_token):
    job = make_job(client, admin_token, title="Closed Python Role")
    client.patch(f"/api/jobs/{job['id']}/status", json={"status": "closed"}, headers=auth_headers(admin_token))

    resp = client.post("/api/match", json={"query": "python role"}, headers=auth_headers(candidate_token))
    titles = [r["job"]["title"] for r in resp.json()["results"]]
    assert "Closed Python Role" not in titles


def test_vague_query_flagged_low_confidence(client, admin_token, candidate_token):
    make_job(client, admin_token)
    resp = client.post(
        "/api/match", json={"query": "something good please"}, headers=auth_headers(candidate_token)
    )
    assert resp.status_code == 200
    assert resp.json()["low_confidence"] is True


def test_no_strong_match_still_returns_weak_top_results(client, admin_token, candidate_token):
    make_job(client, admin_token, title="Fashion Designer", required_skills=["Illustrator"], domain="fashion")
    resp = client.post(
        "/api/match",
        json={"query": "senior python backend engineer in fintech, remote"},
        headers=auth_headers(candidate_token),
    )
    body = resp.json()
    assert body["weak_matches_only"] is True
    assert len(body["results"]) == 1


def test_empty_query_rejected(client, candidate_token):
    resp = client.post("/api/match", json={"query": ""}, headers=auth_headers(candidate_token))
    assert resp.status_code == 422


def test_match_works_without_saved_profile(client, admin_token, candidate_token):
    make_job(client, admin_token)
    resp = client.post(
        "/api/match", json={"query": "python backend role"}, headers=auth_headers(candidate_token)
    )
    assert resp.status_code == 200
