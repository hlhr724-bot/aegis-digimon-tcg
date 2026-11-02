"""Frozen numerical proposals through GEPA's public custom-proposer interface."""

import hashlib
import json
import math
from collections import defaultdict
from pathlib import Path

from evidence import paired_evidence, policy_hash


def plan_hash(plan: dict) -> str:
    return hashlib.sha256(json.dumps(plan, sort_keys=True).encode()).hexdigest()


def gate_tasks(plan: dict, tasks: list[dict], number: int) -> list[dict]:
    offset = plan.get("pairedScreen", {}).get("seedOffset", 1_000_000_000)
    result = [{**task, "seed": task["seed"] + offset + number * 10000} for task in tasks]
    if any(type(task["seed"]) is not int or not 0 <= task["seed"] <= 0xFFFFFFFF for task in result):
        raise ValueError("Proposal gate seeds must be uint32")
    return result


def validate_gate(gate: dict, program: dict, parent: dict, engine: str) -> None:
    tasks = gate["tasks"]
    if len({json.dumps(task, sort_keys=True) for task in tasks}) != len(tasks):
        raise ValueError("Paired rechecks cannot repeat tasks")
    blocks = defaultdict(list)
    for task in tasks:
        blocks[task["seed"]].append(task)
    for block in blocks.values():
        orders = {tuple(task["decks"]) for task in block}
        if (
            len(block) != 4
            or len(orders) != 2
            or any(len(order) != 2 or order[0] == order[1] for order in orders)
            or len({tuple(sorted(order)) for order in orders}) != 1
            or any(
                {task["learnerSeat"] for task in block if tuple(task["decks"]) == order} != {0, 1}
                for order in orders
            )
            or any(task.get("opponent") != "balanced" for task in block)
        ):
            raise ValueError("Paired rechecks need both deck assignments and learner seats")
    for arm, policy in (("selected", program), ("control", parent)):
        if [game["task"] for game in gate[arm]] != tasks or any(
            game["engineSha256"] != engine or game["policySha256"] != policy_hash(policy)
            for game in gate[arm]
        ):
            raise ValueError("Paired recheck changed its engine, policies or tasks")


def prior_gate(plan: dict, parent: dict) -> dict:
    reference = plan["pairedScreen"]["priorGates"][0]
    path = Path(reference["file"])
    raw = path.read_bytes()
    gate = reference["record"]
    if (
        hashlib.sha256(raw).hexdigest() != reference["fileSha256"]
        or json.loads(raw) != gate
        or plan_hash(gate) != reference["recordSha256"]
        or gate.get("status") != "evaluated"
        or gate.get("origin") != "deterministic-numeric"
        or policy_hash(gate["program"]) != policy_hash(plan["programs"][0])
        or policy_hash(gate["parent"]) != policy_hash(parent)
    ):
        raise ValueError("Prior paired gate does not match its frozen source or policies")
    validate_gate(gate, gate["program"], gate["parent"], plan["engineSha256"])
    original = paired_evidence(
        gate["selected"],
        gate["control"],
        alpha=gate["pairedEvidence"]["alpha"],
        method="wilson-wins",
    )
    if (
        original != gate["pairedEvidence"]
        or original["played"] != original["configured"]
        or original["played"] < 48
        or original["seedBlocks"] < 12
    ):
        raise ValueError("Prior paired gate evidence does not reconstruct")
    return gate


def gate_evidence(plan: dict, gate: dict) -> dict:
    screen = plan.get("pairedScreen")
    alpha = (
        0.05 / len(plan["programs"])
        if screen is None
        else 0.05 / (screen["familySize"] * screen["maximumLooks"])
    )
    fresh = paired_evidence(gate["selected"], gate["control"], alpha=alpha, method="wilson-wins")
    result = {"pairedEvidence": fresh}
    if screen is not None:
        validate_gate(gate, gate["program"], gate["parent"], plan["engineSha256"])
        prior = prior_gate(plan, gate["parent"])
        if {task["seed"] for task in prior["tasks"]} & {task["seed"] for task in gate["tasks"]}:
            raise ValueError("A paired recheck must use fresh independent seed blocks")
        pooled = paired_evidence(
            prior["selected"] + gate["selected"],
            prior["control"] + gate["control"],
            alpha=alpha,
            method="wilson-wins",
        )
        result.update(
            pooledEvidence=pooled,
            screenAccepted=fresh["accepted"] and pooled["accepted"],
            priorGateSha256=screen["priorGates"][0]["fileSha256"],
        )
    return result


