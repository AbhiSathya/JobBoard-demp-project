from pydantic import BaseModel, Field

from app.matching.models import MatchIntent
from app.schemas.job import JobOut


class MatchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=1_000)


class MatchResult(BaseModel):
    job: JobOut
    score: float
    band: str | None
    explanation: str
    skills_matched: list[str]
    skills_missing: list[str]


class MatchResponse(BaseModel):
    intent: MatchIntent
    used_ai: bool
    low_confidence: bool
    results: list[MatchResult]
    weak_matches_only: bool
