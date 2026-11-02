"""Publication must use evaluated policies and complete search budgets."""

import hashlib
import json
from copy import deepcopy
from pathlib import Path

import pytest

from audit_session_reflections import audit_session_reflections
from publish import context, publish, verified_run


def test_guide_conditions_use_card_names_real_dp_and_plain_english() -> None:
    text = context(
        {
            "when": {
                "kind": "main",
                "sourceCardIds": ["BT11-112"],
                "minimum": {"sourceDp": 12, "attackPlayer": 1, "handover": 1},
                "maximum": {"opponentSecurity": 0},
            }
        },
        {"BT11-112": {"name": "Rina Shinomiya"}},
    )
    assert "Rina Shinomiya (BT11-112)" in text
    assert "During your main phase" in text
    assert "selected card's DP is at least 12000 DP" in text
    assert "When the action attacks the opposing player" in text
    assert "memory given to the opponent is at least 1" in text
    assert "opponent's security count is at most 0" in text
    assert "sourceDp" not in text
    assert "attackPlayer" not in text


def test_boolean_conditions_preserve_fractional_and_impossible_bounds() -> None:
    assert context({"when": {"minimum": {"attackPlayer": 0.5}}}) == (
        "When the action attacks the opposing player"
    )
    assert context({"when": {"maximum": {"attackPlayer": 0}}}) == (
        "When it is false that the action attacks the opposing player"
    )
    assert context({"when": {"minimum": {"attackPlayer": 2}}}) == (
        "This condition cannot match an action"
    )
    assert context({"when": {"minimum": {"attackPlayer": 0}}}) == ""


def test_empty_card_or_window_restrictions_are_never_presented_as_unconditional() -> None:
    for condition in ({"sourceCardIds": []}, {"kind": ""}):
        assert context({"when": condition}) == "This condition cannot match an action"


def artifact_run(path: Path) -> Path:
    program = {
        "schemaVersion": 1,
        "title": "Pilot",
        "rules": [
            {
                "feature": "pass",
                "weight": -1,
                "advice": "Do not <script>pass</script> unnecessarily.",
            }
        ],
    }
    stage = {
        "program": program,
        "engineSha256": "engine",
        "candidates": 1,
        "validEvaluatedProposals": 1,
        "retainedStageInitial": True,
        "retainedOriginalSeed": False,
        "validationScore": 0.5,
    }
    from evidence import program_hash

    seed_program = {**program, "rules": [{**program["rules"][0], "weight": -0.5}]}
    candidate = hashlib.sha256(json.dumps(program).encode()).hexdigest()
    games = [
        {
            "score": 1,
            "valid": True,
            "engineSha256": "engine",
            "candidateSha256": candidate,
            "task": {"learnerSeat": seat, "opponent": "mcts", "seed": seed},
            "searches": [{"requested": 256, "completed": 256, "invalid": 0}],
        }
        for seed in range(100, 124)
        for seat in (0, 1)
    ]
    manifest = {
        "config": {"engineSha256": "engine", "runnerSha256": "runner", "simulations": 256},
        "metadata": {"cards": [], "evolutionDecks": [], "seedProgram": seed_program},
    }
    report = {
        "engineSha256": "engine",
        "runnerSha256": "runner",
        "simulations": 256,
        "results": {
            "generic": {
                "allValid": True,
                "selected": games,
                "control": [
                    {**game, "score": 0, "candidateSha256": program_hash(seed_program)}
                    for game in games
                ],
                "selectedScore": 1,
                "controlScore": 0,
            }
        },
    }
    path.mkdir()
    for filename, data in (
        ("manifest.json", manifest),
        ("pilots.json", {"generic": stage}),
        ("held-out.json", report),
    ):
        (path / filename).write_text(json.dumps(data))
    return path


