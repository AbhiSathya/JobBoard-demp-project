from pydantic import BaseModel


class JobApplicationCount(BaseModel):
    job_id: int
    job_title: str
    count: int


class SkillCount(BaseModel):
    skill: str
    count: int


class PipelineCounts(BaseModel):
    applied: int = 0
    shortlisted: int = 0
    rejected: int = 0


class AnalyticsResponse(BaseModel):
    applications_per_job: list[JobApplicationCount]
    skill_distribution: list[SkillCount]
    pipeline_counts: PipelineCounts
    total_jobs: int
    total_applications: int
