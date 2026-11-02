"""Certification counts independent blocks and rejects scorer/control contamination."""

import hashlib
import io
import json
import os
import subprocess
import tarfile
from copy import deepcopy
from pathlib import Path

import pytest

from certify_balanced import (
    api_lineage,
    certification_units,
    certify_result,
    confidence_lower,
    projection_runtime_amendment,
    register_attempt,
)
from evidence import policy_hash
from learn_balanced import balanced_splits
from main_runtime_amendment import main_runtime_amendment
from runtime_archive_entries import runtime_archive_entries
from runtime_payload_hash import runtime_payload_hash


@pytest.fixture
def projection_repair(tmp_path):
    visibility = "apps/api/dist/engine/state/visibility.js"
    policy = "apps/api/dist/bot/projectedPolicy.js"
    harness = "apps/api/dist/bot/matchHarness.js"
    source = {
        visibility: b"old visibility",
        policy: b"unchanged policy",
        harness: b"old verifier",
        "pnpm-lock.yaml": b"lock",
    }
    target = {**source, visibility: b"fixed visibility", harness: b"guarded verifier"}

    def archive(name, entries):
        path = tmp_path / name
        with tarfile.open(path, "w:gz") as output:
            for filename, content in entries.items():
                member = tarfile.TarInfo(filename)
                member.size = len(content)
                output.addfile(member, io.BytesIO(content))
        return {"file": name, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}

    selected = {
        "engineSha256": "a" * 64,
        "program": {"rules": [{"feature": "sourceDp", "weight": 0.2}]},
    }
    amendment = {
        "schemaVersion": 1,
        "kind": "projection-repair",
        "selectionEngineSha256": selected["engineSha256"],
        "certificationEngineSha256": "b" * 64,
        "policySha256": policy_hash(selected["program"]),
        "reason": "Cancel an unintroduced card before it reaches a hidden zone.",
        "sourceRuntime": archive("source.tgz", source),
        "targetRuntime": archive("target.tgz", target),
        "runtimePayloadSha256": runtime_payload_hash(
            {name: hashlib.sha256(content).hexdigest() for name, content in target.items()}
        ),
        "dependencyLockFile": "pnpm-lock.yaml",
        "dependencyLockSha256": hashlib.sha256(b"lock").hexdigest(),
        "changes": [
            {
                "file": name,
                "beforeSha256": hashlib.sha256(source[name]).hexdigest(),
                "afterSha256": hashlib.sha256(target[name]).hexdigest(),
            }
            for name in sorted(source)
            if source[name] != target[name]
        ],
    }
    (tmp_path / "pnpm-lock.yaml").write_bytes(b"lock")
    (tmp_path / "snapshot-fingerprints.json").write_text(
        json.dumps(
            {"engineSha256": "a" * 64, "runtimeArchiveSha256": amendment["sourceRuntime"]["sha256"]}
        )
    )
    path = tmp_path / "repair.json"
    return tmp_path, path, selected, amendment, archive, target, policy


