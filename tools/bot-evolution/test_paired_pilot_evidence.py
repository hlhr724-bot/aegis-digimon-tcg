import math

import pytest

from paired_pilot_evidence import paired_pilot_evidence


def test_pilot_activation_uses_paired_seed_blocks_and_the_unique_sampling_correction():
    selected = []
    control = []
    for seed in range(24):
        for seat in (0, 1):
            task = {
                "seed": seed,
                "decks": ["A", "B"] if seat == 0 else ["B", "A"],
                "learnerSeat": seat,
            }
            selected.append({"task": task, "valid": True, "score": 1})
            control.append({"task": task, "valid": True, "score": 0})
    evidence = paired_pilot_evidence(selected=selected, control=control, alpha=0.05)
    assert evidence["seedBlocks"] == 24 and evidence["played"] == 48
    assert evidence["sampleVariance"] == 0 and evidence["difference"] == 1
    assert evidence["conditioningProbability"] < 1
    assert evidence["effectiveDelta"] < 0.05
    expected = 1 - 14 * math.log(2 / evidence["effectiveDelta"]) / (3 * 23)
    assert evidence["lowerBound"] == pytest.approx(expected)
    assert evidence["accepted"]
    unchanged = paired_pilot_evidence(selected=selected, control=selected, alpha=0.05)
    assert not unchanged["accepted"] and unchanged["lowerBound"] < 0
    weaker = paired_pilot_evidence(selected=control, control=selected, alpha=0.05)
    assert not weaker["accepted"] and weaker["difference"] == -1
    with pytest.raises(ValueError, match="unrepeated"):
        paired_pilot_evidence(selected=selected * 2, control=control * 2, alpha=0.05)
    with pytest.raises(ValueError, match="valid"):
        paired_pilot_evidence(
            selected=[{**selected[0], "valid": False}, *selected[1:]], control=control, alpha=0.05
        )
