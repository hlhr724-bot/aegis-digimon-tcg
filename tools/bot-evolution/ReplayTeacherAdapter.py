import hashlib
import json
import random
from typing import Any
from uuid import uuid4

from gepa.core.adapter import EvaluationBatch

from allocate_screen_pairs import allocate_screen_pairs
from has_replicated_preference import has_replicated_preference
from local_screen_protocol import (
    LOCAL_SCREEN_EXTRA_REPETITIONS,
    LOCAL_SCREEN_HARVEST_SEED_OFFSET,
    LOCAL_SCREEN_HARVEST_SEED_STRIDE,
    LOCAL_SCREEN_INVALID_DIFFERENCE,
    LOCAL_SCREEN_MAX_POSITIONS,
    LOCAL_SCREEN_MIN_PAIRS_PER_POSITION,
    LOCAL_SCREEN_MIN_USABLE_POSITIONS,
    LOCAL_SCREEN_PAIRS,
    LOCAL_SCREEN_REFUSALS,
    LOCAL_SCREEN_SEED_OFFSET,
    LOCAL_SCREEN_SEED_STRIDE,
)
from panel_adapter import PanelAdapter, PanelConfig
from panel_program import assemble_program, program_settings, split_program
from panel_splits import block_games
from summarize_local_screen import summarize_local_screen


def _is_refusal(row: dict[str, Any]) -> bool:
    error = row.get("error")
    return isinstance(error, str) and any(marker in error for marker in LOCAL_SCREEN_REFUSALS)


