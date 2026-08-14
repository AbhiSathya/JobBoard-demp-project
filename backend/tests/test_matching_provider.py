import httpx
import pytest

from app.core.config import Settings
from app.matching.provider import AIProviderError, extract_intent_llm, rewrite_explanations_llm


def make_settings(**overrides) -> Settings:
    defaults = dict(
        openrouter_api_key="test-key",
        ai_timeout_seconds=1.0,
        openrouter_models=["model-a"],
        _env_file=None,
    )
    defaults.update(overrides)
    return Settings(**defaults)


def json_response(content: str) -> httpx.Response:
    body = {"choices": [{"message": {"content": content}}]}
    return httpx.Response(200, json=body, request=httpx.Request("POST", "http://x"))


VALID_INTENT = (
    '{"roles": ["backend engineer"], "skills": ["Python"], "experience_level": "senior", '
    '"locations": ["Remote"], "domains": ["healthcare"], "employment_type": "full_time"}'
)


def test_no_api_key_raises():
    with pytest.raises(AIProviderError, match="No OpenRouter API key"):
        extract_intent_llm("python role", make_settings(openrouter_api_key=None))


def test_no_models_configured_raises():
    with pytest.raises(AIProviderError, match="No OpenRouter models"):
        extract_intent_llm("python role", make_settings(openrouter_models=[]))


def test_timeout_raises(monkeypatch):
    monkeypatch.setattr(httpx, "post", lambda *a, **k: (_ for _ in ()).throw(httpx.TimeoutException("t")))
    with pytest.raises(AIProviderError, match="timed out"):
        extract_intent_llm("python role", make_settings())


def test_network_error_raises(monkeypatch):
    monkeypatch.setattr(httpx, "post", lambda *a, **k: (_ for _ in ()).throw(httpx.ConnectError("refused")))
    with pytest.raises(AIProviderError):
        extract_intent_llm("python role", make_settings())


def test_non_200_status_raises(monkeypatch):
    def fake_post(*args, **kwargs):
        return httpx.Response(429, text="rate limited", request=httpx.Request("POST", "http://x"))

    monkeypatch.setattr(httpx, "post", fake_post)
    with pytest.raises(AIProviderError, match="429"):
        extract_intent_llm("python role", make_settings())


def test_malformed_envelope_raises(monkeypatch):
    def fake_post(*args, **kwargs):
        return httpx.Response(200, text="not json at all", request=httpx.Request("POST", "http://x"))

    monkeypatch.setattr(httpx, "post", fake_post)
    with pytest.raises(AIProviderError):
        extract_intent_llm("python role", make_settings())


def test_content_not_valid_json_raises(monkeypatch):
    monkeypatch.setattr(httpx, "post", lambda *a, **k: json_response("I think you want a Python role"))
    with pytest.raises(AIProviderError, match="not JSON"):
        extract_intent_llm("python role", make_settings())


def test_schema_invalid_json_raises(monkeypatch):
    # "skills" should be a list, not a string — fails MatchIntent validation.
    monkeypatch.setattr(httpx, "post", lambda *a, **k: json_response('{"skills": "python"}'))
    with pytest.raises(AIProviderError, match="schema validation"):
        extract_intent_llm("python role", make_settings())


def test_valid_response_parses_successfully(monkeypatch):
    monkeypatch.setattr(httpx, "post", lambda *a, **k: json_response(VALID_INTENT))
    intent, call = extract_intent_llm("senior python backend role in healthcare, remote", make_settings())
    assert intent.skills == ["Python"]
    assert intent.experience_level == "senior"
    assert call.model == "model-a"


def test_markdown_fenced_json_is_still_parsed(monkeypatch):
    """Some models ignore response_format and wrap the object in a code fence anyway."""
    monkeypatch.setattr(httpx, "post", lambda *a, **k: json_response(f"```json\n{VALID_INTENT}\n```"))
    intent, _ = extract_intent_llm("python role", make_settings())
    assert intent.skills == ["Python"]


def test_structured_output_is_requested(monkeypatch):
    captured = {}

    def fake_post(url, **kwargs):
        captured.update(kwargs["json"])
        return json_response(VALID_INTENT)

    monkeypatch.setattr(httpx, "post", fake_post)
    extract_intent_llm("python role", make_settings())
    assert captured["response_format"]["type"] == "json_schema"
    assert captured["response_format"]["json_schema"]["strict"] is True
    assert captured["temperature"] == 0


