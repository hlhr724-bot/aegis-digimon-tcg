"""Official GEPA adapter for bounded heuristic programs executed by the real engine."""

import hashlib
import json
import subprocess
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from threading import Lock
from typing import Any
from uuid import uuid4

from gepa.core.adapter import EvaluationBatch

from evidence import policy_hash, program_hash


@dataclass(frozen=True)
class EvaluationConfig:
    node: str
    worker: Path
    run_dir: Path
    engine_sha256: str
    simulations: int
    desktop_host: str | None = None
    timeout: int = 7200
    workers: int = 4
    cache_dir: Path | None = None
    desktop_wsl_args: tuple[str, ...] = ()
    rollout_turns: int | None = None
    teacher: dict[str, int] | None = None


def _nonzero(features: dict[str, float]) -> dict[str, float]:
    return {key: value for key, value in features.items() if value != 0}


def _disagreement(trace: dict[str, Any]) -> dict[str, Any]:
    teacher = trace["teacher"]
    preferred = teacher["root"][0]
    return {
        "turn": trace.get("turn"),
        "chosen": {
            "sourceCardId": trace.get("sourceCardId"),
            "visitShare": teacher["chosenVisits"] / teacher["simulations"],
            "features": _nonzero(trace.get("features", {})),
        },
        "preferred": {
            "sourceCardId": preferred.get("sourceCardId"),
            "visitShare": preferred["visits"] / teacher["simulations"],
            "meanReward": preferred["meanReward"],
            "features": _nonzero(preferred.get("features", {})),
        },
    }


