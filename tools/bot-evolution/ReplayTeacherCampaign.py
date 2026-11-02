import hashlib
import json
import tarfile
import threading
import time
from concurrent.futures import CancelledError
from pathlib import Path
from typing import Any

import gepa

from has_replicated_preference import has_replicated_preference
from judge_local_screen import judge_local_screen
from local_screen_protocol import LOCAL_SCREEN_PROTOCOL
from panel_adapter import PanelConfig
from panel_confirm import _analyze
from panel_reflection_template import PANEL_REFLECTION_TEMPLATE
from panel_splits import alternating_blocks, block_games
from PanelBatch import PanelBatch
from PanelCheckpoint import PanelCheckpoint
from prepare_replay_teacher_splits import _composition, prepare_replay_teacher_splits
from ReplayTeacherAdapter import ReplayTeacherAdapter
from ReplayTeacherBudget import ReplayTeacherBudget
from session_reflection import SessionReflection
from summarize_replay_replication import MAX_INVALID_FRACTION, summarize_replay_replication
from summarize_replay_teacher import summarize_replay_teacher

SCREEN_PAIRS = 32
REPLICATION_PAIRS = 208
SCREEN_SEED_OFFSET = 10000
REPLICATION_SEED_OFFSET = 50000
TEACHER_SEED_BASE = 25000000
TEACHER_SEED_STRIDE = 100000
CONTINUATION_RESERVE_SECONDS = 15