def validate_plan(plan: dict, initial: dict, engine: str) -> None:
    programs = plan.get("programs", [])
    if (
        plan.get("origin") != "deterministic-numeric"
        or plan.get("engineSha256") != engine
        or plan.get("initialPolicySha256") != policy_hash(initial)
        or not 1 <= len(programs) <= 32
        or len({policy_hash(program) for program in programs}) != len(programs)
        or any(
            program.get("basePolicy") != initial.get("basePolicy")
            or policy_hash(program) == policy_hash(initial)
            for program in programs
        )
    ):
        raise ValueError(
            "Freeze distinct numerical programs against the same initial policy and engine"
        )

    def structure(program):
        return {
            **{key: value for key, value in program.items() if key not in ("title", "rules")},
            "rules": [
                {key: value for key, value in rule.items() if key not in ("weight", "advice")}
                for rule in program["rules"]
            ],
        }

    for program in programs:
        if structure(program) != structure(initial) or any(
            type(rule.get("weight")) not in (int, float)
            or not math.isfinite(rule["weight"])
            or not -10000 <= rule["weight"] <= 10000
            or (old["weight"] * rule["weight"] < 0 and old["advice"] == rule["advice"])
            for old, rule in zip(initial["rules"], program["rules"], strict=True)
        ):
            raise ValueError(
                "Numerical plans may change only bounded weights and authored advice/title"
            )
    screen = plan.get("pairedScreen")
    if screen is not None:
        if (
            len(programs) != 1
            or any(
                type(screen.get(key)) is not int
                for key in ("familySize", "maximumLooks", "look", "seedOffset")
            )
            or not 1 <= screen["familySize"] <= 32
            or screen["maximumLooks"] != 2
            or screen["look"] != 2
            or not 0 <= screen["seedOffset"] <= 0xFFFFFFFF
            or len(screen.get("priorGates", [])) != 1
        ):
            raise ValueError("Freeze one second-look recheck with its family budget and prior gate")
        prior_gate(plan, initial)


class DeterministicProposer:
    """No model calls; every predeclared hypothesis gets a new paired gate."""

    def __init__(self, adapter, plan: dict, tasks: list[dict], directory: Path) -> None:
        if len(tasks) < 48 or len({task["seed"] for task in tasks}) < 12:
            raise ValueError("Deterministic gates require at least 48 paired games")
        self.adapter = adapter
        self.plan = plan
        self.tasks = tasks
        self.directory = directory
        directory.mkdir(parents=True, exist_ok=True)
        self.calls = 0
        self.failure = None
        # A partial run needs a fresh directory: never skip a reserved hypothesis
        # that GEPA may not have finished evaluating before interruption.
        if list(directory.glob("proposal-*.json")):
            raise ValueError("Resume a completed stage or start a fresh deterministic run")

    def exhausted(self, state=None) -> bool:
        return self.calls >= len(self.plan["programs"])

    def __call__(self, candidate, dataset, components) -> dict:
        # GEPA catches custom-proposer errors internally, including transport
        # failures. Latch at this library boundary so the stage cannot select.
        try:
            return self.propose(candidate)
        except Exception as error:
            self.failure = error
            raise

    def propose(self, candidate) -> dict:
        if self.exhausted():
            return candidate
        program = self.plan["programs"][self.calls]
        self.calls += 1
        tasks = gate_tasks(self.plan, self.tasks, self.calls)
        path = self.directory / f"proposal-{self.calls:04d}.json"
        record = {
            "origin": "deterministic-numeric",
            "planSha256": plan_hash(self.plan),
            "proposalNumber": self.calls,
            "program": program,
            "parent": json.loads(candidate["heuristic"]),
            "tasks": tasks,
            "status": "reserved",
        }
        path.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
        if policy_hash(program) == policy_hash(record["parent"]):
            record["status"] = "unchanged"
            path.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
            return candidate
        proposal = {"heuristic": json.dumps(program)}
        selected = self.adapter.evaluate(tasks, proposal).outputs
        control = self.adapter.evaluate(tasks, candidate).outputs
        fields = ("task", "score", "valid", "engineSha256", "policySha256")
        record.update(
            status="evaluated",
            selected=[{key: game[key] for key in fields} for game in selected],
            control=[{key: game[key] for key in fields} for game in control],
        )
        record.update(gate_evidence(self.plan, record))
        path.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
        accepted = record.get("screenAccepted", record["pairedEvidence"]["accepted"])
        return proposal if accepted else candidate
