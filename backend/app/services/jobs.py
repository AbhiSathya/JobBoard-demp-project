from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.errors import ForbiddenError, NotFoundError
from app.models.enums import ExperienceLevel, JobStatus
from app.models.job import Job
from app.models.user import User
from app.schemas.job import JobCreate, JobUpdate


def _skills_text(skills: list[str]) -> str:
    return ",".join(s.strip().lower() for s in skills if s.strip())


def create_job(db: Session, admin: User, data: JobCreate) -> Job:
    job = Job(
        admin_id=admin.id,
        title=data.title,
        description=data.description,
        required_skills=data.required_skills,
        skills_text=_skills_text(data.required_skills),
        experience_level=data.experience_level,
        location=data.location,
        employment_type=data.employment_type,
        domain=data.domain,
        company_name=admin.company_name or "",
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def get_job(db: Session, job_id: int) -> Job:
    job = db.get(Job, job_id)
    if job is None:
        raise NotFoundError(f"Job {job_id} was not found.")
    return job


def _assert_owner(job: Job, admin: User) -> None:
    if job.admin_id != admin.id:
        raise ForbiddenError("You do not own this job listing.")


def update_job(db: Session, job_id: int, admin: User, data: JobUpdate) -> Job:
    job = get_job(db, job_id)
    _assert_owner(job, admin)

    changes = data.model_dump(exclude_unset=True)
    if "required_skills" in changes:
        job.skills_text = _skills_text(changes["required_skills"])
    for field, value in changes.items():
        setattr(job, field, value)

    db.commit()
    db.refresh(job)
    return job


def set_job_status(db: Session, job_id: int, admin: User, status: JobStatus) -> Job:
    job = get_job(db, job_id)
    _assert_owner(job, admin)
    job.status = status
    db.commit()
    db.refresh(job)
    return job


def list_jobs(
    db: Session,
    *,
    search: str | None = None,
    skills: list[str] | None = None,
    location: str | None = None,
    experience_level: ExperienceLevel | None = None,
    status: JobStatus | None = None,
    mine_admin_id: int | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[Job], int]:
    query = db.query(Job)

    if mine_admin_id is not None:
        query = query.filter(Job.admin_id == mine_admin_id)
    elif status is None:
        status = JobStatus.open

    if status is not None:
        query = query.filter(Job.status == status)

    if search:
        like = f"%{search.strip().lower()}%"
        query = query.filter(
            or_(
                Job.title.ilike(like),
                Job.description.ilike(like),
                Job.skills_text.ilike(like),
            )
        )

    if skills:
        for skill in skills:
            query = query.filter(Job.skills_text.ilike(f"%{skill.strip().lower()}%"))

    if location:
        query = query.filter(Job.location.ilike(f"%{location.strip()}%"))

    if experience_level:
        query = query.filter(Job.experience_level == experience_level)

    total = query.count()
    page = max(page, 1)
    page_size = min(max(page_size, 1), 100)
    items = query.order_by(Job.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return items, total
