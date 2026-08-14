import json
import logging

import httpx
from pydantic import ValidationError

from app.core.config import Settings
from app.matching.models import MatchIntent

logger = logging.getLogger("jobboard.matching")

_SYSTEM_PROMPT = (
    "You extract structured job-search intent from a candidate's natural-language request. "
    "Respond with ONLY a JSON object matching this shape, no prose, no markdown fences:\n"
    '{"roles": [string], "skills": [string], "experience_level": '
    '"entry"|"mid"|"senior"|"lead"|null, "locations": [string], "domains": [string], '
    '"employment_type": "full_time"|"part_time"|"contract"|"internship"|null}\n'
    "Only include values explicitly stated or clearly implied by the request. "
    "Use an empty list or null for anything not mentioned. Never invent skills or locations."
)


class AIProviderError(Exception):
    """Raised for any provider failure: missing key, timeout, bad HTTP status, malformed JSON."""


def extract_intent_llm(query: str, settings: Settings) -> MatchIntent:
    if not settings.openrouter_api_key:
        raise AIProviderError("No OpenRouter API key configured.")

    try:
        response = httpx.post(
            f"{settings.openrouter_base_url}/chat/completions",
            headers={"Authorization": f"Bearer {settings.openrouter_api_key}"},
            json={
                "model": settings.openrouter_model,
                "messages": [
                    {"role": "system", "content": _SYSTEM_PROMPT},
                    {"role": "user", "content": query},
                ],
                "temperature": 0,
            },
            timeout=settings.ai_timeout_seconds,
        )
    except httpx.TimeoutException as exc:
        raise AIProviderError(f"OpenRouter request timed out: {exc}") from exc
    except httpx.HTTPError as exc:
        raise AIProviderError(f"OpenRouter request failed: {exc}") from exc

    if response.status_code != 200:
        raise AIProviderError(f"OpenRouter returned HTTP {response.status_code}: {response.text[:200]}")

    try:
        content = response.json()["choices"][0]["message"]["content"]
        parsed = json.loads(content)
    except (KeyError, IndexError, json.JSONDecodeError) as exc:
        raise AIProviderError(f"OpenRouter response was not usable JSON: {exc}") from exc

    try:
        return MatchIntent.model_validate(parsed)
    except ValidationError as exc:
        raise AIProviderError(f"OpenRouter response failed schema validation: {exc}") from exc
