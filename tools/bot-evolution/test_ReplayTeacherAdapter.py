import json

import pytest

from local_screen_protocol import (
    LOCAL_SCREEN_EXTRA_REPETITIONS,
    LOCAL_SCREEN_HARVEST_SEED_OFFSET,
    LOCAL_SCREEN_MAX_POSITIONS,
    LOCAL_SCREEN_PAIRS,
    LOCAL_SCREEN_SEED_OFFSET,
)
from panel_adapter import PanelConfig, block_score
from ReplayTeacherAdapter import ReplayTeacherAdapter
from ReplayTeacherCampaign import (
    REPLICATION_PAIRS,
    REPLICATION_SEED_OFFSET,
    TEACHER_SEED_BASE,
    TEACHER_SEED_STRIDE,
)
from test_panel_adapter import START, FakePool, block

RULE = {"feature": "pass", "weight": -1, "advice": "Develop.", "when": {"kind": "main"}}
CANDIDATE = {"main_rules": json.dumps({"rules": [RULE]})}


def _reward(value, seed):
    return value(seed) if callable(value) else value


class ScreenPool(FakePool):
    def __init__(
        self,
        *,
        positions=1,
        candidate_reward=0.5,
        baseline_reward=0.5,
        refuse=lambda _index: False,
        candidate_valid=True,
        harvest_only=False,
    ):
        super().__init__()
        self.positions = positions
        self.candidate_reward = candidate_reward
        self.baseline_reward = baseline_reward
        self.refuse = refuse
        self.candidate_valid = candidate_valid
        self.harvest_only = harvest_only

    def run(self, jobs):
        self.jobs.extend(jobs)
        return [self._answer(job) for job in jobs]

    def _answer(self, job):
        if "teacherAlignment" in job:
            return {"id": job["id"], "eligible": True, "supported": 1, "positions": []}
        continuation = job.get("replayContinuation")
        if continuation is not None:
            if self.refuse(continuation["inputIndex"]):
                return {
                    "id": job["id"],
                    "valid": False,
                    "win": None,
                    "error": "Error: Replay prefix has unsupported revealed or ordered hidden knowledge: []",
                    "ms": 0,
                }
            seed = continuation["sampleSeed"]
            candidate = continuation["action"] == 1
            return {
                "id": job["id"],
                "valid": self.candidate_valid or not candidate,
                "reward": _reward(
                    self.candidate_reward if candidate else self.baseline_reward, seed
                ),
                "reason": "security",
            }
        harvested = job["seed"] >= LOCAL_SCREEN_HARVEST_SEED_OFFSET
        positions = self.positions if harvested or not self.harvest_only else 0
        row = {
            **super().run([job])[0],
            "exposure": {"decisions": 4, "main": 2, "triggered": 1, "changed": positions},
        }
        self.jobs.pop()
        if job.get("recordReplay"):
            row["replay"] = {"seed": job["seed"]}
            row["changedPositions"] = [
                {
                    "inputIndex": index,
                    "seat": job["seat"],
                    "information": f"{job['seed']}|{index}",
                    "turn": 3,
                    "candidateAction": 1,
                    "baselineAction": 0,
                }
                for index in range(positions)
            ]
            row["changedPositionSkips"] = {"unmapped": 1, "unrecorded": 0}
        return row


def _adapter(tmp_path, pool=None):
    return ReplayTeacherAdapter(
        pool or FakePool(),
        PanelConfig(
            cache_dir=tmp_path, runtime_fingerprint="frozen", title=START["title"], settings={}
        ),
        START,
        [],
    )


def test_preserves_baseline_order_and_non_main_decisions(tmp_path):
    adapter = _adapter(tmp_path)
    rule = {"feature": "pass", "weight": -1, "advice": "Keep developing.", "when": {"kind": "main"}}
    program = adapter.assemble({"main_rules": json.dumps({"rules": [rule]})})
    assert program["rules"] == [*START["rules"], rule]
    assert adapter.assemble({"main_rules": '{"rules": []}'}) == START


@pytest.mark.parametrize(
    "candidate",
    [
        {"main_rules": '{"rules": [{"feature": "hatch", "weight": 1, "advice": "Hatch."}]}'},
        {"main_rules": '{"rules": []}', "other_rules": "{}"},
        {
            "main_rules": json.dumps(
                {
                    "rules": [
                        {
                            "feature": "pass",
                            "weight": 1,
                            "advice": "Pass.",
                            "when": {"kind": "main"},
                        }
                    ]
                    * 9
                }
            )
        },
    ],
)
def test_rejects_rules_outside_the_frozen_hypothesis_family(tmp_path, candidate):
    adapter = _adapter(tmp_path)
    assert adapter.evaluate([block("legacy")], candidate).scores == [0.0]
    assert adapter.pool.jobs == []