@pytest.fixture
def main_integration(projection_repair):
    run, repair_path, selected, repair, archive, target, policy = projection_repair
    repair_path.write_text(json.dumps(repair))
    repository = run / "repository"
    repository.mkdir()
    environment = {
        **os.environ,
        "GIT_AUTHOR_NAME": "Test Fixture",
        "GIT_AUTHOR_EMAIL": "fixture@example.invalid",
        "GIT_COMMITTER_NAME": "Test Fixture",
        "GIT_COMMITTER_EMAIL": "fixture@example.invalid",
    }

    def git(*args):
        return subprocess.run(
            ["git", "-c", "core.hooksPath=/dev/null", "-C", str(repository), *args],
            check=True,
            capture_output=True,
            env=environment,
        ).stdout

    git("init", "-b", "main")
    (repository / "pnpm-lock.yaml").write_bytes(b"lock")
    (repository / "policy.ts").write_bytes(b"unchanged policy")
    git("add", ".")
    git("commit", "--no-gpg-sign", "-m", "Selection source")
    selection_commit = git("rev-parse", "HEAD").decode().strip()
    git("checkout", "-b", "delivery")
    (repository / "visibility.ts").write_bytes(b"fixed visibility")
    git("add", ".")
    git("commit", "--no-gpg-sign", "-m", "Projection repair")
    parent = git("rev-parse", "HEAD").decode().strip()
    git("checkout", "main")
    (repository / "rule.ts").write_bytes(b"main rule")
    git("add", ".")
    git("commit", "--no-gpg-sign", "-m", "Main engine update")
    main_commit = git("rev-parse", "HEAD").decode().strip()
    git("checkout", "delivery")
    git("merge", "--no-ff", "--no-gpg-sign", "-m", "Integrate main", "main")
    merge_commit = git("rev-parse", "HEAD").decode().strip()
    source_archive = run / "main-source.tgz"
    source_archive.write_bytes(git("archive", "--format=tar.gz", "HEAD"))
    snapshot_path = run / "snapshot-fingerprints.json"
    snapshot = json.loads(snapshot_path.read_text())
    snapshot["commit"] = selection_commit
    snapshot_path.write_text(json.dumps(snapshot))
    target = {
        **target,
        "apps/api/dist/engine/gameEngine/newRule.js": b"main rule",
        "apps/api/dist/bot/evolution/new.test.js": b"migrated test",
    }
    source = runtime_archive_entries(run, repair["sourceRuntime"])
    hashes = {name: hashlib.sha256(content).hexdigest() for name, content in target.items()}
    amendment = {
        **repair,
        "kind": "main-integration",
        "certificationEngineSha256": "d" * 64,
        "targetRuntime": archive("main-runtime.tgz", target),
        "runtimePayloadSha256": runtime_payload_hash(hashes),
        "reviewedProjectionRepair": {
            "file": repair_path.name,
            "sha256": hashlib.sha256(repair_path.read_bytes()).hexdigest(),
        },
        "changes": [
            {"file": name, "beforeSha256": source.get(name), "afterSha256": hashes.get(name)}
            for name in sorted(source.keys() | hashes.keys())
            if source.get(name) != hashes.get(name)
        ],
        "mainIntegration": {
            "selectionCommit": selection_commit,
            "mergeCommit": merge_commit,
            "deliveryParent": parent,
            "mainCommit": main_commit,
            "sourceArchive": {
                "file": source_archive.name,
                "sha256": hashlib.sha256(source_archive.read_bytes()).hexdigest(),
            },
        },
    }
    build = {
        "commit": merge_commit,
        "sourceArchiveSha256": amendment["mainIntegration"]["sourceArchive"]["sha256"],
        "runtimeArchiveSha256": amendment["targetRuntime"]["sha256"],
        "runtimePayloadSha256": amendment["runtimePayloadSha256"],
        "dependencyLockSha256": amendment["dependencyLockSha256"],
        "commands": [
            "pnpm install --offline --frozen-lockfile --ignore-scripts",
            "pnpm --filter @aegis/shared build",
            "pnpm --filter @aegis/api build",
        ],
        "exitCode": 0,
        "sourceVerifiedBeforeBuild": True,
        "sourceVerifiedAfterBuild": True,
        "nodeVersion": "v26.10.0",
        "pnpmVersion": "10.30.1",
    }
    build_path = run / "main-build.json"
    build_path.write_text(json.dumps(build))
    amendment["mainIntegration"]["buildRecord"] = {
        "file": build_path.name,
        "sha256": hashlib.sha256(build_path.read_bytes()).hexdigest(),
    }
    path = run / "main-integration.json"
    return run, path, selected, amendment, archive, target, policy, repository


def test_main_integration_preserves_historical_selection_and_binds_merged_build(main_integration):
    run, path, selected, amendment, *_, repository = main_integration
    path.write_text(json.dumps(amendment))
    assert main_runtime_amendment(run, path, selected, repository=repository) == amendment
    assert selected["engineSha256"] == "a" * 64


