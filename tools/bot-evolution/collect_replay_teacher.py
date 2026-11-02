import hashlib
import json
import shlex
import subprocess
from datetime import datetime
from pathlib import Path

import click

REMOTE_SCRIPT = r"""
import datetime
import json
import pathlib
import sys

config = json.loads(sys.argv[1])
start = datetime.datetime.fromisoformat(config["after"]).timestamp()
end = datetime.datetime.fromisoformat(config["before"]).timestamp()
root = pathlib.Path("/opt/aegis-rollout/logs")
paths = sorted((p for p in (root / "replays").glob("*.jsonl") if start <= p.stat().st_mtime < end), key=lambda p: p.name)
selected = []
total = 0
for path in paths[:128]:
    size = path.stat().st_size
    if size > 1024 * 1024 or total + size > 32 * 1024 * 1024:
        continue
    total += size
    selected.append(path)
identifiers = {p.stem for p in selected}
turns = {}
terminals = {}
for name in config["apiLogs"]:
    path = root / name
    if path.parent != root or not name.startswith("api-") or not name.endswith(".jsonl"):
        raise ValueError("Expected explicit API log basename")
    with path.open(encoding="utf-8") as stream:
        for line in stream:
            if '"engine.event"' not in line or not any(kind in line for kind in ('"phaseChanged"', '"turnEnded"', '"gameOver"')):
                continue
            row = json.loads(line)
            match_id = row.get("matchId")
            data = row.get("data", [])
            if match_id not in identifiers or len(data) < 2 or data[0] != "engine.event":
                continue
            event = data[1]
            if event.get("kind") in ("phaseChanged", "turnEnded"):
                turns[match_id] = event["turnCount"]
            if event.get("kind") == "gameOver" and match_id in turns:
                result = event["result"]
                terminals[match_id] = {"winnerSeat": result.get("winnerSeat") if result["outcome"] == "win" else None, "reason": event["reason"], "turn": turns[match_id]}
for path in selected:
    if path.stem not in terminals:
        continue
    lines = []
    observed_at = None
    room_id = None
    with path.open(encoding="utf-8") as stream:
        for line in stream:
            row = json.loads(line)
            if observed_at is None:
                observed_at = row["timestamp"]
                room_id = row.get("roomId")
            lines.append(line.rstrip("\n"))
    print(json.dumps({"matchId": path.stem, "roomId": room_id, "observedAt": observed_at, "expected": terminals[path.stem], "lines": lines}))
"""


@click.command()
@click.option("--after", required=True)
@click.option("--before", required=True)
@click.option("--api-log", multiple=True, required=True)
@click.option("--output", type=click.Path(path_type=Path), required=True)
def main(after: str, before: str, api_log: tuple[str, ...], output: Path) -> None:
    start = datetime.fromisoformat(after)
    end = datetime.fromisoformat(before)
    if start.tzinfo is None or end.tzinfo is None or not 0 < (end - start).total_seconds() <= 600:
        raise click.BadParameter("Use an explicit timezone and a window of at most ten minutes")
    if len(api_log) > 3 or output.exists():
        raise click.BadParameter("Use at most three explicit API logs and a fresh output path")
    subprocess.run(
        ["ssh", "-o", "BatchMode=yes", "oracle-vps", "cat /opt/aegis-rollout/AGENTS.md"],
        check=True,
        timeout=15,
    )
    config = json.dumps({"after": after, "before": before, "apiLogs": list(api_log)})
    command = "aegis-safe python3 - " + shlex.quote(config)
    result = subprocess.run(
        ["ssh", "-o", "BatchMode=yes", "oracle-vps", command],
        input=REMOTE_SCRIPT,
        text=True,
        capture_output=True,
        timeout=310,
        check=True,
    )
    rows = [json.loads(line) for line in result.stdout.splitlines() if line.strip()]
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(rows) + "\n", encoding="utf-8")
    output.with_suffix(".collection.json").write_text(
        json.dumps(
            {
                "after": after,
                "before": before,
                "apiLogs": list(api_log),
                "matches": len(rows),
                "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    click.echo(f"Collected {len(rows)} replays with recorded terminal evidence")


if __name__ == "__main__":
    main()
