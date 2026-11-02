"""Auditable API reflection with a completion limit and a conservative run-wide spend cap."""

import fcntl
import hashlib
import json
import math
from pathlib import Path

from litellm import completion


def validate_ledger(budget: dict, config: dict) -> None:
    """One immutable total cap across explicitly priced provider configurations."""
    configurations = budget.get("configurations", [budget["config"]])
    if (
        budget["config"]["dollarCap"] != config["dollarCap"]
        or not math.isfinite(budget["reservedUsd"])
        or not 0 <= budget["reservedUsd"] <= config["dollarCap"]
        or any(saved["model"] == config["model"] and saved != config for saved in configurations)
    ):
        raise ValueError("Reflection budget configuration changed or total cap exceeded")


class ApiReflection:
    def __init__(
        self,
        directory: Path,
        ledger: Path,
        *,
        model: str,
        completion_tokens: int,
        dollar_cap: float,
        input_usd_per_million: float,
        output_usd_per_million: float,
        reasoning_effort: str | None = None,
    ) -> None:
        prices = (dollar_cap, input_usd_per_million, output_usd_per_million)
        if any(not math.isfinite(value) or value <= 0 for value in prices) or completion_tokens < 1:
            raise ValueError(
                "API reflection requires explicit positive pricing, a dollar cap and a completion limit"
            )
        self.directory, self.ledger = directory, ledger
        self.config = {
            "model": model,
            "completionTokens": completion_tokens,
            "dollarCap": dollar_cap,
            "inputUsdPerMillion": input_usd_per_million,
            "outputUsdPerMillion": output_usd_per_million,
        }
        if reasoning_effort is not None:
            if reasoning_effort not in ("low", "medium", "high"):
                raise ValueError("Use a supported reflection reasoning effort")
            self.config["reasoningEffort"] = reasoning_effort
        self.failure: Exception | None = None
        directory.mkdir(parents=True, exist_ok=True)
        if ledger.is_file():
            validate_ledger(json.loads(ledger.read_text()), self.config)

    def __call__(self, prompt: str) -> str:
        # Text-chat input cannot exceed its UTF-8 bytes plus protocol overhead.
        # Reservations are never refunded, including on missing usage or transport errors.
        input_ceiling = len(prompt.encode("utf-8")) + 256
        reserve = (
            input_ceiling * self.config["inputUsdPerMillion"]
            + self.config["completionTokens"] * self.config["outputUsdPerMillion"]
        ) / 1_000_000
        with self.ledger.with_suffix(".lock").open("a") as guard:
            fcntl.flock(guard.fileno(), fcntl.LOCK_EX)
            budget = (
                json.loads(self.ledger.read_text())
                if self.ledger.is_file()
                else {"config": self.config, "reservedUsd": 0, "calls": 0}
            )
            validate_ledger(budget, self.config)
            if budget["reservedUsd"] + reserve > self.config["dollarCap"]:
                self.failure = RuntimeError("Reflection dollar cap reached before API request")
                raise self.failure
            configurations = budget.setdefault("configurations", [budget["config"]])
            if self.config not in configurations:
                configurations.append(self.config)
            budget["reservedUsd"] += reserve
            budget["calls"] += 1
            self.ledger.write_text(json.dumps(budget, indent=2) + "\n")
        fingerprint = hashlib.sha256(prompt.encode()).hexdigest()
        prefix = self.directory / f"{budget['calls']:04d}-{fingerprint[:12]}"
        prefix.with_suffix(".prompt.json").write_text(
            json.dumps(
                {
                    "prompt": prompt,
                    "promptSha256": fingerprint,
                    "config": self.config,
                    "reservedUsd": reserve,
                },
                indent=2,
            )
            + "\n"
        )
        # GEPA catches proposer Exceptions even with raise_on_exception=True.
        # Preserve provider failures for the outer optimizer's stop predicate.
        options = (
            {"reasoning_effort": self.config["reasoningEffort"]}
            if "reasoningEffort" in self.config
            else {}
        )
        try:
            response = completion(
                model=self.config["model"],
                messages=[{"role": "user", "content": prompt}],
                max_completion_tokens=self.config["completionTokens"],
                num_retries=0,
                **options,
            )
            prefix.with_suffix(".response.json").write_text(
                response.model_dump_json(indent=2) + "\n"
            )
            if not response.choices:
                raise ValueError("Reflection API returned no choices")
            text = response.choices[0].message.content
            if not isinstance(text, str) or not text.strip():
                raise ValueError("Reflection API returned no proposal text")
        except Exception as error:
            self.failure = error
            prefix.with_suffix(".failure.json").write_text(
                json.dumps({"type": type(error).__name__, "status": "api-failed"}) + "\n"
            )
            raise
        return text
