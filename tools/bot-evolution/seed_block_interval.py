import math


def seed_block_interval(scores: list[float], alpha: float) -> dict:
    if not 0 < alpha < 1 or any(not 0 <= score <= 1 for score in scores):
        raise ValueError("Expected bounded block scores and a positive error budget")
    count = len(scores)
    if count == 0:
        return {"mean": None, "lower": None, "upper": None, "sampleVariance": None}
    mean = sum(scores) / count
    if count == 1:
        return {"mean": mean, "lower": 0.0, "upper": 1.0, "sampleVariance": None}
    variance = sum((score - mean) ** 2 for score in scores) / (count - 1)
    radius = math.sqrt(2 * variance * math.log(2 / alpha) / count) + (
        7 * math.log(2 / alpha) / (3 * (count - 1))
    )
    return {
        "mean": mean,
        "lower": max(0.0, mean - radius),
        "upper": min(1.0, mean + radius),
        "sampleVariance": variance,
    }
