import json
from pathlib import Path

from evidence import paired_evidence, policy_hash


class PilotProposer:
    def __init__(
        self,
        *,
        adapter,
        programs: list[dict],
        generic: dict,
        tasks: list[dict],
        directory: Path,
        alpha: float,
        origin: str = "deterministic-structural",
    ) -> None:
        if len(tasks) < 48 or len({task["seed"] for task in tasks}) < 24:
            raise ValueError("Pilot screens require at least 48 same-seed games")
        self.adapter = adapter
        self.programs = programs
        self.generic = generic
        self.tasks = tasks
        self.directory = directory
        self.alpha = alpha
        self.origin = origin
        self.calls = 0
        self.failure: Exception | None = None
        directory.mkdir(parents=True, exist_ok=True)
        if list(directory.glob("proposal-*.json")):
            raise ValueError("Partial pilot stages require a fresh run directory")
        if (
            not programs
            or not 0 < alpha < 1
            or len({policy_hash(program) for program in programs}) != len(programs)
            or any(
                program.get("basePolicy") != generic.get("basePolicy")
                or program["rules"][:-1] != generic["rules"]
                or program["rules"][-1].get("weight") == 0
                or not program["rules"][-1].get("when", {}).get("sourceCardIds")
                for program in programs
            )
        ):
            raise ValueError("Freeze distinct card-scoped pilots preserving every generic rule")

    def exhausted(self, state=None) -> bool:
        return self.calls == len(self.programs)

    def __call__(self, candidate, dataset, components) -> dict:
        try:
            return self._propose(candidate)
        except Exception as error:
            self.failure = error
            raise

    def _propose(self, candidate) -> dict:
        if self.exhausted():
            return candidate
        program = self.programs[self.calls]
        self.calls += 1
        path = self.directory / f"proposal-{self.calls:04d}.json"
        record = {
            "origin": self.origin,
            "proposalNumber": self.calls,
            "program": program,
            "control": self.generic,
            "tasks": self.tasks,
            "status": "reserved",
            "apiCalls": 0,
        }
        path.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
        selected = self.adapter.evaluate(self.tasks, {"heuristic": json.dumps(program)}).outputs
        control = self.adapter.evaluate(self.tasks, {"heuristic": json.dumps(self.generic)}).outputs
        record.update(
            status="evaluated",
            selected=selected,
            controlGames=control,
            pairedEvidence=paired_evidence(
                selected, control, alpha=self.alpha, method="wilson-wins"
            ),
        )
        path.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
        return (
            {"heuristic": json.dumps(program)}
            if record["pairedEvidence"]["accepted"]
            else candidate
        )
