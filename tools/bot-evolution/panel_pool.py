"""Long-lived Node game workers for cheap panel games."""

import hashlib
import json
import os
import selectors
import subprocess
import threading
import time
from collections.abc import Callable
from concurrent.futures import CancelledError, ThreadPoolExecutor
from pathlib import Path
from typing import Any, Literal

from validate_holdout_usage import validate_holdout_usage

WORKER = Path(__file__).resolve().parent / "panel_worker.mjs"
RESTART_AFTER = 400
REPLAY_TEACHER_TIMEOUT_SECONDS = 190


class PanelWorker:
    def __init__(
        self,
        node: str,
        heap_megabytes: int,
        timeout_seconds: float = 120,
        *,
        stop_event: threading.Event | None = None,
    ) -> None:
        if timeout_seconds <= 0:
            raise ValueError("The worker timeout must be positive")
        self.node = node
        self.heap_megabytes = heap_megabytes
        self.timeout_seconds = timeout_seconds
        self.stop_event = stop_event or threading.Event()
        self.games = 0
        self.process: subprocess.Popen[bytes] | None = None
        self.stderr_tail = bytearray()
        self.last_failure = ""

    def _ensure(self) -> subprocess.Popen[bytes]:
        if self.process is not None and self.process.poll() is None and self.games < RESTART_AFTER:
            return self.process
        self.close()
        self.process = subprocess.Popen(
            [self.node, f"--max-old-space-size={self.heap_megabytes}", str(WORKER)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            bufsize=0,
        )
        if self.process.stdin is None or self.process.stdout is None or self.process.stderr is None:
            raise RuntimeError("Panel worker pipes are unavailable")
        os.set_blocking(self.process.stdin.fileno(), False)
        os.set_blocking(self.process.stdout.fileno(), False)
        os.set_blocking(self.process.stderr.fileno(), False)
        self.stderr_tail.clear()
        self.games = 0
        return self.process

    def _capture_stderr(self, process: subprocess.Popen[bytes]) -> None:
        if process.stderr is None:
            return
        while True:
            try:
                chunk = os.read(process.stderr.fileno(), 65_536)
            except BlockingIOError:
                return
            if not chunk:
                return
            self.stderr_tail.extend(chunk)
            if len(self.stderr_tail) > 8192:
                del self.stderr_tail[:-8192]

    def _exchange(self, payload: dict[str, Any]) -> dict[str, Any] | None:
        process = self._ensure()
        if process.stdin is None or process.stdout is None or process.stderr is None:
            raise RuntimeError("Panel worker pipes are unavailable")
        request = memoryview((json.dumps(payload) + "\n").encode("utf-8"))
        response = bytearray()
        timeout_seconds = (
            REPLAY_TEACHER_TIMEOUT_SECONDS
            if payload.get("replayTeacher") is not None
            else self.timeout_seconds
        )
        deadline = time.monotonic() + timeout_seconds
        with selectors.DefaultSelector() as selector:
            selector.register(process.stdin, selectors.EVENT_WRITE)
            while True:
                if self.stop_event.is_set():
                    raise CancelledError("Panel evaluation was cancelled")
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise TimeoutError(f"Panel worker exceeded {timeout_seconds:g}s")
                events = selector.select(min(remaining, 0.25))
                if not events:
                    continue
                if request:
                    request = request[os.write(process.stdin.fileno(), request) :]
                    if not request:
                        selector.unregister(process.stdin)
                        selector.register(process.stdout, selectors.EVENT_READ)
                        selector.register(process.stderr, selectors.EVENT_READ)
                    continue
                for key, _ in events:
                    if key.fileobj is process.stderr:
                        self._capture_stderr(process)
                        continue
                    chunk = os.read(process.stdout.fileno(), 65_536)
                    if not chunk:
                        self._capture_stderr(process)
                        return None
                    response.extend(chunk)
                    if b"\n" in response:
                        answer = json.loads(response)
                        if not isinstance(answer, dict) or answer.get("id") != payload["id"]:
                            raise ValueError("Panel worker returned a mismatched response")
                        return answer

    def request(self, payload: dict[str, Any]) -> dict[str, Any] | None:
        self.last_failure = ""
        for _ in range(2):
            try:
                answer = self._exchange(payload)
            except (CancelledError, TimeoutError):
                self.close()
                raise
            except (OSError, ValueError) as error:
                self.last_failure = str(error)
                if self.process is not None:
                    self._capture_stderr(self.process)
                answer = None
            if answer is not None:
                self.games += 1
                return answer
            if self.stderr_tail:
                self.last_failure = self.stderr_tail.decode("utf-8", errors="replace").strip()[
                    -1000:
                ]
            self.close()
        return None

    def close(self) -> None:
        if self.process is None:
            return
        if self.process.poll() is None:
            self.process.terminate()
        try:
            self.process.wait(timeout=1)
        except subprocess.TimeoutExpired:
            self.process.kill()
            self.process.wait()
        if self.process.stdin is not None:
            self.process.stdin.close()
        if self.process.stdout is not None:
            self.process.stdout.close()
        if self.process.stderr is not None:
            self.process.stderr.close()
        self.process = None


class PanelPool:
    def __init__(
        self,
        node: str,
        size: int = 4,
        heap_megabytes: int = 768,
        *,
        timeout_seconds: float = 120,
    ) -> None:
        if not 1 <= size <= 8:
            raise ValueError("Use 1–8 panel workers")
        if not WORKER.is_file():
            raise ValueError(f"Missing panel worker: {WORKER}")
        self.stop_event = threading.Event()
        self.workers = [
            PanelWorker(node, heap_megabytes, timeout_seconds, stop_event=self.stop_event)
            for _ in range(size)
        ]
        self.validator = PanelWorker(
            node, heap_megabytes, timeout_seconds, stop_event=self.stop_event
        )
        self.validator_lock = threading.Lock()

    def validate(self, program: dict[str, Any]) -> str | None:
        with self.validator_lock:
            answer = self.validator.request({"id": "validate", "validate": program})
        if answer is None:
            return "The program validator crashed"
        return answer["error"]

    def run(
        self,
        jobs: list[dict[str, Any]],
        *,
        on_result: Callable[[dict[str, Any]], None] | None = None,
        usage: Literal["training", "holdout-evaluation"] = "training",
    ) -> list[dict[str, Any]]:
        validate_holdout_usage(jobs, usage=usage)
        remaining = iter(range(len(jobs)))
        lock = threading.Lock()
        results: list[dict[str, Any] | None] = [None] * len(jobs)
        stopped = self.stop_event

        def drain(worker: PanelWorker) -> None:
            while not stopped.is_set():
                with lock:
                    index = next(remaining, None)
                if index is None:
                    return
                job = jobs[index]
                try:
                    try:
                        answer = worker.request(job)
                        error = worker.last_failure or "worker crashed or returned invalid output"
                    except TimeoutError as exception:
                        answer = None
                        error = str(exception)
                    result = answer or {
                        "id": job["id"],
                        "valid": False,
                        "win": None,
                        "error": error,
                    }
                    with lock:
                        if on_result is not None:
                            on_result(result)
                        results[index] = result
                except BaseException:
                    stopped.set()
                    raise

        with ThreadPoolExecutor(max_workers=len(self.workers)) as executor:
            futures = [executor.submit(drain, worker) for worker in self.workers]
        failures = [future.exception() for future in futures if future.exception() is not None]
        if failures:
            raise next(
                (failure for failure in failures if not isinstance(failure, CancelledError)),
                failures[0],
            )
        if stopped.is_set():
            raise CancelledError("Panel evaluation was cancelled")
        return [result for result in results if result is not None]

    def cancel(self) -> None:
        self.stop_event.set()

    def close(self) -> None:
        for worker in [*self.workers, self.validator]:
            worker.close()


def runtime_fingerprint(repository: Path) -> str:
    """Cheap identity of the compiled engine: path, size, and modification time of each file."""
    digest = hashlib.sha256(WORKER.read_bytes())
    digest.update((Path(__file__).parent / "getPanelScoringWindow.mjs").read_bytes())
    for root in (repository / "apps/api/dist", repository / "packages/shared/dist"):
        for path in sorted(root.rglob("*")):
            if path.suffix in (".js", ".json") and path.is_file():
                status = path.stat()
                digest.update(
                    f"{path.relative_to(repository)}\0{status.st_size}\0{status.st_mtime_ns}\n".encode()
                )
    return digest.hexdigest()
