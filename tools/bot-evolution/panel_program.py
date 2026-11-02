"""Split heuristic programs into GEPA components and assemble them back."""

import json
import math
from dataclasses import dataclass
from typing import Any

FEATURES = (
    "bias",
    "baselineScore",
    "securityChecks",
    "readyAttackers",
    "ownHandCount",
    "opponentHandCount",
    "turn",
    "ownTrashCount",
    "opponentTrashCount",
    "cost",
    "handover",
    "attackPlayer",
    "lethal",
    "attackWinningBattle",
    "attackLosingBattle",
    "digivolve",
    "breedingGrowth",
    "levelGain",
    "dpGain",
    "playBody",
    "playTamer",
    "playOption",
    "opponentBodies",
    "hatch",
    "deploy",
    "sourceLevel",
    "sourceDp",
    "targetDp",
    "ownSecurity",
    "opponentSecurity",
    "block",
    "criticalBlock",
    "accept",
    "finish",
    "pass",
    "openingRookie",
    "activate",
    "sourceInHand",
    "sourceInTrash",
    "sourceOnBoard",
    "sourceOpponent",
    "sourceValue",
    "digiXros",
    "assembly",
    "dnaDigivolve",
    "appFusion",
    "link",
    "materials",
    "costUncertain",
    "freeActivation",
    "selectionGain",
    "selectionLoss",
    "selectionRookie",
    "selectionDuplicate",
    "selectionNoop",
    "decisionMemory",
    "decisionDraw",
    "decisionRecovery",
    "decisionRemoval",
    "decisionPlay",
    "decisionEvolution",
    "decisionUnsuspend",
    "decisionCost",
    "decisionUncertain",
    "paymentDraw",
    "paymentMemory",
    "paymentRecovery",
    "paymentCard",
    "paymentValue",
    "paymentStarter",
    "paymentDuplicate",
)
ALWAYS_ZERO_FEATURES = ("baselineScore", "securityChecks", "readyAttackers")
COMPONENTS = ("main_rules", "other_rules")
MAXIMUM_RULES = 100
RULE_KEYS = {"feature", "weight", "advice", "when"}
CONDITION_KEYS = {"kind", "sourceCardIds", "minimum", "maximum", "ownBoard", "ownHand"}
PROGRAM_SETTINGS = (
    "basePolicy",
    "breedingDeployLevel",
    "preferBeneficialSelections",
    "preferFreeOptionSelections",
)
MAIN_SCOPE = (
    'Main-phase rules. Every rule has when.kind = "main" and scores the legal main-phase '
    "actions: playing, digivolving, attacking, activating effects, and ending the turn."
)
OTHER_SCOPE = (
    "Rules for every other decision: mulligan, breeding, blocks, optional effects, "
    'card selections, and ordering. These rules never carry when.kind = "main".'
)


@dataclass(frozen=True)
class Assembly:
    program: dict[str, Any] | None
    error: str | None


def is_main_rule(rule: dict[str, Any]) -> bool:
    condition = rule.get("when")
    return isinstance(condition, dict) and condition.get("kind") == "main"


def split_program(program: dict[str, Any]) -> dict[str, str]:
    main = [rule for rule in program["rules"] if is_main_rule(rule)]
    other = [rule for rule in program["rules"] if not is_main_rule(rule)]
    return {
        "main_rules": json.dumps({"scope": MAIN_SCOPE, "rules": main}, indent=1),
        "other_rules": json.dumps({"scope": OTHER_SCOPE, "rules": other}, indent=1),
    }


def program_settings(program: dict[str, Any]) -> dict[str, Any]:
    return {key: program[key] for key in PROGRAM_SETTINGS if key in program}


def _rule_error(rule: Any, position: str) -> str | None:
    if not isinstance(rule, dict):
        return f"{position} is not a JSON object"
    unknown = set(rule) - RULE_KEYS
    if unknown:
        return (
            f"{position} has unknown keys {sorted(unknown)}; allowed keys are {sorted(RULE_KEYS)}"
        )
    if rule.get("feature") not in FEATURES:
        return f"{position} uses unknown feature {rule.get('feature')!r}"
    weight = rule.get("weight")
    if isinstance(weight, bool) or not isinstance(weight, int | float):
        return f"{position} needs a numeric weight"
    if not math.isfinite(weight) or abs(weight) > 10000:
        return f"{position} weight must be finite and at most 10000 in size"
    advice = rule.get("advice")
    if not isinstance(advice, str) or not advice.strip() or len(advice) > 600:
        return f"{position} needs plain-English advice of 1–600 characters"
    condition = rule.get("when")
    if condition is None:
        return None
    if not isinstance(condition, dict):
        return f"{position} when must be a JSON object"
    unknown = set(condition) - CONDITION_KEYS
    if unknown:
        return (
            f"{position} when has unknown keys {sorted(unknown)}; allowed: {sorted(CONDITION_KEYS)}"
        )
    for bound in ("minimum", "maximum"):
        limits = condition.get(bound, {})
        if not isinstance(limits, dict):
            return f"{position} when.{bound} must map feature names to numbers"
        for feature, limit in limits.items():
            if feature not in FEATURES:
                return f"{position} when.{bound} uses unknown feature {feature!r}"
            if isinstance(limit, bool) or not isinstance(limit, int | float):
                return f"{position} when.{bound}.{feature} must be a number"
    return None


def _component_rules(candidate: dict[str, str], name: str) -> tuple[list[Any] | None, str | None]:
    if name not in candidate:
        return None, f"Missing component {name}"
    try:
        value = json.loads(candidate[name])
    except json.JSONDecodeError as error:
        return None, f"Component {name} is not valid JSON: {error}"
    if not isinstance(value, dict) or set(value) != {"scope", "rules"}:
        return None, f"Component {name} must be an object with exactly the keys scope and rules"
    if not isinstance(value["scope"], str) or not value["scope"].strip():
        return None, f"Component {name} needs a plain-English scope"
    if not isinstance(value["rules"], list):
        return None, f"Component {name} rules must be a list"
    return value["rules"], None


def assemble_program(candidate: dict[str, str], title: str, settings: dict[str, Any]) -> Assembly:
    rules: list[dict[str, Any]] = []
    for name in COMPONENTS:
        component_rules, error = _component_rules(candidate, name)
        if error is not None:
            return Assembly(None, error)
        for index, rule in enumerate(component_rules):
            position = f"{name} rule {index + 1}"
            error = _rule_error(rule, position)
            if error is not None:
                return Assembly(None, error)
            if name == "main_rules" and not is_main_rule(rule):
                return Assembly(None, f'{position} must set when.kind to "main"')
            if name == "other_rules" and is_main_rule(rule):
                return Assembly(None, f'{position} sets when.kind to "main"; move it to main_rules')
            rules.append(rule)
    if not 1 <= len(rules) <= MAXIMUM_RULES:
        return Assembly(
            None, f"The program needs 1–{MAXIMUM_RULES} rules in total, not {len(rules)}"
        )
    return Assembly({"schemaVersion": 1, "title": title, **settings, "rules": rules}, None)
