import hashlib
import json
from pathlib import Path


def audit_session_reflections(directory: Path) -> list[dict[str, str]]:
    prompts = sorted(directory.glob("*.prompt.json"))
    if not prompts:
        raise ValueError("Session publication requires recorded reflection prompts")
    records = []
    responses = set(directory.glob("*.response.json"))
    for path in prompts:
        response_path = path.with_name(path.name.replace(".prompt.json", ".response.json"))
        if response_path not in responses:
            raise ValueError("Session reflection is missing its response")
        prompt_bytes = path.read_bytes()
        response_bytes = response_path.read_bytes()
        prompt = json.loads(prompt_bytes)
        response = json.loads(response_bytes)
        if not isinstance(prompt.get("prompt"), str) or not prompt["prompt"].strip():
            raise ValueError("Session reflection requires a nonempty prompt")
        fingerprint = hashlib.sha256(prompt["prompt"].encode("utf-8")).hexdigest()
        if prompt.get("promptSha256") != fingerprint or response.get("promptSha256") != fingerprint:
            raise ValueError("Session reflection prompt fingerprint mismatch")
        if not isinstance(response.get("response"), str) or not response["response"].strip():
            raise ValueError("Session reflection requires a nonempty response")
        records.append(
            {
                "promptFile": path.name,
                "promptSha256": hashlib.sha256(prompt_bytes).hexdigest(),
                "responseFile": response_path.name,
                "responseSha256": hashlib.sha256(response_bytes).hexdigest(),
            }
        )
        responses.remove(response_path)
    if responses:
        raise ValueError("Session reflection has responses without prompts")
    return records
