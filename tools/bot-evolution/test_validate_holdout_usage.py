import json
from pathlib import Path

import pytest

from validate_holdout_usage import validate_holdout_usage


def read_pool():
    return json.loads(Path(__file__).with_name("holdout-pool.json").read_text(encoding="utf-8"))


def test_training_cannot_use_reserved_compositions_even_with_different_card_order():
    deck = read_pool()["decks"][0]
    with pytest.raises(ValueError, match="Reserved holdout deck"):
        validate_holdout_usage([{"decks": [{"mainDeck": list(reversed(deck["mainDeck"])), "eggDeck": deck["eggDeck"]}]}])


def test_training_cannot_hide_reserved_decks_inside_replays():
    deck = read_pool()["decks"][0]
    with pytest.raises(ValueError, match="Reserved holdout deck"):
        validate_holdout_usage([{"replayContinuation": {"record": {"seats": [{"deck": deck}]}}}])


@pytest.mark.parametrize("key", ["seed", "seedBase", "sampleSeed", "searchSeed"])
def test_training_cannot_consume_the_reserved_seed_range(key):
    with pytest.raises(ValueError, match="Reserved holdout seed"):
        validate_holdout_usage([{key: read_pool()["seedBase"]}])


def test_explicit_final_evaluation_is_allowed_and_identifies_the_pool():
    digest = validate_holdout_usage([{"seed": read_pool()["seedBase"], "decks": read_pool()["decks"]}], usage="holdout-evaluation")
    assert len(digest) == 64


def test_ordinary_training_inputs_remain_allowed():
    assert len(validate_holdout_usage([{"seed": 42, "decks": [{"mainDeck": ["BT1-010"], "eggDeck": []}]}])) == 64
