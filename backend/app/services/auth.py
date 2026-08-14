from sqlalchemy.orm import Session

from app.core.errors import ConflictError, UnauthorizedError
from app.core.security import create_access_token, hash_password, verify_password
from app.models.user import User
from app.schemas.auth import LoginRequest, RegisterRequest


def register_user(db: Session, data: RegisterRequest) -> tuple[User, str]:
    existing = db.query(User).filter(User.email == data.email).first()
    if existing is not None:
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

    token = create_access_token(user.id, user.role)
    return user, token


def login_user(db: Session, data: LoginRequest) -> tuple[User, str]:
    user = db.query(User).filter(User.email == data.email).first()
    if user is None or not verify_password(data.password, user.password_hash):
        raise UnauthorizedError("Incorrect email or password.")

    token = create_access_token(user.id, user.role)
    return user, token
