"""Low-budget evidence is allowed only as an explicitly experimental preview."""

import copy
import json
from pathlib import Path

import pytest

from preview import preview
from publish import GUIDES, publish, verified_run
from test_publish import artifact_run


def preview_run(path: Path) -> Path:
    run = artifact_run(path)
    manifest = json.loads((run / "manifest.json").read_text())
    pilots = json.loads((run / "pilots.json").read_text())
    report = json.loads((run / "held-out.json").read_text())
    manifest["config"]["simulations"] = report["simulations"] = 8
    for version in GUIDES:
        pilots[version] = copy.deepcopy(pilots["generic"])
        report["results"][version] = copy.deepcopy(report["results"]["generic"])
        for arm in ("selected", "control"):
            for game in report["results"][version][arm]:
                game["searches"] = [{"requested": 8, "completed": 8}]
        if version != "generic":
            manifest["metadata"]["evolutionDecks"].append(
                {"id": version, "deck": {"mainDeck": [], "eggDeck": []}}
            )
    for filename, value in (
        ("manifest.json", manifest),
        ("pilots.json", pilots),
        ("held-out.json", report),
    ):
        (run / filename).write_text(json.dumps(value))
    return run


def test_preview_is_noindex_and_never_eligible_for_strict_publication(tmp_path: Path) -> None:
    run = preview_run(tmp_path / "run")
    with pytest.raises(ValueError, match="128"):
        verified_run(run)
    output = tmp_path / "public"
    preview(run, output, "http://localhost:5173", tmp_path / "catalog.json")
    for slug in ("", "fundamentals"):
        html = (output / slug / "index.html").read_text()
        assert '<meta name="robots" content="noindex">' in html
        assert "Experimental training preview." in html
        assert "improved playing strength has not been established" in html.lower()
    evidence = json.loads((output / "evidence.json").read_text())
    assert evidence["experimental"] is True
    assert evidence["simulations"] == 8
    assert set(evidence["policies"]) == {"generic"}
    assert not (output / "glowing-dawn/index.html").exists()
    assert "<loc>" not in (output / "sitemap.xml").read_text()
    assert all(
        not guide["strictVerified"] for guide in json.loads((tmp_path / "catalog.json").read_text())
    )


def test_public_evidence_omits_search_actions_and_private_rollout_details(tmp_path: Path) -> None:
    run = artifact_run(tmp_path / "run")
    path = run / "held-out.json"
    report = json.loads(path.read_text())
    for arm in ("selected", "control"):
        report["results"]["generic"][arm][0]["searches"][0]["root"] = [{"action": "private-choice"}]
    path.write_text(json.dumps(report))
    output = tmp_path / "public"
    publish(run, output, "https://example.com", tmp_path / "catalog.json")
    evidence = (output / "evidence.json").read_text()
    assert "private-choice" not in evidence
    assert json.loads(evidence)["results"]["generic"]["selected"][0]["searches"] == [
        {"requested": 256, "completed": 256, "invalid": 0}
    ]


@pytest.mark.parametrize(
    "change", ["budget", "control", "pairing", "runner", "invalid", "missing-pilot"]
)
def test_preview_refuses_incomplete_or_unpaired_evidence(tmp_path: Path, change: str) -> None:
    run = preview_run(tmp_path / "run")
    path = run / "held-out.json"
    report = json.loads(path.read_text())
    result = report["results"]["generic"]
    if change == "budget":
        result["selected"][0]["searches"][0]["completed"] = 7
    elif change == "control":
        result["control"][0]["candidateSha256"] = "wrong-policy"
    elif change == "pairing":
        result["control"][0]["task"]["seed"] = 999
    elif change == "runner":
        report["runnerSha256"] = "wrong-runner"
    elif change == "invalid":
        result["selected"][0]["valid"] = False
    else:
        del report["results"]["generic"]
    path.write_text(json.dumps(report))
    with pytest.raises(ValueError):
        preview(run, tmp_path / "public", "http://localhost:5173", tmp_path / "catalog.json")
