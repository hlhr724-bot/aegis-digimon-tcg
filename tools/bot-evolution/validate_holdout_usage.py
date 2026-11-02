import hashlib
import json
from pathlib import Path
from typing import Any, Literal


def validate_holdout_usage(
    jobs: list[dict[str, Any]], *, usage: Literal["training", "holdout-evaluation"] = "training"
) -> str:
    if usage not in ("training", "holdout-evaluation"):
        raise ValueError("Unknown holdout usage")
    raw = Path(__file__).with_name("holdout-pool.json").read_bytes()
    pool = json.loads(raw)
    if usage == "holdout-evaluation":
        return hashlib.sha256(raw).hexdigest()
    signatures = {deck["compositionSha256"] for deck in pool["decks"]}
    seed_end = pool["seedBase"] + pool["seedBlocks"] * pool["gamesPerBlock"]
    pending: list[Any] = list(jobs)
    while pending:
        value = pending.pop()
        if isinstance(value, dict):
            if isinstance(value.get("mainDeck"), list) and isinstance(value.get("eggDeck"), list):
                composition = json.dumps([sorted(value["mainDeck"]), sorted(value["eggDeck"])], separators=(",", ":"))
                if hashlib.sha256(composition.encode("utf-8")).hexdigest() in signatures:
                    raise ValueError("Reserved holdout deck cannot be used for training or tuning")
            for key in ("seed", "seedBase", "sampleSeed", "searchSeed"):
                seed = value.get(key)
                if isinstance(seed, int) and pool["seedBase"] <= seed < seed_end:
                    raise ValueError("Reserved holdout seed cannot be used for training or tuning")
            pending.extend(value.values())
        elif isinstance(value, list):
            pending.extend(value)
    return hashlib.sha256(raw).hexdigest()
