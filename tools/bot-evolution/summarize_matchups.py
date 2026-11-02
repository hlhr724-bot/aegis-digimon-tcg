import math
from collections import defaultdict

from seed_block_interval import seed_block_interval


def summarize_matchups(protocol: dict, records: list[dict], seed_blocks: int) -> dict:
    units = protocol["units"][:seed_blocks]
    if not units or len(units) != seed_blocks:
        raise ValueError("Expected an explicit completed-look prefix of the frozen protocol")
    expected = {unit["id"]: unit for unit in units}
    if len(expected) != seed_blocks or len({unit["seed"] for unit in units}) != seed_blocks:
        raise ValueError("Repeated seed blocks cannot inflate matchup evidence")
    grouped: dict[str, list[dict]] = defaultdict(list)
    seen = set()
    for game in records:
        unit = expected.get(game.get("unit"))
        if unit is None or game.get("seed") != unit["seed"] or game.get("decks") != unit["decks"]:
            raise ValueError("Game does not match the frozen task")
        assignment = game.get("assignment")
        seat = game.get("learnerSeat")
        if assignment not in ([0, 1], [1, 0]) or type(seat) is not int or seat not in (0, 1):
            raise ValueError("Invalid deck assignment or policy seat")
        key = (game["unit"], tuple(assignment), seat)
        if key in seen:
            raise ValueError("Repeated game cannot inflate matchup evidence")
        seen.add(key)
        if game.get("valid") is True:
            winner = game.get("winnerSeat")
            if winner is not None and (type(winner) is not int or winner not in (0, 1)):
                raise ValueError("Invalid winner seat")
            score = game.get("score")
            expected_score = 0.5 if winner is None else int(winner == seat)
            if type(score) not in (int, float) or score != expected_score:
                raise ValueError("Score does not match the game winner")
            if (
                game.get("timedOut") is not False
                or game.get("errors") != []
                or game.get("rejections") != []
                or game.get("asynchronousRejections") != []
                or game.get("fallbacks") != [{"timeout": 0, "error": 0}] * 2
                or type(game.get("projectionChecks")) is not int
                or game["projectionChecks"] < 1
                or game.get("reason") in ("stalled", "cancelled", "turnLimit", "unfinished")
            ):
                raise ValueError("Game marked valid contains an execution failure")
        elif game.get("score") is not None:
            raise ValueError("Invalid or timed-out games must have null scores")
        grouped[game["unit"]].append(game)
    if set(grouped) != set(expected) or any(len(games) != 4 for games in grouped.values()):
        raise ValueError("Matchup analysis requires complete four-game task records")
    decks = sorted({deck for unit in protocol["units"] for deck in unit["decks"]})
    pairs = sorted({tuple(sorted(unit["decks"])) for unit in protocol["units"]})
    family_size = len(decks) + 2 * len(pairs)
    possible_draws = protocol["looks"][-1]
    uniqueness = math.exp(sum(math.log1p(-index / 100_000_000) for index in range(possible_draws)))
    look_count = len(protocol["looks"])
    attempt_count = protocol.get("maximumAttempts", 1)
    alpha = 0.05 * uniqueness / (2 * family_size * look_count * attempt_count)
    deck_scores: dict[str, list[float]] = defaultdict(list)
    pair_scores: dict[tuple[str, str], list[float]] = defaultdict(list)
    complete = 0
    for games in grouped.values():
        if any(game.get("valid") is not True for game in games):
            continue
        complete += 1
        block: dict[tuple[str, str], list[float]] = defaultdict(list)
        for game in games:
            assigned = [game["decks"][index] for index in game["assignment"]]
            block[(assigned[game["learnerSeat"]], assigned[1 - game["learnerSeat"]])].append(
                game["score"]
            )
        for pair, scores in block.items():
            if len(scores) != 2:
                raise ValueError("Both seats are required for each learner deck in a seed block")
            mean = sum(scores) / 2
            pair_scores[pair].append(mean)
            deck_scores[pair[0]].append(mean)
    valid = [game for game in records if game.get("valid") is True]
    timed_out = sum(
        game.get("valid") is not True and game.get("timedOut") is True for game in records
    )
    invalid = len(records) - len(valid) - timed_out

    def describe(scores: list[float]) -> dict:
        interval = seed_block_interval(scores, alpha)
        lower, upper = interval["lower"], interval["upper"]
        return {
            "games": len(scores) * 2,
            "seedBlocks": len(scores),
            "score": interval["mean"],
            "lowerBound": lower,
            "upperBound": upper,
            "sampleVariance": interval["sampleVariance"],
            "assessment": "positive"
            if lower is not None and lower > 0.5
            else "negative"
            if upper is not None and upper < 0.5
            else "inconclusive",
        }

    return {
        "schemaVersion": 1,
        "policySha256": protocol["policySha256"],
        "engineSha256": protocol["engineSha256"],
        "control": protocol["control"],
        "analysis": "Post-hoc descriptive stratification of the frozen certificate; no new certification or all-deck claim",
        "confidence": {
            "method": "Two-sided seed-block empirical Bernstein with all declared deck and directed-matchup groups in the family",
            "familySize": family_size,
            "looks": look_count,
            "maximumAttempts": attempt_count,
            "alphaPerBound": alpha,
            "uniqueSeedProbability": uniqueness,
            "source": "https://arxiv.org/pdf/0907.3740#page=4",
        },
        "health": {
            "configuredGames": len(records),
            "playedGames": len(valid),
            "wins": sum(game["score"] == 1 for game in valid),
            "draws": sum(game["score"] == 0.5 for game in valid),
            "losses": sum(game["score"] == 0 for game in valid),
            "invalidGames": invalid,
            "timedOutGames": timed_out,
            "completeValidSeedBlocks": complete,
            "excludedIncompleteValidBlocks": seed_blocks - complete,
        },
        "decks": [{"deck": deck, **describe(deck_scores[deck])} for deck in decks],
        "matchups": [
            {"deck": deck, "opponent": opponent, **describe(pair_scores[(deck, opponent)])}
            for a, b in pairs
            for deck, opponent in ((a, b), (b, a))
        ],
    }
