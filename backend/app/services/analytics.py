from collections import Counter

from sqlalchemy.orm import Session

from app.models.application import Application
from app.models.job import Job
from app.models.user import User
from app.schemas.analytics import AnalyticsResponse, JobApplicationCount, PipelineCounts, SkillCount


def get_admin_analytics(db: Session, admin: User) -> AnalyticsResponse:
    jobs = db.query(Job).filter(Job.admin_id == admin.id).all()
    job_ids = [j.id for j in jobs]

    applications: list[Application] = (
        db.query(Application).filter(Application.job_id.in_(job_ids)).all() if job_ids else []
    )

    counts_by_job = Counter(a.job_id for a in applications)
    applications_per_job = [
        JobApplicationCount(job_id=job.id, job_title=job.title, count=counts_by_job.get(job.id, 0))
        for job in jobs
    ]

    skill_counter: Counter[str] = Counter()
    for application in applications:
        for skill in application.profile_snapshot.get("skills", []):
            skill_counter[skill] += 1
    skill_distribution = [
        SkillCount(skill=skill, count=count)
        for skill, count in sorted(skill_counter.items(), key=lambda kv: kv[1], reverse=True)
    ]

    pipeline_counter = Counter(a.status.value for a in applications)
    pipeline_counts = PipelineCounts(
        applied=pipeline_counter.get("applied", 0),
        shortlisted=pipeline_counter.get("shortlisted", 0),
        rejected=pipeline_counter.get("rejected", 0),
    )

    return AnalyticsResponse(
        applications_per_job=applications_per_job,
        skill_distribution=skill_distribution,
        pipeline_counts=pipeline_counts,
        total_jobs=len(jobs),
        total_applications=len(applications),
    )
