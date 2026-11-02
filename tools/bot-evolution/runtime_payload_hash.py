import hashlib


def runtime_payload_hash(entries: dict[str, str]) -> str:
    """Cross-language archive/live binding: sorted POSIX path, NUL, file SHA, newline."""
    payload = "".join(
        f"{name}\0{entries[name]}\n" for name in sorted(entries) if name.endswith((".js", ".json"))
    )
    return hashlib.sha256(payload.encode()).hexdigest()
