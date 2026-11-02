import math
import statistics
from typing import Any


def summarize_replay_teacher(rows: list[dict[str, Any]]) -> dict[str, Any]:
    indexed = {row["id"]: row for row in rows}
    if len(indexed) != len(rows):
        raise ValueError("Duplicate teacher continuation")
    expected = {f"{index}|{arm}" for index in range(32) for arm in ("baseline", "alternative")}
    if set(indexed) != expected:
        raise ValueError("Teacher comparison needs 32 complete paired samples")
    valid = all(row.get("valid") is True for row in rows)
    differences = [
        indexed[f"{index}|alternative"]["reward"] - indexed[f"{index}|baseline"]["reward"]
        if indexed[f"{index}|alternative"].get("valid")
        and indexed[f"{index}|baseline"].get("valid")
        else 0.0
        for index in range(32)
    ]
    mean = statistics.mean(differences)
    policy_means = [statistics.mean(differences[:16]), statistics.mean(differences[16:])]
    half = 1.96 * math.sqrt(statistics.variance(differences) / 32)
    return {
        "valid": valid,
        "difference": mean if valid else None,
        "approximate95": [mean - half, mean + half] if valid else None,
        "policyMeans": policy_means if valid else None,
        "preferred": valid and mean >= 0.1 and all(value > 0 for value in policy_means),
        "limitation": "Exploratory continuation comparison under open decklists and frozen policies; not a strength certificate.",
    }
