from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base

if TYPE_CHECKING:
    from app.models.user import User


class CandidateProfile(Base):
    __tablename__ = "candidate_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, index=True)

    name: Mapped[str] = mapped_column(String(255))
    headline: Mapped[str | None] = mapped_column(String(255))
    years_experience: Mapped[int] = mapped_column(Integer, default=0)

    # Skills stored twice deliberately: `skills` is the structured list returned to the
    # client, `skills_text` is a lowercase joined copy used for cheap LIKE-based filtering.
    skills: Mapped[list[str]] = mapped_column(JSON, default=list)
    skills_text: Mapped[str] = mapped_column(Text, default="")

    # Education and projects are JSON, not separate tables: they are only ever read as
    # part of the whole profile and never queried independently. See README for the
    # upgrade path if that ever changes.
    education: Mapped[list[dict]] = mapped_column(JSON, default=list)
    projects: Mapped[list[dict]] = mapped_column(JSON, default=list)

    preferred_location: Mapped[str | None] = mapped_column(String(255))
    preferred_role_type: Mapped[str | None] = mapped_column(String(100))
    domain_interests: Mapped[list[str]] = mapped_column(JSON, default=list)

    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    user: Mapped["User"] = relationship(back_populates="profile")
