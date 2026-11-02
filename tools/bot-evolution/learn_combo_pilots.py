import hashlib
import json
import os
import random
import subprocess
from pathlib import Path

import click

from audit_pilot_catalog import audit_pilot_catalog
from audit_pilot_selection import audit_pilot_selection
from audit_terminal_pilot_wave import audit_terminal_pilot_wave
from evidence import policy_hash
from pilot_family_amendment import pilot_family_amendment
from pilot_splits import pilot_splits
from train_pilot import train_pilot


def _digest(value: dict) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


def _configuration(manifest: dict, deck: dict) -> dict:
    pool = (
        manifest["matchupPool"]
        if "matchupPool" in manifest
        else [item["id"] for item in manifest["decks"]]
    )
    return {
        "deck": deck,
        "metadata": manifest["metadata"],
        "splits": pilot_splits(
            deck=deck["id"],
            pool=pool,
            generic=manifest["metadata"]["generic"],
            ordinal=pool.index(deck["id"]),
            pairs=manifest["pairs"],
            gate_pairs=manifest["gatePairs"],
            held_out_pairs=manifest["heldOutPairs"],
            seed_offset=manifest["seedOffset"],
            held_out_seeds=manifest["heldOutSeedPlans"][deck["id"]],
        ),
        "screenAlpha": manifest["screenAlphaPerHypothesis"],
        "heldOutAlpha": manifest["heldOutAlphaPerDeck"],
    }


def _quiescence(desktop_host: str, wsl_args: tuple[str, ...]) -> dict:
    local_raw = subprocess.run(
        ["ps", "-axo", "pid=,ppid=,command="],
        capture_output=True,
        text=True,
        check=True,
        timeout=30,
    ).stdout
    rows = [line for line in local_raw.splitlines() if line.strip()]
    parents = {int(line.split(None, 2)[0]): int(line.split(None, 2)[1]) for line in rows}
    excluded = set()
    current = os.getpid()
    while current and current not in excluded:
        excluded.add(current)
        current = parents.get(current, 0)
    local = "\n".join(line for line in rows if int(line.split(None, 2)[0]) not in excluded)
    desktop = subprocess.run(
        [
            "ssh",
            "-o",
            "BatchMode=yes",
            desktop_host,
            "wsl.exe",
            *wsl_args,
            "-e",
            "ps",
            "-eo",
            "pid=,args=",
        ],
        capture_output=True,
        text=True,
        check=True,
        timeout=60,
    ).stdout
    result = {
        "desktopWslArgs": list(wsl_args),
        "localProcessesRaw": local_raw,
        "localProcessesRawSha256": hashlib.sha256(local_raw.encode()).hexdigest(),
        "localSnapshotPid": os.getpid(),
        "excludedLocalProcessIds": sorted(excluded),
    }
    for machine, snapshot in (("local", local), ("desktop", desktop)):
        if not snapshot.strip() or any(
            name in snapshot
            for name in ("learn_pilots.py", "learn_combo_pilots.py", "evaluateCli.js")
        ):
            raise click.ClickException(
                "Closing the initial family requires no live orchestrator or worker"
            )
        result[f"{machine}Processes"] = snapshot
        result[f"{machine}ProcessesSha256"] = hashlib.sha256(snapshot.encode()).hexdigest()
    return result


