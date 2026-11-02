from copy import deepcopy


def pilot_splits(
    *,
    deck: str,
    pool: list[str],
    generic: dict,
    ordinal: int,
    pairs: int,
    gate_pairs: int,
    held_out_pairs: int,
    seed_offset: int = 0,
    held_out_seeds: list[int] | None = None,
) -> dict[str, list[dict]]:
    if (
        len(pool) < 7
        or len(set(pool)) != len(pool)
        or deck not in pool
        or not 0 <= ordinal < 1000
        or not 24 <= pairs < 100_000
        or not 24 <= gate_pairs < 100_000
        or not 24 <= held_out_pairs < 100_000
        or type(seed_offset) is not int
        or not 0 <= seed_offset <= 0xFFFFFFFF - 1_600_000_000
    ):
        raise ValueError("Pilot splits require seven distinct decks and at least 24 seed blocks")
    if held_out_seeds is not None and (
        len(held_out_seeds) != held_out_pairs
        or len(set(held_out_seeds)) != held_out_pairs
        or any(
            type(seed) is not int
            or not 1_500_000_000 + seed_offset <= seed < 1_600_000_000 + seed_offset
            for seed in held_out_seeds
        )
    ):
        raise ValueError(
            "Frozen held-out seeds must be unique and inside the reserved uniform domain"
        )
    others = [version for version in pool if version != deck]
    partitions = [others[index::3] for index in range(3)]
    result = {}
    for split, base, count, opponents in (
        ("train", 100_000_000, pairs, partitions[0]),
        ("validation", 400_000_000, pairs, partitions[1]),
        ("gate", 700_000_000, gate_pairs, partitions[1]),
        ("held-out", 1_500_000_000, held_out_pairs, partitions[2]),
    ):
        tasks = []
        for block in range(count):
            opponent = opponents[block % len(opponents)]
            seed = base + ordinal * 100_000 + block + seed_offset
            if split == "held-out" and held_out_seeds is not None:
                seed = held_out_seeds[block]
            for seat, order in ((0, [deck, opponent]), (1, [opponent, deck])):
                tasks.append(
                    {
                        "seed": seed,
                        "decks": order,
                        "learnerSeat": seat,
                        "opponent": "heuristic",
                        "opponentProgram": deepcopy(generic),
                    }
                )
        result[split] = tasks
    return result
