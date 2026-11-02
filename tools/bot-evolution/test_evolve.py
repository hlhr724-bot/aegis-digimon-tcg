"""Verify real GEPA integration, split isolation, and frozen archive semantics."""

import json
from contextlib import nullcontext
from pathlib import Path
from types import SimpleNamespace

from click.testing import CliRunner

import gepa
import pytest
from gepa.core.adapter import EvaluationBatch

from adapter import REFLECTION_TEMPLATE
from evidence import policy_hash
from evolve import EvolutionAudit, final_evaluation, main, optimize_stage, task_sets


def test_training_selection_and_test_are_separate_across_generations() -> None:
    seen = set()
    for generation in (0, 1, 2, 10, 100):
        splits = task_sets(["a", "b"], None, {}, 2, generation)
        for split in splits.values():
            seeds = {task["seed"] for task in split}
            assert not seen & seeds
            seen |= seeds
            assert {task["learnerSeat"] for task in split} == {0, 1}
        training = {deck for task in splits["train"] for deck in task["decks"]}
        testing = {deck for task in splits["test"] for deck in task["decks"]}
        assert not training & testing


def test_pilot_faces_search_and_frozen_other_pilot_in_both_seats() -> None:
    archive = {"a": {"title": "a"}, "b": {"title": "b"}}
    splits = task_sets(["a", "b"], "a", archive, 1, 1)
    for task in splits["train"]:
        assert task["decks"][task["learnerSeat"]] == "a"
        assert task["decks"][1 - task["learnerSeat"]] == "b"
        if task["opponent"] == "heuristic":
            assert task["opponentProgram"] == archive["b"]
    assert len(splits["train"]) == 4
    archive["b"]["title"] = "changed after generation start"
    assert (
        next(task for task in splits["train"] if task["opponent"] == "heuristic")[
            "opponentProgram"
        ]["title"]
        == "b"
    )


def test_official_gepa_reflects_and_selects_a_better_candidate(tmp_path: Path, monkeypatch) -> None:
    class Adapter:
        propose_new_texts = None

        def evaluate(self, batch, candidate, capture_traces=False):
            score = float(json.loads(candidate["heuristic"])["weight"] > 0)
            return EvaluationBatch(
                outputs=[candidate for _ in batch],
                scores=[score for _ in batch],
                trajectories=[candidate for _ in batch] if capture_traces else None,
            )

        def make_reflective_dataset(self, candidate, eval_batch, components_to_update):
            return {
                component: [
                    {
                        "Inputs": "game",
                        "Generated Outputs": candidate,
                        "Feedback": "positive weight wins",
                    }
                ]
                for component in components_to_update
            }

    prompts = []

    def reflect(prompt: str) -> str:
        prompts.append(prompt)
        return '```json\n{"weight":1}\n```'

    audit = EvolutionAudit(tmp_path / "observations.jsonl")
    result = gepa.optimize(
        seed_candidate={"heuristic": '{"weight":-1}'},
        trainset=[0, 1],
        valset=[2, 3],
        adapter=Adapter(),
        reflection_lm=reflect,
        reflection_prompt_template=REFLECTION_TEMPLATE,
        reflection_minibatch_size=2,
        max_metric_calls=10,
        skip_perfect_score=False,
        run_dir=str(tmp_path / "gepa"),
        display_progress_bar=False,
        callbacks=[audit],
    )
    assert prompts
    assert "positive weight wins" in prompts[0]
    assert json.loads(result.best_candidate["heuristic"])["weight"] == 1
    assert result.val_aggregate_scores[result.best_idx] == 1.0
    assert result.num_candidates >= 2
    assert audit.proposals()
    observations = [
        json.loads(line) for line in (tmp_path / "observations.jsonl").read_text().splitlines()
    ]
    assert any(record["kind"] == "accepted" for record in observations)

    worker = tmp_path / "worker.js"
    worker.write_text("placeholder")
    metadata = {
        "worker": str(worker),
        "engineSha256": "engine",
        "runnerSha256": "runner",
        "evaluationTimeout": 60,
        "evaluationWorkers": 4,
        "evaluationCache": str(tmp_path / "cache"),
    }
    monkeypatch.setattr("evolve.gepa.optimize", lambda **kwargs: result)
    options = {
        "stage": "generic",
        "initial": {"weight": -1},
        "splits": {"train": [], "validation": []},
        "run_dir": tmp_path / "run",
        "metadata": metadata,
        "node": "node",
        "simulations": 256,
        "metric_calls": 10,
        "reflection_model": "session",
    }
    selected = optimize_stage(**options)
    assert selected["program"] == {"weight": 1}
    assert (
        json.loads((tmp_path / "run/generic/gepa-result.json").read_text())["best_idx"]
        == result.best_idx
    )
    assert optimize_stage(**options) == selected
    with pytest.raises(ValueError, match="Resumed stage inputs"):
        optimize_stage(**{**options, "initial": {"weight": 9}})


