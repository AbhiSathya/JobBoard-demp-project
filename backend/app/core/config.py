import json
from functools import lru_cache
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

# Free OpenRouter models that support `response_format: json_schema`, tried in order.
# A dead / rate-limited / slow model falls through to the next one, so a single
# provider-side outage can never take the AI path down mid-demo.
DEFAULT_MODEL_CHAIN = [
    "google/gemma-4-26b-a4b-it:free",
    "openai/gpt-oss-20b:free",
    "nvidia/nemotron-nano-9b-v2:free",
    "nvidia/nemotron-3-super-120b-a12b:free",
]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./jobboard.db"
    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"

    # Token lifetimes, one per token `typ`.
    access_token_minutes: int = 15
    refresh_token_days: int = 14
    verify_token_hours: int = 24
    reset_token_minutes: int = 30

    # Where the SPA lives — used to build links inside outgoing email.
    frontend_base_url: str = "http://localhost:5173"
    cookie_secure: bool = False

    # SMTP. Unset host => emails are rendered to the log instead of sent.
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_from: str = "Job Board <no-reply@jobboard.local>"
    smtp_starttls: bool = True

    openrouter_api_key: str | None = None
    # NoDecode: take the raw env string and let the validator below split it, instead of
    # pydantic-settings trying to JSON-parse it first.
    openrouter_models: Annotated[list[str], NoDecode] = DEFAULT_MODEL_CHAIN
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    # Per-model, not per-request. Free-tier latency is genuinely variable (measured 3s to
    # 30s on the same model within a minute), so this is set to the point where waiting
    # longer stops being worth it rather than to the slowest observed response.
    ai_timeout_seconds: float = 12.0
    ai_explanations: bool = True

    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:5173"]

    @field_validator("openrouter_models", "cors_origins", mode="before")
    @classmethod
    def _split_csv(cls, value: object) -> object:
        """Accept a comma-separated env string as well as a JSON list.

        `a,b,c` is what anyone actually wants to type in a .env file; the JSON branch is
        there so an existing `["..."]` value keeps working.
        """
        if not isinstance(value, str):
            return value
        text = value.strip()
        if text.startswith("["):
            return json.loads(text)
        return [item.strip() for item in text.split(",") if item.strip()]

    @field_validator("openrouter_api_key", "smtp_host", "smtp_user", "smtp_password", mode="before")
    @classmethod
    def _blank_is_none(cls, value: object) -> object:
        """An empty env var means "not configured", not "configured as empty string"."""
        if isinstance(value, str) and not value.strip():
            return None
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
