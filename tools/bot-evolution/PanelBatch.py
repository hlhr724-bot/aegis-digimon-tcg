import hashlib
import json
import signal
import subprocess
import threading
import time
from concurrent.futures import CancelledError
from pathlib import Path
from typing import Any, Literal

from validate_holdout_usage import validate_holdout_usage

import click

from panel_pool import PanelPool, runtime_fingerprint
from PanelCheckpoint import PanelCheckpoint


class PanelBatch:
    def __init__(
        self,
        repository: Path,
        node: str,
        *,
        workers: int = 4,
        heap_megabytes: int = 512,
        timeout_seconds: float = 60,
        max_rss_megabytes: int = 2560,
        monitor_seconds: float = 1,
    ) -> None:
        if not 1 <= workers <= 4 or max_rss_megabytes <= 0 or monitor_seconds <= 0:
            raise ValueError("Use 1–4 workers and positive resource limits")
        self.repository = repository
        self.fingerprint = runtime_fingerprint(repository)
        node_version = subprocess.run(
            [node, "--version"], check=True, capture_output=True, text=True
        ).stdout.strip()
        if not node_version.startswith("v26."):
            raise ValueError("Panel batches require Node 26")
        self.identity = {
            "runtime": self.fingerprint,
            "node": node_version,
            "workers": workers,
            "heapMegabytes": heap_megabytes,
            "timeoutSeconds": timeout_seconds,
            "maxRssMegabytes": max_rss_megabytes,
            "batchSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            "poolSha256": hashlib.sha256(
                (Path(__file__).parent / "panel_pool.py").read_bytes()
            ).hexdigest(),
            "checkpointSha256": hashlib.sha256(
                (Path(__file__).parent / "PanelCheckpoint.py").read_bytes()
            ).hexdigest(),
        }
        self.pool = PanelPool(node, workers, heap_megabytes, timeout_seconds=timeout_seconds)
        self.max_rss_megabytes = max_rss_megabytes
        self.monitor_seconds = monitor_seconds
        self.peak_rss = 0.0
        self.rss = 0.0
        self.failures: list[Exception] = []
        self.finished = threading.Event()
        self.monitor = threading.Thread(target=self._monitor_resources, daemon=True)
        self.monitor.start()

    def _monitor_resources(self) -> None:
        last_runtime_check = time.monotonic()
        while not self.finished.wait(self.monitor_seconds):
            try:
                pids = {
                    process.pid
                    for worker in [*self.pool.workers, self.pool.validator]
                    if (process := worker.process) is not None
                }
                usage = subprocess.run(
                    ["ps", "-axo", "pid=,rss="], check=True, capture_output=True, text=True
                )
                self.rss = (
                    sum(
                        int(fields[1])
                        for line in usage.stdout.splitlines()
                        if len(fields := line.split()) == 2 and int(fields[0]) in pids
                    )
                    / 1024
                )
                self.peak_rss = max(self.peak_rss, self.rss)
                if self.rss > self.max_rss_megabytes:
                    raise MemoryError("Panel workers exceeded the aggregate RSS limit")
                if time.monotonic() - last_runtime_check >= 15:
                    self._check_runtime()
                    last_runtime_check = time.monotonic()
            except (
                OSError,
                subprocess.SubprocessError,
                RuntimeError,
                MemoryError,
                ValueError,
            ) as error:
                self.failures.append(error)
                self.pool.cancel()
                return

    def _check_runtime(self) -> None:
        if runtime_fingerprint(self.repository) != self.fingerprint:
            raise RuntimeError("Compiled runtime changed during panel evaluation")

    def run(
        self,
        jobs: list[dict[str, Any]],
        directory: Path,
        *,
        usage: Literal["training", "holdout-evaluation"] = "training",
    ) -> list[dict[str, Any]]:
        holdout_hash = validate_holdout_usage(jobs, usage=usage)
        self._check_runtime()
        identifiers = {job["id"] for job in jobs}
        if len(identifiers) != len(jobs):
            raise ValueError("Panel jobs must have unique IDs")
        manifest = {
            **self.identity,
            "usage": usage,
            "holdoutPoolSha256": holdout_hash,
            "jobs": len(jobs),
            "jobsSha256": hashlib.sha256(
                json.dumps(jobs, sort_keys=True, separators=(",", ":")).encode("utf-8")
            ).hexdigest(),
        }
        checkpoint = PanelCheckpoint(directory, manifest)
        if not set(checkpoint.results).issubset(identifiers):
            checkpoint.close()
            raise ValueError("Checkpoint contains unexpected game IDs")
        missing = [job for job in jobs if job["id"] not in checkpoint.results]
        metadata = {job["id"]: job.get("metadata", {}) for job in jobs}
        resumed = len(checkpoint.results)
        started = time.monotonic()
        last_report = started
        complete = False
        click.echo(
            json.dumps({"batch": directory.name, "resumed": resumed, "pending": len(missing)})
        )

        def save(result: dict[str, Any]) -> None:
            nonlocal last_report
            checkpoint.append({**result, "metadata": metadata[result["id"]]})
            count = len(checkpoint.results)
            if count % 100 == 0 or count == len(jobs) or time.monotonic() - last_report >= 15:
                click.echo(
                    json.dumps(
                        {
                            "batch": directory.name,
                            "completed": count,
                            "total": len(jobs),
                            "workerRssMiB": round(self.rss),
                            "peakWorkerRssMiB": round(self.peak_rss),
                            "seconds": round(time.monotonic() - started, 1),
                        }
                    )
                )
                last_report = time.monotonic()

        try:
            if missing:
                self.pool.run(missing, on_result=save, usage=usage)
            self._check_runtime()
            if self.failures:
                raise self.failures[0]
            complete = True
            return [checkpoint.results[job["id"]] for job in jobs]
        except CancelledError as error:
            if self.failures:
                raise self.failures[0] from error
            raise
        finally:
            checkpoint.close()
            report = {
                "complete": complete,
                "games": len(jobs),
                "completed": len(checkpoint.results),
                "resumed": resumed,
                "seconds": time.monotonic() - started,
                "peakWorkerRssMiB": round(self.peak_rss),
            }
            temporary = directory / "batch.tmp"
            temporary.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
            temporary.replace(directory / "batch.json")

    def handle_signals(self) -> None:
        def cancel(signum: int, frame: object) -> None:
            self.pool.cancel()

        signal.signal(signal.SIGINT, cancel)
        signal.signal(signal.SIGTERM, cancel)

    def close(self) -> None:
        self.finished.set()
        self.monitor.join()
        self.pool.close()
