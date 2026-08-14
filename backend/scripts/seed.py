"""Idempotent demo-data seed script.

Run with: uv run python -m scripts.seed  (or: .venv/bin/python -m scripts.seed)

Wipes and reinserts all rows each run, in FK-safe order, so it's always safe to
re-run before a demo without producing duplicates or unique-constraint errors.
"""

import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.db import Base, SessionLocal, engine  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.models.application import Application  # noqa: E402
from app.models.candidate_profile import CandidateProfile  # noqa: E402
from app.models.enums import (  # noqa: E402
    ApplicationStatus,
    EmploymentType,
    ExperienceLevel,
    JobStatus,
    Role,
)
from app.models.job import Job  # noqa: E402
from app.models.user import User  # noqa: E402

COMPANIES = [
    ("admin@acmehealth.com", "Acme Health"),
    ("admin@finflow.com", "FinFlow"),
    ("admin@shopwave.com", "ShopWave"),
    ("admin@learnly.com", "Learnly"),
    ("admin@pixelforge.com", "PixelForge"),
]

JOBS = [
    # (company_idx, title, description, skills, experience, location, employment, domain)
    (
        0,
        "Backend Engineer",
        "Build patient-record APIs with FastAPI and PostgreSQL for a healthcare startup.",
        ["Python", "FastAPI", "PostgreSQL", "Docker"],
        "mid",
        "Berlin",
        "full_time",
        "healthcare",
    ),
    (
        0,
        "Senior Data Engineer",
        "Own the pipelines that move clinical data between hospital systems.",
        ["Python", "Airflow", "SQL", "AWS"],
        "senior",
        "Remote",
        "full_time",
        "healthcare",
    ),
    (
        0,
        "ML Engineer",
        "Build risk-prediction models on top of anonymized patient datasets.",
        ["Python", "PyTorch", "SQL"],
        "senior",
        "Remote",
        "full_time",
        "healthcare",
    ),
    (
        0,
        "Junior QA Engineer",
        "Write automated tests for our clinical scheduling product.",
        ["Python", "Selenium"],
        "entry",
        "Berlin",
        "full_time",
        "healthcare",
    ),
    (
        1,
        "Backend Engineer",
        "Build the ledger service that powers real-time payments.",
        ["Python", "FastAPI", "PostgreSQL", "Kafka"],
        "mid",
        "London",
        "full_time",
        "fintech",
    ),
    (
        1,
        "Staff Backend Engineer",
        "Lead the architecture for our multi-currency settlement platform.",
        ["Python", "Go", "PostgreSQL", "Kafka"],
        "lead",
        "London",
        "full_time",
        "fintech",
    ),
    (
        1,
        "Frontend Engineer",
        "Build the trading dashboard our customers use every day.",
        ["React", "TypeScript", "GraphQL"],
        "mid",
        "Remote",
        "full_time",
        "fintech",
    ),
    (
        1,
        "Compliance Data Analyst",
        "Turn transaction data into fraud and compliance reports.",
        ["SQL", "Python", "Tableau"],
        "mid",
        "London",
        "full_time",
        "fintech",
    ),
    (
        2,
        "Backend Engineer",
        "Build the checkout and inventory APIs for our e-commerce platform.",
        ["Python", "Django", "PostgreSQL", "Redis"],
        "mid",
        "Amsterdam",
        "full_time",
        "ecommerce",
    ),
    (
        2,
        "Frontend Engineer",
        "Build fast, accessible storefronts with React and TypeScript.",
        ["React", "TypeScript", "CSS"],
        "mid",
        "Remote",
        "full_time",
        "ecommerce",
    ),
    (
        2,
        "Senior Frontend Engineer",
        "Own the design system used across all storefront teams.",
        ["React", "TypeScript", "CSS", "Storybook"],
        "senior",
        "Amsterdam",
        "full_time",
        "ecommerce",
    ),
    (
        2,
        "DevOps Engineer",
        "Run the Kubernetes platform behind our checkout flow.",
        ["Kubernetes", "Docker", "AWS", "Terraform"],
        "senior",
        "Remote",
        "full_time",
        "ecommerce",
    ),
    (
        3,
        "Backend Engineer",
        "Build the course-progress APIs for our learning platform.",
        ["Python", "FastAPI", "PostgreSQL"],
        "entry",
        "Remote",
        "full_time",
        "edtech",
    ),
    (
        3,
        "Product Designer",
        "Design learning flows for students and teachers.",
        ["Figma", "User Research"],
        "mid",
        "Remote",
        "full_time",
        "edtech",
    ),
    (
        3,
        "Data Analyst",
        "Measure learning outcomes and course engagement.",
        ["SQL", "Python", "Tableau"],
        "entry",
        "Remote",
        "part_time",
        "edtech",
    ),
    (
        4,
        "Gameplay Engineer",
        "Build gameplay systems in Unity for our mobile title.",
        ["C#", "Unity"],
        "mid",
        "Remote",
        "full_time",
        "gaming",
    ),
    (
        4,
        "Backend Engineer",
        "Build the multiplayer matchmaking and leaderboard services.",
        ["Python", "FastAPI", "Redis"],
        "mid",
        "Remote",
        "full_time",
        "gaming",
    ),
    (
        4,
        "QA Intern",
        "Test new gameplay features before each release.",
        ["Manual Testing"],
        "entry",
        "Remote",
        "internship",
        "gaming",
    ),
]

