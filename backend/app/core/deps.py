from typing import Annotated

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.errors import ForbiddenError, UnauthorizedError
from app.core.security import decode_token
from app.models.enums import Role
from app.models.user import User

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    if credentials is None:
        raise UnauthorizedError("Missing authentication token.")
    try:
        payload = decode_token(credentials.credentials, "access")
    except jwt.PyJWTError as exc:
        raise UnauthorizedError("Invalid or expired token.") from exc

    user = db.get(User, int(payload["sub"]))
    if user is None:
        raise UnauthorizedError("User no longer exists.")
    if payload.get("ver", 0) != user.token_version:
        raise UnauthorizedError("Your password changed — please sign in again.")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_admin(user: CurrentUser) -> User:
    if user.role != Role.admin:
        raise ForbiddenError("This action requires an admin account.")
    return user


def require_candidate(user: CurrentUser) -> User:
    if user.role != Role.candidate:
        raise ForbiddenError("This action requires a candidate account.")
    return user


def _require_verified(user: User) -> User:
    if not user.is_verified:
        raise ForbiddenError("Verify your email address before doing this.", details=["email_not_verified"])
    return user


def require_verified_admin(user: CurrentUser) -> User:
    return _require_verified(require_admin(user))


def require_verified_candidate(user: CurrentUser) -> User:
    return _require_verified(require_candidate(user))


CurrentAdmin = Annotated[User, Depends(require_admin)]
CurrentCandidate = Annotated[User, Depends(require_candidate)]

# Reading is open to any signed-in account; the two actions that create real-world
# consequences — posting a job, applying to one — require a confirmed address.
VerifiedAdmin = Annotated[User, Depends(require_verified_admin)]
VerifiedCandidate = Annotated[User, Depends(require_verified_candidate)]
