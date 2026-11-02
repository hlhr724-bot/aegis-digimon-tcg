import { chooseCounterAction } from "#api/bot/decisions/chooseCounterAction";
import type { DecisionAnswerObservation } from "#api/bot/decisions/DecisionAnswerObservation";
import { explainDecisionAnswer } from "#api/bot/decisions/explainDecisionAnswer";
import { explainEvadeResponse } from "#api/bot/decisions/explainEvadeResponse";
import { selectScoredCandidate } from "#api/bot/levels/selectScoredCandidate";
import { selectAllianceAlly } from "#api/bot/selectAllianceAlly";
import type { DecisionRequest, ServerEvent } from "@aegis/shared/protocol/events";
import type { Intent } from "@aegis/shared/protocol/intents";
import { enumerateMainPhaseCandidates, digivolveCost, type Candidate } from "#api/bot/candidates";
import { appraiseBlock, bodyValue, scoreCandidate, shouldPayBarrier } from "#api/bot/evaluate";
import { DEFAULT_BOT_PROFILE, type BotProfile } from "#api/bot/profiles";
import { createBotRandom, type BotRandom } from "#api/bot/rng";
import { isDigimonCard, type BotView } from "#api/bot/view";
import type { LiveSearchFallbackCounts } from "#api/bot/search/LiveSearchFallback";

/**
 * The decision surface `BotPlayer` drives.
 *
 * `BotPlayer` owns the asynchronous plumbing — think delay, main-phase loop, routing
 * engine callbacks — and owns none of the judgement. Everything that decides WHAT to do
 * lives behind this interface, which is why the baseline heuristic policy can still be
 * instantiated unchanged for the benchmark to play against.
 */
export interface BotPolicy<Result extends Intent | Promise<Intent> = Intent> {
  readonly name: string;
  getSeenOpponentCards?(): { main: readonly string[]; eggs: readonly string[] };
  searchFallbacks?(): Readonly<LiveSearchFallbackCounts>;
  searchErrors?(): Readonly<Record<string, number>>;
  /** Broadcast events only; private decisions enter through answerDecision. */
  observeEvent?(event: ServerEvent): void;
  /** Called at the start of each of the bot's own turns so per-turn state can reset. */
  onTurnStart(): void;
  chooseBreedingAction(view: BotView, signal?: AbortSignal): Result;
  /** The single best action right now, or `endPhase` when passing beats everything. */
  chooseMainAction(view: BotView, signal?: AbortSignal): Result;
  chooseBlockResponse(view: BotView, context: BlockContext, signal?: AbortSignal): Result;
  chooseCounterResponse(view: BotView, context: CounterContext, signal?: AbortSignal): Result;
  chooseAllianceResponse(view: BotView, context: AllianceContext, signal?: AbortSignal): Result;
  chooseEvadeResponse(view: BotView, permanentId: string, signal?: AbortSignal): Result;
  chooseBarrierResponse(view: BotView, permanentId: string, signal?: AbortSignal): Result;
  answerDecision(view: BotView | undefined, request: DecisionRequest, signal?: AbortSignal): Result;
  /** The engine refused this intent; do not offer it again this turn. */
  noteRejected(intent: Intent): void;
  /** An asynchronous engine failure; its event may not identify the responsible seat. */
  onEngineRejection?(event: Extract<ServerEvent, { kind: "actionRejected" }>): void;
}

export interface BlockContext {
  attackerPermanentId: string;
  eligibleBlockerIds: readonly string[];
  mustBlock: boolean;
  /** False when the declared attack targets one of our Digimon rather than us. */
  targetsPlayer: boolean;
  /** Current public attack target, including any pre-block redirection. */
  targetPermanentId?: string;
}

export type CounterContext = Extract<ServerEvent, { kind: "counterWindowOpened" }>;
export type AllianceContext = Extract<ServerEvent, { kind: "alliancePrompt" }>;