def test_selection_never_substitutes_training_scores_for_validation(
    tmp_path: Path, monkeypatch
) -> None:
    evaluated = []

    class Adapter:
        propose_new_texts = None

        def evaluate(self, batch, candidate, capture_traces=False):
            improved_on_train = json.loads(candidate["heuristic"])["weight"] > 0
            scores = [float(improved_on_train == (task < 10)) for task in batch]
            evaluated.append((batch, improved_on_train))
            return EvaluationBatch(
                outputs=[{"score": score, "valid": True} for score in scores],
                scores=scores,
                trajectories=[candidate for _ in batch] if capture_traces else None,
            )

        def make_reflective_dataset(self, candidate, eval_batch, components_to_update):
            return {
                component: [
                    {
                        "Inputs": "training game",
                        "Generated Outputs": candidate,
                        "Feedback": "positive weight wins training",
                    }
                ]
                for component in components_to_update
            }

    real_optimize = gepa.optimize

    def optimize(**kwargs):
        assert kwargs["cache_evaluation"] is False
        return real_optimize(**kwargs)

    monkeypatch.setattr("evolve.gepa.optimize", optimize)
    monkeypatch.setattr("evolve.HeuristicAdapter", lambda config, metadata: Adapter())
    monkeypatch.setattr(
        "evolve.SessionReflection", lambda directory: lambda prompt: '```json\n{"weight":1}\n```'
    )
    initial = {"weight": -1}
    selected = optimize_stage(
        stage="generic",
        initial=initial,
        splits={"train": [0, 1], "validation": [10, 11]},
        run_dir=tmp_path,
        node="node",
        simulations=256,
        metric_calls=10,
        reflection_model="session",
        metadata={
            "worker": "unused",
            "engineSha256": "engine",
            "runnerSha256": "runner",
            "evaluationTimeout": 60,
            "evaluationWorkers": 4,
            "evaluationCache": str(tmp_path / "cache"),
            "seedProgram": initial,
        },
    )
    assert selected["candidates"] >= 2
    assert ([10, 11], True) in evaluated
    assert selected["program"] == initial
    assert selected["validationScore"] == 1.0


def test_pilot_test_split_excludes_mirrors_and_rotates_opponents():
    archive = {name: {"title": name} for name in ("a", "b", "c", "d")}
    splits = task_sets(list(archive), "a", archive, 1, 1)
    opponents = {
        name: {task["decks"][1 - task["learnerSeat"]] for task in tasks}
        for name, tasks in splits.items()
    }
    assert opponents == {"train": {"b"}, "validation": {"c"}, "test": {"d"}}
    for tasks in task_sets(["a", "b"], "a", archive, 8, 1).values():
        assert all(task["decks"][0] != task["decks"][1] for task in tasks)