@pytest.mark.parametrize(
    "field,model",
    (
        ("model", "deterministic"),
        ("reflectionModel", "deterministic"),
    ),
)
def test_strict_guides_reject_deterministic_origin_even_when_strength_can_be_certified(
    tmp_path, field, model
):
    run = artifact_run(tmp_path / "run")
    path = run / "manifest.json"
    manifest = json.loads(path.read_text())
    manifest["config"][field] = model
    path.write_text(json.dumps(manifest))
    with pytest.raises(ValueError, match="API reflection"):
        verified_run(run)


@pytest.mark.parametrize(
    "version,slug,title",
    [
        ("digilab-ex13-122980@1", "ex13-examon", "Examon"),
        ("digilab-ex13-121547@1", "ex13-jupitermon", "Jupitermon"),
        ("digilab-ex13-122110@1", "ex13-ulforceveedramon", "UlforceVeedramon"),
        ("digilab-ex13-122675@1", "ex13-ts-mervamon", "TS Mervamon"),
        ("digilab-ex13-120207@1", "ex13-toho-braves", "Toho Braves"),
        ("digilab-ex13-119771@1", "ex13-glowing-dawn", "Glowing Dawn"),
    ],
)
def test_digilab_guides_require_valid_searches_before_rendering(tmp_path, version, slug, title):
    from evidence import program_hash

    run = artifact_run(tmp_path / "run")
    manifest = json.loads((run / "manifest.json").read_text())
    manifest["metadata"]["evolutionDecks"] = [
        {"id": version, "deck": {"mainDeck": [], "eggDeck": []}}
    ]
    (run / "manifest.json").write_text(json.dumps(manifest))
    pilots = json.loads((run / "pilots.json").read_text())
    pilot = deepcopy(pilots["generic"])
    pilot["program"]["rules"][0]["weight"] = -2
    pilots[version] = pilot
    (run / "pilots.json").write_text(json.dumps(pilots))
    report = json.loads((run / "held-out.json").read_text())
    evidence = deepcopy(report["results"]["generic"])
    for game in evidence["selected"]:
        game["candidateSha256"] = program_hash(pilot["program"])
    evidence["selected"][0]["searches"][0]["invalid"] = 1
    report["results"][version] = evidence
    (run / "held-out.json").write_text(json.dumps(report))
    output = tmp_path / "public"
    with pytest.raises(ValueError, match="invalid simulations"):
        publish(run, output, "https://example.com", tmp_path / "catalog.json")
    assert not output.exists()
    evidence["selected"][0]["searches"][0]["invalid"] = 0
    (run / "held-out.json").write_text(json.dumps(report))
    publish(run, output, "https://example.com", tmp_path / "catalog.json")
    html = (output / slug / "index.html").read_text()
    assert f"<h1>{title}</h1>" in html
    assert f'https://example.com/strategy-guides/{slug}/' in html
    assert "The tested deck" in html
    assert "48 wins, 0 draws / 48 games" in html
    assert slug in (output / "index.html").read_text()


def test_publication_escapes_exact_advice_and_links_to_practice(tmp_path: Path) -> None:
    run = artifact_run(tmp_path / "run")
    publish(run, tmp_path / "public", "https://example.com", tmp_path / "catalog.json")
    html = (tmp_path / "public/fundamentals/index.html").read_text()
    assert "&lt;script&gt;pass&lt;/script&gt;" in html
    assert "<script>" not in html
    assert "/play?utm_source=strategy-guides&amp;utm_content=fundamentals" in html
    assert '<link rel="canonical" href="https://example.com/strategy-guides/fundamentals/"' in html
    assert "48 wins, 0 draws / 48 games" in html
    assert "improvement was not demonstrated" not in html
    evidence = json.loads((tmp_path / "public/evidence.json").read_text())
    selected = evidence["results"]["generic"]["selected"]
    assert len(selected) == 48
    assert {game["task"]["learnerSeat"] for game in selected} == {0, 1}
    assert selected[0]["searches"] == [{"requested": 256, "completed": 256, "invalid": 0}]
    assert "traces" not in selected[0]
    catalog = json.loads((tmp_path / "catalog.json").read_text())
    assert catalog[0]["url"] == "/strategy-guides/fundamentals/"
    from xml.etree import ElementTree

    sitemap = ElementTree.fromstring((tmp_path / "public/sitemap.xml").read_text())
    assert [
        element.text for element in sitemap.iter("{http://www.sitemaps.org/schemas/sitemap/0.9}loc")
    ] == [
        "https://example.com/strategy-guides/",
        "https://example.com/strategy-guides/fundamentals/",
    ]


