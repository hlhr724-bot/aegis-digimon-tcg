"""Group-sequential paired sign test over independent seed blocks."""

import hashlib
import json
import math
from collections import defaultdict


def _upper_tail(successes: int, trials: int) -> float:
    return sum(math.comb(trials, count) for count in range(successes, trials + 1)) / 2**trials


def sequential_sign_gate(evaluate, tasks: list[dict], looks: list[int], alpha: float) -> dict:
    """Play both arms one look at a time and stop at efficacy or futility.

    Each seed block contributes one representative task chosen by its immutable task
    hash before outcomes exist. Efficacy at a look is an exact one-sided sign test on
    discordant representatives at alpha / len(looks), so the familywise error stays
    below alpha for any stopping time. Futility stops are non-binding: they can only
    lower the acceptance probability.
    """
    if not 0 < alpha < 1:
        raise ValueError("Sequential gate alpha must be in (0, 1)")
    blocks = defaultdict(list)
    for task in tasks:
        blocks[task["seed"]].append(task)
    order = list(blocks)
    if not looks or looks != sorted(set(looks)) or looks[0] < 1 or looks[-1] != len(order):
        raise ValueError("Sequential looks must increase and end at every seed block")
    representative = {
        seed: min(
            group,
            key=lambda task: hashlib.sha256(json.dumps(task, sort_keys=True).encode()).digest(),
        )
        for seed, group in blocks.items()
    }
    look_alpha = alpha / len(looks)
    history = []
    selected_outputs = []
    control_outputs = []
    positive = negative = 0
    start = 0
    stop_reason = "exhausted"
    for look in looks:
        look_tasks = [task for seed in order[start:look] for task in blocks[seed]]
        selected, control = evaluate(look_tasks)
        if len(selected) != len(look_tasks) or len(control) != len(look_tasks):
            raise ValueError("Sequential gate requires complete paired looks")
        for arm in (selected, control):
            if any(output.get("valid") is not True for output in arm):
                raise ValueError("Invalid games cannot reject or promote a policy")
        selected_outputs += selected
        control_outputs += control
        outcomes = {}
        for task, chosen, incumbent in zip(look_tasks, selected, control, strict=True):
            outcomes[json.dumps(task, sort_keys=True)] = int(chosen["score"] == 1) - int(
                incumbent["score"] == 1
            )
        for seed in order[start:look]:
            difference = outcomes[json.dumps(representative[seed], sort_keys=True)]
            positive += difference == 1
            negative += difference == -1
        start = look
        discordant = positive + negative
        p_value = _upper_tail(positive, discordant) if discordant else 1.0
        remaining = len(order) - look
        best_case = _upper_tail(positive + remaining, discordant + remaining)
        history.append(
            {
                "seedBlocks": look,
                "selectedOnlyWins": positive,
                "controlOnlyWins": negative,
                "pValue": p_value,
                "threshold": look_alpha,
            }
        )
        if p_value <= look_alpha and positive > negative:
            stop_reason = "efficacy"
            break
        if remaining == 0:
            break
        if best_case > look_alpha or positive < negative:
            stop_reason = "futility"
            break
    return {
        "method": "group-sequential exact sign test; one task-hash representative per seed",
        "alpha": alpha,
        "looks": history,
        "plannedSeedBlocks": len(order),
        "played": len(selected_outputs),
        "stopReason": stop_reason,
        "accepted": stop_reason == "efficacy",
        "selected": selected_outputs,
        "control": control_outputs,
    }
