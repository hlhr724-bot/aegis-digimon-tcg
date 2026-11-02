import json

import pytest

from reserve_pilot_family import reserve_pilot_family


def test_pilot_family_retains_consumed_waves_and_refuses_changed_inputs_or_reused_seeds(tmp_path):
    values = {
        "registry": tmp_path / "family.json",
        "run_dir": tmp_path / "wave-1",
        "attempt": 1,
        "engine": "engine",
        "generic": "generic",
        "decks": ["A", "B"],
        "proposals": 8,
        "seed_offset": 0,
        "held_out_seeds": {
            "A": list(range(1_500_000_000, 1_500_000_024)),
            "B": list(range(1_500_000_024, 1_500_000_048)),
        },
    }
    family = reserve_pilot_family(**values)
    assert family["screenAlphaPerHypothesis"] == 0.05 / 24
    assert family["heldOutAlphaPerDeck"] == 0.05 / 6
    assert reserve_pilot_family(**values) == family
    for change in (
        {"engine": "changed"},
        {"generic": "changed"},
        {"decks": ["B", "A"]},
        {"proposals": 9},
        {"run_dir": tmp_path / "different"},
    ):
        with pytest.raises(ValueError):
            reserve_pilot_family(**(values | change))
    with pytest.raises(ValueError, match="disjoint"):
        reserve_pilot_family(**(values | {"attempt": 2, "run_dir": tmp_path / "wave-2"}))
    for attempt in (2, 3):
        offset = (attempt - 1) * 100_000_000
        reserve_pilot_family(
            **(
                values
                | {
                    "attempt": attempt,
                    "run_dir": tmp_path / f"wave-{attempt}",
                    "seed_offset": offset,
                    "held_out_seeds": {
                        deck: [seed + offset for seed in seeds]
                        for deck, seeds in values["held_out_seeds"].items()
                    },
                }
            )
        )
    records = json.loads(values["registry"].read_text(encoding="utf-8"))["reservations"]
    assert len(records) == 3
    assert records[0]["heldOutSeeds"] == values["held_out_seeds"]
    with pytest.raises(ValueError, match="three fixed waves"):
        reserve_pilot_family(**(values | {"attempt": 4}))


def test_pilot_family_refuses_duplicate_seeds_between_decks_before_reservation(tmp_path):
    with pytest.raises(ValueError, match="repeat"):
        reserve_pilot_family(
            registry=tmp_path / "family.json",
            run_dir=tmp_path / "wave-1",
            attempt=1,
            engine="engine",
            generic="generic",
            decks=["A", "B"],
            proposals=4,
            seed_offset=0,
            held_out_seeds={"A": list(range(24)), "B": list(range(24))},
        )
    assert not (tmp_path / "family.json").exists()
