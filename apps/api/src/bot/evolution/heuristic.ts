import { getHeuristicTieBreaker } from "#api/bot/evolution/getHeuristicTieBreaker";
import { getOptionalCostFeatures } from "#api/bot/evolution/getOptionalCostFeatures";
import { getDecisionFeatures } from "#api/bot/evolution/getDecisionFeatures";
import { CardKind, getCardDefinition } from "@aegis/shared";
import { createBotRandom } from "../rng.js";
import type { createHeuristicFeatureContext } from "#api/bot/evolution/createHeuristicFeatureContext";
import type { TrainingWindow } from "../training/policy.js";
import type { TrainingObservation } from "#api/bot/training/observation";
import { matchesHeuristicCondition } from "#api/bot/evolution/matchesHeuristicCondition";

/** GEPA evolves data, never executable code. Guides come from these same rules. */
export const FEATURES = [
  "bias",
  "baselineScore",
  "securityChecks",
  "readyAttackers",
  "ownHandCount",
  "opponentHandCount",
  "turn",
  "ownTrashCount",
  "opponentTrashCount",
  "cost",
  "handover",
  "attackPlayer",
  "lethal",
  "attackWinningBattle",
  "attackLosingBattle",
  "digivolve",
  "breedingGrowth",
  "levelGain",
  "dpGain",
  "playBody",
  "playTamer",
  "playOption",
  "opponentBodies",
  "hatch",
  "deploy",
  "sourceLevel",
  "sourceDp",
  "targetDp",
  "ownSecurity",
  "opponentSecurity",
  "block",
  "criticalBlock",
  "accept",
  "finish",
  "pass",
  "openingRookie",
  "activate",
  "sourceInHand",
  "sourceInTrash",
  "sourceOnBoard",
  "sourceOpponent",
  "sourceValue",
  "digiXros",
  "assembly",
  "dnaDigivolve",
  "appFusion",
  "link",
  "materials",
  "costUncertain",
  "freeActivation",
  "selectionGain",
  "selectionLoss",
  "selectionRookie",
  "selectionDuplicate",
  "selectionNoop",
  "decisionMemory",
  "decisionDraw",
  "decisionRecovery",
  "decisionRemoval",
  "decisionPlay",
  "decisionEvolution",
  "decisionUnsuspend",
  "decisionCost",
  "decisionUncertain",
  "paymentDraw",
  "paymentMemory",
  "paymentRecovery",
  "paymentCard",
  "paymentValue",
  "paymentStarter",
  "paymentDuplicate",
] as const;
export type Feature = (typeof FEATURES)[number];
export interface HeuristicRule {
  feature: Feature;
  weight: number;
  advice: string;
  when?: {
    kind?: string;
    sourceCardIds?: string[];
    ownBoard?: { cardIds: string[]; suspended?: boolean; minimum?: number; maximum?: number };
    ownHand?: { cardIds: string[]; minimum?: number; maximum?: number };
    minimum?: Partial<Record<Feature, number>>;
    maximum?: Partial<Record<Feature, number>>;
  };
}
export interface HeuristicProgram {
  schemaVersion: 1;
  basePolicy?: "projected-balanced";
  breedingDeployLevel?: number;
  preferBeneficialSelections?: boolean;
  preferFreeOptionSelections?: boolean;
  title: string;
  rules: HeuristicRule[];
}