@pytest.mark.parametrize("api_failure", (False, True))
@pytest.mark.parametrize("reflection_pairs", (None, 4))
@pytest.mark.parametrize("metric_calls", (192, 384))
def test_official_gepa_stage_runs_custom_guarded_proposer_without_duplicate_template(
    tmp_path, monkeypatch, api_failure, reflection_pairs, metric_calls
):
    """Exercise the real GEPA public API with its custom-proposer path, without paid calls."""
    initial = {
        "schemaVersion": 1,
        "basePolicy": "projected-balanced",
        "title": "Synthetic integration",
        "rules": [{"feature": "bias", "weight": 1, "advice": "Develop when useful."}],
    }
    raw = {**initial, "rules": [{**initial["rules"][0], "when": {"minimum": {"turn": 1}}}]}
    prompts = []
    reflection_batches = []

    class Adapter:
        propose_new_texts = None

        def __init__(self, config, metadata):
            self.config = config
            config.run_dir.mkdir(parents=True)
            self.calls = 0

        def evaluate(self, tasks, candidate, capture_traces=False):
            if capture_traces:
                reflection_batches.append(tasks)
            if capture_traces and reflection_pairs is not None:
                assert len(tasks) == 2 * reflection_pairs
                assert all(
                    {task["learnerSeat"] for task in tasks if task["seed"] == seed} == {0, 1}
                    for seed in {task["seed"] for task in tasks}
                )
            program = json.loads(candidate["heuristic"])
            score = int("when" in program["rules"][0])
            outputs = []
            for task in tasks:
                self.calls += 1
                output = {
                    "task": task,
                    "valid": True,
                    "score": score,
                    "policySha256": policy_hash(program),
                    "traces": [{"kind": "main"}],
                }
                (self.config.run_dir / f"{self.calls:05d}.json").write_text(json.dumps(output))
                outputs.append(output)
            return EvaluationBatch(
                outputs=outputs,
                scores=[score] * len(tasks),
                trajectories=outputs if capture_traces else None,
            )

        def make_reflective_dataset(self, candidate, evaluated, components):
            return {
                component: [
                    {
                        "Inputs": {"match": output["task"]},
                        "Generated Outputs": candidate,
                        "Feedback": {"valid": output["valid"], "score": output["score"]},
                    }
                    for output in evaluated.outputs
                ]
                for component in components
            }

    def reflect(prompt):
        prompts.append(prompt)
        if api_failure:
            reflect.failure = RuntimeError("provider unavailable")
            raise reflect.failure
        return "```json\n" + json.dumps(raw) + "\n```"

    monkeypatch.setattr("evolve.HeuristicAdapter", Adapter)
    monkeypatch.setattr("evolve.SessionReflection", lambda directory: reflect)
    splits = {
        name: [
            {"seed": base + n, "learnerSeat": seat, "opponent": "mcts"}
            for n in range(24)
            for seat in (0, 1)
        ]
        for name, base in (("train", 0), ("validation", 100))
    }
    context = (
        pytest.raises(RuntimeError, match="API reflection failed") if api_failure else nullcontext()
    )
    with context:
        selected = optimize_stage(
            stage="generic",
            initial=initial,
            splits=splits,
            run_dir=tmp_path,
            node="unused",
            simulations=1,
            metric_calls=metric_calls,
            reflection_model="session",
            metadata={
                "worker": "unused",
                "engineSha256": "engine",
                "runnerSha256": "runner",
                "evaluationTimeout": 60,
                "evaluationWorkers": 4,
                "evaluationCache": str(tmp_path / "cache"),
                "seedProgram": initial,
                "pairedProposalGates": True,
                "reflectionPairs": reflection_pairs,
            },
        )
    assert prompts and "Focus on structural edits" in prompts[0]
    if api_failure:
        assert len(prompts) == 1
        assert not (tmp_path / "generic/selected.json").exists()
        return
    assert selected["program"] == raw and selected["validationScore"] == 1
    assert len(reflection_batches) == metric_calls // 192
    assert selected["candidates"] >= 2 and selected["validEvaluatedProposals"] >= 1
    gates = [
        json.loads(path.read_text())
        for path in (tmp_path / "generic/proposal-gates").glob("proposal-*.json")
    ]
    assert any(gate.get("pairedEvidence", {}).get("accepted") is True for gate in gates)


def test_campaign_seed_offset_separates_random_decks_and_game_and_search_seeds() -> None:
    original = task_sets(["a", "b"], None, {}, 24, 0)
    shifted = task_sets(["a", "b"], None, {}, 24, 0, 420_000_000)
    assert shifted == task_sets(["a", "b"], None, {}, 24, 0, 420_000_000)
    for split in original:
        for before, after in zip(original[split], shifted[split], strict=True):
            assert after["seed"] == before["seed"] + 420_000_000
            assert after["searchSeed"] == before["searchSeed"] + 420_000_000
            assert after["decks"] == [deck + 420_000_000 for deck in before["decks"]]
            assert after["learnerSeat"] == before["learnerSeat"]
    train = {task["seed"] for task in shifted["train"]}
    validation = {task["seed"] for task in shifted["validation"]}
    final = task_sets(["a", "b"], None, {}, 24, 3, 420_000_000)
    assert not train & validation
    assert not (train | validation) & {task["seed"] for task in final["test"]}


