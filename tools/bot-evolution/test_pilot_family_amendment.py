import hashlib
import json
from copy import deepcopy
from pathlib import Path

import pytest

from audit_pilot_catalog import audit_pilot_catalog
from audit_pilot_family import audit_pilot_family
from audit_terminal_pilot_wave import audit_terminal_pilot_wave
from evidence import policy_hash
from pilot_family_amendment import pilot_family_amendment
from pilot_splits import pilot_splits
from reserve_pilot_family import reserve_pilot_family


@pytest.fixture
def frozen_family(tmp_path):
    targets = [
        "ex4-dgo-2022-06-25-1-ulforceveedramon@1",
        "ex6-dgo-2024-07-06-1-miragegaogamon@2",
        "bt25-dgo-2026-06-06-4-shinegreymon@1",
    ]
    pool = targets + [f"other-{number}@1" for number in range(21)]
    generic = {
        "schemaVersion": 1,
        "basePolicy": "projected-balanced",
        "title": "Generic",
        "rules": [{"feature": "sourceDp", "weight": 0.2, "advice": "Prefer DP."}],
    }
    root = tmp_path / "initial"
    root.mkdir()
    registry = tmp_path / "family.json"
    plans = {
        deck: list(range(1_500_000_000 + index * 24, 1_500_000_000 + (index + 1) * 24))
        for index, deck in enumerate(pool)
    }
    family = reserve_pilot_family(
        registry=registry,
        run_dir=root,
        attempt=1,
        engine="old-engine",
        generic=policy_hash(generic),
        decks=pool,
        proposals=24,
        seed_offset=0,
        held_out_seeds=plans,
    )
    pilot = deepcopy(generic)
    pilot["rules"].append(
        {
            "feature": "playTamer",
            "weight": 1,
            "advice": "Develop a Tamer.",
            "when": {"kind": "main", "sourceCardIds": ["BT1-085"]},
        }
    )
    decks = [{"id": deck, "proposals": [{"strategy": "tamer", "program": pilot}]} for deck in pool]
    metadata = {"engineSha256": "old-engine", "generic": generic}
    manifest = {
        "decks": decks,
        "metadata": metadata,
        "pairs": 24,
        "gatePairs": 24,
        "heldOutPairs": 24,
        "seedOffset": 0,
        "heldOutSeedPlans": plans,
        "family": family,
        "screenAlphaPerHypothesis": family["screenAlphaPerHypothesis"],
        "heldOutAlphaPerDeck": family["heldOutAlphaPerDeck"],
    }
    (root / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    for name in ("source.tgz", "runtime.tgz"):
        (root / name).write_bytes(name.encode())
    provenance = {
        "engineSha256": "old-engine",
        "sourceArchiveSha256": hashlib.sha256(b"source.tgz").hexdigest(),
        "runtimeArchiveSha256": hashlib.sha256(b"runtime.tgz").hexdigest(),
    }
    (root / "source-provenance.json").write_text(json.dumps(provenance), encoding="utf-8")
    (root / "worker-metadata.json").write_text(json.dumps(metadata), encoding="utf-8")
    splits = pilot_splits(
        deck=targets[0],
        pool=pool,
        generic=generic,
        ordinal=0,
        pairs=24,
        gate_pairs=24,
        held_out_pairs=24,
        held_out_seeds=plans[targets[0]],
    )
    directory = root / "pilots" / targets[0]
    (directory / "proposal-gates").mkdir(parents=True)
    configuration = {
        "deck": decks[0],
        "metadata": metadata,
        "splits": splits,
        "screenAlpha": family["screenAlphaPerHypothesis"],
        "heldOutAlpha": family["heldOutAlphaPerDeck"],
    }
    (directory / "protocol.json").write_text(json.dumps(configuration), encoding="utf-8")
    reservation = {
        "origin": "deterministic-structural",
        "proposalNumber": 1,
        "program": pilot,
        "control": generic,
        "tasks": splits["gate"],
        "status": "reserved",
        "apiCalls": 0,
    }
    (directory / "proposal-gates/proposal-0001.json").write_text(
        json.dumps(reservation), encoding="utf-8"
    )
    (directory / "games").mkdir()
    task = splits["train"][0]
    game = {
        "task": task,
        "policySha256": policy_hash(generic),
        "engineSha256": "old-engine",
        "valid": True,
        "score": 1,
        "status": "played",
        "asynchronousRejections": [],
        "result": {
            "winnerSeat": 0,
            "reason": "security",
            "timedOut": False,
            "errors": [],
            "rejections": [],
            "projectionChecks": 1,
            "seats": [{"inferenceFallbacks": {"error": 0, "timeout": 0}}] * 2,
        },
    }
    (directory / "games/played.json").write_text(json.dumps(game), encoding="utf-8")
    log = root / "run-all.log"
    log.write_text("OSError: [Errno 28] No space left on device", encoding="utf-8")
    quiescence = {}
    for machine in ("local", "desktop"):
        snapshot = "1 /sbin/init\n2 ps -eo pid=,args=\n"
        quiescence[f"{machine}Processes"] = snapshot
        quiescence[f"{machine}ProcessesSha256"] = hashlib.sha256(snapshot.encode()).hexdigest()
    local_raw = "1 0 /sbin/init\n2 1 ps -eo pid=,args=\n999 1 python learn_combo_pilots.py\n"
    local_filtered = "2 1 ps -eo pid=,args="
    quiescence.update(
        localProcesses=local_filtered,
        localProcessesSha256=hashlib.sha256(local_filtered.encode()).hexdigest(),
        localProcessesRaw=local_raw,
        localProcessesRawSha256=hashlib.sha256(local_raw.encode()).hexdigest(),
        localSnapshotPid=999,
        excludedLocalProcessIds=[1, 999],
    )
    failure = {
        "kind": "infrastructure-failure-abandonment",
        "orchestratorExitCode": 1,
        "log": str(log),
        "logSha256": hashlib.sha256(log.read_bytes()).hexdigest(),
        **quiescence,
    }
    terminal = audit_terminal_pilot_wave(root=root, failure=failure)
    proposals = []
    for feature in ("playTamer", "digivolve"):
        for weight in (4, 8, 12):
            program = deepcopy(generic)
            program["rules"].append(
                {
                    "feature": feature,
                    "weight": weight,
                    "advice": "Develop the public combo.",
                    "when": {
                        "kind": "main",
                        "sourceCardIds": ["BT1-085"],
                        "ownHand": {"cardIds": ["BT1-085"], "minimum": 1},
                    },
                }
            )
            proposals.append({"strategy": f"{feature}-{weight}", "program": program})
    waves = []
    for number, counts in enumerate(((96, 384, 2400), (192, 768, 9600)), 1):
        start = 2_900_000_000 + number * 100_000_000
        waves.append(
            {
                "attempt": number,
                "runDirectory": str(tmp_path / f"wave-{number}"),
                "seedOffset": 1_400_000_000 + number * 100_000_000,
                "pairs": counts[0],
                "gatePairs": counts[1],
                "heldOutPairs": counts[2],
                "heldOutSeedPlans": {
                    deck: list(range(start + index * counts[2], start + (index + 1) * counts[2]))
                    for index, deck in enumerate(targets)
                },
            }
        )
    definition = {
        "schemaVersion": 2,
        "origin": "deterministic-bounded-combo",
        "initialFamily": {
            "registry": str(registry),
            "manifest": str(root / "manifest.json"),
            "retiredAttempts": [2, 3],
            "terminalAudit": terminal,
        },
        "quiescence": quiescence,
        "totalActivationAlpha": 0.05,
        "retainedInitialAlpha": 0.05 / 3,
        "extensionAlpha": 0.05 * 2 / 3,
        "maximumWaves": 2,
        "targets": [{"id": deck, "proposals": deepcopy(proposals)} for deck in targets],
        "matchupPool": pool,
        "metadata": {
            "generic": generic,
            "proposalOrigin": "deterministic-bounded-combo",
            "proposalGrid": [4, 8, 12],
            "runnerSha256": "runner",
            "engineSha256": "new-engine",
        },
        "hypothesesPerWave": 18,
        "heldOutAlphaPerDeck": (0.05 * 2 / 3) / 6,
        "screenAlphaPerHypothesis": (0.05 * 2 / 3) / 36,
        "waves": waves,
    }
    return {
        "ledger": tmp_path / "amendment.json",
        "definition": definition,
        "root": root,
        "failure": failure,
        "registry": registry,
        "directory": directory,
    }


def test_amendment_preserves_old_proofs_charges_failure_and_reserves_both_frozen_waves(
    frozen_family,
):
    values = frozen_family
    before = {str(path): path.read_bytes() for path in values["root"].rglob("*") if path.is_file()}
    before[str(values["registry"])] = values["registry"].read_bytes()
    frozen = pilot_family_amendment(
        ledger=values["ledger"], action="initialize", definition=values["definition"]
    )
    assert frozen["initialFamily"]["terminalAudit"]["completedDecks"] == 0
    assert frozen["initialFamily"]["terminalAudit"]["configuredDecks"] == 24
    assert frozen["retainedInitialAlpha"] + frozen["extensionAlpha"] == 0.05
    assert 6 * frozen["heldOutAlphaPerDeck"] == frozen["extensionAlpha"]
    assert all(Path(name).read_bytes() == content for name, content in before.items())
    for number in (1, 2):
        directory = values["ledger"].parent / f"wave-{number}"
        pilot_family_amendment(
            ledger=values["ledger"], action="reserve", attempt=number, run_dir=directory
        )
        assert (
            pilot_family_amendment(
                ledger=values["ledger"], action="audit", attempt=number, run_dir=directory
            )
            == frozen
        )
    for number in (2, 3):
        with pytest.raises(ValueError, match="retired"):
            audit_pilot_family(registry=values["registry"], attempt=number)
    with pytest.raises(ValueError, match="allocated"):
        pilot_family_amendment(
            ledger=values["ledger"], action="reserve", attempt=3, run_dir=values["root"]
        )


@pytest.mark.parametrize(
    "mutation", ("alpha", "targets", "seeds", "source", "live", "raw", "reservation")
)
def test_amendment_refuses_budget_reset_seed_reuse_missing_proof_or_unhealthy_partial(
    frozen_family, mutation
):
    values = frozen_family
    definition = values["definition"]
    if mutation == "alpha":
        definition["extensionAlpha"] = 0.05
    elif mutation == "targets":
        definition["targets"].pop()
    elif mutation == "seeds":
        plans = definition["waves"][0]["heldOutSeedPlans"]
        ids = list(plans)
        plans[ids[1]][0] = plans[ids[0]][0]
    elif mutation == "source":
        (values["root"] / "source.tgz").write_bytes(b"changed")
    elif mutation == "live":
        definition["quiescence"]["desktopProcesses"] = "4 node evaluateCli.js"
    elif mutation == "raw":
        path = values["directory"] / "games/played.json"
        raw = json.loads(path.read_text(encoding="utf-8"))
        raw.update(valid=False, status="invalid", score=0)
        path.write_text(json.dumps(raw), encoding="utf-8")
    else:
        (values["directory"] / "proposal-gates/proposal-0001.json").unlink()
    with pytest.raises(ValueError):
        pilot_family_amendment(ledger=values["ledger"], action="initialize", definition=definition)
    assert not values["ledger"].is_file()
    assert not values["registry"].with_suffix(".json.closure.json").is_file()


@pytest.mark.parametrize("artifact", ("registry", "proof", "closure", "receipt", "runner"))
def test_frozen_amendment_and_catalog_authorization_refuse_artifact_tampering(
    frozen_family, artifact
):
    values = frozen_family
    frozen = pilot_family_amendment(
        ledger=values["ledger"], action="initialize", definition=values["definition"]
    )
    run_dir = values["ledger"].parent / "wave-1"
    pilot_family_amendment(ledger=values["ledger"], action="reserve", attempt=1, run_dir=run_dir)
    if artifact == "registry":
        values["registry"].write_text("{}", encoding="utf-8")
    elif artifact == "proof":
        (values["directory"] / "games/played.json").write_text("{}", encoding="utf-8")
    elif artifact == "closure":
        values["registry"].with_suffix(".json.closure.json").unlink()
    elif artifact == "receipt":
        path = values["ledger"].with_suffix(".json.waves") / "wave-3.json"
        path.write_text(json.dumps({"attempt": 3}), encoding="utf-8")
    else:
        authorization = {
            "amendment": str(values["ledger"]),
            "attempt": 1,
            "runDirectory": str(run_dir),
            "amendmentSha256": hashlib.sha256(
                json.dumps(frozen, sort_keys=True).encode()
            ).hexdigest(),
        }
        metadata = {
            **frozen["metadata"],
            "runnerSha256": "tampered",
            "evaluationCache": str(run_dir / "cache"),
            "pilotFamilyAuthorization": authorization,
        }
        with pytest.raises(ValueError, match="metadata"):
            audit_pilot_family(
                directory=run_dir / "pilots" / frozen["targets"][0]["id"], metadata=metadata
            )
        return
    with pytest.raises((ValueError, KeyError)):
        pilot_family_amendment(ledger=values["ledger"], action="audit", attempt=1, run_dir=run_dir)
    if artifact == "closure":
        with pytest.raises(ValueError, match="closure"):
            audit_pilot_family(registry=values["registry"], attempt=2)


def test_terminal_failure_reports_invalid_separately_and_refuses_missing_log_or_live_worker(
    frozen_family,
):
    values = frozen_family
    path = values["directory"] / "games/played.json"
    raw = json.loads(path.read_text(encoding="utf-8"))
    raw.update(valid=False, status="timed-out", score=None)
    path.write_text(json.dumps(raw), encoding="utf-8")
    report = audit_terminal_pilot_wave(root=values["root"], failure=values["failure"])
    partial = report["decks"][values["directory"].name]
    assert partial["status"] == "non-resumable-partial"
    assert partial["played"] == 0 and partial["invalid"] == 1
    assert report["invalidGamesScored"] is False
    failure = deepcopy(values["failure"])
    failure["desktopProcesses"] = "4 node evaluateCli.js"
    failure["desktopProcessesSha256"] = hashlib.sha256(
        failure["desktopProcesses"].encode()
    ).hexdigest()
    with pytest.raises(ValueError, match="live workers"):
        audit_terminal_pilot_wave(root=values["root"], failure=failure)
    (values["root"] / "run-all.log").write_text("No game error", encoding="utf-8")
    with pytest.raises(ValueError, match="infrastructure-failure"):
        audit_terminal_pilot_wave(root=values["root"], failure=values["failure"])


@pytest.mark.parametrize("field", ("deck", "proposals", "splits", "screenAlpha", "heldOutAlpha"))
def test_family_authorization_binds_the_entire_training_and_activation_configuration(
    frozen_family, field
):
    values = frozen_family
    frozen = pilot_family_amendment(
        ledger=values["ledger"], action="initialize", definition=values["definition"]
    )
    wave = frozen["waves"][0]
    run_dir = Path(wave["runDirectory"])
    pilot_family_amendment(ledger=values["ledger"], action="reserve", attempt=1, run_dir=run_dir)
    authorization = {
        "amendment": str(values["ledger"]),
        "attempt": 1,
        "runDirectory": str(run_dir),
        "amendmentSha256": hashlib.sha256(json.dumps(frozen, sort_keys=True).encode()).hexdigest(),
    }
    deck = frozen["targets"][0]
    configuration = {
        "deck": deepcopy(deck),
        "metadata": {
            **frozen["metadata"],
            "evaluationCache": str(run_dir / "cache"),
            "pilotFamilyAuthorization": authorization,
        },
        "splits": pilot_splits(
            deck=deck["id"],
            pool=frozen["matchupPool"],
            generic=frozen["metadata"]["generic"],
            ordinal=0,
            pairs=wave["pairs"],
            gate_pairs=wave["gatePairs"],
            held_out_pairs=wave["heldOutPairs"],
            seed_offset=wave["seedOffset"],
            held_out_seeds=wave["heldOutSeedPlans"][deck["id"]],
        ),
        "screenAlpha": frozen["screenAlphaPerHypothesis"],
        "heldOutAlpha": frozen["heldOutAlphaPerDeck"],
    }
    directory = run_dir / "pilots" / deck["id"]
    audit_pilot_family(directory=directory, configuration=configuration)
    if field == "deck":
        configuration["deck"]["id"] = frozen["targets"][1]["id"]
    elif field == "proposals":
        configuration["deck"]["proposals"].pop()
    elif field == "splits":
        configuration["splits"]["held-out"][0]["seed"] += 1
    else:
        configuration[field] = 0.5
    with pytest.raises(ValueError, match="configuration"):
        audit_pilot_family(directory=directory, configuration=configuration)


def test_copied_legacy_evidence_without_family_provenance_has_no_activation_authority(tmp_path):
    with pytest.raises(ValueError, match="manifest and registry"):
        audit_pilot_family(directory=tmp_path / "copied-pilot", configuration={"metadata": {}})


def test_subset_catalog_requires_receipt_full_frozen_family_and_only_audited_activated_pilots(
    frozen_family,
):
    values = frozen_family
    frozen = pilot_family_amendment(
        ledger=values["ledger"], action="initialize", definition=values["definition"]
    )
    wave = frozen["waves"][0]
    root = Path(wave["runDirectory"])
    root.mkdir()
    authorization = {
        "amendment": str(values["ledger"]),
        "attempt": 1,
        "runDirectory": str(root),
        "amendmentSha256": hashlib.sha256(json.dumps(frozen, sort_keys=True).encode()).hexdigest(),
    }
    manifest = {
        **wave,
        "metadata": {
            **frozen["metadata"],
            "evaluationCache": str(root / "cache"),
            "pilotFamilyAuthorization": authorization,
        },
        "decks": frozen["targets"],
        "matchupPool": frozen["matchupPool"],
        "screenAlphaPerHypothesis": frozen["screenAlphaPerHypothesis"],
        "heldOutAlphaPerDeck": frozen["heldOutAlphaPerDeck"],
        "origin": "deterministic-bounded-combo",
        "genericPolicySha256": policy_hash(frozen["metadata"]["generic"]),
    }
    (root / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    catalog = {"schemaVersion": 1, "generic": frozen["metadata"]["generic"], "pilots": {}}
    (root / "catalog.json").write_text(json.dumps(catalog), encoding="utf-8")
    with pytest.raises(ValueError, match="Missing frozen"):
        audit_pilot_catalog(directory=root)
    pilot_family_amendment(ledger=values["ledger"], action="reserve", attempt=1, run_dir=root)
    assert audit_pilot_catalog(directory=root) == catalog
    catalog["pilots"][frozen["targets"][0]["id"]] = frozen["targets"][0]["proposals"][0]["program"]
    (root / "catalog.json").write_text(json.dumps(catalog), encoding="utf-8")
    with pytest.raises(ValueError, match="raw selections"):
        audit_pilot_catalog(directory=root)
    manifest["decks"] = manifest["decks"][:1]
    (root / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    with pytest.raises(ValueError, match="complete frozen wave"):
        audit_pilot_catalog(directory=root)


@pytest.mark.parametrize(
    "change",
    (
        {"reason": "stalled"},
        {"reason": "cancelled"},
        {"reason": "unfinished"},
        {"reason": "turnLimit"},
        {"winnerSeat": True},
    ),
)
def test_terminal_audit_refuses_forged_played_completion_or_boolean_winner(frozen_family, change):
    values = frozen_family
    path = values["directory"] / "games/played.json"
    game = json.loads(path.read_text(encoding="utf-8"))
    game["result"].update(change)
    path.write_text(json.dumps(game), encoding="utf-8")
    with pytest.raises(ValueError, match="health or score"):
        audit_terminal_pilot_wave(root=values["root"], failure=values["failure"])


def test_terminal_audit_refuses_boolean_fitness_even_when_equal_to_a_numeric_win(frozen_family):
    values = frozen_family
    path = values["directory"] / "games/played.json"
    game = json.loads(path.read_text(encoding="utf-8"))
    game["score"] = True
    path.write_text(json.dumps(game), encoding="utf-8")
    with pytest.raises(ValueError, match="health or score"):
        audit_terminal_pilot_wave(root=values["root"], failure=values["failure"])
