import json
import math
from collections import defaultdict
from pathlib import Path
from typing import Any, Literal

import click

from PanelBatch import PanelBatch
from rating_ladder import rating_ladder


def _build_jobs(
    pool: dict[str, Any],
    blocks: int,
    seed_block_offset: int = 0,
    adjacent_only: bool = False,
    transition: str | None = None,
    reference_filter: str | None = None,
) -> list[dict[str, Any]]:
    levels = ["beginner", "casual", "standard", "expert", "master"]
    styles = ["balanced", "aggressive", "defensive"]
    references = [
        "random-legal",
        "legacy-balanced",
        "certified-residual",
        "human-panel-v2",
        "turn-planner",
    ]
    comparisons = [
        (level, style, reference, None)
        for level in levels
        for style in styles
        for reference in references
    ] + [
        (levels[index], style, "selected-level", levels[index - 1])
        for index in range(1, len(levels))
        for style in styles
    ]
    if (
        blocks < 1
        or seed_block_offset < 0
        or seed_block_offset + blocks * len(comparisons) > pool["seedBlocks"]
    ):
        raise ValueError("The requested panel exceeds the reserved independent seed blocks")
    if transition is not None and transition not in levels[1:]:
        raise ValueError("Transition must name a non-Beginner difficulty")
    if sum([adjacent_only, transition is not None, reference_filter is not None]) > 1:
        raise ValueError("Choose adjacent-only, one transition, or one reference")
    if reference_filter is not None and reference_filter not in references:
        raise ValueError("Reference must name a fixed reference policy")
    jobs = []
    for comparison, (level, style, reference, previous) in enumerate(comparisons):
        if adjacent_only and reference != "selected-level":
            continue
        if transition is not None and (reference != "selected-level" or level != transition):
            continue
        if reference_filter is not None and reference != reference_filter:
            continue
        first = f"{level}:{style}"
        second = f"{previous}:{style}" if previous else reference
        for block in range(blocks):
            deck_index = block * 2 % len(pool["decks"])
            pair = [pool["decks"][deck_index], pool["decks"][(deck_index + 1) % len(pool["decks"])]]
            block_id = f"{first}/{second}/{block}"
            for orientation in (0, 1):
                for seat in (0, 1):
                    jobs.append(
                        {
                            "id": f"{block_id}/{orientation}/{seat}",
                            "levelPanel": {
                                "difficulty": level,
                                "style": style,
                                "reference": reference,
                                **(
                                    {"referenceDifficulty": previous, "referenceStyle": style}
                                    if previous
                                    else {}
                                ),
                                "seed": pool["seedBase"]
                                + 4 * (seed_block_offset + comparison * blocks + block)
                                + orientation * 2
                                + seat,
                                "firstSeat": seat if orientation == seat else 1 - seat,
                                "seat": seat,
                                "decks": [pair[orientation], pair[1 - orientation]],
                            },
                            "metadata": {
                                "block": block_id,
                                "first": first,
                                "second": second,
                                "seat": seat,
                                "orientation": orientation,
                            },
                        }
                    )
    return jobs


def _block_interval(means: list[float]) -> list[float] | None:
    if len(means) < 2:
        return None
    center = sum(means) / len(means)
    variance = sum((value - center) ** 2 for value in means) / (len(means) - 1)
    margin = 1.96 * math.sqrt(variance / len(means))
    return [max(0.0, center - margin), min(1.0, center + margin)]


