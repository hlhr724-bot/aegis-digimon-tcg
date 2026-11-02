import hashlib
import json
from pathlib import Path

from audit_pilot_family import audit_pilot_family
from audit_pilot_selection import audit_pilot_selection
from evidence import policy_hash
from pilot_family_amendment import pilot_family_amendment
from pilot_splits import pilot_splits


def audit_pilot_catalog(*, directory: Path) -> dict:
    manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
    family = manifest.get("family", {})
    if "registry" in family:
        audit_pilot_family(registry=Path(family["registry"]), attempt=family["attempt"])
    pool = manifest.get("matchupPool", [deck["id"] for deck in manifest["decks"]])
    metadata = manifest["metadata"]
    authorization = metadata.get("pilotFamilyAuthorization")
    if authorization is not None:
        frozen = pilot_family_amendment(
            ledger=Path(authorization["amendment"]),
            action="audit",
            attempt=authorization["attempt"],
            run_dir=directory.absolute(),
        )
        wave = frozen["waves"][authorization["attempt"] - 1]
        if (
            authorization["amendmentSha256"]
            != hashlib.sha256(json.dumps(frozen, sort_keys=True).encode()).hexdigest()
            or authorization["runDirectory"] != str(directory.absolute())
            or metadata
            != {
                **frozen["metadata"],
                "evaluationCache": str(directory.absolute() / "cache"),
                "pilotFamilyAuthorization": authorization,
            }
            or manifest["decks"] != frozen["targets"]
            or pool != frozen["matchupPool"]
            or any(manifest.get(key) != value for key, value in wave.items())
            or manifest["screenAlphaPerHypothesis"] != frozen["screenAlphaPerHypothesis"]
            or manifest["heldOutAlphaPerDeck"] != frozen["heldOutAlphaPerDeck"]
            or manifest.get("genericPolicySha256") != policy_hash(frozen["metadata"]["generic"])
        ):
            raise ValueError("Pilot catalog changed its complete frozen wave authorization")
    elif "registry" not in family or manifest.get("origin") == "deterministic-bounded-combo":
        raise ValueError("Pilot catalog requires its frozen family provenance")
    else:
        recorded = json.loads(Path(family["registry"]).read_text(encoding="utf-8"))
        reservation = next(
            (item for item in recorded["reservations"] if item["attempt"] == family["attempt"]),
            None,
        )
        if (
            reservation is None
            or reservation["runDirectory"] != str(directory.resolve())
            or family
            != {
                **recorded["family"],
                "registry": str(Path(family["registry"]).resolve()),
                "attempt": family["attempt"],
            }
            or pool != recorded["family"]["decks"]
            or metadata["engineSha256"] != recorded["family"]["engineSha256"]
            or policy_hash(metadata["generic"]) != recorded["family"]["genericPolicySha256"]
        ):
            raise ValueError("Legacy catalog changed its frozen family reservation")
    results = {}
    for deck in manifest["decks"]:
        pilot = directory / "pilots" / deck["id"]
        if not (pilot / "selected.json").is_file():
            continue
        results[deck["id"]] = audit_pilot_selection(
            directory=pilot,
            configuration={
                "deck": deck,
                "metadata": metadata,
                "splits": pilot_splits(
                    deck=deck["id"],
                    pool=pool,
                    generic=metadata["generic"],
                    ordinal=pool.index(deck["id"]),
                    pairs=manifest["pairs"],
                    gate_pairs=manifest["gatePairs"],
                    held_out_pairs=manifest["heldOutPairs"],
                    seed_offset=manifest["seedOffset"],
                    held_out_seeds=manifest["heldOutSeedPlans"][deck["id"]],
                ),
                "screenAlpha": manifest["screenAlphaPerHypothesis"],
                "heldOutAlpha": manifest["heldOutAlphaPerDeck"],
            },
        )
    expected = {
        "schemaVersion": 1,
        "generic": metadata["generic"],
        "pilots": {
            version: value["program"] for version, value in results.items() if value["activated"]
        },
    }
    catalog = json.loads((directory / "catalog.json").read_text(encoding="utf-8"))
    if catalog != expected:
        raise ValueError("Pilot catalog does not reconstruct from authorized raw selections")
    return catalog
