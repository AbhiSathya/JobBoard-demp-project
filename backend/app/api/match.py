from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import CurrentCandidate
from app.schemas.match import MatchRequest, MatchResponse
from app.services.match import match_jobs_for_query

router = APIRouter(prefix="/api/match", tags=["match"])


@router.post("", response_model=MatchResponse)
def match(
    data: MatchRequest, candidate: CurrentCandidate, db: Annotated[Session, Depends(get_db)]
) -> MatchResponse:
    return match_jobs_for_query(db, candidate, data.query)
