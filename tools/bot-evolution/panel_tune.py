import copy
import hashlib
import json
import random
from pathlib import Path
from typing import Any

import click

from DiagonalCma import DiagonalCma
from panel_splits import block_games, panel_splits
from PanelBatch import PanelBatch
from PanelCheckpoint import PanelCheckpoint
from PanelWeightProgram import PanelWeightProgram

_OPPONENT_WEIGHTS = {"certified": 0.5, "legacy": 0.25, "v2": 0.25}


def _write(path: Path, value: Any) -> None:
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def _games(
    pairs: list[dict[str, Any]], seed: int, *, validation: bool = False
) -> list[dict[str, Any]]:
    output = []
    opponents = (
        ("certified", "legacy", "v2") if validation else ("certified", "certified", "legacy", "v2")
    )
    for index, pair in enumerate(pairs):
        output.extend(
            block_games(
                {
                    "matchId": pair["matchId"],
                    "decks": pair["decks"],
                    "opponent": opponents[index % len(opponents)],
                    "seedBase": seed + index * 4,
                }
            )
        )
    return output


def _jobs(
    tag: str, program: dict[str, Any], games: list[dict[str, Any]], opponent: dict[str, Any]
) -> list[dict[str, Any]]:
    return [
        {
            **game,
            "id": f"{tag}|{game['opponent']}|{game['matchId']}|{game['orientation']}|{game['seat']}",
            "program": program,
            **({"opponentProgram": opponent} if game["opponent"] == "v2" else {}),
            "metadata": {
                "tag": tag,
                **{
                    key: game[key] for key in ("opponent", "matchId", "orientation", "seat", "seed")
                },
            },
        }
        for game in games
    ]


def _score(results: list[dict[str, Any]]) -> dict[str, Any]:
    opponents = {}
    for opponent in _OPPONENT_WEIGHTS:
        rows = [row for row in results if row["metadata"]["opponent"] == opponent]
        if not rows:
            raise ValueError("Every training or selection batch needs all three opponents")
        valid = [row for row in rows if row.get("valid") is True]
        points = sum(0.5 if row["win"] is None else float(row["win"]) for row in valid)
        opponents[opponent] = {
            "rate": points / len(rows),
            "games": len(rows),
            "invalid": len(rows) - len(valid),
        }
    return {
        "fitness": sum(
            _OPPONENT_WEIGHTS[name] * scores["rate"] for name, scores in opponents.items()
        ),
        "opponents": opponents,
        "invalid": sum(scores["invalid"] for scores in opponents.values()),
    }


def _set_weights(program: dict[str, Any], weights: dict[str, float], title: str) -> dict[str, Any]:
    model = PanelWeightProgram(program)
    vector = model.vector()
    for position, index in enumerate(model.indices):
        feature = program["rules"][index]["feature"]
        if feature in weights:
            vector[position] = weights[feature] * model.scales[position]
    return model.build(vector, title)


def _hypotheses(program: dict[str, Any]) -> dict[str, dict[str, Any]]:
    output = {
        "v2": copy.deepcopy(program),
        "finishing": _set_weights(program, {"lethal": 16}, "Prioritize finishing attacks"),
        "board": _set_weights(program, {"attackWinningBattle": 2}, "Value favorable board attacks"),
        "memory": _set_weights(program, {"handover": -1.75}, "Give less memory to the opponent"),
    }
    hand = copy.deepcopy(program)
    hand["title"] = "Reduce excessive hand activations"
    hand["rules"].append(
        {
            "feature": "activate",
            "weight": -4,
            "advice": "In the main phase, reduce the preference for activating effects from hand.",
            "when": {"kind": "main", "minimum": {"sourceInHand": 1}},
        }
    )
    output["hand"] = hand
    combined = _set_weights(
        hand, {"lethal": 16, "attackWinningBattle": 1}, "Finishing pressure and board control"
    )
    output["combined"] = combined
    return output


