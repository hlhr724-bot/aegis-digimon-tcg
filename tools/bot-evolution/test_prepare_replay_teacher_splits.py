from prepare_replay_teacher_splits import prepare_replay_teacher_splits


def _pair(index):
    return {
        "matchId": str(index),
        "observedAt": f"{index:06}",
        "decks": [
            {"mainDeck": [f"card-{index}"], "eggDeck": ["egg"]},
            {"mainDeck": ["opponent"], "eggDeck": []},
        ],
    }


def test_requires_all_new_confirmation_compositions():
    result = prepare_replay_teacher_splits([_pair(index) for index in range(415)], [])
    assert result["ready"] is False
    assert result["eligible"] == 415


def test_preserves_temporal_reserve_and_disjoint_compositions():
    result = prepare_replay_teacher_splits([_pair(index) for index in range(420)], [])
    assert result["ready"] is True
    assert [len(result[key]) for key in ("fitness", "validation", "confirmation")] == [32, 64, 320]
    assert min(int(row["matchId"]) for row in result["confirmation"]) == 100
    compositions = [
        row["composition"]
        for key in ("fitness", "validation", "confirmation")
        for row in result[key]
    ]
    assert len(set(compositions)) == 416


def test_excludes_old_ids_and_swapped_deck_multisets():
    old = _pair(0)
    swapped = {**old, "matchId": "new", "decks": list(reversed(old["decks"]))}
    result = prepare_replay_teacher_splits(
        [old, swapped, *[_pair(index) for index in range(1, 418)]], [old]
    )
    assert result["excluded"]["historical"] == 2
    assert result["eligible"] == 417
