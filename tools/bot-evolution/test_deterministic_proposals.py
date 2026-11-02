"""Real GEPA numerical selection needs no model and cannot bypass lineage or gates."""

import hashlib
import json
from copy import deepcopy

import pytest
from gepa.core.adapter import EvaluationBatch

from certify_balanced import deterministic_lineage
from deterministic_proposals import gate_evidence, plan_hash, validate_plan
from evidence import paired_evidence, policy_hash
from evolve import optimize_stage


@pytest.fixture
def numerical_run(tmp_path, monkeypatch, request):
    initial = {
        "schemaVersion": 1,
        "basePolicy": "projected-balanced",
        "title": "Synthetic",
        "rules": [{"feature": "playTamer", "weight": 1, "advice": "Develop when useful."}],
    }
    better = deepcopy(initial)
    better["rules"][0].update(
        weight=-2, advice="Avoid spending memory on Tamers without a benefit."
    )
    plan = {
        "origin": "deterministic-numeric",
        "engineSha256": "engine",
        "initialPolicySha256": policy_hash(initial),
        "programs": [better],
    }

    class Adapter:
        propose_new_texts = None

        def __init__(self, config, metadata):
            self.config = config
            config.run_dir.mkdir(parents=True)
            self.calls = 0

        def evaluate(self, tasks, candidate, capture_traces=False):
            if getattr(request, "param", None) == "timeout" and tasks[0]["seed"] > 1_000_000_000:
                raise TimeoutError("synthetic desktop gate timeout")
            program = json.loads(candidate["heuristic"])
            score = int(program["rules"][0]["weight"] < 0)
            outputs = []
            for task in tasks:
                self.calls += 1
                game = {
                    "task": task,
                    "valid": True,
                    "score": score,
                    "policySha256": policy_hash(program),
                    "engineSha256": "engine",
                }
                (self.config.run_dir / f"{self.calls:05d}.json").write_text(json.dumps(game))
                outputs.append(game)
            return EvaluationBatch(
                outputs=outputs,
                scores=[score] * len(tasks),
                trajectories=outputs if capture_traces else None,
            )

        def make_reflective_dataset(self, candidate, evaluated, components):
            return {component: [] for component in components}

    def forbidden_api(*args, **kwargs):
        raise AssertionError("Deterministic GEPA must never construct a paid reflector")

    monkeypatch.setattr("evolve.HeuristicAdapter", Adapter)
    monkeypatch.setattr("evolve.ApiReflection", forbidden_api)
    splits = {
        name: [{"seed": base + n, "learnerSeat": 0} for n in range(48)]
        for name, base in (("train", 0), ("validation", 100))
    }
    metadata = {
        "worker": "unused",
        "engineSha256": "engine",
        "runnerSha256": "runner",
        "evaluationTimeout": 60,
        "evaluationWorkers": 4,
        "evaluationCache": str(tmp_path / "cache"),
        "seedProgram": initial,
        "pairedProposalGates": True,
        "deterministicPlan": plan,
        "proposalGateTasks": splits["validation"],
        "reflectionMinibatchSize": 48,
    }
    if getattr(request, "param", None) == "recheck":
        tasks = [
            {"seed": 900 + n, "decks": order, "learnerSeat": seat, "opponent": "balanced"}
            for n in range(12)
            for order in (["A", "B"], ["B", "A"])
            for seat in (0, 1)
        ]
        prior = {
            "origin": "deterministic-numeric",
            "status": "evaluated",
            "program": better,
            "parent": initial,
            "tasks": tasks,
        }
        for arm, program in (("selected", better), ("control", initial)):
            prior[arm] = [
                {
                    "task": task,
                    "valid": True,
                    "score": int((task["seed"] < 907) == (arm == "selected")),
                    "policySha256": policy_hash(program),
                    "engineSha256": "engine",
                }
                for task in tasks
            ]
        prior["pairedEvidence"] = paired_evidence(
            prior["selected"], prior["control"], alpha=0.05 / 7, method="wilson-wins"
        )
        prior_path = tmp_path / "prior.json"
        prior_path.write_text(json.dumps(prior, indent=2) + "\n")
        plan["pairedScreen"] = {
            "familySize": 7,
            "maximumLooks": 2,
            "look": 2,
            "seedOffset": 1_200_000_000,
            "priorGates": [
                {
                    "file": str(prior_path),
                    "fileSha256": hashlib.sha256(prior_path.read_bytes()).hexdigest(),
                    "recordSha256": plan_hash(prior),
                    "record": prior,
                }
            ],
        }
        metadata["proposalGateTasks"] = [
            {**task, "seed": 100 + n} for n in range(48) for task in tasks[:4]
        ]
    selected = optimize_stage(
        stage="generic",
        initial=initial,
        splits=splits,
        run_dir=tmp_path,
        node="unused",
        simulations=1,
        metric_calls=1000,
        reflection_model="deterministic",
        metadata=metadata,
    )
    manifest = {
        "metadata": metadata,
        "splits": splits,
        "config": {"engineSha256": "engine", "proposalPlanSha256": plan_hash(plan)},
    }
    return tmp_path, manifest, selected, better


