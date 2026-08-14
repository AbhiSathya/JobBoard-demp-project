from app.matching.models import JobFacts, ProfileFacts, ScoreBreakdown


def explain(breakdown: ScoreBreakdown, profile: ProfileFacts | None, job: JobFacts) -> str:
    """Build a grounded explanation strictly from the score breakdown's own facts.

    Every sentence below reads a value already present on `breakdown` or `job` — nothing
    is invented, so the explanation can never claim a skill or fact that isn't real.
    """
    sentences: list[str] = []

    required = [s for s in job.required_skills if s.strip()]
    if required:
        matched_count = len(breakdown.skills_matched)
        if matched_count == len(required):
            sentences.append(f"Matches all {len(required)} required skills ({', '.join(required)}).")
        elif matched_count > 0:
            sentences.append(
                f"Matches {matched_count} of {len(required)} required skills "
                f"({', '.join(breakdown.skills_matched)})."
            )
            sentences.append(f"Missing: {', '.join(breakdown.skills_missing)}.")
        else:
            sentences.append(f"Does not match any of the {len(required)} required skills.")

    if breakdown.domain_matched:
        sentences.append(f"{job.domain.capitalize()} domain matches your stated interest.")
    elif job.domain:
        sentences.append(f"This role is in the {job.domain} domain.")

    if breakdown.experience_score == 1.0:
        sentences.append(f"{job.experience_level.capitalize()} level matches what you're looking for.")
    elif breakdown.experience_score == 0.5:
        sentences.append(f"This is a {job.experience_level} role, close to what you specified.")
    elif breakdown.experience_score == 0.0:
        sentences.append(f"This is a {job.experience_level} role, different from what you specified.")

    if breakdown.location_score == 1.0:
        sentences.append(f"Location ({job.location}) matches your preference.")
    elif breakdown.location_score == 0.0:
        sentences.append(f"Location differs: role is in {job.location}.")

    return " ".join(sentences) if sentences else "Limited information available to explain this match."
