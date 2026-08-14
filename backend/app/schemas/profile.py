from datetime import datetime

from pydantic import BaseModel, Field


class EducationEntry(BaseModel):
    institution: str = Field(min_length=1, max_length=255)
    degree: str = Field(min_length=1, max_length=255)
    field: str | None = Field(default=None, max_length=255)
    graduation_year: int | None = Field(default=None, ge=1950, le=2100)


class ProjectEntry(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    summary: str = Field(min_length=1, max_length=5_000)
    skills: list[str] = Field(default_factory=list, max_length=30)


class ProfileUpsert(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    headline: str | None = Field(default=None, max_length=255)
    years_experience: int = Field(default=0, ge=0, le=60)
    skills: list[str] = Field(default_factory=list, max_length=100)
    education: list[EducationEntry] = Field(default_factory=list, max_length=20)
    projects: list[ProjectEntry] = Field(default_factory=list, max_length=20)
    preferred_location: str | None = Field(default=None, max_length=255)
    preferred_role_type: str | None = Field(default=None, max_length=100)
    domain_interests: list[str] = Field(default_factory=list, max_length=20)


class ProfileOut(BaseModel):
    id: int
    user_id: int
    name: str
    headline: str | None
    years_experience: int
    skills: list[str]
    education: list[EducationEntry]
    projects: list[ProjectEntry]
    preferred_location: str | None
    preferred_role_type: str | None
    domain_interests: list[str]
    updated_at: datetime

    model_config = {"from_attributes": True}
