import type { EffectDuration, Seat } from "@aegis/shared/schema/enums";

export type SecurityDpSnapshot = {
  continuous: readonly (readonly [Seat, number])[];
  triggered: readonly { seat: Seat; delta: number; duration: EffectDuration }[];
};
