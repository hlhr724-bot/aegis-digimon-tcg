import json
import math
from collections import defaultdict
from statistics import variance


def paired_pilot_evidence(
    *,
    selected: list[dict],
    control: list[dict],
    alpha: float,
    population: int = 100_000_000,
) -> dict:
    if not 0 < alpha < 1:
        raise ValueError("Pilot confidence alpha must be in (0, 1)")
    arms = [
        {json.dumps(game["task"], sort_keys=True): game for game in games}
        for games in (selected, control)
    ]
    if (
        len(arms[0]) != len(selected)
        or len(arms[1]) != len(control)
        or arms[0].keys() != arms[1].keys()
    ):
        raise ValueError("Pilot held-out arms require identical, unrepeated tasks")
    blocks = defaultdict(list)
    for key, candidate in arms[0].items():
        incumbent = arms[1][key]
        if any(
            game.get("valid") is not True
            or type(game.get("score")) not in (int, float)
            or game["score"] not in (0, 0.5, 1)
            for game in (candidate, incumbent)
        ):
            raise ValueError("Pilot held-out evidence requires completed valid games")
        blocks[candidate["task"]["seed"]].append(
            (candidate["task"], candidate["score"] - incumbent["score"])
        )
    for games in blocks.values():
        if (
            len(games) != 2
            or {task["learnerSeat"] for task, _ in games} != {0, 1}
            or games[0][0]["decks"] != games[1][0]["decks"][::-1]
            or games[0][0]["decks"][0] == games[0][0]["decks"][1]
        ):
            raise ValueError("Pilot held-out blocks require both seats of one non-mirror matchup")
    count = len(blocks)
    if not 24 <= count < population:
        raise ValueError("Pilot held-out evidence requires 24 or more independent seed blocks")
    differences = [sum(value for _, value in games) / 2 for games in blocks.values()]
    mean = sum(differences) / count
    sample_variance = variance(differences)
    probability_unique = math.exp(sum(math.log1p(-index / population) for index in range(count)))
    delta = alpha * probability_unique
    logarithm = math.log(2 / delta)
    lower = (
        mean
        - math.sqrt(2 * sample_variance * logarithm / count)
        - 14 * logarithm / (3 * (count - 1))
    )
    return {
        "configured": len(selected),
        "played": len(selected),
        "seedBlocks": count,
        "difference": mean,
        "sampleVariance": sample_variance,
        "lowerBound": lower,
        "alpha": alpha,
        "conditioningProbability": probability_unique,
        "effectiveDelta": delta,
        "population": population,
        "method": "paired seed-block empirical Bernstein; Maurer-Pontil 2009 Theorem 11",
        "accepted": lower > 0,
    }
