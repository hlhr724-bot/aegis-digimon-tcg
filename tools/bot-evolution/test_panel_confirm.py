import copy
import json
import math
from pathlib import Path
from typing import Any

import pytest
from click.testing import CliRunner

import panel_confirm
from panel_confirm import _analyze


def _results() -> list[dict]:
    rows = []
    for opponent in ("certified", "legacy", "v2"):
        for matchup in range(24):
            for orientation in (0, 1):
                for seat in (0, 1):
                    for arm in ("baseline", "candidate"):
                        rows.append(
                            {
                                "valid": True,
                                "win": arm == "candidate",
                                "metadata": {
                                    "opponent": opponent,
                                    "matchId": str(matchup),
                                    "orientation": orientation,
                                    "seat": seat,
                                    "arm": arm,
                                },
                            }
                        )
    return rows


def test_paired_confirmation_keeps_opponent_strata_and_detects_a_consistent_gain() -> None:
    report = _analyze(_results())
    assert report["accepted"] is True
    assert report["weightedPairedDifference"]["mean"] == 1
    for result in report["opponents"].values():
        assert result["pairedFailureAsLoss"]["blocks"] == 24
        assert result["arms"]["candidate"]["wins"] == 96


def test_invalid_games_cannot_improve_the_primary_metric_or_pass_the_health_gate() -> None:
    rows = _results()
    rows[1]["valid"] = False
    report = _analyze(rows)
    assert report["accepted"] is False
    assert report["candidateInvalid"] == 1
    assert report["weightedPairedDifference"]["mean"] < 1
    assert report["opponents"]["certified"]["pairedValidBlocks"]["blocks"] == 23


def test_positive_point_estimates_need_a_positive_clustered_lower_bound() -> None:
    rows = _results()
    for row in rows:
        if int(row["metadata"]["matchId"]) >= 13:
            row["win"] = not row["win"]
    report = _analyze(rows)
    expected_variance = 143 / (144 * 23)
    expected_half = 1.96 * math.sqrt(expected_variance * (0.5**2 + 0.25**2 + 0.25**2))
    assert report["weightedPairedDifference"] == pytest.approx(
        {"mean": 1 / 12, "low": 1 / 12 - expected_half, "high": 1 / 12 + expected_half}
    )
    for result in report["opponents"].values():
        assert result["pairedFailureAsLoss"]["varianceOfMean"] == pytest.approx(expected_variance)
        assert result["pairedFailureAsLoss"]["mean"] > 0
    assert report["accepted"] is False


@pytest.mark.parametrize("change", ["missing", "duplicate"])
def test_incomplete_or_duplicated_matchup_blocks_are_rejected(change: str) -> None:
    rows = _results()
    if change == "missing":
        rows.pop()
    else:
        rows.append(copy.deepcopy(rows[0]))
    with pytest.raises(ValueError):
        _analyze(rows)


@pytest.mark.parametrize("frozen_opponent, baseline_costs", [("v2", True), ("v3", False)])
def test_reserve_accepts_identical_resume_and_rejects_another_candidate_in_another_directory(
    tmp_path: Path, monkeypatch, frozen_opponent: str, baseline_costs: bool
) -> None:
    baseline = {"title": "baseline", "rules": []}
    candidate = {"title": "candidate", "rules": []}
    baseline_path = tmp_path / "baseline.json"
    candidate_path = tmp_path / "candidate.json"
    pairs_path = tmp_path / "pairs.json"
    baseline_path.write_text(json.dumps(baseline), encoding="utf-8")
    candidate_path.write_text(json.dumps(candidate), encoding="utf-8")
    pairs_path.write_text(
        json.dumps(
            [
                {"matchId": f"matchup-{index}", "decks": [{"mainDeck": []}, {"mainDeck": []}]}
                for index in range(80)
            ]
        ),
        encoding="utf-8",
    )
    requests = []

    class FakeBatch:
        peak_rss = 100

        def __init__(self, repository: Path, node: str) -> None:
            self.identity = {"runtime": "frozen-runtime"}

        def handle_signals(self) -> None:
            pass

        def close(self) -> None:
            pass

        def run(self, jobs: list[dict[str, Any]], directory: Path) -> list[dict[str, Any]]:
            directory.mkdir(parents=True, exist_ok=True)
            requests.append(jobs)
            return [
                {
                    "metadata": job["metadata"],
                    "valid": True,
                    "win": job["metadata"]["arm"] == "candidate",
                }
                for job in jobs
            ]

    monkeypatch.setattr(panel_confirm, "PanelBatch", FakeBatch)
    command = [
        "--candidate",
        str(candidate_path),
        "--baseline",
        str(baseline_path),
        "--pairs",
        str(pairs_path),
        "--node",
        str(candidate_path),
        "--frozen-opponent",
        frozen_opponent,
        *(
            []
            if baseline_costs
            else ["--no-baseline-activation-costs", "--no-baseline-decision-context"]
        ),
        "--run-dir",
        str(tmp_path / "confirmation"),
    ]
    runner = CliRunner()
    first = runner.invoke(panel_confirm._main, command)
    assert first.exit_code == 0, first.output
    resumed = runner.invoke(panel_confirm._main, command)
    assert resumed.exit_code == 0, resumed.output
    assert requests[0] == requests[1]
    assert len(requests[0]) == 640
    arms = {
        arm: [job for job in requests[0] if job["metadata"]["arm"] == arm]
        for arm in ("baseline", "candidate")
    }
    assert [job["seed"] for job in arms["baseline"]] == [job["seed"] for job in arms["candidate"]]
    assert [job["decks"] for job in arms["baseline"]] == [job["decks"] for job in arms["candidate"]]
    assert all(
        job["opponentProgram"] == baseline
        for job in requests[0]
        if job["metadata"]["opponent"] == frozen_opponent
    )
    assert all(job["decisionContext"] is True for job in arms["candidate"])
    assert all(job["decisionContext"] is baseline_costs for job in arms["baseline"])
    assert all(
        job["opponentDecisionContext"] is baseline_costs
        for job in requests[0]
        if job["metadata"]["opponent"] == frozen_opponent
    )
    assert all(job["activationMemoryCosts"] is True for job in arms["candidate"])
    assert all(job["activationMemoryCosts"] is baseline_costs for job in arms["baseline"])
    assert all(
        job["opponentActivationMemoryCosts"] is baseline_costs
        for job in requests[0]
        if job["metadata"]["opponent"] == frozen_opponent
    )
    candidate_path.write_text(json.dumps({**candidate, "title": "changed"}), encoding="utf-8")
    changed = runner.invoke(panel_confirm._main, [*command[:-1], str(tmp_path / "another-run")])
    assert changed.exit_code != 0
    assert "inputs or runtime changed" in str(changed.exception)
    assert len(requests) == 2
    assert not (tmp_path / "another-run").exists()