CANDIDATES = [
    dict(
        email="jordan.lee@example.com",
        name="Jordan Lee",
        headline="Backend engineer",
        years_experience=4,
        skills=["Python", "FastAPI", "PostgreSQL", "Docker"],
        education=[
            {
                "institution": "State University",
                "degree": "BSc",
                "field": "Computer Science",
                "graduation_year": 2020,
            }
        ],
        projects=[
            {
                "name": "Order Service",
                "summary": "Rebuilt a checkout API to handle 10x traffic.",
                "skills": ["Python", "PostgreSQL"],
            }
        ],
        preferred_location="Remote",
        preferred_role_type="Full-time",
        domain_interests=["healthcare", "fintech"],
    ),
    dict(
        email="amara.okafor@example.com",
        name="Amara Okafor",
        headline="Senior backend & data engineer",
        years_experience=7,
        skills=["Python", "Go", "PostgreSQL", "Kafka", "AWS"],
        education=[
            {
                "institution": "Tech Institute",
                "degree": "MSc",
                "field": "Software Engineering",
                "graduation_year": 2017,
            }
        ],
        projects=[
            {
                "name": "Settlement Engine",
                "summary": "Designed a multi-currency ledger processing 2M transactions/day.",
                "skills": ["Go", "Kafka"],
            }
        ],
        preferred_location="London",
        preferred_role_type="Full-time",
        domain_interests=["fintech"],
    ),
    dict(
        email="mei.chen@example.com",
        name="Mei Chen",
        headline="Frontend engineer",
        years_experience=3,
        skills=["React", "TypeScript", "CSS", "GraphQL"],
        education=[
            {
                "institution": "Design & Tech College",
                "degree": "BSc",
                "field": "Interactive Media",
                "graduation_year": 2021,
            }
        ],
        projects=[
            {
                "name": "Storefront Redesign",
                "summary": "Led a redesign that improved checkout conversion by 12%.",
                "skills": ["React", "TypeScript"],
            }
        ],
        preferred_location="Remote",
        preferred_role_type="Full-time",
        domain_interests=["ecommerce", "fintech"],
    ),
    dict(
        email="daniel.silva@example.com",
        name="Daniel Silva",
        headline="DevOps engineer",
        years_experience=6,
        skills=["Kubernetes", "Docker", "AWS", "Terraform"],
        education=[
            {
                "institution": "Polytechnic University",
                "degree": "BSc",
                "field": "Systems Engineering",
                "graduation_year": 2018,
            }
        ],
        projects=[
            {
                "name": "Platform Migration",
                "summary": "Migrated a monolith to Kubernetes with zero downtime.",
                "skills": ["Kubernetes", "Terraform"],
            }
        ],
        preferred_location="Remote",
        preferred_role_type="Full-time",
        domain_interests=["ecommerce"],
    ),
    dict(
        email="priya.nair@example.com",
        name="Priya Nair",
        headline="Data analyst",
        years_experience=2,
        skills=["SQL", "Python", "Tableau"],
        education=[
            {"institution": "City College", "degree": "BSc", "field": "Statistics", "graduation_year": 2022}
        ],
        projects=[
            {
                "name": "Engagement Dashboard",
                "summary": "Built a dashboard tracking course completion rates.",
                "skills": ["SQL", "Tableau"],
            }
        ],
        preferred_location="Remote",
        preferred_role_type="Part-time",
        domain_interests=["edtech", "fintech"],
    ),
    dict(
        email="lucas.martin@example.com",
        name="Lucas Martin",
        headline="Gameplay engineer",
        years_experience=3,
        skills=["C#", "Unity"],
        education=[
            {
                "institution": "Game Development Academy",
                "degree": "BA",
                "field": "Game Design",
                "graduation_year": 2020,
            }
        ],
        projects=[
            {
                "name": "Endless Runner",
                "summary": "Shipped a mobile game with 500k downloads.",
                "skills": ["C#", "Unity"],
            }
        ],
        preferred_location="Remote",
        preferred_role_type="Full-time",
        domain_interests=["gaming"],
    ),
]

