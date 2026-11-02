"""Panel adapter assembly, scoring, caching, and reflection records."""

import json
import re
from pathlib import Path
from typing import Any

from panel_adapter import PanelAdapter, PanelConfig, block_score, select_traces
from panel_held_out import held_out_games, paired_difference, rate_interval
from panel_program import FEATURES, assemble_program, split_program
from panel_reflection_template import PANEL_REFLECTION_TEMPLATE
from panel_splits import block_games, panel_splits

START = {
    "schemaVersion": 1,
    "title": "Start",
    "rules": [
        {"feature": "cost", "weight": -0.6, "advice": "Avoid cost.", "when": {"kind": "main"}},
        {"feature": "pass", "weight": -8, "advice": "Avoid passing.", "when": {"kind": "main"}},
        {"feature": "hatch", "weight": 10, "advice": "Hatch."},
    ],
}
DECK_A = {"mainDeck": ["BT1-001", "BT1-001", "BT1-002"], "eggDeck": []}
DECK_B = {"mainDeck": ["BT2-001"], "eggDeck": []}


def trace(kind: str, chosen: float, alternative: float, turn: int) -> dict[str, Any]:
    return {
        "turn": turn,
        "kind": kind,
        "memory": 2,
        "ownSecurity": 5,
        "opponentSecurity": 4,
        "hand": ["BT1-001"],
        "ownBoard": [{"card": "BT1-002", "name": "Two", "dp": 3000, "suspended": True}],
        "opponentBoard": [],
        "legalActions": 2,
        "chosen": {"label": "Play", "card": "BT1-001", "score": chosen, "features": {"cost": 3}},
        "alternatives": [{"label": "End", "score": alternative, "features": {"pass": 1}}],
    }


class FakePool:
    def __init__(self, error: str | None = None) -> None:
        self.error = error
        self.jobs: list[dict[str, Any]] = []
        self.validated: list[dict[str, Any]] = []

    def validate(self, program: dict[str, Any]) -> str | None:
        self.validated.append(program)
        return self.error

    def run(self, jobs: list[dict[str, Any]]) -> list[dict[str, Any]]:
        self.jobs.extend(jobs)
        return [
            {
                "id": job["id"],
                "valid": True,
                "win": job["seat"] == 0,
                "turn": 9,
                "reason": "security",
                **(
                    {
                        "traces": [trace("main", 1.0, 0.9, 3), trace("breeding", 2.0, 0.0, 4)],
                        "cards": {"BT1-001": {"name": "Card", "effect": "Printed text."}},
                    }
                    if job.get("trace")
                    else {}
                ),
            }
            for job in jobs
        ]


def block(opponent: str, seed_base: int = 100) -> dict[str, Any]:
    return {"matchId": "m", "opponent": opponent, "decks": [DECK_A, DECK_B], "seedBase": seed_base}


def adapter(tmp_path: Path, pool: FakePool) -> PanelAdapter:
    return PanelAdapter(
        pool,
        PanelConfig(
            cache_dir=tmp_path / "cache", runtime_fingerprint="engine", title="T", settings={}
        ),
    )


def test_split_and_assembly_round_trip_preserves_rules() -> None:
    candidate = split_program(START)
    assert json.loads(candidate["main_rules"])["rules"] == START["rules"][:2]
    assert json.loads(candidate["other_rules"])["rules"] == START["rules"][2:]
    assembly = assemble_program(candidate, "T", {})
    assert assembly.error is None
    assert assembly.program == {"schemaVersion": 1, "title": "T", "rules": START["rules"]}


