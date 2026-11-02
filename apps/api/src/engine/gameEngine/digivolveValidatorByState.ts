import type { GameState, Seat } from "@aegis/shared";
import type { DigivolveCheck, DigivolveIntent } from "#api/engine/actions/digivolve";

export const digivolveValidatorByState = new WeakMap<
  GameState,
  (seat: Seat, intent: DigivolveIntent) => DigivolveCheck
>();