class HeuristicAdapter:
    # GEPA 0.0.27 accesses this optional protocol member directly.
    propose_new_texts = None

    def __init__(self, config: EvaluationConfig, metadata: dict[str, Any]) -> None:
        if config.desktop_wsl_args not in ((), ("--system", "-d", "Ubuntu")) or metadata.get(
            "desktopWslArgs", []
        ) != list(config.desktop_wsl_args):
            raise ValueError("Freeze an ordinary or system Ubuntu WSL transport prefix")
        if config.desktop_host is None and not config.worker.is_file():
            raise ValueError("Build shared and API packages before evolution")
        self.config = config
        self.metadata = metadata
        if not 1 <= config.workers <= 4:
            raise ValueError("Use 1–4 bounded desktop evaluation workers")
        if config.rollout_turns is not None and not 1 <= config.rollout_turns <= 200:
            raise ValueError("Rollout bounds must be from 1 to 200 turns")
        self.call_lock = Lock()
        if config.cache_dir is not None:
            config.cache_dir.mkdir(parents=True, exist_ok=True)
        self.config.run_dir.mkdir(parents=True, exist_ok=True)
        self.calls = max(
            (int(path.name.split("-", 1)[0]) for path in config.run_dir.glob("[0-9]*-*.*")),
            default=0,
        )

    def evaluate(
        self,
        batch: list[dict[str, Any]],
        candidate: dict[str, str],
        capture_traces: bool = False,
    ) -> EvaluationBatch:
        batch_size = self.metadata.get(
            "residualBatchSize", self.metadata.get("balancedBatchSize", 1)
        )
        if not isinstance(batch_size, int) or not 1 <= batch_size <= 32:
            raise ValueError("Use 1–32 isolated balanced games per transport batch")
        if batch_size > 1 and any(
            task.get("opponent") != "balanced"
            and not (
                self.metadata.get("residualBatchSize") is not None
                and task.get("opponent") == "heuristic"
                and task.get("opponentProgram", {}).get("basePolicy") == "projected-balanced"
            )
            for task in batch
        ):
            raise ValueError("Transport batching is restricted to balanced-control games")
        heuristic_batch_size = self.metadata.get("heuristicBatchSize")
        if heuristic_batch_size is not None and (
            batch_size > 1
            or not isinstance(heuristic_batch_size, int)
            or not 1 <= heuristic_batch_size <= 32
        ):
            raise ValueError("Use 1–32 heuristic games per batch without balanced batching")
        if heuristic_batch_size is None:
            groups = [
                list(range(index, min(index + batch_size, len(batch))))
                for index in range(0, len(batch), batch_size)
            ]
        else:
            # Search games stay one per process; heuristic games share a process.
            heuristic = [
                index for index, task in enumerate(batch) if task.get("opponent") == "heuristic"
            ]
            groups = [
                [index] for index, task in enumerate(batch) if task.get("opponent") != "heuristic"
            ] + [
                heuristic[index : index + heuristic_batch_size]
                for index in range(0, len(heuristic), heuristic_batch_size)
            ]
        with ThreadPoolExecutor(max_workers=self.config.workers) as pool:
            grouped_outputs = list(
                pool.map(
                    lambda indices: self._evaluate_games(
                        [batch[index] for index in indices],
                        candidate,
                        capture_traces,
                        batch_size > 1 or len(indices) > 1,
                    ),
                    groups,
                )
            )
        outputs = [None] * len(batch)
        for indices, group in zip(groups, grouped_outputs, strict=True):
            for index, output in zip(indices, group, strict=True):
                outputs[index] = output
        if not all(output.get("valid") is True for output in outputs):
            raise RuntimeError(
                "Incomplete evaluation batch; invalid games are not fitness losses. Inspect game artifacts and resume after diagnosis."
            )
        return EvaluationBatch(
            outputs=outputs,
            scores=[output["score"] for output in outputs],
            trajectories=outputs if capture_traces else None,
        )

    def evaluate_game(
        self, task: dict[str, Any], candidate: dict[str, str], capture_traces: bool
    ) -> dict[str, Any]:
        return self._evaluate_games([task], candidate, capture_traces, False)[0]

    def _evaluate_games(self, tasks, candidate, capture_traces, batched):
        try:
            program = json.loads(candidate.get("heuristic", ""))
        except json.JSONDecodeError as error:
            return [
                {
                    "score": None,
                    "valid": False,
                    "status": "invalid",
                    "error": f"Invalid candidate JSON: {error}",
                }
                for _ in tasks
            ]
        requests = []
        outputs = [None] * len(tasks)
        for index, task in enumerate(tasks):
            with self.call_lock:
                self.calls += 1
                call_index = self.calls
            payload = {
                **task,
                "program": program,
                "simulations": self.config.simulations,
                "captureTraces": capture_traces,
                "engineSha256": self.config.engine_sha256,
            }
            if self.config.rollout_turns is not None and task.get("opponent") == "mcts":
                payload["mctsRolloutTurns"] = self.config.rollout_turns
            advised = capture_traces and self.config.teacher is not None
            if advised:
                payload["teacher"] = self.config.teacher
            # Advisory searches never change the played game, so they share its cache entry.
            fingerprint = hashlib.sha256(
                json.dumps(
                    {
                        key: value
                        for key, value in payload.items()
                        if key not in ("captureTraces", "teacher")
                    },
                    sort_keys=True,
                ).encode("utf-8")
            ).hexdigest()
            cache = (
                None
                if self.config.cache_dir is None
                else self.config.cache_dir / f"{fingerprint}.json"
            )
            request = {
                "index": index,
                "task": task,
                "payload": payload,
                "cache": cache,
                "fingerprint": fingerprint,
                "artifact": self.config.run_dir / f"{call_index:05d}-{fingerprint[:12]}.json",
            }
            if cache is not None and cache.is_file():
                cached = json.loads(cache.read_text(encoding="utf-8"))
                output = cached["output"]
                if (
                    cached["payloadSha256"] == fingerprint
                    and output.get("valid") is True
                    and output.get("engineSha256") == self.config.engine_sha256
                    and (not capture_traces or bool(output.get("traces")))
                    and (not advised or output.get("teacher") is not None)
                ):
                    output["cacheHit"] = True
                    outputs[index] = self._save_game(output, request, program)
                    continue
            requests.append(request)
        if not requests:
            return outputs
        log = requests[0]["artifact"].with_suffix(".stderr.log")
        command = [self.config.node, "--max-old-space-size=1024", str(self.config.worker)]
        if batched:
            command.append("--batch")
        if self.config.desktop_host is not None:
            command = [
                "ssh",
                "-o",
                "BatchMode=yes",
                self.config.desktop_host,
                "wsl.exe",
                *self.config.desktop_wsl_args,
                "-e",
                "timeout",
                "--signal=TERM",
                "--kill-after=10",
                str(self.config.timeout),
                *command,
            ]
        payloads = [request["payload"] for request in requests]
        try:
            with log.open("w", encoding="utf-8") as stderr:
                result = subprocess.run(
                    command,
                    input=json.dumps(payloads if batched else payloads[0]),
                    text=True,
                    stdout=subprocess.PIPE,
                    stderr=stderr,
                    timeout=self.config.timeout + 30,
                    check=False,
                )
        except subprocess.TimeoutExpired as error:
            for request in requests:
                self._save_game(
                    {
                        "valid": False,
                        "score": None,
                        "status": "timed-out",
                        "error": "Evaluation transport deadline expired",
                    },
                    request,
                    program,
                )
            raise TimeoutError(f"Evaluation transport deadline expired; see {log}") from error
        if result.returncode in (124, 137):
            for request in requests:
                self._save_game(
                    {
                        "valid": False,
                        "score": None,
                        "status": "timed-out",
                        "error": "Desktop evaluation deadline expired",
                    },
                    request,
                    program,
                )
            raise TimeoutError(f"Desktop evaluation deadline expired; worker reaped; see {log}")
        if not result.stdout.strip():
            raise RuntimeError(f"Engine worker exited {result.returncode} without JSON; see {log}")
        response = json.loads(result.stdout)
        if isinstance(response, dict) and "engine changed" in response.get("error", ""):
            raise RuntimeError(response["error"])
        if result.returncode not in (0, 1):
            raise RuntimeError(f"Engine worker crashed with exit {result.returncode}; see {log}")
        game_outputs = response if batched else [response]
        if not isinstance(game_outputs, list) or len(game_outputs) != len(requests):
            raise RuntimeError(f"Incomplete transport batch; see {log}")
        for request, output in zip(requests, game_outputs, strict=True):
            if "engine changed" in output.get("error", ""):
                raise RuntimeError(output["error"])
            if (
                batched
                and output.get("valid") is True
                and (
                    output.get("seed") != request["task"]["seed"]
                    or output.get("learnerSeat") != request["task"]["learnerSeat"]
                    or output.get("decks") != request["task"]["decks"]
                    or output.get("opponent")
                    != (
                        "coevolved-heuristic"
                        if request["task"].get("opponent") == "heuristic"
                        else "projected-balanced"
                    )
                )
            ):
                raise RuntimeError("Transport batch returned a different game or control")
            outputs[request["index"]] = self._save_game(output, request, program)
        return outputs

    def _save_game(self, output, request, program):
        if output.get("valid") is not True:
            output["score"] = None
            output["status"] = (
                "timed-out"
                if (output.get("status") == "timed-out" or output.get("result", {}).get("timedOut"))
                else "invalid"
            )
        else:
            output["status"] = "played"
        output.update(
            {
                "policySha256": policy_hash(program),
                "task": request["task"],
                "candidateSha256": program_hash(program),
                "engineSha256": self.config.engine_sha256,
            }
        )
        artifact = request["artifact"].with_suffix(f".{uuid4().hex}.tmp")
        artifact.write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
        artifact.replace(request["artifact"])
        cache = request["cache"]
        if cache is not None and output.get("valid") is True and not output.get("cacheHit"):
            temporary = cache.with_suffix(f".{uuid4().hex}.tmp")
            temporary.write_text(
                json.dumps({"payloadSha256": request["fingerprint"], "output": output}, indent=2)
                + "\n",
                encoding="utf-8",
            )
            temporary.replace(cache)
        return output

    def make_reflective_dataset(
        self,
        candidate: dict[str, str],
        eval_batch: EvaluationBatch,
        components_to_update: list[str],
    ) -> dict[str, list[dict[str, Any]]]:
        records = []
        rich = self.metadata.get("feedbackMode") == "rich"
        for output in eval_batch.outputs:
            result = output.get("result", {})
            traces = output.get("traces", [])
            # Eight evenly spaced decisions keep development as well as the ending.
            thin_traces = (
                [
                    traces[index]
                    for index in sorted({round(n * (len(traces) - 1) / 7) for n in range(8)})
                ]
                if traces
                else []
            )
            thin_traces = [
                {
                    **{
                        key: trace[key]
                        for key in (
                            "kind",
                            "turn",
                            "action",
                            "sourceCardId",
                            "score",
                            "topScoreTies",
                        )
                        if key in trace
                    },
                    "features": {
                        key: value for key, value in trace.get("features", {}).items() if value != 0
                    },
                    "alternatives": [
                        {
                            key: item[key]
                            for key in ("action", "sourceCardId", "score")
                            if key in item
                        }
                        for item in trace.get("alternatives", [])
                    ],
                }
                for trace in thin_traces
            ]
            disagreements = [
                _disagreement(trace)
                for trace in traces
                if trace.get("teacher", {}).get("simulations")
                and trace["teacher"]["root"][0]["visits"] > 2 * trace["teacher"]["chosenVisits"]
            ][:6]
            records.append(
                {
                    "Inputs": {
                        "match": output.get("task"),
                        "legalFeatures": self.metadata["features"],
                        "deckCards": self.metadata.get("cards", []) if rich else [],
                    },
                    "Generated Outputs": {
                        **({"rules": candidate["heuristic"]} if rich else {}),
                        "decisions": traces if rich else thin_traces,
                        "blockedIntents": json.loads(candidate["heuristic"]).get(
                            "blockedIntents", []
                        ),
                        **({"teacherDisagreements": disagreements} if disagreements else {}),
                    },
                    "Feedback": {
                        "score": output.get("score", 0),
                        "valid": output.get("valid", False),
                        "winnerSeat": result.get("winnerSeat"),
                        "reason": result.get("reason"),
                        "engineErrors": result.get("errors", []),
                        "error": output.get("error"),
                        "rejections": result.get("rejections", []),
                        "searchBudget": [
                            {key: search[key] for key in ("requested", "completed", "invalid")}
                            for search in output.get("searches", [])
                        ],
                        "goal": "Improve valid completed-game win rate. Invalid games and timeouts are unscored.",
                    },
                }
            )
        return {component: records for component in components_to_update}