class ReplayTeacherCampaign:
    def __init__(self, *, inputs: Path, exclusions: list[Path], directory: Path, node: str) -> None:
        self.directory = directory
        self.repository = Path(__file__).resolve().parents[2]
        self.inputs = inputs
        historical = [
            self.repository / ".local/bot-lab" / name
            for name in (
                "pairs.json",
                "fresh/pairs.json",
                "v3-confirmation-reserve/raw-pairs.json",
                "v4-confirmation-reserve/raw-pairs.json",
                "decision-context/proof-inputs/00-pairs.json",
                "decision-context/proof-inputs/03-pairs.json",
            )
        ]
        if any(not path.is_file() for path in historical):
            raise ValueError(
                "Required historical inventories are missing; restore them before starting a campaign"
            )
        self.exclusions = sorted({*historical, *exclusions})
        self.batch = PanelBatch(self.repository, node)
        self.batch.handle_signals()
        self.baseline = self._load(
            self.repository / "apps/api/src/bot/evolution/programs/human-panel-v3.json"
        )["program"]
        self.alternate = self._load(
            self.repository / "apps/api/src/bot/evolution/programs/human-panel-v2.json"
        )["program"]
        self.confirmation_owner = str(directory.resolve())
        directory.mkdir(parents=True, exist_ok=True)
        self._check_protocol()
        archive = directory / "runtime.tgz"
        if not archive.is_file():
            temporary = archive.with_suffix(".tmp")
            with tarfile.open(temporary, "w:gz") as bundle:
                for relative in (
                    "apps/api/dist",
                    "packages/shared/dist",
                    "apps/api/src",
                    "packages/shared/src",
                    "tools/bot-evolution",
                    "package.json",
                    "apps/api/package.json",
                    "apps/web/package.json",
                    "packages/shared/package.json",
                    "pnpm-workspace.yaml",
                    "pnpm-lock.yaml",
                ):
                    path = self.repository / relative
                    if path.is_dir():
                        for item in sorted(path.rglob("*")):
                            if (
                                item.is_file()
                                and item.suffix
                                in (".ts", ".js", ".mjs", ".json", ".py", ".toml", ".md")
                                and not any(
                                    part in (".venv", "__pycache__", ".pytest_cache")
                                    for part in item.parts
                                )
                            ):
                                bundle.add(
                                    item,
                                    arcname=str(item.relative_to(self.repository)),
                                    recursive=False,
                                )
                    else:
                        bundle.add(path, arcname=relative, recursive=False)
            temporary.replace(archive)
        self.manifest = PanelCheckpoint(
            directory / "campaign",
            {
                **self.batch.identity,
                "inputsSha256": self._hash(inputs),
                "runtimeArchiveSha256": self._hash(archive),
                "exclusions": [
                    {"path": str(path), "sha256": self._hash(path)} for path in self.exclusions
                ],
                "baseline": self.baseline,
                "alternate": self.alternate,
                "sources": {
                    path.name: self._hash(path) for path in Path(__file__).parent.glob("*.py")
                },
                "protocol": {
                    "fitness": 32,
                    "validation": 64,
                    "confirmation": 320,
                    "maxHours": 24,
                    "maxTeacherPositions": 100,
                    "maxRules": 8,
                    "maxReflections": 8,
                    "reflectionFitnessBlocks": 32,
                    "alignment": "One preferred alternative uniquely best; identical hand Tamer copies equivalent",
                    "maxMerges": 2,
                    "teacherReplication": {
                        "pairs": REPLICATION_PAIRS,
                        "seedOffset": REPLICATION_SEED_OFFSET,
                        "maxInvalidFraction": MAX_INVALID_FRACTION,
                        "acceptance": "Screen preferred and replication lower95 above zero over valid pairs",
                        "refinementBackfill": "Inherited screen-preferred cases without replication are replicated in the refinement directory",
                    },
                    "developmentScreen": LOCAL_SCREEN_PROTOCOL,
                    "seed": 24000000,
                },
            },
        )
        self.registry = PanelCheckpoint(
            self.repository / ".local/bot-lab/replay-teacher/campaign-registry", {"version": 1}
        )
        self.budget = ReplayTeacherBudget(directory / "budget.json")
        self.deadline = self.budget.state["deadline"]
        self.timer = threading.Timer(max(0, self.deadline - time.time()), self.batch.pool.cancel)
        self.timer.daemon = True
        self.timer.start()

    def _check_protocol(self) -> None:
        path = self.directory / "campaign/manifest.json"
        if not path.is_file():
            return
        recorded = self._load(path).get("protocol", {}).get("developmentScreen")
        if recorded != LOCAL_SCREEN_PROTOCOL:
            raise ValueError(
                "Run directory was started under a different development screen protocol; "
                "use a new run directory"
            )

    def _load(self, path: Path) -> Any:
        return json.loads(path.read_text(encoding="utf-8"))

    def _hash(self, path: Path) -> str:
        return hashlib.sha256(path.read_bytes()).hexdigest()

    def _write(self, name: str, value: Any) -> None:
        path = self.directory / name
        temporary = path.with_suffix(".tmp")
        temporary.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
        temporary.replace(path)

    def _get_stage(self, name: str) -> Any:
        if name not in self.manifest.results:
            return None
        entry = self.manifest.results[name]
        path = self.directory / entry["file"]
        if not path.is_file() or self._hash(path) != entry["sha256"]:
            raise ValueError(f"Completed stage artifact changed: {name}")
        return self._load(path)

    def _finish_stage(self, name: str, value: Any) -> None:
        filename = f"{name}-stage.json"
        self._write(filename, value)
        self.manifest.append(
            {"id": name, "file": filename, "sha256": self._hash(self.directory / filename)}
        )

    def _report(self, status: str, **fields: Any) -> dict[str, Any]:
        report = {"status": status, "runtime": self.batch.fingerprint, **fields}
        self._write("summary.json", report)
        text = (
            "# Replay teacher campaign\n\n"
            + json.dumps(report, indent=2)
            + "\n\nResults concern simulated opponents, not live-human strength.\n"
        )
        (self.directory / "REPORT.md").write_text(text, encoding="utf-8")
        return report

    def _jobs(
        self, pairs: list[dict[str, Any]], program: dict[str, Any], arm: str, seed: int
    ) -> list[dict[str, Any]]:
        jobs = []
        for block in alternating_blocks(pairs, ["certified", "certified", "legacy", "v3"], seed):
            for game in block_games(block):
                jobs.append(
                    {
                        **game,
                        "program": program,
                        "activationMemoryCosts": True,
                        "decisionContext": True,
                        "opponentProgram": self.baseline if game["opponent"] == "v3" else None,
                        "opponentActivationMemoryCosts": True,
                        "opponentDecisionContext": True,
                        "id": f"{arm}|{game['matchId']}|{game['orientation']}|{game['seat']}",
                        "metadata": {
                            "arm": arm,
                            **{
                                key: game[key]
                                for key in ("matchId", "opponent", "orientation", "seat", "seed")
                            },
                        },
                    }
                )
        return jobs

    def _compare(
        self, pairs: list[dict[str, Any]], program: dict[str, Any], directory: Path, seed: int
    ) -> dict[str, Any]:
        jobs = self._jobs(pairs, self.baseline, "baseline", seed) + self._jobs(
            pairs, program, "candidate", seed
        )
        return _analyze(self.batch.run(jobs, directory), frozen_opponent="v3")

    def _continuations(
        self, row: dict[str, Any], result: dict[str, Any], seed: int, pairs: int
    ) -> list[dict[str, Any]]:
        position = row["position"]
        return [
            {
                "id": f"{sample}|{arm}",
                "program": self.baseline if sample < pairs // 2 else self.alternate,
                "replayContinuation": {
                    "record": row["pair"]["record"],
                    "inputIndex": position["inputIndex"],
                    "seat": position["seat"],
                    "expectedInformation": position["information"],
                    "sampleSeed": seed + sample,
                    "action": result[arm],
                },
            }
            for sample in range(pairs)
            for arm in ("baseline", "alternative")
        ]

    def _collect_cases(self, fitness: list[dict[str, Any]]) -> list[dict[str, Any]]:
        positions = []
        for pair in fitness:
            mine = sorted(
                pair["positions"], key=lambda row: (row["priority"], row["margin"], row["hash"])
            )[:4]
            positions.extend({"pair": pair, "position": position} for position in mine)
        positions.sort(
            key=lambda row: (
                row["position"]["priority"],
                row["position"]["margin"],
                row["position"]["hash"],
            )
        )
        positions = positions[:100]
        self._write(
            "teacher-positions.json",
            [{"matchId": row["pair"]["matchId"], **row["position"]} for row in positions],
        )
        deadline = self.budget.get_deadline("teacher", 8)
        cases_path = self.directory / "teacher-cases.json"
        cases = self._load(cases_path) if cases_path.is_file() else []
        completed = {(case["matchId"], case["position"]["inputIndex"]) for case in cases}
        for index, row in enumerate(positions):
            if (row["pair"]["matchId"], row["position"]["inputIndex"]) in completed:
                continue
            if time.time() + 190 >= deadline:
                break
            position = row["position"]
            job = {
                "id": f"teacher-{index}",
                "program": self.baseline,
                "replayTeacher": {
                    "record": row["pair"]["record"],
                    "inputIndex": position["inputIndex"],
                    "seat": position["seat"],
                    "expectedInformation": position["information"],
                    "seed": TEACHER_SEED_BASE + index * TEACHER_SEED_STRIDE,
                },
            }
            result = self.batch.run([job], self.directory / "teacher" / str(index) / "search")[0]
            if (
                result.get("valid")
                and result.get("search", {}).get("completed") == 32
                and result.get("alternative") is not None
                and time.time() + CONTINUATION_RESERVE_SECONDS * 2 * SCREEN_PAIRS < deadline
            ):
                root = self.directory / "teacher" / str(index)
                seed = job["replayTeacher"]["seed"]
                continued = self.batch.run(
                    self._continuations(row, result, seed + SCREEN_SEED_OFFSET, SCREEN_PAIRS),
                    root / "comparison",
                )
                summary = summarize_replay_teacher(continued)
                replication = None
                if summary["preferred"]:
                    replication = {
                        "replicated": False,
                        "reason": "Insufficient teacher budget for replication",
                    }
                    if (
                        time.time() + CONTINUATION_RESERVE_SECONDS * 2 * REPLICATION_PAIRS
                        < deadline
                    ):
                        replication = summarize_replay_replication(
                            self.batch.run(
                                self._continuations(
                                    row, result, seed + REPLICATION_SEED_OFFSET, REPLICATION_PAIRS
                                ),
                                root / "replication",
                            ),
                            REPLICATION_PAIRS,
                        )
                replicated = replication is not None and replication["replicated"]
                result = {
                    **result,
                    **summary,
                    "replication": replication,
                    "replicated": replicated,
                    "preference": result["alternative"] if replicated else None,
                }
            cases.append(
                {"matchId": row["pair"]["matchId"], "position": position, "result": result}
            )
            self._write("teacher-cases.json", cases)
        self._write("teacher-cases.json", cases)
        return cases

    def _evolve(self, splits: dict[str, Any], cases: list[dict[str, Any]]) -> dict[str, Any] | None:
        adapter = ReplayTeacherAdapter(
            self.batch.pool,
            PanelConfig(
                cache_dir=self.directory / "cache",
                runtime_fingerprint=self.batch.fingerprint,
                title=self.baseline["title"],
                settings={
                    key: value
                    for key, value in self.baseline.items()
                    if key not in ("rules", "title", "schemaVersion")
                },
            ),
            self.baseline,
            cases,
        )
        reflector = SessionReflection(self.directory / "reflections", timeout=600)
        deadline = self.budget.get_deadline("evolution", 6)
        result = gepa.optimize(
            seed_candidate={"main_rules": json.dumps({"rules": []})},
            trainset=alternating_blocks(
                splits["fitness"], ["certified", "certified", "legacy", "v3"], 26000000
            ),
            valset=alternating_blocks(
                splits["validation"], ["certified", "certified", "legacy", "v3"], 27000000
            ),
            adapter=adapter,
            reflection_lm=reflector,
            reflection_prompt_template=PANEL_REFLECTION_TEMPLATE,
            frontier_type="objective",
            module_selector="round_robin",
            use_merge=True,
            max_merge_invocations=2,
            reflection_minibatch_size=32,
            skip_perfect_score=False,
            max_metric_calls=3000,
            stop_callbacks=lambda _state: time.time() >= deadline or reflector.calls >= 8,
            run_dir=str(self.directory / "gepa"),
            cache_evaluation=False,
            display_progress_bar=False,
            raise_on_exception=True,
            seed=71,
        )
        evaluated = []
        fitness = alternating_blocks(
            splits["fitness"], ["certified", "certified", "legacy", "v3"], 26000000
        )
        control = None
        seen = set()
        rejected = []
        for component in result.candidates:
            if time.time() >= deadline:
                raise TimeoutError("Evolution and selection budget exhausted")
            try:
                program = adapter.assemble(component)
            except (ValueError, TypeError) as error:
                rejected.append({"candidate": component, "reason": str(error)})
                continue
            if program == self.baseline:
                continue
            fingerprint = hashlib.sha256(json.dumps(program, sort_keys=True).encode()).hexdigest()
            if fingerprint in seen:
                continue
            seen.add(fingerprint)
            if control is None:
                control = adapter.evaluate(fitness, {"main_rules": json.dumps({"rules": []})})
            screened = adapter.evaluate(fitness, component)
            screen = adapter.get_screen(program, fitness)
            if not fitness or screen is None:
                rejected.append(
                    {
                        "candidate": component,
                        "status": "rejected-alignment",
                        "reason": "No local FITNESS screen; the alignment audit or validation failed",
                    }
                )
                continue
            control_games = [game for output in control.outputs for game in output["games"]]
            screened_games = [game for output in screened.outputs for game in output["games"]]
            verdict = judge_local_screen(
                screen,
                candidate_invalid=sum(game.get("valid") is not True for game in screened_games),
                baseline_invalid=sum(game.get("valid") is not True for game in control_games),
            )
            evidence = {
                **verdict,
                "localScreen": {
                    name: screen[name]
                    for name in (
                        "changedPositions",
                        "usablePositions",
                        "pairs",
                        "invalidPairs",
                        "refusedPairs",
                        "difference",
                        "approximate95",
                    )
                },
                "fullGameScore": sum(output["fullGameScore"] for output in screened.outputs),
                "baselineFullGameScore": sum(output["fullGameScore"] for output in control.outputs),
            }
            if not verdict["passed"]:
                rejected.append({"candidate": component, **evidence})
                continue
            report = self._compare(
                splits["validation"], program, self.directory / "selection" / fingerprint, 28000000
            )
            eligible = (
                report["weightedPairedDifference"]["mean"] > 0
                and all(
                    item["pairedFailureAsLoss"]["mean"] >= -0.02
                    for item in report["opponents"].values()
                )
                and report["candidateInvalid"] <= report["baselineInvalid"]
            )
            evaluated.append(
                {
                    "program": program,
                    "sha256": fingerprint,
                    "screen": evidence,
                    "report": report,
                    "eligible": eligible,
                }
            )
        self._write("proposal-rejections.json", rejected)
        self._write("selection.json", evaluated)
        eligible = [row for row in evaluated if row["eligible"]]
        if not eligible:
            return None
        eligible.sort(
            key=lambda row: (
                -row["report"]["weightedPairedDifference"]["mean"],
                len(row["program"]["rules"]),
                row["sha256"],
            )
        )
        return eligible[0]["program"]

    def _run_development(
        self, splits: dict[str, Any], cases: list[dict[str, Any]]
    ) -> dict[str, Any]:
        if not any(has_replicated_preference(case) for case in cases):
            return self._report(
                "inconclusive", reason="No replicated teacher preference", positions=len(cases)
            )
        selection = self._get_stage("selection")
        if selection is None:
            evolution_timer = threading.Timer(
                max(0, self.budget.get_deadline("evolution", 6) - time.time()),
                self.batch.pool.cancel,
            )
            evolution_timer.start()
            try:
                candidate = self._evolve(splits, cases)
            finally:
                evolution_timer.cancel()
            self._finish_stage("selection", {"candidate": candidate})
        else:
            candidate = selection["candidate"]
        if candidate is None:
            return self._report("rejected", reason="No candidate passed development guards")
        self._write("selected-program.json", candidate)
        owner = self.confirmation_owner
        claim_id = f"confirmation|{owner}"
        claim = {
            "id": claim_id,
            "pairs": [],
            "run": str(self.directory.resolve()),
            "candidate": candidate,
        }
        existing_claim = self.registry.results.get(claim_id)
        if existing_claim is not None and existing_claim != claim:
            raise ValueError(
                "Confirmation reserve has already been claimed by another candidate or run"
            )
        if existing_claim is None:
            self.registry.append(claim)
        reservation = PanelCheckpoint(
            self.directory / "confirmation-reservation",
            {
                **self.batch.identity,
                "candidate": candidate,
                "baseline": self.baseline,
                "pairs": [
                    {"matchId": row["matchId"], "composition": row["composition"]}
                    for row in splits["confirmation"]
                ],
                "acceptance": "Weighted paired approximate lower95 above zero; certified mean positive; no opponent drop over2pp; no more invalid games",
            },
        )
        reservation.close()
        confirmation = self._get_stage("confirmation")
        if confirmation is None:
            confirmation_timer = threading.Timer(
                max(0, self.budget.get_deadline("confirmation", 8) - time.time()),
                self.batch.pool.cancel,
            )
            confirmation_timer.start()
            try:
                confirmation = self._compare(
                    splits["confirmation"], candidate, self.directory / "confirmation", 29000000
                )
            finally:
                confirmation_timer.cancel()
            self._finish_stage("confirmation", confirmation)
        self._write("confirmation.json", confirmation)
        return self._report(
            "accepted" if confirmation["accepted"] else "rejected", confirmation=confirmation
        )

    def run(self) -> dict[str, Any]:
        started = time.monotonic()
        try:
            completed_confirmation = self._get_stage("confirmation")
            if completed_confirmation is not None:
                return self._report(
                    "accepted" if completed_confirmation["accepted"] else "rejected",
                    confirmation=completed_confirmation,
                )
            if time.time() >= self.deadline:
                return self._report("inconclusive", reason="Campaign compute budget exhausted")
            raw = self._load(self.inputs)
            jobs = [
                {"id": row["matchId"], "program": self.baseline, "inspectReplay": row}
                for row in raw
            ]
            inspected = self._get_stage("inspection")
            if inspected is None:
                inspection_timer = threading.Timer(
                    max(0, self.budget.get_deadline("inspection", 2) - time.time()),
                    self.batch.pool.cancel,
                )
                inspection_timer.start()
                try:
                    inspected = self.batch.run(jobs, self.directory / "inspection")
                finally:
                    inspection_timer.cancel()
                self._finish_stage("inspection", inspected)
            originals = {row["matchId"]: row for row in raw}
            rows = [
                {
                    "matchId": row["id"],
                    "decks": [seat["deck"] for seat in row["record"]["seats"]],
                    "record": row["record"],
                    "positions": row["positions"],
                    "observedAt": originals[row["id"]]["observedAt"],
                }
                for row in inspected
                if row.get("valid") is True
            ]
            excluded = [row for path in self.exclusions for row in self._load(path)]
            campaign_id = str(self.directory.resolve())
            excluded.extend(
                pair
                for entry in self.registry.results.values()
                if entry["id"] != campaign_id
                for pair in entry["pairs"]
            )
            splits = prepare_replay_teacher_splits(rows, excluded)
            self._write("splits.json", splits)
            if not splits["ready"]:
                return self._report(
                    "insufficient-data", collected=len(raw), reproduced=len(rows), **splits
                )
            if campaign_id not in self.registry.results:
                self.registry.append(
                    {
                        "id": campaign_id,
                        "pairs": [
                            {"matchId": row["matchId"], "decks": row["decks"]}
                            for split in ("fitness", "validation", "confirmation")
                            for row in splits[split]
                        ],
                    }
                )
            cases = self._get_stage("teacher")
            if cases is None:
                fitness_jobs = [
                    {
                        "id": pair["matchId"],
                        "program": self.baseline,
                        "capturePositions": True,
                        "inspectReplay": originals[pair["matchId"]],
                    }
                    for pair in splits["fitness"]
                ]
                fitness_positions = {
                    row["id"]: row.get("positions", [])
                    for row in self.batch.run(fitness_jobs, self.directory / "fitness-positions")
                }
                fitness = [
                    {**pair, "positions": fitness_positions[pair["matchId"]]}
                    for pair in splits["fitness"]
                ]
                cases = self._collect_cases(fitness)
                self._finish_stage("teacher", cases)
            return self._run_development(splits, cases)
        except (TimeoutError, CancelledError) as error:
            return self._report("inconclusive", reason=str(error))
        finally:
            attempt = len(self.manifest.results)
            self.manifest.append(
                {"id": f"attempt-{attempt}", "seconds": time.monotonic() - started}
            )

    def run_refinement(self, parent: Path) -> dict[str, Any]:
        parent = parent.resolve()
        if parent == self.directory.resolve():
            raise ValueError("Refinement requires a new run directory")
        self.confirmation_owner = str(parent)
        claimed = self.registry.results.get(f"confirmation|{parent}")
        if claimed is not None and claimed["run"] != str(self.directory.resolve()):
            raise ValueError("The parent confirmation reserve has already been claimed")
        parent_manifest = self._load(parent / "campaign/manifest.json")
        previous = PanelCheckpoint(parent / "campaign", parent_manifest)
        try:
            if self._load(parent / "summary.json")["status"] != "rejected":
                raise ValueError("Refinement requires a completed rejected development campaign")
            if (parent / "confirmation-reservation").exists() or (parent / "confirmation").exists():
                raise ValueError("The parent confirmation reserve has already been opened")
            if parent_manifest["baseline"] != self.baseline:
                raise ValueError("The parent baseline changed")
            if parent_manifest["inputsSha256"] != self._hash(self.inputs):
                raise ValueError("Refinement must retain the original collected inputs")
            for name in ("inspection", "teacher", "selection"):
                entry = previous.results.get(name)
                if entry is None or self._hash(parent / entry["file"]) != entry["sha256"]:
                    raise ValueError(f"Parent completed stage is missing or changed: {name}")
            selection = self._load(parent / previous.results["selection"]["file"])
            if selection["candidate"] is not None:
                raise ValueError("Parent selection must have rejected every candidate")
            splits = self._load(parent / "splits.json")
            sizes = {"fitness": 32, "validation": 64, "confirmation": 320}
            if not splits.get("ready") or any(
                len(splits[name]) != size for name, size in sizes.items()
            ):
                raise ValueError("Parent frozen split sizes changed")
            frozen = [row for name in sizes for row in splits[name]]
            if (
                len({row["matchId"] for row in frozen}) != 416
                or len({_composition(row) for row in frozen}) != 416
            ):
                raise ValueError("Parent frozen splits overlap by ID or deck composition")
            if any(row.get("composition") != _composition(row) for row in frozen):
                raise ValueError("Parent composition fingerprints changed")
            reservation = self.registry.results.get(str(parent))
            expected = [
                {"matchId": row["matchId"], "decks": row["decks"]}
                for split in ("fitness", "validation", "confirmation")
                for row in splits[split]
            ]
            if reservation is None or reservation["pairs"] != expected:
                raise ValueError("Parent splits do not match the global reservation")
            cases = self._load(parent / previous.results["teacher"]["file"])
            fitness_ids = {row["matchId"] for row in splits["fitness"]}
            if any(case["matchId"] not in fitness_ids for case in cases):
                raise ValueError("Teacher cases must come exclusively from FITNESS")
            provenance = PanelCheckpoint(
                self.directory / "refinement",
                {
                    "parent": str(parent),
                    "manifestSha256": self._hash(parent / "campaign/manifest.json"),
                    "splitsSha256": self._hash(parent / "splits.json"),
                    "teacherSha256": previous.results["teacher"]["sha256"],
                    "developmentReuse": True,
                    "confirmationOpened": False,
                },
            )
            provenance.close()
        finally:
            previous.close()
        self._write("splits.json", splits)
        self._write("teacher-cases.json", cases)
        try:
            completed = self._get_stage("confirmation")
            if completed is not None:
                return self._report(
                    "accepted" if completed["accepted"] else "rejected", confirmation=completed
                )
            if time.time() >= self.deadline:
                return self._report("inconclusive", reason="Campaign compute budget exhausted")
            cases = self._backfill_replication(parent, splits, cases)
            self._write("teacher-cases.json", cases)
            return self._run_development(splits, cases)
        except (TimeoutError, CancelledError) as error:
            return self._report("inconclusive", reason=str(error))

    def _backfill_replication(
        self, parent: Path, splits: dict[str, Any], cases: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        completed = self._get_stage("teacher-replication")
        if completed is not None:
            return completed
        missing = [
            index
            for index, case in enumerate(cases)
            if case["result"].get("preferred") is True and "replicated" not in case["result"]
        ]
        if not missing:
            return cases
        positions = self._load(parent / "teacher-positions.json")
        indices = {
            (row["matchId"], row["inputIndex"]): index for index, row in enumerate(positions)
        }
        pairs = {pair["matchId"]: pair for pair in splits["fitness"]}
        deadline = self.budget.get_deadline("teacher", 8)
        timer = threading.Timer(max(0, deadline - time.time()), self.batch.pool.cancel)
        timer.start()
        updated = list(cases)
        try:
            for case_index in missing:
                case = cases[case_index]
                position = case["position"]
                index = indices.get((case["matchId"], position["inputIndex"]))
                if index is None or positions[index] != {"matchId": case["matchId"], **position}:
                    raise ValueError("Parent teacher positions do not match the teacher cases")
                replication = {
                    "replicated": False,
                    "reason": "Insufficient teacher budget for replication",
                }
                if time.time() + CONTINUATION_RESERVE_SECONDS * 2 * REPLICATION_PAIRS < deadline:
                    seed = TEACHER_SEED_BASE + index * TEACHER_SEED_STRIDE + REPLICATION_SEED_OFFSET
                    replication = summarize_replay_replication(
                        self.batch.run(
                            self._continuations(
                                {"pair": pairs[case["matchId"]], "position": position},
                                case["result"],
                                seed,
                                REPLICATION_PAIRS,
                            ),
                            self.directory / "teacher" / str(index) / "replication",
                        ),
                        REPLICATION_PAIRS,
                    )
                replicated = replication["replicated"]
                updated[case_index] = {
                    **case,
                    "result": {
                        **case["result"],
                        "replication": replication,
                        "replicated": replicated,
                        "preference": case["result"]["alternative"] if replicated else None,
                    },
                }
        finally:
            timer.cancel()
        self._finish_stage("teacher-replication", updated)
        return updated

    def close(self) -> None:
        self.timer.cancel()
        self.manifest.close()
        self.registry.close()
        self.batch.close()
