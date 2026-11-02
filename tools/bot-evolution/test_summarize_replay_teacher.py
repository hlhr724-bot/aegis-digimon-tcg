import pytest

from summarize_replay_teacher import summarize_replay_teacher


def _rows():
    return [
        {"id": f"{index}|{arm}", "valid": True, "reward": float(arm == "alternative")}
        for index in range(32)
        for arm in ("baseline", "alternative")
    ]


def test_requires_gain_under_both_continuation_policies():
    rows = _rows()
    assert summarize_replay_teacher(rows)["preferred"] is True
    for row in rows:
        if int(row["id"].split("|")[0]) >= 16:
            row["reward"] = 0
    assert summarize_replay_teacher(rows)["preferred"] is False


def test_invalid_continuation_never_becomes_a_teacher_label():
    rows = _rows()
    rows[0] = {"id": rows[0]["id"], "valid": False}
    result = summarize_replay_teacher(rows)
    assert result["preferred"] is False
    assert result["difference"] is None
    assert result["approximate95"] is None


def test_partial_or_duplicate_comparisons_are_rejected():
    with pytest.raises(ValueError, match="complete paired"):
        summarize_replay_teacher(_rows()[:-1])
    with pytest.raises(ValueError, match="Duplicate"):
        summarize_replay_teacher([*_rows(), _rows()[0]])
