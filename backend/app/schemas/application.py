from datetime import datetime

from pydantic import BaseModel, Field

from app.models.enums import ApplicationStatus
from app.schemas.job import JobOut


class ApplicationCreate(BaseModel):
    job_id: int
    cover_note: str | None = Field(default=None, max_length=5_000)


class ApplicationStatusUpdate(BaseModel):
    status: ApplicationStatus


class ApplicationOut(BaseModel):
    id: int
    job_id: int
    candidate_id: int
    status: ApplicationStatus
    cover_note: str | None
    profile_snapshot: dict
    created_at: datetime
    updated_at: datetime
    job: JobOut | None = None

    model_config = {"from_attributes": True}


class ApplicationListResponse(BaseModel):
    items: list[ApplicationOut]
    total: int
    page: int
    page_size: int
