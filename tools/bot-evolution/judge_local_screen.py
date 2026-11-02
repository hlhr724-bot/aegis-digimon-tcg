from typing import Any

from local_screen_protocol import LOCAL_SCREEN_MIN_USABLE_POSITIONS


def judge_local_screen(
    screen: dict[str, Any], *, candidate_invalid: int, baseline_invalid: int
) -> dict[str, Any]:
    if screen["usablePositions"] < LOCAL_SCREEN_MIN_USABLE_POSITIONS:
        return {
            "status": "unexercised",
            "passed": False,
            "reason": (
                f"Fewer than {LOCAL_SCREEN_MIN_USABLE_POSITIONS} usable changed positions "
                f"({screen['usablePositions']})"
            ),
        }
    if screen["approximate95"][0] <= 0:
        return {
            "status": "exercised",
            "passed": False,
            "reason": "Lower 95% bound of the local paired difference is not above zero",
        }
    if candidate_invalid > baseline_invalid:
        return {
            "status": "exercised",
            "passed": False,
            "reason": "More invalid full FITNESS games than the baseline",
        }
    return {"status": "exercised", "passed": True, "reason": None}
