from datetime import datetime

from pydantic import BaseModel, Field

from app.models.enums import EmploymentType, ExperienceLevel, JobStatus


class JobCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str = Field(min_length=1, max_length=10_000)
    required_skills: list[str] = Field(default_factory=list, max_length=50)
    experience_level: ExperienceLevel
    location: str = Field(min_length=1, max_length=255)
    employment_type: EmploymentType = EmploymentType.full_time
    domain: str | None = Field(default=None, max_length=100)


class JobUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, min_length=1, max_length=10_000)
    required_skills: list[str] | None = Field(default=None, max_length=50)
    experience_level: ExperienceLevel | None = None
    location: str | None = Field(default=None, min_length=1, max_length=255)
    employment_type: EmploymentType | None = None
    domain: str | None = Field(default=None, max_length=100)


class JobStatusUpdate(BaseModel):
    status: JobStatus


class JobOut(BaseModel):
    id: int
    admin_id: int
    title: str
    description: str
    required_skills: list[str]
    experience_level: ExperienceLevel
    location: str
    employment_type: EmploymentType
    domain: str | None
    company_name: str
    status: JobStatus
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class JobListResponse(BaseModel):
    items: list[JobOut]
    total: int
    page: int
    page_size: int
