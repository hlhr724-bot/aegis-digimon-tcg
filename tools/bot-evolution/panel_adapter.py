"""GEPA adapter that scores structural heuristic rules with cheap panel games."""

import hashlib
import json
import sys
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol
from uuid import uuid4

from gepa.core.adapter import EvaluationBatch

from panel_program import assemble_program
from panel_splits import block_games

TRACED_LOST_GAMES = 2
TRACES_PER_GAME = 3
TRACED_BLOCKS = 6


class GamePool(Protocol):
    def validate(self, program: dict[str, Any]) -> str | None: ...

    def run(self, jobs: list[dict[str, Any]]) -> list[dict[str, Any]]: ...


@dataclass(frozen=True)
class PanelConfig:
    cache_dir: Path
    runtime_fingerprint: str
    title: str
    settings: dict[str, Any]
    planner: dict[str, Any] | None = None


def game_points(result: dict[str, Any]) -> float:
    if result["win"] is None:
        return 0.5
    return 1.0 if result["win"] else 0.0


def block_score(results: list[dict[str, Any]]) -> float:
    if not results:
        return 0.0
    return sum(
        game_points(result) if result.get("valid") is True else 0.0 for result in results
    ) / len(results)


def _margin(trace: dict[str, Any]) -> float:
    if not trace["alternatives"]:
        return float("inf")
    return trace["chosen"]["score"] - max(item["score"] for item in trace["alternatives"])


def select_traces(traces: list[dict[str, Any]], main: bool) -> list[dict[str, Any]]:
    """The closest decisions show where one rule could flip a choice; the last shows the end."""
    relevant = [
        (index, trace) for index, trace in enumerate(traces) if (trace["kind"] == "main") == main
    ]
    if not relevant:
        return []
    contested = sorted(relevant, key=lambda entry: (_margin(entry[1]), entry[0]))
    chosen = {index for index, _ in contested[: TRACES_PER_GAME - 1]}
    chosen.add(relevant[-1][0])
    return [trace for index, trace in relevant if index in chosen][:TRACES_PER_GAME]


def _deck_summary(deck: dict[str, Any]) -> str:
    counts = Counter(deck["mainDeck"])
    return ", ".join(f"{count}x {card}" for card, count in sorted(counts.items()))


def _features(features: dict[str, float]) -> str:
    return ", ".join(f"{key} {value:g}" for key, value in features.items())


def _action(action: dict[str, Any]) -> str:
    card = f" {action['card']} {action.get('name') or ''}".rstrip() if "card" in action else ""
    return f"{action['label']}{card} (score {action['score']:g}; {_features(action['features'])})"


def _unit(unit: dict[str, Any]) -> str:
    state = ", suspended" if unit["suspended"] else ""
    return f"{unit['card']} {unit.get('name') or ''} {unit['dp']} DP{state}"


def describe_decision(trace: dict[str, Any]) -> str:
    hand = ", ".join(f"{count}x {card}" for card, count in sorted(Counter(trace["hand"]).items()))
    own = "; ".join(_unit(unit) for unit in trace["ownBoard"]) or "empty"
    enemy = "; ".join(_unit(unit) for unit in trace["opponentBoard"]) or "empty"
    alternatives = (
        " | ".join(dict.fromkeys(_action(item) for item in trace["alternatives"])) or "none"
    )
    return (
        f"Turn {trace['turn']}, {trace['kind']} decision, memory {trace['memory']}, "
        f"security {trace['ownSecurity']} vs {trace['opponentSecurity']}. Hand: {hand or 'empty'}. "
        f"Own board: {own}. Opponent board: {enemy}. {trace['legalActions']} legal actions. "
        f"CHOSE {_action(trace['chosen'])}. TOP ALTERNATIVES {alternatives}."
    )


def describe_card(card: str, entry: dict[str, Any]) -> str:
    inherited = f" Inherited: {entry['inherited']}" if entry.get("inherited") else ""
    return (
        f"{card} {entry.get('name')} (level {entry.get('level')}, play cost "
        f"{entry.get('playCost')}, {entry.get('dp')} DP): {entry.get('effect') or 'no effect text'}"
        f"{inherited}"
    )


def _outcome(result: dict[str, Any]) -> str:
    if result.get("valid") is not True:
        return f"invalid game ({result.get('error') or result.get('problem', 'unknown')})"
    if result["win"] is None:
        return f"draw on turn {result['turn']}"
    verdict = "won" if result["win"] else "lost"
    return f"{verdict} on turn {result['turn']} by {result['reason']}"


