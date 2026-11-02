import json
import random
from typing import Any

from gepa.core.data_loader import DataLoader
from gepa.core.state import GEPAState


class SeedBlockBatchSampler:
    def __init__(self, pairs: int, seed: int = 71) -> None:
        if pairs < 1:
            raise ValueError("Reflection requires at least one complete seed block")
        self.pairs = pairs
        self.seed = seed

    def next_minibatch_ids(
        self, loader: DataLoader[int, dict[str, Any]], state: GEPAState
    ) -> list[int]:
        ids = list(loader.all_ids())
        tasks = loader.fetch(ids)
        blocks: dict[int, list[int]] = {}
        seats: dict[tuple[int, str], list[int]] = {}
        for data_id, task in zip(ids, tasks, strict=True):
            seed = task["seed"]
            blocks.setdefault(seed, []).append(data_id)
            opponent = json.dumps(
                [task["opponent"], task.get("opponentProgram")], sort_keys=True
            )
            seats.setdefault((seed, opponent), []).append(task["learnerSeat"])
        if not blocks or any(sorted(values) != [0, 1] for values in seats.values()):
            raise ValueError("Reflection requires both seats exactly once per seed and opponent")
        seeds = sorted(blocks)
        size = min(self.pairs, len(seeds))
        batches = (len(seeds) + size - 1) // size
        epoch, batch = divmod(max(0, state.i), batches)
        random.Random(self.seed + epoch).shuffle(seeds)
        selected = seeds[batch * size : (batch + 1) * size]
        return [data_id for seed in selected for data_id in blocks[seed]]