export function parseHeuristic(value: unknown): HeuristicProgram {
  if (typeof value !== "object" || value === null) throw new Error("Expected heuristic object");
  const program = value as HeuristicProgram;
  if (
    program.preferFreeOptionSelections !== undefined &&
    (program.basePolicy !== "projected-balanced" || typeof program.preferFreeOptionSelections !== "boolean")
  ) {
    throw new Error("Invalid free Option selection preference");
  }
  if (program.basePolicy !== undefined && program.basePolicy !== "projected-balanced")
    throw new Error("Unknown heuristic base policy");
  if (
    program.preferBeneficialSelections !== undefined &&
    (program.basePolicy !== "projected-balanced" || typeof program.preferBeneficialSelections !== "boolean")
  ) {
    throw new Error("Invalid beneficial selection preference");
  }
  if (
    program.breedingDeployLevel !== undefined &&
    (program.basePolicy !== "projected-balanced" ||
      !Number.isSafeInteger(program.breedingDeployLevel) ||
      program.breedingDeployLevel < 3 ||
      program.breedingDeployLevel > 7)
  ) {
    throw new Error("Invalid breeding deployment level");
  }
  if (
    program.schemaVersion !== 1 ||
    typeof program.title !== "string" ||
    !program.title.trim() ||
    program.title.length > 120
  )
    throw new Error("Invalid heuristic version or title");
  if (!Array.isArray(program.rules) || program.rules.length === 0 || program.rules.length > 100)
    throw new Error("Expected 1–100 heuristic rules");
  for (const rule of program.rules) {
    if (
      typeof rule !== "object" ||
      rule === null ||
      !FEATURES.includes(rule.feature) ||
      !Number.isFinite(rule.weight) ||
      Math.abs(rule.weight) > 10000 ||
      typeof rule.advice !== "string" ||
      !rule.advice.trim() ||
      rule.advice.length > 600
    )
      throw new Error("Invalid heuristic rule");
    if (rule.when !== undefined) {
      if (
        typeof rule.when !== "object" ||
        rule.when === null ||
        Array.isArray(rule.when) ||
        Object.keys(rule.when).some(
          (key) => !["kind", "sourceCardIds", "minimum", "maximum", "ownBoard", "ownHand"].includes(key),
        ) ||
        (rule.when.kind !== undefined && (typeof rule.when.kind !== "string" || rule.when.kind.length > 80)) ||
        (rule.when.sourceCardIds !== undefined &&
          (!Array.isArray(rule.when.sourceCardIds) ||
            rule.when.sourceCardIds.length > 100 ||
            !rule.when.sourceCardIds.every((id) => typeof id === "string" && getCardDefinition(id) !== undefined)))
      )
        throw new Error("Invalid heuristic condition");
      for (const [zone, predicate] of [
        ["ownBoard", rule.when.ownBoard],
        ["ownHand", rule.when.ownHand],
      ] as const) {
        if (predicate === undefined) continue;
        const allowed =
          zone === "ownBoard" ? ["cardIds", "suspended", "minimum", "maximum"] : ["cardIds", "minimum", "maximum"];
        if (
          typeof predicate !== "object" ||
          predicate === null ||
          Array.isArray(predicate) ||
          Object.keys(predicate).some((key) => !allowed.includes(key)) ||
          !Array.isArray(predicate.cardIds) ||
          predicate.cardIds.length === 0 ||
          predicate.cardIds.length > 100 ||
          !predicate.cardIds.every((id) => typeof id === "string" && getCardDefinition(id) !== undefined) ||
          ("suspended" in predicate && typeof predicate.suspended !== "boolean") ||
          (predicate.minimum === undefined && predicate.maximum === undefined) ||
          [predicate.minimum, predicate.maximum].some(
            (bound) => bound !== undefined && (!Number.isInteger(bound) || bound < 0 || bound > 100),
          ) ||
          (predicate.minimum !== undefined && predicate.maximum !== undefined && predicate.minimum > predicate.maximum)
        )
          throw new Error("Invalid heuristic owned-card predicate");
      }
      for (const bounds of [rule.when.minimum, rule.when.maximum]) {
        if (bounds === undefined) continue;
        if (
          typeof bounds !== "object" ||
          bounds === null ||
          Array.isArray(bounds) ||
          Object.entries(bounds).some(
            ([feature, limit]) => !FEATURES.includes(feature as Feature) || !Number.isFinite(limit),
          )
        )
          throw new Error("Invalid heuristic feature bound");
      }
    }
  }
  return {
    schemaVersion: 1,
    ...(program.basePolicy === undefined ? {} : { basePolicy: program.basePolicy }),
    ...(program.breedingDeployLevel === undefined ? {} : { breedingDeployLevel: program.breedingDeployLevel }),
    ...(program.preferBeneficialSelections === undefined
      ? {}
      : { preferBeneficialSelections: program.preferBeneficialSelections }),
    ...(program.preferFreeOptionSelections === undefined
      ? {}
      : { preferFreeOptionSelections: program.preferFreeOptionSelections }),
    title: program.title,
    rules: program.rules.map((rule) => ({ ...rule })),
  };
}

