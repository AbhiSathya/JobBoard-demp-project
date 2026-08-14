from fastapi import BackgroundTasks
from sqlalchemy.orm import Session, selectinload

from app.core.errors import ConflictError, ForbiddenError, NotFoundError
from app.models.application import Application
from app.models.candidate_profile import CandidateProfile
from app.models.enums import APPLICATION_TRANSITIONS, ApplicationStatus, JobStatus
from app.models.job import Job
from app.models.user import User
from app.schemas.application import ApplicationCreate
from app.schemas.profile import ProfileOut
from app.services import notifications
from app.services.jobs import get_job, paginate


def create_application(
    db: Session, candidate: User, data: ApplicationCreate, tasks: BackgroundTasks | None = None
) -> Application:
    job = get_job(db, data.job_id)
    if job.status != JobStatus.open:
        raise ConflictError("This job is closed and no longer accepting applications.")

    profile = db.query(CandidateProfile).filter(CandidateProfile.user_id == candidate.id).first()
    if profile is None:
        raise ConflictError("Complete your candidate profile before applying.", details=["profile_required"])

    existing = (
        db.query(Application)
        .filter(Application.job_id == job.id, Application.candidate_id == candidate.id)
        .first()
    )
    if existing is not None:
        raise ConflictError("You have already applied to this job.")

    application = Application(
        job_id=job.id,
        candidate_id=candidate.id,
        cover_note=data.cover_note,
        profile_snapshot=ProfileOut.model_validate(profile).model_dump(mode="json"),
    )
    db.add(application)
    db.commit()
    db.refresh(application)

    if tasks is not None:
        tasks.add_task(notifications.send_application_received, candidate, job)
        admin = db.get(User, job.admin_id)
        if admin is not None:
            tasks.add_task(notifications.send_new_applicant, admin, job, application)

    return application


def get_application(db: Session, application_id: int) -> Application:
    application = db.get(Application, application_id)
    if application is None:
        raise NotFoundError(f"Application {application_id} was not found.")
    return application


def list_my_applications(
    db: Session, candidate: User, *, page: int = 1, page_size: int = 20
) -> tuple[list[Application], int]:
    query = (
        db.query(Application)
        .options(selectinload(Application.job))
        .filter(Application.candidate_id == candidate.id)
        .order_by(Application.created_at.desc())
    )
    return paginate(query, page, page_size)


def list_job_applications(
    db: Session,
    job_id: int,
    admin: User,
    *,
    status: ApplicationStatus | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[Application], int]:
    job = get_job(db, job_id)
    if job.admin_id != admin.id:
        raise ForbiddenError("You do not own this job listing.")

    # selectinload, or the router's per-row `application.candidate` access turns one
    # query into one-plus-N.
    query = (
        db.query(Application)
        .options(selectinload(Application.candidate))
        .filter(Application.job_id == job_id)
    )
    if status is not None:
        query = query.filter(Application.status == status)
    return paginate(query.order_by(Application.created_at.desc()), page, page_size)


def update_application_status(
    db: Session,
    application_id: int,
    admin: User,
    new_status: ApplicationStatus,
    tasks: BackgroundTasks | None = None,
) -> Application:
    application = get_application(db, application_id)
    job = db.get(Job, application.job_id)
    if job.admin_id != admin.id:
        raise ForbiddenError("You do not own the job this application belongs to.")

    allowed = APPLICATION_TRANSITIONS[application.status]
    if new_status != application.status and new_status not in allowed:
        raise ConflictError(
            f"Cannot move application from '{application.status.value}' to '{new_status.value}'.",
            details=[s.value for s in allowed],
        )

    changed = new_status != application.status
    application.status = new_status
    db.commit()
    db.refresh(application)

    if changed and tasks is not None and new_status != ApplicationStatus.applied:
        candidate = db.get(User, application.candidate_id)
        if candidate is not None:
            tasks.add_task(notifications.send_status_change, candidate, job, new_status)

    return application