@pytest.mark.parametrize(
    "change",
    ("budget", "policy", "control", "runner", "manifest-budget", "smoke", "opponent", "pairing"),
)
def test_refuses_incomplete_or_mismatched_evidence(tmp_path: Path, change: str) -> None:
    run = artifact_run(tmp_path / "run")
    path = run / "held-out.json"
    report = json.loads(path.read_text())
    if change == "budget":
        report["results"]["generic"]["selected"][0]["searches"][0]["completed"] = 255
    elif change == "policy":
        report["results"]["generic"]["selected"][0]["candidateSha256"] = "different-policy"
    elif change == "control":
        report["results"]["generic"]["control"][0]["candidateSha256"] = "different-baseline"
    elif change == "runner":
        report["runnerSha256"] = "different-runner"
    elif change == "manifest-budget":
        manifest_path = run / "manifest.json"
        manifest = json.loads(manifest_path.read_text())
        manifest["config"]["simulations"] = 8
        manifest_path.write_text(json.dumps(manifest))
    elif change == "opponent":
        for arm in ("selected", "control"):
            for game in report["results"]["generic"][arm]:
                game["task"]["opponent"] = "heuristic"
    elif change == "pairing":
        report["results"]["generic"]["control"][0]["task"]["seed"] = 999
    else:
        report["simulations"] = 8
    path.write_text(json.dumps(report))
    with pytest.raises(ValueError):
        verified_run(run)


@pytest.mark.parametrize(
    "change", ("unchanged", "editorial", "no-gain", "too-few", "duplicates", "advice-drift")
)
def test_strict_publication_refuses_false_improvement(tmp_path, change):
    run = artifact_run(tmp_path / "run")
    pilots = json.loads((run / "pilots.json").read_text())
    manifest = json.loads((run / "manifest.json").read_text())
    report = json.loads((run / "held-out.json").read_text())
    evidence = report["results"]["generic"]
    if change in ("unchanged", "editorial"):
        pilots["generic"]["program"] = manifest["metadata"]["seedProgram"]
        if change == "editorial":
            pilots["generic"]["program"]["title"] = "Reformatted seed"
    elif change == "no-gain":
        for game in evidence["selected"]:
            game["score"] = 0
    elif change in ("too-few", "duplicates"):
        for arm in ("selected", "control"):
            evidence[arm] = evidence[arm][:4] * (12 if change == "duplicates" else 1)
    else:
        pilots["generic"]["program"]["rules"][0]["weight"] = 1
    for name, value in (("pilots.json", pilots), ("held-out.json", report)):
        (run / name).write_text(json.dumps(value))
    with pytest.raises(ValueError):
        verified_run(run)


def test_publication_names_the_random_training_rung(tmp_path):
    run = artifact_run(tmp_path / "run")
    path = run / "pilots.json"
    pilots = json.loads(path.read_text())
    pilots["generic"]["ladder"] = {"trainingRung": 0}
    path.write_text(json.dumps(pilots))
    publish(run, tmp_path / "public", "https://example.com", tmp_path / "catalog.json")
    html = (tmp_path / "public/fundamentals/index.html").read_text()
    assert "trained deck pilots against seeded random legal actions" in html
    assert "trained deck pilots against search" not in html


