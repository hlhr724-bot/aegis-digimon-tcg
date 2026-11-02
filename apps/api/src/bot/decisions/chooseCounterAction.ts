import { getCardDefinition } from "@aegis/shared/cards/registry";
import type { CounterChoice } from "@aegis/shared/protocol/CounterChoice";
import type { CounterContext } from "#api/bot/policy";
import type { BotProfile } from "#api/bot/profiles";
import type { BotView } from "#api/bot/view";
import { DecisionBasis } from "#api/bot/decisions/DecisionBasis";
import type { DecisionAnswer } from "#api/bot/decisions/DecisionAnswer";
import { getCardTieBreakValue } from "#api/bot/decisions/getCardTieBreakValue";
import { scoreDecisionSummary } from "#api/bot/decisions/scoreDecisionSummary";

type Params = { view: BotView; context: CounterContext; profile: BotProfile };

type ScoredCounter = { counter: CounterChoice; score: number; tieBreak: number; basis: DecisionBasis };

const BLAST_DIGIVOLVE_PREFIX = "blast-digivolve:";
const BLAST_DNA_PREFIX = "blast-dna-digivolve:";

function getBlastBasePermanentId(effectKey: string): string | undefined {
  if (effectKey.startsWith(BLAST_DIGIVOLVE_PREFIX)) {
    return effectKey.slice(BLAST_DIGIVOLVE_PREFIX.length);
  }
  if (!effectKey.startsWith(BLAST_DNA_PREFIX)) {
    return undefined;
  }
  const parsed: unknown = JSON.parse(effectKey.slice(BLAST_DNA_PREFIX.length));
  return Array.isArray(parsed) && typeof parsed[0] === "string" ? parsed[0] : undefined;
}

function scoreCounter({ view, profile }: Omit<Params, "context">, counter: CounterChoice): ScoredCounter {
  const source = view.hand.find((card) => card.instanceId === counter.instanceId);
  const unit = view.board.find((entry) => entry.topCardInstanceId === counter.instanceId);
  const cardId = source?.cardId ?? unit?.cardId ?? counter.sourceCardId;
  const definition = cardId === undefined ? undefined : getCardDefinition(cardId);
  const tieBreak = getCardTieBreakValue({ definition });
  let score = counter.summary === undefined ? 0 : scoreDecisionSummary({ summary: counter.summary, profile, view });
  let basis: DecisionBasis =
    counter.summary === undefined ? DecisionBasis.UNSCORED_OPTIONAL.value : DecisionBasis.SCORED.value;
  const basePermanentId = getBlastBasePermanentId(counter.effectKey);
  const base = view.board.find((entry) => entry.permanentId === basePermanentId);
  if (base !== undefined && definition !== undefined) {
    const handMaterialCost = counter.effectKey.startsWith(BLAST_DNA_PREFIX) ? profile.weights.digivolveDraw : 0;
    score +=
      ((definition.dp - base.dp) / 1000) * profile.weights.dpGain +
      ((definition.level ?? 0) - base.level) * profile.weights.levelGain +
      profile.weights.digivolveDraw -
      handMaterialCost;
    basis = DecisionBasis.SCORED.value;
  }
  if (score === 0 && counter.summary !== undefined && counter.summary.memoryCost.maximum === 0) {
    return { counter, score: profile.weights.activate, tieBreak, basis: DecisionBasis.FREE_EFFECT.value };
  }
  if (basis === DecisionBasis.UNSCORED_OPTIONAL.value) {
    return { counter, score: profile.weights.activate, tieBreak, basis };
  }
  return { counter, score, tieBreak, basis };
}

export function chooseCounterAction({ view, context, profile }: Params): DecisionAnswer {
  let best: ScoredCounter | undefined;
  for (const counter of context.eligibleCounters) {
    const scored = scoreCounter({ view, profile }, counter);
    if (scored.score <= 0) {
      continue;
    }
    if (
      best === undefined ||
      scored.score > best.score ||
      (scored.score === best.score && scored.tieBreak > best.tieBreak)
    ) {
      best = scored;
    }
  }
  if (best === undefined) {
    return { intent: { type: "respondCounter" }, basis: DecisionBasis.SCORED.value };
  }
  return {
    intent: { type: "respondCounter", sourceInstanceId: best.counter.instanceId, effectKey: best.counter.effectKey },
    basis: best.basis,
  };
}
