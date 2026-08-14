"""OpenRouter client for the two jobs an LLM is genuinely better at than code:

  1. turning fuzzy natural language into a structured `MatchIntent`, and
  2. rephrasing an already-computed, already-grounded explanation.

Neither is on the critical path. Ranking lives in `score.py` (pure, unit-tested) and
every explanation has a template fallback, so a provider outage degrades the output's
polish and never its correctness.
"""

import json
import logging
import re
import time
from dataclasses import dataclass

import httpx
from pydantic import ValidationError

from app.core.config import Settings
from app.matching.models import MatchIntent

logger = logging.getLogger("jobboard.matching")

_INTENT_SYSTEM_PROMPT = (
    "You extract structured job-search intent from a candidate's natural-language request. "
    "Only include values explicitly stated or clearly implied by the request. "
    "Use an empty list or null for anything not mentioned. Never invent skills or locations. "
    "Respond with a JSON object only — no prose, no markdown fences."
)

# Hand-written rather than derived from MatchIntent.model_json_schema(): strict mode
# requires every property listed in `required` and no `anyOf` wrappers around nullables,
# which Pydantic's generated schema does not produce.
_INTENT_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "roles": {"type": "array", "items": {"type": "string"}},
        "skills": {"type": "array", "items": {"type": "string"}},
        "experience_level": {"type": ["string", "null"], "enum": ["entry", "mid", "senior", "lead", None]},
        "locations": {"type": "array", "items": {"type": "string"}},
        "domains": {"type": "array", "items": {"type": "string"}},
        "employment_type": {
            "type": ["string", "null"],
            "enum": ["full_time", "part_time", "contract", "internship", None],
        },
    },
    "required": ["roles", "skills", "experience_level", "locations", "domains", "employment_type"],
}

_EXPLANATION_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "explanations": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "job_id": {"type": "integer"},
                    "text": {"type": "string"},
                },
                "required": ["job_id", "text"],
            },
        }
    },
    "required": ["explanations"],
}

_EXPLANATION_SYSTEM_PROMPT = (
    "You rewrite blunt, machine-generated job-match explanations into one natural, "
    "readable sentence or two addressed to the candidate.\n"
    "ABSOLUTE RULES:\n"
    "1. Use ONLY the facts given. Never add a skill, technology, company, location, "
    "seniority or number that is not already in the input text.\n"
    "2. Never turn a neutral statement into a match. If the input says 'this role is in "
    "the edtech domain', it does NOT mean the candidate wanted edtech — say 'this role "
    "is in edtech', never 'you match edtech'. The same goes for location and seniority: "
    "only 'Location (X) matches your preference' means the location matches.\n"
    "3. Keep every mismatch the input mentions — do not soften or omit them.\n"
    "4. Stay under 45 words each."
)


class AIProviderError(Exception):
    """Raised for any provider failure: missing key, timeout, bad status, malformed JSON."""


@dataclass
class ProviderCall:
    """What actually happened on the wire, so the API can report it honestly."""

    model: str
    latency_ms: int


def _strip_fences(text: str) -> str:
    """Models that ignore `response_format` still like markdown fences. Take the JSON out."""
    fenced = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    return (fenced.group(1) if fenced else text).strip()


def _post_once(settings: Settings, model: str, payload: dict, timeout: float) -> dict:
    """One request to one model. Raises AIProviderError for every failure mode."""
    try:
        response = httpx.post(
            f"{settings.openrouter_base_url}/chat/completions",
            headers={"Authorization": f"Bearer {settings.openrouter_api_key}"},
            json={**payload, "model": model},
            timeout=timeout,
        )
    except httpx.TimeoutException as exc:
        raise AIProviderError(f"{model}: request timed out: {exc}") from exc
    except httpx.HTTPError as exc:
        raise AIProviderError(f"{model}: request failed: {exc}") from exc

    if response.status_code != 200:
        raise AIProviderError(f"{model}: HTTP {response.status_code}: {response.text[:200]}")

    try:
        content = response.json()["choices"][0]["message"]["content"]
    except (KeyError, IndexError, ValueError) as exc:
        raise AIProviderError(f"{model}: response envelope was not usable: {exc}") from exc

    # A 200 with `content: null` is a real OpenRouter response, not a hypothetical: a
    # reasoning model that spends its whole token allowance thinking returns exactly
    # that. Without this guard it reached the regex as None and raised a TypeError,
    # which is not an AIProviderError — so it escaped the fallback and became a 500.
    if not isinstance(content, str) or not content.strip():
        raise AIProviderError(f"{model}: returned empty content (likely truncated by max_tokens).")

    try:
        parsed = json.loads(_strip_fences(content))
    except json.JSONDecodeError as exc:
        raise AIProviderError(f"{model}: content was not JSON: {exc}") from exc

    if not isinstance(parsed, dict):
        raise AIProviderError(f"{model}: content was JSON but not an object.")
    return parsed


