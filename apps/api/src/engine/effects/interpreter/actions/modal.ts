import { getDecisionEffectSummary } from "#api/engine/effects/interpreter/getDecisionEffectSummary";
// Choosing between the options of a modal action.

import type { EffectContext } from "../../EffectContext.js";
import { createCardSource } from "../../../cards/CardSource.js";
import { runtimeCompiledCard } from "../compiledCards.js";
import { evaluateCondition } from "../conditions.js";
import { canPayCost } from "../costs.js";
import { describeAction } from "../describe.js";
import { runAction } from "../dispatch.js";
import { scaleFactor } from "../scaling.js";
import { candidatePermanents } from "../targeting/permanents.js";
import { DEFAULT_PLAY_ZONES, candidateLooseInstances } from "../targeting/loose.js";
import { canAttemptDigivolve } from "./digivolve.js";
import { canAttemptDnaDigivolve } from "./dna.js";
import {
  applyPlayCostCeiling,
  candidatesAllowedBySameNameRestriction,
  isEffectPlayProhibited,
  playableCandidates,
  playableTokenRefs,
} from "./play.js";
import { canAttemptPlaceUnder } from "./placeUnder.js";
import {
  printedModalBullets,
  printedModalPreamble,
  splitPrintedClauses,
  type Action,
  type CardInstance,
} from "@aegis/shared";

/** Read a prospective hand card's printed waiver without installing a color grant. */
function prospectiveColorWaiver(ctx: EffectContext, card: CardInstance): boolean {
  const source = createCardSource(card, {
    permanentOf: () => undefined,
    isOnBattleArea: () => false,
    isInHand: () => true,
    isSeatsTurn: (seat) => ctx.game.state.turnSeat === seat,
  });
  const cardCtx = { ...ctx, source };
  return (
    runtimeCompiledCard(card.cardId)?.effects.some((effect) => {
      if (effect.trigger !== "Static" && effect.trigger !== "Rule") return false;
      // Mirror colorWaiverStatic's supported shape; ordinary or mixed Static
      // bodies need their on-field guard and cannot grant a loose-card waiver.
      if (
        effect.actions.length === 0 ||
        !effect.actions.every(
          (action) =>
            action.kind === "WaiveColorRequirement" &&
            (action.target === undefined || action.target.isSelf === true || action.target.filter.isSelfRef === true),
        )
      )
        return false;
      if (effect.condition !== undefined && !evaluateCondition(cardCtx, effect.condition)) return false;
      return effect.actions.some(
        (action) =>
          action.kind === "WaiveColorRequirement" &&
          action.color === undefined &&
          (action.condition === undefined || evaluateCondition(cardCtx, action.condition)),
      );
    }) === true
  );
}

function ownTopSecurityHandPayment(
  action: Extract<Action, { kind: "Modal" }>,
  merged: Extract<Action, { kind: "PlayWithoutCost" }>,
): boolean {
  const cost = action.cost;
  const zones = merged.from ?? DEFAULT_PLAY_ZONES;
  return (
    cost?.kind === "securityToHand" &&
    (cost.controller === undefined || cost.controller === "mine") &&
    cost.position !== "bottom" &&
    !/\btop\s+or\s+bottom\b|\bbottom\s+or\s+top\b/i.test(cost.raw ?? "") &&
    zones.length === 1 &&
    zones[0] === "hand"
  );
}

/** A read-only requirement view; resolution receipts still belong to the real context. */
function withPrintedHandColorWaivers(ctx: EffectContext, onlyInstanceId?: string): EffectContext {
  const owner = ctx.source.ownerSeat;
  const game = {
    ...ctx.game,
    optionColorRequirementMet: (
      seat: typeof owner,
      instanceId: string,
      definition: Parameters<NonNullable<typeof ctx.game.optionColorRequirementMet>>[2],
    ) => {
      if (ctx.game.optionColorRequirementMet?.(seat, instanceId, definition) !== false) return true;
      if (seat !== owner || (onlyInstanceId !== undefined && instanceId !== onlyInstanceId)) return false;
      const card = ctx.game.player(owner).hand.find((candidate) => candidate.instanceId === instanceId);
      return card !== undefined && prospectiveColorWaiver(ctx, card);
    },
  };
  return new Proxy(ctx, {
    get: (target, key) => (key === "game" ? game : Reflect.get(target, key, target)),
  });
}

