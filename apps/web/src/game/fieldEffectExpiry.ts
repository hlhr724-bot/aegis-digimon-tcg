import { EffectDuration, type FieldEffectView, type Seat } from "@aegis/shared";

export type FieldEffectExpiry =
  | { kind: "whileActive" }
  | { kind: "turnEnd"; seat: Seat; next: boolean }
  | { kind: "attackEnd" }
  | { kind: "battleEnd" }
  | { kind: "activePhase"; seat: Seat }
  | { kind: "costCalculated" }
  | { kind: "thisTurn" };

export function fieldEffectExpiry(effect: FieldEffectView): FieldEffectExpiry {
  if (effect.continuous || effect.duration === EffectDuration.Permanent) return { kind: "whileActive" };
  const owner: Seat = effect.ownerSeat === 1 ? 1 : 0;
  if (effect.duration === EffectDuration.UntilOwnerTurnEnd) {
    return { kind: "turnEnd", seat: owner, next: effect.skipsCurrentOpponentTurnEnd === true };
  }
  if (effect.duration === EffectDuration.UntilOpponentTurnEnd) {
    return { kind: "turnEnd", seat: owner === 0 ? 1 : 0, next: effect.skipsCurrentOpponentTurnEnd === true };
  }
  if (effect.duration === EffectDuration.UntilEndAttack) return { kind: "attackEnd" };
  if (effect.duration === EffectDuration.UntilEndBattle) return { kind: "battleEnd" };
  if (effect.duration === EffectDuration.UntilNextUntap || effect.duration === EffectDuration.UntilOwnerActivePhase) {
    return { kind: "activePhase", seat: owner };
  }
  if (effect.duration === EffectDuration.UntilCalculateFixedCost) return { kind: "costCalculated" };
  return { kind: "thisTurn" };
}