@pytest.mark.parametrize("final_pairs", [None, 100])
@pytest.mark.parametrize("turn_limit", [60, 120])
def test_final_sample_size_is_frozen_without_expanding_training(
    tmp_path: Path, monkeypatch, final_pairs: int | None, turn_limit: int
) -> None:
    worker = tmp_path / "worker.js"
    worker.write_text("")
    description = {
        "engineSha256": "engine",
        "deckVersions": ["a", "b"],
        "seedProgram": {"rules": []},
    }
    monkeypatch.setattr(
        "evolve.subprocess.run",
        lambda *args, **kwargs: SimpleNamespace(stdout=json.dumps(description)),
    )
    monkeypatch.setattr("evolve.shutil.which", lambda name: name)
    stages = []
    final_calls = []

    def optimize(**kwargs):
        stages.append(kwargs)
        return {"program": kwargs["initial"]}

    def evaluate(**kwargs):
        final_calls.append(kwargs)
        return {"results": {"generic": {"allValid": True}}}

    monkeypatch.setattr("evolve.optimize_stage", optimize)
    monkeypatch.setattr("evolve.final_evaluation", evaluate)
    args = [
        "--run-dir",
        str(tmp_path / "run"),
        "--worker",
        str(worker),
        "--reflection-model",
        "session",
        "--pairs",
        "24",
        "--generations",
        "1",
        "--seed-offset",
        "420000000",
        "--turn-limit",
        str(turn_limit),
    ]
    if final_pairs is not None:
        args += ["--final-pairs", str(final_pairs)]
    result = CliRunner().invoke(main, args)
    assert result.exit_code == 0, result.output
    assert len(stages[0]["splits"]["train"]) == 48
    assert all(len(stage["splits"]["train"]) == 96 for stage in stages[1:])
    assert final_calls[0]["pairs"] == (final_pairs or 24)
    manifest = json.loads((tmp_path / "run" / "manifest.json").read_text())
    assert manifest["config"]["finalPairs"] == (final_pairs or 24)
    assert manifest["config"]["reflectionPairs"] == 4
    assert all(stage["metadata"]["reflectionPairs"] == 4 for stage in stages)
    assert final_calls[0]["metadata"]["seedOffset"] == 420000000
    assert manifest["config"]["turnLimit"] == turn_limit
    assert final_calls[0]["metadata"]["turnLimit"] == turn_limit
    assert all(
        task["turnLimit"] == turn_limit
        for stage in stages
        for tasks in stage["splits"].values()
        for task in tasks
    )
    changed = args.copy()
    changed[changed.index("--turn-limit") + 1] = str(turn_limit + 1)
    resumed = CliRunner().invoke(main, changed)
    assert resumed.exit_code != 0
    assert "Run configuration or engine changed" in resumed.output
    changed_reflection = CliRunner().invoke(main, [*args, "--reflection-pairs", "2"])
    assert changed_reflection.exit_code != 0
    assert "Run configuration or engine changed" in changed_reflection.output


def test_held_out_candidates_and_controls_keep_the_campaign_turn_limit(
    tmp_path: Path, monkeypatch
) -> None:
    calls = []

    class Adapter:
        def __init__(self, config, metadata):
            pass

        def evaluate(self, tasks, candidate, capture_traces):
            calls.append(tasks)
            return EvaluationBatch(
                outputs=[{"valid": True} for task in tasks],
                scores=[0.5 for task in tasks],
                trajectories=None,
            )

    monkeypatch.setattr("evolve.HeuristicAdapter", Adapter)
    monkeypatch.setattr("evolve.paired_evidence", lambda selected, control: {})
    final_evaluation(
        stages={name: {"program": {"rules": []}} for name in ["generic", "a", "b"]},
        run_dir=tmp_path,
        metadata={
            "deckVersions": ["a", "b"],
            "worker": "worker.js",
            "engineSha256": "engine",
            "runnerSha256": "runner",
            "evaluationTimeout": 600,
            "evaluationWorkers": 1,
            "evaluationCache": str(tmp_path / "cache"),
            "seedProgram": {"rules": []},
            "turnLimit": 120,
        },
        node="node",
        simulations=128,
        pairs=2,
        generations=2,
    )
    assert len(calls) == 6
    assert all(task["turnLimit"] == 120 for tasks in calls for task in tasks)
    assert calls[0] == calls[1]
    assert calls[2] == calls[3]
    assert calls[4] == calls[5]