/**
 * Whether any option of a modal can currently be attempted. A modal whose every option is
 * un-attemptable is an unactivatable effect: its activation cost must not be charged for a
 * guaranteed no-op (BT17-050 Q2803).
 */
export function modalHasAvailableOption(ctx: EffectContext, action: Extract<Action, { kind: "Modal" }>): boolean {
  const merged = mergedPlayOrUseAction(action);
  if (merged !== undefined) {
    if (canAttemptModalAction(ctx, merged)) return true;
    const cost = action.cost;
    if (!ownTopSecurityHandPayment(action, merged) || cost === undefined || !canPayCost(ctx, cost)) return false;
    const owner = ctx.source.ownerSeat;
    const player = ctx.game.player(owner);
    const top = player.security[0];
    if (top === undefined) return false;
    // BT25-041's payment can supply the only playable card. Project just that
    // top card into hand for the existing guards; payment and selection still
    // run against authoritative state after the player accepts the effect.
    const projectedHand = [...player.hand, top];
    const projectedPlayer = new Proxy(player, {
      get(target, key, receiver) {
        return key === "hand" ? projectedHand : Reflect.get(target, key, receiver);
      },
    });
    const projectedCtx: EffectContext = {
      ...ctx,
      game: {
        ...ctx.game,
        player: (seat) => (seat === owner ? projectedPlayer : ctx.game.player(seat)),
      },
    };
    return canAttemptModalAction(withPrintedHandColorWaivers(projectedCtx, top.instanceId), merged);
  }
  return action.options.some((option, idx) => optionIsAvailable(ctx, action, option, idx));
}

const comparable = (value: unknown): string => JSON.stringify(value);

/** Collapse a compiler-style Play/Use split into the card selection the printed effect describes. */
export function mergedPlayOrUseAction(
  modal: Extract<Action, { kind: "Modal" }>,
): Extract<Action, { kind: "PlayWithoutCost" }> | undefined {
  if (
    modal.choose !== 1 ||
    modal.chooseScaling !== undefined ||
    modal.chooseAll !== undefined ||
    modal.optionConditions !== undefined ||
    modal.options.length !== 2 ||
    modal.options.some((option) => option.length !== 1)
  )
    return undefined;
  const nested = modal.options.flat();
  const play = nested.find(
    (entry): entry is Extract<Action, { kind: "PlayWithoutCost" }> => entry.kind === "PlayWithoutCost",
  );
  const use = nested.find(
    (entry): entry is Extract<Action, { kind: "UseOptionWithoutCost" }> => entry.kind === "UseOptionWithoutCost",
  );
  if (play === undefined || use === undefined) return undefined;
  const playFilter = play.target?.filter;
  const useFilter = use.filter ?? use.target?.filter;
  if (playFilter === undefined || useFilter === undefined) return undefined;
  const { kind: _playKinds, ...playFilterWithoutKind } = playFilter;
  const { kind: _useKinds, ...useFilterWithoutKind } = useFilter;
  if (playFilterWithoutKind.playCostLte === undefined && useFilterWithoutKind.playCostLte === 99) {
    useFilterWithoutKind.playCostLte = undefined;
  }
  if (comparable(playFilterWithoutKind) !== comparable(useFilterWithoutKind)) return undefined;
  for (const key of [
    "from",
    "payCost",
    "reduceCostBy",
    "reduceCostByScaling",
    "playCostCeiling",
    "optional",
    "cost",
    "condition",
  ] as const) {
    if (comparable(play[key]) !== comparable(use[key])) return undefined;
  }
  if (
    use.waiveColorRequirement === true ||
    use.selectionRequired === true ||
    use.reduceCostByOpponentMemory !== undefined
  )
    return undefined;
  return {
    ...play,
    chooseDualMode: true,
    optional: play.optional === true,
    target: {
      ...play.target,
      upTo: play.optional === true,
      minimum: 0,
      filter: { ...playFilter, kind: [...new Set([...(playFilter.kind ?? ["Digimon", "Tamer"]), "Option" as const])] },
    },
    raw: play.raw ?? use.raw,
  };
}