def test_invalid_games_cannot_improve_a_block_score():
    assert block_score([{"valid": True, "win": True}, {"valid": False, "win": None}]) == 0.5
    assert block_score([{"valid": False, "win": None}] * 4) == 0.0


def test_frozen_v3_opponent_and_current_metadata_are_shared(tmp_path):
    adapter = _adapter(tmp_path)
    adapter.evaluate([block("v3")], {"main_rules": '{"rules": []}'})
    assert all(job["opponentProgram"] == START for job in adapter.pool.jobs)
    assert all(job["activationMemoryCosts"] and job["decisionContext"] for job in adapter.pool.jobs)


def test_rejects_unaligned_candidates_before_any_game(tmp_path):
    adapter = _adapter(tmp_path)
    requests = []

    def run(jobs):
        requests.extend(jobs)
        return [{"id": "alignment", "eligible": False, "supported": 0, "positions": []}]

    adapter.pool.run = run
    rule = {"feature": "pass", "weight": -1, "advice": "Develop.", "when": {"kind": "main"}}
    evaluated = adapter.evaluate([block("legacy")], {"main_rules": json.dumps({"rules": [rule]})})
    assert evaluated.scores == [0.0]
    assert len(requests) == 1 and "teacherAlignment" in requests[0]
    evidence = list((tmp_path.parent / "candidate-diagnostics").glob("*.json"))
    assert any(json.loads(path.read_text())["status"] == "rejected-alignment" for path in evidence)


def test_reports_exposure_for_a_supported_candidate(tmp_path):
    adapter = _adapter(tmp_path)
    original = adapter.pool.run

    def run(jobs):
        if "teacherAlignment" in jobs[0]:
            return [{"id": "alignment", "eligible": True, "supported": 1, "positions": []}]
        return [
            {**row, "exposure": {"decisions": 4, "main": 2, "triggered": 1, "changed": 1}}
            for row in original(jobs)
        ]

    adapter.pool.run = run
    rule = {"feature": "pass", "weight": -1, "advice": "Develop.", "when": {"kind": "main"}}
    adapter.evaluate([block("legacy")], {"main_rules": json.dumps({"rules": [rule]})})
    evidence = [
        json.loads(path.read_text())
        for path in (tmp_path.parent / "candidate-diagnostics").glob("*.json")
    ]
    assert any(row["exposure"]["changed"] == 4 and row["status"] == "exercised" for row in evidence)


def test_reflection_contains_all_teacher_cases_and_competing_actions_once(tmp_path):
    adapter = _adapter(tmp_path)
    adapter.cases = [
        {
            "position": {"hash": str(index)},
            "result": {
                "valid": index != 12,
                "preferred": index < 11,
                "difference": -0.2 if index == 11 else 0.2,
                "baseline": 0,
                "alternative": 1,
                "context": {
                    "observation": {},
                    "actions": [
                        {"index": action, "label": str(action), "features": {"bias": 1, "pass": 0}}
                        for action in range(3)
                    ],
                },
            },
        }
        for index in range(14)
    ]
    evaluated = adapter.evaluate(
        [block("legacy"), block("certified")], {"main_rules": '{"rules": []}'}
    )
    records = adapter.make_reflective_dataset({}, evaluated, ["main_rules"])["main_rules"]
    cases = records[0]["Inputs"]["replayTeacherCases"]
    assert len(cases) == 14
    assert len(cases[0]["context"]["actions"]) == 3
    assert cases[11]["difference"] < 0
    assert cases[12]["valid"] is False
    assert "replayTeacherCases" not in records[1]["Inputs"]


def test_alignment_counts_only_replicated_preferences(tmp_path):
    adapter = _adapter(tmp_path)
    adapter.cases = [
        {"position": {"hash": "screen"}, "result": {"preferred": True, "preference": 1}},
        {
            "position": {"hash": "replicated"},
            "result": {"preferred": True, "replicated": True, "preference": 1},
        },
        {
            "position": {"hash": "failed"},
            "result": {"preferred": True, "replicated": False, "preference": None},
        },
    ]
    requests = []

    def run(jobs):
        requests.extend(jobs)
        return [{"id": "alignment", "eligible": False, "supported": 0, "positions": []}]

    adapter.pool.run = run
    rule = {"feature": "pass", "weight": -1, "advice": "Develop.", "when": {"kind": "main"}}
    adapter.evaluate([block("legacy")], {"main_rules": json.dumps({"rules": [rule]})})
    sent = requests[0]["teacherAlignment"]["cases"]
    assert [case["result"]["preferred"] for case in sent] == [False, True, False]
    assert adapter.cases[0]["result"]["preferred"] is True


def _continuations(pool):
    return [job for job in pool.jobs if "replayContinuation" in job]