@pytest.mark.parametrize(
    "change",
    [
        "policy",
        "added-policy",
        "missing-policy",
        "verifier",
        "changes",
        "parents",
        "source",
        "build",
        "repair",
    ],
)
def test_main_integration_rejects_policy_or_build_provenance_substitution(main_integration, change):
    run, path, selected, amendment, archive, target, policy, repository = main_integration
    if change in {"policy", "added-policy", "missing-policy", "verifier"}:
        if change == "policy":
            target[policy] = b"changed policy"
        elif change == "added-policy":
            target["apps/api/dist/bot/newPolicy.js"] = b"hidden policy"
        elif change == "missing-policy":
            del target[policy]
        else:
            target["apps/api/dist/bot/matchHarness.js"] = b"weakened verifier"
        amendment["targetRuntime"] = archive("main-runtime.tgz", target)
        hashes = {name: hashlib.sha256(content).hexdigest() for name, content in target.items()}
        amendment["runtimePayloadSha256"] = runtime_payload_hash(hashes)
        source = runtime_archive_entries(run, amendment["sourceRuntime"])
        amendment["changes"] = [
            {"file": name, "beforeSha256": source.get(name), "afterSha256": hashes.get(name)}
            for name in sorted(source.keys() | hashes.keys())
            if source.get(name) != hashes.get(name)
        ]
    elif change == "changes":
        amendment["changes"].pop()
    elif change == "parents":
        amendment["mainIntegration"]["mainCommit"] = amendment["mainIntegration"]["deliveryParent"]
    elif change == "source":
        amendment["mainIntegration"]["sourceArchive"] = archive(
            "main-source.tgz", {"pnpm-lock.yaml": b"lock", "policy.ts": b"uncommitted policy"}
        )
    elif change == "build":
        record = amendment["mainIntegration"]["buildRecord"]
        build_path = run / record["file"]
        build = json.loads(build_path.read_text())
        build["sourceVerifiedBeforeBuild"] = False
        build_path.write_text(json.dumps(build))
        record["sha256"] = hashlib.sha256(build_path.read_bytes()).hexdigest()
    else:
        amendment["reviewedProjectionRepair"]["sha256"] = "c" * 64
    path.write_text(json.dumps(amendment))
    with pytest.raises(ValueError):
        main_runtime_amendment(run, path, selected, repository=repository)


def test_projection_repair_preserves_selection_and_pins_only_visibility_changes(projection_repair):
    run, path, selected, amendment, *_ = projection_repair
    path.write_text(json.dumps(amendment))
    assert projection_runtime_amendment(run, path, selected) == amendment
    assert selected["engineSha256"] == "a" * 64


@pytest.mark.parametrize("change", ["policy", "engine", "archive", "changes", "unchanged"])
def test_projection_repair_rejects_changed_identity_or_unverifiable_payload(
    projection_repair, change
):
    run, path, selected, amendment, *_ = projection_repair
    if change == "policy":
        selected["program"]["rules"][0]["weight"] = 0.3
    elif change == "engine":
        amendment["selectionEngineSha256"] = "c" * 64
    elif change == "archive":
        amendment["targetRuntime"]["sha256"] = "c" * 64
    elif change == "changes":
        amendment["changes"][0]["afterSha256"] = "c" * 64
    else:
        amendment["certificationEngineSha256"] = selected["engineSha256"]
    path.write_text(json.dumps(amendment))
    with pytest.raises(ValueError):
        projection_runtime_amendment(run, path, selected)


@pytest.mark.parametrize("change", ["policy", "lock", "added", "missing"])
def test_projection_repair_cannot_change_policy_dependencies_or_archive_members(
    projection_repair, change
):
    run, path, selected, amendment, archive, target, policy = projection_repair
    if change == "policy":
        target[policy] = b"changed policy"
    elif change == "lock":
        target["pnpm-lock.yaml"] = b"changed dependencies"
    elif change == "added":
        target["apps/api/dist/bot/extra.js"] = b"unregistered addition"
    else:
        del target[policy]
    amendment["targetRuntime"] = archive("target.tgz", target)
    amendment["runtimePayloadSha256"] = runtime_payload_hash(
        {name: hashlib.sha256(content).hexdigest() for name, content in target.items()}
    )
    path.write_text(json.dumps(amendment))
    with pytest.raises(ValueError, match="outside the declared"):
        projection_runtime_amendment(run, path, selected)


