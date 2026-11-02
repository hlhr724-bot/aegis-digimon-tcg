import { fixtureInstanceId, fixturePermanentId } from "#api/engine/scenario/references";
import type { ScenarioOpponent } from "./types.js";
import { createEvaluationPolicy, type BotPolicy } from "../../bot/policy.js";

/** Script selected actions and decisions, leaving other choices to the regular evaluator. */
export function createFixtureBotPolicy(script: ScenarioOpponent | undefined): BotPolicy | undefined {
  if (!script) return undefined;
  const fallback = createEvaluationPolicy();
  return {
    ...fallback,
    name: "fixture-opponent",
    chooseBreedingAction(view) {
      return script.endBreeding ? { type: "endPhase" } : fallback.chooseBreedingAction(view);
    },
    chooseMainAction(view) {
      for (const action of script.main ?? []) {
        if (action.kind === "attack") {
          const attacker = view.board.find((p) => p.canAttackPlayer && !p.suspended);
          if (attacker)
            return { type: "attack", attackerPermanentId: attacker.permanentId, target: { kind: "player" } };
        } else {
          const card = view.hand.find((c) => c.cardId === action.card);
          if (!card) continue;
          if (action.kind === "play") {
            if (!action.whenOpponentCard || view.opponentBoard.some((p) => p.cardId === action.whenOpponentCard))
              return {
                type: "playCard",
                instanceId: card.instanceId,
                ...(action.useAs ? { useAs: action.useAs } : {}),
              };
          } else {
            const base = view.board.find((p) => p.cardId === action.base);
            if (base)
              return {
                type: "digivolve",
                instanceId: card.instanceId,
                permanentId: base.permanentId,
                ...(action.alternate ? { useAlternateCost: true } : {}),
              };
          }
        }
      }
      return script.fallbackMain === "end" ? { type: "endPhase" } : fallback.chooseMainAction(view);
    },
    chooseBlockResponse(view, context) {
      const blocker = view.board.find(
        (p) => p.cardId === script.blockerCard && context.eligibleBlockerIds.includes(p.permanentId),
      );
      return blocker
        ? { type: "declareBlock", blockerPermanentId: blocker.permanentId }
        : fallback.chooseBlockResponse(view, context);
    },
    answerDecision(view, request) {
      for (const rule of script.decisions ?? []) {
        if (
          rule.sourceCard !== request.sourceCardId ||
          rule.kind !== request.kind ||
          (rule.timing && rule.timing !== request.options?.timing) ||
          (rule.promptIncludes && !request.promptText?.toLowerCase().includes(rule.promptIncludes.toLowerCase()))
        )
          continue;
        const decisionId = request.decisionId;
        if (rule.kind === "optional")
          return { type: "respondDecision", decisionId, response: { kind: "optional", accept: rule.accept ?? false } };
        if (rule.kind === "orderTriggers")
          return {
            type: "respondDecision",
            decisionId,
            response: {
              kind: "orderTriggers",
              order: request.options?.triggerKeys ?? [],
              optionalAnswers: Object.fromEntries(
                (request.options?.triggerKeys ?? []).map((key) => [key, rule.accept ?? false]),
              ),
            },
          };
        if (rule.kind === "chooseTargets" && rule.target) {
          const instanceId = fixtureInstanceId(rule.target);
          const target =
            [...(view?.board ?? []), ...(view?.opponentBoard ?? [])].find(
              (permanent) => permanent.topCardInstanceId === instanceId,
            )?.permanentId ?? fixturePermanentId(rule.target);
          if (request.options?.candidateInstanceIds?.includes(target))
            return { type: "respondDecision", decisionId, response: { kind: "chooseTargets", instanceIds: [target] } };
        }
        if (rule.kind === "selectCards" && rule.target) {
          const instanceId = fixtureInstanceId(rule.target);
          if (request.options?.candidateInstanceIds?.includes(instanceId))
            return {
              type: "respondDecision",
              decisionId,
              response: { kind: "selectCards", instanceIds: [instanceId] },
            };
        }
        if (rule.kind === "chooseOption") {
          const optionIndex = (request.options?.choices ?? []).findIndex((choice) =>
            rule.choice
              ? choice === rule.choice
              : choice.toLowerCase().startsWith(rule.choiceStartsWith!.toLowerCase()),
          );
          if (optionIndex >= 0)
            return { type: "respondDecision", decisionId, response: { kind: "chooseOption", optionIndex } };
        }
      }
      return fallback.answerDecision(view, request);
    },
  };
}
