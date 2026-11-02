import hashlib


def audit_pilot_quiescence(*, record: dict) -> None:
    if record.get("desktopWslArgs", []) not in ([], ["--system", "-d", "Ubuntu"]):
        raise ValueError("Require a frozen supported WSL transport")
    for machine in ("local", "desktop"):
        snapshot = record.get(f"{machine}Processes", "")
        if (
            not snapshot.strip()
            or hashlib.sha256(snapshot.encode()).hexdigest()
            != record.get(f"{machine}ProcessesSha256")
            or any(
                name in snapshot
                for name in ("learn_pilots.py", "learn_combo_pilots.py", "evaluateCli.js")
            )
        ):
            raise ValueError("Require immutable quiescent snapshots with no live workers")
    raw = record.get("localProcessesRaw", "")
    if not raw.strip() or hashlib.sha256(raw.encode()).hexdigest() != record.get(
        "localProcessesRawSha256"
    ):
        raise ValueError("Require the complete immutable local process snapshot")
    rows = [line for line in raw.splitlines() if line.strip()]
    columns = [line.split(None, 2) for line in rows]
    if any(
        len(parts) != 3 or not parts[0].isdigit() or not parts[1].isdigit() for parts in columns
    ):
        raise ValueError("Local process snapshot has invalid pid/parent identities")
    parents = {int(parts[0]): int(parts[1]) for parts in columns}
    current = record.get("localSnapshotPid")
    if type(current) is not int or current not in parents:
        raise ValueError("Process capture must identify its own orchestrator")
    excluded = set()
    while current and current not in excluded:
        excluded.add(current)
        current = parents.get(current, 0)
    filtered = "\n".join(line for line in rows if int(line.split(None, 2)[0]) not in excluded)
    if (
        sorted(excluded) != record.get("excludedLocalProcessIds")
        or filtered != record["localProcesses"]
    ):
        raise ValueError("Only the closing orchestrator and its ancestors may be excluded")
