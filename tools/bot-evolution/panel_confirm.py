import hashlib
import json
import math
import statistics
from pathlib import Path
from typing import Any

import click

from panel_splits import block_games
from PanelBatch import PanelBatch
from PanelCheckpoint import PanelCheckpoint


def _points(row: dict[str, Any]) -> float:
    if row.get("valid") is not True:
        return 0.0
    return 0.5 if row["win"] is None else float(row["win"])


def _interval(values: list[float]) -> dict[str, float | int]:
    mean = statistics.mean(values)
    variance = statistics.variance(values) / len(values) if len(values) > 1 else 0.0
    half = 1.96 * math.sqrt(variance)
    return {
        "mean": mean,
        "low": mean - half,
        "high": mean + half,
        "varianceOfMean": variance,
        "blocks": len(values),
    }


def _analyze(rows: list[dict[str, Any]], *, frozen_opponent: str = "v2") -> dict[str, Any]:
    weights = {"certified": 0.5, "legacy": 0.25, frozen_opponent: 0.25}
    opponents = {}
    for opponent in weights:
        selected = [row for row in rows if row["metadata"]["opponent"] == opponent]
        indexed = {}
        for row in selected:
            meta = row["metadata"]
            key = (meta["matchId"], meta["orientation"], meta["seat"], meta["arm"])
            if key in indexed:
                raise ValueError("Confirmation contains duplicate games")
            indexed[key] = row
        matchups = sorted({row["metadata"]["matchId"] for row in selected})
        differences = []
        valid_differences = []
        for match_id in matchups:
            keys = [(match_id, orientation, seat) for orientation in (0, 1) for seat in (0, 1)]
            if not all((*key, arm) in indexed for key in keys for arm in ("baseline", "candidate")):
                raise ValueError("Confirmation has an incomplete matchup block")
            difference = statistics.mean(
                _points(indexed[(*key, "candidate")]) - _points(indexed[(*key, "baseline")])
                for key in keys
            )
            differences.append(difference)
            if all(
                indexed[(*key, arm)].get("valid") is True
                for key in keys
                for arm in ("baseline", "candidate")
            ):
                valid_differences.append(difference)
        if not differences:
            raise ValueError("Confirmation needs games against every opponent")
        arms = {}
        for arm in ("baseline", "candidate"):
            mine = [row for row in selected if row["metadata"]["arm"] == arm]
            valid = [row for row in mine if row.get("valid") is True]
            points = sum(_points(row) for row in mine)
            arms[arm] = {
                "games": len(mine),
                "valid": len(valid),
                "invalid": len(mine) - len(valid),
                "rate": points / len(valid) if valid else None,
                "failureAsLossRate": points / len(mine),
                "wins": sum(row.get("win") is True for row in valid),
                "draws": sum(row.get("win") is None for row in valid),
            }
        opponents[opponent] = {
            "arms": arms,
            "pairedFailureAsLoss": _interval(differences),
            "pairedValidBlocks": _interval(valid_differences) if valid_differences else None,
        }
    macro = sum(
        weights[name] * result["pairedFailureAsLoss"]["mean"] for name, result in opponents.items()
    )
    variance = sum(
        weights[name] ** 2 * result["pairedFailureAsLoss"]["varianceOfMean"]
        for name, result in opponents.items()
    )
    half = 1.96 * math.sqrt(variance)
    base_invalid = sum(result["arms"]["baseline"]["invalid"] for result in opponents.values())
    candidate_invalid = sum(result["arms"]["candidate"]["invalid"] for result in opponents.values())
    enough = min(result["pairedFailureAsLoss"]["blocks"] for result in opponents.values()) >= 20
    no_drop = all(result["pairedFailureAsLoss"]["mean"] >= -0.02 for result in opponents.values())
    accepted = (
        enough
        and macro - half > 0
        and no_drop
        and candidate_invalid <= base_invalid
        and opponents["certified"]["pairedFailureAsLoss"]["mean"] > 0
    )
    return {
        "opponents": opponents,
        "weightedPairedDifference": {"mean": macro, "low": macro - half, "high": macro + half},
        "baselineInvalid": base_invalid,
        "candidateInvalid": candidate_invalid,
        "accepted": accepted,
        "primaryMetric": "Paired matchup points; invalid games count as zero",
        "interval": "Approximate 95% normal interval, clustered by matchup and stratified by opponent",
        "opponentWeights": weights,
    }


