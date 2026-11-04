import type { GameEngine } from "#api/engine/GameEngine";

type Verify = (params: { engine: GameEngine; recompute: () => Promise<void> }) => Promise<void>;

export const continuousSkipVerifier: { verify: Verify | undefined } = { verify: undefined };
