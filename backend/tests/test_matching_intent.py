from app.matching.intent import extract_intent_deterministic
from app.matching.models import MatchVocab

VOCAB = MatchVocab(
    skills=["Python", "FastAPI", "React", "Java", "Go"],
    domains=["healthcare", "fintech"],
    locations=["Berlin", "Remote"],
)


def test_specific_query_extracts_all_fields():
    intent = extract_intent_deterministic(
        "I want a senior Python backend engineer role in a healthcare startup, remote", VOCAB
    )
    assert "Python" in intent.skills
    assert intent.experience_level == "senior"
    assert "healthcare" in intent.domains
    assert "remote" in [loc.lower() for loc in intent.locations]
    assert any("engineer" in r for r in intent.roles)


def test_vague_query_returns_empty_intent_not_error():
    intent = extract_intent_deterministic("something interesting please", VOCAB)
    assert intent.skills == []
    assert intent.experience_level is None


def test_empty_query_does_not_crash():
    intent = extract_intent_deterministic("", VOCAB)
    assert intent.skills == []


def test_unknown_skill_not_in_vocab_is_ignored():
    intent = extract_intent_deterministic("I know COBOL and Python", VOCAB)
    assert intent.skills == ["Python"]


def test_employment_type_detected():
    intent = extract_intent_deterministic("Looking for a part-time developer role", VOCAB)
    assert intent.employment_type == "part_time"


def test_short_skill_name_does_not_match_inside_unrelated_word():
    # "Go" must not match the "go" inside "good" — word-boundary matching, not substring.
    intent = extract_intent_deterministic("something good please", VOCAB)
    assert intent.skills == []
