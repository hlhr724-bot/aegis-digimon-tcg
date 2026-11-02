import json
import math
from collections.abc import Sequence
from pathlib import Path
from typing import Literal, TypedDict

import click


class SprtResult(TypedDict):
    decision: Literal["accept", "reject", "continue"]
    llr: float
    lower: float
    upper: float
    blocks: int
    games: int
    mean: float | None
    counts: list[int]
    elo0: float
    elo1: float
    model: str


def _score_for_elo(elo: float) -> float:
    scaled = elo * math.log(10) / 400
    if scaled >= 0:
        return 1 / (1 + math.exp(-scaled))
    exp_scaled = math.exp(scaled)
    return exp_scaled / (1 + exp_scaled)


def _fit_mean(counts: Sequence[int], mean: float) -> float:
    total = sum(counts)
    observed = [(index / 8, count / total) for index, count in enumerate(counts) if count]
    lower = -1 / (1 - mean)
    upper = 1 / mean

    def get_constraint(multiplier: float) -> float:
        return sum(
            frequency * (score - mean) / max(1e-15, 1 + multiplier * (score - mean))
            for score, frequency in observed
        )

    if get_constraint(lower) <= 0:
        return lower
    if get_constraint(upper) >= 0:
        return upper
    for _ in range(100):
        middle = (lower + upper) / 2
        if get_constraint(middle) > 0:
            lower = middle
        else:
            upper = middle
    return (lower + upper) / 2


def pentanomial_sprt(
    blocks: Sequence[Sequence[float]],
    *,
    elo0: float,
    elo1: float,
    alpha: float = 0.05,
    beta: float = 0.05,
) -> SprtResult:
    if not all(math.isfinite(value) for value in (elo0, elo1, alpha, beta)):
        raise ValueError("SPRT parameters must be finite")
    if not -4000 <= elo0 < elo1 <= 4000 or not 0 < alpha < 1 or not 0 < beta < 1:
        raise ValueError("SPRT needs ordered Elo bounds and error probabilities in (0, 1)")
    if alpha + beta >= 1:
        raise ValueError("SPRT alpha + beta must be less than one")
    counts = [0] * 9
    for block in blocks:
        if len(block) != 4 or any(
            isinstance(score, bool) or not isinstance(score, (int, float)) or score not in (0, 0.5, 1)
            for score in block
        ):
            raise ValueError("SPRT requires complete valid four-game blocks scored 0, 0.5 or 1")
        counts[round(sum(block) * 2)] += 1
    lower = math.log(beta / (1 - alpha))
    upper = math.log((1 - beta) / alpha)
    llr = 0.0
    if blocks:
        mean0, mean1 = _score_for_elo(elo0), _score_for_elo(elo1)
        multiplier0 = _fit_mean(counts, mean0)
        multiplier1 = _fit_mean(counts, mean1)
        llr = sum(
            count * (
                math.log1p(multiplier0 * (index / 8 - mean0))
                - math.log1p(multiplier1 * (index / 8 - mean1))
            )
            for index, count in enumerate(counts)
            if count
        )
    decision: Literal["accept", "reject", "continue"] = "continue"
    if llr >= upper:
        decision = "accept"
    elif llr <= lower:
        decision = "reject"
    return {
        "decision": decision,
        "llr": llr,
        "lower": lower,
        "upper": upper,
        "blocks": len(blocks),
        "games": 4 * len(blocks),
        "mean": sum(index * count / 8 for index, count in enumerate(counts)) / len(blocks) if blocks else None,
        "counts": counts,
        "elo0": elo0,
        "elo1": elo1,
        "model": "four-game-block multinomial generalized SPRT; approximate Wald boundaries",
    }


@click.command()
@click.argument("results", type=click.Path(exists=True, dir_okay=False, path_type=Path))
@click.option("--elo0", type=float, required=True)
@click.option("--elo1", type=float, required=True)
@click.option("--alpha", type=float, default=0.05)
@click.option("--beta", type=float, default=0.05)
def _run_cli(results: Path, elo0: float, elo1: float, alpha: float, beta: float) -> None:
    try:
        blocks = json.loads(results.read_text(encoding="utf-8"))
        if not isinstance(blocks, list) or any(not isinstance(block, list) for block in blocks):
            raise ValueError("Input must be an array of four-game score arrays")
        click.echo(json.dumps(pentanomial_sprt(blocks, elo0=elo0, elo1=elo1, alpha=alpha, beta=beta), allow_nan=False))
    except (ValueError, OSError) as error:
        raise click.ClickException(str(error)) from error


if __name__ == "__main__":
    _run_cli()
