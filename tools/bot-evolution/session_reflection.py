"""GEPA reflection through the active coding session, without an external API key."""

import hashlib
import json
import time
from pathlib import Path


class SessionReflection:
    def __init__(self, directory: Path, timeout: int = 3600) -> None:
        self.directory = directory
        self.timeout = timeout
        directory.mkdir(parents=True, exist_ok=True)
        self.calls = len(list(directory.glob("*.prompt.json")))

    def __call__(self, prompt: str) -> str:
        self.calls += 1
        fingerprint = hashlib.sha256(prompt.encode("utf-8")).hexdigest()
        prefix = self.directory / f"{self.calls:04d}-{fingerprint[:12]}"
        request = prefix.with_suffix(".prompt.json")
        response = prefix.with_suffix(".response.json")
        request.write_text(
            json.dumps({"promptSha256": fingerprint, "prompt": prompt}, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"Pending session reflection: {request}", flush=True)
        deadline = time.monotonic() + self.timeout
        while not response.is_file():
            if time.monotonic() >= deadline:
                raise TimeoutError(f"Session reflection was not answered: {request}")
            time.sleep(1)
        answer = json.loads(response.read_text(encoding="utf-8"))
        if answer.get("promptSha256") != fingerprint or not isinstance(answer.get("response"), str):
            raise ValueError("Session response must match its exact reflection prompt")
        return answer["response"]