class PanelAdapter:
    propose_new_texts = None

    def __init__(self, pool: GamePool, config: PanelConfig) -> None:
        self.pool = pool
        self.config = config
        config.cache_dir.mkdir(parents=True, exist_ok=True)
        self.games_played = 0
        self.cache_hits = 0

    def _job(self, program: dict[str, Any], game: dict[str, Any]) -> dict[str, Any]:
        return {
            **game,
            "program": program,
            "planner": self.config.planner,
        }

    def _cache_path(self, job: dict[str, Any]) -> Path:
        payload = json.dumps(
            {"job": job, "runtime": self.config.runtime_fingerprint}, sort_keys=True
        )
        return self.config.cache_dir / f"{hashlib.sha256(payload.encode('utf-8')).hexdigest()}.json"

    def play(
        self, program: dict[str, Any], games: list[dict[str, Any]], trace: bool
    ) -> list[dict[str, Any]]:
        jobs = [self._job(program, game) for game in games]
        paths = [self._cache_path(job) for job in jobs]
        results: list[dict[str, Any] | None] = [None] * len(jobs)
        missing: list[int] = []
        for index, path in enumerate(paths):
            cached = json.loads(path.read_text(encoding="utf-8")) if path.is_file() else None
            if cached is not None and (not trace or "traces" in cached):
                results[index] = cached
                self.cache_hits += 1
            else:
                missing.append(index)
        requests = [
            {**jobs[index], "id": str(index), **({"trace": True} if trace else {})}
            for index in missing
        ]
        for index, result in zip(missing, self.pool.run(requests), strict=True):
            result = {key: value for key, value in result.items() if key != "id"}
            results[index] = result
            self.games_played += 1
            if result.get("valid") is True:
                temporary = paths[index].with_suffix(f".{uuid4().hex}.tmp")
                temporary.write_text(json.dumps(result) + "\n", encoding="utf-8")
                temporary.replace(paths[index])
        complete = [result for result in results if result is not None]
        if trace:
            return complete
        return [
            {key: value for key, value in result.items() if key not in ("traces", "cards")}
            for result in complete
        ]

    def evaluate(
        self,
        batch: list[dict[str, Any]],
        candidate: dict[str, str],
        capture_traces: bool = False,
    ) -> EvaluationBatch:
        assembly = assemble_program(candidate, self.config.title, self.config.settings)
        error = assembly.error
        if assembly.program is not None:
            error = self.pool.validate(assembly.program)
        if error is not None or assembly.program is None:
            outputs = [
                {"block": block, "error": error, "games": [], "score": 0.0} for block in batch
            ]
            return EvaluationBatch(
                outputs=outputs,
                scores=[0.0] * len(batch),
                trajectories=outputs if capture_traces else None,
                objective_scores=[{f"opponent:{block['opponent']}": 0.0} for block in batch],
            )
        games = [block_games(block) for block in batch]
        flat = self.play(
            assembly.program, [game for block in games for game in block], capture_traces
        )
        outputs = []
        for index, block in enumerate(batch):
            results = flat[index * 4 : index * 4 + 4]
            outputs.append(
                {
                    "block": block,
                    "error": None,
                    "games": [
                        {**{key: game[key] for key in ("orientation", "seat", "seed")}, **result}
                        for game, result in zip(games[index], results, strict=True)
                    ],
                    "score": block_score(results),
                }
            )
        print(
            f"Panel evaluated {len(batch)} blocks; {self.games_played} games played, "
            f"{self.cache_hits} cache hits",
            file=sys.stderr,
            flush=True,
        )
        return EvaluationBatch(
            outputs=outputs,
            scores=[output["score"] for output in outputs],
            trajectories=outputs if capture_traces else None,
            objective_scores=[
                {f"opponent:{output['block']['opponent']}": output["score"]} for output in outputs
            ],
        )

    def make_reflective_dataset(
        self,
        candidate: dict[str, str],
        eval_batch: EvaluationBatch,
        components_to_update: list[str],
    ) -> dict[str, list[dict[str, Any]]]:
        trajectories = eval_batch.trajectories or eval_batch.outputs
        traced = [
            index
            for index, output in enumerate(trajectories)
            if any(game.get("win") is False for game in output["games"])
        ][:TRACED_BLOCKS]
        return {
            component: [
                self._record(output, component == "main_rules", index in traced)
                for index, output in enumerate(trajectories)
            ]
            for component in components_to_update
        }

    def _record(self, output: dict[str, Any], main: bool, traced: bool) -> dict[str, Any]:
        block = output["block"]
        inputs = {
            "opponent": block["opponent"],
            "deckA": _deck_summary(block["decks"][0]),
            "deckB": _deck_summary(block["decks"][1]),
        }
        if output["error"] is not None:
            return {
                "Inputs": inputs,
                "Generated Outputs": {"games": "No games were played."},
                "Feedback": (
                    f"The assembled program was rejected before play: {output['error']}. "
                    "Every block scored 0. Fix the JSON so it passes validation."
                ),
            }
        games = output["games"]
        outcomes = "; ".join(
            f"deck {'A' if game['orientation'] == 0 else 'B'} seat {game['seat']}: {_outcome(game)}"
            for game in games
        )
        lost = [game for game in games if game.get("valid") is True and game["win"] is False]
        decisions = []
        cards: dict[str, str] = {}
        for game in lost[:TRACED_LOST_GAMES] if traced else []:
            selected = select_traces(game.get("traces", []), main)
            label = (
                f"Lost game, deck {'A' if game['orientation'] == 0 else 'B'}, seat {game['seat']}"
            )
            decisions.extend(f"{label}. {describe_decision(trace)}" for trace in selected)
            referenced = {
                action["card"]
                for trace in selected
                for action in [trace["chosen"], *trace["alternatives"]]
                if "card" in action
            }
            cards.update(
                {
                    card: describe_card(card, entry)
                    for card, entry in game.get("cards", {}).items()
                    if card in referenced
                }
            )
        wins = sum(1 for game in games if game.get("valid") is True and game["win"] is True)
        valid = sum(1 for game in games if game.get("valid") is True)
        return {
            "Inputs": inputs,
            "Generated Outputs": {
                "outcomes": outcomes,
                **({"lostGameDecisions": decisions} if decisions else {}),
                **({"printedCards": [cards[card] for card in sorted(cards)]} if cards else {}),
            },
            "Feedback": (
                f"Against the {block['opponent']} bot the program won {wins} of {valid} valid games "
                f"(block score {output['score']:.2f}). "
                + (
                    "Study the lost-game decisions: the chosen action, its score, and the top "
                    "alternatives with their action features show which rule could change the choice."
                    if decisions
                    else "No lost game to study in this block."
                )
            ),
        }
