import json
import shutil
import time
from pathlib import Path

import pytest

import panel_pool
from PanelBatch import PanelBatch


@pytest.fixture
def batch_worker(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> str:
    node = shutil.which("node")
    assert node is not None
    path = tmp_path / "batch-worker.mjs"
    path.write_text(
        'import { createInterface } from "node:readline";\n'
        "for await (const line of createInterface({ input: process.stdin })) {\n"
        "  const job = JSON.parse(line);\n"
        "  if (job.hang) await new Promise(() => setInterval(() => {}, 1000));\n"
        '  process.stdout.write(JSON.stringify({ id: job.id, valid: true, win: true }) + "\\n");\n'
        "}\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(panel_pool, "WORKER", path)
    return node


def test_completed_batches_resume_without_replaying_games(
    tmp_path: Path, batch_worker: str
) -> None:
    jobs = [{"id": "first", "metadata": {"seat": 0}}, {"id": "second"}]
    batch = PanelBatch(tmp_path, batch_worker, workers=1, heap_megabytes=64)
    try:
        first = batch.run(jobs, tmp_path / "run")
        games = batch.pool.workers[0].games
        assert games == 2
        assert first[0]["metadata"] == {"seat": 0}
        assert batch.run(jobs, tmp_path / "run") == first
        assert batch.pool.workers[0].games == games
        with pytest.raises(ValueError, match="inputs or runtime changed"):
            batch.run([{**jobs[0], "program": "changed"}, jobs[1]], tmp_path / "run")
    finally:
        batch.close()


def test_memory_watchdog_cancels_active_games_and_marks_the_batch_incomplete(
    tmp_path: Path, batch_worker: str
) -> None:
    batch = PanelBatch(
        tmp_path,
        batch_worker,
        workers=1,
        heap_megabytes=64,
        timeout_seconds=60,
        max_rss_megabytes=1,
        monitor_seconds=0.02,
    )
    started = time.monotonic()
    try:
        with pytest.raises(MemoryError, match="RSS limit"):
            batch.run([{"id": "blocked", "hang": True}], tmp_path / "run")
        assert time.monotonic() - started < 3
    finally:
        batch.close()
    report = json.loads((tmp_path / "run/batch.json").read_text(encoding="utf-8"))
    assert report["complete"] is False


def test_rebuilt_runtime_cannot_continue_an_existing_batch(
    tmp_path: Path, batch_worker: str
) -> None:
    runtime = tmp_path / "apps/api/dist"
    runtime.mkdir(parents=True)
    source = runtime / "entry.js"
    source.write_text("one", encoding="utf-8")
    batch = PanelBatch(tmp_path, batch_worker, workers=1, heap_megabytes=64)
    try:
        source.write_text("changed runtime", encoding="utf-8")
        with pytest.raises(RuntimeError, match="runtime changed"):
            batch.run([{"id": "one"}], tmp_path / "run")
    finally:
        batch.close()