def test_assembly_rejects_misplaced_or_unknown_rules() -> None:
    candidate = split_program(START)
    other = json.loads(candidate["other_rules"])
    other["rules"].append({"feature": "pass", "weight": 1, "advice": "x", "when": {"kind": "main"}})
    misplaced = {**candidate, "other_rules": json.dumps(other)}
    assert "move it to main_rules" in (assemble_program(misplaced, "T", {}).error or "")
    unknown = {
        **candidate,
        "main_rules": json.dumps(
            {
                "scope": "s",
                "rules": [
                    {"feature": "magic", "weight": 1, "advice": "x", "when": {"kind": "main"}}
                ],
            }
        ),
    }
    assert "unknown feature" in (assemble_program(unknown, "T", {}).error or "")
    assert "not valid JSON" in (
        assemble_program({**candidate, "main_rules": "{"}, "T", {}).error or ""
    )
    many = {"scope": "s", "rules": [START["rules"][0]] * 101}
    assert "1–100 rules" in (
        assemble_program({**candidate, "main_rules": json.dumps(many)}, "T", {}).error or ""
    )


def test_invalid_candidate_scores_zero_without_games(tmp_path: Path) -> None:
    pool = FakePool(error="Unknown card IDs: NOPE-1")
    result = adapter(tmp_path, pool).evaluate([block("legacy")], split_program(START), True)
    assert result.scores == [0.0]
    assert result.objective_scores == [{"opponent:legacy": 0.0}]
    assert pool.jobs == []
    records = adapter(tmp_path, pool).make_reflective_dataset(
        split_program(START), result, ["main_rules"]
    )
    assert "Unknown card IDs: NOPE-1" in records["main_rules"][0]["Feedback"]


def test_block_score_and_objectives_follow_opponent(tmp_path: Path) -> None:
    pool = FakePool()
    result = adapter(tmp_path, pool).evaluate(
        [block("legacy"), block("certified", 200)], split_program(START)
    )
    assert result.scores == [0.5, 0.5]
    assert result.objective_scores == [{"opponent:legacy": 0.5}, {"opponent:certified": 0.5}]
    assert sorted(job["seed"] for job in pool.jobs[:4]) == [100, 101, 102, 103]
    assert block_score([{"valid": True, "win": None}, {"valid": False, "win": None}]) == 0.25
    assert block_score([]) == 0.0


def test_cache_reuses_full_payload_and_upgrades_for_traces(tmp_path: Path) -> None:
    pool = FakePool()
    panel = adapter(tmp_path, pool)
    panel.evaluate([block("legacy")], split_program(START))
    panel.evaluate([block("legacy")], split_program(START))
    assert len(pool.jobs) == 4
    panel.evaluate([block("legacy", 104)], split_program(START))
    assert len(pool.jobs) == 8
    traced = panel.evaluate([block("legacy")], split_program(START), capture_traces=True)
    assert len(pool.jobs) == 12
    assert "traces" in traced.outputs[0]["games"][0]
    plain = panel.evaluate([block("legacy")], split_program(START))
    assert len(pool.jobs) == 12
    assert "traces" not in plain.outputs[0]["games"][0]


def test_reflective_dataset_shows_lost_games_by_component(tmp_path: Path) -> None:
    pool = FakePool()
    panel = adapter(tmp_path, pool)
    result = panel.evaluate([block("certified")], split_program(START), capture_traces=True)
    records = panel.make_reflective_dataset(
        split_program(START), result, ["main_rules", "other_rules"]
    )
    main = records["main_rules"][0]
    assert main["Inputs"]["opponent"] == "certified"
    assert main["Inputs"]["deckA"] == "2x BT1-001, 1x BT1-002"
    assert main["Generated Outputs"]["outcomes"].count("seat") == 4
    decisions = main["Generated Outputs"]["lostGameDecisions"]
    assert len(decisions) == 2
    assert all("main decision" in item and "CHOSE Play BT1-001" in item for item in decisions)
    assert main["Generated Outputs"]["printedCards"] == [
        "BT1-001 Card (level None, play cost None, None DP): Printed text."
    ]
    other = records["other_rules"][0]["Generated Outputs"]["lostGameDecisions"]
    assert all("breeding decision" in item for item in other)
    assert "won 2 of 4" in records["main_rules"][0]["Feedback"]


