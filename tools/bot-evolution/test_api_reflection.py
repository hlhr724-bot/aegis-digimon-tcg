"""The budget is charged before the wire and survives unknown usage/pricing and resumes."""

import json
from types import SimpleNamespace

import pytest

from api_reflection import ApiReflection


def test_completion_limit_and_run_wide_reservation_precede_api_calls(tmp_path, monkeypatch):
    calls = []

    def complete(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(
            model_dump_json=lambda **kwargs: "{}",
            choices=[SimpleNamespace(message=SimpleNamespace(content="```json\n{}\n```"))],
        )

    monkeypatch.setattr("api_reflection.completion", complete)
    options = {
        "model": "openai/test-model",
        "completion_tokens": 100,
        "dollar_cap": 0.0015,
        "input_usd_per_million": 2,
        "output_usd_per_million": 8,
    }
    reflector = ApiReflection(tmp_path / "a", tmp_path / "budget.json", **options)
    assert reflector("small prompt").startswith("```json")
    assert calls[0]["max_completion_tokens"] == 100
    assert calls[0]["num_retries"] == 0
    resumed = ApiReflection(tmp_path / "b", tmp_path / "budget.json", **options)
    with pytest.raises(RuntimeError, match="dollar cap"):
        resumed("small prompt")
    assert len(calls) == 1
    assert json.loads((tmp_path / "budget.json").read_text())["reservedUsd"] > 0
    assert list((tmp_path / "a").glob("*.response.json"))


def test_unknown_or_zero_declared_pricing_is_refused(tmp_path):
    with pytest.raises(ValueError, match="explicit positive pricing"):
        ApiReflection(
            tmp_path / "a",
            tmp_path / "budget.json",
            model="unknown",
            completion_tokens=100,
            dollar_cap=1,
            input_usd_per_million=0,
            output_usd_per_million=0,
        )


def test_provider_switch_keeps_existing_reservations_and_one_total_cap(tmp_path, monkeypatch):
    calls = []
    monkeypatch.setattr(
        "api_reflection.completion",
        lambda **kwargs: (
            calls.append(kwargs)
            or SimpleNamespace(
                model_dump_json=lambda **kwargs: "{}",
                choices=[SimpleNamespace(message=SimpleNamespace(content="```json\n{}\n```"))],
            )
        ),
    )
    old = {
        "model": "openai/old",
        "completionTokens": 100,
        "dollarCap": 1,
        "inputUsdPerMillion": 2,
        "outputUsdPerMillion": 8,
    }
    ledger = tmp_path / "budget.json"
    ledger.write_text(json.dumps({"config": old, "reservedUsd": 0.99, "calls": 4}))
    options = {
        "model": "gemini/new",
        "completion_tokens": 100,
        "dollar_cap": 1,
        "input_usd_per_million": 4,
        "output_usd_per_million": 18,
        "reasoning_effort": "medium",
    }
    reflector = ApiReflection(tmp_path / "new", ledger, **options)
    reflector("small prompt")
    saved = json.loads(ledger.read_text())
    assert saved["calls"] == 5 and saved["reservedUsd"] > 0.99
    assert saved["configurations"] == [old, reflector.config]
    assert calls[0]["reasoning_effort"] == "medium"
    with pytest.raises(RuntimeError, match="dollar cap"):
        reflector("x" * 2000)
    assert len(calls) == 1
    with pytest.raises(ValueError, match="configuration changed"):
        ApiReflection(tmp_path / "raise-cap", ledger, **{**options, "dollar_cap": 2})
    with pytest.raises(ValueError, match="configuration changed"):
        ApiReflection(tmp_path / "change-price", ledger, **{**options, "output_usd_per_million": 1})


def test_provider_failure_is_latched_and_reservation_is_never_refunded(tmp_path, monkeypatch):
    def fail(**kwargs):
        raise RuntimeError("provider unavailable")

    monkeypatch.setattr("api_reflection.completion", fail)
    reflector = ApiReflection(
        tmp_path / "api",
        tmp_path / "budget.json",
        model="openai/test",
        completion_tokens=100,
        dollar_cap=1,
        input_usd_per_million=2,
        output_usd_per_million=8,
    )
    with pytest.raises(RuntimeError, match="provider unavailable"):
        reflector("small prompt")
    assert isinstance(reflector.failure, RuntimeError)
    assert json.loads((tmp_path / "budget.json").read_text())["reservedUsd"] > 0
    assert len(list((tmp_path / "api").glob("*.failure.json"))) == 1


@pytest.mark.parametrize("choices", ([], [SimpleNamespace(message=SimpleNamespace(content=""))]))
def test_empty_response_stops_paid_reflection_and_retains_raw_response(
    tmp_path, monkeypatch, choices
):
    monkeypatch.setattr(
        "api_reflection.completion",
        lambda **kwargs: SimpleNamespace(model_dump_json=lambda **kwargs: "{}", choices=choices),
    )
    reflector = ApiReflection(
        tmp_path / "api",
        tmp_path / "budget.json",
        model="gemini/test",
        completion_tokens=100,
        dollar_cap=1,
        input_usd_per_million=4,
        output_usd_per_million=18,
    )
    with pytest.raises(ValueError, match="Reflection API returned no"):
        reflector("small prompt")
    assert isinstance(reflector.failure, ValueError)
    assert len(list((tmp_path / "api").glob("*.response.json"))) == 1
    assert len(list((tmp_path / "api").glob("*.failure.json"))) == 1
