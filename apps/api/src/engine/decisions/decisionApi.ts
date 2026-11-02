import { OptionalActivationCancelled } from "#api/engine/effects/OptionalActivationCancelled";
import type { Seat } from "@aegis/shared/schema/enums";
import type { DecisionApi, EffectContext, SeatScopedDecisionApi } from "../effects/EffectContext.js";
import type { ChooseOptionExtras } from "../effects/context/decisions.js";
import type { DecisionManager } from "./index.js";
import { getEffectDecisionText } from "#api/engine/decisions/getEffectDecisionText";
import { DecisionSelectionGoal } from "@aegis/shared/protocol/DecisionSelectionGoal";

/**
 * Concrete {@link DecisionApi} (`ctx.ask.*`) backed by the {@link DecisionManager}
 * (subsystem: intent-protocol-and-room).
 *
 * The interface (`optional` / `chooseTargets` / `selectCards` / `chooseOption`)
 * lives in the effect-framework contract (EffectContext.ts) because card modules
 * are written against it (card-module contract). This file is the runtime
 * binding that turns each call into a DecisionRequest on the deciding seat and
 * awaits the matching respondDecision — the direct port of the source per-decision
 * coroutine waits (documented behavior `SelectOptional`, documented behavior's
 * select-which-effect prompt), minus all presentation UI.
 *
 * `ctx.ask.*` addresses the effect's controller (`ctx.source.ownerSeat`): the
 * documented rules prompts `cardEffect.EffectSourceCard.Owner` (documented behavior
 * 60), i.e. the source card's owner. `ctx.ask.opponent.*` addresses the other seat
 * (`ctx.game.opponentOf(ctx.source.ownerSeat)`) — for printed text that explicitly
 * assigns the choice to "your opponent" (e.g. "your opponent trashes 1 card in
 * their hand"). Both facades share one implementation (`buildSeatScopedApi`)
 * parameterized only by which seat each call resolves to; there is no flag that
 * defaults to the controller, so a card that needs the opponent's choice cannot
 * accidentally fall back to the controller's.
 *
 * Routing safety: `DecisionManager.request` mirrors the seat into
 * `state.pendingDecision` and the room (`AegisRoom.requestDecision`) unicasts the
 * `DecisionRequest` only to the client mapped to that seat — the other seat's
 * client never receives it. `DecisionManager.respond` re-checks the responding
 * seat against the open decision's seat (not the caller-supplied one) before
 * resolving, so only the addressed seat's `respondDecision` intent can answer —
 * a client cannot answer on the other seat's behalf even by guessing the
 * decisionId. Candidates for an opponent-addressed `selectCards` (e.g. "trash 1
 * card in their hand") are drawn from that seat's OWN hand, so the seat asked to
 * choose already holds the information the choice requires — nothing hidden from
 * seat A is disclosed to seat A, because seat A is never sent the request.
 *
 * Note on scope: the FULL ordered, interruptible resolution loop (collect ->
 * order turn-player-first -> prompt optional -> resolve one-at-a-time -> rescan)
 * is the effect-stack-resolution subsystem (stack.ts). This adapter provides only
 * the decision round-trip those steps (and `activateEffect`) need; it does not
 * order or sequence multiple effects.
 */
export function createDecisionApi(
  manager: DecisionManager,
  playCostReductionBlocked?: (seat: Seat) => boolean,
): DecisionApi {
  const controller = buildSeatScopedApi(manager, (ctx) => ctx.source.ownerSeat, {
    playCostReductionBlocked,
    honorsPresets: true,
    asksController: true,
  });
  const opponent = buildSeatScopedApi(manager, (ctx) => ctx.game.opponentOf(ctx.source.ownerSeat), {
    playCostReductionBlocked,
    honorsPresets: false,
    asksController: false,
  });
  return { ...controller, opponent };
}

/**
 * `ctx.ask.opponent` is typed optional (see the `DecisionApi.opponent` doc comment)
 * so pre-existing test fixtures do not all need updating. Card code must go through
 * this accessor rather than `ctx.ask.opponent` directly: it throws immediately if
 * the facade is missing, so a fixture that omits it fails loudly the first time an
 * opponent-addressed decision actually runs, instead of resolving `undefined?.foo()`
 * to `undefined` and letting the card silently treat that as an empty selection.
 */