/**
 * Whether one modal bullet can be chosen. An EMPTY option list is a real "do nothing more" branch,
 * not an unavailable one: it is how a "you may [A] and [B]" payload whose cost has already been
 * paid offers the decline (BT17-050 Q2804). `[].some(...)` is false, so it has to be admitted
 * explicitly; every other option still needs at least one attemptable action.
 */
function optionIsAvailable(
  ctx: EffectContext,
  action: Extract<Action, { kind: "Modal" }>,
  option: readonly Action[],
  idx: number,
): boolean {
  const condition = action.optionConditions?.[idx];
  if (condition != null && !evaluateCondition(ctx, condition)) return false;
  if (action.allowNoOpOptions === true) return true;
  if (option.length === 0) return true;
  return option.some((nested) => canAttemptModalAction(ctx, nested));
}

function availableOptionIndices(ctx: EffectContext, action: Extract<Action, { kind: "Modal" }>): number[] {
  return action.options
    .map((option, idx) => ({ option, idx }))
    .filter(({ option, idx }) => optionIsAvailable(ctx, action, option, idx))
    .map(({ idx }) => idx);
}

function optionLabel(action: Extract<Action, { kind: "Modal" }>, idx: number): string {
  return (
    action.labels?.[idx] ??
    (action.options[idx]!.length > 0
      ? action.options[idx]!.map(describeAction).join(" · ")
      : describeAction({ kind: "RawUnparsed", text: `option ${idx}` }))
  );
}

/**
 * The printed bullet of each option, indexed like `action.options`, when exactly one clause of
 * the resolving text prints one bullet per option. Anything less certain returns undefined, and
 * the choice keeps the engine's labels rather than risk showing a bullet on the wrong option.
 */
export function modalOptionClauses(
  ctx: EffectContext,
  action: Extract<Action, { kind: "Modal" }>,
): readonly string[] | undefined {
  const text = ctx.activeEffectText;
  if (text === undefined) return undefined;
  const clauses = splitPrintedClauses(text);
  const candidates = (clauses.length > 0 ? clauses.map((clause) => clause.text) : [text])
    .map(printedModalBullets)
    .filter((bullets) => bullets.length === action.options.length);
  return candidates.length === 1 ? candidates[0] : undefined;
}

function withScaledModalHeader(ctx: EffectContext, action: Extract<Action, { kind: "Modal" }>): EffectContext {
  const text = ctx.activeEffectText;
  if (text === undefined) return ctx;
  const clauses = splitPrintedClauses(text);
  const bulleted = (clauses.length > 0 ? clauses.map((clause) => clause.text) : [text]).filter(
    (clause) => printedModalBullets(clause).length === action.options.length,
  );
  if (bulleted.length !== 1) return ctx;
  const header = printedModalPreamble(bulleted[0]!)
    .split(/(?<=\.)\s+/)
    .at(-1)
    ?.trim();
  return header ? { ...ctx, activeEffectTextPart: text, activeEffectTextEmphasis: header } : ctx;
}

function optionalByCostAction(option: readonly Action[]): Action | undefined {
  const first = option[0];
  if (first === undefined || !("cost" in first)) return undefined;
  const cost = first.cost;
  return typeof cost === "object" && cost !== null && cost.optional === true && /^by\b/i.test(cost.raw ?? "")
    ? first
    : undefined;
}

async function askModalOption(
  ctx: EffectContext,
  action: Extract<Action, { kind: "Modal" }>,
  indices: readonly number[],
  clauses: readonly string[] | undefined,
  askCtx: EffectContext = ctx,
  activation?: { index: number; total: number },
): Promise<number> {
  const labels = indices.map((idx) => optionLabel(action, idx));
  const pick = await ctx.ask.chooseOption(askCtx, labels, {
    choiceSummaries: indices.map((index) => getDecisionEffectSummary({ actions: action.options[index]! })),
    ...choiceClauses(clauses, indices),
    ...(activation === undefined ? {} : { activation }),
  });
  return indices[pick] ?? indices[0]!;
}

function choiceClauses(clauses: readonly string[] | undefined, optionIndices: readonly number[]) {
  return clauses === undefined ? undefined : { choiceClauses: optionIndices.map((idx) => clauses[idx]!) };
}

