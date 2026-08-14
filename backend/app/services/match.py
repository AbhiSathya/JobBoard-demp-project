import logging
import time

from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.matching.explain import explain
from app.matching.intent import extract_intent_deterministic
from app.matching.llm_explain import accept_rewrite
from app.matching.models import JobFacts, MatchIntent, MatchVocab, ProfileFacts, ScoreBreakdown
from app.matching.provider import AIProviderError, extract_intent_llm, rewrite_explanations_llm
from app.matching.score import score_job
from app.matching.weights import FAIR_THRESHOLD
from app.models.candidate_profile import CandidateProfile
from app.models.enums import EmploymentType, ExperienceLevel, JobStatus
from app.models.job import Job
from app.models.user import User
from app.schemas.job import JobOut
from app.schemas.match import MatchResponse, MatchResult

logger = logging.getLogger("jobboard.matching")

TOP_N_WHEN_NO_STRONG_MATCH = 3
REWRITE_TOP_N = 3

# How long the whole request may spend talking to the model. Intent gets first call on it;
# explanations are polish and only run if there is meaningful time left, so a slow or
# rate-limited provider costs prettier wording and never a slow page.
AI_TOTAL_BUDGET_SECONDS = 18.0
MIN_BUDGET_FOR_EXPLANATIONS = 7.0


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


def _canonicalise(values: list[str], vocab_terms: list[str]) -> list[str]:
    """Keep only values the job board actually knows about, in the vocabulary's own casing.

    This is what stops the model inventing a skill. If it answers "Kubernetes" for a board
    that has never posted a Kubernetes job, the term is dropped rather than scored against.
    """
    lookup = {term.strip().lower(): term.strip() for term in vocab_terms if term.strip()}
    out: list[str] = []
    for value in values:
        canonical = lookup.get(value.strip().lower())
        if canonical and canonical not in out:
            out.append(canonical)
    return out


def ground_intent(intent: MatchIntent, vocab: MatchVocab) -> MatchIntent:
    """Strip anything the model produced that isn't a real value on this board."""
    levels = {level.value for level in ExperienceLevel}
    types = {etype.value for etype in EmploymentType}
    return MatchIntent(
        roles=[r.strip() for r in intent.roles if r.strip()][:5],
        skills=_canonicalise(intent.skills, vocab.skills),
        experience_level=intent.experience_level if intent.experience_level in levels else None,
        locations=_canonicalise(intent.locations, vocab.locations),
        domains=_canonicalise(intent.domains, vocab.domains),
        employment_type=intent.employment_type if intent.employment_type in types else None,
    )


def _merge(base: MatchIntent, extra: MatchIntent) -> MatchIntent:
    """Union two intents; `extra` fills gaps and adds terms, it never removes any."""

    def union(a: list[str], b: list[str]) -> list[str]:
        seen = {x.lower() for x in a}
        return a + [x for x in b if x.lower() not in seen]

    return MatchIntent(
        roles=union(base.roles, extra.roles),
        skills=union(base.skills, extra.skills),
        experience_level=base.experience_level or extra.experience_level,
        locations=union(base.locations, extra.locations),
        domains=union(base.domains, extra.domains),
        employment_type=base.employment_type or extra.employment_type,
    )


def resolve_intent(
    query: str, vocab: MatchVocab, settings: Settings, budget_seconds: float | None = None
) -> tuple[MatchIntent, str | None, int]:
    """Returns (intent, model_used, latency_ms).

    The deterministic extractor always runs. The LLM, when it is reachable, is merged on
    top of it after being grounded against the vocabulary — so the AI can only ever add
    understanding, never subtract it or invent it. `model_used` is None when the LLM
    could not be reached at all, which is what the caller reports as a fallback.
    """
    deterministic = extract_intent_deterministic(query, vocab)
    if not settings.openrouter_api_key:
        return deterministic, None, 0
    try:
        llm_intent, call = extract_intent_llm(query, settings, budget_seconds)
    except AIProviderError as exc:
        logger.warning("AI intent extraction failed, using deterministic result: %s", exc)
        return deterministic, None, 0
    except Exception:
        # The deterministic path is the contract: nothing the provider does, including a
        # shape nobody anticipated, may turn a match request into a 500. Logged with a
        # traceback so an unexpected failure is still visible rather than silent.
        logger.exception("Unexpected AI failure during intent extraction; using deterministic result")
        return deterministic, None, 0
    return _merge(deterministic, ground_intent(llm_intent, vocab)), call.model, call.latency_ms


def _is_low_confidence(intent: MatchIntent) -> bool:
    return not any(
        [
            intent.roles,
            intent.skills,
            intent.experience_level,
            intent.locations,
            intent.domains,
            intent.employment_type,
        ]
    )


def _fact_set(breakdown: ScoreBreakdown, job: JobFacts) -> set[str]:
    """Every term this match is allowed to mention at all."""
    facts = set(breakdown.skills_matched) | set(breakdown.skills_missing)
    facts.update({job.location, job.company_name, job.experience_level, job.employment_type})
    if job.domain:
        facts.add(job.domain)
    return {f for f in facts if f}


