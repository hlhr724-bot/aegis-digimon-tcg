import json
from copy import deepcopy

import pytest
from gepa.core.adapter import EvaluationBatch

from evidence import policy_hash
from pilot_splits import pilot_splits
from reserve_pilot_family import reserve_pilot_family
from train_pilot import train_pilot


@pytest.mark.parametrize(
    "mode", ("gain", "combo-gain", "multi-gain", "unchanged", "held-out-loss", "timeout", "invalid")
)
def test_real_gepa_pilot_selection_requires_fresh_direct_generic_control_and_held_out_gate(
    tmp_path,
    monkeypatch,
    mode,
):
    run_root = tmp_path / "wave"
    tmp_path = run_root / "pilots" / "A"
    generic = {
        "schemaVersion": 1,
        "basePolicy": "projected-balanced",
        "title": "Generic",
        "rules": [{"feature": "sourceDp", "weight": 0.2, "advice": "Prefer DP."}],
    }
    pilot = deepcopy(generic)
    pilot["title"] = "A pilot"
    pilot["rules"].append(
        {
            "feature": "playTamer",
            "weight": 2,
            "advice": "Develop this Tamer early.",
            "when": {"kind": "main", "sourceCardIds": ["BT1-085"], "maximum": {"turn": 4}},
        }
    )
    proposals = [{"strategy": "early-tamer", "program": pilot}]
    if mode == "combo-gain":
        pilot["rules"][-1]["when"]["ownHand"] = {"cardIds": ["BT1-085"], "minimum": 1}
    if mode == "multi-gain":
        for weight in (3, 4, 5):
            alternative = deepcopy(pilot)
            alternative["rules"][-1]["weight"] = weight
            proposals.append({"strategy": f"early-tamer-{weight}", "program": alternative})
    calls = []

    class Adapter:
        propose_new_texts = None

        def __init__(self, config, metadata):
            self.config = config
            config.run_dir.mkdir(parents=True, exist_ok=True)
            self.calls = 0

        def evaluate(self, tasks, candidate, capture_traces=False):
            calls.append(tasks)
            assert all(task["opponentProgram"] == generic for task in tasks)
            if mode == "timeout" and tasks[0]["seed"] >= 700_000_000:
                raise TimeoutError("Desktop transport deadline")
            program = json.loads(candidate["heuristic"])
            changed = policy_hash(program) != policy_hash(generic)
            score = int(changed and mode != "unchanged")
            if mode == "held-out-loss" and tasks[0]["seed"] >= 1_000_000_000:
                score = int(not changed)
            outputs = [
                {
                    "task": task,
                    "score": score,
                    "valid": True,
                    "policySha256": policy_hash(program),
                    "engineSha256": "engine",
                    "status": "played",
                    "asynchronousRejections": [],
                    "result": {
                        "winnerSeat": task["learnerSeat"] if score else 1 - task["learnerSeat"],
                        "reason": "security",
                        "timedOut": False,
                        "errors": [],
                        "rejections": [],
                        "projectionChecks": 1,
                        "seats": [{"inferenceFallbacks": {"error": 0, "timeout": 0}}] * 2,
                    },
                }
                for task in tasks
            ]
            for game in outputs:
                if mode == "invalid" and tasks[0]["seed"] >= 700_000_000:
                    game.update(valid=False, status="invalid", score=None)
                self.calls += 1
                (self.config.run_dir / f"{self.calls:05d}.json").write_text(
                    json.dumps(game), encoding="utf-8"
                )
            if mode == "invalid" and tasks[0]["seed"] >= 700_000_000:
                raise RuntimeError(
                    "Incomplete evaluation batch; invalid games are not fitness losses"
                )
            return EvaluationBatch(
                outputs=outputs,
                scores=[score] * len(tasks),
                trajectories=outputs if capture_traces else None,
            )

        def make_reflective_dataset(self, candidate, evaluated, components):
            return {component: [] for component in components}

    monkeypatch.setattr("train_pilot.HeuristicAdapter", Adapter)
    values = {
        "directory": tmp_path,
        "deck": {"id": "A", "proposals": proposals},
        "metadata": {
            "generic": generic,
            "node": "node",
            "worker": "worker",
            "desktopHost": "desktop",
            "engineSha256": "engine",
            "evaluationWorkers": 4,
            "evaluationCache": str(tmp_path / "cache"),
            "proposalOrigin": "deterministic-bounded-combo"
            if mode == "combo-gain"
            else "deterministic-structural",
        },
        "splits": pilot_splits(
            deck="A",
            pool=list("ABCDEFGH"),
            generic=generic,
            ordinal=0,
            pairs=24,
            gate_pairs=24,
            held_out_pairs=96,
            held_out_seeds=list(range(1_500_000_000, 1_500_000_096)),
        ),
        "screen_alpha": 0.05,
        "held_out_alpha": 0.05,
    }
    pool = list("ABCDEFGH")
    plans = {
        deck: list(range(1_500_000_000 + index * 96, 1_500_000_000 + (index + 1) * 96))
        for index, deck in enumerate(pool)
    }
    family = reserve_pilot_family(
        registry=run_root.parent / "family.json",
        run_dir=run_root,
        attempt=1,
        engine="engine",
        generic=policy_hash(generic),
        decks=pool,
        proposals=len(proposals) * len(pool),
        seed_offset=0,
        held_out_seeds=plans,
    )
    values["screen_alpha"] = family["screenAlphaPerHypothesis"]
    values["held_out_alpha"] = family["heldOutAlphaPerDeck"]
    run_root.mkdir()
    manifest = {
        "metadata": values["metadata"],
        "decks": [{"id": deck, "proposals": proposals} for deck in pool],
        "family": family,
        "pairs": 24,
        "gatePairs": 24,
        "heldOutPairs": 96,
        "seedOffset": 0,
        "heldOutSeedPlans": plans,
        "screenAlphaPerHypothesis": values["screen_alpha"],
        "heldOutAlphaPerDeck": values["held_out_alpha"],
    }
    (run_root / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    if mode in ("timeout", "invalid"):
        with pytest.raises(RuntimeError, match="Pilot gate failed"):
            train_pilot(**values)
        assert not (tmp_path / "selected.json").exists()
        return
    selected = train_pilot(**values)
    assert selected["apiCalls"] == 0
    assert selected["activated"] == (mode in ("gain", "combo-gain", "multi-gain"))
    assert selected["origin"] == values["metadata"]["proposalOrigin"]
    assert selected["proposals"] == len(proposals)
    assert selected["distinct"] == (mode != "unchanged")
    assert selected["selectedIndex"] == (0 if mode == "unchanged" else 1)
    assert train_pilot(**values) == selected
    assert not (tmp_path / "reflections").exists()
    held_out_calls = [tasks for tasks in calls if tasks[0]["seed"] >= 1_000_000_000]
    assert len(held_out_calls) == (0 if mode == "unchanged" else 2)
    if mode == "gain":
        for artifact, field, value, message in (
            ("selected.json", "activated", False, "activation"),
            ("selected.json", "validationScore", 0.5, "selection"),
            ("gepa-result.json", "best_idx", 0, "selection"),
            ("held-out.json", "freshOpponentDecks", False, "Held-out"),
        ):
            path = tmp_path / artifact
            original = path.read_text(encoding="utf-8")
            corrupted = json.loads(original)
            corrupted[field] = value
            path.write_text(json.dumps(corrupted), encoding="utf-8")
            with pytest.raises(ValueError, match=message):
                train_pilot(**values)
            path.write_text(original, encoding="utf-8")
        gate_path = next((tmp_path / "proposal-gates").glob("proposal-*.json"))
        original = gate_path.read_text(encoding="utf-8")
        gate = json.loads(original)
        gate["pairedEvidence"]["accepted"] = False
        gate_path.write_text(json.dumps(gate), encoding="utf-8")
        with pytest.raises(ValueError, match="screen evidence"):
            train_pilot(**values)
        gate_path.write_text(original, encoding="utf-8")
        raw_path = next(
            path
            for path in (tmp_path / "games").glob("*.json")
            if json.loads(path.read_text(encoding="utf-8"))["task"]["seed"] == 400_000_000
        )
        original = raw_path.read_text(encoding="utf-8")
        raw = json.loads(original)
        raw["valid"] = False
        raw_path.write_text(json.dumps(raw), encoding="utf-8")
        with pytest.raises(ValueError, match="validity"):
            train_pilot(**values)
        raw_path.write_text(original, encoding="utf-8")
    values["held_out_alpha"] = 0.01
    with pytest.raises(ValueError, match="configuration|inputs changed"):
        train_pilot(**values)
