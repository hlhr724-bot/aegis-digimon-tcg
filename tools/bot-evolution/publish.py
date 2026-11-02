"""Publish readable, crawlable guides from validated evolution artifacts."""

import hashlib
import json
from collections import Counter
from html import escape
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import click

from audit_pilot_family import audit_pilot_family
from audit_session_reflections import audit_session_reflections
from evidence import paired_evidence, policy_hash, program_hash

GUIDES = {
    "generic": (
        "fundamentals",
        "Digimon fundamentals",
        "A reusable approach to memory, development, and attacks.",
    ),
    "bt26-dgo-2026-09-05-1-glowing-dawn@1": (
        "glowing-dawn",
        "Glowing Dawn",
        "Practice the choices behind this BT26 Glowing Dawn deck.",
    ),
    "bt26-dgo-2026-08-28-1-toho-braves@1": (
        "toho-braves",
        "Toho Braves",
        "Practice the choices behind this BT26 Toho Braves deck.",
    ),
    "digilab-ex13-122980@1": (
        "ex13-examon",
        "Examon",
        "Practice the choices behind this EX13-era Examon deck.",
    ),
    "digilab-ex13-121547@1": (
        "ex13-jupitermon",
        "Jupitermon",
        "Practice the choices behind this EX13-era Jupitermon deck.",
    ),
    "digilab-ex13-122110@1": (
        "ex13-ulforceveedramon",
        "UlforceVeedramon",
        "Practice the choices behind this EX13-era UlforceVeedramon deck.",
    ),
    "digilab-ex13-122675@1": (
        "ex13-ts-mervamon",
        "TS Mervamon",
        "Practice the choices behind this EX13-era TS Mervamon deck.",
    ),
    "digilab-ex13-120207@1": (
        "ex13-toho-braves",
        "Toho Braves",
        "Practice the choices behind this EX13-era Toho Braves deck.",
    ),
    "digilab-ex13-119771@1": (
        "ex13-glowing-dawn",
        "Glowing Dawn",
        "Practice the choices behind this EX13-era Glowing Dawn deck.",
    ),
}


