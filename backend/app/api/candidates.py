from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import CurrentCandidate
from app.schemas.profile import ProfileOut, ProfileUpsert
from app.services.profiles import get_profile, upsert_profile

router = APIRouter(prefix="/api/candidates/me", tags=["candidates"])


@router.get("/profile", response_model=ProfileOut)
def read_profile(candidate: CurrentCandidate, db: Annotated[Session, Depends(get_db)]) -> ProfileOut:
    profile = get_profile(db, candidate.id)
    return ProfileOut.model_validate(profile)


@router.put("/profile", response_model=ProfileOut)
def write_profile(
    data: ProfileUpsert, candidate: CurrentCandidate, db: Annotated[Session, Depends(get_db)]
) -> ProfileOut:
    profile = upsert_profile(db, candidate, data)
    return ProfileOut.model_validate(profile)
