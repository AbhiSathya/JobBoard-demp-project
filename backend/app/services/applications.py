from sqlalchemy.orm import Session

from app.core.errors import ConflictError, ForbiddenError, NotFoundError
from app.models.application import Application
from app.models.candidate_profile import CandidateProfile
from app.models.enums import APPLICATION_TRANSITIONS, ApplicationStatus, JobStatus
from app.models.job import Job
from app.models.user import User
from app.schemas.application import ApplicationCreate
from app.schemas.profile import ProfileOut
from app.services.jobs import get_job


def create_application(db: Session, candidate: User, data: ApplicationCreate) -> Application:
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
    return application


def get_application(db: Session, application_id: int) -> Application:
    application = db.get(Application, application_id)
    if application is None:
        raise NotFoundError(f"Application {application_id} was not found.")
    return application


def list_my_applications(db: Session, candidate: User) -> list[Application]:
    return (
        db.query(Application)
        .filter(Application.candidate_id == candidate.id)
        .order_by(Application.created_at.desc())
        .all()
    )


def list_job_applications(db: Session, job_id: int, admin: User) -> list[Application]:
    job = get_job(db, job_id)
    if job.admin_id != admin.id:
        raise ForbiddenError("You do not own this job listing.")
    return (
        db.query(Application)
        .filter(Application.job_id == job_id)
        .order_by(Application.created_at.desc())
        .all()
    )


def update_application_status(
    db: Session, application_id: int, admin: User, new_status: ApplicationStatus
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

    application.status = new_status
    db.commit()
    db.refresh(application)
    return application
