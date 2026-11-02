from typing import Any


def has_replicated_preference(case: dict[str, Any]) -> bool:
    result = case["result"]
    return result.get("replicated") is True and result.get("preference") is not None
