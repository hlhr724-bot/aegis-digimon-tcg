import hashlib
import json
from pathlib import Path
from typing import Any

import click

from PanelArchetypeClassifier import PanelArchetypeClassifier


def _points(row: dict[str, Any]) -> float:
    if row.get("valid") is not True:
        return 0.0
    return 0.5 if row["win"] is None else float(row["win"])


def _summarize(
    *, rows: list[dict[str, Any]], pairs: dict[str, Any], classifications: dict[str, Any]
) -> dict[str, Any]:
    indexed = {}
    for row in rows:
        meta = row["metadata"]
        key = (meta["matchId"], meta["opponent"], meta["orientation"], meta["seat"])
        arm = meta["arm"]
        if arm not in ("baseline", "candidate") or arm in indexed.setdefault(key, {}):
            raise ValueError("Archetype analysis needs unique baseline/candidate games")
        indexed[key][arm] = row
    groups: dict[str, dict[str, Any]] = {"learner": {}, "opponent": {}}
    losses = []
    for key, arms in indexed.items():
        if set(arms) != {"baseline", "candidate"}:
            raise ValueError("Archetype analysis needs complete paired games")
        match_id, opponent, orientation, _seat = key
        if arms["baseline"]["metadata"]["seed"] != arms["candidate"]["metadata"]["seed"]:
            raise ValueError("Archetype comparison seeds differ")
        labels = classifications[match_id]["decks"]
        learner_label = labels[orientation]["archetype"]
        opponent_label = labels[1 - orientation]["archetype"]
        candidate = arms["candidate"]
        if candidate.get("valid") is True and candidate["win"] is False:
            losses.append(
                {
                    **candidate["metadata"],
                    "learnerArchetype": learner_label,
                    "opponentArchetype": opponent_label,
                }
            )
        for role, deck_index in (("learner", orientation), ("opponent", 1 - orientation)):
            label = labels[deck_index]["archetype"]
            deck = pairs[match_id]["decks"][deck_index]
            signature = hashlib.sha256(
                json.dumps([sorted(deck["mainDeck"]), sorted(deck["eggDeck"])]).encode()
            ).hexdigest()
            group = groups[role].setdefault(
                label,
                {
                    "archetype": label,
                    "games": 0,
                    "matchups": set(),
                    "decks": set(),
                    "difference": 0.0,
                    "arms": {
                        arm: {
                            "valid": 0,
                            "invalid": 0,
                            "wins": 0,
                            "losses": 0,
                            "draws": 0,
                            "points": 0.0,
                        }
                        for arm in ("baseline", "candidate")
                    },
                    "opponents": {},
                },
            )
            group["games"] += 1
            group["matchups"].add(match_id)
            group["decks"].add(signature)
            group["difference"] += _points(candidate) - _points(arms["baseline"])
            detail = group["opponents"].setdefault(
                opponent, {"games": 0, "valid": 0, "wins": 0, "losses": 0, "invalid": 0}
            )
            detail["games"] += 1
            detail["valid"] += int(candidate.get("valid") is True)
            detail["invalid"] += int(candidate.get("valid") is not True)
            detail["wins"] += int(candidate.get("valid") is True and candidate["win"] is True)
            detail["losses"] += int(candidate.get("valid") is True and candidate["win"] is False)
            for arm, row in arms.items():
                counts = group["arms"][arm]
                valid = row.get("valid") is True
                counts["valid"] += int(valid)
                counts["invalid"] += int(not valid)
                counts["wins"] += int(valid and row["win"] is True)
                counts["losses"] += int(valid and row["win"] is False)
                counts["draws"] += int(valid and row["win"] is None)
                counts["points"] += _points(row)
    output = {}
    priorities = {}
    for role, values in groups.items():
        rows_out = []
        for group in values.values():
            group["matchups"] = len(group["matchups"])
            group["uniqueDecks"] = len(group.pop("decks"))
            group["pairedFailureAsLossDifference"] = group.pop("difference") / group["games"]
            for counts in group["arms"].values():
                counts["validRate"] = (
                    counts["points"] / counts["valid"] if counts["valid"] else None
                )
                counts["failureAsLossRate"] = counts["points"] / group["games"]
            group["enoughForPriority"] = (
                group["archetype"] != "Unclassified"
                and group["arms"]["candidate"]["valid"] >= 20
                and group["uniqueDecks"] >= 3
                and group["matchups"] >= 8
            )
            rows_out.append(group)
        output[role] = sorted(rows_out, key=lambda group: (-group["games"], group["archetype"]))
        priorities[role] = sorted(
            [group for group in rows_out if group["enoughForPriority"]],
            key=lambda group: (
                group["arms"]["candidate"]["validRate"],
                -group["arms"]["candidate"]["losses"],
            ),
        )[:8]
    return {
        "groups": output,
        "priorities": priorities,
        "candidateLosses": losses,
        "pairedGames": len(indexed),
        "scope": "Exploratory reference-based archetype grouping; descriptive, unadjusted for opponent mix; no new candidate selection or per-archetype strength certificate",
    }