def test_chain_falls_through_to_next_model(monkeypatch):
    """A dead or rate-limited model must not take the AI path down."""
    calls = []

    def fake_post(url, **kwargs):
        model = kwargs["json"]["model"]
        calls.append(model)
        if model == "dead-model":
            return httpx.Response(404, text="No endpoints found", request=httpx.Request("POST", url))
        return json_response(VALID_INTENT)

    monkeypatch.setattr(httpx, "post", fake_post)
    intent, call = extract_intent_llm(
        "python role", make_settings(openrouter_models=["dead-model", "good-model"])
    )
    assert calls == ["dead-model", "good-model"]
    assert call.model == "good-model"
    assert intent.skills == ["Python"]


def test_all_models_failing_raises_with_every_reason(monkeypatch):
    def fake_post(url, **kwargs):
        return httpx.Response(404, text="gone", request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx, "post", fake_post)
    with pytest.raises(AIProviderError) as exc:
        extract_intent_llm("python role", make_settings(openrouter_models=["a", "b"]))
    assert "a:" in str(exc.value) and "b:" in str(exc.value)


def test_explanation_rewrite_returns_map_keyed_by_job(monkeypatch):
    payload = '{"explanations": [{"job_id": 7, "text": "Strong fit on Python."}]}'
    monkeypatch.setattr(httpx, "post", lambda *a, **k: json_response(payload))
    out, call = rewrite_explanations_llm([(7, "Matches 1 of 1 required skills (Python).")], make_settings())
    assert out == {7: "Strong fit on Python."}
    assert call.model == "model-a"


def test_explanation_rewrite_missing_field_raises(monkeypatch):
    monkeypatch.setattr(httpx, "post", lambda *a, **k: json_response('{"nope": []}'))
    with pytest.raises(AIProviderError, match="explanations field"):
        rewrite_explanations_llm([(7, "text")], make_settings())


def test_explanation_rewrite_drops_malformed_entries(monkeypatch):
    payload = '{"explanations": [{"job_id": "seven", "text": "x"}, {"job_id": 8, "text": "  "}]}'
    monkeypatch.setattr(httpx, "post", lambda *a, **k: json_response(payload))
    out, _ = rewrite_explanations_llm([(7, "a"), (8, "b")], make_settings())
    assert out == {}


def test_null_content_falls_through_instead_of_crashing(monkeypatch):
    """A 200 whose content is null is what a reasoning model returns when max_tokens
    runs out mid-thought. It used to raise TypeError past the AIProviderError handler
    and surface as a 500; it must be an ordinary provider failure the chain can absorb."""
    body = {"choices": [{"message": {"content": None}}]}
    response = httpx.Response(200, json=body, request=httpx.Request("POST", "http://x"))
    monkeypatch.setattr(httpx, "post", lambda *a, **k: response)

    with pytest.raises(AIProviderError, match="empty content"):
        extract_intent_llm("python role", make_settings())


def test_blank_content_is_also_a_provider_failure(monkeypatch):
    monkeypatch.setattr(httpx, "post", lambda *a, **k: json_response("   "))
    with pytest.raises(AIProviderError, match="empty content"):
        extract_intent_llm("python role", make_settings())


def test_a_dead_first_model_still_lets_a_later_one_answer_after_null_content(monkeypatch):
    """The chain has to treat empty content like any other unusable answer."""
    calls: list[str] = []

    def fake_post(*args, **kwargs):
        model = kwargs["json"]["model"]
        calls.append(model)
        if model == "empty-model":
            body = {"choices": [{"message": {"content": None}}]}
            return httpx.Response(200, json=body, request=httpx.Request("POST", "http://x"))
        return json_response(VALID_INTENT)

    monkeypatch.setattr(httpx, "post", fake_post)
    intent, call = extract_intent_llm(
        "python role", make_settings(openrouter_models=["empty-model", "good-model"])
    )
    assert call.model == "good-model"
    assert intent.skills == ["Python"]
    assert calls == ["empty-model", "good-model"]
