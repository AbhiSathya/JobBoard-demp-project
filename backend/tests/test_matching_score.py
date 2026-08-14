from app.matching.models import JobFacts, MatchIntent, ProfileFacts
from app.matching.score import score_job
from app.matching.weights import FAIR_THRESHOLD, GOOD_THRESHOLD, STRONG_THRESHOLD


def make_job(**overrides) -> JobFacts:
    defaults = dict(
        id=1,
        title="Backend Engineer",
        description="Build APIs for a healthcare startup using Python and FastAPI.",
        required_skills=["Python", "FastAPI", "PostgreSQL"],
        experience_level="mid",
        location="Berlin",
        employment_type="full_time",
        domain="healthcare",
        company_name="Acme",
    )
    defaults.update(overrides)
    return JobFacts(**defaults)


def test_perfect_match_scores_strong():
    intent = MatchIntent(
        roles=["backend engineer"],
        skills=["Python", "FastAPI", "PostgreSQL"],
        experience_level="mid",
        locations=["Berlin"],
        domains=["healthcare"],
    )
    breakdown = score_job(intent, None, make_job())
    assert breakdown.total >= STRONG_THRESHOLD
    assert breakdown.band == "strong"
    assert breakdown.skills_missing == []


def test_no_overlap_scores_low():
    intent = MatchIntent(
        roles=["graphic designer"],
        skills=["Photoshop", "Illustrator"],
        experience_level="entry",
        locations=["Tokyo"],
        domains=["fashion"],
    )
    breakdown = score_job(intent, None, make_job())
    assert breakdown.total < FAIR_THRESHOLD
    assert breakdown.band is None


def test_empty_intent_does_not_crash_and_stays_in_bounds():
    breakdown = score_job(MatchIntent(), None, make_job())
    assert 0 <= breakdown.total <= 100
    # No skills stated => none matched, but role/domain/experience/location default neutral.
    assert breakdown.skills_score == 0.0
    assert breakdown.role_score == 0.5


def test_skills_score_gives_partial_credit_from_profile():
    intent = MatchIntent(skills=["Python"])
    profile = ProfileFacts(skills=["FastAPI"])
    breakdown = score_job(intent, profile, make_job())
    assert "Python" in breakdown.skills_matched
    assert "FastAPI" in breakdown.skills_matched
    assert breakdown.skills_score < 1.0


def test_missing_skills_are_named():
    intent = MatchIntent(skills=["Python"])
    breakdown = score_job(intent, None, make_job())
    assert "FastAPI" in breakdown.skills_missing
    assert "PostgreSQL" in breakdown.skills_missing


def test_remote_job_always_scores_location_perfectly():
    intent = MatchIntent(locations=["Tokyo"])
    breakdown = score_job(intent, None, make_job(location="Remote"))
    assert breakdown.location_score == 1.0


def test_experience_adjacent_level_gets_partial_credit():
    intent = MatchIntent(experience_level="senior")
    breakdown = score_job(intent, None, make_job(experience_level="mid"))
    assert breakdown.experience_score == 0.5


def test_experience_far_level_gets_zero():
    intent = MatchIntent(experience_level="entry")
    breakdown = score_job(intent, None, make_job(experience_level="lead"))
    assert breakdown.experience_score == 0.0


def test_domain_mismatch_scores_zero_when_stated():
    intent = MatchIntent(domains=["fintech"])
    breakdown = score_job(intent, None, make_job(domain="healthcare"))
    assert breakdown.domain_score == 0.0
    assert breakdown.domain_matched is False


def test_job_with_no_required_skills_is_neutral():
    breakdown = score_job(MatchIntent(skills=["Python"]), None, make_job(required_skills=[]))
    assert breakdown.skills_score == 0.5
    assert breakdown.skills_matched == []


def test_band_boundaries():
    assert GOOD_THRESHOLD < STRONG_THRESHOLD
    assert FAIR_THRESHOLD < GOOD_THRESHOLD


def test_weights_sum_to_100():
    from app.matching.weights import (
        DOMAIN_WEIGHT,
        EMPLOYMENT_WEIGHT,
        EXPERIENCE_WEIGHT,
        LOCATION_WEIGHT,
        ROLE_WEIGHT,
        SKILLS_WEIGHT,
    )

    assert SKILLS_WEIGHT + ROLE_WEIGHT + DOMAIN_WEIGHT + EXPERIENCE_WEIGHT + LOCATION_WEIGHT + EMPLOYMENT_WEIGHT == 100


def test_ranking_order_is_deterministic():
    strong_intent = MatchIntent(skills=["Python", "FastAPI", "PostgreSQL"], domains=["healthcare"])
    good_job = make_job(id=1)
    weak_job = make_job(id=2, required_skills=["Java", "Spring"], domain="finance")

    good_score = score_job(strong_intent, None, good_job).total
    weak_score = score_job(strong_intent, None, weak_job).total
    assert good_score > weak_score