@click.command()
@click.option("--comparison", type=click.Path(exists=True, path_type=Path), required=True)
@click.option("--pairs", type=click.Path(exists=True, path_type=Path), required=True)
@click.option("--references", type=click.Path(exists=True, path_type=Path), required=True)
@click.option("--output", type=click.Path(path_type=Path), required=True)
def _main(comparison: Path, pairs: Path, references: Path, output: Path) -> None:
    summary = json.loads((comparison / "summary.json").read_text(encoding="utf-8"))
    if summary.get("complete") is not True:
        raise click.ClickException("Only analyze a completed frozen comparison")
    pairs_by_id = {pair["matchId"]: pair for pair in json.loads(pairs.read_text(encoding="utf-8"))}
    reference_decks = json.loads(references.read_text(encoding="utf-8"))
    classifier = PanelArchetypeClassifier(reference_decks)
    classifications = {
        match_id: {"decks": [classifier.classify(deck) for deck in pair["decks"]]}
        for match_id, pair in pairs_by_id.items()
    }
    results_path = comparison / "games/results.jsonl"
    rows = [json.loads(line) for line in results_path.read_text(encoding="utf-8").splitlines()]
    if len(rows) != summary["games"]:
        raise click.ClickException("Comparison result count differs from summary")
    report = _summarize(rows=rows, pairs=pairs_by_id, classifications=classifications)
    report["programs"] = {
        arm: json.loads((comparison / f"{arm}-program.json").read_text(encoding="utf-8"))["title"]
        for arm in ("baseline", "candidate")
    }
    report["classifier"] = {
        "referenceDecks": len(reference_decks),
        "referenceArchetypes": len({deck["archetype"] for deck in reference_decks}),
        "minimumScore": 0.45,
        "minimumSharedCopies": 16,
        "minimumMargin": 0.05,
        "method": "Archetype-IDF-weighted main-deck multiset Jaccard, closest recipe per family; ambiguous or unsupported decks remain Unclassified",
    }
    report["sha256"] = {
        "results": hashlib.sha256(results_path.read_bytes()).hexdigest(),
        "pairs": hashlib.sha256(pairs.read_bytes()).hexdigest(),
        "references": hashlib.sha256(references.read_bytes()).hexdigest(),
        "source": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "classifierSource": hashlib.sha256(
            (Path(__file__).parent / "PanelArchetypeClassifier.py").read_bytes()
        ).hexdigest(),
    }
    output.mkdir(parents=True, exist_ok=True)
    losses = report.pop("candidateLosses")
    for name, content in (
        ("summary.json", report),
        ("classifications.json", classifications),
        ("losses.json", losses),
    ):
        (output / name).write_text(json.dumps(content, indent=2) + "\n", encoding="utf-8")
    lines = [
        "# Panel comparison losses by archetype",
        "",
        report["scope"],
        "",
        "Labels use committed reference recipes. Common staples alone and ambiguous mixed lists do not establish an archetype. A low rate can reflect deck strength or opponent mix; paired changes and opponent breakdowns help prioritize replay review, not prove a rules defect.",
        "",
        f"Baseline: {report['programs']['baseline']}. Candidate: {report['programs']['candidate']}.",
        "",
    ]
    for role, priorities in report["priorities"].items():
        lines += [
            f"## {role.title()} archetypes with enough data",
            "",
            "| Archetype | Candidate wins / valid | Baseline wins / valid | Paired change (pp) | Matchups | Distinct decks |",
            "| --- | ---: | ---: | ---: | ---: | ---: |",
        ]
        for group in priorities:
            mine, base = group["arms"]["candidate"], group["arms"]["baseline"]
            lines.append(
                f"| {group['archetype']} | {mine['wins']}/{mine['valid']} ({mine['validRate'] * 100:.1f}%) | {base['wins']}/{base['valid']} ({base['validRate'] * 100:.1f}%) | {group['pairedFailureAsLossDifference'] * 100:+.2f} | {group['matchups']} | {group['uniqueDecks']} |"
            )
        unknown = next(
            (group for group in report["groups"][role] if group["archetype"] == "Unclassified"),
            None,
        )
        lines += [
            "",
            f"Unclassified exposure: {unknown['games'] if unknown else 0}/{report['pairedGames']} paired games. Priority rows require at least 20 valid candidate games, 8 matchups and 3 distinct lists. No multiple-comparison significance claim is made.",
            "",
        ]
    (output / "report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    click.echo(
        json.dumps(
            {
                "pairedGames": report["pairedGames"],
                "candidateLosses": len(losses),
                "priorities": {
                    role: [group["archetype"] for group in groups]
                    for role, groups in report["priorities"].items()
                },
            }
        )
    )


if __name__ == "__main__":
    _main()