@pytest.mark.parametrize("confirmed", (True, False))
def test_multi_fidelity_stage_screens_gates_and_confirms_at_separate_budgets(
    tmp_path, monkeypatch, confirmed
):
    initial = {
        "schemaVersion": 1,
        "basePolicy": "projected-balanced",
        "title": "Synthetic fidelity",
        "rules": [{"feature": "bias", "weight": 1, "advice": "Develop when useful."}],
    }
    raw = {**initial, "rules": [{**initial["rules"][0], "when": {"minimum": {"turn": 1}}}]}
    calls = []

    class Adapter:
        propose_new_texts = None

        def __init__(self, config, metadata):
            self.config = config
            config.run_dir.mkdir(parents=True, exist_ok=True)

        def evaluate(self, tasks, candidate, capture_traces=False):
            calls.append((self.config.simulations, self.config.rollout_turns, tasks))
            program = json.loads(candidate["heuristic"])
            improved = "when" in program["rules"][0]
            score = int(improved and (confirmed or self.config.simulations != 128))
            outputs = [
                {"task": task, "valid": True, "score": score, "policySha256": policy_hash(program)}
                for task in tasks
            ]
            return EvaluationBatch(
                outputs=outputs,
                scores=[score] * len(tasks),
                trajectories=outputs if capture_traces else None,
            )

        def make_reflective_dataset(self, candidate, evaluated, components):
            return {
                component: [
                    {
                        "Inputs": {"match": output["task"]},
                        "Generated Outputs": candidate,
                        "Feedback": {"valid": output["valid"], "score": output["score"]},
                    }
                    for output in evaluated.outputs
                ]
                for component in components
            }

    monkeypatch.setattr("evolve.HeuristicAdapter", Adapter)
    monkeypatch.setattr(
        "evolve.SessionReflection", lambda directory: lambda prompt: json.dumps(raw)
    )
    splits = {
        name: [
            {"seed": base + n, "learnerSeat": seat, "opponent": "mcts"}
            for n in range(24)
            for seat in (0, 1)
        ]
        for name, base in (("train", 0), ("validation", 100))
    }
    selected = optimize_stage(
        stage="generic",
        initial=initial,
        splits=splits,
        run_dir=tmp_path,
        node="unused",
        simulations=128,
        metric_calls=256,
        reflection_model="session",
        metadata={
            "worker": "unused",
            "engineSha256": "engine",
            "runnerSha256": "runner",
            "evaluationTimeout": 60,
            "evaluationWorkers": 4,
            "evaluationCache": str(tmp_path / "cache"),
            "seedProgram": initial,
            "pairedProposalGates": True,
            "reflectionPairs": 4,
            "fidelity": {
                "screenSimulations": 16,
                "screenRolloutTurns": 2,
                "selectionPairs": 4,
                "gateSimulations": 32,
                "gateRolloutTurns": 4,
                "sequentialLooks": [12, 24],
            },
        },
    )
    tiers = {}
    for simulations, rollout, tasks in calls:
        tiers.setdefault((simulations, rollout), []).extend(task["seed"] for task in tasks)
    assert set(tiers) == {(16, 2), (32, 4), (128, None)}
    assert max(tiers[(16, 2)]) < 1_000_000_000
    assert all(1_000_000_000 <= seed < 2_000_000_000 for seed in tiers[(32, 4)])
    assert all(seed >= 2_000_000_000 for seed in tiers[(128, None)])
    gate = json.loads((tmp_path / "generic/proposal-gates/proposal-0001.json").read_text())
    assert gate["pairedEvidence"]["stopReason"] == "efficacy"
    assert selected["gateSelectedProgram"] == raw
    assert selected["confirmation"]["simulations"] == 128
    assert selected["confirmation"]["accepted"] is confirmed
    assert selected["program"] == (raw if confirmed else initial)
    assert selected["retainedStageInitial"] is not confirmed
