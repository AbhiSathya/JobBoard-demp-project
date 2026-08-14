"""Admin dashboard metrics, computed from stored rows — nothing here is hardcoded.

Counting is pushed into SQL wherever it can be. The previous version loaded every
application row into Python and counted with `Counter`, which is fine at demo scale and
wrong in principle: the aggregates below stay O(1) rows returned as the table grows.
Skill distribution is the exception — it reads inside a JSON column, so it still counts in
Python, but it now selects only that one column instead of whole ORM objects.
"""

from collections import Counter

from sqlalchemy import String, cast, func
from sqlalchemy.orm import Session

from app.models.application import Application
from app.models.enums import ApplicationStatus, JobStatus
from app.models.job import Job
from app.models.user import User
from app.schemas.analytics import (
    AnalyticsResponse,
    JobApplicationCount,
    PipelineCounts,
    SkillCount,
    SkillDemand,
    TimePoint,
)

TOP_SKILLS = 12
TREND_DAYS = 30


def get_admin_analytics(db: Session, admin: User) -> AnalyticsResponse:
    owned = db.query(Job.id).filter(Job.admin_id == admin.id).subquery()

    jobs = db.query(Job).filter(Job.admin_id == admin.id).order_by(Job.created_at.desc()).all()
    total_jobs = len(jobs)
    open_jobs = sum(1 for job in jobs if job.status == JobStatus.open)

    counts_by_job = dict(
        db.query(Application.job_id, func.count(Application.id))
        .filter(Application.job_id.in_(db.query(owned.c.id)))
        .group_by(Application.job_id)
        .all()
    )
    applications_per_job = [
        JobApplicationCount(
            job_id=job.id,
            job_title=job.title,
            count=counts_by_job.get(job.id, 0),
            status=job.status,
        )
        for job in jobs
    ]

    pipeline_rows = dict(
        db.query(Application.status, func.count(Application.id))
        .filter(Application.job_id.in_(db.query(owned.c.id)))
        .group_by(Application.status)
        .all()
    )
    pipeline_counts = PipelineCounts(
        applied=pipeline_rows.get(ApplicationStatus.applied, 0),
        shortlisted=pipeline_rows.get(ApplicationStatus.shortlisted, 0),
        rejected=pipeline_rows.get(ApplicationStatus.rejected, 0),
    )
    total_applications = sum(pipeline_rows.values())

    # Applicant skill supply. Only the snapshot column is selected, not whole rows.
    supply: Counter[str] = Counter()
    for (snapshot,) in db.query(Application.profile_snapshot).filter(
        Application.job_id.in_(db.query(owned.c.id))
    ):
        for skill in (snapshot or {}).get("skills", []):
            supply[str(skill)] += 1

    # Skill demand — what this admin's own listings ask for. Paired against supply below,
    # this is the chart that actually answers "am I asking for something nobody has?"
    demand: Counter[str] = Counter()
    for job in jobs:
        for skill in job.required_skills:
            if str(skill).strip():
                demand[str(skill).strip()] += 1

    skill_distribution = [
        SkillCount(skill=skill, count=count) for skill, count in supply.most_common(TOP_SKILLS)
    ]
    skill_demand = [
        SkillDemand(skill=skill, required_by_jobs=count, applicants_with_skill=supply.get(skill, 0))
        for skill, count in demand.most_common(TOP_SKILLS)
    ]

    # Applications over time, grouped in SQL by calendar day.
    day = func.substr(cast(Application.created_at, String), 1, 10)
    trend = [
        TimePoint(date=date, count=count)
        for date, count in db.query(day, func.count(Application.id))
        .filter(Application.job_id.in_(db.query(owned.c.id)))
        .group_by(day)
        .order_by(day)
        .all()[-TREND_DAYS:]
    ]

    return AnalyticsResponse(
        applications_per_job=applications_per_job,
        skill_distribution=skill_distribution,
        skill_demand=skill_demand,
        applications_over_time=trend,
        pipeline_counts=pipeline_counts,
        total_jobs=total_jobs,
        open_jobs=open_jobs,
        total_applications=total_applications,
    )
