"""Unchanged candidates, repeated samples and infrastructure faults cannot manufacture gains."""

import json

import pytest

from evidence import paired_evidence, policy_hash, program_hash, verify_neutral_control


def test_neutral_control_audits_the_full_paired_validation_pool():
    outputs = [
        {
            "task": {"seed": seed, "decks": decks, "learnerSeat": seat},
            "valid": True,
            "score": int(seat == 1),
            "result": {"winnerSeat": 1, "turnCount": 11, "reason": "security"},
        }
        for seed in range(96)
        for decks in (["a", "b"], ["b", "a"])
        for seat in (0, 1)
    ]
    assert verify_neutral_control(outputs) == {
        "games": 384,
        "seedBlocks": 96,
        "score": 0.5,
        "verified": True,
    }
    outputs[0]["score"] = 1
    outputs[0]["result"]["winnerSeat"] = 0
    with pytest.raises(ValueError, match="changed outcomes"):
        verify_neutral_control(outputs)


def games(score, count=48):
    return [
        {"task": {"seed": index // 2, "learnerSeat": index % 2}, "valid": True, "score": score}
        for index in range(count)
    ]


def test_policy_identity_ignores_formatting_and_editorial_metadata():
    original = {
        "title": "Pilot",
        "schemaVersion": 1,
        "rules": [{"feature": "cost", "weight": -1, "advice": "Spend carefully."}],
    }
    reformatted = json.loads(json.dumps(original, indent=4, sort_keys=True))
    assert program_hash(original) == program_hash(reformatted)
    changed_text = {**original, "title": "Another title", "blockedIntents": ["Read turn"]}
    assert policy_hash(original) == policy_hash(changed_text)
    assert policy_hash(original) != policy_hash(
        {**original, "rules": [{**original["rules"][0], "weight": -2}]}
    )


def test_unchanged_control_is_never_accepted_and_rechecks_add_no_samples():
    selected, control = games(1), games(0)
    result = paired_evidence(selected, control)
    assert result["accepted"] and result["seedBlocks"] == 24
    assert paired_evidence(selected * 4, control * 4) == result
    assert not paired_evidence(selected, selected)["accepted"]
    assert not paired_evidence(games(1, 46), games(0, 46))["accepted"]


def test_invalid_pairs_are_unscored_and_cannot_certify():
    selected, control = games(1), games(0)
    selected[0].update(valid=False, score=None)
    result = paired_evidence(selected, control)
    assert result["played"] == 47 and result["configured"] == 48
    assert not result["accepted"]
    with pytest.raises(ValueError, match="conflicting"):
        paired_evidence(control + [{**control[0], "score": 1}], control)


def test_paired_wilson_selection_is_meaningful_and_does_not_pseudoreplicate():
    result = paired_evidence(games(1), games(0), alpha=0.05 / 24, method="wilson-wins")
    assert result["accepted"] and result["discordant"] == 24
    assert (
        paired_evidence(games(1) * 3, games(0) * 3, alpha=0.05 / 24, method="wilson-wins") == result
    )
    assert not paired_evidence(games(0), games(0), method="wilson-wins")["accepted"]


def test_policy_identity_includes_the_executable_base():
    program = {
        "schemaVersion": 1,
        "title": "Pilot",
        "rules": [{"feature": "bias", "weight": 0, "advice": "Balanced."}],
    }
    residual = {**program, "basePolicy": "projected-balanced"}
    assert policy_hash(program) != policy_hash(residual)
    assert program_hash(program) != program_hash(residual)
