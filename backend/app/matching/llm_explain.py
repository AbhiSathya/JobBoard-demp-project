"""Fact-checking for LLM-rephrased explanations.

The LLM is only ever allowed to *restate* an explanation that `explain.py` already built
from the score breakdown. This module is the gate that enforces it: a rewrite is accepted
only if it introduces no term the job board knows about but this particular match does not,
and no number the source did not contain.

Everything here is pure — no network, no DB — so the guarantee is directly unit-testable.
"""

import re

MAX_REWRITE_CHARS = 400


def _mentions(text: str, term: str) -> bool:
    """Word-boundary containment, so 'Go' does not match inside 'good'."""
    term = term.strip()
    if not term:
        return False
    pattern = r"(?<![a-z0-9])" + re.escape(term.lower()) + r"(?![a-z0-9])"
    return re.search(pattern, text.lower()) is not None


def _numbers(text: str) -> set[str]:
    return set(re.findall(r"\d+", text))


_MATCH_VERB = re.compile(
    r"\b(?:match\w*|fits?|fitting|aligns?|aligned|suits?|meets?|cover\w*|has|have|had|bring\w*)\b"
)

# If any of these sits in the same clause, the clause is stating a gap, not a match —
# "you cover Python but are missing React" is a faithful sentence, not a false claim.
_NEGATION = re.compile(
    r"\b(?:not|no|never|missing|missed|lacks?|lacking|without|except|differs?|different|"
    r"instead|rather|isn't|aren't|doesn't|don't|would need|need to)\b"
)

# Clause boundaries. Contrastive conjunctions split too, because everything after a
# "but" is a separate claim from everything before it. Commas deliberately do NOT split:
# "you match the Python skills, the edtech domain and the location" is one claim spread
# over a list, and splitting on the comma would hide exactly the error being looked for.
_CLAUSE_SPLIT = re.compile(r"[.;!?]|\bbut\b|\bthough\b|\balthough\b|\bhowever\b|\bwhile\b|\bwhereas\b")


def claims_match(text: str, term: str) -> bool:
    """Does `text` assert that `term` is a match, rather than merely naming it?

    Catches the failure a term-presence check misses: the model is handed the true fact
    "this role is in the edtech domain" and rephrases it as "you match the edtech domain".
    Every word is legitimate; the relationship it is put in is not.

    Scoped to a single clause and skipped when the clause is negated, so plainly stated
    mismatches stay acceptable.
    """
    pattern = re.compile(r"(?<![a-z0-9])" + re.escape(term.strip().lower()) + r"(?![a-z0-9])")
    for clause in _CLAUSE_SPLIT.split(text.lower()):
        if pattern.search(clause) and _MATCH_VERB.search(clause) and not _NEGATION.search(clause):
            return True
    return False


def accept_rewrite(
    source: str,
    rewrite: str,
    allowed: set[str],
    known_terms: set[str],
    not_matched: set[str] | None = None,
) -> bool:
    """Is `rewrite` a faithful restatement of `source`?

    `allowed` is this match's own fact set (its matched and missing skills, location,
    domain, company, experience level). `known_terms` is every skill/location/domain the
    job board knows about. Any known term that is *not* in this match's fact set is a
    hallucination if it shows up in the rewrite.
    """
    rewrite = rewrite.strip()
    if not rewrite or len(rewrite) > MAX_REWRITE_CHARS:
        return False

    # A number the source never stated is invented — e.g. "matches 5 of 6 skills"
    # when the real figure was 3 of 6.
    if not _numbers(rewrite) <= _numbers(source):
        return False

    allowed_lower = {a.strip().lower() for a in allowed if a.strip()}
    for term in known_terms:
        if term.strip().lower() in allowed_lower:
            continue
        if _mentions(rewrite, term):
            return False

    # Facts that are true but *not* matches — the job's domain when the candidate asked
    # for a different one, a missing skill, a location that differs. Naming them is fine;
    # claiming them as a match is not.
    for term in not_matched or set():
        if claims_match(rewrite, term):
            return False

    return True
