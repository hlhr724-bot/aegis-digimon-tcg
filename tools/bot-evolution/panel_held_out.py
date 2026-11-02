"""Paired held-out comparison of two panel programs on untouched test matchups."""

import math
from typing import Any

from panel_adapter import PanelAdapter, game_points
from panel_splits import block_games, matchup_blocks

HELD_OUT_SEEDS = {"legacy": 3_000_000, "certified": 4_000_000}


def rate_interval(points: list[float]) -> dict[str, float | int]:
    count = len(points)
    if count == 0:
        return {"rate": math.nan, "low": math.nan, "high": math.nan, "games": 0}
    rate = sum(points) / count
    half = 1.96 * math.sqrt(max(rate * (1 - rate), 1e-9) / count)
    return {"rate": rate, "low": rate - half, "high": rate + half, "games": count}


def paired_difference(selected: list[float], start: list[float]) -> dict[str, float | int]:
    differences = [left - right for left, right in zip(selected, start, strict=True)]
    count = len(differences)
    if count < 2:
        return {"difference": math.nan, "low": math.nan, "high": math.nan, "pairs": count}
    mean = sum(differences) / count
    deviation = math.sqrt(sum((value - mean) ** 2 for value in differences) / (count - 1))
    half = 1.96 * deviation / math.sqrt(count)
    return {"difference": mean, "low": mean - half, "high": mean + half, "pairs": count}


def held_out_games(test: list[dict[str, Any]], matchups: dict[str, int]) -> list[dict[str, Any]]:
    """Each opponent gets its own slice of test matchups, mirroring the bot-lab final panel."""
    games = []
    offset = 0
    for opponent, count in matchups.items():
        selected = test[offset : offset + count]
        if len(selected) < count:
            raise ValueError(f"The test split has too few matchups for {opponent}")
        for block in matchup_blocks(selected, opponent, HELD_OUT_SEEDS[opponent]):
            games.extend(block_games(block))
        offset += count
    return games


def compare_programs(
    adapter: PanelAdapter,
    start: dict[str, Any],
    selected: dict[str, Any],
    test: list[dict[str, Any]],
    matchups: dict[str, int],
) -> dict[str, Any]:
    games = held_out_games(test, matchups)
    start_results = adapter.play(start, games, trace=False)
    selected_results = adapter.play(selected, games, trace=False)
    report: dict[str, Any] = {"matchups": matchups, "opponents": {}}
    for opponent in matchups:
        indices = [index for index, game in enumerate(games) if game["opponent"] == opponent]
        start_points = [
            game_points(start_results[index])
            for index in indices
            if start_results[index].get("valid") is True
        ]
        selected_points = [
            game_points(selected_results[index])
            for index in indices
            if selected_results[index].get("valid") is True
        ]
        paired = [
            index
            for index in indices
            if start_results[index].get("valid") is True
            and selected_results[index].get("valid") is True
        ]
        report["opponents"][opponent] = {
            "start": rate_interval(start_points),
            "selected": rate_interval(selected_points),
            "pairedDifference": paired_difference(
                [game_points(selected_results[index]) for index in paired],
                [game_points(start_results[index]) for index in paired],
            ),
            "invalid": {
                "start": len(indices) - len(start_points),
                "selected": len(indices) - len(selected_points),
            },
        }
    return report
