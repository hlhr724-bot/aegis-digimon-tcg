import json
from pathlib import Path
from typing import Any

from click.testing import CliRunner

import panel_activation_costs


def test_development_preserves_historical_controls_and_selects_only_corrected_programs(
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
            return [
                {
                    "metadata": job["metadata"],
                    "valid": True,
                    "win": job["metadata"]["tag"] == "projection-only"
                    or (job["metadata"]["tag"] == "uncertainty075" and job["seed"] % 4 != 0)
                    or (
                        job["metadata"]["tag"] not in ("projection-only", "uncertainty075")
                        and job["seed"] % 2 == 0
                    ),
                }
                for job in jobs
            ]

    monkeypatch.setattr(panel_activation_costs, "PanelBatch", FakeBatch)
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
    assert runner.invoke(panel_activation_costs._main, command).exit_code != 0
    result = runner.invoke(panel_activation_costs._main, command)
    assert result.exit_code == 0, result.output
    summary = json.loads((tmp_path / "run/summary.json").read_text())
    assert summary["selectedSource"] == "uncertainty075"
    assert (
        summary["screen"]["projection-only"]["fitness"]
        > summary["screen"]["uncertainty075"]["fitness"]
    )
    assert summary["developmentAccepted"] is True
    assert summary["requiresIndependentConfirmation"] is True
    assert requests["screen"][0] == requests["screen"][1]
    assert requests["selection"][0] == requests["selection"][1]
    screen_ids = {job["matchId"] for job in requests["screen"][0]}
    selection_ids = {job["matchId"] for job in requests["selection"][0]}
    assert screen_ids.isdisjoint(selection_ids)
    assert len(screen_ids) == 64
    assert len(selection_ids) == 96
    assert all(int(match_id.split("-")[1]) < 260 for match_id in screen_ids | selection_ids)
    for job in requests["screen"][0] + requests["selection"][0]:
        assert job["activationMemoryCosts"] is (job["metadata"]["tag"] != "historical-v3")
        if job["opponent"] == "v3":
            assert job["opponentActivationMemoryCosts"] is False
    selected = json.loads((tmp_path / "run/selected-program.json").read_text())
    bonuses = [
        rule for rule in selected["rules"] if rule["feature"] == "activate" and rule["weight"] == 3
    ]
    assert bonuses[0]["when"] == {"kind": "main", "minimum": {"freeActivation": 1}}