/**
 * Run one option. Its printed bullet is announced and stays the active text part while it
 * resolves, so the notice and any prompt it raises quote that bullet, not the whole clause.
 */
async function runOption(
  ctx: EffectContext,
  action: Extract<Action, { kind: "Modal" }>,
  idx: number,
  clauses: readonly string[] | undefined,
): Promise<void> {
  const paidAction = optionalByCostAction(action.options[idx]!);
  if (paidAction !== undefined) {
    ctx.costDeclinedAtSelection ??= new Set();
    ctx.costDeclinedAtSelection.add(paidAction);
  }
  const clause = clauses?.[idx];
  const outerTextPart = ctx.activeEffectTextPart;
  if (clause !== undefined) {
    ctx.fx.announceEffectOption?.(ctx, clause);
    ctx.activeEffectTextPart = clause;
  }
  try {
    for (const nestedAction of action.options[idx]!) {
      const abort = await runAction(ctx, nestedAction);
      if (abort) break;
    }
  } finally {
    ctx.activeEffectTextPart = outerTextPart;
  }
}

/** The engine's label for the decline entry of a combined optional-modal prompt. */
export const DECLINE_MODAL_CHOICE_LABEL = "Don't use";

/**
 * The options an optional "choose 1" modal offers in ONE prompt together with a decline entry,
 * instead of a "use this effect?" question followed by the option choice. Undefined when the
 * modal is not that shape or fewer than two options are available: a single available option
 * keeps the yes/no prompt, whose "yes" already names the only thing that can happen.
 */
export function declinableModalChoices(
  ctx: EffectContext,
  action: Extract<Action, { kind: "Modal" }>,
): { optionIndices: number[]; labels: string[]; choiceClauses?: string[] } | undefined {
  if (
    action.optional !== true ||
    action.choose !== 1 ||
    action.chooseScaling !== undefined ||
    // A cost or scaling resolves between the prompt and the options, and may change which
    // options are available; such a modal keeps the separate yes/no prompt.
    action.cost !== undefined ||
    (action.costOptions?.length ?? 0) > 0 ||
    (action.additionalCosts?.length ?? 0) > 0 ||
    action.additionalCost !== undefined ||
    action.scaling !== undefined ||
    (action.chooseAll !== undefined && evaluateCondition(ctx, action.chooseAll.condition)) ||
    mergedPlayOrUseAction(action) !== undefined
  )
    return undefined;
  const optionIndices = availableOptionIndices(ctx, action);
  if (optionIndices.length < 2) return undefined;
  return {
    optionIndices,
    labels: optionIndices.map((idx) => optionLabel(action, idx)),
    ...choiceClauses(modalOptionClauses(ctx, action), optionIndices),
  };
}

/** "Activate N of the effects below" — ask the controller which option(s), run them. */
export async function runModal(ctx: EffectContext, action: Extract<Action, { kind: "Modal" }>): Promise<boolean> {
  if (action.options.length === 0) return false;
  const preselected = ctx.preselectedModalOption;
  const clauses = modalOptionClauses(ctx, action);
  if (preselected?.action === action) {
    ctx.preselectedModalOption = undefined;
    await runOption(ctx, action, preselected.optionIndex, clauses);
    return false;
  }
  const merged = mergedPlayOrUseAction(action);
  if (merged !== undefined) {
    // The paid security card is now really in hand, but the continuous color
    // ledger may not have recomputed yet. Recheck its printed self waiver for
    // the real selection, without projecting cards into execution or granting colors.
    await runAction(ownTopSecurityHandPayment(action, merged) ? withPrintedHandColorWaivers(ctx) : ctx, merged);
    return false;
  }
  const availableIndices = availableOptionIndices(ctx, action);
  if (availableIndices.length === 0) return false;
  if (action.chooseAll !== undefined && evaluateCondition(ctx, action.chooseAll.condition)) {
    for (const idx of availableIndices) await runOption(ctx, action, idx, clauses);
    return false;
  }
  const rawChoose = action.chooseScaling !== undefined ? scaleFactor(ctx, action.chooseScaling) : action.choose;

  // "For every N, activate 1 of the effects below" snapshots N now, then chooses and resolves
  // one effect at a time. Unlike an ordinary "activate N of the effects" modal, each scaled
  // activation may choose the same bullet again (EX12-037 Q6795-Q6797). Re-evaluate which
  // bullets are executable after each resolution, but never recalculate the activation count.
  if (action.chooseScaling !== undefined) {
    const headerCtx = withScaledModalHeader(ctx, action);
    for (let i = 0; i < rawChoose; i += 1) {
      const currentAvailable = availableOptionIndices(ctx, action);
      if (currentAvailable.length === 0) break;
      const chosen = await askModalOption(ctx, action, currentAvailable, clauses, headerCtx, {
        index: i + 1,
        total: rawChoose,
      });
      await runOption(ctx, action, chosen, clauses);
    }
    return false;
  }

  const choose = Math.min(rawChoose, availableIndices.length);
  const chosenIndices: number[] = choose === 1 && availableIndices.length === 1 ? [availableIndices[0]!] : [];
  for (let i = 0; i < choose; i++) {
    if (chosenIndices.length >= choose) break;
    const remaining = availableIndices.filter((idx) => !chosenIndices.includes(idx));
    if (remaining.length === 0) break;
    chosenIndices.push(await askModalOption(ctx, action, remaining, clauses));
  }
  for (const idx of chosenIndices) await runOption(ctx, action, idx, clauses);
  return false;
}

