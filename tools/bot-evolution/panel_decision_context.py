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
    selections = [
        ("selectionGain", 0.2, "Value visible cards gained and useful selected bodies."),
        ("selectionLoss", -0.2, "Preserve valuable visible cards when paying or discarding."),
        ("selectionRookie", 4.0, "Preserve the only available starting line."),
        ("selectionDuplicate", 4.0, "Prefer a diverse hand and spend duplicate cards first."),
        (
            "selectionNoop",
            -12.0,
            "Avoid suspending or unsuspending a target already in that state.",
        ),
    ]
    effects = [
        ("decisionMemory", 2.0, "Prefer declared immediate memory gain."),
        ("decisionDraw", 1.5, "Value declared card draw."),
        ("decisionRecovery", 3.0, "Value declared security recovery."),
        ("decisionRemoval", 2.0, "Value disruption when its affected player has a visible board."),
        ("decisionPlay", 2.0, "Value declared play operations."),
        ("decisionEvolution", 2.0, "Value declared evolution operations."),
        ("decisionUnsuspend", 1.0, "Consider declared unsuspend operations."),
        ("decisionCost", -1.0, "Prefer lower known immediate spending for effect choices."),
        ("decisionUncertain", -0.2, "Reduce confidence in unresolved declared outcomes."),
    ]
    rules = {
        "selections": [
            {"feature": feature, "weight": weight, "advice": advice, "when": {"kind": kind}}
            for kind in ("selectCards", "chooseTargets")
            for feature, weight, advice in selections
        ],
        "choices": [
            {
                "feature": feature,
                "weight": weight,
                "advice": advice,
                "when": {"kind": "chooseOption"},
            }
            for feature, weight, advice in effects
        ],
        "ordering": [
            {
                "feature": feature,
                "weight": weight,
                "advice": advice,
                "when": {"kind": "orderTriggers"},
            }
            for feature, weight, advice in effects
        ],
    }
    output = {"historical-v3": copy.deepcopy(baseline)}
    for tag in (*rules, "combined"):
        program = copy.deepcopy(baseline)
        program["title"] = f"Human panel decision context: {tag}"
        added = (
            rules[tag] if tag in rules else [rule for family in rules.values() for rule in family]
        )
        program["rules"].extend(copy.deepcopy(added))
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
                    "activationMemoryCosts": True,
                    "decisionContext": tag != "historical-v3",
                    **(
                        {
                            "opponentProgram": baseline,
                            "opponentActivationMemoryCosts": True,
                            "opponentDecisionContext": False,
                        }
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
    random.Random(20261022).shuffle(order)
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
                "screenSeed": 41_000_000,
                "selectionSeed": 42_000_000,
                "eligible": ["selections", "choices", "ordering", "combined"],
                "baselineActivationMemoryCosts": True,
                "baselineDecisionContext": False,
                "candidateDecisionContext": True,
                "selectionPrograms": 5,
                "candidateActivationMemoryCosts": True,
                "invalidPoints": 0,
                "maximumOpponentDrop": 0.02,
            },
        )
        screen = batch.run(
            [
                job
                for tag, candidate in family.items()
                for job in _jobs(tag, candidate, order[:64], 41_000_000, program)
            ],
            run_dir / "screen",
        )
        scores = {
            tag: _score([row for row in screen if row["metadata"]["tag"] == tag]) for tag in family
        }
        eligible = ("selections", "choices", "ordering", "combined")
        selected = batch.run(
            [
                job
                for tag, candidate in family.items()
                for job in _jobs(
                    tag, candidate, splits.validation[:96], 42_000_000, program, selection=True
                )
            ],
            run_dir / "selection",
        )
        selection = {
            tag: _score([row for row in selected if row["metadata"]["tag"] == tag])
            for tag in family
        }
        control = selection["historical-v3"]
        accepted_tags = [
            tag
            for tag in eligible
            if selection[tag]["fitness"] > control["fitness"]
            and selection[tag]["invalid"] <= control["invalid"]
            and all(
                selection[tag]["opponents"][name]["rate"]
                >= control["opponents"][name]["rate"] - 0.02
                for name in _WEIGHTS
            )
        ]
        chosen = max(accepted_tags or eligible, key=lambda tag: selection[tag]["fitness"])
        accepted = bool(accepted_tags)
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