def verified_run(run_dir: Path) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    manifest = json.loads((run_dir / "manifest.json").read_text(encoding="utf-8"))
    family = manifest.get("family", {})
    if "registry" in family:
        audit_pilot_family(registry=Path(family["registry"]), attempt=family["attempt"])
    pilots = json.loads((run_dir / "pilots.json").read_text(encoding="utf-8"))
    report = json.loads((run_dir / "held-out.json").read_text(encoding="utf-8"))
    reflection_model = manifest["config"].get("reflectionModel", manifest["config"].get("model"))
    if reflection_model == "deterministic":
        raise ValueError("Strict publication requires API reflection or audited session reflection")
    engine = manifest["config"]["engineSha256"]
    if (
        report["engineSha256"] != engine
        or report.get("runnerSha256") != manifest["config"]["runnerSha256"]
        or report["simulations"] != manifest["config"]["simulations"]
        or report["simulations"] < 128
    ):
        raise ValueError(
            "Publication requires a pinned engine and at least 128 completed rollouts per search"
        )
    for version, stage in pilots.items():
        if reflection_model == "session":
            stage_name = stage.get("stage")
            if (
                not isinstance(stage_name, str)
                or not stage_name
                or Path(stage_name).name != stage_name
                or stage_name in (".", "..")
            ):
                raise ValueError("Session publication requires a local stage name")
            stage_dir = run_dir / stage_name
            records = audit_session_reflections(stage_dir / "reflections")
            if records != stage.get("sessionReflections"):
                raise ValueError("Session reflection records differ from the frozen selection")
            selected_path = stage_dir / "selected.json"
            if (
                not selected_path.is_file()
                or json.loads(selected_path.read_text(encoding="utf-8")) != stage
            ):
                raise ValueError("Session publication requires the exact frozen stage selection")
        if (
            version not in GUIDES
            or stage["engineSha256"] != engine
            or stage.get("validEvaluatedProposals", 0) < 1
        ):
            raise ValueError(
                "Every guide requires a fitness-evaluated alternative policy from the same engine"
            )
        seed_program = manifest["metadata"]["seedProgram"]
        seed_rules = {
            (rule["feature"], json.dumps(rule.get("when"), sort_keys=True)): rule
            for rule in seed_program["rules"]
        }
        for rule in stage["program"]["rules"]:
            original = seed_rules.get(
                (rule["feature"], json.dumps(rule.get("when"), sort_keys=True))
            )
            if (
                original is not None
                and original["weight"] * rule["weight"] < 0
                and original["advice"] == rule["advice"]
            ):
                raise ValueError("A weight crossed zero without reauthoring its advice")
        if policy_hash(stage["program"]) == policy_hash(seed_program):
            raise ValueError("Publication requires a policy different from the starting seed")
        evidence = report["results"][version]
        if not paired_evidence(evidence["selected"], evidence["control"])["accepted"]:
            raise ValueError(
                "Publication requires at least 48 paired games and a positive lower confidence bound against control"
            )
        mcts_evidence = paired_evidence(
            [game for game in evidence["selected"] if game["task"]["opponent"] == "mcts"],
            [game for game in evidence["control"] if game["task"]["opponent"] == "mcts"],
        )
        if not mcts_evidence["accepted"]:
            raise ValueError(
                "Publication requires a positive paired improvement against MCTS itself"
            )
        if not evidence["allValid"] or len(evidence["selected"]) < 4:
            raise ValueError("Publication requires valid held-out games in both seats")
        paired = [
            sorted(json.dumps(game["task"], sort_keys=True) for game in evidence[arm])
            for arm in ("selected", "control")
        ]
        if paired[0] != paired[1]:
            raise ValueError("Selected and control games must use identical held-out tasks")
        for arm in ("selected", "control"):
            games = evidence[arm]
            mcts_seats = {
                game["task"]["learnerSeat"] for game in games if game["task"]["opponent"] == "mcts"
            }
            if mcts_seats != {0, 1}:
                raise ValueError("Both held-out arms require MCTS games in both seats")
            if {game["task"]["learnerSeat"] for game in games} != {0, 1}:
                raise ValueError("Held-out evaluations must cover both seats")
            for game in games:
                if game["valid"] is not True or game["engineSha256"] != engine:
                    raise ValueError("Invalid or unpinned held-out game")
                program = (
                    stage["program"] if arm == "selected" else manifest["metadata"]["seedProgram"]
                )
                candidate = hashlib.sha256(json.dumps(program).encode("utf-8")).hexdigest()
                if game["candidateSha256"] not in (candidate, program_hash(program)):
                    raise ValueError("Held-out games do not match the selected or starting policy")
                if game["task"]["opponent"] == "mcts" and (
                    not game.get("searches")
                    or any(
                        search["requested"] != report["simulations"]
                        or search["completed"] != search["requested"]
                        or search.get("invalid") != 0
                        for search in game["searches"]
                    )
                ):
                    raise ValueError(
                        "Held-out search budget was incomplete or contained invalid simulations"
                    )
    return manifest, pilots, report