class ReplayTeacherAdapter(PanelAdapter):
    def __init__(
        self, pool: Any, config: PanelConfig, baseline: dict[str, Any], cases: list[dict[str, Any]]
    ) -> None:
        super().__init__(pool, config)
        self.baseline = baseline
        self.cases = cases
        self.alignments: dict[str, dict[str, Any]] = {}
        self.screens: dict[str, dict[str, Any]] = {}
        self.recording = False

    def assemble(self, candidate: dict[str, str]) -> dict[str, Any]:
        if set(candidate) != {"main_rules"}:
            raise ValueError("Only appended main rules may evolve")
        component = json.loads(candidate["main_rules"])
        if not isinstance(component, dict):
            raise TypeError("Expected a rules object")
        rules = component.get("rules")
        if not isinstance(rules, list) or len(rules) > 8:
            raise ValueError("At most eight appended rules are allowed")
        if any(
            not isinstance(rule, dict)
            or not isinstance(rule.get("when"), dict)
            or rule["when"].get("kind") != "main"
            for rule in rules
        ):
            raise ValueError("Every appended rule must be scoped to main")
        program = {**self.baseline, "rules": [*self.baseline["rules"], *rules]}
        assembly = assemble_program(
            split_program(program), self.config.title, program_settings(program)
        )
        if assembly.program is None:
            raise ValueError(assembly.error)
        return program

    def evaluate(
        self, batch: list[dict[str, Any]], candidate: dict[str, str], capture_traces: bool = False
    ) -> Any:
        try:
            program = self.assemble(candidate)
        except (ValueError, TypeError, json.JSONDecodeError) as error:
            return super().evaluate(
                batch, {"main_rules": "invalid", "other_rules": str(error)}, capture_traces
            )
        key = self._program_key(program)
        if key not in self.alignments:
            if program == self.baseline:
                self.alignments[key] = {"eligible": True, "baseline": True, "supported": 0}
            else:
                answer = self.pool.run(
                    [
                        {
                            "id": "alignment",
                            "program": program,
                            "teacherAlignment": {
                                "baseline": self.baseline,
                                "cases": self._alignment_cases(),
                            },
                        }
                    ]
                )[0]
                if "eligible" not in answer:
                    raise ValueError(f"Teacher alignment failed: {answer}")
                self.alignments[key] = answer
        alignment = self.alignments[key]
        if not alignment["eligible"]:
            evaluated = super().evaluate(
                batch,
                {
                    "main_rules": "invalid",
                    "other_rules": "No replicated preference became the unique best strategic choice",
                },
                capture_traces,
            )
        else:
            self.recording = program != self.baseline
            try:
                evaluated = super().evaluate(batch, split_program(program), capture_traces)
            finally:
                self.recording = False
        exposure = {"decisions": 0, "main": 0, "triggered": 0, "changed": 0}
        games = [game for output in evaluated.outputs for game in output["games"]]
        for game in games:
            for metric in exposure:
                exposure[metric] += game.get("exposure", {}).get(metric, 0)
        status = "unexercised"
        if not alignment["eligible"]:
            status = "rejected-alignment"
        elif exposure["changed"] > 0:
            status = "exercised"
        blocks = [
            {
                "matchId": block["matchId"],
                "opponent": block["opponent"],
                "seedBase": block["seedBase"],
            }
            for block in batch
        ]
        fingerprint = hashlib.sha256(json.dumps(blocks, sort_keys=True).encode()).hexdigest()
        scores = evaluated.scores
        screen = None
        playable = alignment["eligible"] and all(
            output["error"] is None for output in evaluated.outputs
        )
        if playable and program == self.baseline:
            scores = [0.5] * len(batch)
        elif playable:
            screen_key = f"{key}-{fingerprint}"
            if screen_key not in self.screens:
                self.screens[screen_key] = self._screen(program, evaluated.outputs, blocks)
            screen = self.screens[screen_key]
            scores = screen["blockScores"]
        outputs = [
            {
                **output,
                "games": [
                    {name: value for name, value in game.items() if name != "replay"}
                    for game in output["games"]
                ],
                "fullGameScore": output["score"],
                "score": score,
            }
            for output, score in zip(evaluated.outputs, scores, strict=True)
        ]
        evidence = {
            "program": program,
            "alignment": alignment,
            "exposure": exposure,
            "games": len(games),
            "missingExposure": sum("exposure" not in game for game in games),
            "validGames": sum(game.get("valid") is True for game in games),
            "invalidGames": sum(game.get("valid") is not True for game in games),
            "status": status,
            "blocks": blocks,
            "scores": scores,
            "fullGameScores": evaluated.scores,
            "localScreen": screen,
        }
        directory = self.config.cache_dir.parent / "candidate-diagnostics"
        directory.mkdir(parents=True, exist_ok=True)
        destination = directory / f"{key}-{fingerprint}.json"
        temporary = destination.with_suffix(".tmp")
        temporary.write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")
        temporary.replace(destination)
        return EvaluationBatch(
            outputs=outputs,
            scores=scores,
            trajectories=outputs if capture_traces else None,
            objective_scores=[
                {f"opponent:{output['block']['opponent']}": output["score"]} for output in outputs
            ],
        )

    def get_screen(
        self, program: dict[str, Any], batch: list[dict[str, Any]]
    ) -> dict[str, Any] | None:
        blocks = [
            {
                "matchId": block["matchId"],
                "opponent": block["opponent"],
                "seedBase": block["seedBase"],
            }
            for block in batch
        ]
        fingerprint = hashlib.sha256(json.dumps(blocks, sort_keys=True).encode()).hexdigest()
        return self.screens.get(f"{self._program_key(program)}-{fingerprint}")

    def _program_key(self, program: dict[str, Any]) -> str:
        return hashlib.sha256(json.dumps(program, sort_keys=True).encode()).hexdigest()

    def _screen(
        self,
        program: dict[str, Any],
        outputs: list[dict[str, Any]],
        blocks: list[dict[str, Any]],
    ) -> dict[str, Any]:
        ordering = json.dumps(sorted(blocks, key=lambda row: row["seedBase"]), sort_keys=True)
        sampling_seed = int(hashlib.sha256(ordering.encode()).hexdigest()[:16], 16)
        capacity = min(
            LOCAL_SCREEN_MAX_POSITIONS, LOCAL_SCREEN_PAIRS // LOCAL_SCREEN_MIN_PAIRS_PER_POSITION
        )
        outcomes: dict[tuple[int, int], tuple[str, float]] = {}
        usable: list[dict[str, Any]] = []
        refused: list[dict[str, Any]] = []
        skips: dict[str, int] = {}
        harvest = []
        unprobed = 0
        scored: list[dict[str, Any]] = []
        repetition = 0
        while True:
            if repetition == 0:
                played = outputs
            else:
                played = self._harvest(program, outputs, repetition)
            positions = self._positions(played, skips, repetition)
            random.Random(sampling_seed + repetition).shuffle(positions)
            rank = len(scored) + sum(row["positions"] for row in harvest)
            for offset, position in enumerate(positions):
                position["rank"] = rank + offset
            if repetition == 0:
                scored = positions
            probed = 0
            found = len(usable)
            while len(usable) < capacity and probed < len(positions):
                chunk = positions[probed : probed + capacity - len(usable)]
                probed += len(chunk)
                outcomes.update(self._continue(outputs, [(position, 0) for position in chunk]))
                for position in chunk:
                    if outcomes[(position["rank"], 0)][0] == "refused":
                        refused.append(position)
                    else:
                        usable.append(position)
            unprobed += len(positions) - probed
            if repetition > 0:
                harvest.append(
                    {
                        "repetition": repetition,
                        "games": sum(len(output["games"]) for output in played),
                        "positions": len(positions),
                        "probed": probed,
                        "usable": len(usable) - found,
                    }
                )
            if (
                len(usable) >= LOCAL_SCREEN_MIN_USABLE_POSITIONS
                or repetition >= LOCAL_SCREEN_EXTRA_REPETITIONS
            ):
                break
            repetition += 1
        allocation = allocate_screen_pairs(
            len(usable),
            budget=LOCAL_SCREEN_PAIRS,
            minimum=LOCAL_SCREEN_MIN_PAIRS_PER_POSITION,
            maximum=capacity,
        )
        outcomes.update(
            self._continue(
                outputs,
                [
                    (position, pair)
                    for position, count in zip(usable, allocation, strict=True)
                    for pair in range(1, count)
                ],
            )
        )
        details = []
        for position, count in [
            *zip(usable, allocation, strict=True),
            *((position, 1) for position in refused),
        ]:
            kinds = [outcomes[(position["rank"], pair)] for pair in range(count)]
            details.append(
                {
                    **{
                        name: position[name]
                        for name in (
                            "rank",
                            "repetition",
                            "block",
                            "matchId",
                            "opponent",
                            "orientation",
                            "gameSeed",
                            "seat",
                            "inputIndex",
                            "turn",
                            "candidateAction",
                            "baselineAction",
                        )
                    },
                    "allocatedPairs": count,
                    "differences": [value for kind, value in kinds if kind != "refused"],
                    "invalidPairs": sum(kind == "invalid" for kind, _ in kinds),
                    "refusedPairs": sum(kind == "refused" for kind, _ in kinds),
                }
            )
        changed = [0] * len(outputs)
        for position in scored:
            changed[position["block"]] += 1
        return {
            **summarize_local_screen(
                changed, [len(output["games"]) for output in outputs], details
            ),
            "changedPositions": len(scored),
            "harvestedPositions": sum(row["positions"] for row in harvest),
            "harvest": harvest,
            "changedPositionSkips": skips,
            "probedPositions": len(usable) + len(refused),
            "refusedPositions": len(refused),
            "unprobedPositions": unprobed,
            "samplingSeed": sampling_seed,
            "positions": details,
        }

    def _harvest(
        self, program: dict[str, Any], outputs: list[dict[str, Any]], repetition: int
    ) -> list[dict[str, Any]]:
        harvested = []
        self.recording = True
        try:
            for output in outputs:
                block = {
                    **output["block"],
                    "seedBase": output["block"]["seedBase"]
                    + LOCAL_SCREEN_HARVEST_SEED_OFFSET
                    + repetition * LOCAL_SCREEN_HARVEST_SEED_STRIDE,
                }
                games = block_games(block)
                results = self.play(program, games, False)
                harvested.append(
                    {
                        **output,
                        "games": [
                            {
                                **{key: game[key] for key in ("orientation", "seat", "seed")},
                                **result,
                            }
                            for game, result in zip(games, results, strict=True)
                        ],
                    }
                )
        finally:
            self.recording = False
        return harvested

    def _positions(
        self, played: list[dict[str, Any]], skips: dict[str, int], repetition: int
    ) -> list[dict[str, Any]]:
        positions = []
        for block, output in enumerate(played):
            for game in output["games"]:
                for reason, count in game.get("changedPositionSkips", {}).items():
                    skips[reason] = skips.get(reason, 0) + count
                positions.extend(
                    {
                        **position,
                        "repetition": repetition,
                        "block": block,
                        "matchId": output["block"]["matchId"],
                        "opponent": output["block"]["opponent"],
                        "orientation": game["orientation"],
                        "gameSeed": game["seed"],
                        "record": game["replay"],
                    }
                    for position in game.get("changedPositions", [])
                )
        positions.sort(key=lambda position: (position["gameSeed"], position["inputIndex"]))
        return positions

    def _panel_game(self, block: dict[str, Any], orientation: int, seat: int) -> dict[str, Any]:
        game = next(
            game
            for game in block_games(block)
            if game["orientation"] == orientation and game["seat"] == seat
        )
        job = self._job(self.baseline, game)
        return {
            **{
                key: job[key]
                for key in (
                    "opponent",
                    "opponentProgram",
                    "activationMemoryCosts",
                    "decisionContext",
                    "opponentActivationMemoryCosts",
                    "opponentDecisionContext",
                )
                if key in job
            },
            "deck": job["decks"][1],
        }

    def _continue(
        self, outputs: list[dict[str, Any]], requests: list[tuple[dict[str, Any], int]]
    ) -> dict[tuple[int, int], tuple[str, float]]:
        jobs = [
            {
                "id": f"{position['rank']}|{pair}|{arm}",
                "program": self.baseline,
                "replayContinuation": {
                    "record": position["record"],
                    "inputIndex": position["inputIndex"],
                    "seat": position["seat"],
                    "expectedInformation": position["information"],
                    "sampleSeed": LOCAL_SCREEN_SEED_OFFSET
                    + position["rank"] * LOCAL_SCREEN_SEED_STRIDE
                    + pair,
                    "action": position[f"{arm}Action"],
                    "panelGame": self._panel_game(
                        outputs[position["block"]]["block"],
                        position["orientation"],
                        position["seat"],
                    ),
                },
            }
            for position, pair in requests
            for arm in ("candidate", "baseline")
        ]
        rows = {}
        missing = []
        for job in jobs:
            path = self._cache_path({name: value for name, value in job.items() if name != "id"})
            if path.is_file():
                rows[job["id"]] = json.loads(path.read_text(encoding="utf-8"))
            else:
                missing.append((job, path))
        answers = self.pool.run([job for job, _ in missing]) if missing else []
        for (job, path), row in zip(missing, answers, strict=True):
            rows[job["id"]] = row
            if "error" not in row or _is_refusal(row):
                temporary = path.with_suffix(f".{uuid4().hex}.tmp")
                temporary.write_text(json.dumps(row) + "\n", encoding="utf-8")
                temporary.replace(path)
        outcomes = {}
        for position, pair in requests:
            candidate = rows[f"{position['rank']}|{pair}|candidate"]
            baseline = rows[f"{position['rank']}|{pair}|baseline"]
            if _is_refusal(candidate) or _is_refusal(baseline):
                outcomes[(position["rank"], pair)] = ("refused", 0.0)
            elif candidate.get("valid") is True and baseline.get("valid") is True:
                outcomes[(position["rank"], pair)] = (
                    "valid",
                    candidate["reward"] - baseline["reward"],
                )
            else:
                outcomes[(position["rank"], pair)] = ("invalid", LOCAL_SCREEN_INVALID_DIFFERENCE)
        return outcomes

    def _alignment_cases(self) -> list[dict[str, Any]]:
        return [
            {
                **case,
                "result": {**case["result"], "preferred": has_replicated_preference(case)},
            }
            for case in self.cases
        ]

    def _job(self, program: dict[str, Any], game: dict[str, Any]) -> dict[str, Any]:
        job = super()._job(program, game)
        if game["opponent"] == "v3":
            job["opponentProgram"] = self.baseline
        return {
            **job,
            **({"recordReplay": True} if self.recording else {}),
            "diagnosticBaseline": self.baseline,
            "activationMemoryCosts": True,
            "decisionContext": True,
            "opponentActivationMemoryCosts": True,
            "opponentDecisionContext": True,
        }

    def make_reflective_dataset(
        self, candidate: dict[str, str], eval_batch: Any, components_to_update: list[str]
    ) -> dict[str, Any]:
        records = super().make_reflective_dataset(candidate, eval_batch, components_to_update)
        examples = []
        cards = {}
        for case in self.cases:
            result = case["result"]
            context = result.get("context", {})
            actions = []
            for action in context.get("actions", []):
                card = action.get("card")
                if card:
                    cards[card["cardId"]] = card
                actions.append(
                    {
                        "index": action["index"],
                        "label": action.get("label"),
                        "cardId": card.get("cardId") if card else None,
                        "features": {
                            key: value
                            for key, value in action.get("features", {}).items()
                            if value != 0
                        },
                    }
                )
            observation = context.get("observation", {})
            players = []
            for player in observation.get("players", []):
                compact = {
                    key: value
                    for key, value in player.items()
                    if key not in ("hand", "trash", "delay", "faceUpSecurity", "board", "breeding")
                }
                for zone in ("hand", "trash", "delay", "faceUpSecurity"):
                    compact[zone] = [card.get("cardId") for card in player.get(zone, [])]
                compact["board"] = [
                    {
                        "cardId": unit["top"].get("cardId"),
                        "dp": unit["dp"],
                        "suspended": unit["suspended"],
                        "statuses": unit.get("statuses"),
                    }
                    for unit in player.get("board", [])
                ]
                breeding = player.get("breeding")
                compact["breeding"] = breeding["top"].get("cardId") if breeding else None
                players.append(compact)
            examples.append(
                {
                    "position": case["position"],
                    "context": {
                        "observation": {
                            key: value
                            for key, value in observation.items()
                            if key in ("seat", "turn", "memory", "phase")
                        },
                        "players": players,
                        "actions": actions,
                    },
                    **{
                        key: value
                        for key, value in result.items()
                        if key
                        in (
                            "valid",
                            "baseline",
                            "alternative",
                            "preferred",
                            "preference",
                            "replicated",
                            "replication",
                            "difference",
                            "approximate95",
                            "policyMeans",
                            "limitation",
                        )
                    },
                }
            )
        for entries in records.values():
            if entries:
                entries[0]["Inputs"]["replayTeacherCases"] = examples
                entries[0]["Inputs"]["replayTeacherCards"] = cards
            for entry in entries:
                entry["Feedback"] += (
                    " Preserve all baseline rules. Return only a JSON object with rules containing at most eight NEW main-phase rules. "
                    "All teacher cases appear once in the first record, including negative, inconclusive and invalid comparisons. "
                    "Use every legal competing action, not just the teacher pair. "
                    "A proposal must make at least one replicated preference the unique best strategic choice before games run; identical hand Tamer copies are equivalent, other action ties fail. "
                    "Only cases with replicated true carry a preference; preferred alone is an unreplicated 32-sample screen and is usually noise. "
                    "Teacher cases are exploratory advice, not human ground truth or fitness. "
                    "Do not infer hidden card identities or claim certified improvements from them. "
                    "Block scores are 0.5 plus the estimated game-point change caused by the proposal's changed choices, "
                    "measured by paired continuations from each changed position; 0.5 means no measured change and "
                    "the outcomes list shows the full games."
                )
        return records
