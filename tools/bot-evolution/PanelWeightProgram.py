import copy
import math
from typing import Any

_SCALES = {
    "cost": 4,
    "handover": 2,
    "levelGain": 1,
    "dpGain": 3,
    "playBody": 5,
    "sourceLevel": 4,
    "sourceDp": 6,
    "targetDp": 6,
    "sourceValue": 10,
    "materials": 2,
}
_DESCRIPTIONS = {
    "cost": "actions with a higher memory cost",
    "handover": "actions that give more memory to the opponent",
    "attackPlayer": "attacks on the opponent's security",
    "lethal": "attacks on the player at zero opposing security",
    "attackWinningBattle": "attacks on opposing Digimon with lower DP",
    "attackLosingBattle": "attacks on opposing Digimon with equal or higher DP",
    "digivolve": "digivolving",
    "breedingGrowth": "digivolving in the breeding area",
    "levelGain": "digivolutions that gain more levels",
    "dpGain": "digivolutions that gain more DP",
    "playBody": "playing Digimon with higher DP from hand",
    "playTamer": "playing Tamers",
    "playOption": "using Option cards",
    "sourceLevel": "actions by higher-level cards",
    "sourceDp": "actions by higher-DP cards",
    "targetDp": "actions targeting higher-DP Digimon",
    "pass": "ending the main phase",
    "activate": "activating card effects",
    "sourceInHand": "actions using a card from hand",
    "sourceInTrash": "actions using a card from a trash",
    "sourceOnBoard": "actions by a Digimon on the battle area",
    "sourceOpponent": "actions involving an opposing card",
    "sourceValue": "actions involving cards with higher DP, level and play cost",
    "digiXros": "DigiXros plays",
    "assembly": "Assembly plays",
    "dnaDigivolve": "DNA digivolution",
    "appFusion": "App Fusion",
    "link": "linking cards",
    "materials": "actions using more material cards",
}


class PanelWeightProgram:
    def __init__(self, program: dict[str, Any]) -> None:
        self.program = copy.deepcopy(program)
        self.indices = [
            index
            for index, rule in enumerate(program["rules"])
            if rule.get("when") == {"kind": "main"} and rule["feature"] in _DESCRIPTIONS
        ]
        if not self.indices:
            raise ValueError("The program has no generic main-phase weights to tune")
        self.scales = [_SCALES.get(program["rules"][index]["feature"], 1) for index in self.indices]

    def vector(self) -> list[float]:
        return [
            self.program["rules"][index]["weight"] * scale
            for index, scale in zip(self.indices, self.scales, strict=True)
        ]

    def build(self, vector: list[float], title: str | None = None) -> dict[str, Any]:
        if len(vector) != len(self.indices) or not all(math.isfinite(value) for value in vector):
            raise ValueError("The weight vector has the wrong size or nonfinite values")
        program = copy.deepcopy(self.program)
        if title is not None:
            program["title"] = title
        for index, scale, value in zip(self.indices, self.scales, vector, strict=True):
            weight = round(value / scale, 6)
            if abs(weight) > 10000:
                raise ValueError("A tuned weight exceeds the program limit")
            rule = program["rules"][index]
            if weight == rule["weight"]:
                continue
            rule["weight"] = weight
            verb = "favor" if weight > 0 else "avoid"
            if weight == 0:
                verb = "add no preference for"
            rule["advice"] = f"In the main phase, {verb} {_DESCRIPTIONS[rule['feature']]}."
        return program
