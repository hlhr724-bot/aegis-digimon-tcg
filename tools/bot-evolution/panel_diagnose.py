import collections
import hashlib
import json
import random
from pathlib import Path
from typing import Any

import click

from PanelBatch import PanelBatch


def _select_losses(rows: list[dict[str, Any]], count: int, seed: int) -> list[dict[str, Any]]:
    losses = [
        row
        for row in rows
        if row["arm"] == "v2"
        and row["opponent"] == "certified"
        and row.get("valid") is True
        and row["win"] is False
    ]
    random.Random(seed).shuffle(losses)
    unique = {}
    for row in losses:
        if row["matchId"] not in unique:
            unique[row["matchId"]] = row
    if len(unique) < count:
        raise ValueError("There are too few distinct losing matchups")
    return list(unique.values())[:count]


@click.command()
@click.option("--validation-run", type=click.Path(exists=True, path_type=Path), required=True)
@click.option("--run-dir", type=click.Path(path_type=Path), required=True)
@click.option("--node", type=click.Path(exists=True), required=True)
@click.option("--count", type=click.IntRange(1, 500), default=100)
@click.option("--seed", type=int, default=20261020)
def _main(validation_run: Path, run_dir: Path, node: str, count: int, seed: int) -> None:
    repository = Path(__file__).resolve().parents[2]
    rows = [
        json.loads(line)
        for line in (validation_run / "results.jsonl").read_text(encoding="utf-8").splitlines()
    ]
    program_path = validation_run / "v2-catalog.json"
    program = json.loads(program_path.read_text(encoding="utf-8"))["program"]
    pairs = {
        pair["matchId"]: pair
        for pair in json.loads((validation_run / "matchups.json").read_text(encoding="utf-8"))
    }
    prior = json.loads((validation_run / "manifest.json").read_text(encoding="utf-8"))
    selected = _select_losses(rows, count, seed)
    jobs = []
    for row in selected:
        pair = pairs[row["matchId"]]
        jobs.append(
            {
                "id": row["id"],
                "program": program,
                "opponent": "certified",
                "trace": True,
                "seed": row["seed"],
                "seat": row["seat"],
                "decks": [pair["decks"][row["orientation"]], pair["decks"][1 - row["orientation"]]],
                "metadata": {
                    "matchId": row["matchId"],
                    "orientation": row["orientation"],
                    "seat": row["seat"],
                    "seed": row["seed"],
                    "expected": {key: row[key] for key in ("valid", "win", "reason", "turn")},
                },
            }
        )
    batch = PanelBatch(repository, node)
    try:
        if batch.fingerprint != prior["runtimeFingerprint"]:
            raise ValueError("Reproduction requires the exact runtime used for validation")
        batch.handle_signals()
        results = batch.run(jobs, run_dir / "games")
    finally:
        batch.close()
    divergent = [
        result["id"]
        for result in results
        if any(result.get(key) != value for key, value in result["metadata"]["expected"].items())
    ]
    summary = {
        "selectedLosses": count,
        "distinctMatchups": count,
        "selectionSeed": seed,
        "programSha256": hashlib.sha256(program_path.read_bytes()).hexdigest(),
        "runtime": batch.fingerprint,
        "reproducedExactly": count - len(divergent),
        "divergentGameIds": divergent,
        "decisionKinds": dict(
            collections.Counter(
                trace["kind"] for result in results for trace in result.get("traces", [])
            )
        ),
        "capturedDecisions": sum(len(result.get("traces", [])) for result in results),
        "traceLimitGames": sum(len(result.get("traces", [])) >= 300 for result in results),
        "peakWorkerRssMiB": round(batch.peak_rss),
    }
    (run_dir / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    click.echo(json.dumps(summary))
    if divergent:
        raise click.ClickException("Resolve replay divergence before diagnosing decisions")


if __name__ == "__main__":
    _main()
