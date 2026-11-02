"""Deterministic paired weight search through the same real-engine adapter as GEPA."""

import json
import random
from copy import deepcopy
from pathlib import Path

import click

from adapter import EvaluationConfig, HeuristicAdapter
from evidence import paired_evidence, policy_hash
from residual_weights import RESIDUAL_WEIGHTS, activation_advice


def weight_neighbor(program: dict, random_source: random.Random, scale: float) -> dict:
    proposal = deepcopy(program)
    rule = random_source.choice(proposal["rules"])
    # Keep signs stable so numeric tuning cannot silently contradict authored advice.
    if rule["weight"] == 0 and program.get("basePolicy") == "projected-balanced":
        # Zero has no authored direction. Search both sides of the existing scorer,
        # then author advice for the code-selected direction.
        rule["weight"] = (
            RESIDUAL_WEIGHTS.get(rule["feature"], 0.25)
            * random_source.choice((0.5, 1, 2))
            * random_source.choice((-1, 1))
        )
        rule["advice"] = activation_advice(rule["feature"], rule["weight"])
    elif rule["weight"] != 0:
        rule["weight"] = max(
            -10000, min(10000, rule["weight"] * random_source.choice((1 / scale, scale)))
        )
    return proposal


def tune(
    adapter: HeuristicAdapter,
    initial: dict,
    tasks: list[dict],
    *,
    seed: int,
    proposals: int,
    output: Path,
) -> dict:
    if len({json.dumps(task, sort_keys=True) for task in tasks}) < 48:
        raise ValueError("Numeric selection requires at least 48 distinct paired games")
    random_source = random.Random(seed)
    incumbent = deepcopy(initial)
    # Same-seed control remains fixed throughout the pass; hashes reuse audited games.
    evaluated = {}

    def evaluate(program):
        fingerprint = policy_hash(program)
        if fingerprint not in evaluated:
            evaluated[fingerprint] = adapter.evaluate(
                tasks, {"heuristic": json.dumps(program)}
            ).outputs
        return evaluated[fingerprint]

    baseline = evaluate(incumbent)
    output.mkdir(parents=True, exist_ok=True)
    (output / "protocol.json").write_text(
        json.dumps(
            {
                "seed": seed,
                "proposals": proposals,
                "tasks": tasks,
                "initial": initial,
                "engineSha256": adapter.config.engine_sha256,
                "simulations": adapter.config.simulations,
                "alphaPerProposal": 0.05 / proposals,
            },
            indent=2,
        )
        + "\n"
    )
    best_difference = 0.0
    for index in range(proposals):
        proposal = weight_neighbor(initial, random_source, 2 if index < proposals // 2 else 1.25)
        candidate_games = evaluate(proposal)
        # Proposals depend only on the frozen initial program and recorded RNG seed.
        evidence = paired_evidence(
            candidate_games, baseline, alpha=0.05 / proposals, method="wilson-wins"
        )
        if evidence["accepted"] and evidence["difference"] > best_difference:
            incumbent = proposal
            best_difference = evidence["difference"]
        (output / f"proposal-{index:04d}.json").write_text(
            json.dumps(
                {
                    "program": proposal,
                    "policySha256": policy_hash(proposal),
                    "pairedEvidence": evidence,
                },
                indent=2,
            )
            + "\n"
        )
    result = {
        "program": incumbent,
        "pairedEvidence": paired_evidence(
            evaluate(incumbent), baseline, alpha=0.05 / proposals, method="wilson-wins"
        ),
        "purpose": "numeric selection; final strength requires fresh held-out seed blocks",
        "retainedInitial": policy_hash(incumbent) == policy_hash(initial),
    }
    (output / "selected.json").write_text(json.dumps(result, indent=2) + "\n")
    return result


@click.command()
@click.option("--manifest", type=click.Path(exists=True, path_type=Path), required=True)
@click.option("--program", type=click.Path(exists=True, path_type=Path), required=True)
@click.option("--tasks", type=click.Path(exists=True, path_type=Path), required=True)
@click.option("--output", type=click.Path(path_type=Path), required=True)
@click.option("--proposals", default=24, type=click.IntRange(1, 1000))
@click.option("--seed", default=71, type=int)
def main(manifest: Path, program: Path, tasks: Path, output: Path, proposals: int, seed: int):
    run_manifest = json.loads(manifest.read_text())
    metadata = run_manifest["metadata"]
    adapter = HeuristicAdapter(
        EvaluationConfig(
            node=metadata.get("node", "node"),
            worker=Path(metadata["worker"]),
            run_dir=output / "games",
            engine_sha256=metadata["engineSha256"],
            simulations=run_manifest["config"]["simulations"],
            desktop_host=metadata.get("desktopHost"),
            timeout=metadata["evaluationTimeout"],
            workers=metadata["evaluationWorkers"],
            cache_dir=Path(metadata["evaluationCache"]),
        ),
        metadata,
    )
    click.echo(
        json.dumps(
            tune(
                adapter,
                json.loads(program.read_text()),
                json.loads(tasks.read_text()),
                seed=seed,
                proposals=proposals,
                output=output,
            )
        )
    )


if __name__ == "__main__":
    main()
