"""Password hashing and JWT issuing.

Passwords use `hashlib.scrypt` from the standard library rather than bcrypt/passlib:
scrypt is memory-hard and ships with Python, so there is no native wheel to compile and
setup is identical on Windows and Ubuntu.

Every token carries a `typ` claim. An access token cannot be replayed as a refresh token
and a password-reset link cannot be replayed as a login, because `decode_token` refuses
any token whose `typ` is not the one the caller asked for.
"""

import hashlib
import hmac
import os
from datetime import UTC, datetime, timedelta
from typing import Literal

import jwt

from app.core.config import get_settings
from app.models.enums import Role

TokenType = Literal["access", "refresh", "verify", "reset"]

_SCRYPT_N, _SCRYPT_R, _SCRYPT_P = 2**14, 8, 1


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    derived = hashlib.scrypt(password.encode(), salt=salt, n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P)
    return f"{salt.hex()}${derived.hex()}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        salt_hex, derived_hex = password_hash.split("$")
        salt = bytes.fromhex(salt_hex)
    except ValueError:
        return False
    candidate = hashlib.scrypt(password.encode(), salt=salt, n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P)
    return hmac.compare_digest(candidate.hex(), derived_hex)


def _lifetime(typ: TokenType) -> timedelta:
    settings = get_settings()
    return {
        "access": timedelta(minutes=settings.access_token_minutes),
        "refresh": timedelta(days=settings.refresh_token_days),
        "verify": timedelta(hours=settings.verify_token_hours),
        "reset": timedelta(minutes=settings.reset_token_minutes),
    }[typ]


def create_token(typ: TokenType, user_id: int, *, role: Role | None = None, token_version: int = 0) -> str:
    settings = get_settings()
    payload = {
        "sub": str(user_id),
        "typ": typ,
        "ver": token_version,
        "exp": datetime.now(UTC) + _lifetime(typ),
    }
    if role is not None:
        payload["role"] = role.value
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str, expect: TokenType) -> dict:
    """Decode and assert the token's purpose. Raises jwt.InvalidTokenError on any mismatch."""
    settings = get_settings()
    payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    if payload.get("typ") != expect:
        raise jwt.InvalidTokenError(f"Expected a {expect} token, got {payload.get('typ')!r}.")
    return payload