export function actionFeatures(
  window: TrainingWindow,
  index: number,
  context?: ReturnType<typeof createHeuristicFeatureContext>,
): Record<Feature, number> {
  const action = window.actions[index];
  if (action === undefined) throw new Error("Action is outside legal choices");
  const features =
    context === undefined
      ? (Object.fromEntries(FEATURES.map((key) => [key, 0])) as Record<Feature, number>)
      : { ...context.zeroFeatures };
  const own = context?.own ?? window.observation.players.find((player) => player.seat === window.observation.seat)!;
  const enemy = context?.enemy ?? window.observation.players.find((player) => player.seat !== window.observation.seat)!;
  const ownUnits =
    context === undefined ? [...own.board, ...(own.breeding === undefined ? [] : [own.breeding])] : undefined;
  const units = context === undefined ? [...ownUnits!, ...enemy.board] : undefined;
  const source =
    context === undefined
      ? units!.find((unit) => unit.permanentId === action.sourceId || unit.top.instanceId === action.sourceId)
      : context.sources.get(action.sourceId);
  const target =
    context === undefined
      ? units!.find((unit) => unit.permanentId === action.targetId)
      : context.targets.get(action.targetId);
  const card =
    context === undefined
      ? [...visibleCards(window), ...window.observation.revealed].find((entry) => entry.instanceId === action.sourceId)
      : context.cards.get(action.sourceId);
  features.bias = 1;
  features.ownHandCount = own.handCount;
  features.opponentHandCount = enemy.handCount;
  features.turn = window.observation.turn;
  features.ownTrashCount = own.trash.length;
  features.opponentTrashCount = enemy.trash.length;
  features.cost =
    action.projectedCost ?? action.activationMemoryCost?.maximum ?? action.activationMemoryCost?.minimum ?? 0;
  features.costUncertain = Number(
    action.intent.type === "activateEffect" &&
      (action.activationMemoryCost === undefined ||
        action.activationMemoryCost.maximum === null ||
        action.activationMemoryCost.maximum !== action.activationMemoryCost.minimum),
  );
  features.freeActivation = Number(
    action.intent.type === "activateEffect" && action.activationMemoryCost?.maximum === 0,
  );
  features.handover = Math.max(0, features.cost - window.observation.memory);
  features.sourceLevel = source?.top.level ?? card?.level ?? 0;
  features.sourceDp = (source?.dp ?? card?.dp ?? 0) / 1000;
  features.sourceInHand = Number(
    context === undefined
      ? own.hand.some((entry) => entry.instanceId === action.sourceId)
      : context.ownHand.has(action.sourceId),
  );
  features.sourceInTrash = Number(
    context === undefined
      ? window.observation.players.some((player) => player.trash.some((entry) => entry.instanceId === action.sourceId))
      : context.trash.has(action.sourceId),
  );
  features.sourceOnBoard = Number(source !== undefined && !source.inBreeding);
  features.sourceOpponent = Number(
    context === undefined
      ? enemy.board.some((unit) => unit.permanentId === action.sourceId || unit.top.instanceId === action.sourceId) ||
          enemy.trash.some((entry) => entry.instanceId === action.sourceId)
      : context.enemySources.has(action.sourceId),
  );
  features.sourceValue = features.sourceDp + features.sourceLevel + (card?.playCost ?? source?.top.playCost ?? 0) / 10;
  features.targetDp = (target?.dp ?? 0) / 1000;
  features.ownSecurity = own.securityCount;
  features.opponentSecurity = enemy.securityCount;
  features.opponentBodies = enemy.board.length;
  const intent = action.intent;
  if (intent.type === "attack") {
    features.attackPlayer = Number(intent.target.kind === "player");
    // This expresses an opportunity, not certainty: blockers/counters can stop it.
    features.lethal = Number(intent.target.kind === "player" && enemy.securityCount === 0);
    features.attackWinningBattle = Number(
      intent.target.kind === "permanent" && source !== undefined && target !== undefined && source.dp > target.dp,
    );
    features.attackLosingBattle = Number(
      intent.target.kind === "permanent" && source !== undefined && target !== undefined && source.dp <= target.dp,
    );
  }
  if (intent.type === "digivolve") {
    features.digivolve = 1;
    features.breedingGrowth = Number(target?.inBreeding === true);
    features.levelGain = (card?.level ?? 0) - (target?.top.level ?? 0);
    features.dpGain = ((card?.dp ?? 0) - (target?.dp ?? 0)) / 1000;
  }
  if (intent.type === "playCard") {
    features.playBody = Number(card?.kinds?.includes(CardKind.Digimon) === true) * features.sourceDp;
    features.playTamer = Number(card?.kinds?.includes(CardKind.Tamer) === true);
    features.playOption = Number(card?.kinds?.includes(CardKind.Option) === true);
  }
  features.hatch = Number(intent.type === "hatchEgg");
  features.deploy = Number(intent.type === "moveFromBreeding");
  features.pass = Number(intent.type === "endPhase");
  features.activate = Number(intent.type === "activateEffect");
  features.digiXros = Number(intent.type === "playCard" && intent.digiXros !== undefined);
  features.assembly = Number(intent.type === "playCard" && intent.assembly !== undefined);
  features.dnaDigivolve = Number(intent.type === "dnaDigivolve");
  features.appFusion = Number(intent.type === "appFusion");
  features.link = Number(intent.type === "linkCard");
  features.materials =
    action.materialIds?.length ??
    (intent.type === "playCard" ? intent.assembly?.materialInstanceIds.length : undefined) ??
    0;
  features.block = Number(intent.type === "declareBlock");
  features.criticalBlock = Number(
    intent.type === "declareBlock" && window.combat?.targetsPlayer === true && own.securityCount === 0,
  );
  features.finish = Number(action.label === "Finish selection" || action.label === "Finish Assembly");
  if (intent.type === "respondEvade" || intent.type === "respondBarrier") features.accept = Number(intent.accept);
  if (intent.type === "respondDecision" && intent.response.kind === "optional")
    features.accept = Number(intent.response.accept);
  if (intent.type === "mulligan")
    features.openingRookie = Number(intent.keep) * (own.hand.some((entry) => entry.level === 3) ? 1 : -1);
  Object.assign(
    features,
    getDecisionFeatures({ window, index, card, unit: source, sourceValue: features.sourceValue, own, enemy }),
  );
  Object.assign(features, getOptionalCostFeatures({ window, index, sourceValue: features.sourceValue, own }));
  return features;
}

