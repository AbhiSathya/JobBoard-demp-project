from pydantic import BaseModel

from app.models.enums import JobStatus


class JobApplicationCount(BaseModel):
    job_id: int
    job_title: str
    count: int
    status: JobStatus


class SkillCount(BaseModel):
    skill: str
    count: int


class SkillDemand(BaseModel):
    """One skill, seen from both sides: how many of your jobs ask for it, and how many
    of your applicants actually have it."""

    skill: str
    required_by_jobs: int
    applicants_with_skill: int


class TimePoint(BaseModel):
    date: str
    count: int


class PipelineCounts(BaseModel):
    applied: int = 0
    shortlisted: int = 0
    rejected: int = 0


class AnalyticsResponse(BaseModel):
    applications_per_job: list[JobApplicationCount]
    skill_distribution: list[SkillCount]
    skill_demand: list[SkillDemand]
    applications_over_time: list[TimePoint]
    pipeline_counts: PipelineCounts
    total_jobs: int
    open_jobs: int
    total_applications: int