def _unmatched_facts(breakdown: ScoreBreakdown, job: JobFacts) -> set[str]:
    """Terms this match may name but must not claim as a match.

    Without this the model happily turns "this role is in the edtech domain" into "you
    match the edtech domain" — every word legitimate, the claim false.
    """
    unmatched = set(breakdown.skills_missing)
    if job.domain and not breakdown.domain_matched:
        unmatched.add(job.domain)
    if breakdown.experience_score < 1.0:
        unmatched.add(job.experience_level)
    if breakdown.location_score < 1.0:
        unmatched.add(job.location)
    return {f for f in unmatched if f}


def _polish_explanations(
    chosen: list[tuple[Job, JobFacts, ScoreBreakdown]],
    templates: dict[int, str],
    vocab: MatchVocab,
    settings: Settings,
    budget_seconds: float,
) -> tuple[dict[int, str], bool]:
    """Ask the LLM to rephrase the top explanations, keeping only the faithful rewrites.

    Returns (accepted_rewrites, llm_reachable). Anything rejected simply keeps its
    template text, so a bad rewrite costs polish and never correctness.
    """
    top = chosen[:REWRITE_TOP_N]
    if not top:
        return {}, True

    try:
        payload = [(job.id, templates[job.id]) for job, _, _ in top]
        rewrites, call = rewrite_explanations_llm(payload, settings, budget_seconds)
    except AIProviderError as exc:
        logger.warning("AI explanation rewrite failed, keeping template text: %s", exc)
        return {}, False
    except Exception:
        logger.exception("Unexpected AI failure during explanation rewrite; keeping template text")
        return {}, False

    known = {*vocab.skills, *vocab.locations, *vocab.domains}
    accepted: dict[int, str] = {}
    for job, facts, breakdown in top:
        candidate = rewrites.get(job.id)
        if candidate is None:
            continue
        if accept_rewrite(
            templates[job.id],
            candidate,
            _fact_set(breakdown, facts),
            known,
            _unmatched_facts(breakdown, facts),
        ):
            accepted[job.id] = candidate
        else:
            logger.warning("Rejected hallucinated rewrite for job %s from %s", job.id, call.model)
    return accepted, True


def match_jobs_for_query(db: Session, candidate: User, query: str) -> MatchResponse:
    settings = get_settings()
    started = time.perf_counter()
    vocab = _build_vocab(db)
    intent, model_used, latency_ms = resolve_intent(query, vocab, settings, AI_TOTAL_BUDGET_SECONDS)

    profile = db.query(CandidateProfile).filter(CandidateProfile.user_id == candidate.id).first()
    profile_facts = _to_profile_facts(profile)

    open_jobs = db.query(Job).filter(Job.status == JobStatus.open).all()

    scored = []
    for job in open_jobs:
        facts = _to_job_facts(job)
        scored.append((job, facts, score_job(intent, profile_facts, facts)))

    scored.sort(key=lambda t: t[2].total, reverse=True)

    strong_enough = [t for t in scored if t[2].total >= FAIR_THRESHOLD]
    weak_matches_only = not strong_enough and bool(scored)
    chosen = strong_enough if strong_enough else scored[:TOP_N_WHEN_NO_STRONG_MATCH]

    templates = {job.id: explain(bd, profile_facts, facts) for job, facts, bd in chosen}

    rewrites: dict[int, str] = {}
    explanations_ok = True
    remaining = AI_TOTAL_BUDGET_SECONDS - (time.perf_counter() - started)
    if model_used and settings.ai_explanations and remaining >= MIN_BUDGET_FOR_EXPLANATIONS:
        rewrites, explanations_ok = _polish_explanations(chosen, templates, vocab, settings, remaining)
    elif model_used and settings.ai_explanations:
        logger.info("Skipping explanation rewrite: only %.1fs of AI budget left", remaining)
        explanations_ok = False

    if model_used is None:
        ai_status = "fallback"
    elif explanations_ok:
        ai_status = "live"
    else:
        ai_status = "degraded"

    results = [
        MatchResult(
            job=JobOut.model_validate(job),
            score=breakdown.total,
            band=breakdown.band,
            explanation=rewrites.get(job.id, templates[job.id]),
            explanation_source="ai" if job.id in rewrites else "rules",
            skills_matched=breakdown.skills_matched,
            skills_missing=breakdown.skills_missing,
            breakdown={
                "skills": breakdown.skills_score,
                "role": breakdown.role_score,
                "domain": breakdown.domain_score,
                "experience": breakdown.experience_score,
                "location": breakdown.location_score,
                "employment_type": breakdown.employment_type_score,
            },
        )
        for job, facts, breakdown in chosen
    ]

    return MatchResponse(
        intent=intent,
        used_ai=model_used is not None,
        ai_status=ai_status,
        model_used=model_used,
        latency_ms=latency_ms,
        low_confidence=_is_low_confidence(intent),
        results=results,
        weak_matches_only=weak_matches_only,
    )
