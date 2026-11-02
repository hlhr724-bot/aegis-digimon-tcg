import hashlib
import json
from pathlib import Path

from evidence import policy_hash
from runtime_archive_entries import runtime_archive_entries
from runtime_payload_hash import runtime_payload_hash


def projection_runtime_amendment(run_dir: Path, path: Path, selected: dict) -> dict:
    """Preserve learning provenance while pinning an independently tested projection repair."""
    amendment = json.loads(path.read_text())
    snapshot = json.loads((run_dir / "snapshot-fingerprints.json").read_text())
    target_engine = amendment.get("certificationEngineSha256", "")
    if (
        amendment.get("schemaVersion") != 1
        or amendment.get("kind") != "projection-repair"
        or amendment.get("selectionEngineSha256") != selected["engineSha256"]
        or snapshot["engineSha256"] != selected["engineSha256"]
        or amendment.get("policySha256") != policy_hash(selected["program"])
        or len(target_engine) != 64
        or any(char not in "0123456789abcdef" for char in target_engine)
        or target_engine == selected["engineSha256"]
        or not isinstance(amendment.get("reason"), str)
        or not amendment["reason"].strip()
    ):
        raise ValueError("Projection amendment changed the selected policy or engine provenance")

    if amendment["sourceRuntime"]["sha256"] != snapshot["runtimeArchiveSha256"]:
        raise ValueError("Projection amendment must retain the original runtime snapshot")
    source = runtime_archive_entries(run_dir, amendment["sourceRuntime"])
    target = runtime_archive_entries(run_dir, amendment["targetRuntime"])
    lock_path = (run_dir / amendment["dependencyLockFile"]).resolve()
    if (
        amendment.get("runtimePayloadSha256") != runtime_payload_hash(target)
        or not lock_path.is_relative_to(run_dir.resolve())
        or hashlib.sha256(lock_path.read_bytes()).hexdigest() != amendment["dependencyLockSha256"]
    ):
        raise ValueError("Runtime payload or dependency lock binding changed")
    changed = [
        name
        for name in sorted(source.keys() | target.keys())
        if source.get(name) != target.get(name)
    ]
    allowed = {
        "apps/api/dist/engine/state/visibility.js",
        "apps/api/dist/bot/matchHarness.js",
    }
    if (
        set(source) != set(target)
        or not changed
        or not set(changed) <= allowed
        or "apps/api/dist/engine/state/visibility.js" not in changed
        or amendment.get("changes")
        != [
            {"file": name, "beforeSha256": source[name], "afterSha256": target[name]}
            for name in changed
        ]
    ):
        raise ValueError(
            "Projection repair changed code outside the declared visibility/verifier seam"
        )
    return amendment
