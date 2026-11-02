import type { Intent } from "@aegis/shared/protocol/intents";
import type { BotPolicy } from "#api/bot/policy";

interface CreateFallbackBotPolicyParams {
  name: string;
  candidate: BotPolicy<Intent | Promise<Intent>>;
  standard: BotPolicy<Intent | Promise<Intent>>;
  onFallback: () => void;
}

export function createFallbackBotPolicy({
  name,
  candidate,
  standard,
  onFallback,
}: CreateFallbackBotPolicyParams): BotPolicy<Intent | Promise<Intent>> {
  let fallenBack = false;
  const fallBack = () => {
    if (fallenBack) {
      return;
    }
    fallenBack = true;
    onFallback();
  };
  const choose = (
    fromCandidate: () => Intent | Promise<Intent>,
    fromStandard: () => Intent | Promise<Intent>,
    signal: AbortSignal | undefined,
  ): Intent | Promise<Intent> => {
    if (fallenBack) {
      return fromStandard();
    }
    let answer: Intent | Promise<Intent>;
    try {
      answer = fromCandidate();
    } catch {
      fallBack();
      return fromStandard();
    }
    if (!(answer instanceof Promise)) {
      return answer;
    }
    return answer.catch((error: unknown) => {
      if (signal?.aborted) {
        throw error;
      }
      fallBack();
      return fromStandard();
    });
  };
  return {
    name,
    observeEvent(event) {
      candidate.observeEvent?.(event);
      standard.observeEvent?.(event);
    },
    onTurnStart() {
      candidate.onTurnStart();
      standard.onTurnStart();
    },
    chooseBreedingAction: (view, signal) =>
      choose(
        () => candidate.chooseBreedingAction(view, signal),
        () => standard.chooseBreedingAction(view),
        signal,
      ),
    chooseMainAction: (view, signal) =>
      choose(
        () => candidate.chooseMainAction(view, signal),
        () => standard.chooseMainAction(view),
        signal,
      ),
    chooseBlockResponse: (view, context, signal) =>
      choose(
        () => candidate.chooseBlockResponse(view, context, signal),
        () => standard.chooseBlockResponse(view, context),
        signal,
      ),
    chooseCounterResponse: (view, context, signal) =>
      choose(
        () => candidate.chooseCounterResponse(view, context, signal),
        () => standard.chooseCounterResponse(view, context),
        signal,
      ),
    chooseAllianceResponse: (view, context, signal) =>
      choose(
        () => candidate.chooseAllianceResponse(view, context, signal),
        () => standard.chooseAllianceResponse(view, context),
        signal,
      ),
    chooseEvadeResponse: (view, permanentId, signal) =>
      choose(
        () => candidate.chooseEvadeResponse(view, permanentId, signal),
        () => standard.chooseEvadeResponse(view, permanentId),
        signal,
      ),
    chooseBarrierResponse: (view, permanentId, signal) =>
      choose(
        () => candidate.chooseBarrierResponse(view, permanentId, signal),
        () => standard.chooseBarrierResponse(view, permanentId),
        signal,
      ),
    answerDecision: (view, request, signal) =>
      choose(
        () => candidate.answerDecision(view, request, signal),
        () => standard.answerDecision(view, request),
        signal,
      ),
    noteRejected(intent) {
      if (fallenBack) {
        standard.noteRejected(intent);
        return;
      }
      fallBack();
    },
    onEngineRejection(event) {
      if (fallenBack) {
        standard.onEngineRejection?.(event);
        return;
      }
      fallBack();
    },
  };
}
