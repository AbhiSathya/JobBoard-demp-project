"""The fact-check that makes an LLM-written explanation safe to show.

These are pure-function tests: no network, no DB. That is the point — the guarantee
"the AI cannot claim a skill you don't have" is enforced by code that can be tested
directly, not by hoping a prompt holds.
"""

from app.matching.llm_explain import MAX_REWRITE_CHARS, accept_rewrite

KNOWN = {"Python", "FastAPI", "Kubernetes", "Go", "React", "Berlin", "Remote", "fintech", "healthcare"}
SOURCE = (
    "Matches 2 of 3 required skills (Python, FastAPI). Missing: React. Location differs: role is in Berlin."
)
FACTS = {"Python", "FastAPI", "React", "Berlin", "senior", "full_time", "Acme"}


def test_faithful_rewrite_is_accepted():
    rewrite = "You cover Python and FastAPI here, though React is missing and the role sits in Berlin."
    assert accept_rewrite(SOURCE, rewrite, FACTS, KNOWN) is True


def test_rewrite_inventing_a_skill_is_rejected():
    rewrite = "You cover Python, FastAPI and Kubernetes, which makes this a strong fit."
    assert accept_rewrite(SOURCE, rewrite, FACTS, KNOWN) is False


def test_rewrite_inventing_a_location_is_rejected():
    rewrite = "Great match on Python and FastAPI, and it's Remote."
    assert accept_rewrite(SOURCE, rewrite, FACTS, KNOWN) is False


def test_rewrite_inventing_a_domain_is_rejected():
    rewrite = "Python and FastAPI line up well for this fintech role."
    assert accept_rewrite(SOURCE, rewrite, FACTS, KNOWN) is False


def test_rewrite_inventing_a_number_is_rejected():
    rewrite = "You match 5 of 3 required skills."
    assert accept_rewrite(SOURCE, rewrite, FACTS, KNOWN) is False


def test_numbers_present_in_source_are_allowed():
    rewrite = "2 of the 3 skills line up."
    assert accept_rewrite(SOURCE, rewrite, FACTS, KNOWN) is True


def test_short_skill_name_does_not_trigger_a_false_rejection():
    """'Go' must not be found inside 'good' — word boundaries, not substrings."""
    rewrite = "A good overlap on Python and FastAPI."
    assert accept_rewrite(SOURCE, rewrite, FACTS, KNOWN) is True


def test_empty_rewrite_is_rejected():
    assert accept_rewrite(SOURCE, "   ", FACTS, KNOWN) is False


def test_overlong_rewrite_is_rejected():
    assert accept_rewrite(SOURCE, "Python. " * MAX_REWRITE_CHARS, FACTS, KNOWN) is False


def test_mismatch_can_be_restated_without_rejection():
    """Mismatches are facts too — mentioning the missing skill must stay legal."""
    rewrite = "Solid on Python and FastAPI, but you'd be picking up React on the job."
    assert accept_rewrite(SOURCE, rewrite, FACTS, KNOWN) is True


# --- polarity: naming a fact is fine, claiming it as a match is not ----------------

NOT_MATCHED = {"React", "edtech", "entry", "Berlin"}


def test_naming_an_unmatched_domain_is_allowed():
    rewrite = "You bring Python and FastAPI. This role is in edtech and based in Berlin."
    assert accept_rewrite(SOURCE, rewrite, FACTS | {"edtech"}, KNOWN, NOT_MATCHED) is True


def test_claiming_an_unmatched_domain_as_a_match_is_rejected():
    """The exact failure a term-presence check misses — every word legitimate, claim false."""
    rewrite = "You match the Python skills, the edtech domain and the location."
    assert accept_rewrite(SOURCE, rewrite, FACTS | {"edtech"}, KNOWN, NOT_MATCHED) is False


def test_claiming_a_missing_skill_as_covered_is_rejected():
    rewrite = "You have React and Python covered."
    assert accept_rewrite(SOURCE, rewrite, FACTS, KNOWN, NOT_MATCHED) is False


def test_claiming_a_differing_location_as_a_preference_match_is_rejected():
    rewrite = "Python lines up, and Berlin matches your preference."
    assert accept_rewrite(SOURCE, rewrite, FACTS, KNOWN, NOT_MATCHED) is False


def test_stating_a_mismatch_plainly_is_still_allowed():
    rewrite = "Strong on Python and FastAPI. You're missing React, and the role is in Berlin."
    assert accept_rewrite(SOURCE, rewrite, FACTS, KNOWN, NOT_MATCHED) is True


def test_polarity_guard_is_off_when_everything_matched():
    rewrite = "You match Python and FastAPI, and Berlin matches your preference."
    assert accept_rewrite(SOURCE, rewrite, FACTS, KNOWN, set()) is True


def test_a_gap_stated_in_the_same_sentence_is_not_a_false_rejection():
    """ "You cover X but are missing Y" is faithful — the guard must not trip on it."""
    rewrite = "You cover Python and SQL, but you are missing React."
    assert accept_rewrite(SOURCE, rewrite, FACTS, KNOWN, NOT_MATCHED) is True


def test_negated_clause_naming_an_unmatched_term_is_allowed():
    rewrite = "Python fits well. The seniority does not match — this is an entry role."
    assert accept_rewrite(SOURCE, rewrite, FACTS | {"entry"}, KNOWN, NOT_MATCHED) is True
