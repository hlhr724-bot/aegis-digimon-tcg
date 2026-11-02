import json
from pathlib import Path

import pytest

from PanelCheckpoint import PanelCheckpoint


def test_completed_games_survive_reopening_and_duplicates_are_rejected(tmp_path: Path) -> None:
    result = {"id": "finished", "valid": True, "win": True}
    checkpoint = PanelCheckpoint(tmp_path, {"runtime": "one"})
    checkpoint.append(result)
    checkpoint.close()
    resumed = PanelCheckpoint(tmp_path, {"runtime": "one"})
    try:
        assert resumed.results == {"finished": result}
        with pytest.raises(ValueError, match="already contains"):
            resumed.append(result)
    finally:
        resumed.close()


def test_changed_runtime_or_inputs_cannot_reuse_results(tmp_path: Path) -> None:
    checkpoint = PanelCheckpoint(tmp_path, {"runtime": "one", "program": "a"})
    checkpoint.close()
    with pytest.raises(ValueError, match="inputs or runtime changed"):
        PanelCheckpoint(tmp_path, {"runtime": "two", "program": "a"})
    with pytest.raises(ValueError, match="inputs or runtime changed"):
        PanelCheckpoint(tmp_path, {"runtime": "one", "program": "b"})


def test_only_the_incomplete_last_record_is_discarded_after_interruption(tmp_path: Path) -> None:
    checkpoint = PanelCheckpoint(tmp_path, {"runtime": "one"})
    checkpoint.append({"id": "saved", "valid": False, "win": None})
    checkpoint.close()
    with (tmp_path / "results.jsonl").open("ab") as stream:
        stream.write(b'{"id":"partial"')
    resumed = PanelCheckpoint(tmp_path, {"runtime": "one"})
    try:
        assert resumed.recovered_bytes == len(b'{"id":"partial"')
        assert list(resumed.results) == ["saved"]
        resumed.append({"id": "next", "valid": True, "win": False})
    finally:
        resumed.close()
    rows = [json.loads(line) for line in (tmp_path / "results.jsonl").read_text().splitlines()]
    assert [row["id"] for row in rows] == ["saved", "next"]


def test_corruption_in_a_complete_record_is_not_silently_discarded(tmp_path: Path) -> None:
    checkpoint = PanelCheckpoint(tmp_path, {"runtime": "one"})
    checkpoint.close()
    (tmp_path / "results.jsonl").write_text("{broken}\n", encoding="utf-8")
    with pytest.raises(json.JSONDecodeError):
        PanelCheckpoint(tmp_path, {"runtime": "one"})


def test_only_one_process_can_use_a_checkpoint_at_a_time(tmp_path: Path) -> None:
    checkpoint = PanelCheckpoint(tmp_path, {"runtime": "one"})
    try:
        with pytest.raises(ValueError, match="already in use"):
            PanelCheckpoint(tmp_path, {"runtime": "one"})
    finally:
        checkpoint.close()
    resumed = PanelCheckpoint(tmp_path, {"runtime": "one"})
    resumed.close()
