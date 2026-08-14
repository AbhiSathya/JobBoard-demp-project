from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import CurrentAdmin
from app.schemas.analytics import AnalyticsResponse
from app.services.analytics import get_admin_analytics

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/analytics", response_model=AnalyticsResponse)
def analytics(admin: CurrentAdmin, db: Annotated[Session, Depends(get_db)]) -> AnalyticsResponse:
    return get_admin_analytics(db, admin)
