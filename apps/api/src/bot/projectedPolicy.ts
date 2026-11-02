import { projectMainActionCandidate } from "#api/bot/projectMainActionCandidate";
import { selectScoredCandidate } from "#api/bot/levels/selectScoredCandidate";
import type { Seat } from "@aegis/shared/schema/enums";
import type { GameEngine } from "../engine/GameEngine.js";
import type { Candidate } from "./candidates.js";
import { bodyValue, scoreCandidate } from "./evaluate.js";
import { createEvaluationPolicy, type BotPolicy, type EvaluationPolicyOptions } from "./policy.js";
import type { BotOptions } from "./BotPlayer.js";
import { DEFAULT_BOT_PROFILE, resolveBotProfile } from "./profiles.js";
import { createBotRandom } from "./rng.js";
import { mainActionReady, mainActions, type TrainingAction } from "./training/actions.js";
import type { BotView } from "./view.js";

/** Default live policy; explicit trained or scenario policies keep their own driver options. */
export function projectedBotOptions(input: { engine: GameEngine; seat: Seat; options?: BotOptions }): BotOptions {
  if (input.options?.policy !== undefined) return input.options;
  return {
    ...input.options,
    policy: createProjectedEvaluationPolicy({
      engine: input.engine,
      seat: input.seat,
      profile: resolveBotProfile(input.options?.profile),
      seed: input.options?.seed,
    }),
    canChooseMainAction: input.options?.canChooseMainAction ?? (() => mainActionReady(input.engine)),
  };
}

export interface ProjectedScoreContext {
  view: BotView;
  candidate: Candidate;
  action: TrainingAction;
  score: number;
}

/** Evaluate authoritative legal declarations and their live costs using public observations. */
export function createProjectedEvaluationPolicy(
  input: {
    engine: GameEngine;
    seat: Seat;
    adjustMainScore?: (context: ProjectedScoreContext) => number;
    onMainChoice?: (candidate: Candidate | undefined) => void;
  } & EvaluationPolicyOptions,
): BotPolicy {
  const profile = input.profile ?? DEFAULT_BOT_PROFILE;
  const base = createEvaluationPolicy(input);
  const random = createBotRandom(input.seed ?? 0x5eed);
  const rejected = new Set<string>();
  const activated = new Set<string>();
  return {
    ...base,
    name: `projected:${profile.name}`,
    onTurnStart() {
      base.onTurnStart();
      rejected.clear();
      activated.clear();
    },
    chooseMainAction(view) {
      const scored: { candidate: Candidate; score: number; lethal: boolean }[] = [];
      for (const action of mainActions(input.engine, input.seat, {
        includeSpecialActions: true,
        digiXrosValidationBudget: 256,
      })) {
        const candidate = projectMainActionCandidate({ view, action });
        if (!candidate || candidate.cost > view.maxAffordable || rejected.has(candidate.key)) continue;
        if (candidate.kind === "activateEffect" && activated.has(candidate.key)) continue;
        const materials =
          action.materialIds ??
          (action.intent.type === "playCard" ? action.intent.assembly?.materialInstanceIds : undefined) ??
          [];
        const materialCost = materials.reduce((sum, id) => {
          const body = view.board.find((unit) => unit.permanentId === id || unit.topCardInstanceId === id);
          return sum + (body ? bodyValue(body) * 0.7 : view.hand.some((card) => card.instanceId === id) ? 1 : 0.25);
        }, 0);
        const baselineScore = scoreCandidate(view, candidate, profile) - materialCost;
        const adjustment = input.adjustMainScore?.({ view, candidate, action, score: baselineScore }) ?? 0;
        if (!Number.isFinite(adjustment)) throw new Error("Non-finite projected policy adjustment");
        const score = baselineScore + adjustment + random.next() * 0.01;
        scored.push({
          candidate,
          score,
          lethal: candidate.kind === "attackPlayer" && baselineScore >= profile.weights.lethal,
        });
      }
      const best = selectScoredCandidate({
        candidates: scored,
        temperature: input.temperature ?? 0,
        topK: input.topK ?? 1,
        random: () => random.next(),
        passThreshold: profile.weights.actionThreshold,
      });
      if (best === undefined) {
        input.onMainChoice?.(undefined);
        return { type: "endPhase" };
      }
      input.onMainChoice?.(best);
      if (best.kind === "activateEffect") activated.add(best.key);
      return best.intent;
    },
    noteRejected(intent) {
      rejected.add(JSON.stringify(intent));
      base.noteRejected(intent);
    },
  };
}
