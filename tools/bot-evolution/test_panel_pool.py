import shutil
import threading
import time
from concurrent.futures import CancelledError
from pathlib import Path

import pytest

import panel_pool
from panel_pool import PanelPool, PanelWorker


@pytest.fixture
def worker_script(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> str:
    node = shutil.which("node")
    assert node is not None
    path = tmp_path / "worker.mjs"
    path.write_text(
        'import { createInterface } from "node:readline";\n'
        "const lines = createInterface({ input: process.stdin });\n"
        "for await (const line of lines) {\n"
        "  const job = JSON.parse(line);\n"
        '  if (job.mode === "crash") { console.error("synthetic worker crash"); process.exit(1); }\n'
        '  if (job.mode === "partial") process.stdout.write("{");\n'
        '  if (job.mode === "hang" || job.mode === "partial") {\n'
        "    await new Promise(() => setInterval(() => {}, 1000));\n"
        "  }\n"
        '  if (job.mode === "wrong") {\n'
        '    process.stdout.write(JSON.stringify({ id: "wrong" }) + "\\n");\n'
        "    continue;\n"
        "  }\n"
        '  process.stdout.write(JSON.stringify({ id: job.id, valid: true, win: true }) + "\\n");\n'
        "}\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(panel_pool, "WORKER", path)
    return node


@pytest.mark.parametrize("mode", ["hang", "partial"])
def test_timeout_kills_the_worker_and_the_next_request_succeeds(
    worker_script: str, mode: str
) -> None:
    worker = PanelWorker(worker_script, 64, timeout_seconds=0.3)
    started = time.monotonic()
    try:
        with pytest.raises(TimeoutError, match="exceeded"):
            worker.request({"id": "blocked", "mode": mode})
        assert time.monotonic() - started < 3
        assert worker.process is None
        assert worker.request({"id": "healthy"}) == {"id": "healthy", "valid": True, "win": True}
    finally:
        worker.close()


def test_timeout_is_recorded_and_does_not_block_following_games(worker_script: str) -> None:
    pool = PanelPool(worker_script, 1, 64, timeout_seconds=0.3)
    saved = []
    try:
        results = pool.run(
            [{"id": "blocked", "mode": "hang"}, {"id": "healthy"}],
            on_result=saved.append,
        )
        assert results == saved
        assert results[0]["valid"] is False
        assert "exceeded" in results[0]["error"]
        assert results[1]["valid"] is True
    finally:
        pool.close()


@pytest.mark.parametrize("mode", ["crash", "wrong"])
def test_worker_failures_remain_invalid_and_later_games_continue(
    worker_script: str, mode: str
) -> None:
    pool = PanelPool(worker_script, 1, 64, timeout_seconds=1)
    try:
        results = pool.run([{"id": "broken", "mode": mode}, {"id": "healthy"}])
        assert results[0]["id"] == "broken"
        assert results[0]["valid"] is False
        if mode == "crash":
            assert "synthetic worker crash" in results[0]["error"]
        assert results[1]["valid"] is True
    finally:
        pool.close()


def test_persistence_failure_propagates_and_stops_dispatch(worker_script: str) -> None:
    pool = PanelPool(worker_script, 1, 64)

    def fail_to_save(result: dict) -> None:
        raise OSError("disk full")

    try:
        with pytest.raises(OSError, match="disk full"):
            pool.run([{"id": str(index)} for index in range(20)], on_result=fail_to_save)
        assert pool.workers[0].games == 1
    finally:
        pool.close()


def test_parallel_callbacks_are_serialized_and_results_keep_input_order(worker_script: str) -> None:
    pool = PanelPool(worker_script, 3, 64)
    saved = []
    jobs = [{"id": str(index)} for index in range(30)]
    try:
        results = pool.run(jobs, on_result=saved.append)
        assert [result["id"] for result in results] == [job["id"] for job in jobs]
        assert len(saved) == 30
        assert {result["id"] for result in saved} == {job["id"] for job in jobs}
    finally:
        pool.close()


def test_cancellation_stops_active_hung_workers_without_waiting_for_the_timeout(
    worker_script: str,
) -> None:
    pool = PanelPool(worker_script, 3, 64, timeout_seconds=60)
    timer = threading.Timer(0.3, pool.cancel)
    started = time.monotonic()
    timer.start()
    try:
        with pytest.raises(CancelledError):
            pool.run([{"id": str(index), "mode": "hang"} for index in range(20)])
        assert time.monotonic() - started < 3
        assert all(worker.process is None for worker in pool.workers)
    finally:
        timer.cancel()
        pool.close()


def test_holdout_guard_runs_before_worker_dispatch(worker_script: str) -> None:
    pool = PanelPool(worker_script, 1, 64)
    try:
        with pytest.raises(ValueError, match="Reserved holdout seed"):
            pool.run([{"id": "held-out", "seed": 1800000000}])
        assert pool.workers[0].process is None
        assert (
            pool.run([{"id": "held-out", "seed": 1800000000}], usage="holdout-evaluation")[0][
                "valid"
            ]
            is True
        )
    finally:
        pool.close()