def _record_session(run: Path) -> Path:
    manifest_path = run / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    manifest["config"]["reflectionModel"] = "session"
    manifest_path.write_text(json.dumps(manifest))
    directory = run / "generic" / "reflections"
    directory.mkdir(parents=True)
    prompt = "Measured training feedback"
    fingerprint = hashlib.sha256(prompt.encode()).hexdigest()
    (directory / "0001.prompt.json").write_text(
        json.dumps({"prompt": prompt, "promptSha256": fingerprint})
    )
    response_path = directory / "0001.response.json"
    response_path.write_text(
        json.dumps({"promptSha256": fingerprint, "response": '```json\n{"rules": []}\n```'})
    )
    pilots = json.loads((run / "pilots.json").read_text())
    pilots["generic"]["stage"] = "generic"
    pilots["generic"]["sessionReflections"] = audit_session_reflections(directory)
    (run / "pilots.json").write_text(json.dumps(pilots))
    (run / "generic" / "selected.json").write_text(json.dumps(pilots["generic"]))
    return response_path


def test_session_publication_requires_auditable_records(tmp_path: Path) -> None:
    run = artifact_run(tmp_path / "run")
    _record_session(run)
    verified_run(run)
    publish(run, tmp_path / "public", "https://example.com", None)
    evidence = json.loads((tmp_path / "public" / "evidence.json").read_text())
    assert evidence["reflectionModel"] == "session"
    assert evidence["policies"]["generic"]["sessionReflections"]
    assert (
        "no paid reflection API was used"
        in (tmp_path / "public/fundamentals/index.html").read_text()
    )
    assert "Measured training feedback" not in (tmp_path / "public" / "evidence.json").read_text()


@pytest.mark.parametrize(
    "change",
    ["missing", "fingerprint", "edited", "empty", "orphan", "stage", "selection", "no-records"],
)
def test_session_publication_rejects_incomplete_or_modified_provenance(
    tmp_path: Path, change: str
) -> None:
    run = artifact_run(tmp_path / "run")
    response_path = _record_session(run)
    response = json.loads(response_path.read_text())
    if change == "missing":
        response_path.unlink()
    elif change == "fingerprint":
        response["promptSha256"] = "wrong"
        response_path.write_text(json.dumps(response))
    elif change in ("edited", "empty"):
        response["response"] = "different" if change == "edited" else " "
        response_path.write_text(json.dumps(response))
    elif change == "orphan":
        (response_path.parent / "0002.response.json").write_text(json.dumps(response))
    elif change == "selection":
        (run / "generic" / "selected.json").write_text("{}")
    else:
        pilots = json.loads((run / "pilots.json").read_text())
        if change == "stage":
            pilots["generic"]["stage"] = "../outside"
        else:
            pilots["generic"].pop("sessionReflections")
        (run / "pilots.json").write_text(json.dumps(pilots))
    with pytest.raises(ValueError):
        verified_run(run)


def test_archive_wins_cannot_substitute_for_improvement_against_mcts(tmp_path: Path) -> None:
    run = artifact_run(tmp_path / "run")
    path = run / "held-out.json"
    report = json.loads(path.read_text())
    evidence = report["results"]["generic"]
    for arm in ("selected", "control"):
        archive = []
        for game in evidence[arm]:
            for offset in (1000, 2000, 3000):
                archive.append(
                    {
                        **game,
                        "task": {
                            **game["task"],
                            "seed": game["task"]["seed"] + offset,
                            "opponent": "heuristic",
                        },
                        "searches": [],
                    }
                )
            game["score"] = 0
        evidence[arm].extend(archive)
    path.write_text(json.dumps(report))
    with pytest.raises(ValueError, match="against MCTS itself"):
        verified_run(run)


@pytest.mark.parametrize("invalid", [None, 1])
def test_completed_searches_require_explicit_zero_invalid_simulations(
    tmp_path: Path, invalid: int | None
) -> None:
    run = artifact_run(tmp_path / "run")
    path = run / "held-out.json"
    report = json.loads(path.read_text())
    search = report["results"]["generic"]["selected"][0]["searches"][0]
    if invalid is None:
        search.pop("invalid")
    else:
        search["invalid"] = invalid
    path.write_text(json.dumps(report))
    with pytest.raises(ValueError, match="invalid simulations"):
        verified_run(run)
