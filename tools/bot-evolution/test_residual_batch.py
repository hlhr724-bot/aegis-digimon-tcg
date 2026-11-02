import json
import subprocess
from pathlib import Path

import pytest

from adapter import EvaluationConfig, HeuristicAdapter


@pytest.mark.parametrize("wrong_control", (False, True))
def test_residual_batch_keeps_certified_generic_opponent_and_cache_identity(
    tmp_path,
    monkeypatch,
    wrong_control,
):
    calls = []

    def complete(command, **kwargs):
        tasks = json.loads(kwargs["input"])
        calls.extend(tasks)
        return subprocess.CompletedProcess(
            command,
            0,
            stdout=json.dumps(
                [
                    {
                        "valid": True,
                        "score": 1,
                        "seed": task["seed"],
                        "learnerSeat": task["learnerSeat"],
                        "decks": task["decks"],
                        "opponent": "projected-balanced"
                        if wrong_control
                        else "coevolved-heuristic",
                    }
                    for task in tasks
                ]
            ),
        )

    monkeypatch.setattr("adapter.subprocess.run", complete)
    adapter = HeuristicAdapter(
        EvaluationConfig(
            node="node",
            worker=Path("/worker.js"),
            run_dir=tmp_path / "games",
            engine_sha256="engine",
            simulations=1,
            desktop_host="desktop",
            cache_dir=tmp_path / "cache",
        ),
        {"residualBatchSize": 32},
    )
    generic = {
        "basePolicy": "projected-balanced",
        "rules": [{"feature": "sourceDp", "weight": 0.2}],
    }
    task = {
        "seed": 1,
        "learnerSeat": 0,
        "decks": ["pilot", "opponent"],
        "opponent": "heuristic",
        "opponentProgram": generic,
    }
    if wrong_control:
        with pytest.raises(RuntimeError, match="different game or control"):
            adapter.evaluate([task], {"heuristic": json.dumps(generic)})
        return
    assert adapter.evaluate([task], {"heuristic": json.dumps(generic)}).scores == [1]
    assert adapter.evaluate([task], {"heuristic": json.dumps(generic)}).outputs[0]["cacheHit"]
    changed_opponent = {**generic, "rules": [{"feature": "sourceDp", "weight": 0.3}]}
    adapter.evaluate(
        [{**task, "opponentProgram": changed_opponent}], {"heuristic": json.dumps(generic)}
    )
    assert len(calls) == 2
    assert calls[0]["opponentProgram"] == generic
    assert calls[1]["opponentProgram"] == changed_opponent
    with pytest.raises(ValueError, match="restricted"):
        adapter.evaluate([{**task, "opponentProgram": {}}], {"heuristic": json.dumps(generic)})