@pytest.mark.parametrize("change", [None, "api", "shared", "lock", "archive-binding"])
def test_worker_binds_actual_api_shared_and_lock_to_amended_archive_before_games(tmp_path, change):
    api = tmp_path / "apps/api/dist"
    shared = tmp_path / "packages/shared/dist"
    modules = {
        "bot/training/metadata.js": 'export function trainingMetadata(){return {engineSha256:"'
        + "b" * 64
        + '"}}',
        "bot/evolution/heuristic.js": "export function parseHeuristic(x){return x}",
        "bot/evolution/decks.js": "export function evolutionDeck(){throw Error('no games')}",
        "bot/evolution/residualMatch.js": "export function runResidualMatch(){throw Error('no games')}",
    }
    for name, content in modules.items():
        path = api / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
    shared.mkdir(parents=True)
    (shared / "index.js").write_text("export const shared = true")
    (shared.parent / "package.json").write_text(
        json.dumps({"main": "./dist/index.js", "type": "module"})
    )
    dependency = api.parent / "node_modules/@aegis/shared"
    dependency.parent.mkdir(parents=True)
    dependency.symlink_to(shared.parent, target_is_directory=True)
    lock = tmp_path / "pnpm-lock.yaml"
    lock.write_text("unchanged lock")
    entries = {}
    for base, prefix in ((api, "apps/api/dist"), (shared, "packages/shared/dist")):
        for path in base.rglob("*.js"):
            entries[f"{prefix}/{path.relative_to(base).as_posix()}"] = hashlib.sha256(
                path.read_bytes()
            ).hexdigest()
    worker = Path(__file__).with_name("certifyWorker.mjs")
    request = {
        "apiRoot": str(api),
        "workerSha256": hashlib.sha256(worker.read_bytes()).hexdigest(),
        "engineSha256": "b" * 64,
        "program": {"basePolicy": "projected-balanced"},
        "units": [],
        "runtimePayloadSha256": runtime_payload_hash(entries),
        "dependencyLockSha256": hashlib.sha256(lock.read_bytes()).hexdigest(),
    }
    if change == "api":
        (api / "unreviewed-policy.js").write_text("export const changed = true")
    elif change == "shared":
        (shared / "index.js").write_text("export const shared = false")
    elif change == "lock":
        lock.write_text("changed dependency")
    elif change == "archive-binding":
        request["runtimePayloadSha256"] = "a" * 64
    result = subprocess.run(
        ["node", str(worker)],
        input=json.dumps(request),
        text=True,
        capture_output=True,
        check=False,
    )
    assert result.stdout == ""
    if change is None:
        assert result.returncode == 0, result.stderr
    else:
        assert result.returncode != 0
        assert (
            "dependency lock changed" if change == "lock" else "amended archive payload"
        ) in result.stderr


def games(units, wins=2):
    records = []
    for unit in units:
        for index, (assignment, seat) in enumerate(
            (((0, 1), 0), ((0, 1), 1), ((1, 0), 0), ((1, 0), 1))
        ):
            score = int(index < wins)
            records.append(
                {
                    "unit": unit["id"],
                    "seed": unit["seed"],
                    "decks": unit["decks"],
                    "assignment": list(assignment),
                    "learnerSeat": seat,
                    "valid": True,
                    "score": score,
                    "winnerSeat": seat if score else 1 - seat,
                    "timedOut": False,
                    "reason": "security",
                    "projectionChecks": 8,
                    "errors": [],
                    "rejections": [],
                    "asynchronousRejections": [],
                    "fallbacks": [{"timeout": 0, "error": 0}] * 2,
                }
            )
    return records


def test_test_opponent_pairings_are_held_out_even_after_deck_swaps():
    decks = [str(n) for n in range(24)]
    units = certification_units(decks, 1)
    training_pairs = {
        tuple(sorted(task["decks"]))
        for tasks in balanced_splits(decks, 96).values()
        for task in tasks
    }
    assert not training_pairs & {tuple(sorted(unit["decks"])) for unit in units}
    assert len({unit["seed"] for unit in units}) == 4800
    assert all(
        0 <= unit["seed"] <= 0xFFFFFFFF and unit["decks"][0] != unit["decks"][1] for unit in units
    )
    assert units == certification_units(decks, 1)
    assert not {unit["seed"] for unit in units} & {
        unit["seed"] for unit in certification_units(decks, 2)
    }


def test_unchanged_policy_scores_half_and_cannot_pass_any_registered_look():
    for count in (1200, 2400, 4800):
        units = certification_units([str(n) for n in range(24)], 1, count)
        result = certify_result(games(units), units, 0.05 / 15)
        assert result["score"] == 0.5 and result["accepted"] is False
        assert result["seedBlocks"] == count
        assert result["played"] == 4 * count and result["lowerBound"] < 0.5


def test_variance_sensitive_bound_uses_blocks_and_adjusts_for_unique_sampling():
    alpha = 0.05 / 15
    low_variance = confidence_lower([0.5] * 4560 + [0.75] * 240, alpha)
    high_variance = confidence_lower([0.25] * 2280 + [0.75] * 2520, alpha)
    assert low_variance["score"] == high_variance["score"] == 0.5125
    assert low_variance["lowerBound"] > 0.5 > high_variance["lowerBound"]
    assert low_variance["uniqueSeedProbability"] == pytest.approx(0.8912076351)
    assert low_variance["unconditionedAlpha"] == pytest.approx(alpha * 0.8912076351)
    assert low_variance["sampleVariance"] == pytest.approx(0.00296875 * 4800 / 4799)
    assert confidence_lower([0.5] * 1200, alpha)["lowerBound"] < 0.5


