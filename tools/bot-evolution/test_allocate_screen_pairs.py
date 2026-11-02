import pytest

from allocate_screen_pairs import allocate_screen_pairs


def test_splits_the_budget_as_evenly_as_possible():
    assert allocate_screen_pairs(3, budget=10, minimum=2, maximum=64) == [4, 3, 3]
    assert sum(allocate_screen_pairs(7, budget=826, minimum=8, maximum=64)) == 826


def test_caps_positions_by_the_maximum():
    assert allocate_screen_pairs(100, budget=826, minimum=8, maximum=64) == [13] * 58 + [12] * 6


def test_caps_positions_so_each_keeps_the_minimum():
    allocation = allocate_screen_pairs(100, budget=40, minimum=8, maximum=64)
    assert allocation == [8] * 5


def test_returns_nothing_without_positions_or_budget():
    assert allocate_screen_pairs(0, budget=826, minimum=8, maximum=64) == []
    assert allocate_screen_pairs(5, budget=7, minimum=8, maximum=64) == []


def test_is_deterministic():
    first = allocate_screen_pairs(9, budget=826, minimum=8, maximum=64)
    assert first == allocate_screen_pairs(9, budget=826, minimum=8, maximum=64)


def test_rejects_a_non_positive_minimum():
    with pytest.raises(ValueError):
        allocate_screen_pairs(3, budget=10, minimum=0, maximum=64)
