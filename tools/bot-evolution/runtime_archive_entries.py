import hashlib
import tarfile
from pathlib import Path, PurePosixPath


def runtime_archive_entries(run_dir: Path, record: dict) -> dict[str, str]:
    archive_path = (run_dir / record["file"]).resolve()
    if not archive_path.is_relative_to(run_dir.resolve()):
        raise ValueError("Runtime archive must be inside the original run")
    if hashlib.sha256(archive_path.read_bytes()).hexdigest() != record["sha256"]:
        raise ValueError("Runtime archive fingerprint changed")
    entries = {}
    with tarfile.open(archive_path) as archive:
        for member in archive:
            if not member.isfile() or not (
                member.name.endswith((".js", ".json")) or member.name == "pnpm-lock.yaml"
            ):
                continue
            if (
                PurePosixPath(member.name).is_absolute()
                or ".." in PurePosixPath(member.name).parts
                or member.name in entries
            ):
                raise ValueError("Ambiguous runtime archive entry")
            entries[member.name] = hashlib.sha256(archive.extractfile(member).read()).hexdigest()
    return entries