@pytest.mark.parametrize(
    "means,alpha",
    (([], 0.05), ([1.1], 0.05), ([float("nan")], 0.05), ([0.5], 1), ([0.5] * 4801, 0.05)),
)
def test_bound_refuses_unregistered_counts_invalid_scores_and_alpha(means, alpha):
    with pytest.raises(ValueError):
        confidence_lower(means, alpha)


def test_clear_gain_passes_only_after_enough_complete_seed_blocks():
    units = certification_units([str(n) for n in range(24)], 1, 1200)
    result = certify_result(games(units, wins=3), units, 0.05 / 15)
    assert result["score"] == 0.75 and result["lowerBound"] > 0.5 and result["accepted"] is True
    assert not certify_result(games(units[:100], wins=4), units[:100], 0.05 / 15)["accepted"]


def test_invalid_or_timed_out_game_is_unscored_and_reports_played():
    units = certification_units([str(n) for n in range(24)], 1, 1200)
    records = games(units, wins=3)
    records[0].update(valid=False, timedOut=True, score=None)
    result = certify_result(records, units, 0.05 / 15)
    assert result["played"] == 4799 and result["configured"] == 4800
    assert (
        result["accepted"] is False and result["score"] is None and result["status"] == "timed-out"
    )
    assert result["timedOutGames"] == 1 and result["invalidGames"] == 0
    records[0].update(timedOut=False)
    result = certify_result(records, units, 0.05 / 15)
    assert (
        result["status"] == "invalid"
        and result["timedOutGames"] == 0
        and result["invalidGames"] == 1
    )


@pytest.mark.parametrize(
    "change",
    (
        {"score": 0},
        {"score": True},
        {"winnerSeat": 2},
        {"winnerSeat": False},
        {"learnerSeat": False},
        {"seed": 123},
        {"assignment": [0, 0]},
        {"timedOut": True},
        {"errors": ["engine defect"]},
        {"projectionChecks": 0},
        {"projectionChecks": True},
        {"fallbacks": [{"timeout": 1, "error": 0}] * 2},
        {"asynchronousRejections": ["rejected"]},
    ),
)
def test_malformed_or_false_validity_records_cannot_manufacture_gain(change):
    units = certification_units([str(n) for n in range(24)], 1, 3)
    records = games(units)
    records[0].update(change)
    with pytest.raises(ValueError):
        certify_result(records, units, 0.05 / 15)


def test_duplicate_tasks_missing_games_and_repeated_seed_blocks_fail():
    units = certification_units([str(n) for n in range(24)], 1, 3)
    records = games(units)
    for altered in (records + [deepcopy(records[0])], records[:-1]):
        with pytest.raises(ValueError):
            certify_result(altered, units, 0.05 / 15)
    with pytest.raises(ValueError):
        certify_result(records, [*units, units[0]], 0.05 / 15)


def test_attempt_registry_is_shared_across_runs_and_cannot_change_candidate(tmp_path):
    path = tmp_path / "family.json"
    protocol = {
        "attempt": 1,
        "policySha256": "candidate",
        "engineSha256": "engine",
        "workerSha256": "worker",
        "alphaPerLook": 0.05 / 15,
        "looks": [1200, 2400, 4800],
    }
    register_attempt(path, protocol)
    register_attempt(path, protocol)
    with pytest.raises(ValueError, match="cannot be reused"):
        register_attempt(path, {**protocol, "policySha256": "other"})
    with pytest.raises(ValueError, match="cannot be reused"):
        register_attempt(
            path, {**protocol, "units": [{"seed": 123, "decks": ["different", "pool"]}]}
        )
    with pytest.raises(ValueError, match="five"):
        register_attempt(path, {**protocol, "attempt": 6})