def _can_select(candidate: dict[str, Any], baseline: dict[str, Any]) -> bool:
    if candidate["fitness"] <= baseline["fitness"] or candidate["invalid"] > baseline["invalid"]:
        return False
    return all(
        candidate["opponents"][name]["rate"] >= baseline["opponents"][name]["rate"] - 0.02
        for name in _OPPONENT_WEIGHTS
    )


@click.command()
@click.option("--start-program", type=click.Path(exists=True, path_type=Path), required=True)
@click.option("--pairs", type=click.Path(exists=True, path_type=Path), required=True)
@click.option("--run-dir", type=click.Path(path_type=Path), required=True)
@click.option("--node", type=click.Path(exists=True), required=True)
@click.option("--generations", type=click.IntRange(1, 12), default=4)
@click.option("--population", type=click.IntRange(4, 16), default=8)
@click.option("--sigma", type=click.FloatRange(min=0.01, max=2), default=0.7)
@click.option("--seed", type=int, default=20261020)
def _main(
    start_program: Path,
    pairs: Path,
    run_dir: Path,
    node: str,
    generations: int,
    population: int,
    sigma: float,
    seed: int,
) -> None:
    repository = Path(__file__).resolve().parents[2]
    value = json.loads(start_program.read_text(encoding="utf-8"))
    baseline = value.get("program", value)
    splits = panel_splits(json.loads(pairs.read_text(encoding="utf-8")))
    if len(splits.validation) < 96 or len(splits.fitness) < 32 + generations * 16:
        raise click.ClickException(
            "The original panel does not have enough disjoint train/selection blocks"
        )
    batch = PanelBatch(repository, node)
    protocol = None
    try:
        batch.handle_signals()
        manifest = {
            **batch.identity,
            "seed": seed,
            "generations": generations,
            "population": population,
            "sigma": sigma,
            "screenMatchups": 32,
            "generationMatchups": 16,
            "selectionMatchups": 96,
            "opponentWeights": _OPPONENT_WEIGHTS,
            "invalidPoints": 0,
            "maximumSelectionOpponentDrop": 0.02,
            "startSha256": hashlib.sha256(start_program.read_bytes()).hexdigest(),
            "pairsSha256": hashlib.sha256(pairs.read_bytes()).hexdigest(),
            "sourceSha256": {
                name: hashlib.sha256((Path(__file__).parent / name).read_bytes()).hexdigest()
                for name in (
                    "panel_tune.py",
                    "PanelWeightProgram.py",
                    "DiagonalCma.py",
                    "panel_splits.py",
                )
            },
        }
        protocol = PanelCheckpoint(run_dir / "protocol", manifest)
        _write(run_dir / "start-program.json", baseline)
        selection_games = _games(splits.validation[:96], 12_000_000, validation=True)
        control = batch.run(
            _jobs("v2", baseline, selection_games, baseline), run_dir / "selection-control"
        )
        control_score = _score(control)
        state_path = run_dir / "state.json"
        if state_path.is_file():
            saved = json.loads(state_path.read_text(encoding="utf-8"))
            anchor = saved["anchor"]
            model = PanelWeightProgram(anchor)
            search = DiagonalCma(model.vector(), population=population, state=saved["optimizer"])
            best = saved["best"]
            history = saved["history"]
        else:
            order = list(range(len(splits.fitness)))
            random.Random(seed).shuffle(order)
            screen_games = _games([splits.fitness[index] for index in order[:32]], 11_000_000)
            family = _hypotheses(baseline)
            screen_jobs = [
                job
                for tag, program in family.items()
                for job in _jobs(tag, program, screen_games, baseline)
            ]
            screen_results = batch.run(screen_jobs, run_dir / "hypotheses")
            screen_scores = {
                tag: _score([row for row in screen_results if row["metadata"]["tag"] == tag])
                for tag in family
            }
            chosen = max(family, key=lambda tag: screen_scores[tag]["fitness"])
            anchor = family[chosen]
            _write(run_dir / "hypothesis-programs.json", family)
            _write(run_dir / "hypothesis-scores.json", screen_scores)
            model = PanelWeightProgram(anchor)
            search = DiagonalCma(model.vector(), population=population, sigma=sigma, seed=seed)
            best = {"program": baseline, "score": control_score, "source": "v2"}
            if chosen != "v2":
                anchor_score = _score(
                    batch.run(
                        _jobs("anchor", anchor, selection_games, baseline),
                        run_dir / "selection-anchor",
                    )
                )
                if _can_select(anchor_score, control_score):
                    best = {
                        "program": anchor,
                        "score": anchor_score,
                        "source": f"hypothesis:{chosen}",
                    }
            history = [{"stage": "hypotheses", "anchor": chosen, "scores": screen_scores}]
            _write(
                state_path,
                {"anchor": anchor, "optimizer": search.state(), "best": best, "history": history},
            )
            click.echo(
                json.dumps(
                    {"stage": "hypotheses", "anchor": chosen, "selectionBest": best["score"]}
                )
            )
        train_order = list(range(len(splits.fitness)))
        random.Random(seed).shuffle(train_order)
        while search.generation < generations:
            generation = search.generation + 1
            offset = 32 + (generation - 1) * 16
            train_pairs = [splits.fitness[index] for index in train_order[offset : offset + 16]]
            games = _games(train_pairs, 13_000_000 + generation * 100_000)
            vectors = search.ask()
            candidates = {
                f"candidate{index}": model.build(
                    vector, f"Human panel numeric generation {generation} candidate {index}"
                )
                for index, vector in enumerate(vectors)
            }
            programs = {
                "v2": baseline,
                "mean": model.build(search.mean, "Current numeric mean"),
                **candidates,
            }
            jobs = [
                job
                for tag, program in programs.items()
                for job in _jobs(tag, program, games, baseline)
            ]
            results = batch.run(jobs, run_dir / f"train-{generation:02d}")
            scores = {
                tag: _score([row for row in results if row["metadata"]["tag"] == tag])
                for tag in programs
            }
            search.tell([scores[f"candidate{index}"]["fitness"] for index in range(population)])
            record = {
                "stage": "training",
                "generation": generation,
                "scores": scores,
                "sigma": search.sigma,
            }
            if generation % 2 == 0 or generation == generations:
                program = model.build(
                    search.mean, f"Human panel v3 numeric generation {generation}"
                )
                selected = batch.run(
                    _jobs(f"generation{generation}", program, selection_games, baseline),
                    run_dir / f"selection-{generation:02d}",
                )
                score = _score(selected)
                record["selection"] = score
                if (
                    _can_select(score, control_score)
                    and score["fitness"] > best["score"]["fitness"]
                ):
                    best = {
                        "program": program,
                        "score": score,
                        "source": f"generation:{generation}",
                    }
            history.append(record)
            _write(
                state_path,
                {"anchor": anchor, "optimizer": search.state(), "best": best, "history": history},
            )
            click.echo(
                json.dumps(
                    {
                        "stage": "generation",
                        "generation": generation,
                        "trainingMean": scores["mean"],
                        "selection": record.get("selection"),
                        "bestSource": best["source"],
                        "bestScore": best["score"],
                    }
                )
            )
        _write(run_dir / "selected-program.json", best["program"])
        _write(
            run_dir / "summary.json",
            {
                "complete": True,
                "selectedSource": best["source"],
                "selected": best["score"],
                "control": control_score,
                "generations": search.generation,
                "peakWorkerRssMiB": round(batch.peak_rss),
                "selectionOnly": True,
                "requiresIndependentConfirmation": True,
            },
        )
    finally:
        if protocol is not None:
            protocol.close()
        batch.close()


if __name__ == "__main__":
    _main()
