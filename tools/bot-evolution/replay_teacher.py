import json
from pathlib import Path

import click

from ReplayTeacherCampaign import ReplayTeacherCampaign


@click.command()
@click.option("--inputs", type=click.Path(exists=True, path_type=Path), required=True)
@click.option("--exclude", multiple=True, type=click.Path(exists=True, path_type=Path))
@click.option("--run-dir", type=click.Path(path_type=Path), required=True)
@click.option("--node", default="node")
@click.option("--refine-from", type=click.Path(exists=True, file_okay=False, path_type=Path))
def main(
    inputs: Path, exclude: tuple[Path, ...], run_dir: Path, node: str, refine_from: Path | None
) -> None:
    campaign = ReplayTeacherCampaign(
        inputs=inputs, exclusions=list(exclude), directory=run_dir, node=node
    )
    try:
        report = campaign.run() if refine_from is None else campaign.run_refinement(refine_from)
        click.echo(json.dumps(report, indent=2))
    finally:
        campaign.close()


if __name__ == "__main__":
    main()
