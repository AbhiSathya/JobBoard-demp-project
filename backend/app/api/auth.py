from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Cookie, Depends, Response
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.core.deps import CurrentUser
from app.core.errors import UnauthorizedError
from app.schemas.auth import (
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    UserOut,
    VerifyEmailRequest,
)
from app.services.auth import (
    login_user,
    refresh_session,
    register_user,
    request_password_reset,
    resend_verification,
    reset_password,
    verify_email,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

REFRESH_COOKIE = "jobboard_refresh"


def _set_refresh_cookie(response: Response, token: str) -> None:
    """httpOnly so JavaScript — and therefore any XSS payload — can never read it."""
    settings = get_settings()
    response.set_cookie(
        REFRESH_COOKIE,
        token,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        max_age=settings.refresh_token_days * 24 * 60 * 60,
        path="/api/auth",
    )


@router.post("/register", response_model=TokenResponse, status_code=201)
def register(
    data: RegisterRequest,
    response: Response,
    tasks: BackgroundTasks,
    db: Annotated[Session, Depends(get_db)],
) -> TokenResponse:
    user, access, refresh = register_user(db, data, tasks)
    _set_refresh_cookie(response, refresh)
    return TokenResponse(access_token=access, user=UserOut.model_validate(user))


@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest, response: Response, db: Annotated[Session, Depends(get_db)]) -> TokenResponse:
    user, access, refresh = login_user(db, data)
    _set_refresh_cookie(response, refresh)
    return TokenResponse(access_token=access, user=UserOut.model_validate(user))


@router.post("/refresh", response_model=TokenResponse)
def refresh(
    response: Response,
    db: Annotated[Session, Depends(get_db)],
    jobboard_refresh: Annotated[str | None, Cookie()] = None,
) -> TokenResponse:
    if not jobboard_refresh:
        raise UnauthorizedError("No refresh token — please sign in again.")
    user, access, new_refresh = refresh_session(db, jobboard_refresh)
    _set_refresh_cookie(response, new_refresh)
    return TokenResponse(access_token=access, user=UserOut.model_validate(user))


@router.post("/logout", response_model=MessageResponse)
def logout(response: Response) -> MessageResponse:
    response.delete_cookie(REFRESH_COOKIE, path="/api/auth")
    return MessageResponse(message="Signed out.")


@router.post("/verify-email", response_model=UserOut)
def verify(
    data: VerifyEmailRequest, tasks: BackgroundTasks, db: Annotated[Session, Depends(get_db)]
) -> UserOut:
    return UserOut.model_validate(verify_email(db, data.token, tasks))


@router.post("/resend-verification", response_model=MessageResponse)
def resend(
    data: ForgotPasswordRequest, tasks: BackgroundTasks, db: Annotated[Session, Depends(get_db)]
) -> MessageResponse:
    resend_verification(db, data.email, tasks)
    return MessageResponse(message="If that address needs verifying, a new link is on its way.")


@router.post("/forgot-password", response_model=MessageResponse)
def forgot_password(
    data: ForgotPasswordRequest, tasks: BackgroundTasks, db: Annotated[Session, Depends(get_db)]
) -> MessageResponse:
    request_password_reset(db, data.email, tasks)
    # Deliberately identical whether or not the account exists, so this endpoint cannot
    # be used to enumerate registered addresses.
    return MessageResponse(message="If that address exists, a reset link is on its way.")


@router.post("/reset-password", response_model=MessageResponse)
def do_reset_password(
    data: ResetPasswordRequest,
    response: Response,
    tasks: BackgroundTasks,
    db: Annotated[Session, Depends(get_db)],
) -> MessageResponse:
    reset_password(db, data.token, data.password, tasks)
    response.delete_cookie(REFRESH_COOKIE, path="/api/auth")
    return MessageResponse(message="Password updated. Sign in with your new password.")


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> UserOut:
    return UserOut.model_validate(user)
