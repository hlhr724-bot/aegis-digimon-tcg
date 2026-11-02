import json

import pytest

from DiagonalCma import DiagonalCma


def test_search_improves_a_quadratic_objective() -> None:
    search = DiagonalCma([3.0, 3.0], sigma=1, population=8, seed=20)
    best = 18.0
    for _ in range(30):
        vectors = search.ask()
        losses = [sum(value * value for value in vector) for vector in vectors]
        best = min(best, min(losses))
        search.tell([-loss for loss in losses])
    assert best < 0.1
    assert sum(value * value for value in search.mean) < 0.2


def test_json_resume_reproduces_the_next_population_exactly() -> None:
    search = DiagonalCma([1.0, -2.0, 3.0], seed=100)
    search.ask()
    search.tell([float(index) for index in range(8)])
    state = json.loads(json.dumps(search.state()))
    resumed = DiagonalCma([0.0, 0.0, 0.0], population=8, state=state)
    assert resumed.ask() == search.ask()
    assert resumed.ask() == search.ask()
    scores = [float(index % 3) for index in range(8)]
    resumed.tell(scores)
    search.tell(scores)
    assert resumed.mean == search.mean
    assert resumed.state() == search.state()


def test_incomplete_generation_cannot_be_saved_or_updated() -> None:
    search = DiagonalCma([1.0])
    with pytest.raises(ValueError):
        search.tell([0.0] * 8)
    search.ask()
    with pytest.raises(ValueError):
        search.state()
    with pytest.raises(ValueError):
        search.tell([0.0])
