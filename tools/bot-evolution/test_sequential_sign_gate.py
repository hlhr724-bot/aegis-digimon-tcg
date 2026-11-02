"""Sequential paired gates stop early without counting seats as extra samples."""

import pytest

from sequential_sign_gate import sequential_sign_gate


def tasks(blocks):
    return [{"seed": seed, "learnerSeat": seat} for seed in range(blocks) for seat in (0, 1)]


def arms(selected_wins, control_wins, calls):
    def evaluate(look):
        calls.append(len(look))
        return (
            [{"valid": True, "score": int(selected_wins(task))} for task in look],
            [{"valid": True, "score": int(control_wins(task))} for task in look],
        )

    return evaluate


def test_clear_improvement_stops_at_the_first_decisive_look():
    calls = []
    gate = sequential_sign_gate(
        arms(lambda task: True, lambda task: False, calls), tasks(24), [12, 24], 0.05
    )
    assert gate["accepted"] and gate["stopReason"] == "efficacy"
    assert calls == [24]
    assert gate["looks"][0]["selectedOnlyWins"] == 12
    assert gate["played"] == 24


def test_losing_candidate_stops_for_futility_before_the_full_budget():
    calls = []
    gate = sequential_sign_gate(
        arms(lambda task: False, lambda task: task["seed"] % 2 == 0, calls),
        tasks(24),
        [8, 16, 24],
        0.05,
    )
    assert not gate["accepted"] and gate["stopReason"] == "futility"
    assert calls == [16]


def test_inconclusive_candidate_spends_every_planned_block():
    calls = []
    gate = sequential_sign_gate(
        arms(lambda task: task["seed"] % 3 != 0, lambda task: task["seed"] % 3 == 0, calls),
        tasks(24),
        [8, 16, 24],
        0.05,
    )
    assert gate["stopReason"] == "exhausted" and not gate["accepted"]
    assert gate["looks"][-1]["selectedOnlyWins"] == 16
    assert sum(calls) == 48


def test_invalid_games_and_partial_plans_cannot_decide_a_gate():
    with pytest.raises(ValueError, match="end at every seed block"):
        sequential_sign_gate(arms(bool, bool, []), tasks(4), [2], 0.05)

    def invalid(look):
        return [{"valid": False, "score": None} for _ in look], [
            {"valid": True, "score": 0} for _ in look
        ]

    with pytest.raises(ValueError, match="Invalid games"):
        sequential_sign_gate(invalid, tasks(4), [4], 0.05)
