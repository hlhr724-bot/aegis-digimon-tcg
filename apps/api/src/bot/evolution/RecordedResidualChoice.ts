import type { DecisionRequest } from "@aegis/shared/protocol/events";
import type { Intent } from "@aegis/shared/protocol/intents";
import type { Seat } from "@aegis/shared/schema/enums";
import type { GameEngine } from "#api/engine/GameEngine";
import type { BotPolicy } from "#api/bot/policy";

export type RecordedResidualChoice = {
  engine: GameEngine;
  seat: Seat;
  method: keyof Pick<
    BotPolicy,
    | "chooseBreedingAction"
    | "chooseMainAction"
    | "chooseBlockResponse"
    | "chooseCounterResponse"
    | "chooseAllianceResponse"
    | "chooseEvadeResponse"
    | "chooseBarrierResponse"
    | "answerDecision"
  >;
  baseline: Intent;
  request?: DecisionRequest;
  context?: unknown;
  signal?: AbortSignal;
};