def test_real_gepa_selects_a_gated_numerical_candidate_and_stops_without_api(numerical_run):
    path, manifest, selected, better = numerical_run
    assert selected["program"] == better
    assert selected["selectedIndex"] == 1 and selected["candidates"] == 2
    assert selected["metricCalls"] == 192  # initial validation + one complete iteration
    assert selected["validEvaluatedProposals"] == 1
    assert len(list((path / "generic/proposal-gates").glob("proposal-*.json"))) == 1
    assert not (path / "generic/reflections").exists()
    assert selected["deterministicPlan"] == {
        "total": 1,
        "attempted": 1,
        "completed": 1,
        "stopReason": "plan-exhausted",
    }
    lineage = deterministic_lineage(path, manifest, selected)
    assert lineage["origin"] == "deterministic-numeric"
    assert lineage["apiCalls"] == 0 and lineage["model"] is None


@pytest.mark.parametrize("corruption", ("plan", "selection", "gate", "tasks", "policy"))
def test_certification_reconstructs_plan_selection_and_fresh_gate(numerical_run, corruption):
    path, manifest, selected, _better = numerical_run
    if corruption == "plan":
        target = path / "generic/deterministic-plan.json"
        record = json.loads(target.read_text())
        record["programs"][0]["rules"][0]["weight"] = -3
    elif corruption == "selection":
        target = path / "generic/gepa-result.json"
        record = json.loads(target.read_text())
        record["best_idx"] = 0
    else:
        target = path / "generic/proposal-gates/proposal-0001.json"
        record = json.loads(target.read_text())
        if corruption == "gate":
            record["selected"][0]["score"] = 0
        elif corruption == "tasks":
            record["tasks"][0]["seed"] = manifest["splits"]["train"][0]["seed"]
        else:
            record["selected"][0]["policySha256"] = "a different program"
    target.write_text(json.dumps(record))
    with pytest.raises(ValueError):
        deterministic_lineage(path, manifest, selected)


def test_plan_rejects_duplicate_and_unchanged_policies(numerical_run):
    _path, manifest, _selected, better = numerical_run
    seed = manifest["metadata"]["seedProgram"]
    for programs in ([seed], [better, better], []):
        plan = {**manifest["metadata"]["deterministicPlan"], "programs": programs}
        with pytest.raises(ValueError):
            validate_plan(plan, seed, "engine")


@pytest.mark.parametrize(
    "field,value",
    (("feature", "cost"), ("when", {"minimum": {"turn": 1}}), ("weight", float("inf"))),
)
def test_numerical_provenance_refuses_structural_changes_and_unbounded_weights(
    numerical_run, field, value
):
    _path, manifest, _selected, better = numerical_run
    program = deepcopy(better)
    program["rules"][0][field] = value
    plan = {**manifest["metadata"]["deterministicPlan"], "programs": [program]}
    with pytest.raises(ValueError, match="Numerical plans"):
        validate_plan(plan, manifest["metadata"]["seedProgram"], "engine")