# (candidate_idx, job_title, company_idx, status)
APPLICATIONS = [
    (0, "Backend Engineer", 0, ApplicationStatus.shortlisted),
    (0, "Backend Engineer", 4, ApplicationStatus.applied),
    (0, "ML Engineer", 0, ApplicationStatus.rejected),
    (1, "Staff Backend Engineer", 1, ApplicationStatus.shortlisted),
    (1, "Senior Data Engineer", 0, ApplicationStatus.applied),
    (2, "Frontend Engineer", 1, ApplicationStatus.applied),
    (2, "Senior Frontend Engineer", 2, ApplicationStatus.shortlisted),
    (2, "Frontend Engineer", 2, ApplicationStatus.applied),
    (3, "DevOps Engineer", 2, ApplicationStatus.shortlisted),
    (4, "Data Analyst", 3, ApplicationStatus.applied),
    (4, "Compliance Data Analyst", 1, ApplicationStatus.rejected),
    (5, "Gameplay Engineer", 4, ApplicationStatus.applied),
    (5, "Backend Engineer", 4, ApplicationStatus.rejected),
]

DEMO_PASSWORD = "password123"


NOW = datetime.now(UTC).replace(tzinfo=None)


def wipe(db) -> None:
    db.query(Application).delete()
    db.query(CandidateProfile).delete()
    db.query(Job).delete()
    db.query(User).delete()
    db.commit()


def seed() -> None:
    Base.metadata.create_all(engine)
    db = SessionLocal()
    try:
        wipe(db)

        admins = []
        for email, company in COMPANIES:
            admin = User(
                email=email,
                password_hash=hash_password(DEMO_PASSWORD),
                role=Role.admin,
                company_name=company,
                email_verified_at=NOW,
            )
            db.add(admin)
            admins.append(admin)
        db.flush()

        jobs_by_key: dict[tuple[int, str], Job] = {}
        for company_idx, title, description, skills, exp, location, emp_type, domain in JOBS:
            job = Job(
                admin_id=admins[company_idx].id,
                title=title,
                description=description,
                required_skills=skills,
                skills_text=",".join(s.lower() for s in skills),
                experience_level=ExperienceLevel(exp),
                location=location,
                employment_type=EmploymentType(emp_type),
                domain=domain,
                company_name=admins[company_idx].company_name,
                status=JobStatus.open,
            )
            db.add(job)
            jobs_by_key[(company_idx, title)] = job
        db.flush()

        candidates = []
        for c in CANDIDATES:
            user = User(
                email=c["email"],
                password_hash=hash_password(DEMO_PASSWORD),
                role=Role.candidate,
                email_verified_at=NOW,
            )
            db.add(user)
            db.flush()
            profile = CandidateProfile(
                user_id=user.id,
                name=c["name"],
                headline=c["headline"],
                years_experience=c["years_experience"],
                skills=c["skills"],
                skills_text=",".join(s.lower() for s in c["skills"]),
                education=c["education"],
                projects=c["projects"],
                preferred_location=c["preferred_location"],
                preferred_role_type=c["preferred_role_type"],
                domain_interests=c["domain_interests"],
            )
            db.add(profile)
            candidates.append((user, profile))
        db.flush()

        for offset, (cand_idx, job_title, company_idx, status) in enumerate(APPLICATIONS):
            user, profile = candidates[cand_idx]
            job = jobs_by_key[(company_idx, job_title)]
            snapshot = {
                "id": profile.id,
                "user_id": user.id,
                "name": profile.name,
                "headline": profile.headline,
                "years_experience": profile.years_experience,
                "skills": profile.skills,
                "education": profile.education,
                "projects": profile.projects,
                "preferred_location": profile.preferred_location,
                "preferred_role_type": profile.preferred_role_type,
                "domain_interests": profile.domain_interests,
            }
            db.add(
                Application(
                    job_id=job.id,
                    candidate_id=user.id,
                    status=status,
                    cover_note=f"I'd love to bring my {profile.skills[0]} experience to this role.",
                    profile_snapshot=snapshot,
                    # Spread across the last few weeks so "applications over time" on the
                    # dashboard shows a real trend rather than one spike on seed day.
                    created_at=NOW - timedelta(days=(len(APPLICATIONS) - offset) * 2),
                    updated_at=NOW,
                )
            )

        db.commit()
        print(
            f"Seeded {len(admins)} companies, {len(JOBS)} jobs, {len(candidates)} candidates, "
            f"{len(APPLICATIONS)} applications."
        )
        print(f"All demo accounts use the password: {DEMO_PASSWORD}")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
