import pytest

from rating_ladder import rating_ladder


def test_equal_bots_have_equal_ratings_and_intervals_include_the_reference():
    result = rating_ladder([{"first": "candidate", "second": "legacy", "scores": [1, 0, 1, 0]}] * 100, reference="legacy")
    candidate = next(row for row in result["ratings"] if row["name"] == "candidate")
    assert candidate["rating"] == pytest.approx(1500)
    assert candidate["low"] < 1500 < candidate["high"]
    assert result["blocks"] == 100
    assert result["games"] == 400


def test_fractional_scores_fit_known_logistic_odds():
    result = rating_ladder([{"first": "strong", "second": "legacy", "scores": [1, 1, 1, 0]}] * 1000, reference="legacy")
    strongest = result["ratings"][0]
    assert strongest["name"] == "strong"
    assert strongest["rating"] == pytest.approx(1690.85, abs=0.1)
    assert strongest["low"] > 1500


def test_reversing_seats_preserves_the_ranking():
    blocks = [{"first": "strong", "second": "legacy", "scores": [1, 1, 1, 0]}] * 25
    original = rating_ladder(blocks, reference="legacy")
    reversed_blocks = [{"first": "legacy", "second": "strong", "scores": [0, 0, 0, 1]}] * 25
    assert original["ratings"] == rating_ladder(reversed_blocks, reference="legacy")["ratings"]


def test_indirect_comparisons_form_a_connected_ladder():
    blocks = [
        {"first": "strong", "second": "middle", "scores": [1, 1, 1, 0]},
        {"first": "middle", "second": "weak", "scores": [1, 1, 1, 0]},
    ] * 50
    result = rating_ladder(blocks, reference="middle")
    assert [row["name"] for row in result["ratings"]] == ["strong", "middle", "weak"]


def test_perfect_records_have_finite_regularized_estimates_with_uncertainty():
    result = rating_ladder([{"first": "strong", "second": "legacy", "scores": [1, 1, 1, 1]}], reference="legacy")
    candidate = result["ratings"][0]
    assert candidate["rating"] > 1500
    assert candidate["high"] > candidate["low"]
    assert result["ridge"] == 0.01


def test_disconnected_graph_is_not_reported_as_a_comparable_ladder():
    with pytest.raises(ValueError, match="disconnected"):
        rating_ladder([
            {"first": "first", "second": "legacy", "scores": [0.5] * 4},
            {"first": "third", "second": "fourth", "scores": [0.5] * 4},
        ], reference="legacy")


@pytest.mark.parametrize("scores", [[1, 1], [None] * 4, [True] * 4, [float("nan")] * 4])
def test_invalid_results_are_not_rated(scores):
    with pytest.raises(ValueError, match="four valid"):
        rating_ladder([{"first": "first", "second": "legacy", "scores": scores}], reference="legacy")
