import type { DecisionRequest, Intent } from "@aegis/shared";
import { digivolveCost } from "./candidates.js";
import { DEFAULT_BOT_PROFILE } from "./profiles.js";
import type { AllianceContext, BlockContext, BotPolicy, CounterContext } from "./policy.js";
import { answerDecisionWith } from "./policy.js";
import { isDigimonCard, isOptionCard, type BotUnit, type BotView } from "./view.js";

/**
 * The original hard-coded heuristic policy, preserved verbatim in behavior.
 *
 * It is kept only so `benchmark.test.ts` has a fixed baseline to prove the
 * evaluation-driven policy against; nothing in production selects it. Its strategy was:
 *
 *   Breeding: hatch when empty, keep a young Digimon in the raising area while it can
 *     still be digivolved this turn, deploy at Lv.4+.
 *   Main: attack security with every unsuspended Digimon, biggest first; then prefer
 *     digivolving over hard-playing, spending into negative memory at most once a turn.
 *   Blocking: always decline.
 *
 * The combat-prompt answers (counter / alliance / evade / barrier) are new; the original
 * simply never answered them, which stalls a bot-vs-bot match because those engine
 * windows await a response. They are answered here the least opinionated way possible so
 * the baseline stays a baseline.
 */

/** A Digimon at this level or above is mature enough to leave the raising area. */
const BREEDING_DEPLOY_LEVEL = 4;

export function createBaselinePolicy(): BotPolicy {
  let crossedZeroThisTurn = false;
  const rejectedAttackers = new Set<string>();

  return {
    name: "baseline",

    onTurnStart(): void {
      crossedZeroThisTurn = false;
      rejectedAttackers.clear();
    },

    chooseBreedingAction(view: BotView): Intent {
      const breeding = view.breeding;
      if (breeding === undefined) {
        return view.eggDeckCount > 0 ? { type: "hatchEgg" } : { type: "endPhase" };
      }
      if (breeding.level < 3) return { type: "endPhase" };
      if (breeding.level >= BREEDING_DEPLOY_LEVEL || !canDigivolveOnto(view, breeding)) {
        return { type: "moveFromBreeding", permanentId: breeding.permanentId };
      }
      return { type: "endPhase" };
    },

    chooseMainAction(view: BotView): Intent {
      const attacker = [...view.board]
        .filter((unit) => !unit.suspended && unit.cardId !== undefined && !rejectedAttackers.has(unit.permanentId))
        .sort((left, right) => right.dp - left.dp)[0];
      if (attacker !== undefined) {
        return { type: "attack", attackerPermanentId: attacker.permanentId, target: { kind: "player" } };
      }

      const develop = bestDevelopAction(view);
      if (develop === undefined) return { type: "endPhase" };
      if (view.memory - develop.cost >= 0) return develop.intent;
      if (crossedZeroThisTurn) return { type: "endPhase" };
      crossedZeroThisTurn = true;
      return develop.intent;
    },

    chooseBlockResponse(_view: BotView, context: BlockContext): Intent {
      if (context.mustBlock) {
        const blockerPermanentId = context.eligibleBlockerIds[0];
        if (blockerPermanentId !== undefined) return { type: "declareBlock", blockerPermanentId };
      }
      return { type: "declineBlock" };
    },

    chooseCounterResponse(_view: BotView, _context: CounterContext): Intent {
      return { type: "respondCounter" };
    },

    chooseAllianceResponse(_view: BotView, _context: AllianceContext): Intent {
      return { type: "respondAlliance" };
    },

    chooseEvadeResponse(_view: BotView, permanentId: string): Intent {
      return { type: "respondEvade", permanentId, accept: true };
    },

    chooseBarrierResponse(_view: BotView, permanentId: string): Intent {
      return { type: "respondBarrier", permanentId, accept: false };
    },

    answerDecision(view: BotView | undefined, request: DecisionRequest): Intent {
      if (request.kind === "mulligan") return { type: "mulligan", keep: true };
      if (request.kind === "selectCards" || request.kind === "chooseTargets") {
        const min = request.options?.min ?? 0;
        const instanceIds =
          request.kind === "chooseTargets" && request.options?.allowedTargetCombinations !== undefined
            ? (request.options.allowedTargetCombinations[0] ?? [])
            : (request.options?.candidateInstanceIds ?? []).slice(0, min);
        return {
          type: "respondDecision",
          decisionId: request.decisionId,
          response:
            request.kind === "selectCards"
              ? { kind: "selectCards", instanceIds }
              : { kind: "chooseTargets", instanceIds },
        };
      }
      return answerDecisionWith(view, request, DEFAULT_BOT_PROFILE);
    },

    noteRejected(intent: Intent): void {
      if (intent.type === "attack") rejectedAttackers.add(intent.attackerPermanentId);
    },
  };
}

interface DevelopAction {
  intent: Intent;
  cost: number;
  value: number;
}

function bestDevelopAction(view: BotView): DevelopAction | undefined {
  // The original preferred a digivolution over a hard play whenever both existed.
  return bestDigivolve(view) ?? bestPlay(view);
}

function bestDigivolve(view: BotView): DevelopAction | undefined {
  const bases = view.breeding === undefined ? view.board : [...view.board, view.breeding];
  let best: DevelopAction | undefined;
  for (const card of view.hand) {
    if (!isDigimonCard(card.definition)) continue;
    for (const base of bases) {
      if (base.cardId === undefined || base.cannotDigivolve) continue;
      const cost = digivolveCost(card.cardId, base.cardId, {
        inBreeding: base.inBreeding,
        controlledUnits: view.board,
      });
      if (cost === undefined || cost > view.maxAffordable) continue;
      const value = (card.definition?.level ?? 0) * 100 - cost;
      if (best === undefined || value > best.value) {
        best = {
          intent: { type: "digivolve", permanentId: base.permanentId, instanceId: card.instanceId },
          cost,
          value,
        };
      }
    }
  }
  return best;
}

function bestPlay(view: BotView): DevelopAction | undefined {
  let best: DevelopAction | undefined;
  for (const card of view.hand) {
    const definition = card.definition;
    if (!isDigimonCard(definition) || isOptionCard(definition) || definition === undefined) continue;
    if (definition.playCost > view.maxAffordable) continue;
    const value = definition.dp - definition.playCost;
    if (best === undefined || value > best.value) {
      best = { intent: { type: "playCard", instanceId: card.instanceId }, cost: definition.playCost, value };
    }
  }
  return best;
}

function canDigivolveOnto(view: BotView, base: BotUnit): boolean {
  if (base.cardId === undefined || base.cannotDigivolve) return false;
  return view.hand.some(
    (card) =>
      isDigimonCard(card.definition) &&
      (digivolveCost(card.cardId, base.cardId!, {
        inBreeding: base.inBreeding,
        controlledUnits: view.board,
      }) ?? Number.POSITIVE_INFINITY) <= view.maxAffordable,
  );
}
