from typing import Literal

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
    explanation_source: Literal["ai", "rules"]
    skills_matched: list[str]
    skills_missing: list[str]
    breakdown: dict[str, float]


class MatchResponse(BaseModel):
    intent: MatchIntent
    used_ai: bool
    # live      — the model answered and its explanations passed the fact check
    # degraded  — the model parsed the query but the explanation call failed
    # fallback  — no model was reachable; ranking ran entirely on deterministic rules
    ai_status: Literal["live", "degraded", "fallback"]
    model_used: str | None
    latency_ms: int
    low_confidence: bool
    results: list[MatchResult]
    weak_matches_only: bool