function visibleCards(window: TrainingWindow) {
  return window.observation.players.flatMap((player) => [
    ...player.hand,
    ...player.trash,
    ...player.delay,
    ...player.faceUpSecurity,
    ...[...player.board, ...(player.breeding === undefined ? [] : [player.breeding])].flatMap((unit) => [
      unit.top,
      ...unit.stack,
      ...unit.linked,
    ]),
  ]);
}

export function actionCardId(
  window: TrainingWindow,
  index: number,
  context?: ReturnType<typeof createHeuristicFeatureContext>,
): string | undefined {
  const action = window.actions[index]!;
  if (context !== undefined)
    return context.cards.get(action.sourceId)?.cardId ?? context.permanentCards.get(action.sourceId);
  return (
    [...visibleCards(window), ...window.observation.revealed].find((card) => card.instanceId === action.sourceId)
      ?.cardId ??
    window.observation.players
      .flatMap((player) => [...player.board, ...(player.breeding === undefined ? [] : [player.breeding])])
      .find((unit) => unit.permanentId === action.sourceId)?.top.cardId
  );
}

export function scoreHeuristicRules(
  program: HeuristicProgram,
  features: Record<Feature, number>,
  kind: string,
  sourceCardId?: string,
  observation?: TrainingObservation,
) {
  const contributions = program.rules.map((rule) => {
    const condition = rule.when;
    const matches = matchesHeuristicCondition({ condition, features, kind, sourceCardId, observation });
    return { ...rule, value: matches ? features[rule.feature] * rule.weight : 0 };
  });
  return { score: contributions.reduce((total, rule) => total + rule.value, 0), contributions };
}

