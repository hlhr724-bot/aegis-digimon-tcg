import hashlib
import json
from pathlib import Path

from audit_pilot_family import audit_pilot_family
from evidence import paired_evidence, policy_hash, program_hash
from paired_pilot_evidence import paired_pilot_evidence


def audit_pilot_selection(*, directory: Path, configuration: dict) -> dict:
    audit_pilot_family(directory=directory, configuration=configuration)

    def load(name: str) -> dict:
        path = directory / name
        if not path.is_file():
            raise ValueError(f"Missing frozen pilot artifact: {name}")
        return json.loads(path.read_text(encoding="utf-8"))

    def check_games(games: list[dict], tasks: list[dict], program: dict) -> None:
        if [game.get("task") for game in games] != tasks:
            raise ValueError("Pilot evidence changed its frozen tasks or ordering")
        for game in games:
            result = game.get("result", {})
            winner = result.get("winnerSeat")
            expected = 0.5 if winner is None else int(winner == game["task"]["learnerSeat"])
            if (
                game.get("valid") is not True
                or type(game.get("score")) not in (int, float)
                or game.get("score") != expected
                or (winner is not None and (type(winner) is not int or winner not in (0, 1)))
                or game.get("status") != "played"
                or game.get("engineSha256") != metadata["engineSha256"]
                or game.get("policySha256") != policy_hash(program)
                or result.get("timedOut") is not False
                or not isinstance(result.get("reason"), str)
                or not result["reason"]
                or result["reason"]
                in ("cancelled", "stalled", "unfinished", "turnLimit", "decisionLimit")
                or result.get("errors") != []
                or result.get("rejections") != []
                or result.get("projectionChecks", 0) <= 0
                or game.get("asynchronousRejections") != []
                or len(result.get("seats", [])) != 2
                or any(
                    seat.get("inferenceFallbacks") != {"error": 0, "timeout": 0}
                    for seat in result.get("seats", [])
                )
            ):
                raise ValueError("Pilot evidence changed its engine, policy, score or validity")

    identity = hashlib.sha256(json.dumps(configuration, sort_keys=True).encode()).hexdigest()
    selected = load("selected.json")
    if load("protocol.json") != configuration or selected.get("configurationSha256") != identity:
        raise ValueError("Completed pilot inputs changed; use a fresh run directory")
    metadata = configuration["metadata"]
    generic = metadata["generic"]
    proposals = configuration["deck"]["proposals"]
    splits = configuration["splits"]
    frozen = {program_hash(entry["program"]): entry["program"] for entry in proposals}
    raw_games = {}
    for path in (directory / "games").glob("*.json"):
        game = json.loads(path.read_text(encoding="utf-8"))
        key = (game.get("policySha256"), json.dumps(game.get("task"), sort_keys=True))
        if key in raw_games and any(
            raw_games[key].get(field) != game.get(field)
            for field in ("score", "valid", "engineSha256")
        ):
            raise ValueError("Repeated deterministic pilot task changed its outcome or validity")
        raw_games[key] = game

    def check_raw(games: list[dict]) -> None:
        for game in games:
            key = (game["policySha256"], json.dumps(game["task"], sort_keys=True))
            raw = raw_games.get(key)
            if (
                raw is None
                or any(
                    raw.get(field) != game.get(field)
                    for field in (
                        "score",
                        "valid",
                        "engineSha256",
                        "status",
                        "asynchronousRejections",
                    )
                )
                or any(
                    raw.get("result", {}).get(field) != game.get("result", {}).get(field)
                    for field in (
                        "winnerSeat",
                        "turnCount",
                        "reason",
                        "timedOut",
                        "errors",
                        "rejections",
                        "projectionChecks",
                    )
                )
            ):
                raise ValueError("Pilot evidence does not match its raw game artifacts")

    gates = sorted((directory / "proposal-gates").glob("proposal-*.json"))
    if len(gates) != len(proposals):
        raise ValueError("Pilot family was not completely evaluated")
    accepted = {program_hash(generic)}
    for number, (path, proposal) in enumerate(zip(gates, proposals, strict=True), 1):
        gate = json.loads(path.read_text(encoding="utf-8"))
        if (
            gate.get("origin") != metadata.get("proposalOrigin", "deterministic-structural")
            or gate.get("apiCalls") != 0
            or gate.get("status") != "evaluated"
            or gate.get("proposalNumber") != number
            or gate.get("program") != proposal["program"]
            or gate.get("control") != generic
            or gate.get("tasks") != splits["gate"]
        ):
            raise ValueError("Pilot screen changed its frozen hypothesis or control")
        check_games(gate["selected"], splits["gate"], proposal["program"])
        check_games(gate["controlGames"], splits["gate"], generic)
        check_raw(gate["selected"])
        check_raw(gate["controlGames"])
        evidence = paired_evidence(
            gate["selected"],
            gate["controlGames"],
            alpha=configuration["screenAlpha"],
            method="wilson-wins",
        )
        if evidence != gate.get("pairedEvidence"):
            raise ValueError("Pilot screen evidence does not reconstruct")
        if evidence["accepted"]:
            accepted.add(program_hash(proposal["program"]))
    result = load("gepa-result.json")
    candidates = [json.loads(candidate["heuristic"]) for candidate in result["candidates"]]
    index = result["best_idx"]
    if (
        not candidates
        or candidates[0] != generic
        or any(program_hash(program) not in accepted for program in candidates)
        or not 0 <= index < len(candidates)
        or selected.get("selectedIndex") != index
        or selected.get("program") != candidates[index]
        or selected.get("candidates") != len(candidates)
        or selected.get("validationScore") != result["val_aggregate_scores"][index]
        or result["val_aggregate_scores"][index] != max(result["val_aggregate_scores"])
        or any(program_hash(program) not in frozen for program in candidates[1:])
    ):
        raise ValueError("Pilot selection does not reconstruct from gated GEPA candidates")
    for candidate_index, program in enumerate(candidates):
        matched = {}
        for game in raw_games.values():
            if game.get("policySha256") != policy_hash(program):
                continue
            task = game.get("task")
            if task not in splits["validation"]:
                continue
            key = json.dumps(task, sort_keys=True)
            if key in matched and matched[key]["score"] != game["score"]:
                raise ValueError("Repeated deterministic pilot task changed its outcome")
            matched[key] = game
        games = [matched.get(json.dumps(task, sort_keys=True), {}) for task in splits["validation"]]
        check_games(games, splits["validation"], program)
        scores = [game["score"] for game in games]
        if (
            sum(scores) / len(scores) != result["val_aggregate_scores"][candidate_index]
            or {str(number): score for number, score in enumerate(scores)}
            != result["val_subscores"][candidate_index]
        ):
            raise ValueError("GEPA pilot validation scores do not reconstruct from raw games")
    distinct = policy_hash(candidates[index]) != policy_hash(generic)
    evidence = None
    if distinct:
        held_out = load("held-out.json")
        check_games(held_out["selected"], splits["held-out"], candidates[index])
        check_games(held_out["control"], splits["held-out"], generic)
        check_raw(held_out["selected"])
        check_raw(held_out["control"])
        evidence = paired_pilot_evidence(
            selected=held_out["selected"],
            control=held_out["control"],
            alpha=configuration["heldOutAlpha"],
        )
        if (
            held_out.get("pairedEvidence") != evidence
            or held_out.get("opponent") != "certified generic residual"
            or held_out.get("freshOpponentDecks") is not True
        ):
            raise ValueError("Held-out pilot evidence does not reconstruct")
    if (
        selected.get("distinct") is not distinct
        or selected.get("activated") is not bool(distinct and evidence["accepted"])
        or selected.get("heldOutEvidence") != evidence
        or selected.get("origin") != metadata.get("proposalOrigin", "deterministic-structural")
        or selected.get("apiCalls") != 0
        or selected.get("proposals") != len(proposals)
        or selected.get("deck") != configuration["deck"]["id"]
        or selected.get("engineSha256") != metadata["engineSha256"]
    ):
        raise ValueError("Pilot activation changed its reconstructed held-out decision")
    return selected
