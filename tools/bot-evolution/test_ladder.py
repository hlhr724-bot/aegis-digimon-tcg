"""The training ladder bisects a blocked rung and preserves archive opponents."""

from types import SimpleNamespace

from adapter import EvaluationConfig
from ladder import RANDOM_OPPONENT, choose_training_rung, ladder_tasks


def test_ladder_advances_on_mastery_then_bisects_first_blocked_rung(tmp_path, monkeypatch):
    budgets = []

    class Scorer:
        def __init__(self, config, metadata):
            self.config = config

        def evaluate(self, tasks, candidate):
            budget = (
                0 if tasks[0].get("opponentProgram") == RANDOM_OPPONENT else self.config.simulations
            )
            budgets.append(budget)
            return SimpleNamespace(
                outputs=[{"task": task, "score": int(budget <= 2), "valid": True} for task in tasks]
            )

    monkeypatch.setattr("ladder.HeuristicAdapter", Scorer)
    adapter = SimpleNamespace(
        config=EvaluationConfig("node", tmp_path / "worker", tmp_path, "engine", 8), metadata={}
    )
    tasks = [
        {"seed": index // 2, "learnerSeat": index % 2, "opponent": "mcts"} for index in range(96)
    ]
    result = choose_training_rung(adapter, RANDOM_OPPONENT, tasks, tmp_path / "ladder", 8)
    assert result["masteredThrough"] == 2
    assert result["trainingRung"] == 3
    assert budgets == [0, 1, 4, 2, 3]


def test_zero_rung_preserves_frozen_archive_opponent():
    archive = {"seed": 1, "opponent": "heuristic", "opponentProgram": {"title": "frozen"}}
    search = {"seed": 2, "opponent": "mcts"}
    tasks = ladder_tasks([archive, search], 0, include_archive=True)
    assert tasks[0] == archive
    assert tasks[1]["opponentProgram"] == RANDOM_OPPONENT
    assert tasks[1]["opponent"] == "heuristic"
