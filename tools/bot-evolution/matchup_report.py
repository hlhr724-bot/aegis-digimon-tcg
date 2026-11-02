import hashlib
import json
import tarfile
from html import escape
from pathlib import Path

import click

from summarize_matchups import summarize_matchups


def _html(report: dict) -> str:
    payload = json.dumps(report).replace("<", "\\u003c")
    title = "Certified bot matchup analysis"
    health = report["health"]
    rows = "".join(
        f"<tr><td>{escape(row['deck'])}</td><td>{row['seedBlocks']}</td><td>{row['games']}</td>"
        f"<td>{row['score']:.1%}</td><td>{row['lowerBound']:.1%}–{row['upperBound']:.1%}</td><td>{row['assessment']}</td></tr>"
        for row in report["decks"]
        if row["score"] is not None
    )
    return f"""<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title><style>
body{{font:16px system-ui;margin:2rem auto;max-width:1100px;padding:0 1rem;background:#101722;color:#e7eef6}}
table{{border-collapse:collapse;width:100%}}td,th{{text-align:left;padding:.65rem;border-bottom:1px solid #314155}}
select,input{{padding:.5rem;background:#1b293a;color:inherit;border:1px solid #68829e;border-radius:.3rem}}
.table{{overflow:auto}}p{{line-height:1.5}}caption{{text-align:left;margin:1rem 0;font-weight:bold}}
</style><h1>{title}</h1>
<p>{health["playedGames"]} played games, {health["completeValidSeedBlocks"]} complete valid seed blocks.
{health["invalidGames"]} invalid games and {health["timedOutGames"]} timeouts.</p>
<p>Descriptive analysis of the frozen certificate. Rows average two seat-balanced games per independent seed block.
Intervals correct for all declared deck and matchup groups. Small samples remain inconclusive; this report does not certify every deck.</p>
<div class="table"><table><caption>Candidate performance by learner deck</caption><thead><tr>
<th>Deck</th><th>Seed blocks</th><th>Games</th><th>Score</th><th>Interval</th><th>Assessment</th></tr></thead><tbody>{rows}</tbody></table></div>
<h2>Opponent matchups</h2><label>Candidate deck <select id="deck"></select></label>
<p id="context"></p><div class="table"><table><thead><tr><th>Opponent</th><th>Seed blocks</th><th>Games</th><th>Score</th><th>Interval</th><th>Assessment</th></tr></thead><tbody id="matchups"></tbody></table></div>
<script type="application/json" id="data">{payload}</script><script>
const data=JSON.parse(document.getElementById('data').textContent);
const select=document.getElementById('deck');
for(const row of data.decks){{const option=document.createElement('option');option.value=row.deck;option.textContent=row.deck;select.append(option);}}
function render(){{const table=document.getElementById('matchups');table.replaceChildren();
const rows=data.matchups.filter(row=>row.deck===select.value).sort((a,b)=>(a.score??-1)-(b.score??-1));
for(const row of rows){{const tr=document.createElement('tr');for(const value of [row.opponent,row.seedBlocks,row.games,row.score===null?'No games':(100*row.score).toFixed(1)+'%',row.lowerBound===null?'Unavailable':(100*row.lowerBound).toFixed(1)+'% – '+(100*row.upperBound).toFixed(1)+'%',row.assessment]){{const td=document.createElement('td');td.textContent=value;tr.append(td);}}table.append(tr);}}
document.getElementById('context').textContent=rows.length+' held-out opponent groups, ordered by observed score. Matchups absent from the protocol are not shown.';}}
select.addEventListener('change',render);render();</script></html>
"""


@click.command()
@click.option("--proof", type=click.Path(path_type=Path, exists=True), required=True)
@click.option("--output-dir", type=click.Path(path_type=Path), required=True)
def main(proof: Path, output_dir: Path) -> None:
    evidence_path = (
        Path(__file__).resolve().parents[2] / "apps/api/src/bot/evolution/strength-evidence.json"
    )
    evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
    proof_hash = hashlib.sha256(proof.read_bytes()).hexdigest()
    if proof_hash != evidence["evidence"]["sha256"]:
        raise click.ClickException(
            "Evidence archive differs from the pinned historical certificate"
        )
    with tarfile.open(proof) as archive:
        names = archive.getnames()
        if len(names) != len(set(names)):
            raise click.ClickException("Evidence archive contains duplicate members")
        if "certification-2/protocol.json" not in names:
            raise click.ClickException("Evidence archive has no certification protocol")
        protocol_stream = archive.extractfile("certification-2/protocol.json")
        if protocol_stream is None:
            raise click.ClickException("Evidence archive has no certification protocol")
        protocol = json.load(protocol_stream)
        looks = [
            look for look in protocol["looks"] if f"certification-2/result-{look}.json" in names
        ]
        if not looks:
            raise click.ClickException("Evidence archive has no completed fixed look")
        look = max(looks)
        if look != evidence["certificate"]["acceptedLook"]:
            raise click.ClickException("Completed look does not match the pinned certificate")
        result_stream = archive.extractfile(f"certification-2/result-{look}.json")
        if result_stream is None or json.load(result_stream) != evidence["certificate"]["result"]:
            raise click.ClickException("Result does not match the pinned certificate")
        if (
            protocol["policySha256"] != evidence["policy"]["semanticSha256"]
            or protocol["engineSha256"] != evidence["certificate"]["engineSha256"]
        ):
            raise click.ClickException("Protocol differs from the certified policy or runtime")
        records = []
        raw_hashes = {}
        for index in range(look // 40):
            name = f"certification-2/games-{index:03d}.jsonl"
            if name not in names:
                raise click.ClickException("Evidence archive has an incomplete game batch")
            stream = archive.extractfile(name)
            if stream is None:
                raise click.ClickException("Evidence archive has an incomplete game batch")
            raw = stream.read()
            raw_hashes[name] = hashlib.sha256(raw).hexdigest()
            records.extend(json.loads(line) for line in raw.splitlines())
    report = summarize_matchups(protocol, records, look)
    expected_result = evidence["certificate"]["result"]
    for field, health_field in (
        ("played", "playedGames"),
        ("wins", "wins"),
        ("draws", "draws"),
        ("losses", "losses"),
        ("seedBlocks", "completeValidSeedBlocks"),
    ):
        if expected_result[field] != report["health"][health_field]:
            raise click.ClickException("Raw game counts differ from the pinned certificate")
    report["source"] = {
        "proofSha256": proof_hash,
        "rawBatchSha256": raw_hashes,
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "matchups.json").write_text(json.dumps(report, indent=2) + "\n")
    (output_dir / "matchups.html").write_text(_html(report))
    click.echo(json.dumps({"output": str(output_dir), "health": report["health"]}))


if __name__ == "__main__":
    main()
