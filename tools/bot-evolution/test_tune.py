"""Numeric search stays deterministic, fixes its control, and never rewrites structure or advice."""

import json
import random
from types import SimpleNamespace

from tune import tune, weight_neighbor


def program():
    return {
        "schemaVersion": 1,
        "title": "Pilot",
        "rules": [
            {
                "feature": "cost",
                "weight": -1,
                "advice": "Spend carefully.",
                "when": {"kind": "main"},
            }
        ],
    }


def test_numeric_neighbor_keeps_conditions_advice_and_weight_sign():
    original = program()
    neighbor = weight_neighbor(original, random.Random(71), 2)
    assert neighbor["rules"][0]["weight"] in (-2, -0.5)
    assert {**neighbor["rules"][0], "weight": -1} == original["rules"][0]
    assert original["rules"][0]["weight"] == -1


def test_fixed_proposals_use_same_tasks_and_reuse_identical_programs(tmp_path):
    class Adapter:
        config = SimpleNamespace(engine_sha256="engine", simulations=256)

        def __init__(self):
            self.calls = []

        def evaluate(self, tasks, candidate):
            parsed = json.loads(candidate["heuristic"])
            self.calls.append((tasks, parsed))
            score = int(parsed["rules"][0]["weight"] == -2)
            return SimpleNamespace(
                outputs=[{"task": task, "score": score, "valid": True} for task in tasks]
            )

    tasks = [{"seed": index // 2, "learnerSeat": index % 2} for index in range(96)]
    adapters = [Adapter(), Adapter()]
    results = [
        tune(adapter, program(), tasks, seed=71, proposals=8, output=tmp_path / str(index))
        for index, adapter in enumerate(adapters)
    ]
    assert results[0] == results[1]
    assert results[0]["program"]["rules"][0]["weight"] == -2
    assert results[0]["pairedEvidence"]["alpha"] == 0.05 / 8
    assert all(batch == tasks for batch, _ in adapters[0].calls)
    assert len(adapters[0].calls) <= 5
    protocol = json.loads((tmp_path / "0/protocol.json").read_text())
    assert protocol["simulations"] == 256


def test_neutral_residual_weights_activate_with_code_owned_advice():
    original = {
        "schemaVersion": 1,
        "basePolicy": "projected-balanced",
        "title": "Balanced",
        "rules": [{"feature": "cost", "weight": 0, "advice": "Use balanced."}],
    }
    neighbor = weight_neighbor(original, random.Random(71), 2)
    assert neighbor["rules"][0]["weight"] in (-0.5, -1, -2, 0.5, 1, 2)
    assert ("caution" in neighbor["rules"][0]["advice"]) == (neighbor["rules"][0]["weight"] < 0)
    directions = {
        weight_neighbor(original, random.Random(seed), 2)["rules"][0]["weight"] > 0
        for seed in range(20)
    }
    assert directions == {False, True}
    assert original["rules"][0]["weight"] == 0
