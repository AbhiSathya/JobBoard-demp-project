"""Grounding: the model can add understanding, never invent facts, never subtract.

`ground_intent` is what stops an LLM answering "Kubernetes" for a board that has never
posted a Kubernetes job, and `resolve_intent`'s merge is what stops a flaky model reply
losing what the deterministic extractor already understood.
"""

import httpx

from app.core.config import Settings
from app.matching.models import MatchIntent, MatchVocab
from app.services.match import ground_intent, resolve_intent

VOCAB = MatchVocab(
    skills=["Python", "FastAPI", "React"],
    domains=["healthcare", "fintech"],
    locations=["Berlin", "Remote"],
)


def settings(**overrides) -> Settings:
    defaults = dict(openrouter_api_key="k", openrouter_models=["m"], _env_file=None)
    defaults.update(overrides)
    return Settings(**defaults)


def intent_response(payload: str) -> httpx.Response:
    return httpx.Response(
        200,
        json={"choices": [{"message": {"content": payload}}]},
        request=httpx.Request("POST", "http://x"),
    )


def test_unknown_skill_is_dropped():
    grounded = ground_intent(MatchIntent(skills=["Python", "Kubernetes"]), VOCAB)
    assert grounded.skills == ["Python"]


def test_casing_is_normalised_to_the_boards_own():
    grounded = ground_intent(MatchIntent(skills=["python", "FASTAPI"]), VOCAB)
    assert grounded.skills == ["Python", "FastAPI"]


def test_unknown_location_and_domain_are_dropped():
    grounded = ground_intent(MatchIntent(locations=["Atlantis"], domains=["cryptozoology"]), VOCAB)
    assert grounded.locations == []
    assert grounded.domains == []


def test_invalid_enum_values_become_none():
    grounded = ground_intent(MatchIntent(experience_level="wizard", employment_type="indentured"), VOCAB)
    assert grounded.experience_level is None
    assert grounded.employment_type is None


def test_no_api_key_uses_deterministic_result():
    intent, model, latency = resolve_intent(
        "senior Python role in Berlin", VOCAB, settings(openrouter_api_key=None)
    )
    assert model is None
    assert latency == 0
    assert intent.skills == ["Python"]
    assert intent.experience_level == "senior"


def test_provider_failure_falls_back_without_raising(monkeypatch):
    monkeypatch.setattr(httpx, "post", lambda *a, **k: (_ for _ in ()).throw(httpx.ConnectError("no")))
    intent, model, _ = resolve_intent("senior Python role", VOCAB, settings())
    assert model is None
    assert intent.skills == ["Python"]


def test_llm_adds_to_the_deterministic_result_and_never_removes(monkeypatch):
    # The query literally says Python; the model returns only React plus a level.
    payload = (
        '{"roles": [], "skills": ["React"], "experience_level": "senior", '
        '"locations": [], "domains": [], "employment_type": null}'
    )
    monkeypatch.setattr(httpx, "post", lambda *a, **k: intent_response(payload))
    intent, model, _ = resolve_intent("Python work", VOCAB, settings())
    assert model == "m"
    assert set(intent.skills) == {"Python", "React"}


def test_llm_hallucination_is_stripped_before_scoring(monkeypatch):
    payload = (
        '{"roles": [], "skills": ["Kubernetes", "Rust"], "experience_level": null, '
        '"locations": ["Atlantis"], "domains": [], "employment_type": null}'
    )
    monkeypatch.setattr(httpx, "post", lambda *a, **k: intent_response(payload))
    intent, _, _ = resolve_intent("something", VOCAB, settings())
    assert intent.skills == []
    assert intent.locations == []