def api_run(tmp_path):
    config = {
        "model": "openai/gpt-4.1-2025-04-14",
        "completionTokens": 4096,
        "dollarCap": 5,
        "inputUsdPerMillion": 2,
        "outputUsdPerMillion": 8,
    }
    manifest = {
        "config": {
            "model": config["model"],
            "reflectionBudget": {
                "completion_tokens": 4096,
                "dollar_cap": 5,
                "input_usd_per_million": 2,
                "output_usd_per_million": 8,
            },
        },
        "metadata": {"reflectionBudgetLedger": str(tmp_path / "ledger.json")},
    }
    (tmp_path / "ledger.json").write_text(
        json.dumps({"config": config, "reservedUsd": 0.1, "calls": 1})
    )
    seed = {
        "schemaVersion": 1,
        "basePolicy": "projected-balanced",
        "title": "Seed",
        "rules": [{"feature": "playTamer", "weight": 0, "advice": "Use balanced."}],
    }
    raw = {
        **seed,
        "title": "Conditional Tamer",
        "rules": [
            {
                "feature": "playTamer",
                "weight": 99,
                "advice": "Develop a Tamer early.",
                "when": {"maximum": {"turn": 3}},
            }
        ],
    }
    selected = {"program": {**raw, "rules": [{**raw["rules"][0], "weight": 1}]}}
    for directory in ("numeric", "proposal-gates", "reflections"):
        (tmp_path / "generic" / directory).mkdir(parents=True)
    (tmp_path / "generic/numeric/selected.json").write_text(json.dumps({"program": seed}))
    (tmp_path / "generic/proposal-gates/proposal-0001.json").write_text(
        json.dumps({"program": selected["program"], "pairedEvidence": {"accepted": True}})
    )
    prompt = "Current candidate:\n" + json.dumps(seed)
    (tmp_path / "generic/reflections/0001-test.prompt.json").write_text(
        json.dumps(
            {
                "prompt": prompt,
                "promptSha256": hashlib.sha256(prompt.encode()).hexdigest(),
                "config": config,
            }
        )
    )
    response_path = tmp_path / "generic/reflections/0001-test.response.json"
    response = {
        "model": "gpt-4.1-2025-04-14",
        "usage": {"completion_tokens": 512},
        "choices": [{"message": {"content": "```json\n" + json.dumps(raw) + "\n```"}}],
    }
    response_path.write_text(json.dumps(response))
    return manifest, selected, response_path, response


def test_api_attribution_reconstructs_code_calibration_and_pins_exact_response(tmp_path):
    manifest, selected, response_path, _ = api_run(tmp_path)
    proof = api_lineage(tmp_path, manifest, selected)
    assert proof["model"] == manifest["config"]["model"]
    assert proof["responseSha256"] == hashlib.sha256(response_path.read_bytes()).hexdigest()
    assert proof["gateFile"] == "generic/proposal-gates/proposal-0001.json"


def test_gemini_attribution_uses_shared_cap_and_exact_provider_model(tmp_path):
    manifest, selected, response_path, response = api_run(tmp_path)
    prompt_path = tmp_path / "generic/reflections/0001-test.prompt.json"
    prompt = json.loads(prompt_path.read_text())
    config = {
        **prompt["config"],
        "model": "gemini/gemini-3.1-pro-preview",
        "reasoningEffort": "medium",
    }
    manifest["config"]["model"] = config["model"]
    manifest["config"]["reflectionBudget"]["reasoning_effort"] = "medium"
    ledger_path = tmp_path / "ledger.json"
    ledger = json.loads(ledger_path.read_text())
    ledger["configurations"] = [ledger["config"], config]
    ledger["reservedUsd"] = 2.9
    ledger_path.write_text(json.dumps(ledger))
    prompt["config"] = config
    prompt_path.write_text(json.dumps(prompt))
    response["model"] = "gemini-3.1-pro-preview"
    response_path.write_text(json.dumps(response))
    assert api_lineage(tmp_path, manifest, selected)["model"] == config["model"]


@pytest.mark.parametrize(
    "change",
    ("unrelated_response", "wrong_model", "over_token_limit", "changed_prompt", "over_budget"),
)
def test_api_attribution_cannot_use_an_unrelated_or_unpinned_response(tmp_path, change):
    manifest, selected, response_path, response = api_run(tmp_path)
    if change == "unrelated_response":
        response["choices"][0]["message"]["content"] = json.dumps({"rules": []})
    elif change == "wrong_model":
        response["model"] = "session"
    elif change == "over_token_limit":
        response["usage"]["completion_tokens"] = 4097
    elif change == "changed_prompt":
        prompt_path = tmp_path / "generic/reflections/0001-test.prompt.json"
        prompt = json.loads(prompt_path.read_text())
        prompt["prompt"] += " changed"
        prompt_path.write_text(json.dumps(prompt))
    elif change == "over_budget":
        ledger_path = tmp_path / "ledger.json"
        ledger = json.loads(ledger_path.read_text())
        ledger["reservedUsd"] = 6
        ledger_path.write_text(json.dumps(ledger))
    response_path.write_text(json.dumps(response))
    with pytest.raises(ValueError):
        api_lineage(tmp_path, manifest, selected)
