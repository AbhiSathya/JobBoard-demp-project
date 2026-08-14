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
    payload = {"name": "Candidate", "skills": ["Python"], "education": [], "projects": [], "domain_interests": []}
    payload.update(overrides)
    return client.put("/api/candidates/me/profile", json=payload, headers=auth_headers(token))


def test_analytics_empty_for_admin_with_no_jobs(client, admin_token):
    resp = client.get("/api/admin/analytics", headers=auth_headers(admin_token))
    assert resp.status_code == 200
    body = resp.json()
    assert body["total_jobs"] == 0
    assert body["total_applications"] == 0
    assert body["pipeline_counts"] == {"applied": 0, "shortlisted": 0, "rejected": 0}


def test_analytics_reflects_real_applications(client, admin_token):
    job = make_job(client, admin_token)

    c1 = register(client, email="c1@example.com", role="candidate").json()["access_token"]
    c2 = register(client, email="c2@example.com", role="candidate").json()["access_token"]
    make_profile(client, c1, skills=["Python", "SQL"])
    make_profile(client, c2, skills=["Python", "Go"])
    client.post("/api/applications", json={"job_id": job["id"]}, headers=auth_headers(c1))
    app2 = client.post(
        "/api/applications", json={"job_id": job["id"]}, headers=auth_headers(c2)
    ).json()
    client.patch(
        f"/api/applications/{app2['id']}/status", json={"status": "shortlisted"}, headers=auth_headers(admin_token)
    )

    resp = client.get("/api/admin/analytics", headers=auth_headers(admin_token))
    body = resp.json()

    assert body["total_jobs"] == 1
    assert body["total_applications"] == 2
    assert body["applications_per_job"] == [{"job_id": job["id"], "job_title": "Backend Engineer", "count": 2}]
    assert body["pipeline_counts"] == {"applied": 1, "shortlisted": 1, "rejected": 0}

    skills = {row["skill"]: row["count"] for row in body["skill_distribution"]}
    assert skills["Python"] == 2
    assert skills["SQL"] == 1
    assert skills["Go"] == 1


def test_analytics_scoped_to_own_jobs_only(client, admin_token):
    other_admin = register(client, email="other@globex.com", role="admin", company_name="Globex").json()[
        "access_token"
    ]
    make_job(client, other_admin, title="Someone Else's Job")

    resp = client.get("/api/admin/analytics", headers=auth_headers(admin_token))
    assert resp.json()["total_jobs"] == 0


def test_analytics_requires_admin(client, candidate_token):
    resp = client.get("/api/admin/analytics", headers=auth_headers(candidate_token))
    assert resp.status_code == 403