/**
 * A Battle bullet needs a live attacker and at least one defender. Otherwise choosing it is a
 * silent no-op, e.g. after "this Digimon" left the battle area (Discord bug 1554922883652784198).
 * Unaffected Digimon stay eligible because the battle itself is rule processing (Q7469).
 */
function canAttemptBattle(ctx: EffectContext, action: Extract<Action, { kind: "Battle" }>): boolean {
  const attackerPresent =
    action.attacker.isSelf || action.attacker.filter.isSelfRef
      ? ctx.source.permanent() !== undefined
      : candidatePermanents(ctx, action.attacker, { includeUnaffectable: true }).length > 0;
  const defender = action.defender ?? action.target;
  return (
    attackerPresent &&
    defender !== undefined &&
    candidatePermanents(ctx, defender, { includeUnaffectable: true }).length > 0
  );
}

/** Synchronous availability for one nested modal action; no decisions or mutations. */
function canAttemptModalAction(ctx: EffectContext, action: Action): boolean {
  if (
    action.condition?.kind !== undefined &&
    action.condition.kind !== "raw" &&
    !evaluateCondition(ctx, action.condition)
  ) {
    return false;
  }
  if (action.cost !== undefined && typeof action.cost !== "number" && !canPayCost(ctx, action.cost)) return false;
  // A PlaceUnder is attemptable only when both an eligible card and a legal host exist.
  // Without this the modal is offered with no legal destination, the activation cost is
  // charged, and the placement silently no-ops (BT17-050 Q2803).
  if (action.kind === "PlaceUnder") return canAttemptPlaceUnder(ctx, action);
  // An effect that "can't play cards with the same names as any of your Digimon" cannot create
  // a token whose name is already on your field, so that bullet must not be offered as a
  // guaranteed no-op (BT23-013 / Q5224 + Q1033, issue #4894).
  if (action.kind === "PlayToken") {
    return playableTokenRefs(ctx, action.tokens ?? (action.token !== undefined ? [action.token] : [])).length > 0;
  }
  if (action.kind === "Digivolve") return canAttemptDigivolve(ctx, action);
  if (action.kind === "DnaDigivolve") return canAttemptDnaDigivolve(ctx, action);
  if (action.kind === "Battle") return canAttemptBattle(ctx, action);
  if (
    action.kind === "PlayWithoutCost" &&
    action.target !== undefined &&
    action.target.isSelf !== true &&
    action.target.filter.isSelfRef !== true &&
    action.fromOwnDigivolutionStack !== true
  ) {
    const zones = action.from && action.from.length > 0 ? action.from : DEFAULT_PLAY_ZONES;
    const target = applyPlayCostCeiling(ctx, action, action.target);
    const candidates = candidatesAllowedBySameNameRestriction(
      ctx,
      playableCandidates(ctx, target, candidateLooseInstances(ctx, target, zones), action.chooseDualMode),
    );
    return candidates.some((candidate) => !isEffectPlayProhibited(ctx, candidate));
  }
  return action.kind !== "RawUnparsed";
}
