"""Measure a frozen policy on an opponent ladder and bisect its first blocked rung."""

import hashlib
import json
import math
from dataclasses import replace
from pathlib import Path
from statistics import NormalDist

from adapter import HeuristicAdapter
from evidence import policy_hash

RANDOM_OPPONENT = {
    "schemaVersion": 1,
    "title": "Seeded legal-action control",
    "rules": [
        {
            "feature": "bias",
            "weight": 0,
            "advice": "Choose a legal action without a score preference.",
        }
    ],
}


def ladder_tasks(
    tasks: list[dict], simulations: int, *, include_archive: bool = False
) -> list[dict]:
    result = []
    for task in tasks:
        if include_archive and task.get("opponent") == "heuristic":
            result.append(task)
            continue
        match = {key: value for key, value in task.items() if key != "opponentProgram"}
        match["opponent"] = "heuristic" if simulations == 0 else "mcts"
        if simulations == 0:
            match["opponentProgram"] = RANDOM_OPPONENT
        result.append(match)
    # An archive/search task can collapse to the same random/search control task.
    return list({json.dumps(task, sort_keys=True): task for task in result}.values())


def mastery(games: list[dict]) -> dict:
    blocks = {}
    for game in games:
        if game.get("valid") is True:
            seed = game["task"]["seed"]
            task_hash = hashlib.sha256(
                json.dumps(game["task"], sort_keys=True).encode()
            ).hexdigest()
            if seed not in blocks or task_hash < blocks[seed][0]:
                blocks[seed] = (task_hash, game["score"] == 1)
    played = sum(game.get("valid") is True for game in games)
    count, wins = len(blocks), sum(value[1] for value in blocks.values())
    lower = None
    if count:
        z = NormalDist().inv_cdf(0.95)
        share = wins / count
        lower = (
            share
            + z * z / (2 * count)
            - z * math.sqrt(share * (1 - share) / count + z * z / (4 * count * count))
        ) / (1 + z * z / count)
    return {
        "played": played,
        "configured": len(games),
        "seedBlocks": count,
        "representativeWins": wins,
        "lowerBoundWinRate": lower,
        "method": "Wilson wins, one fixed task per seed (approximate)",
        "mastered": played >= 48 and played == len(games) and lower is not None and lower > 0.5,
    }


def choose_training_rung(
    adapter: HeuristicAdapter, program: dict, tasks: list[dict], directory: Path, maximum: int
) -> dict:
    if len(tasks) < 48:
        raise ValueError("Ladder screening requires at least 48 games")
    directory.mkdir(parents=True, exist_ok=True)
    tested = {}
    lower = None
    upper = None

    def evaluate(rung):
        if rung not in tested:
            scorer = HeuristicAdapter(
                replace(
                    adapter.config, simulations=max(1, rung), run_dir=directory / f"rung-{rung}"
                ),
                adapter.metadata,
            )
            games = scorer.evaluate(
                ladder_tasks(tasks, rung), {"heuristic": json.dumps(program)}
            ).outputs
            tested[rung] = mastery(games)
            (directory / f"rung-{rung}.json").write_text(json.dumps(tested[rung], indent=2) + "\n")
        return tested[rung]

    rungs = sorted({0, *[rung for rung in (1, 4, 16, 64, 128, 256) if rung <= maximum], maximum})
    for rung in rungs:
        if evaluate(rung)["mastered"]:
            lower = rung
        else:
            upper = rung
            break
    if lower is not None and upper is not None:
        while upper - lower > 1:
            middle = (upper + lower) // 2
            if evaluate(middle)["mastered"]:
                lower = middle
            else:
                upper = middle
    result = {
        "policySha256": policy_hash(program),
        "masteredThrough": lower,
        "trainingRung": upper if upper is not None else maximum,
        "rungs": tested,
        "purpose": "training-gradient screening, not final certification",
    }
    (directory / "selected.json").write_text(json.dumps(result, indent=2) + "\n")
    return result