export function requireOpponentAsk(ctx: EffectContext): SeatScopedDecisionApi {
  const opponent = ctx.ask.opponent;
  if (opponent === undefined) {
    throw new Error(
      "ctx.ask.opponent is not wired for this EffectContext — an opponent-addressed " +
        "decision (ctx.ask.opponent.*) was called from a test/context fixture built " +
        "without one. Real game contexts always have it (createDecisionApi).",
    );
  }
  return opponent;
}

/**
 * Builds one facade of the decision API. `resolveSeat` is the ONLY thing that
 * differs between `ctx.ask.*` and `ctx.ask.opponent.*` — every request-shaping,
 * response-unwrapping, and clamping rule below is shared.
 */
function buildSeatScopedApi(
  manager: DecisionManager,
  resolveSeat: (ctx: EffectContext) => Seat,
  {
    honorsPresets,
    asksController,
    playCostReductionBlocked,
  }: {
    honorsPresets: boolean;
    asksController: boolean;
    playCostReductionBlocked?: (seat: Seat) => boolean;
  },
): SeatScopedDecisionApi {
  const provenance = (ctx: EffectContext) => {
    return {
      ...((ctx.payingCostDepth ?? 0) > 0 && ctx.activeSingleHandCostBenefit !== undefined
        ? { singleHandCostBenefit: ctx.activeSingleHandCostBenefit }
        : {}),
      ...(ctx.activeDecisionSummary === undefined
        ? {}
        : { effectSummary: ctx.activeDecisionSummary, effectControllerSeat: ctx.source.ownerSeat }),
      ...(ctx.activeDecisionSelectionGoal === undefined ? {} : { selectionGoal: ctx.activeDecisionSelectionGoal }),
      timing: ctx.activeTiming,
      ...(ctx.activeEffectIsInherited === true ? { isInherited: true } : {}),
      ...getEffectDecisionText(ctx),
      ...(ctx.activeEffectTextCardId !== undefined ? { effectTextCardId: ctx.activeEffectTextCardId } : {}),
      ...(ctx.activeEffectKey !== undefined ? { effectKey: ctx.activeEffectKey } : {}),
      ...(ctx.activeSelectionContext !== undefined ? { selectionContext: ctx.activeSelectionContext } : {}),
      ...(ctx.affectedPermanentIds !== undefined ? { affectedPermanentIds: [...ctx.affectedPermanentIds] } : {}),
      // Raised by `payCost` for as long as a cost payment is on the stack. Without it a
      // cost selection and a target selection reach the deciding seat as the same request.
      ...((ctx.payingCostDepth ?? 0) > 0 ? { purpose: "cost" as const } : {}),
      ...(ctx.selectingOptionalTarget === true && asksController ? { purpose: "optionalTarget" as const } : {}),
    };
  };
  // Only a pick whose floor was lowered here is the back-out of an accepted "you may"; a pick
  // the action already allowed to be empty keeps its own meaning (DigiXros materials).
  const backOutPurpose = (min: number, printedMin: number) =>
    min < printedMin ? { purpose: "acceptedOptional" as const } : {};
  // The controller already accepted this action's "you may"; a single-card pick may still
  // answer nothing to back out. Cost payments keep their printed minimum.
  const backsOutOfAcceptedOptional = (ctx: EffectContext): boolean =>
    asksController && ctx.pickingAcceptedOptional === true && (ctx.payingCostDepth ?? 0) === 0;
  const pickMinimum = (ctx: EffectContext, min: number, max: number): number =>
    min === 1 && max === 1 && backsOutOfAcceptedOptional(ctx) ? 0 : min;
  const presetAnswer = (ctx: EffectContext): boolean | undefined =>
    honorsPresets ? ctx.presetOptionalAnswer : undefined;
  // A "No" preset declines every optional part of the effect, and a selection whose floor is
  // zero is how a "you may" choice over cards is asked. A "Yes" preset still asks which cards.
  const declinedByPreset = (ctx: EffectContext, min: number): boolean => presetAnswer(ctx) === false && min === 0;
  return {
    async optional(ctx: EffectContext, prompt: string): Promise<boolean> {
      const preset = presetAnswer(ctx);
      if (preset !== undefined) {
        if (preset && asksController && ctx.optionalActivationCancellation?.available !== true)
          ctx.onActivationChosen?.();
        return preset;
      }
      // Q2859: the second attack effect still activates during the first attack,
      // but cannot declare another. Explain this on the prompt without choosing
      // the optional activation for the player or changing effect resolution.
      const attackAlreadyResolving =
        ctx.activeSelectionContext === "attackSource" && ctx.fx.isAttackResolving?.() === true;
      const response = await manager.request({
        seat: resolveSeat(ctx),
        kind: "optional",
        promptText: attackAlreadyResolving ? "Another attack cannot start while this attack is resolving." : prompt,
        sourceCardId: ctx.source.cardId,
        sourceInstanceId: ctx.source.instanceId,
        sourcePermanentId: ctx.source.permanent()?.permanentId,
        options: {
          ...provenance(ctx),
          ...(attackAlreadyResolving ? { promptKey: "attackAlreadyResolving" as const } : {}),
          activationConfirmation: asksController && ctx.isActivationPending?.() === true,
        },
      });
      const accepted = response.kind === "optional" && response.accept;
      if (accepted && asksController && ctx.optionalActivationCancellation?.available !== true)
        ctx.onActivationChosen?.();
      return accepted;
    },

    async chooseTargets(
      ctx: EffectContext,
      opts: {
        candidates: string[];
        min: number;
        max: number;
        visible?: string[];
        maxTotalPlayCost?: number;
        allowedTargetCombinations?: string[][];
        maxTotalDP?: number;
        promptKey?: "digivolveHost";
      },
    ): Promise<string[]> {
      const min = pickMinimum(ctx, opts.min, opts.max);
      const cancellation = ctx.optionalActivationCancellation;
      const canCancelActivation =
        asksController && cancellation?.available === true && (ctx.payingCostDepth ?? 0) === 0;
      if (declinedByPreset(ctx, min)) return [];
      const response = await manager.request({
        seat: resolveSeat(ctx),
        kind: "chooseTargets",
        promptText: ctx.source.definition.nameEn || ctx.source.cardId,
        sourceCardId: ctx.source.cardId,
        sourceInstanceId: ctx.source.instanceId,
        sourcePermanentId: ctx.source.permanent()?.permanentId,
        options: {
          candidateInstanceIds: opts.candidates,
          visibleInstanceIds: opts.visible ?? opts.candidates,
          min,
          max: opts.max,
          ...(opts.maxTotalPlayCost !== undefined ? { maxTotalPlayCost: opts.maxTotalPlayCost } : {}),
          ...(opts.allowedTargetCombinations !== undefined
            ? { allowedTargetCombinations: opts.allowedTargetCombinations }
            : {}),
          ...(opts.maxTotalDP !== undefined ? { maxTotalDP: opts.maxTotalDP } : {}),
          ...(opts.promptKey !== undefined ? { promptKey: opts.promptKey } : {}),
          // What the running action will do to whatever is picked here, so the board
          // can badge a chosen target rather than parse the prompt's English.
          ...(ctx.activeTargetFate !== undefined ? { targetFate: ctx.activeTargetFate } : {}),
          ...provenance(ctx),
          ...backOutPurpose(min, opts.min),
          ...(canCancelActivation ? { canCancelActivation: true } : {}),
          ...(asksController && ctx.payingDeclinableCost === true ? { declinesCost: true } : {}),
        },
      });
      const selected = clampSelection(
        response.kind === "chooseTargets" ? response.instanceIds : [],
        opts.candidates,
        opts.max,
      );
      if (canCancelActivation && cancellation) {
        if (selected.length === 0) {
          throw new OptionalActivationCancelled({ activation: cancellation });
        }
        cancellation.available = false;
        ctx.oncePerTurnActivationChosen = true;
        ctx.oncePerTurnActivationDeclined = false;
        ctx.onActivationChosen?.();
      }
      const result = clampToCostBudget(ctx, selected, opts.maxTotalPlayCost, (id) => loosePlayCost(ctx, id));
      return result;
    },

    async selectCards(
      ctx: EffectContext,
      opts: {
        selectionGoal?: DecisionSelectionGoal;
        candidates: string[];
        min: number;
        max: number;
        visible?: string[];
        visibleCards?: { instanceId: string; cardId: string; artId?: string }[];
        maxTotalPlayCost?: number;
        differentColors?: boolean;
        distinctCardIds?: boolean;
        distinctNames?: boolean;
        assemblyCardId?: string;
        digiXrosCardId?: string;
        digiXrosMaterialLimits?: { candidateInstanceIds: string[]; max: number }[];
        /** Paid source cards that will enter trash before this DigiXros is placed. */
        digiXrosRuleTrashInstanceIds?: string[];
      },
    ): Promise<string[]> {
      const min = pickMinimum(ctx, opts.min, opts.max);
      if (declinedByPreset(ctx, min)) return [];
      let selectionGoal = opts.selectionGoal;
      if (opts.assemblyCardId !== undefined || opts.digiXrosCardId !== undefined) {
        selectionGoal = DecisionSelectionGoal.MATERIAL.value;
      }
      const response = await manager.request({
        seat: resolveSeat(ctx),
        kind: "selectCards",
        promptText: ctx.source.definition.nameEn || ctx.source.cardId,
        sourceCardId: ctx.source.cardId,
        sourceInstanceId: ctx.source.instanceId,
        sourcePermanentId: ctx.source.permanent()?.permanentId,
        options: {
          candidateInstanceIds: opts.candidates,
          visibleInstanceIds: opts.visible ?? opts.candidates,
          visibleCards: opts.visibleCards,
          maxTotalPlayCost: opts.maxTotalPlayCost,
          min,
          max: opts.max,
          differentColors: opts.differentColors,
          distinctCardIds: opts.distinctCardIds,
          distinctNames: opts.distinctNames,
          assemblyCardId: opts.assemblyCardId,
          ...((opts.assemblyCardId !== undefined || opts.digiXrosCardId !== undefined) &&
          playCostReductionBlocked !== undefined
            ? { playCostReductionBlocked: playCostReductionBlocked(resolveSeat(ctx)) }
            : {}),
          digiXrosCardId: opts.digiXrosCardId,
          digiXrosMaterialLimits: opts.digiXrosMaterialLimits,
          digiXrosRuleTrashInstanceIds: opts.digiXrosRuleTrashInstanceIds,
          ...provenance(ctx),
          ...(selectionGoal === undefined ? {} : { selectionGoal }),
          ...backOutPurpose(min, opts.min),
          ...(asksController && ctx.payingDeclinableCost === true ? { declinesCost: true } : {}),
        },
      });
      const selected = clampSelection(
        response.kind === "selectCards" ? response.instanceIds : [],
        opts.candidates,
        opts.max,
      );
      const result = clampToCostBudget(ctx, selected, opts.maxTotalPlayCost, (id) => loosePlayCost(ctx, id));
      return result;
    },

    async selectPermanents(
      ctx: EffectContext,
      opts: { candidates: string[]; min: number; max: number; maxTotalPlayCost?: number },
    ): Promise<string[]> {
      const min = pickMinimum(ctx, opts.min, opts.max);
      if (declinedByPreset(ctx, min)) return [];
      const response = await manager.request({
        seat: resolveSeat(ctx),
        kind: "chooseTargets",
        promptText: ctx.source.definition.nameEn || ctx.source.cardId,
        sourceCardId: ctx.source.cardId,
        sourceInstanceId: ctx.source.instanceId,
        sourcePermanentId: ctx.source.permanent()?.permanentId,
        options: {
          candidateInstanceIds: opts.candidates,
          min,
          max: opts.max,
          ...(opts.maxTotalPlayCost !== undefined ? { maxTotalPlayCost: opts.maxTotalPlayCost } : {}),
          ...provenance(ctx),
          ...backOutPurpose(min, opts.min),
          ...(asksController && ctx.payingDeclinableCost === true ? { declinesCost: true } : {}),
        },
      });
      const selected = clampSelection(
        response.kind === "chooseTargets" ? response.instanceIds : [],
        opts.candidates,
        opts.max,
      );
      const result = clampToCostBudget(ctx, selected, opts.maxTotalPlayCost, (id) => permanentPlayCost(ctx, id));
      return result;
    },

    async orderCards(
      ctx: EffectContext,
      opts: {
        candidates: string[];
        visible?: string[];
        visibleCards?: { instanceId: string; cardId: string; artId?: string }[];
        destination?: "deckTop" | "deckBottom" | "stackTop" | "stackBottom";
      },
    ): Promise<string[]> {
      const response = await manager.request({
        seat: resolveSeat(ctx),
        kind: "orderCards",
        promptText: "Choose the card order",
        sourceCardId: ctx.source.cardId,
        sourceInstanceId: ctx.source.instanceId,
        sourcePermanentId: ctx.source.permanent()?.permanentId,
        options: {
          candidateInstanceIds: opts.candidates,
          visibleInstanceIds: opts.visible ?? opts.candidates,
          visibleCards: opts.visibleCards,
          orderDestination: opts.destination,
          min: opts.candidates.length,
          max: opts.candidates.length,
          ...provenance(ctx),
        },
      });
      if (response.kind !== "orderCards") return opts.candidates;
      const allowed = new Set(opts.candidates);
      const unique = [...new Set(response.order)].filter((id) => allowed.has(id));
      return unique.length === opts.candidates.length ? unique : opts.candidates;
    },

    async chooseOption(ctx: EffectContext, choices: string[], extras?: ChooseOptionExtras): Promise<number> {
      if (presetAnswer(ctx) === false && extras?.declineIndex !== undefined) return extras.declineIndex;
      const response = await manager.request({
        seat: resolveSeat(ctx),
        kind: "chooseOption",
        promptText: ctx.source.definition.nameEn || ctx.source.cardId,
        sourceCardId: ctx.source.cardId,
        sourceInstanceId: ctx.source.instanceId,
        sourcePermanentId: ctx.source.permanent()?.permanentId,
        options: { choices, ...(extras ?? {}), ...provenance(ctx) },
      });
      if (response.kind !== "chooseOption") return 0;
      // Guard the index into range; an out-of-range pick falls back to the first
      // choice (the safe-default behaviour the manager also applies on timeout).
      if (response.optionIndex < 0 || response.optionIndex >= choices.length) return 0;
      return response.optionIndex;
    },
  };
}

