"""Evolve structural heuristic rules with GEPA over cheap panel games."""

import json
import time
from pathlib import Path
from typing import Any

import click
import gepa

from panel_adapter import PanelAdapter, PanelConfig
from panel_held_out import compare_programs
from panel_pool import PanelPool, runtime_fingerprint
from panel_program import assemble_program, program_settings, split_program
from panel_reflection_template import PANEL_REFLECTION_TEMPLATE
from panel_splits import alternating_blocks, matchup_blocks, panel_splits
from session_reflection import SessionReflection

REPOSITORY = Path(__file__).resolve().parents[2]
TRAIN_SEED = 5_000_000
VALIDATION_SEEDS = {"legacy": 6_000_000, "certified": 6_100_000}


def select_validation_blocks(
    validation: list[dict[str, Any]], opponents: tuple[str, ...], blocks: int
) -> list[dict[str, Any]]:
    if blocks * len(opponents) > len(validation):
        raise click.BadParameter("Too many validation blocks for the validation matchups")
    selected = []
    for position, opponent in enumerate(opponents):
        pairs = validation[position * blocks : (position + 1) * blocks]
        selected.extend(
            matchup_blocks(
                pairs, opponent, VALIDATION_SEEDS.get(opponent, 6_200_000 + position * 100_000)
            )
        )
    return selected


def lineage_summary(result: Any, reflections: Path) -> dict[str, Any]:
    merges = [
        index
        for index, parents in enumerate(result.parents)
        if len([p for p in parents if p is not None]) > 1
    ]
    return {
        "proposals": len(list(reflections.glob("*.prompt.json"))),
        "candidates": len(result.candidates),
        "acceptedReflections": len(result.candidates) - 1 - len(merges),
        "acceptedMerges": len(merges),
        "bestIndex": result.best_idx,
        "totalMetricCalls": result.total_metric_calls,
        "scores": [
            {
                "index": index,
                "parents": result.parents[index],
                "validation": result.val_aggregate_scores[index],
                "objectives": (result.val_aggregate_subscores or [{}] * len(result.candidates))[
                    index
                ],
            }
            for index in range(len(result.candidates))
        ],
    }


@click.command()
@click.option(
    "--start-program", type=click.Path(exists=True, dir_okay=False, path_type=Path), required=True
)
@click.option(
    "--pairs", type=click.Path(exists=True, dir_okay=False, path_type=Path), required=True
)
@click.option("--run-dir", type=click.Path(file_okay=False, path_type=Path), required=True)
@click.option("--node", default="node", show_default=True)
@click.option("--workers", default=8, type=click.IntRange(1, 8), show_default=True)
@click.option(
    "--opponent", "opponents", multiple=True, default=("legacy", "certified"), show_default=True
)
@click.option("--validation-blocks", default=24, type=click.IntRange(4, 75), show_default=True)
@click.option("--minibatch", default=6, type=click.IntRange(2, 32), show_default=True)
@click.option("--metric-calls", default=1500, type=click.IntRange(50, 100_000), show_default=True)
@click.option("--deadline-minutes", default=90, type=click.IntRange(1, 1440), show_default=True)
@click.option("--max-merges", default=5, type=click.IntRange(0, 50), show_default=True)
@click.option("--planner/--no-planner", default=False, show_default=True)
@click.option("--held-out-legacy", default=150, type=click.IntRange(1, 400), show_default=True)
@click.option("--held-out-certified", default=75, type=click.IntRange(1, 400), show_default=True)
@click.option(
    "--reflection-timeout", default=1800, type=click.IntRange(60, 86_400), show_default=True
)
def main(
    start_program: Path,
    pairs: Path,
    run_dir: Path,
    node: str,
    workers: int,
    opponents: tuple[str, ...],
    validation_blocks: int,
    minibatch: int,
    metric_calls: int,
    deadline_minutes: int,
    max_merges: int,
    planner: bool,
    held_out_legacy: int,
    held_out_certified: int,
    reflection_timeout: int,
) -> None:
    start = json.loads(start_program.read_text(encoding="utf-8"))
    seed_candidate = split_program(start)
    title = f"GEPA panel structure ({start['title']})"[:120]
    settings = program_settings(start)
    initial = assemble_program(seed_candidate, title, settings)
    if initial.error is not None or initial.program is None:
        raise click.ClickException(f"The start program does not split cleanly: {initial.error}")
    splits = panel_splits(json.loads(pairs.read_text(encoding="utf-8")))
    trainset = alternating_blocks(splits.fitness, list(opponents), TRAIN_SEED)
    valset = select_validation_blocks(splits.validation, opponents, validation_blocks)
    run_dir.mkdir(parents=True, exist_ok=True)
    fingerprint = runtime_fingerprint(REPOSITORY)
    (run_dir / "run.json").write_text(
        json.dumps(
            {
                "startProgram": str(start_program),
                "pairs": str(pairs),
                "opponents": list(opponents),
                "trainBlocks": len(trainset),
                "validationBlocks": len(valset),
                "minibatch": minibatch,
                "metricCalls": metric_calls,
                "planner": planner,
                "runtimeFingerprint": fingerprint,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    pool = PanelPool(node, workers)
    adapter = PanelAdapter(
        pool,
        PanelConfig(
            cache_dir=run_dir / "cache",
            runtime_fingerprint=fingerprint,
            title=title,
            settings=settings,
            planner=True if planner else None,
        ),
    )
    reflections = run_dir / "reflections"
    reflector = SessionReflection(reflections, timeout=reflection_timeout)
    deadline = time.time() + deadline_minutes * 60
    try:
        result = gepa.optimize(
            seed_candidate=seed_candidate,
            trainset=trainset,
            valset=valset,
            adapter=adapter,
            reflection_lm=reflector,
            reflection_prompt_template=PANEL_REFLECTION_TEMPLATE,
            frontier_type="objective",
            module_selector="round_robin",
            use_merge=max_merges > 0,
            max_merge_invocations=max_merges,
            reflection_minibatch_size=minibatch,
            skip_perfect_score=False,
            max_metric_calls=metric_calls,
            stop_callbacks=lambda _state: time.time() >= deadline,
            run_dir=str(run_dir / "gepa"),
            cache_evaluation=False,
            display_progress_bar=False,
            raise_on_exception=True,
            seed=71,
        )
        summary = lineage_summary(result, reflections)
        selected = assemble_program(result.best_candidate, title, settings)
        if selected.program is None:
            raise click.ClickException(f"The selected candidate is invalid: {selected.error}")
        (run_dir / "selected-program.json").write_text(
            json.dumps(selected.program, indent=1) + "\n", encoding="utf-8"
        )
        (run_dir / "summary.json").write_text(
            json.dumps(summary, indent=2) + "\n", encoding="utf-8"
        )
        click.echo("Running the paired held-out comparison", err=True)
        report = compare_programs(
            adapter,
            start,
            selected.program,
            splits.test,
            {"legacy": held_out_legacy, "certified": held_out_certified},
        )
    finally:
        pool.close()
    report["selectedIsStart"] = selected.program["rules"] == start["rules"]
    report["runtimeFingerprint"] = fingerprint
    report["runtimeChanged"] = runtime_fingerprint(REPOSITORY) != fingerprint
    (run_dir / "held-out.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    click.echo(json.dumps({"summary": summary, "heldOut": report}, indent=2))


if __name__ == "__main__":
    main()
