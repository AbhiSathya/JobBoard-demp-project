import logging
from datetime import UTC, datetime

import jwt
from fastapi import BackgroundTasks
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, UnauthorizedError
from app.core.security import create_token, decode_token, hash_password, verify_password
from app.models.user import User
from app.schemas.auth import LoginRequest, RegisterRequest
from app.services import notifications

logger = logging.getLogger("jobboard.auth")


def _tokens(user: User) -> tuple[str, str]:
    """(access, refresh) for a user, both stamped with their current token_version."""
    access = create_token("access", user.id, role=user.role, token_version=user.token_version)
    refresh = create_token("refresh", user.id, token_version=user.token_version)
    return access, refresh


def _load_from_token(db: Session, token: str, typ) -> User:
    """Decode a token, then confirm the user still exists and the version still matches."""
    try:
        payload = decode_token(token, typ)
    except jwt.PyJWTError as exc:
        raise UnauthorizedError("This link is invalid or has expired.") from exc

    user = db.get(User, int(payload["sub"]))
    if user is None:
        raise UnauthorizedError("This link is invalid or has expired.")
    if payload.get("ver", 0) != user.token_version:
        raise UnauthorizedError("This link is no longer valid — it was superseded by a newer one.")
    return user


def register_user(db: Session, data: RegisterRequest, tasks: BackgroundTasks) -> tuple[User, str, str]:
    if db.query(User).filter(User.email == data.email).first() is not None:
        raise ConflictError("An account with this email already exists.")

    user = User(
        email=data.email,
        password_hash=hash_password(data.password),
        role=data.role,
        company_name=data.company_name,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    _queue_verification(user, tasks)
    access, refresh = _tokens(user)
    return user, access, refresh


def login_user(db: Session, data: LoginRequest) -> tuple[User, str, str]:
    user = db.query(User).filter(User.email == data.email).first()
    if user is None or not verify_password(data.password, user.password_hash):
        # One message for both cases, so this endpoint can't be used to test which
        # addresses have accounts.
        raise UnauthorizedError("Incorrect email or password.")

    access, refresh = _tokens(user)
    return user, access, refresh


def refresh_session(db: Session, refresh_token: str) -> tuple[User, str, str]:
    user = _load_from_token(db, refresh_token, "refresh")
    access, refresh = _tokens(user)
    return user, access, refresh


def _queue_verification(user: User, tasks: BackgroundTasks) -> None:
    token = create_token("verify", user.id, token_version=user.token_version)
    tasks.add_task(notifications.send_verification, user, token)


def resend_verification(db: Session, email: str, tasks: BackgroundTasks) -> None:
    user = db.query(User).filter(User.email == email).first()
    if user is not None and not user.is_verified:
        _queue_verification(user, tasks)


def verify_email(db: Session, token: str, tasks: BackgroundTasks) -> User:
    user = _load_from_token(db, token, "verify")
    if not user.is_verified:
        user.email_verified_at = datetime.now(UTC)
        db.commit()
        db.refresh(user)
        tasks.add_task(notifications.send_welcome, user)
    return user


def request_password_reset(db: Session, email: str, tasks: BackgroundTasks) -> None:
    """Always silent about whether the address exists — see the API layer's fixed 200."""
    user = db.query(User).filter(User.email == email).first()
    if user is None:
        logger.info("Password reset requested for unknown address")
        return
    token = create_token("reset", user.id, token_version=user.token_version)
    tasks.add_task(notifications.send_password_reset, user, token)


def reset_password(db: Session, token: str, new_password: str, tasks: BackgroundTasks) -> User:
    user = _load_from_token(db, token, "reset")
    user.password_hash = hash_password(new_password)
    # Bumping the version burns this reset token and every outstanding refresh token.
    user.token_version += 1
    db.commit()
    db.refresh(user)
    tasks.add_task(notifications.send_password_changed, user)
    return user