def _write(path: Path, value: dict) -> None:
    content = json.dumps(value, indent=2) + "\n"
    if path.is_file() and path.read_text(encoding="utf-8") != content:
        raise click.ClickException(f"Frozen combo artifact cannot change: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.is_file():
        path.write_text(content, encoding="utf-8")


@click.command()
@click.option("--run-root", required=True, type=click.Path(path_type=Path))
@click.option("--amendment", required=True, type=click.Path(path_type=Path))
@click.option("--prior-registry", required=True, type=click.Path(exists=True, path_type=Path))
@click.option(
    "--prior-run", required=True, type=click.Path(exists=True, file_okay=False, path_type=Path)
)
@click.option("--prior-failure", default=None, type=click.Path(exists=True, path_type=Path))
@click.option("--deck-pool", required=True, type=click.Path(exists=True, path_type=Path))
@click.option("--desktop-host", default="desktop")
@click.option("--desktop-system", is_flag=True)
@click.option("--node", required=True)
@click.option("--worker", required=True)
@click.option("--evaluation-workers", default=4, type=click.IntRange(1, 4))
@click.option("--attempt", default=1, type=click.IntRange(1, 2))
@click.option("--only-deck", multiple=True)
@click.option("--freeze-only", is_flag=True)
def main(
    run_root: Path,
    amendment: Path,
    prior_registry: Path,
    prior_run: Path,
    prior_failure: Path | None,
    deck_pool: Path,
    desktop_host: str,
    desktop_system: bool,
    node: str,
    worker: str,
    evaluation_workers: int,
    attempt: int,
    only_deck: tuple[str, ...],
    freeze_only: bool,
) -> None:
    run_root, amendment, prior_registry, prior_run = (
        path.absolute() for path in (run_root, amendment, prior_registry, prior_run)
    )
    wsl_args = ("--system", "-d", "Ubuntu") if desktop_system else ()
    description = subprocess.run(
        [
            "ssh",
            "-o",
            "BatchMode=yes",
            desktop_host,
            "wsl.exe",
            *wsl_args,
            "-e",
            node,
            worker,
            "--describe-combo-pilots",
        ],
        capture_output=True,
        text=True,
        check=True,
        timeout=120,
    )
    metadata = json.loads(description.stdout)
    targets = metadata.pop("pilotDecks")
    available = set(metadata["availableDeckVersions"])
    aliases = {version.split("@", 1)[0]: version for version in available}
    requested = json.loads(deck_pool.read_text(encoding="utf-8"))
    pool = [version if version in available else aliases.get(version) for version in requested]
    if len(pool) != 24 or None in pool or len(set(pool)) != 24:
        raise click.ClickException(
            "Freeze the same 24 distinct legal matchup versions as the initial family"
        )
    selected_ids = {
        version if version in available else aliases.get(version) for version in only_deck
    }
    if None in selected_ids or selected_ids - {deck["id"] for deck in targets}:
        raise click.ClickException("--only-deck selects only one of the three frozen combo targets")
    names = (
        "learn_combo_pilots.py",
        "learn_pilots.py",
        "pilot_family_amendment.py",
        "audit_pilot_family.py",
        "audit_pilot_quiescence.py",
        "audit_terminal_pilot_wave.py",
        "reserve_pilot_family.py",
        "pilot_splits.py",
        "PilotProposer.py",
        "train_pilot.py",
        "paired_pilot_evidence.py",
        "audit_pilot_selection.py",
        "audit_pilot_catalog.py",
        "adapter.py",
        "evidence.py",
        "evolve.py",
        "api_reflection.py",
        "deterministic_proposals.py",
        "ladder.py",
        "proposals.py",
        "residual_weights.py",
        "session_reflection.py",
        "audit_session_reflections.py",
        "tune.py",
        "pyproject.toml",
        "uv.lock",
    )
    metadata.update(
        desktopHost=desktop_host,
        node=node,
        worker=worker,
        evaluationWorkers=evaluation_workers,
        desktopWslArgs=list(wsl_args),
        runnerSha256=hashlib.sha256(
            b"".join(
                name.encode() + b"\0" + (Path(__file__).parent / name).read_bytes()
                for name in names
            )
        ).hexdigest(),
    )
    prepared = amendment.with_suffix(amendment.suffix + ".prepared.json")
    if amendment.is_file() or prepared.is_file():
        frozen = json.loads(
            (amendment if amendment.is_file() else prepared).read_text(encoding="utf-8")
        )
        if (
            frozen["metadata"] != metadata
            or frozen["targets"] != targets
            or frozen["matchupPool"] != pool
            or frozen["initialFamily"]["registry"] != str(prior_registry)
            or frozen["initialFamily"]["manifest"] != str(prior_run / "manifest.json")
            or [wave["runDirectory"] for wave in frozen["waves"]]
            != [str(run_root / f"wave-{number}") for number in (1, 2)]
        ):
            raise click.ClickException(
                "Frozen combo runtime, runner, hypotheses or destinations changed"
            )
        frozen = pilot_family_amendment(
            ledger=amendment,
            action="audit" if amendment.is_file() else "initialize",
            definition=frozen,
        )
    else:
        quiescence = _quiescence(desktop_host, wsl_args)
        old_manifest = json.loads((prior_run / "manifest.json").read_text(encoding="utf-8"))
        for deck in old_manifest["decks"]:
            directory = prior_run / "pilots" / deck["id"]
            if (directory / "selected.json").is_file():
                audit_pilot_selection(
                    directory=directory, configuration=_configuration(old_manifest, deck)
                )
        initial = {
            "registry": str(prior_registry),
            "manifest": str(prior_run / "manifest.json"),
            "retiredAttempts": [2, 3],
        }
        if prior_failure is not None:
            failure = json.loads(prior_failure.read_text(encoding="utf-8"))
            failure.update(quiescence)
            initial["terminalAudit"] = audit_terminal_pilot_wave(root=prior_run, failure=failure)
        waves = []
        for number, (pairs, gate, heldout) in enumerate(((96, 384, 2400), (192, 768, 9600)), 1):
            offset = 1_400_000_000 + number * 100_000_000
            seeds = random.SystemRandom().sample(
                range(1_500_000_000 + offset, 1_600_000_000 + offset),
                3 * heldout,
            )
            waves.append(
                {
                    "attempt": number,
                    "runDirectory": str(run_root / f"wave-{number}"),
                    "seedOffset": offset,
                    "pairs": pairs,
                    "gatePairs": gate,
                    "heldOutPairs": heldout,
                    "heldOutSeedPlans": {
                        deck["id"]: seeds[index * heldout : (index + 1) * heldout]
                        for index, deck in enumerate(targets)
                    },
                }
            )
        frozen = pilot_family_amendment(
            ledger=amendment,
            action="initialize",
            definition={
                "schemaVersion": 2,
                "origin": "deterministic-bounded-combo",
                "initialFamily": initial,
                "quiescence": quiescence,
                "totalActivationAlpha": 0.05,
                "retainedInitialAlpha": 0.05 / 3,
                "extensionAlpha": 0.05 * 2 / 3,
                "maximumWaves": 2,
                "targets": targets,
                "matchupPool": pool,
                "metadata": metadata,
                "hypothesesPerWave": 18,
                "heldOutAlphaPerDeck": (0.05 * 2 / 3) / 6,
                "screenAlphaPerHypothesis": (0.05 * 2 / 3) / 36,
                "waves": waves,
            },
        )
    click.echo(
        json.dumps(
            {
                "amendment": str(amendment),
                "amendmentSha256": _digest(frozen),
                "retiredInitialWaves": [2, 3],
                "heldOutAlphaPerDeck": frozen["heldOutAlphaPerDeck"],
                "targets": [deck["id"] for deck in targets],
                "apiCalls": 0,
            }
        )
    )
    if freeze_only:
        return
    wave = frozen["waves"][attempt - 1]
    run_dir = Path(wave["runDirectory"])
    pilot_family_amendment(ledger=amendment, action="reserve", attempt=attempt, run_dir=run_dir)
    authorization = {
        "amendment": str(amendment),
        "amendmentSha256": _digest(frozen),
        "attempt": attempt,
        "runDirectory": str(run_dir),
    }
    metadata = {
        **metadata,
        "evaluationCache": str(run_dir / "cache"),
        "pilotFamilyAuthorization": authorization,
    }
    manifest = {
        "schemaVersion": 2,
        **wave,
        "metadata": metadata,
        "decks": targets,
        "matchupPool": pool,
        "screenAlphaPerHypothesis": frozen["screenAlphaPerHypothesis"],
        "heldOutAlphaPerDeck": frozen["heldOutAlphaPerDeck"],
        "genericPolicySha256": policy_hash(metadata["generic"]),
        "heldOutSampling": "uniform-without-replacement",
        "heldOutPopulation": 100_000_000,
        "heldOutMethod": "paired-seed-block-empirical-Bernstein",
        "origin": "deterministic-bounded-combo",
        "apiCalls": 0,
        "purpose": "deck-specific direct-control held-out selection; not global strength certification",
    }
    _write(run_dir / "manifest.json", manifest)
    results = {}
    for deck in targets:
        configuration = _configuration(manifest, deck)
        directory = run_dir / "pilots" / deck["id"]
        if selected_ids and deck["id"] not in selected_ids:
            continue
        click.echo(f"Training {deck['id']} with six frozen combo hypotheses", err=True)
        results[deck["id"]] = train_pilot(
            directory=directory,
            deck=deck,
            metadata=metadata,
            splits=configuration["splits"],
            screen_alpha=configuration["screenAlpha"],
            held_out_alpha=configuration["heldOutAlpha"],
        )
        click.echo(
            json.dumps(
                {key: value for key, value in results[deck["id"]].items() if key != "program"}
            )
        )
    for deck in targets:
        directory = run_dir / "pilots" / deck["id"]
        if (directory / "selected.json").is_file():
            results[deck["id"]] = audit_pilot_selection(
                directory=directory,
                configuration=_configuration(manifest, deck),
            )
    pilot_family_amendment(ledger=amendment, action="audit", attempt=attempt, run_dir=run_dir)
    catalog = {
        "schemaVersion": 1,
        "generic": metadata["generic"],
        "pilots": {
            version: value["program"] for version, value in results.items() if value["activated"]
        },
    }
    summary = {
        "schemaVersion": 2,
        "engineSha256": metadata["engineSha256"],
        "configuredDecks": 3,
        "completedDecks": len(results),
        "matchupPoolDecks": 24,
        "activatedPilots": sorted(catalog["pilots"]),
        "results": results,
        "excludedDecks": metadata["excludedDecks"],
        "blockedIntents": metadata["blockedIntents"],
        "pilotFamilyAuthorization": authorization,
        "apiCalls": 0,
        "claimScope": "accepted deck, paired generic control, frozen disjoint opponent split",
    }
    for name, value in (("catalog.json", catalog), ("summary.json", summary)):
        (run_dir / name).write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
    audit_pilot_catalog(directory=run_dir)


if __name__ == "__main__":
    main()