def _summarize(results: list[dict[str, Any]]) -> dict[str, Any]:
    grouped = defaultdict(list)
    for result in results:
        grouped[result["metadata"]["block"]].append(result)
    blocks = []
    invalid = []
    for identifier, rows in grouped.items():
        keys = {(row["metadata"]["orientation"], row["metadata"]["seat"]) for row in rows}
        if len(rows) != 4 or keys != {(0, 0), (0, 1), (1, 0), (1, 1)}:
            raise ValueError("Panel results contain an incomplete or duplicate four-game block")
        if any(row.get("valid") is not True for row in rows):
            invalid.append(identifier)
            continue
        blocks.append(
            {
                "first": rows[0]["metadata"]["first"],
                "second": rows[0]["metadata"]["second"],
                "scores": [0.5 if row["win"] is None else float(row["win"]) for row in rows],
            }
        )
    comparisons = defaultdict(list)
    block_means = defaultdict(list)
    styles = defaultdict(list)
    for block in blocks:
        comparisons[f"{block['first']}/{block['second']}"].extend(block["scores"])
        block_means[f"{block['first']}/{block['second']}"].append(sum(block["scores"]) / 4)
    for row in results:
        if row.get("valid") is True and "style" in row:
            styles[row["metadata"]["first"]].append(row)
    style_summary = {}
    for name, rows in styles.items():
        seats = [row["style"]["seats"][row["metadata"]["seat"]] for row in rows]
        turns = sum(seat["turns"] for seat in seats)
        latencies = sorted(
            value
            for row in rows
            for value in row.get("latencies", [[], []])[row["metadata"]["seat"]]
        )
        style_summary[name] = {
            "games": len(rows),
            "turns": turns,
            "securityAttacksPerTurn": sum(seat["securityAttacks"] for seat in seats) / turns
            if turns
            else 0,
            "memoryPassedPerTurn": sum(seat["memoryPassed"] for seat in seats) / turns
            if turns
            else 0,
            "blocksDeclared": sum(seat["blocksDeclared"] for seat in seats),
            "meanGameLengthTurns": sum(row["style"]["gameLengthTurns"] for row in rows) / len(rows),
            "localMainPolicyP95Ms": latencies[math.ceil(0.95 * len(latencies)) - 1]
            if latencies
            else None,
        }
    ladder = None
    if blocks:
        try:
            ladder = rating_ladder(blocks, reference="legacy-balanced")
        except ValueError as error:
            ladder = {"unavailable": str(error)}
    return {
        "games": len(results),
        "validGames": sum(row.get("valid") is True for row in results),
        "completeValidBlocks": len(blocks),
        "invalidBlocks": invalid,
        "comparisons": {
            name: {
                "games": len(scores),
                "blocks": len(block_means[name]),
                "pointsRate": sum(scores) / len(scores),
                "pointsRateInterval95": _block_interval(block_means[name]),
            }
            for name, scores in comparisons.items()
        },
        "styles": style_summary,
        "ladder": ladder,
        "ratingBlocks": blocks,
        "certified": False,
        "latencyScope": "Local main-phase policy calls only; not production latency evidence",
    }


@click.command()
@click.option("--run-dir", type=click.Path(path_type=Path), required=True)
@click.option("--node", type=click.Path(exists=True, dir_okay=False), required=True)
@click.option("--blocks", type=click.IntRange(1, 32), default=4, show_default=True)
@click.option("--workers", type=click.IntRange(1, 4), default=2, show_default=True)
@click.option("--timeout-seconds", type=click.IntRange(60, 600), default=120, show_default=True)
@click.option("--seed-block-offset", type=click.IntRange(0), default=0, show_default=True)
@click.option(
    "--pool-file",
    type=click.Path(path_type=Path, exists=True, dir_okay=False),
    default=Path(__file__).with_name("holdout-pool.json"),
    show_default=True,
)
@click.option(
    "--usage",
    type=click.Choice(["training", "holdout-evaluation"]),
    default="holdout-evaluation",
    show_default=True,
)
@click.option("--adjacent-only", is_flag=True)
@click.option("--transition", type=click.Choice(["casual", "standard", "expert", "master"]))
@click.option(
    "--reference",
    type=click.Choice(
        ["random-legal", "legacy-balanced", "certified-residual", "human-panel-v2", "turn-planner"]
    ),
)
def _run_cli(
    run_dir: Path,
    node: str,
    blocks: int,
    workers: int,
    timeout_seconds: int,
    seed_block_offset: int,
    pool_file: Path,
    usage: Literal["training", "holdout-evaluation"],
    adjacent_only: bool,
    transition: str | None,
    reference: str | None,
) -> None:
    pool = json.loads(pool_file.read_text(encoding="utf-8"))
    repository = Path(__file__).parents[2]
    jobs = _build_jobs(pool, blocks, seed_block_offset, adjacent_only, transition, reference)
    batch = PanelBatch(repository, node, workers=workers, timeout_seconds=timeout_seconds)
    batch.handle_signals()
    try:
        results = batch.run(jobs, run_dir, usage=usage)
    finally:
        batch.close()
    summary = _summarize(results)
    (run_dir / "summary.json").write_text(
        json.dumps(summary, indent=2, allow_nan=False) + "\n", encoding="utf-8"
    )
    click.echo(
        json.dumps(
            {
                "games": summary["games"],
                "validGames": summary["validGames"],
                "invalidBlocks": len(summary["invalidBlocks"]),
                "summary": str(run_dir / "summary.json"),
            }
        )
    )


if __name__ == "__main__":
    _run_cli()
