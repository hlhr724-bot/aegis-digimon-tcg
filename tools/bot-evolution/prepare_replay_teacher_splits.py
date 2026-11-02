import hashlib
import json
from typing import Any


def _composition(pair: dict[str, Any]) -> str:
    decks = [
        json.dumps({zone: sorted(deck[zone]) for zone in ("mainDeck", "eggDeck")}, sort_keys=True)
        for deck in pair["decks"]
    ]
    return hashlib.sha256(json.dumps(sorted(decks)).encode()).hexdigest()


def prepare_replay_teacher_splits(
    rows: list[dict[str, Any]], excluded: list[dict[str, Any]]
) -> dict[str, Any]:
    excluded_ids = {row["matchId"] for row in excluded}
    excluded_compositions = {_composition(row) for row in excluded}
    candidates = []
    seen_ids: set[str] = set()
    seen_compositions: set[str] = set()
    counts = {"historical": 0, "duplicate": 0}
    for row in sorted(rows, key=lambda row: (row["observedAt"], row["matchId"]), reverse=True):
        composition = _composition(row)
        if row["matchId"] in excluded_ids or composition in excluded_compositions:
            counts["historical"] += 1
            continue
        if row["matchId"] in seen_ids or composition in seen_compositions:
            counts["duplicate"] += 1
            continue
        seen_ids.add(row["matchId"])
        seen_compositions.add(composition)
        candidates.append({**row, "composition": composition})
    if len(candidates) < 416:
        return {"ready": False, "eligible": len(candidates), "required": 416, "excluded": counts}
    confirmation = candidates[:320]
    development = sorted(
        candidates[320:], key=lambda row: hashlib.sha256(row["matchId"].encode()).hexdigest()
    )
    return {
        "ready": True,
        "eligible": len(candidates),
        "excluded": counts,
        "fitness": development[:32],
        "validation": development[32:96],
        "confirmation": confirmation,
    }
