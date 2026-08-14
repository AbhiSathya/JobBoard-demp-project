import enum


class Role(enum.StrEnum):
    admin = "admin"
    candidate = "candidate"


class JobStatus(enum.StrEnum):
    open = "open"
    closed = "closed"


class ExperienceLevel(enum.StrEnum):
    entry = "entry"
    mid = "mid"
    senior = "senior"
    lead = "lead"


class EmploymentType(enum.StrEnum):
    full_time = "full_time"
    part_time = "part_time"
    contract = "contract"
    internship = "internship"


class ApplicationStatus(enum.StrEnum):
    applied = "applied"
    shortlisted = "shortlisted"
    rejected = "rejected"


# Allowed forward transitions. `rejected` is terminal, `applied` is the entry state.
APPLICATION_TRANSITIONS: dict[ApplicationStatus, set[ApplicationStatus]] = {
    ApplicationStatus.applied: {ApplicationStatus.shortlisted, ApplicationStatus.rejected},
    ApplicationStatus.shortlisted: {ApplicationStatus.rejected},
    ApplicationStatus.rejected: set(),
}
