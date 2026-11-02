import math
import statistics
from typing import Any

MAX_INVALID_FRACTION = 0.05


def summarize_replay_replication(rows: list[dict[str, Any]], pairs: int) -> dict[str, Any]:
    indexed = {row["id"]: row for row in rows}
    if len(indexed) != len(rows):
        raise ValueError("Duplicate replication continuation")
    expected = {f"{index}|{arm}" for index in range(pairs) for arm in ("baseline", "alternative")}
    if set(indexed) != expected:
        raise ValueError(f"Replication needs {pairs} complete paired samples")
    differences = [
        indexed[f"{index}|alternative"]["reward"] - indexed[f"{index}|baseline"]["reward"]
        for index in range(pairs)
        if indexed[f"{index}|alternative"].get("valid") is True
        and indexed[f"{index}|baseline"].get("valid") is True
    ]
    invalid = pairs - len(differences)
    invalid_fraction = invalid / pairs
    mean = statistics.mean(differences) if differences else None
    interval = None
    if len(differences) >= 2:
        half = 1.96 * statistics.stdev(differences) / math.sqrt(len(differences))
        interval = [mean - half, mean + half]
    reason = None
    if invalid_fraction > MAX_INVALID_FRACTION:
        reason = f"More than {MAX_INVALID_FRACTION:.0%} of replication pairs were invalid"
    elif interval is None:
        reason = "Too few valid replication pairs for an interval"
    elif interval[0] <= 0:
        reason = "Lower 95% bound of the paired difference is not above zero"
    return {
        "pairs": pairs,
        "validPairs": len(differences),
        "invalidPairs": invalid,
        "invalidFraction": invalid_fraction,
        "difference": mean,
        "approximate95": interval,
        "replicated": reason is None,
        "reason": reason,
        "limitation": "Fresh-seed replication of an exploratory preference under open decklists and frozen policies; intervals are not corrected for multiple comparisons.",
    }
