"""One real call to OpenRouter, to prove the key and the model chain are actually alive.

Skipped by default: the rest of the suite must stay offline, fast and deterministic.
Run it by hand before a demo:

    RUN_LIVE_AI=1 .venv/bin/python -m pytest tests/test_live_openrouter.py -v -s

It asserts only what the contract promises — a parseable MatchIntent that picked up the
obvious terms — not exact wording, because the model is free to phrase things its own way.
"""

import os
from pathlib import Path

import pytest
from dotenv import dotenv_values

from app.core.config import DEFAULT_MODEL_CHAIN, Settings
from app.matching.provider import extract_intent_llm, rewrite_explanations_llm

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_LIVE_AI") != "1",
    reason="Live provider test — set RUN_LIVE_AI=1 to run it.",
)


@pytest.fixture()
def live_settings() -> Settings:
    # Read backend/.env directly. conftest blanks OPENROUTER_API_KEY in os.environ to keep
    # the rest of the suite offline, and environment beats dotenv in pydantic-settings, so
    # the value has to be pulled from the file explicitly here.
    values = dotenv_values(Path(__file__).resolve().parents[1] / ".env")
    key = values.get("OPENROUTER_API_KEY")
    if not key:
        pytest.skip("No OPENROUTER_API_KEY configured in backend/.env")

    return Settings(
        _env_file=None,
        openrouter_api_key=key,
        openrouter_models=values.get("OPENROUTER_MODELS") or DEFAULT_MODEL_CHAIN,
        ai_timeout_seconds=float(values.get("AI_TIMEOUT_SECONDS") or 20),
    )


def test_live_intent_extraction(live_settings):
    intent, call = extract_intent_llm(
        "I'm after a senior Python backend role at a healthcare company, fully remote",
        live_settings,
    )
    print(f"\n  model={call.model}  latency={call.latency_ms}ms\n  intent={intent}")

    assert call.model in live_settings.openrouter_models
    assert intent.experience_level == "senior"
    assert any("python" in s.lower() for s in intent.skills)
    assert any("health" in d.lower() for d in intent.domains)


def test_live_explanation_rewrite(live_settings):
    source = "Matches 2 of 3 required skills (Python, FastAPI). Missing: React. Location: Remote."
    out, call = rewrite_explanations_llm([(1, source)], live_settings)
    print(f"\n  model={call.model}  rewrite={out.get(1)!r}")

    assert 1 in out
    assert out[1].strip()