export interface EvaluationPolicyOptions {
  profile?: BotProfile;
  seed?: number;
  temperature?: number;
  topK?: number;
  preferBeneficialSelections?: boolean;
  preferFreeOptionSelections?: boolean;
  onDecisionAnswer?: (observation: DecisionAnswerObservation) => void;
}

/**
 * The evaluation-driven policy: enumerate every legal action, score each one with the
 * shared evaluation function under this profile's weights, play the best.
 *
 * Personality lives entirely in `profile.weights`. There is deliberately no branch on
 * profile name anywhere in this file.
 */
export function createEvaluationPolicy(options: EvaluationPolicyOptions = {}): BotPolicy {
  const profile = options.profile ?? DEFAULT_BOT_PROFILE;
  const random: BotRandom = createBotRandom(options.seed ?? 0x5eed);
  const rejectedThisTurn = new Set<string>();
  const attemptedThisTurn = new Set<string>();

  /**
   * Tie-break jitter. Small enough never to reorder candidates that differ meaningfully,
   * large enough to stop the bot replaying the same line whenever scores are level.
   */
  const jitter = (): number => random.next() * 0.01;

  function bestCandidate(view: BotView): Candidate {
    const candidates = enumerateMainPhaseCandidates(view);
    const scored: { candidate: Candidate; score: number; lethal: boolean }[] = [];
    for (const candidate of candidates) {
      if (rejectedThisTurn.has(candidate.key)) continue;
      // An activated ability that stays offered after firing would otherwise loop.
      if (candidate.kind === "activateEffect" && attemptedThisTurn.has(candidate.key)) continue;
      const score = scoreCandidate(view, candidate, profile) + jitter();
      scored.push({ candidate, score, lethal: candidate.kind === "attackPlayer" && score >= profile.weights.lethal });
    }
    const best = selectScoredCandidate({
      candidates: scored,
      temperature: options.temperature ?? 0,
      topK: options.topK ?? 1,
      random: () => random.next(),
      passThreshold: profile.weights.actionThreshold,
    });
    if (best === undefined) {
      return { kind: "endPhase", key: "endPhase", intent: { type: "endPhase" }, cost: 0 };
    }
    return best;
  }

  return {
    name: `evaluation:${profile.name}`,

    onTurnStart(): void {
      rejectedThisTurn.clear();
      attemptedThisTurn.clear();
    },

    chooseBreedingAction(view: BotView): Intent {
      const breeding = view.breeding;
      if (breeding === undefined) {
        return view.eggDeckCount > 0 ? { type: "hatchEgg" } : { type: "endPhase" };
      }
      // A Lv.2 Digi-Egg is not a Digimon yet and cannot leave the raising area.
      if (breeding.level < 3) return { type: "endPhase" };
      const readyToDeploy = breeding.level >= profile.weights.deployLevel;
      // A Digimon that can still grow where nothing can attack it should stay put; one
      // that cannot has stopped earning its slot, so move it and free the slot for an egg.
      const canStillGrow =
        !breeding.cannotDigivolve &&
        view.hand.some(
          (card) =>
            isDigimonCard(card.definition) &&
            breeding.cardId !== undefined &&
            (digivolveCost(card.cardId, breeding.cardId, {
              inBreeding: true,
              controlledUnits: view.board,
            }) ?? Number.POSITIVE_INFINITY) <= view.maxAffordable,
        );
      if (readyToDeploy || !canStillGrow) {
        return { type: "moveFromBreeding", permanentId: breeding.permanentId };
      }
      return { type: "endPhase" };
    },

    chooseMainAction(view: BotView): Intent {
      const candidate = bestCandidate(view);
      attemptedThisTurn.add(candidate.key);
      return candidate.intent;
    },

    chooseBlockResponse(view: BotView, context: BlockContext): Intent {
      const attacker = view.opponentBoard.find((unit) => unit.permanentId === context.attackerPermanentId);
      const appraisal = appraiseBlock(view, attacker, context.eligibleBlockerIds, context.targetsPlayer, profile);
      if (context.mustBlock) {
        const blockerPermanentId =
          appraisal?.blockerPermanentId ??
          [...context.eligibleBlockerIds].sort((left, right) => {
            const first = view.board.find((unit) => unit.permanentId === left);
            const second = view.board.find((unit) => unit.permanentId === right);
            return (first === undefined ? 0 : bodyValue(first)) - (second === undefined ? 0 : bodyValue(second));
          })[0];
        return blockerPermanentId === undefined
          ? { type: "declineBlock" }
          : { type: "declareBlock", blockerPermanentId };
      }
      if (appraisal === undefined) return { type: "declineBlock" };
      return {
        type: "declareBlock",
        blockerPermanentId: appraisal.blockerPermanentId,
      };
    },

    chooseCounterResponse(view: BotView, context: CounterContext): Intent {
      const answer = chooseCounterAction({ view, context, profile });
      options.onDecisionAnswer?.({ kind: "counter", view, answer });
      return answer.intent;
    },

    chooseAllianceResponse(view: BotView, context: AllianceContext): Intent {
      const ally = selectAllianceAlly({
        view,
        attackerId: context.permanentId,
        eligibleAllyIds: context.eligibleAllyIds,
      });
      return ally === undefined
        ? { type: "respondAlliance" }
        : { type: "respondAlliance", allyPermanentId: ally.permanentId };
    },

    chooseEvadeResponse(view: BotView, permanentId: string): Intent {
      const answer = explainEvadeResponse({ view, permanentId, profile });
      options.onDecisionAnswer?.({
        kind: "evade",
        view,
        sourceCardId: view.board.find((unit) => unit.permanentId === permanentId)?.cardId,
        answer,
      });
      return answer.intent;
    },

    chooseBarrierResponse(view: BotView, permanentId: string): Intent {
      return {
        type: "respondBarrier",
        permanentId,
        accept: shouldPayBarrier(view, permanentId, profile),
      };
    },

    answerDecision(view: BotView | undefined, request: DecisionRequest): Intent {
      const answerRequest = (offered: DecisionRequest) =>
        explainDecisionAnswer({
          view,
          request: offered,
          profile,
          preferBeneficialSelections: options.preferBeneficialSelections,
          preferFreeOptionSelections: options.preferFreeOptionSelections,
        });
      const answer = answerRequest(request);
      options.onDecisionAnswer?.({ kind: request.kind, view, request, answer, answerRequest });
      return answer.intent;
    },

    noteRejected(intent: Intent): void {
      const key = candidateKeyOf(intent);
      if (key !== undefined) rejectedThisTurn.add(key);
    },
  };
}

/** Reconstruct the enumeration key for a rejected intent so it can be blocklisted. */
function candidateKeyOf(intent: Intent): string | undefined {
  switch (intent.type) {
    case "attack":
      return intent.target.kind === "player"
        ? `attackPlayer:${intent.attackerPermanentId}`
        : `attackDigimon:${intent.attackerPermanentId}:${intent.target.permanentId}`;
    case "digivolve":
      return `digivolve:${intent.instanceId}:${intent.permanentId}`;
    case "playCard":
      // The play kind is not recoverable from the intent, so all three spellings are
      // blocklisted; an instance only ever produces one of them anyway.
      return `play:${intent.instanceId}`;
    case "activateEffect":
      return `activate:${intent.sourceInstanceId}:${intent.effectKey}`;
    default:
      return undefined;
  }
}

export function answerDecisionWith(
  view: BotView | undefined,
  request: DecisionRequest,
  profile: BotProfile,
  preferBeneficialSelections = false,
  preferFreeOptionSelections = false,
): Intent {
  return explainDecisionAnswer({ view, request, profile, preferBeneficialSelections, preferFreeOptionSelections })
    .intent;
}
