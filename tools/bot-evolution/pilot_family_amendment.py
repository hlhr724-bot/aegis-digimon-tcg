import fcntl
import hashlib
import json
from copy import deepcopy
from pathlib import Path
from typing import Literal

from audit_pilot_quiescence import audit_pilot_quiescence
from audit_terminal_pilot_wave import audit_terminal_pilot_wave
from evidence import policy_hash
from pilot_splits import pilot_splits


def _hash(path: Path) -> str:
    if not path.is_file():
        raise ValueError(f"Missing frozen pilot family artifact: {path}")
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def _digest(value: dict) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


def _load(path: Path) -> dict:
    if not path.is_file():
        raise ValueError(f"Missing frozen pilot family artifact: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def _proofs(root: Path) -> dict[str, str]:
    paths = [path for path in root.rglob("*") if path.is_file()]
    return {str(path.relative_to(root)): _hash(path) for path in sorted(paths)}


def _create(path: Path, value: dict) -> None:
    content = json.dumps(value, indent=2) + "\n"
    if path.is_file():
        if path.read_text(encoding="utf-8") != content:
            raise ValueError("An immutable pilot family record cannot change")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(content, encoding="utf-8")
    temporary.replace(path)


def _validate_definition(definition: dict) -> None:
    initial = definition["initialFamily"]
    registry = _load(Path(initial["registry"]))
    manifest = _load(Path(initial["manifest"]))
    root = Path(initial["manifest"]).parent
    quiescence = definition.get("quiescence", {})
    if definition["metadata"].get("desktopWslArgs", []) not in (
        [],
        ["--system", "-d", "Ubuntu"],
    ) or quiescence.get("desktopWslArgs", []) != definition["metadata"].get("desktopWslArgs", []):
        raise ValueError("Frozen process audit and worker must share the exact WSL transport")
    audit_pilot_quiescence(record=quiescence)
    provenance = _load(root / "source-provenance.json")
    worker = _load(root / "worker-metadata.json")
    if (
        _hash(root / "source.tgz") != provenance["sourceArchiveSha256"]
        or _hash(root / "runtime.tgz") != provenance["runtimeArchiveSha256"]
        or provenance["engineSha256"] != manifest["metadata"]["engineSha256"]
        or worker["engineSha256"] != manifest["metadata"]["engineSha256"]
    ):
        raise ValueError("Initial frozen source/runtime identity changed")
    if (
        definition.get("schemaVersion") != 2
        or definition.get("origin") != "deterministic-bounded-combo"
        or registry["family"]["maximumWaves"] != 3
        or len(registry["reservations"]) != 1
        or registry["reservations"][0]["attempt"] != 1
        or registry["reservations"][0]["runDirectory"] != str(root.resolve())
        or registry["reservations"][0]["heldOutSeeds"] != manifest["heldOutSeedPlans"]
        or registry["reservations"][0]["seedDomain"]
        != [
            1_500_000_000 + manifest["seedOffset"],
            1_600_000_000 + manifest["seedOffset"],
        ]
        or manifest["family"]
        != {**registry["family"], "registry": initial["registry"], "attempt": 1}
        or [deck["id"] for deck in manifest["decks"]] != registry["family"]["decks"]
        or manifest["family"]["attempt"] != 1
        or initial["retiredAttempts"] != [2, 3]
        or initial["proofHashes"] != _proofs(root)
        or initial["registrySha256"] != _hash(Path(initial["registry"]))
        or initial["manifestSha256"] != _hash(Path(initial["manifest"]))
        or definition["totalActivationAlpha"] != 0.05
        or definition["retainedInitialAlpha"] != 0.05 / 3
        or definition["extensionAlpha"] != 0.05 * 2 / 3
        or definition["maximumWaves"] != 2
        or definition["metadata"].get("proposalOrigin") != "deterministic-bounded-combo"
        or definition["metadata"].get("proposalGrid") != [4, 8, 12]
        or not definition["metadata"].get("runnerSha256")
        or not definition["metadata"].get("engineSha256")
        or len(definition["targets"]) != 3
        or len({deck["id"] for deck in definition["targets"]}) != 3
        or {deck["id"] for deck in definition["targets"]}
        != {
            "ex4-dgo-2022-06-25-1-ulforceveedramon@1",
            "ex6-dgo-2024-07-06-1-miragegaogamon@2",
            "bt25-dgo-2026-06-06-4-shinegreymon@1",
        }
        or len(definition["matchupPool"]) != 24
        or len(set(definition["matchupPool"])) != 24
        or definition["matchupPool"] != registry["family"]["decks"]
        or policy_hash(definition["metadata"]["generic"])
        != registry["family"]["genericPolicySha256"]
        or sum(len(deck["proposals"]) for deck in definition["targets"])
        != definition["hypothesesPerWave"]
        or definition["hypothesesPerWave"] != 18
        or definition["heldOutAlphaPerDeck"] != definition["extensionAlpha"] / (2 * 3)
        or definition["screenAlphaPerHypothesis"]
        != definition["extensionAlpha"] / (2 * definition["hypothesesPerWave"])
        or len(definition["waves"]) != 2
        or len({wave["runDirectory"] for wave in definition["waves"]}) != 2
    ):
        raise ValueError("Pilot amendment changed its frozen evidence or conserved alpha budget")
    targets = {deck["id"] for deck in definition["targets"]}
    terminal = initial.get("terminalAudit")
    if terminal is not None:
        if terminal != audit_terminal_pilot_wave(root=root, failure=terminal["failure"]):
            raise ValueError("Initial infrastructure-abandonment audit changed")
    else:
        summary = _load(root / "summary.json")
        if (
            summary.get("configuredDecks") != 24
            or summary.get("completedDecks") != 24
            or set(summary.get("results", {})) != set(definition["matchupPool"])
        ):
            raise ValueError(
                "Complete and audit the initial wave or prove terminal infrastructure failure"
            )
    if not targets <= set(definition["matchupPool"]):
        raise ValueError("Complete and audit the entire initial wave before closing its family")
    generic = definition["metadata"]["generic"]
    for deck in definition["targets"]:
        old = next(item for item in manifest["decks"] if item["id"] == deck["id"])
        if old.get("sha256") != deck.get("sha256") or old.get("deck") != deck.get("deck"):
            raise ValueError("Combo target changed its exact original deck multiset")
        programs = [entry["program"] for entry in deck["proposals"]]
        if len(programs) != 6 or len({policy_hash(program) for program in programs}) != 6:
            raise ValueError("Each combo target requires six distinct frozen hypotheses")
        for program in programs:
            rule = program["rules"][-1]
            when = rule.get("when", {})
            if (
                program.get("basePolicy") != generic.get("basePolicy")
                or program["rules"][:-1] != generic["rules"]
                or rule.get("weight") not in (4, 8, 12)
                or not rule.get("advice")
                or when.get("kind") != "main"
                or not when.get("sourceCardIds")
                or not (when.get("ownBoard") or when.get("ownHand"))
            ):
                raise ValueError(
                    "Combo policies must preserve generic and append one bounded public rule"
                )
    prior_seeds = set()
    for ordinal, deck in enumerate(manifest["decks"]):
        splits = pilot_splits(
            deck=deck["id"],
            pool=registry["family"]["decks"],
            generic=manifest["metadata"]["generic"],
            ordinal=ordinal,
            pairs=manifest["pairs"],
            gate_pairs=manifest["gatePairs"],
            held_out_pairs=manifest["heldOutPairs"],
            seed_offset=manifest["seedOffset"],
            held_out_seeds=manifest["heldOutSeedPlans"][deck["id"]],
        )
        prior_seeds.update(task["seed"] for tasks in splits.values() for task in tasks)
    occupied = prior_seeds
    for number, wave in enumerate(definition["waves"], 1):
        seeds = [seed for values in wave["heldOutSeedPlans"].values() for seed in values]
        if (
            wave["attempt"] != number
            or (wave["pairs"], wave["gatePairs"], wave["heldOutPairs"])
            != ((96, 384, 2400) if number == 1 else (192, 768, 9600))
            or wave["seedOffset"] != 1_400_000_000 + number * 100_000_000
            or set(wave["heldOutSeedPlans"]) != targets
            or len(set(seeds)) != len(seeds)
            or len(seeds) != 3 * wave["heldOutPairs"]
        ):
            raise ValueError("Extension waves require fixed globally unique held-out seed plans")
        for deck in definition["targets"]:
            splits = pilot_splits(
                deck=deck["id"],
                pool=definition["matchupPool"],
                generic=definition["metadata"]["generic"],
                ordinal=definition["matchupPool"].index(deck["id"]),
                pairs=wave["pairs"],
                gate_pairs=wave["gatePairs"],
                held_out_pairs=wave["heldOutPairs"],
                seed_offset=wave["seedOffset"],
                held_out_seeds=wave["heldOutSeedPlans"][deck["id"]],
            )
            identities = {name: _digest({"tasks": tasks}) for name, tasks in splits.items()}
            if wave["splitSha256"][deck["id"]] != identities:
                raise ValueError("Extension split identities changed")
            for tasks in splits.values():
                actual = {task["seed"] for task in tasks}
                if occupied & actual:
                    raise ValueError("Extension training and held-out seeds overlap prior plans")
                occupied.update(actual)


def pilot_family_amendment(
    *,
    ledger: Path,
    action: Literal["initialize", "reserve", "audit"],
    definition: dict | None = None,
    attempt: int | None = None,
    run_dir: Path | None = None,
) -> dict:
    ledger.parent.mkdir(parents=True, exist_ok=True)
    with ledger.with_suffix(ledger.suffix + ".lock").open("a", encoding="utf-8") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if action == "initialize":
            if definition is None:
                raise ValueError("Freeze an explicit amendment before consuming its budget")
            definition = deepcopy(definition)
            initial = definition["initialFamily"]
            initial.setdefault("registrySha256", _hash(Path(initial["registry"])))
            initial.setdefault("manifestSha256", _hash(Path(initial["manifest"])))
            initial.setdefault("proofHashes", _proofs(Path(initial["manifest"]).parent))
            for wave in definition["waves"]:
                wave.setdefault(
                    "splitSha256",
                    {
                        deck["id"]: {
                            name: _digest({"tasks": tasks})
                            for name, tasks in pilot_splits(
                                deck=deck["id"],
                                pool=definition["matchupPool"],
                                generic=definition["metadata"]["generic"],
                                ordinal=definition["matchupPool"].index(deck["id"]),
                                pairs=wave["pairs"],
                                gate_pairs=wave["gatePairs"],
                                held_out_pairs=wave["heldOutPairs"],
                                seed_offset=wave["seedOffset"],
                                held_out_seeds=wave["heldOutSeedPlans"][deck["id"]],
                            ).items()
                        }
                        for deck in definition["targets"]
                    },
                )
            _validate_definition(definition)
            _create(ledger.with_suffix(ledger.suffix + ".prepared.json"), definition)
            initial = definition["initialFamily"]
            prior = Path(initial["registry"])
            with prior.with_suffix(prior.suffix + ".lock").open(
                "a", encoding="utf-8"
            ) as prior_lock:
                fcntl.flock(prior_lock, fcntl.LOCK_EX)
                _validate_definition(definition)
                closure = {
                    "schemaVersion": 2,
                    "registry": initial["registry"],
                    "registrySha256": initial["registrySha256"],
                    "manifest": initial["manifest"],
                    "manifestSha256": initial["manifestSha256"],
                    "retiredAttempts": [2, 3],
                    "retainedInitialAlpha": 0.05 / 3,
                    "amendment": str(ledger.absolute()),
                    "amendmentSha256": _digest(definition),
                }
                _create(prior.with_suffix(prior.suffix + ".closure.json"), closure)
                _create(prior.with_suffix(prior.suffix + ".amendment.json"), closure)
                _create(ledger, definition)
        frozen = _load(ledger)
        if _load(ledger.with_suffix(ledger.suffix + ".prepared.json")) != frozen:
            raise ValueError("Prepared pilot family allocation changed")
        _validate_definition(frozen)
        initial = frozen["initialFamily"]
        prior = Path(initial["registry"])
        closure = _load(prior.with_suffix(prior.suffix + ".closure.json"))
        if (
            _load(prior.with_suffix(prior.suffix + ".amendment.json")) != closure
            or closure["schemaVersion"] != 2
            or closure["retainedInitialAlpha"] != frozen["retainedInitialAlpha"]
            or closure["registry"] != initial["registry"]
            or closure["manifest"] != initial["manifest"]
            or closure["amendment"] != str(ledger.absolute())
            or closure["amendmentSha256"] != _digest(frozen)
            or closure["registrySha256"] != initial["registrySha256"]
            or closure["manifestSha256"] != initial["manifestSha256"]
            or closure["retiredAttempts"] != [2, 3]
        ):
            raise ValueError("Pilot family closure changed its immutable allocation")
        receipts = ledger.with_suffix(ledger.suffix + ".waves")
        for path in receipts.glob("*.json"):
            record = _load(path)
            number = record.get("attempt")
            if number not in (1, 2) or path.name != f"wave-{number}.json":
                raise ValueError("Unallocated extension wave receipt")
            wave = frozen["waves"][number - 1]
            if record != {
                "attempt": number,
                "runDirectory": wave["runDirectory"],
                "amendmentSha256": _digest(frozen),
                "waveSha256": _digest(wave),
                "activationAlpha": frozen["extensionAlpha"] / 2,
            }:
                raise ValueError("Extension wave authorization changed")
        if action in ("reserve", "audit") and attempt is not None:
            if attempt not in (1, 2) or run_dir is None:
                raise ValueError("Only the two allocated extension waves can execute")
            wave = frozen["waves"][attempt - 1]
            if wave["runDirectory"] != str(run_dir.absolute()):
                raise ValueError("Extension reservation changed its frozen run directory")
            receipt = {
                "attempt": attempt,
                "runDirectory": wave["runDirectory"],
                "amendmentSha256": _digest(frozen),
                "waveSha256": _digest(wave),
                "activationAlpha": frozen["extensionAlpha"] / 2,
            }
            receipt_path = ledger.with_suffix(ledger.suffix + ".waves") / f"wave-{attempt}.json"
            if action == "reserve":
                _create(receipt_path, receipt)
            elif _load(receipt_path) != receipt:
                raise ValueError("Extension wave authorization changed")
        return frozen