def _evidence(cache):
    return [
        json.loads(path.read_text())
        for path in sorted((cache.parent / "candidate-diagnostics").glob("*.json"))
    ]


BLOCKS = [block("legacy", 100), block("certified", 200)]


def test_unchanged_baseline_scores_exactly_one_half_without_continuations(tmp_path):
    pool = ScreenPool()
    adapter = _adapter(tmp_path / "cache", pool)
    evaluated = adapter.evaluate(BLOCKS, {"main_rules": '{"rules": []}'})
    assert evaluated.scores == [0.5, 0.5]
    assert evaluated.objective_scores == [{"opponent:legacy": 0.5}, {"opponent:certified": 0.5}]
    assert _continuations(pool) == []
    assert not any(job.get("recordReplay") for job in pool.jobs)
    assert _evidence(tmp_path / "cache")[0]["fullGameScores"] == [0.5, 0.5]


@pytest.mark.parametrize(
    ("candidate_reward", "baseline_reward", "expected"),
    [(0.55, 0.5, 0.55), (0.45, 0.5, 0.45), (1.0, 0.0, 1.0), (0.0, 1.0, 0.0)],
)
def test_block_score_adds_the_scaled_local_gain_and_clips(
    tmp_path, candidate_reward, baseline_reward, expected
):
    pool = ScreenPool(candidate_reward=candidate_reward, baseline_reward=baseline_reward)
    adapter = _adapter(tmp_path / "cache", pool)
    evaluated = adapter.evaluate(BLOCKS, CANDIDATE, capture_traces=True)
    assert evaluated.scores == pytest.approx([expected, expected])
    assert [output["fullGameScore"] for output in evaluated.outputs] == [0.5, 0.5]
    assert all("replay" not in game for output in evaluated.outputs for game in output["games"])
    screen = adapter.get_screen(adapter.assemble(CANDIDATE), BLOCKS)
    assert screen["pairs"] == LOCAL_SCREEN_PAIRS
    assert screen["blockChanged"] == [4, 4]
    assert screen["changedPositionSkips"] == {"unmapped": 8, "unrecorded": 0}
    assert screen["difference"] == pytest.approx(candidate_reward - baseline_reward)
    evidence = _evidence(tmp_path / "cache")[0]
    assert evidence["scores"] == pytest.approx([expected, expected])
    assert evidence["fullGameScores"] == [0.5, 0.5]
    assert evidence["localScreen"]["usablePositions"] == 8


def test_pairs_share_seeds_disjoint_from_games_and_teachers(tmp_path):
    pool = ScreenPool(candidate_reward=0.55)
    adapter = _adapter(tmp_path / "cache", pool)
    adapter.evaluate(BLOCKS, CANDIDATE)
    arms = {}
    for job in _continuations(pool):
        rank, pair, arm = job["id"].split("|")
        arms.setdefault((rank, pair), {})[arm] = job["replayContinuation"]["sampleSeed"]
    assert all(set(seeds) == {"candidate", "baseline"} for seeds in arms.values())
    assert all(seeds["candidate"] == seeds["baseline"] for seeds in arms.values())
    seeds = {seeds["candidate"] for seeds in arms.values()}
    assert len(seeds) == len(arms)
    teacher_ceiling = (
        TEACHER_SEED_BASE + 100 * TEACHER_SEED_STRIDE + REPLICATION_SEED_OFFSET + REPLICATION_PAIRS
    )
    assert min(seeds) >= LOCAL_SCREEN_SEED_OFFSET > teacher_ceiling
    games = [job["seed"] for job in pool.jobs if "seed" in job]
    assert max(games) < min(seeds)


def test_invalid_pairs_count_as_a_loss_of_one(tmp_path):
    pool = ScreenPool(candidate_reward=1.0, baseline_reward=0.0, candidate_valid=False)
    adapter = _adapter(tmp_path / "cache", pool)
    evaluated = adapter.evaluate(BLOCKS, CANDIDATE)
    screen = adapter.get_screen(adapter.assemble(CANDIDATE), BLOCKS)
    assert screen["invalidPairs"] == LOCAL_SCREEN_PAIRS
    assert screen["difference"] == -1.0
    assert evaluated.scores == [0.0, 0.0]


def test_refused_positions_free_their_budget_for_usable_positions(tmp_path):
    pool = ScreenPool(positions=2, candidate_reward=0.55, refuse=lambda index: index == 0)
    adapter = _adapter(tmp_path / "cache", pool)
    adapter.evaluate(BLOCKS, CANDIDATE)
    screen = adapter.get_screen(adapter.assemble(CANDIDATE), BLOCKS)
    assert screen["changedPositions"] == 16
    assert screen["refusedPositions"] == 8
    assert screen["refusedPairs"] == 8
    assert screen["usablePositions"] == 8
    assert screen["pairs"] == LOCAL_SCREEN_PAIRS
    assert screen["blockScores"] == pytest.approx([0.5 + 8 * 0.05 / 4] * 2)
    refused = [position for position in screen["positions"] if position["inputIndex"] == 0]
    assert all(position["allocatedPairs"] == 1 for position in refused)


