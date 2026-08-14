from app.matching.models import JobFacts, MatchIntent, ProfileFacts, ScoreBreakdown
from app.matching.weights import (
    DOMAIN_WEIGHT,
    EMPLOYMENT_WEIGHT,
    EXPERIENCE_ORDER,
    EXPERIENCE_WEIGHT,
    FAIR_THRESHOLD,
    GOOD_THRESHOLD,
    LOCATION_WEIGHT,
    PROFILE_ONLY_SKILL_CREDIT,
    ROLE_WEIGHT,
    SKILLS_WEIGHT,
    STRONG_THRESHOLD,
)

_STOPWORDS = {"a", "an", "the", "in", "at", "for", "and", "or", "role", "job", "position", "of"}


def _tokens(text: str) -> set[str]:
    return {w for w in text.lower().replace("-", " ").split() if w and w not in _STOPWORDS}


def _score_skills(
    intent: MatchIntent, profile: ProfileFacts | None, job: JobFacts
) -> tuple[float, list[str], list[str]]:
    required = {s.strip().lower() for s in job.required_skills if s.strip()}
    if not required:
        return 0.5, [], []

    query_skills = {s.strip().lower() for s in intent.skills}
    profile_skills = {s.strip().lower() for s in (profile.skills if profile else [])}

    matched: list[str] = []
    earned = 0.0
    for skill in job.required_skills:
        key = skill.strip().lower()
        if not key:
            continue
        if key in query_skills:
            earned += 1.0
            matched.append(skill)
        elif key in profile_skills:
            earned += PROFILE_ONLY_SKILL_CREDIT
            matched.append(skill)

    missing = [s for s in job.required_skills if s.strip().lower() not in {m.lower() for m in matched}]
    score = min(earned / len(required), 1.0)
    return score, matched, missing


def _score_role(intent: MatchIntent, profile: ProfileFacts | None, job: JobFacts) -> float:
    role_terms = " ".join(intent.roles)
    if not role_terms and profile and profile.preferred_role_type:
        role_terms = profile.preferred_role_type
    if not role_terms:
        return 0.5

    role_tokens = _tokens(role_terms)
    title_tokens = _tokens(job.title)
    if not role_tokens or not title_tokens:
        return 0.5

    overlap = len(role_tokens & title_tokens) / len(role_tokens)
    if overlap == 0 and role_tokens & _tokens(job.description):
        overlap = 0.3
    return min(overlap, 1.0)


def _score_domain(intent: MatchIntent, profile: ProfileFacts | None, job: JobFacts) -> tuple[float, bool]:
    if not job.domain:
        return 0.6, False

    # What the candidate just asked for beats what their profile says in general — the
    # same precedence location already uses. Unioning the two meant a query saying
    # "healthcare" still scored a fintech role full marks off a profile interest, and
    # then explained it as "matches your stated interest", which was simply untrue.
    candidate_domains = {d.strip().lower() for d in intent.domains}
    if not candidate_domains and profile:
        candidate_domains = {d.strip().lower() for d in profile.domain_interests}

    if not candidate_domains:
        return 0.6, False

    matched = job.domain.strip().lower() in candidate_domains
    return (1.0, True) if matched else (0.0, False)


def _score_experience(intent: MatchIntent, job: JobFacts) -> float:
    level = intent.experience_level
    if not level or level not in EXPERIENCE_ORDER or job.experience_level not in EXPERIENCE_ORDER:
        return 0.6

    diff = abs(EXPERIENCE_ORDER.index(level) - EXPERIENCE_ORDER.index(job.experience_level))
    if diff == 0:
        return 1.0
    if diff == 1:
        return 0.5
    return 0.0


def _score_location(intent: MatchIntent, profile: ProfileFacts | None, job: JobFacts) -> float:
    if job.location.strip().lower() == "remote":
        return 1.0

    locations = [loc.strip().lower() for loc in intent.locations]
    if not locations and profile and profile.preferred_location:
        locations = [profile.preferred_location.strip().lower()]
    if not locations:
        return 0.6

    job_location = job.location.strip().lower()
    for loc in locations:
        if loc == "remote":
            continue
        if loc in job_location or job_location in loc:
            return 1.0
    return 0.0


def _score_employment_type(intent: MatchIntent, job: JobFacts) -> float:
    if not intent.employment_type:
        return 0.6
    return 1.0 if intent.employment_type.strip().lower() == job.employment_type.strip().lower() else 0.0


def _band(total: float) -> str | None:
    if total >= STRONG_THRESHOLD:
        return "strong"
    if total >= GOOD_THRESHOLD:
        return "good"
    if total >= FAIR_THRESHOLD:
        return "fair"
    return None


def score_job(intent: MatchIntent, profile: ProfileFacts | None, job: JobFacts) -> ScoreBreakdown:
    skills_score, skills_matched, skills_missing = _score_skills(intent, profile, job)
    role_score = _score_role(intent, profile, job)
    domain_score, domain_matched = _score_domain(intent, profile, job)
    experience_score = _score_experience(intent, job)
    location_score = _score_location(intent, profile, job)
    employment_score = _score_employment_type(intent, job)

    total = (
        skills_score * SKILLS_WEIGHT
        + role_score * ROLE_WEIGHT
        + domain_score * DOMAIN_WEIGHT
        + experience_score * EXPERIENCE_WEIGHT
        + location_score * LOCATION_WEIGHT
        + employment_score * EMPLOYMENT_WEIGHT
    )

    return ScoreBreakdown(
        job_id=job.id,
        total=round(total, 1),
        band=_band(total),
        skills_score=skills_score,
        skills_matched=skills_matched,
        skills_missing=skills_missing,
        role_score=role_score,
        domain_score=domain_score,
        domain_matched=domain_matched,
        experience_score=experience_score,
        location_score=location_score,
        employment_type_score=employment_score,
    )
