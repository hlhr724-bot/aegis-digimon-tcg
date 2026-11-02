import json
from pathlib import Path
from typing import Any

from click.testing import CliRunner

import panel_decision_context


def test_development_keeps_splits_and_controls_frozen_and_rejects_opponent_regressions(
    tmp_path: Path, monkeypatch
) -> None:
    baseline = (
        Path(__file__).resolve().parents[2]
        / "apps/api/src/bot/evolution/programs/human-panel-v3.json"
    )
    pairs = [
        {
            "matchId": f"matchup-{index}",
            "split": "train" if index < 260 else "test",
            "decks": [{"mainDeck": []}, {"mainDeck": []}],
        }
        for index in range(280)
    ]
    pairs_path = tmp_path / "pairs.json"
    pairs_path.write_text(json.dumps(pairs), encoding="utf-8")
    requests = {}
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
            if directory.name == "selection" and not interrupted:
                interrupted = True
                raise OSError("interrupted development")
            rows = []
            for job in jobs:
                tag = job["metadata"]["tag"]
                win = job["seed"] % 4 == 0
                if tag == "combined":
                    win = job["seed"] % 2 == 0
                elif tag == "choices":
                    win = directory.name == "screen" or (
                        job["opponent"] != "legacy" and job["seed"] % 4 != 0
                    )
                rows.append({"metadata": job["metadata"], "valid": True, "win": win})
            return rows

    monkeypatch.setattr(panel_decision_context, "PanelBatch", FakeBatch)
    command = [
        "--baseline",
        str(baseline),
        "--pairs",
        str(pairs_path),
        "--run-dir",
        str(tmp_path / "run"),
        "--node",
        str(baseline),
    ]
    runner = CliRunner()
    assert runner.invoke(panel_decision_context._main, command).exit_code != 0
    result = runner.invoke(panel_decision_context._main, command)
    assert result.exit_code == 0, result.output
    summary = json.loads((tmp_path / "run/summary.json").read_text(encoding="utf-8"))
    assert summary["selectedSource"] == "combined"
    assert summary["selection"]["choices"]["fitness"] > summary["selection"]["combined"]["fitness"]
    assert summary["developmentAccepted"] is True
    assert summary["requiresIndependentConfirmation"] is True
    assert requests["screen"][0] == requests["screen"][1]
    assert requests["selection"][0] == requests["selection"][1]
    assert len(requests["screen"][0]) == 1280
    assert len(requests["selection"][0]) == 1920
    screen_ids = {job["matchId"] for job in requests["screen"][0]}
    selection_ids = {job["matchId"] for job in requests["selection"][0]}
    assert screen_ids.isdisjoint(selection_ids)
    assert len(screen_ids) == 64
    assert len(selection_ids) == 96
    assert all(int(match_id.split("-")[1]) < 260 for match_id in screen_ids | selection_ids)
    for job in requests["screen"][0] + requests["selection"][0]:
        assert job["activationMemoryCosts"] is True
        assert job["decisionContext"] is (job["metadata"]["tag"] != "historical-v3")
        if job["opponent"] == "v3":
            assert job["opponentActivationMemoryCosts"] is True
            assert job["opponentDecisionContext"] is False
    selected = json.loads((tmp_path / "run/selected-program.json").read_text(encoding="utf-8"))
    original_value = json.loads(baseline.read_text(encoding="utf-8"))
    original = original_value.get("program", original_value)
    assert selected["rules"][: len(original["rules"])] == original["rules"]
    assert len(selected["rules"]) <= 100
    assert all(
        rule["when"]["kind"] != "main" for rule in selected["rules"][len(original["rules"]) :]
    )