# The model that answered most recently, tried first next time. Free-tier rate limits are
# sticky for minutes at a time, so without this every request re-walks the same 429s and a
# two-call match request pays for them twice — measured at 65s before this was added.
_last_good_model: str | None = None


def _chain_order(models: list[str]) -> list[str]:
    if _last_good_model in models:
        return [_last_good_model] + [m for m in models if m != _last_good_model]
    return list(models)


def call_chain(
    settings: Settings, payload: dict, budget_seconds: float | None = None
) -> tuple[dict, ProviderCall]:
    """Try each configured model in order; the first that answers usably wins.

    `budget_seconds` caps the whole walk, not each attempt, so a request cannot spend
    models × timeout in the worst case.
    """
    global _last_good_model

    if not settings.openrouter_api_key:
        raise AIProviderError("No OpenRouter API key configured.")
    if not settings.openrouter_models:
        raise AIProviderError("No OpenRouter models configured.")

    deadline = time.perf_counter() + budget_seconds if budget_seconds else None
    failures: list[str] = []
    for model in _chain_order(settings.openrouter_models):
        if deadline and time.perf_counter() >= deadline:
            failures.append("budget exhausted before trying " + model)
            break
        # httpx's timeout is per-read, not per-request: a model that trickles tokens out
        # slowly never trips it, which is how a "12s" call was measured at 36s. Capping
        # each attempt at whatever budget is left makes the deadline actually binding.
        timeout = settings.ai_timeout_seconds
        if deadline:
            timeout = min(timeout, deadline - time.perf_counter())

        started = time.perf_counter()
        try:
            parsed = _post_once(settings, model, payload, timeout)
        except AIProviderError as exc:
            failures.append(str(exc))
            logger.warning("AI model %s unusable, trying next: %s", model, exc)
            continue
        latency_ms = int((time.perf_counter() - started) * 1000)
        logger.info("AI call succeeded via %s in %dms", model, latency_ms)
        _last_good_model = model
        return parsed, ProviderCall(model=model, latency_ms=latency_ms)

    raise AIProviderError("All configured models failed: " + " | ".join(failures))


def _schema_payload(name: str, schema: dict, system: str, user: str, max_tokens: int) -> dict:
    return {
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "temperature": 0,
        # Generation time is the real latency driver on the free tier, and both outputs
        # here are small and bounded. Without this a chatty model can run for 30s+.
        "max_tokens": max_tokens,
        "response_format": {
            "type": "json_schema",
            "json_schema": {"name": name, "strict": True, "schema": schema},
        },
    }


def extract_intent_llm(
    query: str, settings: Settings, budget_seconds: float | None = None
) -> tuple[MatchIntent, ProviderCall]:
    parsed, call = call_chain(
        settings,
        _schema_payload("match_intent", _INTENT_SCHEMA, _INTENT_SYSTEM_PROMPT, query, 800),
        budget_seconds,
    )
    try:
        return MatchIntent.model_validate(parsed), call
    except ValidationError as exc:
        raise AIProviderError(f"{call.model}: response failed schema validation: {exc}") from exc


def rewrite_explanations_llm(
    items: list[tuple[int, str]], settings: Settings, budget_seconds: float | None = None
) -> tuple[dict[int, str], ProviderCall]:
    """Rephrase `(job_id, template_explanation)` pairs in a single batched call.

    The caller is responsible for fact-checking the result before using it — see
    `app.matching.llm_explain.accept_rewrite`.
    """
    user = json.dumps([{"job_id": job_id, "text": text} for job_id, text in items])
    parsed, call = call_chain(
        settings,
        _schema_payload("explanations", _EXPLANATION_SCHEMA, _EXPLANATION_SYSTEM_PROMPT, user, 1200),
        budget_seconds,
    )
    entries = parsed.get("explanations")
    if not isinstance(entries, list):
        raise AIProviderError(f"{call.model}: explanations field missing or not a list.")

    out: dict[int, str] = {}
    for entry in entries:
        if isinstance(entry, dict) and isinstance(entry.get("job_id"), int):
            text = entry.get("text")
            if isinstance(text, str) and text.strip():
                out[entry["job_id"]] = text.strip()
    return out, call
