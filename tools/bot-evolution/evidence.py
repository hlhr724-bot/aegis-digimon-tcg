"""Program identity and conservative paired evidence, shared by training and publishing."""

import hashlib
import json
import math
from collections import defaultdict
from statistics import NormalDist
from typing import Any


def normalized(value):
    if isinstance(value, dict):
        return {key: normalized(item) for key, item in value.items()}
    if isinstance(value, list):
        return [normalized(item) for item in value]
    if isinstance(value, float) and math.isfinite(value) and value.is_integer():
        return int(value)
    return value


def program_hash(program: dict[str, Any]) -> str:
    parsed = {
        key: program[key]
        for key in ("schemaVersion", "basePolicy", "title", "rules")
        if key in program
    }
    return hashlib.sha256(json.dumps(normalized(parsed), sort_keys=True).encode()).hexdigest()


def policy_hash(program: dict[str, Any]) -> str:
    """Titles, advice, formatting and blocked intents cannot create an alternative policy."""
    rules = [
        {key: rule[key] for key in ("feature", "weight", "when") if key in rule}
        for rule in program.get("rules", [])
    ]
    identity = (
        {"basePolicy": program["basePolicy"], "rules": rules} if "basePolicy" in program else rules
    )
    return hashlib.sha256(json.dumps(normalized(identity), sort_keys=True).encode()).hexdigest()


def verify_neutral_control(outputs: list[dict]) -> dict:
    """Seat swaps of a zero residual must replay the same balanced game."""
    blocks = defaultdict(list)
    for output in outputs:
        if output.get("valid") is not True:
            raise ValueError("Neutral control audit requires valid completed games")
        blocks[output["task"]["seed"]].append(output)
    if not blocks:
        raise ValueError("Neutral control audit requires paired games")
    for games in blocks.values():
        orders = defaultdict(dict)
        if len(games) != 4 or sum(game["score"] for game in games) != 2:
            raise ValueError("Neutral control changed outcomes after swapping learner seats")
        for game in games:
            order = tuple(game["task"]["decks"])
            seat = game["task"]["learnerSeat"]
            if seat in orders[order]:
                raise ValueError("Neutral control audit repeated a task")
            orders[order][seat] = game
        if len(orders) != 2 or any(set(pair) != {0, 1} for pair in orders.values()):
            raise ValueError("Neutral control audit needs both assignments and both learner seats")
        for pair in orders.values():
            if any(
                pair[0]["result"].get(key) != pair[1]["result"].get(key)
                for key in ("winnerSeat", "turnCount", "reason")
            ):
                raise ValueError("Neutral control changed the seeded game")
    return {"games": len(outputs), "seedBlocks": len(blocks), "score": 0.5, "verified": True}


def paired_evidence(
    selected: list[dict], control: list[dict], alpha: float = 0.05, *, method: str = "hoeffding"
) -> dict:
    """Pool identical tasks once; seats/opponents sharing a seed are one independent block.

    Hoeffding's bound applies to seed-block differences in [-1, 1]. It deliberately
    does not count cached rechecks or both seats as independent samples.
    """
    if not 0 < alpha < 1:
        raise ValueError("Confidence alpha must be in (0, 1)")

    def unique(games: list[dict]) -> dict[str, dict]:
        records = {}
        for game in games:
            key = json.dumps(game["task"], sort_keys=True)
            if key in records and (records[key]["score"], records[key]["valid"]) != (
                game["score"],
                game["valid"],
            ):
                raise ValueError("Repeated deterministic task produced conflicting outcomes")
            records[key] = game
        return records

    arms = [unique(games) for games in (selected, control)]
    if arms[0].keys() != arms[1].keys():
        raise ValueError("Selected and control games must use identical held-out tasks")
    blocks = defaultdict(list)
    played = 0
    for key, candidate in arms[0].items():
        incumbent = arms[1][key]
        if not all(game.get("valid") is True for game in (candidate, incumbent)):
            continue
        scores = [game.get("score") for game in (candidate, incumbent)]
        if any(
            type(score) not in (int, float) or not math.isfinite(score) or not 0 <= score <= 1
            for score in scores
        ):
            raise ValueError("Valid games require finite scores in [0, 1]")
        blocks[candidate["task"]["seed"]].append(
            (key, scores[0] - scores[1], int(scores[0] == 1) - int(scores[1] == 1))
        )
        played += 1
    differences = [sum(value[1] for value in values) / len(values) for values in blocks.values()]
    mean = sum(differences) / len(differences) if differences else None
    lower = mean - math.sqrt(2 * math.log(1 / alpha) / len(differences)) if differences else None
    details = {}
    label = "seed-block Hoeffding"
    gate_lower = lower
    if method == "wilson-wins":
        # Select one task per seed by its immutable task hash, before looking at
        # outcomes. This preserves independent blocks and binary paired win differences.
        representatives = [
            min(values, key=lambda value: hashlib.sha256(value[0].encode()).digest())[2]
            for values in blocks.values()
        ]
        positive = representatives.count(1)
        discordant = positive + representatives.count(-1)
        lower = None
        conditional_lower = None
        gate_lower = None
        if discordant:
            z = NormalDist().inv_cdf(1 - alpha)
            proportion = positive / discordant
            conditional_lower = (
                proportion
                + z * z / (2 * discordant)
                - z
                * math.sqrt(
                    proportion * (1 - proportion) / discordant
                    + z * z / (4 * discordant * discordant)
                )
            ) / (1 + z * z / discordant)
            gate_lower = 2 * conditional_lower - 1
        label = "paired Wilson wins; one task-hash representative per seed (approximate)"
        details = {
            "discordant": discordant,
            "selectedOnlyWins": positive,
            "conditionalWinShareLowerBound": conditional_lower,
            "representativeWinDifference": sum(representatives) / len(representatives)
            if representatives
            else None,
        }
    elif method != "hoeffding":
        raise ValueError("Unknown paired confidence method")
    return {
        **details,
        "configured": len(arms[0]),
        "played": played,
        "seedBlocks": len(differences),
        "difference": mean,
        "lowerBound": lower,
        "alpha": alpha,
        "method": label,
        "accepted": played >= 48
        and played == len(arms[0])
        and gate_lower is not None
        and gate_lower > 0
        and mean is not None
        and mean > 0,
    }
