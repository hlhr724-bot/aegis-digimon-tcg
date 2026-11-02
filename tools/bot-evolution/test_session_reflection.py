"""Session proposals are tied to an exact GEPA reflection request."""

import hashlib
import json
from pathlib import Path

import pytest

from session_reflection import SessionReflection


def test_session_records_exact_prompt_and_returns_matching_response(tmp_path: Path) -> None:
    prompt = "Actual game feedback"
    fingerprint = hashlib.sha256(prompt.encode()).hexdigest()
    response = tmp_path / f"0001-{fingerprint[:12]}.response.json"
    response.write_text(json.dumps({"promptSha256": fingerprint, "response": "```json\n{}\n```"}))
    reflect = SessionReflection(tmp_path)
    assert reflect(prompt) == "```json\n{}\n```"
    request = json.loads(next(tmp_path.glob("*.prompt.json")).read_text())
    assert request == {"promptSha256": fingerprint, "prompt": prompt}


def test_session_refuses_response_to_different_feedback(tmp_path: Path) -> None:
    fingerprint = hashlib.sha256(b"new game").hexdigest()
    (tmp_path / f"0001-{fingerprint[:12]}.response.json").write_text(
        json.dumps({"promptSha256": "old game", "response": "{}"})
    )
    with pytest.raises(ValueError, match="exact reflection prompt"):
        SessionReflection(tmp_path)("new game")
