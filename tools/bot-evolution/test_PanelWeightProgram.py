import copy
import json
import math
from pathlib import Path

import pytest

from PanelWeightProgram import PanelWeightProgram


def test_identity_vector_reconstructs_the_entire_current_program() -> None:
    path = (
        Path(__file__).resolve().parents[2]
        / "apps/api/src/bot/evolution/programs/human-panel-v2.json"
    )
    program = json.loads(path.read_text(encoding="utf-8"))["program"]
    tuner = PanelWeightProgram(program)
    assert len(tuner.vector()) == 29
    assert tuner.build(tuner.vector()) == program


def test_tuning_preserves_conditional_rules_settings_order_and_the_input() -> None:
    conditional = {
        "feature": "activate",
        "weight": 3,
        "advice": "Free activation",
        "when": {"kind": "main", "maximum": {"handover": 0}},
    }
    program = {
        "schemaVersion": 1,
        "title": "Original",
        "breedingDeployLevel": 4,
        "rules": [
            {"feature": "cost", "weight": -1, "advice": "Avoid cost", "when": {"kind": "main"}},
            conditional,
            {"feature": "block", "weight": 2, "advice": "Block"},
        ],
    }
    original = copy.deepcopy(program)
    tuner = PanelWeightProgram(program)
    tuned = tuner.build([8], "Candidate")
    assert tuned["rules"][0]["weight"] == 2
    assert "favor" in tuned["rules"][0]["advice"]
    assert tuned["rules"][1:] == program["rules"][1:]
    assert tuned["breedingDeployLevel"] == 4
    assert program == original
    tuned["rules"][1]["when"]["maximum"]["handover"] = 9
    assert tuner.build([8])["rules"][1] == conditional


@pytest.mark.parametrize("values", [[], [math.nan], [math.inf], [1, 2], [100000]])
def test_invalid_vectors_are_rejected(values: list[float]) -> None:
    tuner = PanelWeightProgram(
        {"rules": [{"feature": "pass", "weight": 1, "when": {"kind": "main"}}]}
    )
    with pytest.raises(ValueError):
        tuner.build(values)
