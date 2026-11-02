import pytest

from summarize_local_screen import summarize_local_screen


def _position(block, differences, invalid=0, refused=0):
    return {
        "block": block,
        "differences": differences,
        "invalidPairs": invalid,
        "refusedPairs": refused,
    }


def test_scales_each_block_by_its_changed_positions():
    screen = summarize_local_screen(
        [4, 1, 0],
        [4, 4, 4],
        [_position(0, [0.1, 0.1]), _position(0, [0.0, 0.2]), _position(1, [-0.2, -0.2])],
    )
    assert screen["blockGains"] == pytest.approx([0.1, -0.05, 0.0])
    assert screen["blockScores"] == pytest.approx([0.6, 0.45, 0.5])
    assert screen["blockSampled"] == [2, 1, 0]
    assert screen["difference"] == pytest.approx(0.0)


def test_clips_block_scores():
    screen = summarize_local_screen(
        [10, 10], [1, 1], [_position(0, [1.0, 1.0]), _position(1, [-1.0] * 2)]
    )
    assert screen["blockScores"] == [1.0, 0.0]


def test_reports_blocks_with_changes_but_no_estimate():
    screen = summarize_local_screen([2, 3], [4, 4], [_position(0, [0.1, 0.3])])
    assert screen["blockScores"] == pytest.approx([0.6, 0.5])
    assert screen["unestimatedBlocks"] == 1


def test_interval_uses_within_position_variance():
    screen = summarize_local_screen(
        [2], [4], [_position(0, [1.0, 0.0, 1.0, 0.0]), _position(0, [-1.0, 0.0, -1.0, 0.0])]
    )
    half = 1.96 * (4 * (1 / 3) * 2) ** 0.5 / 8
    assert screen["difference"] == 0.0
    assert screen["approximate95"] == pytest.approx([-half, half])


def test_counts_invalid_and_refused_pairs_and_excludes_unusable_positions():
    screen = summarize_local_screen(
        [3],
        [4],
        [
            _position(0, [-1.0, 0.5], invalid=1),
            _position(0, [], refused=1),
            _position(0, [0.5], refused=7),
        ],
    )
    assert screen["usablePositions"] == 1
    assert screen["pairs"] == 2
    assert screen["invalidPairs"] == 1
    assert screen["refusedPairs"] == 8
    assert screen["blockGains"] == pytest.approx([-0.75 / 4])


def test_has_no_estimate_without_usable_positions():
    screen = summarize_local_screen([0, 0], [4, 4], [])
    assert screen["blockScores"] == [0.5, 0.5]
    assert screen["difference"] is None
    assert screen["approximate95"] is None


def test_a_block_without_scored_games_gains_nothing():
    screen = summarize_local_screen([1], [0], [_position(0, [0.5, 0.5])])
    assert screen["blockScores"] == [0.5]
