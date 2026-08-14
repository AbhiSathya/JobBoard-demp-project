from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import CurrentAdmin, CurrentCandidate
from app.schemas.application import ApplicationCreate, ApplicationOut, ApplicationStatusUpdate
from app.services.applications import (
    create_application,
    list_job_applications,
    list_my_applications,
    update_application_status,
)

router = APIRouter(prefix="/api/applications", tags=["applications"])
jobs_router = APIRouter(prefix="/api/jobs", tags=["applications"])


@router.post("", response_model=ApplicationOut, status_code=201)
def apply_to_job(
    data: ApplicationCreate, candidate: CurrentCandidate, db: Annotated[Session, Depends(get_db)]
) -> ApplicationOut:
    application = create_application(db, candidate, data)
    return ApplicationOut.model_validate(application)


@router.get("/me", response_model=list[ApplicationOut])
def my_applications(
    candidate: CurrentCandidate, db: Annotated[Session, Depends(get_db)]
) -> list[ApplicationOut]:
    applications = list_my_applications(db, candidate)
    return [ApplicationOut.model_validate(a) for a in applications]


@router.patch("/{application_id}/status", response_model=ApplicationOut)
def patch_application_status(
    application_id: int,
    data: ApplicationStatusUpdate,
    admin: CurrentAdmin,
    db: Annotated[Session, Depends(get_db)],
) -> ApplicationOut:
    application = update_application_status(db, application_id, admin, data.status)
    return ApplicationOut.model_validate(application)


@jobs_router.get("/{job_id}/applications", response_model=list[ApplicationOut])
def applications_for_job(
    job_id: int, admin: CurrentAdmin, db: Annotated[Session, Depends(get_db)]
) -> list[ApplicationOut]:
    applications = list_job_applications(db, job_id, admin)
    return [ApplicationOut.model_validate(a) for a in applications]
