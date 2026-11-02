import json
import tarfile
from copy import deepcopy
from pathlib import Path

import pytest
from click.testing import CliRunner

from matchup_report import main
from seed_block_interval import seed_block_interval
from summarize_matchups import summarize_matchups


def _fixture():
    unit = {"id": "block", "seed": 42, "decks": ["alpha", "beta"]}
    protocol = {
        "units": [unit],
        "looks": [1],
        "policySha256": "policy",
        "engineSha256": "engine",
        "control": "balanced",
    }
    records = []
    for assignment in ([0, 1], [1, 0]):
        for seat in (0, 1):
            winner = assignment.index(0)
            records.append(
                {
                    "unit": "block",
                    "seed": 42,
                    "decks": unit["decks"],
                    "assignment": assignment,
                    "learnerSeat": seat,
                    "winnerSeat": winner,
                    "score": int(winner == seat),
                    "valid": True,
                    "timedOut": False,
                    "errors": [],
                    "rejections": [],
                    "asynchronousRejections": [],
                    "fallbacks": [{"timeout": 0, "error": 0}] * 2,
                    "projectionChecks": 1,
                    "reason": "security",
                }
            )
    return protocol, records


def test_learner_deck_routing_averages_correlated_seats_per_seed():
    protocol, records = _fixture()
    report = summarize_matchups(protocol, records, 1)
    assert report["health"]["wins"] == 2
    assert report["health"]["losses"] == 2
    assert [
        (row["deck"], row["score"], row["games"], row["seedBlocks"]) for row in report["decks"]
    ] == [("alpha", 1, 2, 1), ("beta", 0, 2, 1)]
    assert report["decks"][0]["assessment"] == "inconclusive"
    assert report["confidence"]["familySize"] == 4


@pytest.mark.parametrize("timed_out", [True, False])
def test_execution_failure_is_visible_and_cannot_become_a_loss(timed_out):
    protocol, records = _fixture()
    records[0].update(valid=False, score=None, timedOut=timed_out)
    report = summarize_matchups(protocol, records, 1)
    assert report["health"]["playedGames"] == 3
    assert report["health"]["excludedIncompleteValidBlocks"] == 1
    assert report["health"]["timedOutGames"] == int(timed_out)
    assert report["health"]["invalidGames"] == int(not timed_out)
    assert all(row["score"] is None for row in report["decks"])


def test_duplicate_and_wrong_winner_scores_are_refused():
    protocol, records = _fixture()
    with pytest.raises(ValueError, match="Repeated game"):
        summarize_matchups(protocol, records + [deepcopy(records[0])], 1)
    records[0]["score"] = 0
    with pytest.raises(ValueError, match="Score does not match"):
        summarize_matchups(protocol, records, 1)


def test_more_independent_blocks_tighten_the_bounded_interval():
    short = seed_block_interval([0.6] * 100, 0.001)
    long = seed_block_interval([0.6] * 1000, 0.001)
    assert short["lower"] < 0.5 < long["lower"] < 0.6
    assert long["lower"] <= long["mean"] <= long["upper"]


def test_cli_publishes_pinned_certificate_counts_and_interactive_report(tmp_path):
    proof = Path(__file__).parent / "evidence/balanced-v6/proof.tgz"
    result = CliRunner().invoke(main, ["--proof", str(proof), "--output-dir", str(tmp_path)])
    assert result.exit_code == 0, result.output
    report = json.loads((tmp_path / "matchups.json").read_text())
    assert report["health"]["playedGames"] == 9600
    assert report["health"]["wins"] == 5036
    assert report["health"]["completeValidSeedBlocks"] == 2400
    assert report["confidence"]["looks"] == 3
    assert report["confidence"]["maximumAttempts"] == 5
    assert len(report["source"]["proofSha256"]) == 64
    assert len(report["source"]["rawBatchSha256"]) == 60
    assert "does not certify every deck" in (tmp_path / "matchups.html").read_text()


def test_cli_refuses_unpinned_archive_without_creating_report(tmp_path):
    proof = tmp_path / "empty.tgz"
    with tarfile.open(proof, "w:gz"):
        pass
    output = tmp_path / "report"
    result = CliRunner().invoke(main, ["--proof", str(proof), "--output-dir", str(output)])
    assert result.exit_code != 0
    assert "differs from the pinned" in result.output
    assert not output.exists()
