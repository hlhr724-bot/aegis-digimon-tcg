import hashlib
import json
from pathlib import Path

from audit_pilot_quiescence import audit_pilot_quiescence
from evidence import paired_evidence, policy_hash
from pilot_splits import pilot_splits


def audit_terminal_pilot_wave(*, root: Path, failure: dict) -> dict:
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    provenance = json.loads((root / "source-provenance.json").read_text(encoding="utf-8"))
    worker = json.loads((root / "worker-metadata.json").read_text(encoding="utf-8"))
    metadata = manifest["metadata"]
    for name, expected in (
        ("source.tgz", provenance["sourceArchiveSha256"]),
        ("runtime.tgz", provenance["runtimeArchiveSha256"]),
    ):
        with (root / name).open("rb") as source:
            if hashlib.file_digest(source, "sha256").hexdigest() != expected:
                raise ValueError("Initial pilot source/runtime archive changed")
    if (
        provenance["engineSha256"] != metadata["engineSha256"]
        or worker["engineSha256"] != metadata["engineSha256"]
        or failure.get("kind") != "infrastructure-failure-abandonment"
        or type(failure.get("orchestratorExitCode")) is not int
        or failure.get("orchestratorExitCode") in (None, 0)
    ):
        raise ValueError("Require a terminal infrastructure failure and matching frozen runtime")
    audit_pilot_quiescence(record=failure)
    log = Path(failure["log"])
    content = log.read_bytes()
    if hashlib.sha256(content).hexdigest() != failure["logSha256"] or not any(
        message in content
        for message in (
            b"No space left on device",
            b"Read-only file system",
            b"Input/output error",
        )
    ):
        raise ValueError("Missing immutable infrastructure-failure evidence")
    decks = [deck["id"] for deck in manifest["decks"]]
    if len(decks) != 24 or len(set(decks)) != 24:
        raise ValueError("Initial terminal audit requires all 24 configured deck identities")
    status = {}
    for ordinal, deck in enumerate(manifest["decks"]):
        directory = root / "pilots" / deck["id"]
        if not directory.is_dir():
            status[deck["id"]] = {"status": "unstarted", "played": 0, "invalid": 0}
            continue
        splits = pilot_splits(
            deck=deck["id"],
            pool=decks,
            generic=metadata["generic"],
            ordinal=ordinal,
            pairs=manifest["pairs"],
            gate_pairs=manifest["gatePairs"],
            held_out_pairs=manifest["heldOutPairs"],
            seed_offset=manifest["seedOffset"],
            held_out_seeds=manifest["heldOutSeedPlans"][deck["id"]],
        )
        configuration = {
            "deck": deck,
            "metadata": metadata,
            "splits": splits,
            "screenAlpha": manifest["screenAlphaPerHypothesis"],
            "heldOutAlpha": manifest["heldOutAlphaPerDeck"],
        }
        protocol = directory / "protocol.json"
        if (
            not protocol.is_file()
            or json.loads(protocol.read_text(encoding="utf-8")) != configuration
        ):
            raise ValueError("Initial partial pilot changed its frozen protocol")
        programs = [metadata["generic"], *[item["program"] for item in deck["proposals"]]]
        policies = {policy_hash(program) for program in programs}
        tasks = {json.dumps(task, sort_keys=True) for batch in splits.values() for task in batch}
        counts = {"played": 0, "invalid": 0}
        raw_games = {}
        for path in (directory / "games").glob("*.json"):
            game = json.loads(path.read_text(encoding="utf-8"))
            if (
                game.get("policySha256") not in policies
                or game.get("engineSha256") != metadata["engineSha256"]
                or json.dumps(game.get("task"), sort_keys=True) not in tasks
            ):
                raise ValueError("Partial evidence changed engine, policy or frozen task")
            identity = (game["policySha256"], json.dumps(game["task"], sort_keys=True))
            if identity in raw_games and any(
                raw_games[identity].get(field) != game.get(field)
                for field in ("score", "valid", "status", "engineSha256")
            ):
                raise ValueError("Repeated deterministic partial task changed its outcome")
            raw_games[identity] = game
            if game.get("valid") is True:
                result = game.get("result", {})
                winner = result.get("winnerSeat")
                expected = 0.5 if winner is None else int(winner == game["task"]["learnerSeat"])
                if (
                    game.get("score") != expected
                    or type(game.get("score")) not in (int, float)
                    or (winner is not None and (type(winner) is not int or winner not in (0, 1)))
                    or game.get("status") != "played"
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
                    raise ValueError("Partial played evidence has invalid health or score")
                counts["played"] += 1
            elif game.get("score") is not None or game.get("status") not in (
                "invalid",
                "timed-out",
            ):
                raise ValueError("Invalid partial evidence cannot be scored as a loss")
            else:
                counts["invalid"] += 1
        completed = (directory / "selected.json").is_file()
        gates = sorted((directory / "proposal-gates").glob("proposal-*.json"))
        if not completed and not gates:
            raise ValueError("No reserved non-resumable proposal proves terminal abandonment")
        if len(gates) > len(deck["proposals"]):
            raise ValueError("Partial pilot consumed an unallocated hypothesis")
        if not raw_games:
            raise ValueError("Terminal stages require preserved raw game evidence")
        if completed:
            selected = json.loads((directory / "selected.json").read_text(encoding="utf-8"))
            if (
                not (directory / "gepa-result.json").is_file()
                or len(gates) != len(deck["proposals"])
                or selected.get("engineSha256") != metadata["engineSha256"]
                or selected.get("deck") != deck["id"]
                or selected.get("proposals") != len(deck["proposals"])
                or selected.get("configurationSha256")
                != hashlib.sha256(json.dumps(configuration, sort_keys=True).encode()).hexdigest()
            ):
                raise ValueError("Completed terminal stage is missing frozen selection evidence")
        for number, path in enumerate(gates, 1):
            gate = json.loads(path.read_text(encoding="utf-8"))
            if (
                path.name != f"proposal-{number:04d}.json"
                or gate.get("origin") != "deterministic-structural"
                or gate.get("apiCalls") != 0
                or gate.get("proposalNumber") != number
                or gate.get("program") != deck["proposals"][number - 1]["program"]
                or gate.get("control") != metadata["generic"]
                or gate.get("tasks") != splits["gate"]
                or gate.get("status") not in ("reserved", "evaluated")
            ):
                raise ValueError("Partial proposal changed its frozen reservation")
            if gate["status"] == "evaluated":
                for arm, program in (
                    ("selected", gate["program"]),
                    ("controlGames", metadata["generic"]),
                ):
                    games = gate[arm]
                    if [game.get("task") for game in games] != splits["gate"]:
                        raise ValueError("Partial gate changed its frozen task order")
                    for game in games:
                        identity = (policy_hash(program), json.dumps(game["task"], sort_keys=True))
                        raw = raw_games.get(identity)
                        if (
                            raw is None
                            or any(
                                raw.get(field) != game.get(field)
                                for field in (
                                    "score",
                                    "valid",
                                    "status",
                                    "engineSha256",
                                    "asynchronousRejections",
                                )
                            )
                            or any(
                                raw.get("result", {}).get(field)
                                != game.get("result", {}).get(field)
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
                            or game.get("valid") is not True
                        ):
                            raise ValueError(
                                "Partial evaluated gate does not match healthy raw games"
                            )
                if gate.get("pairedEvidence") != paired_evidence(
                    gate["selected"],
                    gate["controlGames"],
                    alpha=manifest["screenAlphaPerHypothesis"],
                    method="wilson-wins",
                ):
                    raise ValueError("Partial gate evidence does not reconstruct")
        status[deck["id"]] = {
            "status": "completed" if completed else "non-resumable-partial",
            **counts,
            "reservedProposals": len(gates),
        }
    if not any(item["status"] == "non-resumable-partial" for item in status.values()):
        raise ValueError("A non-resumable failed stage is required for abandonment")
    return {
        "kind": "infrastructure-failure-abandonment",
        "configuredDecks": 24,
        "completedDecks": sum(item["status"] == "completed" for item in status.values()),
        "decks": status,
        "failure": failure,
        "invalidGamesScored": False,
        "retainedActivationAlpha": 0.05 / 3,
    }
