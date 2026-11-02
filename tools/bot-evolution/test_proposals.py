"""Proposal gates keep numeric calibration and never reuse seeds after a resume."""

import json
from types import SimpleNamespace

import pytest

from proposals import guarded_proposer


def test_structural_proposals_gate_on_fresh_seeds_and_resume_monotonically(tmp_path, monkeypatch):
    program = {
        "schemaVersion": 1,
        "title": "Pilot",
        "rules": [{"feature": "cost", "weight": -1, "advice": "Spend carefully."}],
    }
    raw = {**program, "rules": [{**program["rules"][0], "weight": -999, "when": {"kind": "main"}}]}
    prompts = []

    def reflect(**kwargs):
        prompts.append(kwargs)
        return {"new_instruction": json.dumps(raw)}

    monkeypatch.setattr("proposals.InstructionProposalSignature.run", reflect)

    class Adapter:
        def __init__(self):
            self.calls = []

        def evaluate(self, tasks, candidate):
            self.calls.append(tasks)
            conditional = "when" in json.loads(candidate["heuristic"])["rules"][0]
            return SimpleNamespace(
                outputs=[{"task": task, "score": int(conditional), "valid": True} for task in tasks]
            )

    adapter = Adapter()
    tasks = [{"seed": index // 2, "learnerSeat": index % 2} for index in range(96)]
    candidate = {"heuristic": json.dumps(program)}
    propose = guarded_proposer(adapter, None, program, tasks, tmp_path, 2)
    assert not propose.is_exhausted()
    chosen = propose(candidate, {"heuristic": []}, ["heuristic"])
    assert json.loads(chosen["heuristic"])["rules"][0]["weight"] == -1
    assert adapter.calls[0] == adapter.calls[1]
    assert not {task["seed"] for task in tasks} & {task["seed"] for task in adapter.calls[0]}
    resumed = guarded_proposer(adapter, None, program, tasks, tmp_path, 2)
    assert not resumed.is_exhausted()
    resumed(candidate, {"heuristic": []}, ["heuristic"])
    assert resumed.is_exhausted()
    assert guarded_proposer(adapter, None, program, tasks, tmp_path, 2).is_exhausted()
    assert not {task["seed"] for task in adapter.calls[0]} & {
        task["seed"] for task in adapter.calls[2]
    }
    resumed(candidate, {"heuristic": []}, ["heuristic"])
    assert len(prompts) == 2


def test_training_screen_rejects_ties_before_independent_games(tmp_path, monkeypatch):
    program = {"rules": [{"feature": "cost", "weight": -1, "advice": "Spend carefully."}]}
    proposal = {"rules": [{**program["rules"][0], "when": {"kind": "main"}}]}
    monkeypatch.setattr(
        "proposals.InstructionProposalSignature.run",
        lambda **kwargs: {"new_instruction": json.dumps(proposal)},
    )
    training = [{"seed": 7, "learnerSeat": seat} for seat in (0, 1)]
    calls = []

    def evaluate(tasks, candidate):
        calls.append(tasks)
        return SimpleNamespace(outputs=[{"valid": True, "score": 0} for task in tasks])

    feedback = {
        "heuristic": [
            {"Inputs": {"match": task}, "Feedback": {"valid": True, "score": 0}}
            for task in training
        ]
    }
    candidate = {"heuristic": json.dumps(program)}
    validation = [{"seed": 100 + index // 2, "learnerSeat": index % 2} for index in range(48)]
    propose = guarded_proposer(SimpleNamespace(evaluate=evaluate), None, program, validation, tmp_path, 2)
    assert propose(candidate, feedback, ["heuristic"]) == candidate
    assert calls == [training]
    evidence = json.loads((tmp_path / "proposal-0001.json").read_text())
    assert evidence["status"] == "rejected-training-screen"


def test_training_improvement_still_requires_independent_gate(tmp_path, monkeypatch):
    program = {"rules": [{"feature": "cost", "weight": -1, "advice": "Spend carefully."}]}
    proposal = {"rules": [{**program["rules"][0], "when": {"kind": "main"}}]}
    monkeypatch.setattr(
        "proposals.InstructionProposalSignature.run",
        lambda **kwargs: {"new_instruction": json.dumps(proposal)},
    )
    training = [{"seed": 7, "learnerSeat": seat} for seat in (0, 1)]
    calls = []

    def evaluate(tasks, candidate):
        calls.append(tasks)
        return SimpleNamespace(
            outputs=[{"task": task, "valid": True, "score": int(task in training)} for task in tasks]
        )

    feedback = {
        "heuristic": [
            {"Inputs": {"match": task}, "Feedback": {"valid": True, "score": 0}}
            for task in training
        ]
    }
    candidate = {"heuristic": json.dumps(program)}
    validation = [{"seed": 100 + index // 2, "learnerSeat": index % 2} for index in range(48)]
    propose = guarded_proposer(SimpleNamespace(evaluate=evaluate), None, program, validation, tmp_path, 2)
    assert propose(candidate, feedback, ["heuristic"]) == candidate
    assert calls[0] == training
    assert len(calls) == 3
    assert calls[1] == calls[2]
    assert all(task["seed"] > 1_000_000_000 for task in calls[1])
    assert json.loads((tmp_path / "proposal-0001.json").read_text())["pairedEvidence"]["accepted"] is False


@pytest.mark.parametrize(
    "outputs",
    [
        [],
        [{"valid": False, "score": 0}],
        [{"valid": True, "score": None}],
        [{"valid": True, "score": float("nan")}],
        [{"valid": True, "score": float("inf")}],
    ],
)
def test_incomplete_training_screen_never_becomes_a_fitness_loss(tmp_path, monkeypatch, outputs):
    program = {"rules": [{"feature": "cost", "weight": -1, "advice": "Spend carefully."}]}
    proposal = {"rules": [{**program["rules"][0], "when": {"kind": "main"}}]}
    monkeypatch.setattr(
        "proposals.InstructionProposalSignature.run",
        lambda **kwargs: {"new_instruction": json.dumps(proposal)},
    )
    training = {"seed": 7, "learnerSeat": 0}
    calls = []

    def evaluate(tasks, candidate):
        calls.append(tasks)
        return SimpleNamespace(outputs=outputs)

    feedback = {
        "heuristic": [
            {"Inputs": {"match": training}, "Feedback": {"valid": True, "score": 0}}
        ]
    }
    validation = [{"seed": 100 + index // 2, "learnerSeat": index % 2} for index in range(48)]
    propose = guarded_proposer(SimpleNamespace(evaluate=evaluate), None, program, validation, tmp_path, 2)
    with pytest.raises(ValueError, match="Incomplete proposal screen"):
        propose({"heuristic": json.dumps(program)}, feedback, ["heuristic"])
    assert calls == [[training]]
    assert json.loads((tmp_path / "proposal-0001.json").read_text())["status"] == "reserved"


def test_interrupted_gate_resumes_same_proposal_and_seed_blocks(tmp_path, monkeypatch):
    program = {"rules": [{"feature": "cost", "weight": -1, "advice": "Spend carefully."}]}
    proposal = {"rules": [{**program["rules"][0], "when": {"kind": "main"}}]}
    reflections = []

    def reflect(**kwargs):
        reflections.append(kwargs)
        return {"new_instruction": json.dumps(proposal)}

    monkeypatch.setattr("proposals.InstructionProposalSignature.run", reflect)
    tasks = [{"seed": 100 + index // 2, "learnerSeat": index % 2} for index in range(48)]
    candidate = {"heuristic": json.dumps(program)}
    seen = []

    def interrupted(tasks, candidate):
        seen.append(tasks)
        raise RuntimeError("Interrupted gate")

    propose = guarded_proposer(SimpleNamespace(evaluate=interrupted), None, program, tasks, tmp_path, 1)
    with pytest.raises(RuntimeError, match="Interrupted gate"):
        propose(candidate, {"heuristic": []}, ["heuristic"])

    def evaluate(tasks, candidate):
        seen.append(tasks)
        conditional = "when" in json.loads(candidate["heuristic"])["rules"][0]
        return SimpleNamespace(
            outputs=[{"task": task, "valid": True, "score": int(conditional)} for task in tasks]
        )

    resumed = guarded_proposer(SimpleNamespace(evaluate=evaluate), None, program, tasks, tmp_path, 1)
    assert not resumed.is_exhausted()
    chosen = resumed(candidate, {"heuristic": []}, ["heuristic"])
    assert "when" in json.loads(chosen["heuristic"])["rules"][0]
    assert seen[0] == seen[1] == seen[2]
    assert len(reflections) == 1
    assert len(list(tmp_path.glob("proposal-*.json"))) == 1
    assert resumed.is_exhausted()


def test_interrupted_proposal_refuses_changed_feedback(tmp_path, monkeypatch):
    program = {"rules": [{"feature": "cost", "weight": -1, "advice": "Spend carefully."}]}
    tasks = [{"seed": 100 + index // 2, "learnerSeat": index % 2} for index in range(48)]
    candidate = {"heuristic": json.dumps(program)}

    def interrupted(**kwargs):
        raise RuntimeError("Interrupted reflection")

    monkeypatch.setattr("proposals.InstructionProposalSignature.run", interrupted)
    propose = guarded_proposer(None, None, program, tasks, tmp_path, 1)
    with pytest.raises(RuntimeError, match="Interrupted reflection"):
        propose(candidate, {"heuristic": []}, ["heuristic"])
    resumed = guarded_proposer(None, None, program, tasks, tmp_path, 1)
    with pytest.raises(ValueError, match="Interrupted proposal request changed"):
        resumed(candidate, {"heuristic": [{"different": True}]}, ["heuristic"])


def test_accepted_gate_survives_interruption_before_gepa_checkpoint(tmp_path, monkeypatch):
    program = {"rules": [{"feature": "cost", "weight": -1, "advice": "Spend carefully."}]}
    proposal = {"rules": [{**program["rules"][0], "when": {"kind": "main"}}]}
    reflections = []

    def reflect(**kwargs):
        reflections.append(kwargs)
        return {"new_instruction": json.dumps(proposal)}

    monkeypatch.setattr("proposals.InstructionProposalSignature.run", reflect)
    tasks = [{"seed": 100 + index // 2, "learnerSeat": index % 2} for index in range(48)]
    candidate = {"heuristic": json.dumps(program)}
    evaluated = []

    def evaluate(tasks, candidate):
        evaluated.append(tasks)
        conditional = "when" in json.loads(candidate["heuristic"])["rules"][0]
        return SimpleNamespace(
            outputs=[{"task": task, "valid": True, "score": int(conditional)} for task in tasks]
        )

    adapter = SimpleNamespace(evaluate=evaluate)
    first = guarded_proposer(adapter, None, program, tasks, tmp_path, 1)
    initial_state = SimpleNamespace(program_candidates=[candidate])
    assert not first.is_exhausted(initial_state)
    accepted = first(candidate, {"heuristic": []}, ["heuristic"])
    assert "when" in json.loads(accepted["heuristic"])["rules"][0]
    games = len(evaluated)

    resumed = guarded_proposer(adapter, None, program, tasks, tmp_path, 1)
    assert not resumed.is_exhausted(initial_state)
    replayed = resumed(candidate, {"heuristic": []}, ["heuristic"])
    assert replayed == accepted
    assert len(evaluated) == games
    assert len(reflections) == 1
    assert resumed.is_exhausted(SimpleNamespace(program_candidates=[candidate, replayed]))


def test_unrecorded_accepted_gate_refuses_a_changed_request(tmp_path, monkeypatch):
    program = {"rules": [{"feature": "cost", "weight": -1, "advice": "Spend carefully."}]}
    proposal = {"rules": [{**program["rules"][0], "when": {"kind": "main"}}]}
    monkeypatch.setattr(
        "proposals.InstructionProposalSignature.run",
        lambda **kwargs: {"new_instruction": json.dumps(proposal)},
    )
    tasks = [{"seed": 100 + index // 2, "learnerSeat": index % 2} for index in range(48)]
    candidate = {"heuristic": json.dumps(program)}

    def evaluate(tasks, candidate):
        conditional = "when" in json.loads(candidate["heuristic"])["rules"][0]
        return SimpleNamespace(
            outputs=[{"task": task, "valid": True, "score": int(conditional)} for task in tasks]
        )

    adapter = SimpleNamespace(evaluate=evaluate)
    guarded_proposer(adapter, None, program, tasks, tmp_path, 2)(
        candidate, {"heuristic": []}, ["heuristic"]
    )
    resumed = guarded_proposer(adapter, None, program, tasks, tmp_path, 2)
    assert not resumed.is_exhausted(SimpleNamespace(program_candidates=[candidate]))
    with pytest.raises(ValueError, match="awaits GEPA acceptance"):
        resumed(candidate, {"heuristic": [{"different": True}]}, ["heuristic"])


def test_sequential_gates_share_parent_blocks_and_use_the_full_fidelity_adapter(
    tmp_path, monkeypatch
):
    program = {"rules": [{"feature": "cost", "weight": -1, "advice": "Spend carefully."}]}
    proposals = iter(
        [
            {"rules": [{**program["rules"][0], "when": {"kind": "main"}}]},
            {"rules": [{**program["rules"][0], "when": {"kind": "block"}}]},
        ]
    )
    monkeypatch.setattr(
        "proposals.InstructionProposalSignature.run",
        lambda **kwargs: {"new_instruction": json.dumps(next(proposals))},
    )
    tasks = [{"seed": 100 + index // 2, "learnerSeat": index % 2} for index in range(48)]
    candidate = {"heuristic": json.dumps(program)}
    gate_calls = []

    def lose(tasks, candidate):
        gate_calls.append((tasks, json.loads(candidate["heuristic"])))
        conditional = "when" in json.loads(candidate["heuristic"])["rules"][0]
        return SimpleNamespace(
            outputs=[
                {"task": task, "valid": True, "score": int(not conditional and task["seed"] % 2)}
                for task in tasks
            ]
        )

    propose = guarded_proposer(
        None,
        None,
        program,
        tasks,
        tmp_path,
        2,
        gate_adapter=SimpleNamespace(evaluate=lose),
        sequential_looks=[8, 16, 24],
    )
    assert propose(candidate, {"heuristic": []}, ["heuristic"]) == candidate
    assert propose(candidate, {"heuristic": []}, ["heuristic"]) == candidate
    control_blocks = [tasks for tasks, policy in gate_calls if "when" not in policy["rules"][0]]
    assert control_blocks[0] == control_blocks[-1]
    assert not {task["seed"] for task in tasks} & {task["seed"] for task in control_blocks[0]}
    records = [json.loads(path.read_text()) for path in sorted(tmp_path.glob("proposal-*.json"))]
    assert [record["pairedEvidence"]["stopReason"] for record in records] == ["futility"] * 2