def shell(title: str, description: str, body: str, canonical: str) -> str:
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{escape(title)} · Aegis strategy guides</title><meta name="description" content="{escape(description, quote=True)}">
<link rel="canonical" href="{escape(canonical, quote=True)}"><meta property="og:title" content="{escape(title, quote=True)}">
<meta property="og:description" content="{escape(description, quote=True)}"><meta property="og:type" content="article">
<link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/strategy-guides/guides.css">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&amp;family=Tektur:wght@700;800&amp;display=swap">
</head><body><a class="skip" href="#content">Skip to guide</a><header><a class="brand" href="/">AEGIS</a>
<nav aria-label="Main"><a href="/strategy-guides/">Strategy guides</a><a href="/play?utm_source=strategy-guides">Play online</a></nav></header>
<main id="content">{body}</main><footer><a href="/">Aegis</a> · Digimon Card Game practice · Independent community project</footer></body></html>'''


FEATURE_LABELS = {
    "bias": "the constant preference",
    "ownHandCount": "the number of cards in your hand",
    "opponentHandCount": "the number of cards in the opponent's hand",
    "turn": "the turn number",
    "ownTrashCount": "the number of cards in your trash",
    "opponentTrashCount": "the number of cards in the opponent's trash",
    "cost": "the action's memory cost",
    "handover": "the memory given to the opponent",
    "attackPlayer": "the action attacks the opposing player",
    "lethal": "the action attacks the opposing player at zero security",
    "attackWinningBattle": "the action attacks a Digimon with lower DP",
    "attackLosingBattle": "the action attacks a Digimon with equal or higher DP",
    "digivolve": "the action is a standard digivolution",
    "breedingGrowth": "the action digivolves a Digimon in breeding",
    "levelGain": "the number of levels gained through standard digivolution",
    "dpGain": "the DP gained through standard digivolution",
    "playBody": "the DP of a Digimon being played (zero for other actions)",
    "playTamer": "the action plays a Tamer",
    "playOption": "the action uses an Option",
    "opponentBodies": "the number of opposing cards in the battle area, including Tamers",
    "hatch": "the action hatches a Digi-Egg",
    "deploy": "the action moves a Digimon out of breeding",
    "sourceLevel": "the selected card's level",
    "sourceDp": "the selected card's DP",
    "targetDp": "the target Digimon's DP",
    "ownSecurity": "your security count",
    "opponentSecurity": "the opponent's security count",
    "block": "the action declares a block",
    "criticalBlock": "the action blocks an attack on you at zero security",
    "accept": "the action accepts an optional effect, Evade, or Barrier",
    "finish": "the action finishes a card or Assembly selection",
    "pass": "the action ends the current phase",
    "openingRookie": "the opening-hand rating (+1 for keeping a rookie, -1 for keeping no rookie, 0 for replacing the hand)",
    "activate": "the action activates an effect",
    "sourceInHand": "the selected card is in your hand",
    "sourceInTrash": "the selected card is in either player's trash",
    "sourceOnBoard": "the selected permanent or top card is in the battle area",
    "sourceOpponent": "the selection is an opposing permanent, its top card, or a card in the opponent's trash",
    "sourceValue": "the selected card's strength rating (level + DP in thousands + one tenth of play cost)",
    "digiXros": "the action uses DigiXros",
    "assembly": "the action uses Assembly",
    "dnaDigivolve": "the action uses DNA digivolution",
    "appFusion": "the action uses App Fusion",
    "link": "the action links a card",
    "materials": "the number of material cards and DigiXros expander Tamers committed by this action (zero during individual selection steps)",
}
BOOLEAN_FEATURES = {
    "attackPlayer",
    "lethal",
    "attackWinningBattle",
    "attackLosingBattle",
    "digivolve",
    "breedingGrowth",
    "playTamer",
    "playOption",
    "hatch",
    "deploy",
    "block",
    "criticalBlock",
    "accept",
    "finish",
    "pass",
    "activate",
    "sourceInHand",
    "sourceInTrash",
    "sourceOnBoard",
    "sourceOpponent",
    "digiXros",
    "assembly",
    "dnaDigivolve",
    "appFusion",
    "link",
}
DP_FEATURES = {"dpGain", "playBody", "sourceDp", "targetDp"}


def context(rule: dict[str, Any], cards: dict[str, Any] | None = None) -> str:
    when = rule.get("when", {})
    if when.get("sourceCardIds") == [] or when.get("kind") == "":
        return "This condition cannot match an action"
    parts = []
    if when.get("sourceCardIds"):
        parts.append(
            "For "
            + ", ".join(
                f"{cards[card_id]['name']} ({card_id})"
                if cards is not None and card_id in cards
                else card_id
                for card_id in when["sourceCardIds"]
            )
        )
    if when.get("kind"):
        kind = {
            "main": "your main phase",
            "breeding": "your breeding phase",
            "optional": "an optional effect",
            "mulligan": "your opening-hand choice",
            "counter": "a counter response",
            "block": "a blocking choice",
            "chooseTargets": "target selection",
            "selectCards": "card selection",
            "orderCards": "card ordering",
            "orderTriggers": "the ordering of simultaneous effects",
            "chooseOption": "an effect option choice",
            "respondEvade": "an Evade response",
            "respondBarrier": "a Barrier response",
        }.get(when["kind"], when["kind"] + " choices")
        parts.append("During " + kind)
    for bound, word in (("minimum", "at least"), ("maximum", "at most")):
        for feature, value in when.get(bound, {}).items():
            label = FEATURE_LABELS[feature]
            if feature in BOOLEAN_FEATURES:
                allowed = [
                    flag
                    for flag in (0, 1)
                    if (flag >= value if bound == "minimum" else flag <= value)
                ]
                if allowed == [1]:
                    parts.append("When " + label)
                elif allowed == [0]:
                    parts.append("When it is false that " + label)
                elif not allowed:
                    parts.append("This condition cannot match an action")
            else:
                display_value = value * 1000 if feature in DP_FEATURES else value
                units = " DP" if feature in DP_FEATURES else ""
                parts.append(f"When {label} is {word} {display_value:g}{units}")
    return " · ".join(parts)


def evidence_table(evidence: dict[str, Any]) -> str:
    rows = []
    for opponent, label in (("mcts", "Search opponent"), ("heuristic", "Other trained pilot")):
        arms = [
            [game for game in evidence[arm] if game["task"]["opponent"] == opponent]
            for arm in ("selected", "control")
        ]
        if not arms[0]:
            continue
        values = []
        for games in arms:
            wins = sum(game["score"] == 1 for game in games)
            draws = sum(game["score"] == 0.5 for game in games)
            values.append(f"{wins} wins, {draws} draws / {len(games)} games")
        rows.append(
            f'<tr><th scope="row">{label}</th><td>{values[0]}</td><td>{values[1]}</td></tr>'
        )
    return (
        '<div class="table-wrap"><table><caption>Games held back from training and selection</caption><thead><tr><th>Opponent</th><th>Selected policy</th><th>Starting policy</th></tr></thead><tbody>'
        + "".join(rows)
        + "</tbody></table></div>"
    )


def publish(run_dir: Path, output: Path, base_url: str, catalog_output: Path | None = None) -> None:
    manifest, pilots, report = verified_run(run_dir)
    render_guides(manifest, pilots, report, output, base_url, catalog_output)


def render_guides(
    manifest: dict[str, Any],
    pilots: dict[str, Any],
    report: dict[str, Any],
    output: Path,
    base_url: str,
    catalog_output: Path | None,
    *,
    experimental: bool = False,
) -> None:
    generic_hash = policy_hash(pilots["generic"]["program"])
    pilots = {
        version: stage
        for version, stage in pilots.items()
        if version == "generic" or policy_hash(stage["program"]) != generic_hash
    }
    output.mkdir(parents=True, exist_ok=True)
    for version, (slug, _, _) in GUIDES.items():
        if version not in pilots:
            stale_page = output / slug / "index.html"
            stale_page.unlink(missing_ok=True)
    metadata = manifest["metadata"]
    cards = {card["cardId"]: card for card in metadata["cards"]}
    decks = {deck["id"]: deck for deck in metadata["evolutionDecks"]}
    index_links = []
    catalog = []
    page_urls = [f"{base_url}/strategy-guides/"]
    for version, stage in pilots.items():
        slug, title, description = GUIDES[version]
        catalog.append(
            {
                "strictVerified": not experimental,
                "slug": slug,
                "title": title,
                "description": description,
                "url": f"/strategy-guides/{slug}/",
            }
        )
        page_urls.append(f"{base_url}/strategy-guides/{slug}/")
        rules = [rule for rule in stage["program"]["rules"] if rule["weight"] != 0]
        # Preserve policy order and exact advice; the reader sees every active rule.
        principles = "".join(
            "<li><p>"
            + escape(rule["advice"])
            + "</p>"
            + (
                "<small>" + escape(context(rule, cards)) + "</small>"
                if context(rule, cards)
                else ""
            )
            + "</li>"
            for rule in rules
        )
        deck_html = ""
        if version != "generic":
            deck = decks[version]
            sections = []
            for zone, label in (("mainDeck", "Main deck"), ("eggDeck", "Digi-Egg deck")):
                entries = "".join(
                    f"<li><span>{count} × {escape(cards[card_id]['name'])} <small>{escape(card_id)}</small></span></li>"
                    for card_id, count in Counter(deck["deck"][zone]).items()
                )
                sections.append(f'<h3>{label}</h3><ul class="deck-list">{entries}</ul>')
            deck_html = (
                '<section id="deck"><h2>The tested deck</h2>' + "".join(sections) + "</section>"
            )
        reflection_note = (
            "Proposals were authored through an audited coding session and evaluated by GEPA; no paid reflection API was used."
            if manifest["config"].get("reflectionModel", manifest["config"].get("model"))
            == "session"
            else ""
        )
        selection_note = (
            "The starting policy for this stage was retained."
            if stage.get("retainedStageInitial")
            else "A revised policy was selected."
        )
        if policy_hash(stage["program"]) == policy_hash(manifest["metadata"]["seedProgram"]):
            selection_note += (
                " This is also the original baseline policy; improvement was not demonstrated."
            )
        training_opponent = (
            "seeded random legal actions"
            if (stage.get("ladder") or {}).get("trainingRung") == 0
            else "search"
        )
        body = f"""<p class="eyebrow">Digimon Card Game · Strategy guide</p><h1>{escape(title)}</h1><p class="lede">{escape(description)}</p>
<div class="practice"><p>Put these decisions into practice in a real game.</p><a class="button" href="/play?utm_source=strategy-guides&amp;utm_content={slug}">Play on Aegis</a></div>
<nav class="contents" aria-label="In this guide"><a href="#decisions">Decision principles</a>{'<a href="#deck">Deck list</a>' if deck_html else ""}<a href="#results">Practice results</a></nav>
<section id="decisions"><h2>Decision principles</h2><p>These principles describe the selected pilot's preferences. Combine them with the board and the printed card text; a preference is not a guarantee that a play is safe.</p><ul class="principles">{principles}</ul></section>{deck_html}
<section id="results"><h2>Practice results</h2><p>The search opponent used {report["simulations"]} completed game simulations per main choice. Both player seats were tested. This small benchmark describes these particular decks and seeds; it does not establish tournament performance.</p>{evidence_table(report["results"][version])}<details><summary>How this guide was selected</summary><p>We evolved a general pilot on varied legal decks, then trained deck pilots against {training_opponent} and a frozen archive of other pilots. Final games were excluded from training and selection. Search samples unknown cards using an open deck list and applies to main choices.</p><p>{stage["validEvaluatedProposals"]} alternative policies tested in completed games. {selection_note} {reflection_note} Selected validation score {stage["validationScore"]:.2f}. The final results above include the starting-policy control.</p><p>Engine fingerprint: <code>{escape(report["engineSha256"])}</code></p><a href="/strategy-guides/evidence.json">Download policy and benchmark evidence</a></details></section>"""
        if experimental:
            body = (
                '<p class="practice"><strong>Experimental training preview.</strong> This short evaluation uses a small search budget. Improved playing strength has not been established.</p>'
                + body
            )
        page = output / slug
        page.mkdir(exist_ok=True)
        (page / "index.html").write_text(
            shell(title, description, body, f"{base_url}/strategy-guides/{slug}/").replace(
                "</head>",
                '<meta name="robots" content="noindex"></head>' if experimental else "</head>",
            ),
            encoding="utf-8",
        )
        index_links.append(
            f'<li><a href="/strategy-guides/{slug}/"><h2>{escape(title)}</h2><p>{escape(description)}</p><span>Read guide →</span></a></li>'
        )
    body = (
        '<p class="eyebrow">Learn a deck. Make a choice. Play.</p><h1>Strategy guides</h1><p class="lede">Practical decision principles from pilots tested through complete games.</p><ul class="guide-list">'
        + "".join(index_links)
        + "</ul>"
    )
    if experimental:
        body = (
            '<p class="practice"><strong>Experimental training preview.</strong> Results use a limited search budget; improved playing strength has not been established.</p>'
            + body
        )
    (output / "index.html").write_text(
        shell(
            "Digimon strategy guides",
            "Learn Digimon Card Game decisions and practice BT26 decks on Aegis.",
            body,
            f"{base_url}/strategy-guides/",
        ).replace(
            "</head>",
            '<meta name="robots" content="noindex"></head>' if experimental else "</head>",
        ),
        encoding="utf-8",
    )
    public_evidence = {
        "reflectionModel": manifest["config"].get(
            "reflectionModel", manifest["config"].get("model")
        ),
        "engineSha256": report["engineSha256"],
        "runnerSha256": report["runnerSha256"],
        "simulations": report["simulations"],
        "policies": pilots,
        "results": {
            version: {
                **{
                    key: value
                    for key, value in result.items()
                    if key not in ("selected", "control")
                },
                **{
                    arm: [
                        {
                            "task": {
                                key: value
                                for key, value in game["task"].items()
                                if key != "opponentProgram"
                            },
                            "score": game["score"],
                            "valid": game["valid"],
                            "candidateSha256": game["candidateSha256"],
                            "searches": [
                                {
                                    key: search[key]
                                    for key in (
                                        "requested",
                                        "attempted",
                                        "completed",
                                        "invalid",
                                        "nodes",
                                    )
                                    if key in search
                                }
                                for search in game.get("searches", [])
                            ],
                        }
                        for game in result[arm]
                    ]
                    for arm in ("selected", "control")
                },
            }
            for version, result in report["results"].items()
            if version in pilots
        },
    }
    if experimental:
        public_evidence["experimental"] = True
    if catalog_output is not None:
        catalog_output.parent.mkdir(parents=True, exist_ok=True)
        catalog_output.write_text(json.dumps(catalog, indent=2) + "\n", encoding="utf-8")
    (output / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
        + "".join(
            f"<url><loc>{escape(url)}</loc></url>" for url in ([] if experimental else page_urls)
        )
        + "</urlset>\n",
        encoding="utf-8",
    )
    (output / "evidence.json").write_text(
        json.dumps(public_evidence, indent=2) + "\n", encoding="utf-8"
    )


@click.command()
@click.option("--run-dir", required=True, type=click.Path(path_type=Path, exists=True))
@click.option(
    "--output", default=Path("apps/web/public/strategy-guides"), type=click.Path(path_type=Path)
)
@click.option(
    "--catalog-output",
    default=Path("apps/web/src/guides/catalog.json"),
    type=click.Path(path_type=Path),
)
@click.option("--base-url", required=True)
def main(run_dir: Path, output: Path, base_url: str, catalog_output: Path) -> None:
    parsed = urlparse(base_url)
    if parsed.scheme != "https" or not parsed.netloc or parsed.path not in ("", "/"):
        raise click.ClickException("Use the canonical HTTPS site origin")
    try:
        publish(run_dir, output, base_url.rstrip("/"), catalog_output)
    except (ValueError, KeyError) as error:
        raise click.ClickException(str(error)) from error
    click.echo(f"Published guides to {output}")


if __name__ == "__main__":
    main()
