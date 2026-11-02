import json
from pathlib import Path
from typing import Any

import pytest
from click.testing import CliRunner

import panel_tune
from PanelWeightProgram import PanelWeightProgram


@pytest.mark.parametrize("interrupted_stage", ["train-02", "selection-02"])
def test_interrupted_campaign_resumes_identical_jobs_without_crossing_data_splits(
    tmp_path: Path,
    monkeypatch,
    interrupted_stage: str,
) -> None:
    start = (
        Path(__file__).resolve().parents[2]
        / "apps/api/src/bot/evolution/programs/human-panel-v2.json"
    )
    baseline = json.loads(start.read_text(encoding="utf-8"))["program"]
    pairs = [
        {
            "matchId": f"matchup-{index}",
            "split": "train" if index < 260 else "test",
            "decks": [
                {"mainDeck": ["card-a"], "eggDeck": []},
                {"mainDeck": ["card-b"], "eggDeck": []},
            ],
        }
        for index in range(280)
    ]
    pairs_path = tmp_path / "pairs.json"
    pairs_path.write_text(json.dumps(pairs), encoding="utf-8")
    requests: dict[str, list[list[dict[str, Any]]]] = {}
    interrupted = False

    class FakeBatch:
        peak_rss = 100

        def __init__(self, repository: Path, node: str) -> None:
            self.identity = {"runtime": "frozen-runtime"}

        def handle_signals(self) -> None:
            pass

        def close(self) -> None:
            pass

        def run(self, jobs: list[dict[str, Any]], directory: Path) -> list[dict[str, Any]]:
            nonlocal interrupted
            requests.setdefault(directory.name, []).append(jobs)
            if directory.name == interrupted_stage and not interrupted:
                interrupted = True
                raise OSError("interrupted before completing a generation")
            return [
                {
                    "id": job["id"],
                    "metadata": job["metadata"],
                    "valid": True,
                    "win": job["seed"] % 2 == 0,
                }
                for job in jobs
            ]

    monkeypatch.setattr(panel_tune, "PanelBatch", FakeBatch)
    command = [
        "--start-program",
        str(start),
        "--pairs",
        str(pairs_path),
        "--run-dir",
        str(tmp_path / "campaign"),
        "--node",
        str(start),
        "--generations",
        "2",
    ]
    runner = CliRunner()
    first = runner.invoke(panel_tune._main, command)
    assert first.exit_code != 0
    state = json.loads((tmp_path / "campaign/state.json").read_text(encoding="utf-8"))
    assert state["optimizer"]["generation"] == 1
    resumed = runner.invoke(panel_tune._main, command)
    assert resumed.exit_code == 0, resumed.output
    assert requests["train-02"][0] == requests["train-02"][1]
    summary = json.loads((tmp_path / "campaign/summary.json").read_text(encoding="utf-8"))
    assert summary["complete"] is True
    assert summary["requiresIndependentConfirmation"] is True
    final_state = (tmp_path / "campaign/state.json").read_bytes()
    train_calls = len(requests["train-02"])
    completed_resume = runner.invoke(panel_tune._main, command)
    assert completed_resume.exit_code == 0
    assert len(requests["train-02"]) == train_calls
    assert (tmp_path / "campaign/state.json").read_bytes() == final_state
    groups = {name: {job["matchId"] for job in calls[0]} for name, calls in requests.items()}
    assert groups["hypotheses"].isdisjoint(groups["train-01"] | groups["train-02"])
    assert groups["train-01"].isdisjoint(groups["train-02"])
    assert groups["selection-control"].isdisjoint(
        groups["hypotheses"] | groups["train-01"] | groups["train-02"]
    )
    assert not any(
        int(match_id.split("-")[1]) >= 260 for group in groups.values() for match_id in group
    )
    tuned = set(PanelWeightProgram(baseline).indices)
    for calls in requests.values():
        for job in calls[0]:
            assert [
                rule
                for index, rule in enumerate(job["program"]["rules"][:42])
                if index not in tuned
            ] == [rule for index, rule in enumerate(baseline["rules"]) if index not in tuned]
