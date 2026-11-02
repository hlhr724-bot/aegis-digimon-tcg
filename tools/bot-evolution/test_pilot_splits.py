import pytest

from pilot_splits import pilot_splits


def test_pilots_always_control_their_own_deck_and_rotate_opponents_out_of_held_out():
    generic = {"basePolicy": "projected-balanced", "rules": []}
    splits = pilot_splits(
        deck="A",
        pool=list("ABCDEFGH"),
        generic=generic,
        ordinal=2,
        pairs=24,
        gate_pairs=24,
        held_out_pairs=48,
    )
    seed_sets = [{task["seed"] for task in tasks} for tasks in splits.values()]
    for index, seeds in enumerate(seed_sets):
        assert all(not seeds & other for other in seed_sets[:index])
    opponents = {}
    for split, tasks in splits.items():
        opponents[split] = set()
        for task in tasks:
            assert task["decks"][task["learnerSeat"]] == "A"
            opponent = task["decks"][1 - task["learnerSeat"]]
            assert opponent != "A"
            opponents[split].add(opponent)
            assert task["opponentProgram"] == generic
        for seed in {task["seed"] for task in tasks}:
            games = [task for task in tasks if task["seed"] == seed]
            assert len(games) == 2
            assert {task["learnerSeat"] for task in games} == {0, 1}
    assert not opponents["train"] & opponents["validation"]
    assert not opponents["held-out"] & (opponents["train"] | opponents["validation"])
    assert len(splits["held-out"]) == 96


@pytest.mark.parametrize("change", ({"pairs": 23}, {"ordinal": 1000}, {"pool": list("ABCDEF")}))
def test_pilot_split_refuses_small_or_overlapping_seed_domains(change):
    values = {
        "deck": "A",
        "pool": list("ABCDEFGH"),
        "generic": {},
        "ordinal": 0,
        "pairs": 24,
        "gate_pairs": 24,
        "held_out_pairs": 24,
    }
    with pytest.raises(ValueError):
        pilot_splits(**(values | change))
