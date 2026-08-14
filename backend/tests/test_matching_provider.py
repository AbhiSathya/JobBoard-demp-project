import httpx
import pytest

from app.core.config import Settings
from app.matching.provider import AIProviderError, extract_intent_llm


def make_settings(**overrides) -> Settings:
    defaults = dict(openrouter_api_key="test-key", ai_timeout_seconds=1.0)
    defaults.update(overrides)
    return Settings(**defaults)


def test_no_api_key_raises():
    with pytest.raises(AIProviderError):
        extract_intent_llm("python role", make_settings(openrouter_api_key=None))


def test_timeout_raises(monkeypatch):
    def fake_post(*args, **kwargs):
        raise httpx.TimeoutException("timed out")

    monkeypatch.setattr(httpx, "post", fake_post)
    with pytest.raises(AIProviderError, match="timed out"):
        extract_intent_llm("python role", make_settings())


def test_network_error_raises(monkeypatch):
    def fake_post(*args, **kwargs):
        raise httpx.ConnectError("connection refused")

    monkeypatch.setattr(httpx, "post", fake_post)
    with pytest.raises(AIProviderError):
        extract_intent_llm("python role", make_settings())


def test_non_200_status_raises(monkeypatch):
    def fake_post(*args, **kwargs):
        return httpx.Response(429, text="rate limited", request=httpx.Request("POST", "http://x"))

    monkeypatch.setattr(httpx, "post", fake_post)
    with pytest.raises(AIProviderError, match="429"):
        extract_intent_llm("python role", make_settings())


def test_malformed_json_body_raises(monkeypatch):
    def fake_post(*args, **kwargs):
        return httpx.Response(200, text="not json at all", request=httpx.Request("POST", "http://x"))

    monkeypatch.setattr(httpx, "post", fake_post)
    with pytest.raises(AIProviderError):
        extract_intent_llm("python role", make_settings())


def test_content_not_valid_json_raises(monkeypatch):
    def fake_post(*args, **kwargs):
        body = {"choices": [{"message": {"content": "I think you want a Python role"}}]}
        return httpx.Response(200, json=body, request=httpx.Request("POST", "http://x"))

    monkeypatch.setattr(httpx, "post", fake_post)
    with pytest.raises(AIProviderError):
        extract_intent_llm("python role", make_settings())


def test_schema_invalid_json_raises(monkeypatch):
    def fake_post(*args, **kwargs):
        # "skills" should be a list, not a string — fails MatchIntent validation
        body = {"choices": [{"message": {"content": '{"skills": "python"}'}}]}
        return httpx.Response(200, json=body, request=httpx.Request("POST", "http://x"))

    monkeypatch.setattr(httpx, "post", fake_post)
    with pytest.raises(AIProviderError):
        extract_intent_llm("python role", make_settings())


def test_valid_response_parses_successfully(monkeypatch):
    def fake_post(*args, **kwargs):
        body = {
            "choices": [
                {
                    "message": {
                        "content": (
                            '{"roles": ["backend engineer"], "skills": ["Python"], '
                            '"experience_level": "senior", "locations": ["Remote"], '
                            '"domains": ["healthcare"], "employment_type": "full_time"}'
                        )
                    }
                }
            ]
        }
        return httpx.Response(200, json=body, request=httpx.Request("POST", "http://x"))

    monkeypatch.setattr(httpx, "post", fake_post)
    intent = extract_intent_llm("senior python backend role in healthcare, remote", make_settings())
    assert intent.skills == ["Python"]
    assert intent.experience_level == "senior"