@click.command()
@click.option("--candidate", type=click.Path(exists=True, path_type=Path), required=True)
@click.option("--baseline", type=click.Path(exists=True, path_type=Path), required=True)
@click.option("--pairs", type=click.Path(exists=True, path_type=Path), required=True)
@click.option("--run-dir", type=click.Path(path_type=Path), required=True)
@click.option("--node", type=click.Path(exists=True), required=True)
@click.option("--frozen-opponent", type=click.Choice(["v2", "v3"]), default="v2")
@click.option("--baseline-activation-costs/--no-baseline-activation-costs", default=True)
@click.option("--baseline-decision-context/--no-baseline-decision-context", default=True)
@click.option("--seed-base", type=click.IntRange(1, 1_000_000_000), default=15_000_000)
def _main(
    candidate: Path,
    baseline: Path,
    pairs: Path,
    run_dir: Path,
    node: str,
    frozen_opponent: str,
    baseline_activation_costs: bool,
    baseline_decision_context: bool,
    seed_base: int,
) -> None:
    baseline_value = json.loads(baseline.read_text(encoding="utf-8"))
    baseline_program = baseline_value.get("program", baseline_value)
    candidate_value = json.loads(candidate.read_text(encoding="utf-8"))
    candidate_program = candidate_value.get("program", candidate_value)
    matchups = json.loads(pairs.read_text(encoding="utf-8"))
    if (
        len(matchups) < 80
        or len(matchups) % 4
        or len({pair["matchId"] for pair in matchups}) != len(matchups)
    ):
        raise click.ClickException("Reserve at least 80 unique matchups, in a multiple of four")
    batch = PanelBatch(Path(__file__).resolve().parents[2], node)
    protocol = None
    try:
        batch.handle_signals()
        protocol = PanelCheckpoint(
            pairs.parent / "confirmation-attempt",
            {
                **batch.identity,
                "candidateSha256": hashlib.sha256(candidate.read_bytes()).hexdigest(),
                "baselineSha256": hashlib.sha256(baseline.read_bytes()).hexdigest(),
                "pairsSha256": hashlib.sha256(pairs.read_bytes()).hexdigest(),
                "sourceSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                "seedBase": seed_base,
                "baselineActivationMemoryCosts": baseline_activation_costs,
                "candidateActivationMemoryCosts": True,
                "baselineDecisionContext": baseline_decision_context,
                "candidateDecisionContext": True,
                "primaryMetric": "Failure-as-loss paired matchup points",
                "weights": {"certified": 0.5, "legacy": 0.25, frozen_opponent: 0.25},
                "minimumOpponentBlocks": 20,
                "maximumOpponentDrop": 0.02,
                "acceptance": "Weighted lower95 above zero, certified gain positive, no opponent drop above2pp, no more invalid games",
            },
        )
        jobs = []
        schedule = ("certified", "certified", "legacy", frozen_opponent)
        for index, pair in enumerate(matchups):
            opponent = schedule[index % len(schedule)]
            games = block_games(
                {
                    "matchId": pair["matchId"],
                    "decks": pair["decks"],
                    "opponent": opponent,
                    "seedBase": seed_base + index * 4,
                }
            )
            for game in games:
                for arm, program in (
                    ("baseline", baseline_program),
                    ("candidate", candidate_program),
                ):
                    jobs.append(
                        {
                            **game,
                            "program": program,
                            "activationMemoryCosts": arm == "candidate"
                            or baseline_activation_costs,
                            "decisionContext": arm == "candidate" or baseline_decision_context,
                            "id": f"{arm}|{opponent}|{game['matchId']}|{game['orientation']}|{game['seat']}",
                            **(
                                {
                                    "opponentProgram": baseline_program,
                                    "opponentActivationMemoryCosts": baseline_activation_costs,
                                    "opponentDecisionContext": baseline_decision_context,
                                }
                                if opponent == frozen_opponent
                                else {}
                            ),
                            "metadata": {
                                "arm": arm,
                                **{
                                    key: game[key]
                                    for key in (
                                        "opponent",
                                        "matchId",
                                        "orientation",
                                        "seat",
                                        "seed",
                                    )
                                },
                            },
                        }
                    )
        rows = batch.run(jobs, run_dir / "games")
        report = {
            "complete": True,
            "games": len(rows),
            "matchups": len(matchups),
            "peakWorkerRssMiB": round(batch.peak_rss),
            **_analyze(rows, frozen_opponent=frozen_opponent),
        }
        (run_dir / "summary.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        (run_dir / "candidate-program.json").write_text(
            json.dumps(candidate_program, indent=2) + "\n", encoding="utf-8"
        )
        (run_dir / "baseline-program.json").write_text(
            json.dumps(baseline_program, indent=2) + "\n", encoding="utf-8"
        )
        click.echo(json.dumps(report))
    finally:
        if protocol is not None:
            protocol.close()
        batch.close()


if __name__ == "__main__":
    _main()