def test_sampling_caps_positions_deterministically_and_caches_continuations(tmp_path):
    screens = []
    for name in ("first", "second"):
        pool = ScreenPool(positions=20, candidate_reward=0.55)
        adapter = _adapter(tmp_path / name / "cache", pool)
        adapter.evaluate(BLOCKS, CANDIDATE)
        screen = adapter.get_screen(adapter.assemble(CANDIDATE), BLOCKS)
        screens.append(screen)
        assert screen["changedPositions"] == 160
        assert screen["probedPositions"] == LOCAL_SCREEN_MAX_POSITIONS
        assert screen["unprobedPositions"] == 160 - LOCAL_SCREEN_MAX_POSITIONS
        assert sorted({position["allocatedPairs"] for position in screen["positions"]}) == [12, 13]
        assert screen["blockScores"] == [1.0, 1.0]
    assert screens[0]["positions"] == screens[1]["positions"]
    adapter.screens.clear()
    before = len(_continuations(pool))
    adapter.evaluate(list(reversed(BLOCKS)), CANDIDATE)
    assert len(_continuations(pool)) == before


def test_continuations_replay_the_baseline_against_the_block_opponent(tmp_path):
    pool = ScreenPool(candidate_reward=0.55)
    adapter = _adapter(tmp_path / "cache", pool)
    adapter.evaluate([block("v3", 100), block("certified", 200)], CANDIDATE)
    jobs = _continuations(pool)
    assert all(job["program"] == START for job in jobs)
    games = {
        job["replayContinuation"]["panelGame"]["opponent"]: job["replayContinuation"]["panelGame"]
        for job in jobs
    }
    assert games["v3"]["opponentProgram"] == START
    assert "opponentProgram" not in games["certified"]
    assert all(
        game["activationMemoryCosts"]
        and game["decisionContext"]
        and game["opponentDecisionContext"]
        for game in games.values()
    )
    for job in jobs:
        continuation = job["replayContinuation"]
        decks = block("legacy")["decks"]
        orientation = 0 if continuation["record"]["seed"] % 4 < 2 else 1
        assert continuation["panelGame"]["deck"] == decks[1 - orientation]


def test_harvests_positions_only_when_scored_games_are_too_few(tmp_path):
    pool = ScreenPool(candidate_reward=0.55, harvest_only=True)
    adapter = _adapter(tmp_path / "cache", pool)
    evaluated = adapter.evaluate(BLOCKS, CANDIDATE)
    screen = adapter.get_screen(adapter.assemble(CANDIDATE), BLOCKS)
    assert screen["changedPositions"] == 0
    assert screen["harvest"] == [
        {"repetition": 1, "games": 8, "positions": 8, "probed": 8, "usable": 8}
    ]
    assert screen["usablePositions"] == 8
    assert screen["difference"] == pytest.approx(0.05)
    assert evaluated.scores == [0.5, 0.5]
    assert [output["fullGameScore"] for output in evaluated.outputs] == [0.5, 0.5]
    harvested = [
        job
        for job in pool.jobs
        if "seed" in job and job["seed"] >= LOCAL_SCREEN_HARVEST_SEED_OFFSET
    ]
    assert len(harvested) == 8
    assert all(job["recordReplay"] for job in harvested)
    assert sorted(job["firstSeat"] for job in harvested) == [0, 0, 0, 0, 1, 1, 1, 1]
    scored = {job["seed"] for job in pool.jobs if "seed" in job} - {
        job["seed"] for job in harvested
    }
    assert not scored & {job["seed"] for job in harvested}


def test_harvest_stops_after_the_repetition_cap(tmp_path):
    pool = ScreenPool(refuse=lambda index: index == 0)
    adapter = _adapter(tmp_path / "cache", pool)
    adapter.evaluate(BLOCKS, CANDIDATE)
    screen = adapter.get_screen(adapter.assemble(CANDIDATE), BLOCKS)
    assert [row["repetition"] for row in screen["harvest"]] == list(
        range(1, LOCAL_SCREEN_EXTRA_REPETITIONS + 1)
    )
    assert screen["usablePositions"] == 0
    assert screen["refusedPositions"] == 8 * (LOCAL_SCREEN_EXTRA_REPETITIONS + 1)
    assert len({job["seed"] for job in pool.jobs if "seed" in job}) == 8 * (
        LOCAL_SCREEN_EXTRA_REPETITIONS + 1
    )
