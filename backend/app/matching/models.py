"""Plain dataclasses/pydantic models for the matching pipeline.

Deliberately free of SQLAlchemy and network imports: this module — and score.py,
explain.py which build on it — must be importable and testable with no database
and no network access. app/services/match.py is the only place that bridges these
to real ORM objects.
"""

from dataclasses import dataclass, field

from pydantic import BaseModel, Field


class MatchIntent(BaseModel):
    """Structured interpretation of a candidate's natural-language query."""

    roles: list[str] = Field(default_factory=list)
    skills: list[str] = Field(default_factory=list)
    experience_level: str | None = None
    locations: list[str] = Field(default_factory=list)
    domains: list[str] = Field(default_factory=list)
    employment_type: str | None = None


@dataclass
class MatchVocab:
    """Known values pulled from the jobs table, used by the deterministic extractor."""

    skills: list[str] = field(default_factory=list)
    domains: list[str] = field(default_factory=list)
    locations: list[str] = field(default_factory=list)


@dataclass
class ProfileFacts:
    skills: list[str] = field(default_factory=list)
    years_experience: int = 0
    preferred_location: str | None = None
    preferred_role_type: str | None = None
    domain_interests: list[str] = field(default_factory=list)


@dataclass
class JobFacts:
    id: int
    title: str
    description: str
    required_skills: list[str]
    experience_level: str
    location: str
    employment_type: str
    domain: str | None
    company_name: str


@dataclass
class ScoreBreakdown:
    job_id: int
    total: float
    band: str | None

    skills_score: float
    skills_matched: list[str]
    skills_missing: list[str]

    role_score: float
    domain_score: float
    domain_matched: bool
    experience_score: float
    location_score: float
    employment_type_score: float
