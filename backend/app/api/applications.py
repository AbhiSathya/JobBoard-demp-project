from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import CurrentAdmin, CurrentCandidate, VerifiedCandidate
from app.models.enums import ApplicationStatus
from app.schemas.application import (
    ApplicationCreate,
    ApplicationListResponse,
    ApplicationOut,
    ApplicationStatusUpdate,
)
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
    data: ApplicationCreate,
    candidate: VerifiedCandidate,
    tasks: BackgroundTasks,
    db: Annotated[Session, Depends(get_db)],
) -> ApplicationOut:
    application = create_application(db, candidate, data, tasks)
    return ApplicationOut.model_validate(application)


@router.get("/me", response_model=ApplicationListResponse)
def my_applications(
    candidate: CurrentCandidate,
    db: Annotated[Session, Depends(get_db)],
    page: int = 1,
    page_size: int = 20,
) -> ApplicationListResponse:
    items, total = list_my_applications(db, candidate, page=page, page_size=page_size)
    return ApplicationListResponse(
        items=[ApplicationOut.model_validate(a) for a in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.patch("/{application_id}/status", response_model=ApplicationOut)
def patch_application_status(
    application_id: int,
    data: ApplicationStatusUpdate,
    admin: CurrentAdmin,
    tasks: BackgroundTasks,
    db: Annotated[Session, Depends(get_db)],
) -> ApplicationOut:
    application = update_application_status(db, application_id, admin, data.status, tasks)
    return ApplicationOut.model_validate(application)


@jobs_router.get("/{job_id}/applications", response_model=ApplicationListResponse)
def applications_for_job(
    job_id: int,
    admin: CurrentAdmin,
    db: Annotated[Session, Depends(get_db)],
    status: ApplicationStatus | None = None,
    page: int = 1,
    page_size: int = 20,
) -> ApplicationListResponse:
    items, total = list_job_applications(db, job_id, admin, status=status, page=page, page_size=page_size)
    return ApplicationListResponse(
        items=[ApplicationOut.model_validate(a) for a in items],
        total=total,
        page=page,
        page_size=page_size,
    )
