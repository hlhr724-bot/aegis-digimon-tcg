import pytest

from summarize_replay_replication import summarize_replay_replication

PAIRS = 40


def _rows(alternative_rewards: list[float]) -> list[dict[str, object]]:
    return [
        row
        for index, reward in enumerate(alternative_rewards)
        for row in (
            {"id": f"{index}|baseline", "valid": True, "reward": 0.0},
            {"id": f"{index}|alternative", "valid": True, "reward": reward},
        )
    ]


def test_replicates_when_the_lower_bound_is_above_zero():
    result = summarize_replay_replication(_rows([1.0, 0.0] * (PAIRS // 2)), PAIRS)
    assert result["replicated"] is True
    assert result["reason"] is None
    assert result["difference"] == 0.5
    assert result["approximate95"][0] > 0
    assert result["validPairs"] == PAIRS
    assert result["invalidPairs"] == 0


def test_rejects_an_interval_that_crosses_zero():
    result = summarize_replay_replication(_rows([1.0, -1.0] * (PAIRS // 2)), PAIRS)
    assert result["replicated"] is False
    assert result["approximate95"][0] < 0 < result["approximate95"][1]
    assert "Lower 95% bound" in result["reason"]


def test_excludes_invalid_pairs_and_rejects_too_many():
    rows = _rows([1.0] * PAIRS)
    rows[1] = {"id": "0|alternative", "valid": False}
    allowed = summarize_replay_replication(rows, PAIRS)
    assert allowed["replicated"] is True
    assert allowed["validPairs"] == PAIRS - 1
    assert allowed["invalidPairs"] == 1
    assert allowed["difference"] == 1.0
    for index in range(1, 3):
        rows[index * 2] = {"id": f"{index}|baseline", "valid": False}
    rejected = summarize_replay_replication(rows, PAIRS)
    assert rejected["invalidPairs"] == 3
    assert rejected["invalidFraction"] > 0.05
    assert rejected["replicated"] is False
    assert "invalid" in rejected["reason"]


def test_rejects_duplicate_or_missing_samples():
    rows = _rows([1.0] * PAIRS)
    with pytest.raises(ValueError, match="Duplicate"):
        summarize_replay_replication([*rows, rows[0]], PAIRS)
    with pytest.raises(ValueError, match="complete paired"):
        summarize_replay_replication(rows[:-1], PAIRS)
    with pytest.raises(ValueError, match="complete paired"):
        summarize_replay_replication(rows, PAIRS + 1)
