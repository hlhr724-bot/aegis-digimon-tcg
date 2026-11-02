import fcntl
import json
import os
from pathlib import Path
from typing import Any


class PanelCheckpoint:
    def __init__(self, directory: Path, manifest: dict[str, Any]) -> None:
        directory.mkdir(parents=True, exist_ok=True)
        self.lock_stream = (directory / "run.lock").open("a", encoding="utf-8")
        try:
            fcntl.flock(self.lock_stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exception:
            self.lock_stream.close()
            raise ValueError("Checkpoint is already in use by another process") from exception
        try:
            self._initialize(directory, manifest)
        except BaseException:
            self.lock_stream.close()
            raise

    def _initialize(self, directory: Path, manifest: dict[str, Any]) -> None:
        manifest_path = directory / "manifest.json"
        self.results_path = directory / "results.jsonl"
        if manifest_path.is_file():
            recorded = json.loads(manifest_path.read_text(encoding="utf-8"))
            if recorded != manifest:
                raise ValueError("Checkpoint inputs or runtime changed; use a new run directory")
        else:
            if self.results_path.exists():
                raise ValueError("Checkpoint results have no manifest")
            temporary = directory / "manifest.tmp"
            temporary.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
            temporary.replace(manifest_path)
        self.recovered_bytes = 0
        self.results = self._load_results()
        self.stream = self.results_path.open("a", encoding="utf-8")

    def _load_results(self) -> dict[str, dict[str, Any]]:
        if not self.results_path.is_file():
            return {}
        content = self.results_path.read_bytes()
        boundary = content.rfind(b"\n") + 1
        self.recovered_bytes = len(content) - boundary
        if self.recovered_bytes:
            with self.results_path.open("r+b") as stream:
                stream.truncate(boundary)
                stream.flush()
                os.fsync(stream.fileno())
        results = {}
        for line in content[:boundary].splitlines():
            result = json.loads(line)
            if not isinstance(result, dict) or not isinstance(result.get("id"), str):
                raise TypeError("Checkpoint contains an invalid result")
            if result["id"] in results:
                raise ValueError(f"Checkpoint contains duplicate result {result['id']}")
            results[result["id"]] = result
        return results

    def append(self, result: dict[str, Any]) -> None:
        if result["id"] in self.results:
            raise ValueError(f"Checkpoint already contains {result['id']}")
        self.stream.write(json.dumps(result, separators=(",", ":")) + "\n")
        self.stream.flush()
        os.fsync(self.stream.fileno())
        self.results[result["id"]] = result

    def close(self) -> None:
        self.stream.close()
        self.lock_stream.close()
