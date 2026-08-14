from sqlalchemy.orm import Session

from app.core.errors import NotFoundError
from app.models.candidate_profile import CandidateProfile
from app.models.user import User
from app.schemas.profile import ProfileUpsert


def _skills_text(skills: list[str]) -> str:
    return ",".join(s.strip().lower() for s in skills if s.strip())


def get_profile(db: Session, user_id: int) -> CandidateProfile:
    profile = db.query(CandidateProfile).filter(CandidateProfile.user_id == user_id).first()
    if profile is None:
        raise NotFoundError("No candidate profile has been created yet.")
    return profile


def upsert_profile(db: Session, candidate: User, data: ProfileUpsert) -> CandidateProfile:
    profile = db.query(CandidateProfile).filter(CandidateProfile.user_id == candidate.id).first()
    if profile is None:
        profile = CandidateProfile(user_id=candidate.id)
        db.add(profile)

    profile.name = data.name
    profile.headline = data.headline
    profile.years_experience = data.years_experience
    profile.skills = data.skills
    profile.skills_text = _skills_text(data.skills)
    profile.education = [e.model_dump() for e in data.education]
    profile.projects = [p.model_dump() for p in data.projects]
    profile.preferred_location = data.preferred_location
    profile.preferred_role_type = data.preferred_role_type
    profile.domain_interests = data.domain_interests

    db.commit()
    db.refresh(profile)
    return profile
