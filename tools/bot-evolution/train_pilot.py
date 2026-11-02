import hashlib
import json
from pathlib import Path

import gepa

from adapter import EvaluationConfig, HeuristicAdapter
from audit_pilot_family import audit_pilot_family
from audit_pilot_selection import audit_pilot_selection
from evidence import policy_hash
from evolve import EvolutionAudit
from paired_pilot_evidence import paired_pilot_evidence
from PilotProposer import PilotProposer


def train_pilot(
    *,
    directory: Path,
    deck: dict,
    metadata: dict,
    splits: dict,
    screen_alpha: float,
    held_out_alpha: float,
) -> dict:
    configuration = {
        "deck": deck,
        "metadata": metadata,
        "splits": splits,
        "screenAlpha": screen_alpha,
        "heldOutAlpha": held_out_alpha,
    }
    audit_pilot_family(directory=directory, configuration=configuration)
    directory.mkdir(parents=True, exist_ok=True)
    identity = hashlib.sha256(json.dumps(configuration, sort_keys=True).encode()).hexdigest()
    selected_path = directory / "selected.json"
    if selected_path.is_file():
        return audit_pilot_selection(directory=directory, configuration=configuration)
    (directory / "protocol.json").write_text(
        json.dumps(configuration, indent=2) + "\n", encoding="utf-8"
    )
    adapter = HeuristicAdapter(
        EvaluationConfig(
            node=metadata["node"],
            worker=Path(metadata["worker"]),
            run_dir=directory / "games",
            engine_sha256=metadata["engineSha256"],
            simulations=1,
            desktop_host=metadata["desktopHost"],
            timeout=600,
            workers=metadata["evaluationWorkers"],
            cache_dir=Path(metadata["evaluationCache"]),
            desktop_wsl_args=tuple(metadata.get("desktopWslArgs", [])),
        ),
        {**metadata, "residualBatchSize": 32},
    )
    generic = metadata["generic"]
    proposer = PilotProposer(
        adapter=adapter,
        programs=[entry["program"] for entry in deck["proposals"]],
        generic=generic,
        tasks=splits["gate"],
        directory=directory / "proposal-gates",
        alpha=screen_alpha,
        origin=metadata.get("proposalOrigin", "deterministic-structural"),
    )
    adapter.propose_new_texts = proposer
    result = gepa.optimize(
        seed_candidate={"heuristic": json.dumps(generic)},
        trainset=splits["train"],
        valset=splits["validation"],
        adapter=adapter,
        reflection_lm=None,
        reflection_minibatch_size=len(splits["train"]),
        max_metric_calls=len(splits["validation"])
        + len(deck["proposals"]) * (2 * len(splits["train"]) + len(splits["validation"])),
        run_dir=str(directory / "gepa"),
        seed=71,
        skip_perfect_score=False,
        cache_evaluation=False,
        display_progress_bar=False,
        raise_on_exception=True,
        callbacks=[EvolutionAudit(directory / "evolution-audit.jsonl")],
        stop_callbacks=lambda state: proposer.failure is not None or proposer.exhausted(state),
    )
    if proposer.failure is not None:
        raise RuntimeError("Pilot gate failed; no policy selected") from proposer.failure
    if not proposer.exhausted():
        raise RuntimeError("GEPA did not finish the complete frozen pilot hypothesis family")
    (directory / "gepa-result.json").write_text(
        json.dumps(result.to_dict(), indent=2) + "\n", encoding="utf-8"
    )
    program = json.loads(result.best_candidate["heuristic"])
    distinct = policy_hash(program) != policy_hash(generic)
    held_out = None
    if distinct:
        chosen = adapter.evaluate(splits["held-out"], {"heuristic": json.dumps(program)}).outputs
        control = adapter.evaluate(splits["held-out"], {"heuristic": json.dumps(generic)}).outputs
        held_out = {
            "selected": chosen,
            "control": control,
            "pairedEvidence": paired_pilot_evidence(
                selected=chosen, control=control, alpha=held_out_alpha
            ),
            "opponent": "certified generic residual",
            "freshOpponentDecks": True,
        }
        (directory / "held-out.json").write_text(
            json.dumps(held_out, indent=2) + "\n", encoding="utf-8"
        )
    selected = {
        "configurationSha256": identity,
        "deck": deck["id"],
        "program": program,
        "selectedIndex": result.best_idx,
        "candidates": result.num_candidates,
        "validationScore": result.val_aggregate_scores[result.best_idx],
        "distinct": distinct,
        "activated": bool(distinct and held_out["pairedEvidence"]["accepted"]),
        "heldOutEvidence": None if held_out is None else held_out["pairedEvidence"],
        "origin": metadata.get("proposalOrigin", "deterministic-structural"),
        "apiCalls": 0,
        "proposals": proposer.calls,
        "engineSha256": metadata["engineSha256"],
    }
    selected_path.write_text(json.dumps(selected, indent=2) + "\n", encoding="utf-8")
    return audit_pilot_selection(directory=directory, configuration=configuration)
