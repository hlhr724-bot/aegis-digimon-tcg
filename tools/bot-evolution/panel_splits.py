"""Deterministic panel splits of filtered human deck matchups."""

import random
from dataclasses import dataclass
from typing import Any

SPLIT_SEED = 20261019
VALIDATION_PAIRS = 150


@dataclass(frozen=True)
class PanelSplits:
    fitness: list[dict[str, Any]]
    validation: list[dict[str, Any]]
    test: list[dict[str, Any]]


def panel_splits(pairs: list[dict[str, Any]]) -> PanelSplits:
    """Reproduce the bot-lab split so the test matchups stay unseen by every tuner."""
    train = [pair for pair in pairs if pair["split"] == "train"]
    test = [pair for pair in pairs if pair["split"] == "test"]
    order = list(range(len(train)))
    random.Random(SPLIT_SEED).shuffle(order)
    return PanelSplits(
        fitness=[train[index] for index in order[VALIDATION_PAIRS:]],
        validation=[train[index] for index in order[:VALIDATION_PAIRS]],
        test=test,
    )


def matchup_blocks(
    pairs: list[dict[str, Any]], opponent: str, seed_base: int
) -> list[dict[str, Any]]:
    return [
        {
            "matchId": pair["matchId"],
            "opponent": opponent,
            "decks": pair["decks"],
            "seedBase": seed_base + index * 4,
        }
        for index, pair in enumerate(pairs)
    ]


def alternating_blocks(
    pairs: list[dict[str, Any]], opponents: list[str], seed_base: int
) -> list[dict[str, Any]]:
    return [
        {
            "matchId": pair["matchId"],
            "opponent": opponents[index % len(opponents)],
            "decks": pair["decks"],
            "seedBase": seed_base + index * 4,
        }
        for index, pair in enumerate(pairs)
    ]


def block_games(block: dict[str, Any]) -> list[dict[str, Any]]:
    """Both deck orientations and both seats, seeded like the bot-lab panel.

    Each orientation has one game with the candidate first and one with it second.
    """
    return [
        {
            "matchId": block["matchId"],
            "opponent": block["opponent"],
            "orientation": orientation,
            "seat": seat,
            "seed": block["seedBase"] + orientation * 2 + seat,
            "firstSeat": seat if orientation == seat else 1 - seat,
            "decks": [block["decks"][orientation], block["decks"][1 - orientation]],
        }
        for orientation in (0, 1)
        for seat in (0, 1)
    ]
