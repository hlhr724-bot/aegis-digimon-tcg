from types import SimpleNamespace

import pytest
from gepa.core.data_loader import ListDataLoader

from evolve import task_sets
from SeedBlockBatchSampler import SeedBlockBatchSampler


@pytest.mark.parametrize("pilot", [None, "a"])
def test_reflection_keeps_both_seats_and_every_frozen_opponent(pilot: str | None) -> None:
    tasks = task_sets(["a", "b"], pilot, {"a": {}, "b": {}}, 24, 0)["train"]
    loader = ListDataLoader(tasks)
    sampler = SeedBlockBatchSampler(4)
    seen = set()
    for iteration in range(6):
        ids = sampler.next_minibatch_ids(loader, SimpleNamespace(i=iteration))
        batch = loader.fetch(ids)
        seeds = {task["seed"] for task in batch}
        assert len(seeds) == 4
        assert not seen & seeds
        seen |= seeds
        assert batch == [
            task
            for seed in dict.fromkeys(t["seed"] for t in batch)
            for task in tasks
            if task["seed"] == seed
        ]
        assert len(batch) == (8 if pilot is None else 16)
        assert ids == SeedBlockBatchSampler(4).next_minibatch_ids(
            loader, SimpleNamespace(i=iteration)
        )
    assert seen == {task["seed"] for task in tasks}


def test_last_batch_never_duplicates_seed_blocks_to_pad_the_epoch() -> None:
    loader = ListDataLoader(task_sets(["a", "b"], None, {}, 5, 0)["train"])
    sampler = SeedBlockBatchSampler(4)
    first = sampler.next_minibatch_ids(loader, SimpleNamespace(i=0))
    last = sampler.next_minibatch_ids(loader, SimpleNamespace(i=1))
    assert len(first) == 8 and len(last) == 2
    assert set(first).isdisjoint(last)
    assert set(first + last) == set(loader.all_ids())
    next_first = sampler.next_minibatch_ids(loader, SimpleNamespace(i=2))
    next_last = SeedBlockBatchSampler(4).next_minibatch_ids(loader, SimpleNamespace(i=3))
    assert len(next_first) == 8 and len(next_last) == 2
    assert set(next_first).isdisjoint(next_last)
    assert set(next_first + next_last) == set(loader.all_ids())
    assert next_first == SeedBlockBatchSampler(4).next_minibatch_ids(
        loader, SimpleNamespace(i=2)
    )


@pytest.mark.parametrize(
    "tasks",
    [
        [],
        [{"seed": 1, "opponent": "mcts", "learnerSeat": 0}],
        [{"seed": 1, "opponent": "mcts", "learnerSeat": 0}] * 2,
    ],
)
def test_incomplete_or_duplicate_seats_are_rejected(tasks: list[dict]) -> None:
    with pytest.raises(ValueError, match="both seats"):
        SeedBlockBatchSampler(4).next_minibatch_ids(ListDataLoader(tasks), SimpleNamespace(i=0))
