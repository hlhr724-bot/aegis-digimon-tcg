import pytest

from panel_archetypes import _summarize


def _inputs():
    pairs = {
        f"match-{index}": {
            "decks": [{"mainDeck": ["a"], "eggDeck": []}, {"mainDeck": ["b"], "eggDeck": []}]
        }
        for index in range(10)
    }
    classifications = {
        match_id: {"decks": [{"archetype": "A"}, {"archetype": "B"}]} for match_id in pairs
    }
    rows = []
    for index, match_id in enumerate(pairs):
        for orientation in (0, 1):
            for seat in (0, 1):
                for arm in ("baseline", "candidate"):
                    rows.append(
                        {
                            "valid": True,
                            "win": arm == "candidate" and orientation == 0,
                            "metadata": {
                                "matchId": match_id,
                                "opponent": "certified",
                                "orientation": orientation,
                                "seat": seat,
                                "arm": arm,
                                "seed": index * 4 + orientation * 2 + seat,
                            },
                        }
                    )
    return rows, pairs, classifications


def test_archetypes_follow_learner_deck_orientation_in_both_player_seats() -> None:
    rows, pairs, classifications = _inputs()
    report = _summarize(rows=rows, pairs=pairs, classifications=classifications)
    learners = {group["archetype"]: group for group in report["groups"]["learner"]}
    opponents = {group["archetype"]: group for group in report["groups"]["opponent"]}
    assert report["pairedGames"] == 40
    assert learners["A"]["arms"]["candidate"]["wins"] == 20
    assert learners["B"]["arms"]["candidate"]["wins"] == 0
    assert opponents["A"]["arms"]["candidate"]["wins"] == 0
    assert opponents["B"]["arms"]["candidate"]["wins"] == 20
    assert len(report["candidateLosses"]) == 20
    assert report["priorities"]["learner"] == []


@pytest.mark.parametrize("fault", ["missing", "duplicate", "seed"])
def test_archetype_report_refuses_unpaired_or_incompatible_controls(fault: str) -> None:
    rows, pairs, classifications = _inputs()
    if fault == "missing":
        rows.pop()
    elif fault == "duplicate":
        rows.append(rows[0])
    else:
        rows[0]["metadata"]["seed"] += 1
    with pytest.raises(ValueError):
        _summarize(rows=rows, pairs=pairs, classifications=classifications)
