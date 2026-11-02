import math
import random
from typing import Any


class DiagonalCma:
    def __init__(
        self,
        mean: list[float],
        *,
        population: int = 8,
        sigma: float = 0.7,
        seed: int = 20261020,
        state: dict[str, Any] | None = None,
    ) -> None:
        if not mean or population < 4 or not math.isfinite(sigma) or sigma <= 0:
            raise ValueError("CMA needs a nonempty mean, at least four samples and positive sigma")
        if not all(math.isfinite(value) for value in mean):
            raise ValueError("CMA mean must contain finite values")
        self.mean = list(mean)
        self.population = population
        self.sigma = sigma
        self.dimension = len(mean)
        self.covariance = [1.0] * self.dimension
        self.ps = [0.0] * self.dimension
        self.pc = [0.0] * self.dimension
        self.generation = 0
        self.rng = random.Random(seed)
        self.pending: list[list[float]] | None = None
        if state is not None:
            if len(state["mean"]) != self.dimension or state["population"] != population:
                raise ValueError("CMA state does not match the search dimensions")
            self.mean = list(state["mean"])
            self.sigma = state["sigma"]
            self.covariance = list(state["covariance"])
            self.ps = list(state["ps"])
            self.pc = list(state["pc"])
            self.generation = state["generation"]
            saved = state["rngState"]
            self.rng.setstate((saved[0], tuple(saved[1]), saved[2]))

    def ask(self) -> list[list[float]]:
        if self.pending is None:
            self.pending = [
                [
                    mean + self.sigma * math.sqrt(variance) * self.rng.gauss(0, 1)
                    for mean, variance in zip(self.mean, self.covariance, strict=True)
                ]
                for _ in range(self.population)
            ]
        return [list(vector) for vector in self.pending]

    def tell(self, scores: list[float]) -> None:
        if self.pending is None or len(scores) != self.population:
            raise ValueError("Evaluate every proposed vector before updating CMA")
        if not all(math.isfinite(score) for score in scores):
            raise ValueError("CMA scores must be finite")
        size = self.dimension
        selected = self.population // 2
        weights = [math.log(selected + 0.5) - math.log(index + 1) for index in range(selected)]
        total = sum(weights)
        weights = [weight / total for weight in weights]
        effective = 1 / sum(weight * weight for weight in weights)
        cs = (effective + 2) / (size + effective + 5)
        ds = 1 + 2 * max(0, math.sqrt((effective - 1) / (size + 1)) - 1) + cs
        cc = (4 + effective / size) / (size + 4 + 2 * effective / size)
        c1 = 2 / ((size + 1.3) ** 2 + effective) * (size + 2) / 3
        cmu = min(
            1 - c1,
            2 * (effective - 2 + 1 / effective) / ((size + 2) ** 2 + effective) * (size + 2) / 3,
        )
        expected_norm = math.sqrt(size) * (1 - 1 / (4 * size) + 1 / (21 * size * size))
        order = sorted(range(self.population), key=lambda index: (-scores[index], index))
        steps = [
            [(value - mean) / self.sigma for value, mean in zip(vector, self.mean, strict=True)]
            for vector in self.pending
        ]
        weighted = [
            sum(
                weight * steps[index][axis]
                for weight, index in zip(weights, order[:selected], strict=True)
            )
            for axis in range(size)
        ]
        self.generation += 1
        self.ps = [
            (1 - cs) * path + math.sqrt(cs * (2 - cs) * effective) * step / math.sqrt(variance)
            for path, step, variance in zip(self.ps, weighted, self.covariance, strict=True)
        ]
        norm = math.sqrt(sum(value * value for value in self.ps))
        hsig = (
            norm / math.sqrt(1 - (1 - cs) ** (2 * self.generation))
            < (1.4 + 2 / (size + 1)) * expected_norm
        )
        self.pc = [
            (1 - cc) * path + hsig * math.sqrt(cc * (2 - cc) * effective) * step
            for path, step in zip(self.pc, weighted, strict=True)
        ]
        self.covariance = [
            max(
                1e-12,
                (1 - c1 - cmu) * self.covariance[axis]
                + c1 * (self.pc[axis] ** 2 + (1 - hsig) * cc * (2 - cc) * self.covariance[axis])
                + cmu
                * sum(
                    weight * steps[index][axis] ** 2
                    for weight, index in zip(weights, order[:selected], strict=True)
                ),
            )
            for axis in range(size)
        ]
        self.mean = [
            mean + self.sigma * step for mean, step in zip(self.mean, weighted, strict=True)
        ]
        self.sigma *= math.exp((cs / ds) * (norm / expected_norm - 1))
        self.pending = None

    def state(self) -> dict[str, Any]:
        if self.pending is not None:
            raise ValueError("Finish the pending generation before saving CMA state")
        return {
            "mean": list(self.mean),
            "population": self.population,
            "sigma": self.sigma,
            "covariance": list(self.covariance),
            "ps": list(self.ps),
            "pc": list(self.pc),
            "generation": self.generation,
            "rngState": self.rng.getstate(),
        }
