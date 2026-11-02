import type { Effect } from "#api/engine/effects/Effect";
import type { EffectContext } from "#api/engine/effects/context/effectContext";

export type ResidentCostSourcePayload = { effect: Effect; ctx: EffectContext };
