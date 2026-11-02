import json
import subprocess
from pathlib import Path

import pytest
from click.testing import CliRunner

from adapter import EvaluationConfig, HeuristicAdapter
from learn_combo_pilots import _quiescence, main


@pytest.mark.parametrize("prefix", ((), ("--system", "-d", "Ubuntu")))
def test_desktop_worker_keeps_frozen_wsl_prefix_and_owned_timeout(tmp_path, monkeypatch, prefix):
    commands = []

    def complete(command, **kwargs):
        commands.append(command)
        return subprocess.CompletedProcess(
            command, 0, stdout=json.dumps({"valid": True, "score": 1})
        )

    monkeypatch.setattr("adapter.subprocess.run", complete)
    adapter = HeuristicAdapter(
        EvaluationConfig(
            node="node",
            worker=Path("/worker.js"),
            run_dir=tmp_path,
            engine_sha256="engine",
            simulations=1,
            desktop_host="desktop",
            timeout=60,
            desktop_wsl_args=prefix,
        ),
        {"desktopWslArgs": list(prefix)},
    )
    assert adapter.evaluate_game({"seed": 1}, {"heuristic": "{}"}, False)["score"] == 1
    command = commands[0]
    position = command.index("wsl.exe")
    assert command[position : position + 2 + len(prefix)] == ["wsl.exe", *prefix, "-e"]
    assert command[command.index("timeout") + 1 : command.index("timeout") + 4] == [
        "--signal=TERM",
        "--kill-after=10",
        "60",
    ]


@pytest.mark.parametrize(
    "prefix, metadata",
    (
        (("--system", "-d", "Other"), {"desktopWslArgs": ["--system", "-d", "Other"]}),
        (("--system", "-d", "Ubuntu"), {}),
        ((), {"desktopWslArgs": ["--system", "-d", "Ubuntu"]}),
    ),
)
def test_desktop_transport_rejects_unfrozen_or_unsupported_wsl_prefix(tmp_path, prefix, metadata):
    with pytest.raises(ValueError, match="transport prefix"):
        HeuristicAdapter(
            EvaluationConfig(
                node="node",
                worker=Path("/worker.js"),
                run_dir=tmp_path,
                engine_sha256="engine",
                simulations=1,
                desktop_host="desktop",
                desktop_wsl_args=prefix,
            ),
            metadata,
        )


@pytest.mark.parametrize("system", (False, True))
def test_combo_descriptor_and_process_snapshot_use_same_explicit_transport(
    tmp_path, monkeypatch, system
):
    commands = []
    prefix = ("--system", "-d", "Ubuntu") if system else ()

    def complete(command, **kwargs):
        commands.append(command)
        result = (
            {"pilotDecks": [], "availableDeckVersions": []}
            if "--describe-combo-pilots" in command
            else None
        )
        return subprocess.CompletedProcess(
            command,
            0,
            stdout=json.dumps(result) if result else "1 0 /sbin/init\n2 1 ps -eo pid=,args=\n",
        )

    monkeypatch.setattr("learn_combo_pilots.subprocess.run", complete)
    pool = tmp_path / "pool.json"
    pool.write_text("[]", encoding="utf-8")
    registry = tmp_path / "family.json"
    registry.write_text("{}", encoding="utf-8")
    arguments = [
        "--run-root",
        str(tmp_path / "combo"),
        "--amendment",
        str(tmp_path / "ledger.json"),
        "--prior-registry",
        str(registry),
        "--prior-run",
        str(tmp_path),
        "--deck-pool",
        str(pool),
        "--node",
        "node",
        "--worker",
        "/worker.js",
        "--freeze-only",
    ]
    if system:
        arguments.append("--desktop-system")
    result = CliRunner().invoke(main, arguments)
    assert result.exit_code != 0 and "24 distinct" in result.output
    snapshot = _quiescence("desktop", prefix)
    assert snapshot["desktopWslArgs"] == list(prefix)
    for command in commands:
        if "wsl.exe" in command:
            position = command.index("wsl.exe")
            assert command[position : position + 2 + len(prefix)] == ["wsl.exe", *prefix, "-e"]
