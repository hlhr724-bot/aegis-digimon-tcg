import hashlib
import json
import subprocess
import tarfile
from pathlib import Path

from evidence import policy_hash
from projection_runtime_amendment import projection_runtime_amendment
from runtime_archive_entries import runtime_archive_entries
from runtime_payload_hash import runtime_payload_hash


def _record_path(run_dir: Path, record: dict) -> Path:
    path = (run_dir / record["file"]).resolve()
    if (
        not path.is_relative_to(run_dir.resolve())
        or hashlib.sha256(path.read_bytes()).hexdigest() != record["sha256"]
    ):
        raise ValueError("Main integration record changed or escaped the frozen run")
    return path


def _git(repository: Path, *args: str) -> bytes:
    return subprocess.run(
        ["git", "-C", str(repository), *args], capture_output=True, check=True
    ).stdout


def _verify_build_source(run_dir: Path, amendment: dict, snapshot: dict, repository: Path) -> None:
    integration = amendment["mainIntegration"]
    commit = integration["mergeCommit"]
    parents = _git(repository, "show", "-s", "--format=%P", commit).decode().strip().split()
    if (
        len(parents) != 2
        or parents != [integration["deliveryParent"], integration["mainCommit"]]
        or integration["selectionCommit"] != snapshot["commit"]
        or _git(repository, "rev-parse", commit).decode().strip() != commit
    ):
        raise ValueError("Main integration commit or merge parents changed")
    _git(repository, "merge-base", "--is-ancestor", snapshot["commit"], parents[0])
    expected = {}
    for entry in _git(repository, "ls-tree", "-rz", "--full-tree", commit).split(b"\0"):
        if entry:
            header, name = entry.split(b"\t", 1)
            mode, kind, identity = header.decode().split()
            if kind != "blob":
                raise ValueError("Frozen build source cannot contain unresolved submodules")
            expected[name.decode()] = (mode, identity)
    observed = {}
    lock = None
    with tarfile.open(_record_path(run_dir, integration["sourceArchive"])) as archive:
        for member in archive:
            if member.isdir():
                continue
            if member.isfile():
                content = archive.extractfile(member).read()
                mode = "100755" if member.mode & 0o111 else "100644"
            elif member.issym():
                content = member.linkname.encode()
                mode = "120000"
            else:
                raise ValueError("Unsupported frozen build source entry")
            if member.name in observed:
                raise ValueError("Repeated frozen build source entry")
            observed[member.name] = (
                mode,
                hashlib.sha1(f"blob {len(content)}\0".encode() + content).hexdigest(),
            )
            if member.name == "pnpm-lock.yaml":
                lock = hashlib.sha256(content).hexdigest()
    if observed != expected or lock != amendment["dependencyLockSha256"]:
        raise ValueError("Build source archive does not match the pinned merge commit and lock")
    build = json.loads(_record_path(run_dir, integration["buildRecord"]).read_text())
    if (
        build["commit"] != commit
        or build["sourceArchiveSha256"] != integration["sourceArchive"]["sha256"]
        or build["runtimeArchiveSha256"] != amendment["targetRuntime"]["sha256"]
        or build["runtimePayloadSha256"] != amendment["runtimePayloadSha256"]
        or build["dependencyLockSha256"] != amendment["dependencyLockSha256"]
        or build["commands"]
        != [
            "pnpm install --offline --frozen-lockfile --ignore-scripts",
            "pnpm --filter @aegis/shared build",
            "pnpm --filter @aegis/api build",
        ]
        or build["exitCode"] != 0
        or build["sourceVerifiedBeforeBuild"] is not True
        or build["sourceVerifiedAfterBuild"] is not True
        or not build["nodeVersion"].startswith("v26.")
        or build["pnpmVersion"] != "10.30.1"
    ):
        raise ValueError("Main integration build record does not bind the source and runtime")


def main_runtime_amendment(
    run_dir: Path, path: Path, selected: dict, *, repository: Path | None = None
) -> dict:
    amendment = json.loads(path.read_text())
    snapshot = json.loads((run_dir / "snapshot-fingerprints.json").read_text())
    target_engine = amendment.get("certificationEngineSha256", "")
    if (
        amendment.get("schemaVersion") != 1
        or amendment.get("kind") != "main-integration"
        or amendment.get("selectionEngineSha256") != selected["engineSha256"]
        or snapshot["engineSha256"] != selected["engineSha256"]
        or amendment.get("policySha256") != policy_hash(selected["program"])
        or len(target_engine) != 64
        or any(char not in "0123456789abcdef" for char in target_engine)
        or target_engine == selected["engineSha256"]
        or not isinstance(amendment.get("reason"), str)
        or not amendment["reason"].strip()
        or amendment["sourceRuntime"]["sha256"] != snapshot["runtimeArchiveSha256"]
    ):
        raise ValueError("Main integration changed the selected policy or engine provenance")
    source = runtime_archive_entries(run_dir, amendment["sourceRuntime"])
    target = runtime_archive_entries(run_dir, amendment["targetRuntime"])
    lock_path = _record_path(
        run_dir,
        {"file": amendment["dependencyLockFile"], "sha256": amendment["dependencyLockSha256"]},
    )
    if not lock_path.is_file() or amendment["runtimePayloadSha256"] != runtime_payload_hash(target):
        raise ValueError("Main integration payload or dependency lock changed")
    changed = [
        name
        for name in sorted(source.keys() | target.keys())
        if source.get(name) != target.get(name)
    ]
    if not changed or amendment.get("changes") != [
        {"file": name, "beforeSha256": source.get(name), "afterSha256": target.get(name)}
        for name in changed
    ]:
        raise ValueError("Main integration runtime changes are incomplete or altered")
    repair = projection_runtime_amendment(
        run_dir, _record_path(run_dir, amendment["reviewedProjectionRepair"]), selected
    )
    repaired = runtime_archive_entries(run_dir, repair["targetRuntime"])
    harness = "apps/api/dist/bot/matchHarness.js"
    product = {
        name
        for name in source.keys() | target.keys()
        if name.startswith("apps/api/dist/bot/")
        and not name.endswith(".test.js")
        and name != harness
    }
    if (
        not product
        or any(source.get(name) != target.get(name) for name in product)
        or harness not in repaired
        or target.get(harness) != repaired[harness]
    ):
        raise ValueError("Main integration changed product bot modules or the reviewed verifier")
    _verify_build_source(
        run_dir, amendment, snapshot, repository or Path(__file__).resolve().parents[2]
    )
    return amendment
