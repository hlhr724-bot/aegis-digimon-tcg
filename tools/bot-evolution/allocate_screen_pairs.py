def allocate_screen_pairs(positions: int, *, budget: int, minimum: int, maximum: int) -> list[int]:
    if budget < 0 or minimum < 1 or maximum < 0:
        raise ValueError("Use a non-negative budget and maximum and a positive minimum")
    count = min(positions, maximum, budget // minimum)
    if count <= 0:
        return []
    share, extra = divmod(budget, count)
    return [share + (index < extra) for index in range(count)]
