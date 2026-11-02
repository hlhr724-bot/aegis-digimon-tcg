import type { Intent } from "@aegis/shared/protocol/intents";
import type { Seat } from "@aegis/shared/schema/enums";
import type { GameEngine } from "#api/engine/GameEngine";
import type { BotPolicy } from "#api/bot/policy";
import type { HeuristicProgram } from "#api/bot/evolution/heuristic";
import type { RecordedResidualChoice } from "#api/bot/evolution/RecordedResidualChoice";
import { createResidualPolicy } from "#api/bot/evolution/residualPolicy";

export function createRecordedResidualPolicy(input: {
  engine: GameEngine;
  seat: Seat;
  seed: number;
  program: HeuristicProgram;
  choose: (choice: RecordedResidualChoice) => Promise<Intent>;
  onDecision?: (trace: unknown) => void;
}): BotPolicy<Intent | Promise<Intent>> {
  const base = createResidualPolicy(input);
  const choose = (choice: Omit<RecordedResidualChoice, "engine" | "seat">) =>
    input.choose({ ...choice, engine: input.engine, seat: input.seat });
  return {
    ...base,
    name: `recorded:${base.name}`,
    chooseBreedingAction(view, signal) {
      return choose({
        method: "chooseBreedingAction",
        baseline: base.chooseBreedingAction(view, signal),
        signal,
      });
    },
    chooseMainAction(view, signal) {
      return choose({
        method: "chooseMainAction",
        baseline: base.chooseMainAction(view, signal),
        signal,
      });
    },
    chooseBlockResponse(view, context, signal) {
      return choose({
        method: "chooseBlockResponse",
        baseline: base.chooseBlockResponse(view, context, signal),
        context,
        signal,
      });
    },
    chooseCounterResponse(view, context, signal) {
      return choose({
        method: "chooseCounterResponse",
        baseline: base.chooseCounterResponse(view, context, signal),
        context,
        signal,
      });
    },
    chooseAllianceResponse(view, context, signal) {
      return choose({
        method: "chooseAllianceResponse",
        baseline: base.chooseAllianceResponse(view, context, signal),
        context,
        signal,
      });
    },
    chooseEvadeResponse(view, permanentId, signal) {
      return choose({
        method: "chooseEvadeResponse",
        baseline: base.chooseEvadeResponse(view, permanentId, signal),
        context: permanentId,
        signal,
      });
    },
    chooseBarrierResponse(view, permanentId, signal) {
      return choose({
        method: "chooseBarrierResponse",
        baseline: base.chooseBarrierResponse(view, permanentId, signal),
        context: permanentId,
        signal,
      });
    },
    answerDecision(view, request, signal) {
      return choose({
        method: "answerDecision",
        baseline: base.answerDecision(view, request, signal),
        request,
        signal,
      });
    },
  };
}
