"""Real balanced-control selection tasks preserve seats, deck swaps and split isolation."""

from learn_balanced import balanced_splits


def test_balanced_splits_hold_out_opponent_pairings_and_swap_each_assignment():
    splits = balanced_splits([str(n) for n in range(24)], 24)
    assert all(len(tasks) == 96 for tasks in splits.values())
    assert not {t["seed"] for t in splits["train"]} & {t["seed"] for t in splits["validation"]}
    pairings = [{tuple(sorted(task["decks"])) for task in tasks} for tasks in splits.values()]
    assert not pairings[0] & pairings[1]
    for tasks in splits.values():
        for seed in {t["seed"] for t in tasks}:
            block = [t for t in tasks if t["seed"] == seed]
            assert len(block) == 4
            assert {t["learnerSeat"] for t in block} == {0, 1}
            assert len({tuple(t["decks"]) for t in block}) == 2
