from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import CurrentAdmin, VerifiedAdmin
from app.models.enums import EmploymentType, ExperienceLevel, JobStatus
from app.schemas.job import JobCreate, JobListResponse, JobOut, JobStatusUpdate, JobUpdate
from app.services.jobs import JobSort, create_job, get_job, list_jobs, set_job_status, update_job

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.get("", response_model=JobListResponse)
def browse_jobs(
    db: Annotated[Session, Depends(get_db)],
    search: str | None = None,
    skills: str | None = Query(default=None, description="Comma-separated skill list"),
    location: str | None = None,
    experience_level: ExperienceLevel | None = None,
    employment_type: EmploymentType | None = None,
    domain: str | None = None,
    status: JobStatus | None = None,
    sort: JobSort = "newest",
    page: int = 1,
    page_size: int = 20,
) -> JobListResponse:
    skills_list = [s for s in skills.split(",")] if skills else None
    items, total = list_jobs(
        db,
        search=search,
        skills=skills_list,
        location=location,
        experience_level=experience_level,
        employment_type=employment_type,
        domain=domain,
        status=status,
        sort=sort,
        page=page,
        page_size=page_size,
    )
    return JobListResponse(
        items=[JobOut.model_validate(j) for j in items], total=total, page=page, page_size=page_size
    )


@router.get("/mine", response_model=JobListResponse)
def my_jobs(
    admin: CurrentAdmin,
    db: Annotated[Session, Depends(get_db)],
    status: JobStatus | None = None,
    search: str | None = None,
    sort: JobSort = "newest",
    page: int = 1,
    page_size: int = 20,
) -> JobListResponse:
    items, total = list_jobs(
        db,
        mine_admin_id=admin.id,
        status=status,
        search=search,
        sort=sort,
        page=page,
        page_size=page_size,
    )
    return JobListResponse(
        items=[JobOut.model_validate(j) for j in items], total=total, page=page, page_size=page_size
    )


@router.post("", response_model=JobOut, status_code=201)
def post_job(data: JobCreate, admin: VerifiedAdmin, db: Annotated[Session, Depends(get_db)]) -> JobOut:
    job = create_job(db, admin, data)
    return JobOut.model_validate(job)


@router.get("/{job_id}", response_model=JobOut)
def get_job_detail(job_id: int, db: Annotated[Session, Depends(get_db)]) -> JobOut:
    job = get_job(db, job_id)
    return JobOut.model_validate(job)


@router.patch("/{job_id}", response_model=JobOut)
def patch_job(
    job_id: int, data: JobUpdate, admin: CurrentAdmin, db: Annotated[Session, Depends(get_db)]
) -> JobOut:
    job = update_job(db, job_id, admin, data)
    return JobOut.model_validate(job)


@router.patch("/{job_id}/status", response_model=JobOut)
def patch_job_status(
    job_id: int, data: JobStatusUpdate, admin: CurrentAdmin, db: Annotated[Session, Depends(get_db)]
) -> JobOut:
    job = set_job_status(db, job_id, admin, data.status)
    return JobOut.model_validate(job)
