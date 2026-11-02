LOCAL_SCREEN_PAIRS = 826
LOCAL_SCREEN_MIN_PAIRS_PER_POSITION = 8
LOCAL_SCREEN_MAX_POSITIONS = 64
LOCAL_SCREEN_MIN_USABLE_POSITIONS = 8
LOCAL_SCREEN_SEED_OFFSET = 40_000_000
LOCAL_SCREEN_SEED_STRIDE = 1_000
LOCAL_SCREEN_INVALID_DIFFERENCE = -1.0
LOCAL_SCREEN_EXTRA_REPETITIONS = 3
LOCAL_SCREEN_HARVEST_SEED_OFFSET = 100_000_000
LOCAL_SCREEN_HARVEST_SEED_STRIDE = 10_000_000
LOCAL_SCREEN_REFUSALS = (
    "unsupported revealed or ordered hidden knowledge",
    "publicly known library order",
    "Hidden sampling changed the visible root",
)

LOCAL_SCREEN_PROTOCOL = {
    "version": 2,
    "pairs": LOCAL_SCREEN_PAIRS,
    "minPairsPerPosition": LOCAL_SCREEN_MIN_PAIRS_PER_POSITION,
    "maxPositions": LOCAL_SCREEN_MAX_POSITIONS,
    "minUsablePositions": LOCAL_SCREEN_MIN_USABLE_POSITIONS,
    "seedOffset": LOCAL_SCREEN_SEED_OFFSET,
    "seedStride": LOCAL_SCREEN_SEED_STRIDE,
    "invalidDifference": LOCAL_SCREEN_INVALID_DIFFERENCE,
    "refusals": list(LOCAL_SCREEN_REFUSALS),
    "extraRepetitions": LOCAL_SCREEN_EXTRA_REPETITIONS,
    "harvestSeedOffset": LOCAL_SCREEN_HARVEST_SEED_OFFSET,
    "harvestSeedStride": LOCAL_SCREEN_HARVEST_SEED_STRIDE,
    "continuation": (
        "Both arms continue with the baseline program on the controlled seat, through the panel "
        "scoring window and flags of the block job, against the block's own opponent policy; "
        "all-bot roots keep the recorded hidden state and reshuffle each library with the pair "
        "seed, refusing only publicly known library order; human roots keep open-decklist sampling"
    ),
    "harvest": (
        "When the scored games give fewer than minUsablePositions usable positions, up to "
        "extraRepetitions more plays of the same blocks with fresh seeds supply positions only; "
        "their game results never score"
    ),
    "objective": (
        "Per block 0.5 plus the block's scored changed positions times the mean paired "
        "continuation difference (candidate action minus baseline action, same sample seed) over "
        "the block's sampled usable positions, divided by the block's scored games, clipped to "
        "[0, 1]; the unchanged baseline scores 0.5 without continuations"
    ),
    "guard": (
        "Lower 95% bound of the pooled local paired difference (within-position variance) "
        "above zero over at least minUsablePositions usable positions, and no more invalid "
        "full FITNESS games than the baseline; fewer usable positions is unexercised"
    ),
}
