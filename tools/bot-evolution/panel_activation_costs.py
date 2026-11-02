import copy
import hashlib
import json
import random
from pathlib import Path
from typing import Any

import click

from panel_splits import block_games, panel_splits
from PanelBatch import PanelBatch
from PanelCheckpoint import PanelCheckpoint

_WEIGHTS = {"certified": 0.5, "legacy": 0.25, "v3": 0.25}


def _score(rows: list[dict[str, Any]]) -> dict[str, Any]:
    opponents = {}
    for opponent in _WEIGHTS:
        selected = [row for row in rows if row["metadata"]["opponent"] == opponent]
        if not selected:
            raise ValueError("Every development batch needs all three opponents")
        valid = [row for row in selected if row.get("valid") is True]
        opponents[opponent] = {
            "rate": sum(0.5 if row["win"] is None else float(row["win"]) for row in valid)
            / len(selected),
            "games": len(selected),
            "invalid": len(selected) - len(valid),
        }
    return {
        "fitness": sum(_WEIGHTS[name] * value["rate"] for name, value in opponents.items()),
        "invalid": sum(value["invalid"] for value in opponents.values()),
        "opponents": opponents,
    }


def _programs(baseline: dict[str, Any]) -> dict[str, dict[str, Any]]:
    output = {"historical-v3": copy.deepcopy(baseline), "projection-only": copy.deepcopy(baseline)}
    for tag, penalty in (("free-bonus", 0), ("uncertainty075", -0.75), ("uncertainty150", -1.5)):
        program = copy.deepcopy(baseline)
        program["title"] = f"Human panel activation memory costs: {tag}"
        changed = 0
        for rule in program["rules"]:
            if rule["feature"] == "activate" and rule.get("when") == {
                "kind": "main",
                "maximum": {"handover": 0},
            }:
                rule["when"] = {"kind": "main", "minimum": {"freeActivation": 1}}
                rule["advice"] = (
                    "In the main phase, favor activated effects with no declared immediate memory payment."
                )
                changed += 1
        if changed != 1:
            raise ValueError("Expected exactly one historical free-activation bonus")
        if penalty:
            program["rules"].append(
                {
                    "feature": "costUncertain",
                    "weight": penalty,
                    "advice": "In the main phase, reduce the preference for activations whose memory cost remains uncertain.",
                    "when": {"kind": "main"},
                }
            )
        output[tag] = program
    return output


def _jobs(
    tag: str,
    program: dict[str, Any],
    pairs: list[dict[str, Any]],
    seed_base: int,
    baseline: dict[str, Any],
    *,
    selection: bool = False,
) -> list[dict[str, Any]]:
    schedule = (
        ("certified", "legacy", "v3") if selection else ("certified", "certified", "legacy", "v3")
    )
    jobs = []
    for index, pair in enumerate(pairs):
        opponent = schedule[index % len(schedule)]
        for game in block_games(
            {
                "matchId": pair["matchId"],
                "decks": pair["decks"],
                "opponent": opponent,
                "seedBase": seed_base + index * 4,
            }
        ):
            jobs.append(
                {
                    **game,
                    "id": f"{tag}|{opponent}|{game['matchId']}|{game['orientation']}|{game['seat']}",
                    "program": program,
                    "activationMemoryCosts": tag != "historical-v3",
                    **(
                        {"opponentProgram": baseline, "opponentActivationMemoryCosts": False}
                        if opponent == "v3"
                        else {}
                    ),
                    "metadata": {
                        "tag": tag,
                        **{
                            key: game[key]
                            for key in ("opponent", "matchId", "orientation", "seat", "seed")
                        },
                    },
                }
            )
    return jobs


@click.command()
@click.option("--baseline", type=click.Path(exists=True, path_type=Path), required=True)
@click.option("--pairs", type=click.Path(exists=True, path_type=Path), required=True)
@click.option("--run-dir", type=click.Path(path_type=Path), required=True)
@click.option("--node", type=click.Path(exists=True), required=True)
def _main(baseline: Path, pairs: Path, run_dir: Path, node: str) -> None:
    value = json.loads(baseline.read_text(encoding="utf-8"))
    program = value.get("program", value)
    splits = panel_splits(json.loads(pairs.read_text(encoding="utf-8")))
    if len(splits.fitness) < 64 or len(splits.validation) < 96:
        raise click.ClickException("Need 64 FITNESS and 96 VALIDATION matchups")
    order = list(splits.fitness)
    random.Random(20261021).shuffle(order)
    family = _programs(program)
    batch = PanelBatch(Path(__file__).resolve().parents[2], node)
    protocol = None
    try:
        batch.handle_signals()
        protocol = PanelCheckpoint(
            run_dir / "protocol",
            {
                **batch.identity,
                "sourceSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                "splitsSha256": hashlib.sha256(
                    (Path(__file__).parent / "panel_splits.py").read_bytes()
                ).hexdigest(),
                "baselineSha256": hashlib.sha256(baseline.read_bytes()).hexdigest(),
                "pairsSha256": hashlib.sha256(pairs.read_bytes()).hexdigest(),
                "programs": family,
                "weights": _WEIGHTS,
                "screenMatchups": 64,
                "selectionMatchups": 96,
                "screenSeed": 21_000_000,
                "selectionSeed": 22_000_000,
                "eligible": ["free-bonus", "uncertainty075", "uncertainty150"],
                "baselineActivationMemoryCosts": False,
                "candidateActivationMemoryCosts": True,
                "invalidPoints": 0,
                "maximumOpponentDrop": 0.02,
            },
        )
        screen = batch.run(
            [
                job
                for tag, candidate in family.items()
                for job in _jobs(tag, candidate, order[:64], 21_000_000, program)
            ],
            run_dir / "screen",
        )
        scores = {
            tag: _score([row for row in screen if row["metadata"]["tag"] == tag]) for tag in family
        }
        chosen = max(
            ("free-bonus", "uncertainty075", "uncertainty150"),
            key=lambda tag: scores[tag]["fitness"],
        )
        selected = batch.run(
            [
                job
                for tag in ("historical-v3", chosen)
                for job in _jobs(
                    tag, family[tag], splits.validation[:96], 22_000_000, program, selection=True
                )
            ],
            run_dir / "selection",
        )
        selection = {
            tag: _score([row for row in selected if row["metadata"]["tag"] == tag])
            for tag in ("historical-v3", chosen)
        }
        control, candidate_score = selection["historical-v3"], selection[chosen]
        accepted = (
            candidate_score["fitness"] > control["fitness"]
            and candidate_score["invalid"] <= control["invalid"]
            and all(
                candidate_score["opponents"][name]["rate"]
                >= control["opponents"][name]["rate"] - 0.02
                for name in _WEIGHTS
            )
        )
        report = {
            "complete": True,
            "selectedSource": chosen,
            "screen": scores,
            "selection": selection,
            "developmentAccepted": accepted,
            "requiresIndependentConfirmation": True,
            "peakWorkerRssMiB": round(batch.peak_rss),
        }
        for name, content in (
            ("selected-program.json", family[chosen]),
            ("start-program.json", program),
            ("summary.json", report),
        ):
            (run_dir / name).write_text(json.dumps(content, indent=2) + "\n", encoding="utf-8")
        click.echo(json.dumps(report))
    finally:
        if protocol is not None:
            protocol.close()
        batch.close()


if __name__ == "__main__":
    _main()
