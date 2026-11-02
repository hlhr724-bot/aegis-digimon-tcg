"""Keep reflection structural and gate each proposal on fresh paired seed blocks."""

import hashlib
import json
import math
from pathlib import Path

from gepa.strategies.instruction_proposal import InstructionProposalSignature

from adapter import REFLECTION_TEMPLATE
from evidence import paired_evidence, policy_hash
from residual_weights import RESIDUAL_WEIGHTS
from sequential_sign_gate import sequential_sign_gate


def guarded_proposer(
    adapter,
    reflector,
    calibrated: dict,
    tasks: list[dict],
    directory: Path,
    proposal_limit: int,
    *,
    gate_adapter=None,
    sequential_looks: list[int] | None = None,
):
    gate_adapter = gate_adapter or adapter
    if len(tasks) < 48:
        raise ValueError("Proposal gates require at least 48 paired games")
    weights = {}
    exact_weights = {}
    for rule in calibrated["rules"]:
        weights.setdefault(rule["feature"], rule["weight"])
        if "when" not in rule:
            weights[rule["feature"]] = rule["weight"]
        exact_weights[(rule["feature"], json.dumps(rule.get("when"), sort_keys=True))] = rule[
            "weight"
        ]
    directory.mkdir(parents=True, exist_ok=True)
    calls = max(
        (int(path.stem.split("-")[1]) for path in directory.glob("proposal-*.json")), default=0
    )
    awaiting_acceptance = False

    def _latest():
        path = directory / f"proposal-{calls:04d}.json"
        if not path.is_file():
            return None
        return json.loads(path.read_text(encoding="utf-8"))

    def _pending():
        record = _latest()
        return record if record is not None and record.get("status") == "reserved" else None

    def _save(path, record):
        temporary = path.with_suffix(".tmp")
        temporary.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
        temporary.replace(path)

    def _accepted(record):
        return record.get("pairedEvidence", {}).get("accepted") is True

    def propose(candidate, dataset, components):
        nonlocal calls
        request_hash = hashlib.sha256(
            json.dumps(
                {
                    "candidate": candidate,
                    "dataset": dataset,
                    "components": components,
                    "calibrated": calibrated,
                    "tasks": tasks,
                    "proposalLimit": proposal_limit,
                    "sequentialLooks": sequential_looks,
                },
                sort_keys=True,
                allow_nan=False,
            ).encode("utf-8")
        ).hexdigest()
        record = _pending()
        latest = _latest()
        if record is not None:
            if record.get("requestSha256") != request_hash:
                raise ValueError("Interrupted proposal request changed or lacks resume provenance")
        elif awaiting_acceptance:
            if latest.get("requestSha256") != request_hash:
                raise ValueError("Accepted proposal awaits GEPA acceptance but its request changed")
            return {"heuristic": json.dumps(latest["program"])}
        else:
            if calls >= proposal_limit:
                return candidate
            calls += 1
            record = {
                "status": "reserved",
                "proposalNumber": calls,
                "parent": candidate,
                "requestSha256": request_hash,
            }
            _save(directory / f"proposal-{calls:04d}.json", record)
        reservation = directory / f"proposal-{calls:04d}.json"
        if "instruction" not in record:
            record["instruction"] = InstructionProposalSignature.run(
                lm=reflector,
                input_dict={
                    "current_instruction_doc": candidate["heuristic"],
                    "dataset_with_feedback": dataset["heuristic"],
                    "prompt_template": REFLECTION_TEMPLATE,
                },
            )["new_instruction"]
            _save(reservation, record)
        text = record["instruction"]

        def finish(outcome):
            _save(reservation, {**outcome, "requestSha256": request_hash})

        program = json.loads(text)
        if program.get("basePolicy") != calibrated.get("basePolicy"):
            finish({"program": program, "status": "rejected-base-change"})
            return candidate
        for rule in program["rules"]:
            calibrated_weight = exact_weights.get(
                (rule["feature"], json.dumps(rule.get("when"), sort_keys=True)),
                weights.get(rule["feature"], 1),
            )
            if (
                calibrated.get("basePolicy") == "projected-balanced"
                and calibrated_weight == 0
                and rule["weight"] != 0
            ):
                calibrated_weight = RESIDUAL_WEIGHTS.get(rule["feature"], 0.25)
            if (
                rule["weight"] != 0
                and calibrated_weight != 0
                and rule["weight"] * calibrated_weight < 0
            ):
                finish(
                    {
                        "program": program,
                        "rejected": "Reflection changed calibrated weight sign; advice needs reauthoring",
                    }
                )
                return candidate
            rule["weight"] = calibrated_weight
        # Gate seeds are disjoint from train/validation/test. One-shot gates give each
        # hypothesis new blocks. Sequential gates share blocks per parent so its control
        # games are cached; Bonferroni over proposals holds under that dependence.
        gate_block = (
            calls
            if sequential_looks is None
            else 1
            + sum(
                _accepted(json.loads((directory / f"proposal-{number:04d}.json").read_text()))
                for number in range(1, calls)
            )
        )
        gate_tasks = [
            {**task, "seed": task["seed"] + 1_000_000_000 + gate_block * 10000} for task in tasks
        ]
        proposal = {"heuristic": json.dumps(program)}
        if policy_hash(program) == policy_hash(json.loads(candidate["heuristic"])):
            finish({"program": program, "status": "unchanged"})
            return candidate
        screen = None
        records = dataset.get("heuristic", [])
        if records:
            if any(
                record.get("Feedback", {}).get("valid") is not True
                or not isinstance(record.get("Inputs", {}).get("match"), dict)
                or type(record.get("Feedback", {}).get("score")) not in (int, float)
                or not math.isfinite(record["Feedback"]["score"])
                for record in records
            ):
                raise ValueError("Proposal screening requires valid training feedback and tasks")
            screen_tasks = [record["Inputs"]["match"] for record in records]
            screened = adapter.evaluate(screen_tasks, proposal).outputs
            if len(screened) != len(records) or any(
                output.get("valid") is not True
                or type(output.get("score")) not in (int, float)
                or not math.isfinite(output["score"])
                for output in screened
            ):
                raise ValueError("Incomplete proposal screen cannot reject or promote a policy")
            old_score = sum(record["Feedback"]["score"] for record in records)
            new_score = sum(output["score"] for output in screened)
            screen = {
                "tasks": screen_tasks,
                "parentScore": old_score,
                "candidateScore": new_score,
            }
            if new_score <= old_score:
                finish(
                    {
                        "program": program,
                        "status": "rejected-training-screen",
                        "screen": screen,
                    }
                )
                return candidate
        if sequential_looks is None:
            selected = gate_adapter.evaluate(gate_tasks, proposal).outputs
            control = gate_adapter.evaluate(gate_tasks, candidate).outputs
            evidence = paired_evidence(
                selected, control, alpha=0.05 / proposal_limit, method="wilson-wins"
            )
        else:
            gate = sequential_sign_gate(
                lambda look: (
                    gate_adapter.evaluate(look, proposal).outputs,
                    gate_adapter.evaluate(look, candidate).outputs,
                ),
                gate_tasks,
                sequential_looks,
                0.05 / proposal_limit,
            )
            evidence = {
                key: value for key, value in gate.items() if key not in ("selected", "control")
            }
        finish(
            {
                "program": program,
                "pairedEvidence": evidence,
                "tasks": gate_tasks,
                "screen": screen,
            }
        )
        return proposal if evidence["accepted"] else candidate

    def is_exhausted(state=None):
        nonlocal awaiting_acceptance
        latest = _latest()
        awaiting_acceptance = (
            state is not None
            and latest is not None
            and _accepted(latest)
            and policy_hash(latest["program"])
            not in {
                policy_hash(json.loads(program["heuristic"]))
                for program in state.program_candidates
            }
        )
        return calls >= proposal_limit and _pending() is None and not awaiting_acceptance

    propose.is_exhausted = is_exhausted
    return propose
