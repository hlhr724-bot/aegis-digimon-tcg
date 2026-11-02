import type { DecisionRequest } from "@aegis/shared/protocol/events";
import type { DecisionAnswer } from "#api/bot/decisions/DecisionAnswer";
import type { BotView } from "#api/bot/view";

export type DecisionAnswerObservation =
  | {
      kind: DecisionRequest["kind"];
      view: BotView | undefined;
      request: DecisionRequest;
      answer: DecisionAnswer;
      answerRequest: (request: DecisionRequest) => DecisionAnswer;
    }
  | { kind: "evade" | "counter"; view: BotView; sourceCardId?: string; answer: DecisionAnswer };