REFLECTION_TEMPLATE = """Evolve a Digimon Card Game heuristic bot from real game feedback.
The candidate is a JSON object, never executable code or a prompt used during play.
Current candidate:
<curr_instructions>
Game traces and feedback:
<inputs_outputs_feedback>

Return exactly one improved JSON object inside a single fenced code block.
Focus on structural edits: when conditions and sourceCardIds. Keep calibrated numeric
weights for existing features; numeric optimization is performed separately by code.
You may add a top-level blockedIntents list of plain-English strategies that the allowed
features cannot express. These are recorded for research and never used during scoring.
If the current object has basePolicy:"projected-balanced", preserve that field.
That mode starts with the current balanced action score; your rules ADD adjustments to it.
A zero rule is inactive. Re-author its advice when activating it. Do not replace the
whole baseline or optimize ties against the old weak generic program.
Schema: {"schemaVersion":1,"basePolicy":optional "projected-balanced","title":"English title (1-120 characters)","rules":[
 {"feature":"allowed feature name","weight":finite number in [-10000,10000],
  "advice":"Accurate plain English advice explaining this rule (1-600 characters)",
  "when":optional {"kind":"main or a decision kind", "sourceCardIds":["exact catalog card ids"],
                   "minimum":{"feature":number},"maximum":{"feature":number}}}]}
Use 1-100 rules. Conditions are conjunctions; each matching rule adds weight*feature
to the action score. Highest score wins; exact ties use reproducible seeded random choices.
Only allowed features listed in Inputs exist. Counts and DP are public; DP features
use thousands of DP. Cost/handover are memory units. Lethal means an opportunity to
attack zero security, not guaranteed victory. Opposing blockers/counters still resolve.
Use conditional rules to improve context and card-specific pilots; a constant feature
without a condition cannot distinguish actions. Never invent printed card effects.
teacherDisagreements, when present, list decisions where a short search from your seat
preferred another action; treat them as noisy hints about a pattern, never as ground truth.
Use game evidence to diagnose poor passing, wasted costs, bad attacks, poor development,
or optional selections. Advice must match the actual weight and conditions. Do not
mention GEPA, code, JSON, or weights in advice intended for players.
"""
