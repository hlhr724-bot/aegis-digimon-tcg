import type { Seat } from "@aegis/shared/schema/enums";
import type {
  BaseDpOverride,
  DpModifier,
  EvoCostAdjustment,
  MinDpFloor,
  PierceGrant,
  PlayerDpModifier,
  PlayCostAdjustment,
} from "#api/engine/effects/modifiers";

export type ModifierLedgerState = {
  dpModifiers: DpModifier[];
  playerDpModifiers: PlayerDpModifier[];
  baseDpOverrides: BaseDpOverride[];
  minDpFloors: MinDpFloor[];
  pierceGrants: PierceGrant[];
  evoCostAdjustments: EvoCostAdjustment[];
  playCostAdjustments: PlayCostAdjustment[];
  durationOwners: [object, Seat][];
  battleScopes: Map<number, { parent?: number; entries: Set<object> }>;
  baseDpOverrideSeq: number;
  recomputedOverrideActivations: Map<string, number[]>;
  evoCostSeq: number;
  playCostSeq: number;
};