def test_trace_selection_keeps_closest_and_last_decisions() -> None:
    traces = [
        trace("main", 5, 0, 1),
        trace("main", 1, 0.9, 2),
        trace("main", 3, 2.5, 3),
        trace("main", 9, 0, 4),
    ]
    assert [item["turn"] for item in select_traces(traces, True)] == [2, 3, 4]
    assert select_traces(traces, False) == []


def test_blocks_cover_both_orientations_and_seats() -> None:
    games = block_games(block("legacy"))
    assert [(game["orientation"], game["seat"], game["seed"]) for game in games] == [
        (0, 0, 100),
        (0, 1, 101),
        (1, 0, 102),
        (1, 1, 103),
    ]
    assert games[2]["decks"] == [DECK_B, DECK_A]


def test_blocks_balance_who_moves_first_per_orientation() -> None:
    games = block_games(block("legacy"))
    candidate_first = {
        (game["orientation"], game["seat"]): game["firstSeat"] == game["seat"] for game in games
    }
    assert candidate_first == {(0, 0): True, (0, 1): False, (1, 0): False, (1, 1): True}
    assert all(
        game["firstSeat"] == game["seed"] % 2 for game in games if game["firstSeat"] == game["seat"]
    )


def test_splits_keep_test_matchups_out_of_tuning() -> None:
    pairs = [
        {"matchId": str(index), "split": "test" if index % 5 == 0 else "train", "decks": []}
        for index in range(400)
    ]
    splits = panel_splits(pairs)
    tuning = {pair["matchId"] for pair in splits.fitness + splits.validation}
    assert len(splits.validation) == 150
    assert not tuning & {pair["matchId"] for pair in splits.test}
    assert len(tuning) == 320


def test_held_out_uses_disjoint_test_slices_per_opponent() -> None:
    test = [{"matchId": str(index), "decks": [DECK_A, DECK_B]} for index in range(10)]
    games = held_out_games(test, {"legacy": 3, "certified": 2})
    assert len(games) == 20
    assert {game["matchId"] for game in games if game["opponent"] == "certified"} == {"3", "4"}


def test_intervals_and_paired_difference() -> None:
    assert rate_interval([1.0, 0.0])["rate"] == 0.5
    difference = paired_difference([1.0, 1.0, 0.0, 1.0], [0.0, 1.0, 0.0, 0.0])
    assert difference["difference"] == 0.5
    assert difference["pairs"] == 4
    assert difference["low"] < 0.5 < difference["high"]


def test_features_match_engine_source() -> None:
    source = (
        Path(__file__).resolve().parents[2] / "apps/api/src/bot/evolution/heuristic.ts"
    ).read_text(encoding="utf-8")
    listed = re.search(r"export const FEATURES = \[(.*?)\] as const", source, re.DOTALL)
    assert listed is not None
    assert tuple(re.findall(r'"(\w+)"', listed.group(1))) == FEATURES


def test_reflection_template_has_gepa_placeholders() -> None:
    assert "<curr_instructions>" in PANEL_REFLECTION_TEMPLATE
    assert "<inputs_outputs_feedback>" in PANEL_REFLECTION_TEMPLATE
    assert "baselineScore" in PANEL_REFLECTION_TEMPLATE


def test_reflective_dataset_limits_traced_blocks(tmp_path: Path) -> None:
    panel = adapter(tmp_path, FakePool())
    blocks = [block("legacy", 100 + index * 4) for index in range(8)]
    result = panel.evaluate(blocks, split_program(START), capture_traces=True)
    records = panel.make_reflective_dataset(split_program(START), result, ["main_rules"])
    traced = [
        record
        for record in records["main_rules"]
        if "lostGameDecisions" in record["Generated Outputs"]
    ]
    assert len(records["main_rules"]) == 8
    assert len(traced) == 6
