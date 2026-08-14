import logging

from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.matching.explain import explain
from app.matching.intent import extract_intent_deterministic
from app.matching.models import JobFacts, MatchIntent, MatchVocab, ProfileFacts
from app.matching.provider import AIProviderError, extract_intent_llm
from app.matching.score import score_job
from app.matching.weights import FAIR_THRESHOLD
from app.models.candidate_profile import CandidateProfile
from app.models.enums import JobStatus
from app.models.job import Job
from app.models.user import User
from app.schemas.job import JobOut
from app.schemas.match import MatchResponse, MatchResult

logger = logging.getLogger("jobboard.matching")

TOP_N_WHEN_NO_STRONG_MATCH = 3


def _build_vocab(db: Session) -> MatchVocab:
    jobs = db.query(Job).filter(Job.status == JobStatus.open).all()
    skills: set[str] = set()
    domains: set[str] = set()
    locations: set[str] = set()
    for job in jobs:
        skills.update(s for s in job.required_skills if s.strip())
        if job.domain:
            domains.add(job.domain)
        if job.location:
            locations.add(job.location)
    return MatchVocab(skills=sorted(skills), domains=sorted(domains), locations=sorted(locations))


def _to_job_facts(job: Job) -> JobFacts:
    return JobFacts(
        id=job.id,
        title=job.title,
        description=job.description,
        required_skills=job.required_skills,
        experience_level=job.experience_level.value,
        location=job.location,
        employment_type=job.employment_type.value,
        domain=job.domain,
        company_name=job.company_name,
    )


def _to_profile_facts(profile: CandidateProfile | None) -> ProfileFacts | None:
    if profile is None:
        return None
    return ProfileFacts(
        skills=profile.skills,
        years_experience=profile.years_experience,
        preferred_location=profile.preferred_location,
        preferred_role_type=profile.preferred_role_type,
        domain_interests=profile.domain_interests,
    )


def resolve_intent(query: str, vocab: MatchVocab, settings: Settings) -> tuple[MatchIntent, bool]:
    """Returns (intent, used_ai). Falls back to the deterministic extractor on any AI failure."""
    if settings.openrouter_api_key:
        try:
            return extract_intent_llm(query, settings), True
        except AIProviderError as exc:
            logger.warning("AI intent extraction failed, using deterministic fallback: %s", exc)
    return extract_intent_deterministic(query, vocab), False


def _is_low_confidence(intent: MatchIntent) -> bool:
    fields = [
        intent.roles,
        intent.skills,
        intent.experience_level,
        intent.locations,
        intent.domains,
        intent.employment_type,
    ]
    return not any(fields)


def match_jobs_for_query(db: Session, candidate: User, query: str) -> MatchResponse:
    settings = get_settings()
    vocab = _build_vocab(db)
    intent, used_ai = resolve_intent(query, vocab, settings)

    profile = db.query(CandidateProfile).filter(CandidateProfile.user_id == candidate.id).first()
    profile_facts = _to_profile_facts(profile)

    open_jobs = db.query(Job).filter(Job.status == JobStatus.open).all()

    scored = []
    for job in open_jobs:
        facts = _to_job_facts(job)
        breakdown = score_job(intent, profile_facts, facts)
        scored.append((job, facts, breakdown))

    scored.sort(key=lambda t: t[2].total, reverse=True)

    strong_enough = [t for t in scored if t[2].total >= FAIR_THRESHOLD]
    weak_matches_only = not strong_enough and bool(scored)
    chosen = strong_enough if strong_enough else scored[:TOP_N_WHEN_NO_STRONG_MATCH]

    results = [
        MatchResult(
            job=JobOut.model_validate(job),
            score=breakdown.total,
            band=breakdown.band,
            explanation=explain(breakdown, profile_facts, facts),
            skills_matched=breakdown.skills_matched,
            skills_missing=breakdown.skills_missing,
        )
        for job, facts, breakdown in chosen
    ]

    return MatchResponse(
        intent=intent,
        used_ai=used_ai,
        low_confidence=_is_low_confidence(intent),
        results=results,
        weak_matches_only=weak_matches_only,
    )
