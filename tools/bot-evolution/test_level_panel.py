import json
from pathlib import Path

import pytest

from level_panel import _build_jobs, _summarize


def test_panel_covers_every_level_style_reference_and_adjacent_pair():
    pool = json.loads(Path(__file__).with_name("holdout-pool.json").read_text(encoding="utf-8"))
    jobs = _build_jobs(pool, 1)
    assert len(jobs) == 348
    assert len({job["id"] for job in jobs}) == len(jobs)
    assert len({job["levelPanel"]["seed"] for job in jobs}) == len(jobs)
    assert len({job["metadata"]["first"] for job in jobs}) == 15
    assert len([job for job in jobs if job["levelPanel"]["reference"] == "selected-level"]) == 48


def test_panel_seed_block_offsets_reserve_disjoint_holdout_seeds():
    pool = json.loads(Path(__file__).with_name("holdout-pool.json").read_text(encoding="utf-8"))
    first = _build_jobs(pool, 2)
    second = _build_jobs(pool, 1, 174)
    first_seeds = {job["levelPanel"]["seed"] for job in first}
    second_seeds = {job["levelPanel"]["seed"] for job in second}
    assert first_seeds.isdisjoint(second_seeds)
    assert min(second_seeds) == pool["seedBase"] + 4 * 174
    with pytest.raises(ValueError, match="reserved independent"):
        _build_jobs(pool, 1, pool["seedBlocks"])


def test_panel_accepts_a_separate_development_pool_with_its_own_seed_range():
    pool = {
        "seedBase": 1_900_000_000,
        "seedBlocks": 4096,
        "gamesPerBlock": 4,
        "decks": [
            {"id": "development-a", "mainDeck": ["BT1-010"], "eggDeck": []},
            {"id": "development-b", "mainDeck": ["BT1-011"], "eggDeck": []},
        ],
    }
    jobs = _build_jobs(pool, 1)
    assert len(jobs) == 348
    assert min(job["levelPanel"]["seed"] for job in jobs) == pool["seedBase"]
    assert max(job["levelPanel"]["seed"] for job in jobs) < pool["seedBase"] + pool["seedBlocks"] * 4


def test_adjacent_only_panel_keeps_reserved_comparison_seed_offsets():
    pool = json.loads(Path(__file__).with_name("holdout-pool.json").read_text(encoding="utf-8"))
    jobs = _build_jobs(pool, 1, adjacent_only=True)
    assert len(jobs) == 48
    assert {job["levelPanel"]["reference"] for job in jobs} == {"selected-level"}
    assert min(job["levelPanel"]["seed"] for job in jobs) == pool["seedBase"] + 4 * 75


def test_transition_panel_selects_one_adjacent_difficulty_without_reusing_seeds():
    pool = json.loads(Path(__file__).with_name("holdout-pool.json").read_text(encoding="utf-8"))
    jobs = _build_jobs(pool, 8, 900, transition="expert")
    assert len(jobs) == 96
    assert {job["levelPanel"]["difficulty"] for job in jobs} == {"expert"}
    assert {job["levelPanel"]["referenceDifficulty"] for job in jobs} == {"standard"}
    assert min(job["levelPanel"]["seed"] for job in jobs) == pool["seedBase"] + 4 * (900 + 81 * 8)


def test_reference_panel_selects_every_level_and_style_against_one_reference():
    pool = json.loads(Path(__file__).with_name("holdout-pool.json").read_text(encoding="utf-8"))
    jobs = _build_jobs(pool, 2, 900, reference_filter="legacy-balanced")
    assert len(jobs) == 120
    assert {job["levelPanel"]["reference"] for job in jobs} == {"legacy-balanced"}
    assert len({job["metadata"]["first"] for job in jobs}) == 15
    all_seeds = {job["levelPanel"]["seed"] for job in _build_jobs(pool, 2, 900)}
    assert {job["levelPanel"]["seed"] for job in jobs} <= all_seeds
    with pytest.raises(ValueError, match="one reference"):
        _build_jobs(pool, 1, reference_filter="legacy-balanced", transition="expert")


def test_summary_reports_a_block_interval_for_each_comparison():
    rows = [
        {
            "metadata": {
                "block": f"expert:balanced/standard:balanced/{block}",
                "first": "expert:balanced",
                "second": "standard:balanced",
                "orientation": orientation,
                "seat": seat,
            },
            "valid": True,
            "win": block == 0 or orientation == seat,
        }
        for block in range(2)
        for orientation in (0, 1)
        for seat in (0, 1)
    ]
    comparison = _summarize(rows)["comparisons"]["expert:balanced/standard:balanced"]
    assert comparison["blocks"] == 2
    assert comparison["pointsRate"] == 0.75
    assert comparison["pointsRateInterval95"] == pytest.approx([0.26, 1.0])


def test_incomplete_results_do_not_produce_a_rating():
    with pytest.raises(ValueError, match="incomplete"):
        _summarize(
            [
                {
                    "metadata": {
                        "block": "one",
                        "first": "candidate",
                        "second": "legacy-balanced",
                        "orientation": 0,
                        "seat": 0,
                    },
                    "valid": True,
                    "win": True,
                }
            ]
        )


def test_invalid_games_exclude_the_entire_block_instead_of_becoming_losses():
    rows = [
        {
            "metadata": {
                "block": "one",
                "first": "candidate",
                "second": "legacy-balanced",
                "orientation": orientation,
                "seat": seat,
            },
            "valid": False,
            "win": None,
        }
        for orientation in (0, 1)
        for seat in (0, 1)
    ]
    result = _summarize(rows)
    assert result["ratingBlocks"] == []
    assert result["invalidBlocks"] == ["one"]
    assert result["ladder"] is None