def test_real_gepa_cannot_select_after_a_swallowed_proposal_timeout(tmp_path, monkeypatch):
    class Request:
        param = "timeout"

    with pytest.raises(RuntimeError, match="Deterministic proposal gate failed"):
        numerical_run.__wrapped__(tmp_path, monkeypatch, Request())
    assert not (tmp_path / "generic/selected.json").exists()
    gate = json.loads((tmp_path / "generic/proposal-gates/proposal-0001.json").read_text())
    assert gate["status"] == "reserved"


@pytest.mark.parametrize("numerical_run", ["recheck"], indirect=True)
def test_real_gepa_recheck_retains_rejected_prior_and_requires_fresh_and_pooled_evidence(
    numerical_run,
):
    path, manifest, selected, _better = numerical_run
    lineage = deterministic_lineage(path, manifest, selected)
    gate = json.loads((path / "generic/proposal-gates/proposal-0001.json").read_text())
    prior = manifest["metadata"]["deterministicPlan"]["pairedScreen"]["priorGates"][0]["record"]
    assert prior["pairedEvidence"]["accepted"] is False
    assert prior["pairedEvidence"]["alpha"] == 0.05 / 7
    assert gate["pairedEvidence"]["seedBlocks"] == 48
    assert gate["pooledEvidence"]["seedBlocks"] == 60
    assert gate["pairedEvidence"]["alpha"] == gate["pooledEvidence"]["alpha"] == 0.05 / 14
    assert gate["screenAccepted"] is True
    assert lineage["pairedScreen"]["priorGateSha256"] == gate["priorGateSha256"]


@pytest.mark.parametrize("numerical_run", ["recheck"], indirect=True)
@pytest.mark.parametrize("corruption", ["prior", "pooled", "overlap", "assignment", "control"])
def test_recheck_lineage_rejects_changed_prior_pool_seeds_assignments_and_control(
    numerical_run, corruption
):
    path, manifest, selected, _better = numerical_run
    target = path / "generic/proposal-gates/proposal-0001.json"
    gate = json.loads(target.read_text())
    if corruption == "prior":
        (path / "prior.json").write_text("{}")
    elif corruption == "pooled":
        gate["pooledEvidence"]["difference"] = -1
    elif corruption == "overlap":
        gate["tasks"][0]["seed"] = 900
    elif corruption == "assignment":
        gate["tasks"][0]["learnerSeat"] = 1
    else:
        gate["parent"]["rules"][0]["weight"] = 2
    target.write_text(json.dumps(gate))
    with pytest.raises(ValueError):
        deterministic_lineage(path, manifest, selected)


@pytest.mark.parametrize("numerical_run", ["recheck"], indirect=True)
def test_pooled_evidence_cannot_rescue_a_failed_fresh_gate(numerical_run):
    path, manifest, _selected, _better = numerical_run
    gate = json.loads((path / "generic/proposal-gates/proposal-0001.json").read_text())
    plan = deepcopy(manifest["metadata"]["deterministicPlan"])
    reference = plan["pairedScreen"]["priorGates"][0]
    prior = reference["record"]
    for game in prior["selected"]:
        game["score"] = 1
    for game in prior["control"]:
        game["score"] = 0
    prior["pairedEvidence"] = paired_evidence(
        prior["selected"], prior["control"], alpha=0.05 / 7, method="wilson-wins"
    )
    prior_path = path / "prior.json"
    prior_path.write_text(json.dumps(prior, indent=2) + "\n")
    reference.update(
        fileSha256=hashlib.sha256(prior_path.read_bytes()).hexdigest(),
        recordSha256=plan_hash(prior),
    )
    for game in gate["selected"]:
        game["score"] = 0
    evidence = gate_evidence(plan, gate)
    assert evidence["pairedEvidence"]["accepted"] is False
    assert evidence["pooledEvidence"]["accepted"] is True
    assert evidence["screenAccepted"] is False
