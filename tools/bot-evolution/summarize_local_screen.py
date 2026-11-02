import math
import statistics
from typing import Any


def summarize_local_screen(
    changed: list[int], games: list[int], positions: list[dict[str, Any]]
) -> dict[str, Any]:
    usable = [position for position in positions if len(position["differences"]) >= 2]
    means = [statistics.mean(position["differences"]) for position in usable]
    gains = []
    sampled = []
    for block, (count, played) in enumerate(zip(changed, games, strict=True)):
        estimates = [mean for position, mean in zip(usable, means) if position["block"] == block]
        sampled.append(len(estimates))
        if estimates and played:
            gains.append(sum(estimates) * count / len(estimates) / played)
        else:
            gains.append(0.0)
    pairs = sum(len(position["differences"]) for position in usable)
    difference = None
    interval = None
    if usable:
        difference = sum(sum(position["differences"]) for position in usable) / pairs
        variance = sum(
            len(position["differences"]) * statistics.variance(position["differences"])
            for position in usable
        ) / (pairs * pairs)
        half = 1.96 * math.sqrt(variance)
        interval = [difference - half, difference + half]
    return {
        "blockScores": [min(1.0, max(0.0, 0.5 + gain)) for gain in gains],
        "blockGains": gains,
        "blockChanged": changed,
        "blockSampled": sampled,
        "unestimatedBlocks": sum(
            count > 0 and estimates == 0 for count, estimates in zip(changed, sampled)
        ),
        "usablePositions": len(usable),
        "pairs": pairs,
        "invalidPairs": sum(position["invalidPairs"] for position in positions),
        "refusedPairs": sum(position["refusedPairs"] for position in positions),
        "difference": difference,
        "approximate95": interval,
        "limitation": (
            "Local paired continuations with the baseline program after the root against the "
            "block's opponent policy; within-position intervals treat the sampled positions as "
            "fixed and are not a strength certificate."
        ),
    }