export function rankHeuristic(program: HeuristicProgram, window: TrainingWindow) {
  return window.actions
    .map((_, index) => {
      const features = actionFeatures(window, index);
      return {
        index,
        secondaryScore: getHeuristicTieBreaker({ window, features }),
        ...scoreHeuristicRules(program, features, window.kind, actionCardId(window, index), window.observation),
      };
    })
    .sort(
      (left, right) =>
        right.score - left.score || right.secondaryScore - left.secondaryScore || left.index - right.index,
    );
}

/** Derive randomness from public information so prefix replay needs no private RNG snapshot. */
export function chooseHeuristic(program: HeuristicProgram, window: TrainingWindow, seed = 0): number {
  const ranked = rankHeuristic(program, window);
  const best = ranked[0];
  if (best === undefined) throw new Error("No legal heuristic action");
  const tied = ranked.filter((entry) => entry.score === best.score && entry.secondaryScore === best.secondaryScore);
  if (tied.length === 1) return best.index;
  let publicSeed = seed >>> 0;
  for (const character of JSON.stringify(window))
    publicSeed = Math.imul(publicSeed ^ character.charCodeAt(0), 16777619) >>> 0;
  return tied[Math.floor(createBotRandom(publicSeed).next() * tied.length)]!.index;
}

export const SEED_HEURISTIC: HeuristicProgram = {
  schemaVersion: 1,
  title: "Build safely, spend carefully, finish decisively",
  rules: [
    { feature: "cost", weight: -0.6, advice: "Prefer efficient actions when their outcomes are similar." },
    { feature: "handover", weight: -1.8, advice: "Giving the opponent more memory needs a strong payoff." },
    { feature: "attackPlayer", weight: 4, advice: "Use available attacks to pressure security." },
    {
      feature: "lethal",
      weight: 100,
      advice: "At zero opposing security, look for an attack that can end the game; check blockers and counters first.",
    },
    {
      feature: "attackWinningBattle",
      weight: 5,
      advice: "Attack vulnerable opposing Digimon when your attacker can survive.",
    },
    {
      feature: "attackLosingBattle",
      weight: -8,
      advice: "Avoid battles that sacrifice your attacker without a clear benefit.",
    },
    { feature: "digivolve", weight: 2, advice: "Digivolution develops your line and draws a card." },
    { feature: "breedingGrowth", weight: 2, advice: "Grow a line in breeding while it is protected." },
    { feature: "levelGain", weight: 1.5, advice: "Advance your evolution line toward higher levels." },
    { feature: "dpGain", weight: 0.4, advice: "Value evolution that improves battle strength." },
    { feature: "playBody", weight: 0.6, advice: "Build a board when the memory cost is reasonable." },
    { feature: "playTamer", weight: 2, advice: "Establish Tamers when you can afford the tempo investment." },
    { feature: "hatch", weight: 10, advice: "Hatch when the breeding area is empty." },
    { feature: "deploy", weight: 2, advice: "Move a developed line out to contest the board." },
    { feature: "criticalBlock", weight: 100, advice: "At zero security, prioritize blocking an attack on the player." },
    {
      feature: "accept",
      weight: 1,
      advice: "Consider optional effects and defensive responses when their costs are acceptable.",
    },
    {
      feature: "finish",
      weight: 0.1,
      advice: "Finish optional selections when additional cards do not improve the outcome.",
    },
    { feature: "openingRookie", weight: 5, advice: "Keep an opening hand with a rookie that can start your line." },
  ],
};
