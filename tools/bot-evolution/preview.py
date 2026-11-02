"""Render an explicitly experimental local preview from completed paired games."""

import hashlib
import json
from pathlib import Path
from urllib.parse import urlparse

import click

from evidence import program_hash
from publish import GUIDES, render_guides


def preview(run_dir: Path, output: Path, base_url: str, catalog_output: Path) -> None:
    manifest = json.loads((run_dir / "manifest.json").read_text(encoding="utf-8"))
    pilots = json.loads((run_dir / "pilots.json").read_text(encoding="utf-8"))
    report = json.loads((run_dir / "held-out.json").read_text(encoding="utf-8"))
    config = manifest["config"]
    if (
        report["engineSha256"] != config["engineSha256"]
        or report["runnerSha256"] != config["runnerSha256"]
        or report["simulations"] != config["simulations"]
        or report["simulations"] < 8
        or set(pilots) != set(GUIDES)
        or set(report["results"]) != set(pilots)
    ):
        raise ValueError("Preview requires three completed pilots from one pinned run")
    for version, stage in pilots.items():
        result = report["results"][version]
        if (
            stage["engineSha256"] != config["engineSha256"]
            or stage.get("validEvaluatedProposals", 0) < 1
            or result["allValid"] is not True
        ):
            raise ValueError("Preview requires evaluated alternatives and valid final games")
        paired = [
            sorted(json.dumps(game["task"], sort_keys=True) for game in result[arm])
            for arm in ("selected", "control")
        ]
        if paired[0] != paired[1]:
            raise ValueError("Preview requires paired held-out tasks")
        for arm in ("selected", "control"):
            games = result[arm]
            if len(games) < 4 or {
                game["task"]["learnerSeat"] for game in games if game["task"]["opponent"] == "mcts"
            } != {0, 1}:
                raise ValueError("Preview requires search games in both seats")
            program = stage["program"] if arm == "selected" else manifest["metadata"]["seedProgram"]
            candidate = hashlib.sha256(json.dumps(program).encode("utf-8")).hexdigest()
            for game in games:
                if (
                    game["valid"] is not True
                    or game["engineSha256"] != config["engineSha256"]
                    or game["candidateSha256"] not in (candidate, program_hash(program))
                ):
                    raise ValueError("Invalid game or mismatched preview policy")
                if game["task"]["opponent"] == "mcts" and (
                    not game.get("searches")
                    or any(
                        search["requested"] != report["simulations"]
                        or search["completed"] != search["requested"]
                        for search in game["searches"]
                    )
                ):
                    raise ValueError("Preview search budget was incomplete")
    render_guides(manifest, pilots, report, output, base_url, catalog_output, experimental=True)


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
def main(run_dir: Path, output: Path, catalog_output: Path, base_url: str) -> None:
    origin = urlparse(base_url)
    if origin.scheme not in ("http", "https") or not origin.netloc or origin.path not in ("", "/"):
        raise click.ClickException("Use an HTTP or HTTPS origin")
    try:
        preview(run_dir, output, base_url.rstrip("/"), catalog_output)
    except (ValueError, KeyError) as error:
        raise click.ClickException(str(error)) from error
    click.echo(f"Rendered experimental guides to {output}")


if __name__ == "__main__":
    main()
