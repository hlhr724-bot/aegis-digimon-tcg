"""Code-owned activation bands for initially neutral balanced score adjustments."""

RESIDUAL_WEIGHTS = {
    "cost": -1.0,
    "handover": -2.0,
    "attackPlayer": 1.0,
    "attackWinningBattle": 1.0,
    "attackLosingBattle": -2.0,
    "digivolve": 0.5,
    "breedingGrowth": 0.5,
    "levelGain": 0.3,
    "dpGain": 0.2,
    "playBody": 0.25,
    "playTamer": 1.0,
    "playOption": 1.0,
    "pass": -1.0,
    "activate": 0.5,
    "materials": -0.5,
    "sourceDp": 0.2,
    "securityChecks": 1.0,
    "readyAttackers": 0.25,
    "bias": 1.0,
}

LABELS = {
    "cost": "memory spent",
    "handover": "memory given to the opponent",
    "attackPlayer": "pressure on opposing security",
    "attackWinningBattle": "winning battles",
    "attackLosingBattle": "losing battles",
    "digivolve": "digivolution",
    "breedingGrowth": "development in breeding",
    "levelGain": "level gained",
    "dpGain": "DP gained",
    "playBody": "new Digimon bodies",
    "playTamer": "Tamer development",
    "playOption": "Option plays",
    "pass": "passing",
    "activate": "ability activation",
    "materials": "material consumption",
    "sourceDp": "the selected Digimon's DP",
    "securityChecks": "security checks",
    "readyAttackers": "remaining attackers",
}


def activation_advice(feature, weight):
    direction = "Give additional preference to" if weight > 0 else "Apply additional caution to"
    return f"{direction} {LABELS.get(feature, feature)} when comparing otherwise similar plays."
