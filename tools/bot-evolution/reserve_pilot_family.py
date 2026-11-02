import fcntl
import hashlib
import json
from pathlib import Path

from audit_pilot_family import audit_pilot_family


def reserve_pilot_family(
    *,
    registry: Path,
    run_dir: Path,
    attempt: int,
    engine: str,
    generic: str,
    decks: list[str],
    proposals: int,
    seed_offset: int,
    held_out_seeds: dict[str, list[int]],
) -> dict:
    audit_pilot_family(registry=registry, attempt=attempt)
    if (
        not 1 <= attempt <= 3
        or not decks
        or len(set(decks)) != len(decks)
        or proposals < len(decks)
        or type(seed_offset) is not int
        or not 0 <= seed_offset <= 0xFFFFFFFF - 1_600_000_000
    ):
        raise ValueError(
            "Pilot family requires one of three fixed waves and a distinct frozen deck pool"
        )
    seeds = [seed for values in held_out_seeds.values() for seed in values]
    if (
        set(held_out_seeds) != set(decks)
        or len(set(seeds)) != len(seeds)
        or len({len(values) for values in held_out_seeds.values()}) != 1
        or any(len(values) < 24 for values in held_out_seeds.values())
        or any(
            type(seed) is not int
            or not 1_500_000_000 + seed_offset <= seed < 1_600_000_000 + seed_offset
            for seed in seeds
        )
    ):
        raise ValueError("Pilot family held-out seeds cannot repeat across any deck")
    family = {
        "schemaVersion": 1,
        "maximumWaves": 3,
        "engineSha256": engine,
        "genericPolicySha256": generic,
        "decks": decks,
        "screenAlphaPerHypothesis": 0.05 / (3 * proposals),
        "heldOutAlphaPerDeck": 0.05 / (3 * len(decks)),
        "hypothesesPerWave": proposals,
    }
    reservation = {
        "runDirectory": str(run_dir.resolve()),
        "attempt": attempt,
        "seedDomain": [1_500_000_000 + seed_offset, 1_600_000_000 + seed_offset],
        "heldOutSeeds": held_out_seeds,
        "heldOutSeedsSha256": hashlib.sha256(
            json.dumps(held_out_seeds, sort_keys=True).encode()
        ).hexdigest(),
    }
    registry.parent.mkdir(parents=True, exist_ok=True)
    with registry.with_suffix(registry.suffix + ".lock").open("a", encoding="utf-8") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if attempt in (2, 3) and registry.with_suffix(registry.suffix + ".closure.json").is_file():
            raise ValueError("This initial-family wave was irrevocably retired by its amendment")
        previous = json.loads(registry.read_text(encoding="utf-8")) if registry.is_file() else None
        if previous is None:
            previous = {"family": family, "reservations": []}
        if previous.get("family") != family:
            raise ValueError(
                "Pilot family changed its frozen engine, generic, deck pool or alpha budget"
            )
        for record in previous["reservations"]:
            if record["attempt"] == attempt:
                if record != reservation:
                    raise ValueError(
                        "Pilot wave reservation cannot change or be reused by another run"
                    )
                return {**family, "registry": str(registry.resolve()), "attempt": attempt}
            if record["runDirectory"] == reservation["runDirectory"]:
                raise ValueError("A pilot run cannot consume two wave reservations")
            start, end = record["seedDomain"]
            if max(start, reservation["seedDomain"][0]) < min(end, reservation["seedDomain"][1]):
                raise ValueError("Pilot waves require disjoint held-out seed domains")
        if len(previous["reservations"]) >= 3:
            raise ValueError("The three-wave pilot family budget is exhausted")
        previous["reservations"].append(reservation)
        temporary = registry.with_suffix(registry.suffix + ".tmp")
        temporary.write_text(json.dumps(previous, indent=2) + "\n", encoding="utf-8")
        temporary.replace(registry)
    return {**family, "registry": str(registry.resolve()), "attempt": attempt}
