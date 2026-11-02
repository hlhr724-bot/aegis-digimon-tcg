import math

import pytest
from click.testing import CliRunner

from pentanomial_sprt import _run_cli, pentanomial_sprt


def test_no_blocks_cannot_accept_or_reject():
    result = pentanomial_sprt([], elo0=0, elo1=10)
    assert result["decision"] == "continue"
    assert result["mean"] is None
    assert result["games"] == 0


def test_extreme_blocks_match_a_bernoulli_trial_per_block_not_per_game():
    blocks = [[1, 1, 1, 1]] * 75 + [[0, 0, 0, 0]] * 25
    mean1 = 1 / (1 + 10 ** (-40 / 400))
    expected = 75 * math.log(mean1 / 0.5) + 25 * math.log((1 - mean1) / 0.5)
    result = pentanomial_sprt(blocks, elo0=0, elo1=40)
    assert result["llr"] == pytest.approx(expected)
    assert result["decision"] == "accept"
    assert result["blocks"] == 100
    assert result["games"] == 400


def test_mixed_half_points_are_retained_as_nine_block_categories():
    blocks = [[0.5, 0, 0, 0], [1, 0.5, 0, 0], [1, 1, 0.5, 0], [1, 1, 1, 0.5]]
    result = pentanomial_sprt(blocks, elo0=-10, elo1=10)
    assert result["counts"] == [0, 1, 0, 1, 0, 1, 0, 1, 0]
    assert result["llr"] == pytest.approx(0, abs=1e-10)


def test_degenerate_support_does_not_invent_variance_or_pseudogames():
    result = pentanomial_sprt([[0.5] * 4] * 100, elo0=0, elo1=40)
    assert result["decision"] == "reject"
    assert sum(result["counts"]) == 100
    assert math.isfinite(result["llr"])


def test_reversing_scores_and_bounds_reverses_the_likelihood_ratio():
    blocks = [[1, 1, 0.5, 0], [0, 0, 0, 1], [1, 1, 1, 1]]
    forward = pentanomial_sprt(blocks, elo0=-20, elo1=40)
    reverse = pentanomial_sprt([[1 - score for score in block] for block in blocks], elo0=-40, elo1=20)
    assert forward["llr"] == pytest.approx(-reverse["llr"])


@pytest.mark.parametrize("blocks", [[[1, 1, 1]], [[1, 1, 1, None]], [[True, 0, 0, 0]], [[1, 1, 1, 0.2]]])
def test_incomplete_or_invalid_games_cannot_become_evidence(blocks):
    with pytest.raises(ValueError, match="complete valid"):
        pentanomial_sprt(blocks, elo0=0, elo1=10)


@pytest.mark.parametrize("bounds", [(10, 0), (0, float("nan")), (-5000, 10)])
def test_invalid_hypotheses_are_rejected(bounds):
    with pytest.raises(ValueError):
        pentanomial_sprt([], elo0=bounds[0], elo1=bounds[1])


def test_cli_reads_blocks_and_emits_json(tmp_path):
    path = tmp_path / "blocks.json"
    path.write_text("[[1,1,1,1]]", encoding="utf-8")
    result = CliRunner().invoke(_run_cli, [str(path), "--elo0", "0", "--elo1", "10"])
    assert result.exit_code == 0
    assert '"decision": "continue"' in result.output
