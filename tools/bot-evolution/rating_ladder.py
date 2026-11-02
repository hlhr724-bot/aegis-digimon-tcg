import json
import math
from collections.abc import Sequence
from pathlib import Path
from typing import TypedDict

import click


class RatingBlock(TypedDict):
    first: str
    second: str
    scores: list[float]


def _solve(matrix: list[list[float]], vector: list[float]) -> list[float]:
    rows = [row[:] + [value] for row, value in zip(matrix, vector, strict=True)]
    for column in range(len(rows)):
        pivot = max(range(column, len(rows)), key=lambda index: abs(rows[index][column]))
        rows[column], rows[pivot] = rows[pivot], rows[column]
        divisor = rows[column][column]
        if abs(divisor) < 1e-14:
            raise ValueError("Rating information matrix is singular")
        rows[column] = [value / divisor for value in rows[column]]
        for index in range(len(rows)):
            if index == column:
                continue
            factor = rows[index][column]
            rows[index] = [left - factor * right for left, right in zip(rows[index], rows[column], strict=True)]
    return [row[-1] for row in rows]


def _evaluate(
    ratings: list[float], games: list[tuple[int, int, float]], ridge: float
) -> tuple[float, list[float], list[list[float]]]:
    size = len(ratings)
    gradient = [-ridge * value for value in ratings]
    information = [[ridge if left == right else 0.0 for right in range(size)] for left in range(size)]
    objective = -ridge * sum(value * value for value in ratings) / 2
    for first, second, score in games:
        difference = (ratings[first] if first >= 0 else 0) - (ratings[second] if second >= 0 else 0)
        log_denominator = max(0, difference) + math.log1p(math.exp(-abs(difference)))
        objective += score * difference - log_denominator
        probability = math.exp(difference - log_denominator)
        variance = probability * (1 - probability)
        for index, sign in ((first, 1), (second, -1)):
            if index >= 0:
                gradient[index] += sign * (score - probability)
                information[index][index] += variance
        if first >= 0 and second >= 0:
            information[first][second] -= variance
            information[second][first] -= variance
    return objective, gradient, information


def rating_ladder(blocks: Sequence[RatingBlock], *, reference: str, ridge: float = 0.01) -> dict:
    if not blocks or not math.isfinite(ridge) or ridge <= 0:
        raise ValueError("Ratings need nonempty blocks and a finite positive regularization")
    adjacency: dict[str, set[str]] = {}
    for block in blocks:
        if not isinstance(block, dict) or not all(key in block for key in ("first", "second", "scores")):
            raise ValueError("Each rating block requires first, second and scores")
        first, second, scores = block["first"], block["second"], block["scores"]
        if not isinstance(first, str) or not isinstance(second, str) or not first or not second or first == second:
            raise ValueError("Rating blocks require two different nonempty bot names")
        if not isinstance(scores, list) or len(scores) != 4 or any(
            isinstance(value, bool) or not isinstance(value, (int, float)) or value not in (0, 0.5, 1)
            for value in scores
        ):
            raise ValueError("Rating blocks require four valid game scores")
        adjacency.setdefault(first, set()).add(second)
        adjacency.setdefault(second, set()).add(first)
    if reference not in adjacency:
        raise ValueError("The reference must appear in the results")
    reached = {reference}
    pending = [reference]
    while pending:
        for name in adjacency[pending.pop()] - reached:
            reached.add(name)
            pending.append(name)
    if reached != set(adjacency):
        raise ValueError("A disconnected comparison graph cannot produce one rating ladder")
    names = sorted(set(adjacency) - {reference})
    indexes = {name: index for index, name in enumerate(names)}
    games = [(indexes.get(block["first"], -1), indexes.get(block["second"], -1), sum(block["scores"]) / 4) for block in blocks]
    ratings = [0.0] * len(names)
    for _ in range(100):
        objective, gradient, information = _evaluate(ratings, games, ridge)
        if max(abs(value) for value in gradient) < 1e-9:
            break
        step = _solve(information, gradient)
        scale = 1.0
        while scale > 1e-10:
            candidate = [value + scale * delta for value, delta in zip(ratings, step, strict=True)]
            if _evaluate(candidate, games, ridge)[0] >= objective:
                ratings = candidate
                break
            scale /= 2
        else:
            raise ValueError("Bradley-Terry optimization did not converge")
    else:
        raise ValueError("Bradley-Terry iteration limit exceeded")
    _, _, information = _evaluate(ratings, games, ridge)
    elo_scale = 400 / math.log(10)
    output = [{"name": reference, "rating": 1500.0, "low": 1500.0, "high": 1500.0, "reference": True}]
    for index, name in enumerate(names):
        basis = [float(column == index) for column in range(len(names))]
        variance = _solve(information, basis)[index]
        rating = 1500 + ratings[index] * elo_scale
        half_width = 1.96 * math.sqrt(variance) * elo_scale
        output.append({"name": name, "rating": rating, "low": rating - half_width, "high": rating + half_width, "reference": False})
    return {
        "ratings": sorted(output, key=lambda entry: (-entry["rating"], entry["name"])),
        "reference": reference,
        "blocks": len(blocks),
        "games": 4 * len(blocks),
        "ridge": ridge,
        "method": "Regularized Bradley-Terry on independent four-game mean scores; 95% approximate curvature intervals, one effective observation per block; reference fixed at 1500",
    }


@click.command()
@click.argument("results", type=click.Path(exists=True, dir_okay=False, path_type=Path))
@click.option("--reference", default="legacy-balanced", show_default=True)
@click.option("--ridge", type=float, default=0.01, show_default=True)
def _run_cli(results: Path, reference: str, ridge: float) -> None:
    try:
        blocks = json.loads(results.read_text(encoding="utf-8"))
        if not isinstance(blocks, list):
            raise ValueError("Input must be an array of rating blocks")
        click.echo(json.dumps(rating_ladder(blocks, reference=reference, ridge=ridge), allow_nan=False))
    except (ValueError, OSError) as error:
        raise click.ClickException(str(error)) from error


if __name__ == "__main__":
    _run_cli()