/**
 * Keep only candidate ids the client was actually offered, de-duplicate, and cap at
 * `max`. The server never trusts the raw selection: a buggy/malicious client could
 * echo ids it was not given or exceed the count, so the engine re-enforces both
 * (API-CONTRACT.md "Intent validation contract"; the count is "enforced
 * server-side").
 */
/**
 * Server-side enforcement of a summed play-cost budget ("play any number whose total play costs
 * add up to N or less", BT11-044). The client picks; the server keeps the picks in the order it
 * received them only while the running total stays within budget, so an over-budget response
 * cannot buy a free play the printed text does not allow.
 */
function clampToCostBudget(
  ctx: EffectContext,
  chosen: readonly string[],
  budget: number | undefined,
  costOf: (instanceId: string) => number | undefined,
): string[] {
  if (budget === undefined) return [...chosen];
  const kept: string[] = [];
  let spent = 0;
  for (const id of chosen) {
    const cost = costOf(id) ?? 0;
    if (spent + cost > budget) continue;
    spent += cost;
    kept.push(id);
  }
  return kept;
}

/** The printed play cost of a loose card (hand, deck, trash, security, stack or link card). */
function loosePlayCost(ctx: EffectContext, instanceId: string): number | undefined {
  for (const owner of ctx.game.state.players) {
    if (owner === undefined) continue;
    const zones = [owner.hand, owner.deck, owner.trash, owner.security];
    for (const zone of zones) {
      const card = zone.find((c) => c.instanceId === instanceId);
      if (card) return ctx.game.definitionOf(card).playCost;
    }
    const permanents = [...owner.battleArea, ...(owner.breeding !== undefined ? [owner.breeding] : [])];
    for (const permanent of permanents) {
      const card =
        (permanent.topCard?.instanceId === instanceId ? permanent.topCard : undefined) ??
        permanent.stack.find((c) => c.instanceId === instanceId) ??
        permanent.linked.find((c) => c.instanceId === instanceId);
      if (card) return ctx.game.definitionOf(card).playCost;
    }
  }
  return undefined;
}

/** The printed play cost of a permanent's top card. */
function permanentPlayCost(ctx: EffectContext, permanentId: string): number | undefined {
  const permanent = ctx.game.permanentById(permanentId);
  const top = permanent?.topCard;
  return top ? ctx.game.definitionOf(top).playCost : undefined;
}

function clampSelection(chosen: readonly string[], candidates: readonly string[], max: number): string[] {
  const allowed = new Set(candidates);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of chosen) {
    if (!allowed.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= max) break;
  }
  return out;
}
