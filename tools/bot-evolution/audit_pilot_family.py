import hashlib
import json
from pathlib import Path

from evidence import policy_hash
from pilot_family_amendment import pilot_family_amendment
from pilot_splits import pilot_splits


def audit_pilot_family(
    *,
    registry: Path | None = None,
    attempt: int | None = None,
    directory: Path | None = None,
    metadata: dict | None = None,
    configuration: dict | None = None,
) -> None:
    manifest = None
    if configuration is not None:
        metadata = configuration["metadata"]
    if directory is not None and len(directory.parents) >= 2:
        manifest_path = directory.parents[1] / "manifest.json"
        if manifest_path.is_file():
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest_metadata = manifest.get("metadata", {})
            expected = manifest_metadata.get("pilotFamilyAuthorization")
            if (
                expected is not None
                and (metadata or {}).get("pilotFamilyAuthorization") != expected
            ):
                raise ValueError("Pilot configuration removed its frozen family authorization")
    authorization = None if metadata is None else metadata.get("pilotFamilyAuthorization")
    if authorization is not None:
        run_dir = Path(authorization["runDirectory"])
        if directory is None or directory != run_dir / "pilots" / directory.name:
            raise ValueError("Pilot evidence moved outside its authorized extension wave")
        frozen = pilot_family_amendment(
            ledger=Path(authorization["amendment"]),
            action="audit",
            attempt=authorization["attempt"],
            run_dir=run_dir,
        )
        fingerprint = hashlib.sha256(json.dumps(frozen, sort_keys=True).encode()).hexdigest()
        if (
            authorization["amendmentSha256"] != fingerprint
            or metadata
            != {
                **frozen["metadata"],
                "evaluationCache": str(run_dir / "cache"),
                "pilotFamilyAuthorization": authorization,
            }
            or directory.name not in {deck["id"] for deck in frozen["targets"]}
        ):
            raise ValueError("Pilot metadata changed its frozen family authorization")
        wave = frozen["waves"][authorization["attempt"] - 1]
        deck = next(item for item in frozen["targets"] if item["id"] == directory.name)
        expected = {
            "deck": deck,
            "metadata": metadata,
            "splits": pilot_splits(
                deck=deck["id"],
                pool=frozen["matchupPool"],
                generic=frozen["metadata"]["generic"],
                ordinal=frozen["matchupPool"].index(deck["id"]),
                pairs=wave["pairs"],
                gate_pairs=wave["gatePairs"],
                held_out_pairs=wave["heldOutPairs"],
                seed_offset=wave["seedOffset"],
                held_out_seeds=wave["heldOutSeedPlans"][deck["id"]],
            ),
            "screenAlpha": frozen["screenAlphaPerHypothesis"],
            "heldOutAlpha": frozen["heldOutAlphaPerDeck"],
        }
        if configuration != expected:
            raise ValueError(
                "Pilot configuration changed its frozen target, hypotheses, splits or alpha"
            )
        return
    if registry is None and directory is not None and len(directory.parents) >= 2:
        path = directory.parents[1] / "manifest.json"
        if path.is_file():
            manifest = json.loads(path.read_text(encoding="utf-8"))
            family = manifest.get("family", {})
            if "registry" in family:
                registry = Path(family["registry"])
                attempt = family["attempt"]
    if registry is None:
        if directory is not None or configuration is not None:
            raise ValueError("Pilot admission requires its frozen family manifest and registry")
        return
    if configuration is not None:
        if manifest is None or not registry.is_file():
            raise ValueError("Pilot admission requires its frozen family manifest and registry")
        recorded = json.loads(registry.read_text(encoding="utf-8"))
        pool = [deck["id"] for deck in manifest["decks"]]
        deck = next((deck for deck in manifest["decks"] if deck["id"] == directory.name), None)
        reservation = next(
            (item for item in recorded["reservations"] if item["attempt"] == attempt), None
        )
        if (
            deck is None
            or reservation is None
            or manifest["family"]
            != {**recorded["family"], "registry": str(registry.resolve()), "attempt": attempt}
            or pool != recorded["family"]["decks"]
            or manifest["metadata"]["engineSha256"] != recorded["family"]["engineSha256"]
            or policy_hash(manifest["metadata"]["generic"])
            != recorded["family"]["genericPolicySha256"]
            or sum(len(item["proposals"]) for item in manifest["decks"])
            != recorded["family"]["hypothesesPerWave"]
            or reservation["runDirectory"] != str(directory.parents[1].resolve())
            or reservation["heldOutSeeds"] != manifest["heldOutSeedPlans"]
            or manifest["screenAlphaPerHypothesis"]
            != recorded["family"]["screenAlphaPerHypothesis"]
            or manifest["heldOutAlphaPerDeck"] != recorded["family"]["heldOutAlphaPerDeck"]
        ):
            raise ValueError("Legacy pilot changed its frozen family reservation")
        expected = {
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
        if configuration != expected:
            raise ValueError(
                "Pilot configuration changed its frozen target, hypotheses, splits or alpha"
            )
    closure = registry.with_suffix(registry.suffix + ".closure.json")
    if not closure.is_file():
        if registry.with_suffix(registry.suffix + ".amendment.json").is_file():
            raise ValueError("An allocated family amendment lost its immutable closure")
        return
    closed = json.loads(closure.read_text(encoding="utf-8"))
    if attempt in closed["retiredAttempts"]:
        raise ValueError("This initial-family wave was irrevocably retired by its amendment")
    pilot_family_amendment(ledger=Path(closed["amendment"]), action="audit")
