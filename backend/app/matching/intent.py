import re

from app.matching.models import MatchIntent, MatchVocab

_EXPERIENCE_KEYWORDS = {
    "entry": ["entry", "junior", "graduate", "new grad", "0-2 year"],
    "mid": ["mid level", "mid-level", "intermediate"],
    "senior": ["senior", "sr."],
    "lead": ["lead", "staff", "principal", "head of"],
}

_EMPLOYMENT_KEYWORDS = {
    "full_time": ["full-time", "full time", "fulltime"],
    "part_time": ["part-time", "part time"],
    "contract": ["contract", "contractor", "freelance"],
    "internship": ["intern", "internship"],
}

_ROLE_NOUNS = [
    "engineer",
    "developer",
    "analyst",
    "scientist",
    "designer",
    "manager",
    "architect",
    "consultant",
    "administrator",
    "specialist",
]


def _find_experience(query_lower: str) -> str | None:
    for level, keywords in _EXPERIENCE_KEYWORDS.items():
        if any(kw in query_lower for kw in keywords):
            return level
    return None


def _find_employment_type(query_lower: str) -> str | None:
    for etype, keywords in _EMPLOYMENT_KEYWORDS.items():
        if any(kw in query_lower for kw in keywords):
            return etype
    return None


def _find_roles(query_lower: str) -> list[str]:
    words = re.findall(r"[a-z][a-z\-]*", query_lower)
    roles = []
    for i, word in enumerate(words):
        if word in _ROLE_NOUNS:
            start = max(0, i - 2)
            roles.append(" ".join(words[start : i + 1]))
    return roles


def _find_from_vocab(query_lower: str, vocab_terms: list[str]) -> list[str]:
    found = []
    for term in vocab_terms:
        term_clean = term.strip()
        if not term_clean:
            continue
        pattern = r"(?<![a-z0-9])" + re.escape(term_clean.lower()) + r"(?![a-z0-9])"
        if re.search(pattern, query_lower):
            found.append(term_clean)
    return found


def extract_intent_deterministic(query: str, vocab: MatchVocab) -> MatchIntent:
    """Keyword-based intent extraction. No network, no LLM — always available, always fast."""
    query_lower = query.lower()
    return MatchIntent(
        roles=_find_roles(query_lower),
        skills=_find_from_vocab(query_lower, vocab.skills),
        experience_level=_find_experience(query_lower),
        locations=_find_from_vocab(query_lower, vocab.locations)
        or (["remote"] if "remote" in query_lower else []),
        domains=_find_from_vocab(query_lower, vocab.domains),
        employment_type=_find_employment_type(query_lower),
    )
