import hashlib
import json
import random
import subprocess
from pathlib import Path

import click

from audit_pilot_catalog import audit_pilot_catalog
from audit_pilot_selection import audit_pilot_selection
from evidence import policy_hash
from pilot_splits import pilot_splits
from reserve_pilot_family import reserve_pilot_family
from train_pilot import train_pilot


@click.command()
@click.option("--run-dir", required=True, type=click.Path(path_type=Path))
@click.option("--deck-pool", required=True, type=click.Path(exists=True, path_type=Path))
@click.option("--desktop-host", default="desktop")
@click.option("--node", required=True)
@click.option("--worker", required=True)
@click.option("--pairs", default=48, type=click.IntRange(24, 99999))
@click.option("--gate-pairs", default=48, type=click.IntRange(24, 99999))
@click.option("--held-out-pairs", default=2400, type=click.IntRange(24, 99999))
@click.option("--evaluation-workers", default=4, type=click.IntRange(1, 4))
@click.option("--seed-offset", default=0, type=click.IntRange(0, 0xFFFFFFFF - 1_600_000_000))
@click.option("--attempt", default=1, type=click.IntRange(1, 3))
@click.option("--family-registry", default=None, type=click.Path(path_type=Path))
@click.option("--only-deck", multiple=True)
def main(
    run_dir: Path,
    deck_pool: Path,
    desktop_host: str,
    node: str,
    worker: str,
    pairs: int,
    gate_pairs: int,
    held_out_pairs: int,
    evaluation_workers: int,
    seed_offset: int,
    attempt: int,
    family_registry: Path | None,
    only_deck: tuple[str, ...],
) -> None:
    pool = json.loads(deck_pool.read_text(encoding="utf-8"))
    if not isinstance(pool, list) or len(pool) < 7 or len(set(pool)) != len(pool):
        raise click.ClickException("Use at least seven distinct pinned preset decks")
    description = subprocess.run(
        [
            "ssh",
            "-o",
            "BatchMode=yes",
            desktop_host,
            "wsl.exe",
            "-e",
            node,
            worker,
            "--describe-pilots",
        ],
        capture_output=True,
        text=True,
        check=True,
        timeout=120,
    )
    metadata = json.loads(description.stdout)
    known = {deck["id"]: deck for deck in metadata.pop("pilotDecks")}
    aliases = {version.split("@", 1)[0]: version for version in known}
    resolved = [version if version in known else aliases.get(version) for version in pool]
    if any(version is None for version in resolved) or len(set(resolved)) != len(resolved):
        raise click.ClickException(
            "Deck pool contains unknown, illegal, unavailable or duplicate presets"
        )
    selected_ids = {version if version in known else aliases.get(version) for version in only_deck}
    if None in selected_ids or selected_ids - set(resolved):
        raise click.ClickException("--only-deck must select a version in the frozen pool")
    decks = [known[version] for version in resolved]
    if any(not deck["proposals"] for deck in decks):
        raise click.ClickException("Every pilot needs at least one distinct card-scoped hypothesis")
    source_files = [
        "learn_pilots.py",
        "pilot_splits.py",
        "PilotProposer.py",
        "train_pilot.py",
        "paired_pilot_evidence.py",
        "audit_pilot_selection.py",
        "audit_pilot_catalog.py",
        "reserve_pilot_family.py",
        "audit_pilot_family.py",
        "audit_pilot_quiescence.py",
        "pilot_family_amendment.py",
        "audit_terminal_pilot_wave.py",
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
    ]
    metadata.update(
        desktopHost=desktop_host,
        node=node,
        worker=worker,
        evaluationWorkers=evaluation_workers,
        evaluationCache=str(run_dir / "cache"),
        runnerSha256=hashlib.sha256(
            b"".join(
                name.encode() + b"\0" + (Path(__file__).parent / name).read_bytes()
                for name in source_files
            )
        ).hexdigest(),
    )
    run_dir.mkdir(parents=True, exist_ok=True)
    path = run_dir / "manifest.json"
    existing = json.loads(path.read_text(encoding="utf-8")) if path.is_file() else None
    if existing is not None:
        held_out_seed_plans = existing["heldOutSeedPlans"]
    else:
        seeds = random.SystemRandom().sample(
            range(1_500_000_000 + seed_offset, 1_600_000_000 + seed_offset),
            len(decks) * held_out_pairs,
        )
        held_out_seed_plans = {
            deck["id"]: seeds[index * held_out_pairs : (index + 1) * held_out_pairs]
            for index, deck in enumerate(decks)
        }
    family = reserve_pilot_family(
        registry=family_registry or run_dir.parent / "deck-pilot-family.json",
        run_dir=run_dir,
        attempt=attempt,
        engine=metadata["engineSha256"],
        generic=policy_hash(metadata["generic"]),
        decks=resolved,
        proposals=sum(len(deck["proposals"]) for deck in decks),
        seed_offset=seed_offset,
        held_out_seeds=held_out_seed_plans,
    )
    manifest = {
        "schemaVersion": 1,
        "metadata": metadata,
        "decks": decks,
        "genericPolicySha256": policy_hash(metadata["generic"]),
        "screenAlphaPerHypothesis": family["screenAlphaPerHypothesis"],
        "heldOutAlphaPerDeck": family["heldOutAlphaPerDeck"],
        "family": family,
        "pairs": pairs,
        "gatePairs": gate_pairs,
        "heldOutPairs": held_out_pairs,
        "seedOffset": seed_offset,
        "heldOutSeedPlans": held_out_seed_plans,
        "heldOutSampling": "uniform-without-replacement",
        "heldOutPopulation": 100_000_000,
        "heldOutMethod": "paired-seed-block-empirical-Bernstein",
        "origin": "deterministic-structural",
        "apiCalls": 0,
        "purpose": "paired pilot selection and held-out screen; not global strength certification",
    }
    if existing is not None and existing != manifest:
        raise click.ClickException("Frozen pilot family changed; use a fresh run directory")
    path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    results = {}
    for ordinal, deck in enumerate(decks):
        if selected_ids and deck["id"] not in selected_ids:
            continue
        click.echo(
            f"Training {deck['id']} with {len(deck['proposals'])} frozen hypotheses", err=True
        )
        results[deck["id"]] = train_pilot(
            directory=run_dir / "pilots" / deck["id"],
            deck=deck,
            metadata=metadata,
            splits=pilot_splits(
                deck=deck["id"],
                pool=resolved,
                generic=metadata["generic"],
                ordinal=ordinal,
                pairs=pairs,
                gate_pairs=gate_pairs,
                held_out_pairs=held_out_pairs,
                seed_offset=seed_offset,
                held_out_seeds=held_out_seed_plans[deck["id"]],
            ),
            screen_alpha=manifest["screenAlphaPerHypothesis"],
            held_out_alpha=manifest["heldOutAlphaPerDeck"],
        )
        click.echo(
            json.dumps(
                {key: value for key, value in results[deck["id"]].items() if key != "program"}
            )
        )
    for ordinal, deck in enumerate(decks):
        selected_path = run_dir / "pilots" / deck["id"] / "selected.json"
        if selected_path.is_file():
            results[deck["id"]] = audit_pilot_selection(
                directory=selected_path.parent,
                configuration={
                    "deck": deck,
                    "metadata": metadata,
                    "splits": pilot_splits(
                        deck=deck["id"],
                        pool=resolved,
                        generic=metadata["generic"],
                        ordinal=ordinal,
                        pairs=pairs,
                        gate_pairs=gate_pairs,
                        held_out_pairs=held_out_pairs,
                        seed_offset=seed_offset,
                        held_out_seeds=held_out_seed_plans[deck["id"]],
                    ),
                    "screenAlpha": manifest["screenAlphaPerHypothesis"],
                    "heldOutAlpha": manifest["heldOutAlphaPerDeck"],
                },
            )
    catalog = {
        "schemaVersion": 1,
        "generic": metadata["generic"],
        "pilots": {
            version: selected["program"]
            for version, selected in results.items()
            if selected["activated"]
        },
    }
    (run_dir / "catalog.json").write_text(json.dumps(catalog, indent=2) + "\n", encoding="utf-8")
    audit_pilot_catalog(directory=run_dir)
    (run_dir / "summary.json").write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "engineSha256": metadata["engineSha256"],
                "configuredDecks": len(decks),
                "completedDecks": len(results),
                "activatedPilots": sorted(catalog["pilots"]),
                "results": results,
                "excludedDecks": metadata["excludedDecks"],
                "apiCalls": 0,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
