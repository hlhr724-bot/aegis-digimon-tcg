from judge_local_screen import judge_local_screen
from local_screen_protocol import LOCAL_SCREEN_MIN_USABLE_POSITIONS


def _screen(lower, positions=LOCAL_SCREEN_MIN_USABLE_POSITIONS):
    return {"usablePositions": positions, "approximate95": [lower, lower + 0.1]}


def test_passes_a_positive_lower_bound_without_extra_invalid_games():
    verdict = judge_local_screen(_screen(0.01), candidate_invalid=1, baseline_invalid=1)
    assert verdict == {"status": "exercised", "passed": True, "reason": None}


def test_fails_when_the_lower_bound_is_not_above_zero():
    verdict = judge_local_screen(_screen(0.0), candidate_invalid=0, baseline_invalid=0)
    assert verdict["passed"] is False
    assert verdict["status"] == "exercised"
    assert "Lower 95% bound" in verdict["reason"]


def test_fails_on_more_invalid_full_games():
    verdict = judge_local_screen(_screen(0.2), candidate_invalid=2, baseline_invalid=1)
    assert verdict["passed"] is False
    assert "invalid" in verdict["reason"]


def test_labels_too_few_usable_positions_unexercised():
    screen = {"usablePositions": LOCAL_SCREEN_MIN_USABLE_POSITIONS - 1, "approximate95": None}
    verdict = judge_local_screen(screen, candidate_invalid=0, baseline_invalid=0)
    assert verdict["status"] == "unexercised"
    assert verdict["passed"] is False
