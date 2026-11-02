// Running another card's effect, or an Option, as an effect of this one.

import { effectProvenanceKinds } from "../../effectProvenance.js";
import type { EffectContext } from "../../EffectContext.js";
import type { CardSource } from "../../CardSource.js";
import type { Effect } from "../../Effect.js";
import { effectsOf } from "../../collect.js";
import { runtimeCompiledCard } from "../compiledCards.js";
import { describeEffect } from "../describe.js";
import { withPrintedClauses } from "../registration/printedClauses.js";
import { runEffect } from "../dispatch.js";
import { unsupported } from "../errors.js";
import { DefinitionFacts, definitionMatches } from "../matching/definition.js";
import { scaleFactor } from "../scaling.js";
import { bottomFaceDownCostStacks } from "../targeting/faceDownCosts.js";
import { candidateLooseInstances, looseCardsInZone } from "../targeting/loose.js";
import { resolvePermanentTargets } from "../targeting/permanents.js";
import { CardKind, EffectTiming } from "@aegis/shared";
import { MemoryGauge } from "../../../MemoryGauge.js";
import { createLenderCardSource } from "#api/engine/effects/interpreter/actions/createLenderCardSource";
import type { Action, CardDefinition, CardEffect, EffectTrigger, Filter, Seat, ZoneRef } from "@aegis/shared";

/** A foreign card eligible to lend a borrowed effect (its instance + the borrowable effects). */
interface ForeignCandidate {
  instanceId: string;
  cardId: string;
  permanentId?: string;
  borrowable: BorrowableEffect[];
}

interface BorrowableEffect {
  effect: CardEffect;
  sourceInstanceId: string;
  sourceCardId: string;
  sourcePermanentId?: string;
  triggerOrdinal: number;
}

function borrowedTiming(trigger: EffectTrigger): EffectTiming | undefined {
  if (trigger === "OnPlay") return EffectTiming.OnPlay;
  if (trigger === "WhenDigivolving") return EffectTiming.WhenDigivolving;
  if (trigger === "OnDeletion" || trigger === "OnDestroyedAnyone") return EffectTiming.OnDestroyedAnyone;
  return undefined;
}

function disabledTimingForTrigger(trigger: EffectTrigger): "whenDigivolving" | "onPlay" | undefined {
  if (trigger === "WhenDigivolving") return "whenDigivolving";
  if (trigger === "OnPlay") return "onPlay";
  return undefined;
}

function borrowedSource(ctx: EffectContext, borrowed: BorrowableEffect): CardSource {
  const definition = ctx.game.definitionOf({ cardId: borrowed.sourceCardId });
  const permanentId = borrowed.sourcePermanentId;
  return {
    instanceId: borrowed.sourceInstanceId,
    cardId: borrowed.sourceCardId,
    ownerSeat: ctx.source.ownerSeat,
    definition,
    permanent: () => (permanentId === undefined ? undefined : ctx.game.permanentById(permanentId)),
    isOnBattleArea: () => permanentId !== undefined && ctx.game.permanentById(permanentId) !== undefined,
    isOwnersTurn: () => ctx.game.state.turnSeat === ctx.source.ownerSeat,
    hasColor: (color) => definition.colors.includes(color),
  } as CardSource;
}

function registeredBorrowedEffect(ctx: EffectContext, borrowed: BorrowableEffect): Effect | undefined {
  const timing = borrowedTiming(borrowed.effect.trigger);
  if (timing === undefined) return undefined;
  return effectsOf(timing, borrowedSource(ctx, borrowed)).filter(
    (effect) => effect.irTrigger === borrowed.effect.trigger,
  )[borrowed.triggerOrdinal];
}

/**
 * The permanent whose timing lock ("can't activate [On Play]") gates a borrowed effect.
 * An effect transferred "as an effect of this card" is the activator's, so only the
 * activator's lock applies (BT20-037 Q4351/Q4352). A stack card lends its printed effect,
 * but the host activates it (EX9-073 Q4841). Keep this timing identity separate from
 * lender registration and usage identity.
 */
function timingGatePermanentId(
  ctx: EffectContext,
  action: Extract<Action, { kind: "ActivateForeignEffect" }>,
  borrowed: BorrowableEffect,
): string | undefined {
  const activatorPermanentId = ctx.source.permanent()?.permanentId;
  if (action.asEffectOf !== undefined && action.useLenderAsSource !== true) return activatorPermanentId;
  return borrowed.sourcePermanentId ?? activatorPermanentId;
}

/** CR15-15-7-3: a transferred copy belongs to the activator, not the lender's usage. */
function transfersBorrowedEffect(action: Extract<Action, { kind: "ActivateForeignEffect" }>): boolean {
  return action.asEffectOf !== undefined && action.useLenderAsSource !== true;
}

function availableBorrowedEffects(
  ctx: EffectContext,
  action: Extract<Action, { kind: "ActivateForeignEffect" }>,
  effects: BorrowableEffect[],
): BorrowableEffect[] {
  return effects.filter((borrowed) => {
    const timingPermanentId = timingGatePermanentId(ctx, action, borrowed);
    const disabledTiming = disabledTimingForTrigger(borrowed.effect.trigger);
    if (
      disabledTiming !== undefined &&
      timingPermanentId !== undefined &&
      (ctx.fx.isTimingEffectDisabled?.(timingPermanentId, disabledTiming) ??
        ctx.game.isTimingEffectDisabled?.(timingPermanentId, disabledTiming)) === true
    ) {
      return false;
    }
    if (transfersBorrowedEffect(action)) return true;
    const registered = registeredBorrowedEffect(ctx, borrowed);
    return registered === undefined || ctx.usage === undefined
      ? true
      : registered.maxPerTurn <= 0 ||
          ctx.usage.count(borrowed.sourceInstanceId, registered.effectKey) < registered.maxPerTurn;
  });
}

function borrowableFromCompiled(args: {
  compiled: NonNullable<ReturnType<typeof runtimeCompiledCard>>;
  action: Extract<Action, { kind: "ActivateForeignEffect" }>;
  sourceInstanceId: string;
  sourceCardId: string;
  sourcePermanentId?: string;
  trigger?: string;
}): BorrowableEffect[] {
  const ordinals = new Map<string, number>();
  const out: BorrowableEffect[] = [];
  // Borrowed effects need the same printed provenance as ordinary registered effects.
  // A timing-only summary cannot distinguish two clauses with the same timing in the client.
  for (const effect of withPrintedClauses(args.sourceCardId, args.compiled).effects) {
    if (
      !args.action.fromTriggers.includes(effect.trigger) ||
      effect.isSecurity === true ||
      effect.isInherited === true
    ) {
      continue;
    }
    if (args.trigger !== undefined && effect.trigger !== args.trigger) continue;
    const triggerOrdinal = ordinals.get(effect.trigger) ?? 0;
    ordinals.set(effect.trigger, triggerOrdinal + 1);
    out.push({
      effect,
      sourceInstanceId: args.sourceInstanceId,
      sourceCardId: args.sourceCardId,
      sourcePermanentId: args.sourcePermanentId,
      triggerOrdinal,
    });
  }
  return out;
}

/**
 * Collect the foreign cards whose compiled [On Play], [When Digivolving], or [On Deletion] effects this card
 * may borrow, from the requested zone, filtered by `filter`. Only face-up cards qualify
 * (a face-down security card / flipped digivolution card has no readable effect; source
 * `!cardSource.IsFlipped`). A card with no matching borrowable effect is skipped.
 */
function collectForeignCandidates(
  ctx: EffectContext,
  action: Extract<Action, { kind: "ActivateForeignEffect" }>,
  lenderPermanentIds?: readonly string[],
): ForeignCandidate[] {
  const mine = ctx.source.ownerSeat;
  const seat = action.filter.controller === "opponent" ? ctx.game.opponentOf(mine) : mine;
  const player = ctx.game.player(seat);

  const sources: { instanceId: string; cardId: string; permanentId?: string }[] = [];
  if (action.zone === "security") {
    for (const card of player.security)
      if (card.faceUp) sources.push({ instanceId: card.instanceId, cardId: card.cardId });
  } else if (action.zone === "digivolutionCards") {
    // The activating Digimon's OWN digivolution stack (EX8-054: "in this Digimon's
    // digivolution cards"). A flipped (face-down) stack card is excluded unless it is the
    // card just placed by the preceding cost of a lastPlacedOnly activation (BT15-102).
    const self = ctx.source.permanent();
    if (self !== undefined) {
      for (const card of self.stack)
        if (
          card.faceUp ||
          (action.lastPlacedOnly === true && (ctx.lastPlacedUnderInstanceIds ?? []).includes(card.instanceId))
        )
          sources.push({ instanceId: card.instanceId, cardId: card.cardId });
    }
  } else {
    // battleArea: a battle-area permanent's TOP card the right seat controls (BT24-102:
    // "1 of your [Olympos XII] trait Digimon").
    const selfPermanentId = ctx.source.permanent()?.permanentId;
    for (const permanent of player.battleArea) {
      if (lenderPermanentIds !== undefined && !lenderPermanentIds.includes(permanent.permanentId)) continue;
      if (action.filter.isSelfRef === true && permanent.permanentId !== selfPermanentId) continue;
      if (action.filter.boundRef !== undefined) {
        const bound = ctx.boundPlayed?.get(action.filter.boundRef);
        const selected = ctx.selections?.get(action.filter.boundRef);
        if ((bound === undefined || !bound.has(permanent.permanentId)) && selected !== permanent.permanentId) continue;
      }
      const top = permanent.topCard;
      if (top !== undefined)
        sources.push({ instanceId: top.instanceId, cardId: top.cardId, permanentId: permanent.permanentId });
    }
  }

  const out: ForeignCandidate[] = [];
  for (const src of sources) {
    if (action.lastPlacedOnly === true && !(ctx.lastPlacedUnderInstanceIds ?? []).includes(src.instanceId)) continue;
    const def = ctx.game.definitionOf({ cardId: src.cardId } as never);
    if (def === undefined) continue;
    if (!definitionMatches(action.filter, def as unknown as DefinitionFacts)) continue;
    const compiled = runtimeCompiledCard(src.cardId);
    if (compiled === undefined) continue;
    // Borrowable = an [On Play]/[When Digivolving]/[On Deletion] effect (security effects are never
    // borrowable, source `!cardEffect.IsSecurityEffect`). Succession and sibling stack-effect
    // conferrals contribute their matching effects to the host as well (BT24-102/Q6945).
    const borrowable = borrowableFromCompiled({
      compiled,
      action,
      sourceInstanceId: src.instanceId,
      sourceCardId: src.cardId,
      sourcePermanentId: src.permanentId,
    });
    if (src.permanentId !== undefined) {
      const permanent = ctx.game.permanentById(src.permanentId);
      for (const conferral of ctx.fx.stackEffectConferrals?.() ?? []) {
        if (conferral.targetPermanentId !== src.permanentId || conferral.inheritedOnly === true) continue;
        const stackCard = permanent?.stack.find((card) => card.instanceId === conferral.stackInstanceId);
        if (stackCard === undefined) continue;
        const stackCompiled = runtimeCompiledCard(stackCard.cardId);
        if (stackCompiled === undefined) continue;
        borrowable.push(
          ...borrowableFromCompiled({
            compiled: stackCompiled,
            action,
            sourceInstanceId: stackCard.instanceId,
            sourceCardId: stackCard.cardId,
            sourcePermanentId: src.permanentId,
            trigger: conferral.trigger,
          }),
        );
      }
    }
    const available = availableBorrowedEffects(ctx, action, borrowable);
    if (available.length === 0) continue;
    out.push({ instanceId: src.instanceId, cardId: src.cardId, permanentId: src.permanentId, borrowable: available });
  }
  return out;
}

/**
 * Activate a NAMED other card's [On Play]/[When Digivolving] effect (BT23-060 / BT24-102 /
 * EX8-054). Server-authoritative: the engine enumerates the eligible foreign cards, prompts
 * the controller to pick one (and, when the chosen card has more than one borrowable
 * effect, which effect), then runs the borrowed effect(s) under the ACTIVATING card's
 * control/timing. `ctx.source` stays this card when the printed text transfers the effect
 * ("as an effect of this Digimon") or the lender is a security/stack card; a battle-area
 * lender otherwise remains the effect's source (see the ownership note in the body).
 * Controller-relative targets ("your opponent's Digimon") resolve from the same owner
 * either way (source `selectedEffect.SetIsDigimonEffect(true)` + the activating card's
 * hashtable). The client never supplies the effect body; it only chooses among the
 * engine-resolved candidates (threat T-04-14).
 */
export async function runActivateForeignEffect(
  ctx: EffectContext,
  action: Extract<Action, { kind: "ActivateForeignEffect" }>,
  lenderPermanentIds?: readonly string[],
): Promise<void> {
  // §15-15-7-2: each choice is made after the preceding borrowed effect has processed.
  // Recollect candidates because a payment, deletion, or once-per-turn use can change them.
  for (let activation = 0; activation < action.count; activation += 1) {
    const candidates = collectForeignCandidates(ctx, action, lenderPermanentIds);
    if (candidates.length === 0) return;

    let chosen: ForeignCandidate | undefined;
    if (candidates.length === 1) {
      chosen = candidates[0];
    } else {
      const picked = await ctx.ask.selectCards(ctx, {
        candidates: candidates.map((c) => c.instanceId),
        min: 1,
        max: 1,
      });
      chosen = candidates.find((c) => c.instanceId === picked[0]);
    }
    if (chosen === undefined) return;

    let borrowed: BorrowableEffect | undefined;
    if (chosen.borrowable.length === 1) {
      borrowed = chosen.borrowable[0];
    } else {
      const labels = chosen.borrowable.map((entry) => describeEffect(entry.effect));
      const idx = await ctx.ask.chooseOption(ctx, labels, {
        choiceEffects: chosen.borrowable.map((entry) => ({
          cardId: chosen.cardId,
          timing: entry.effect.trigger,
          ...(entry.effect.isInherited === true ? { isInherited: true } : {}),
        })),
      });
      borrowed = chosen.borrowable[idx];
    }
    if (borrowed === undefined) return;

    // Whose effect is the borrowed effect? Rules 15-15-7 transfer ownership only when the
    // printed text says so ("... as an effect of this Digimon", BT23-060 / EX8-054): then it runs
    // as THIS card's effect (ctx.source unchanged), so timing, control and targeting are the
    // activating card's. Otherwise "activate 1 of that Digimon's [When Digivolving] effects"
    // (BT11-112, BT24-102) stays the lender's own effect: the lender permanent is the source, and
    // the effect's source kinds are the lender's, so "isn't affected by your opponent's Digimon
    // effects" still protects against a Digimon effect a Tamer merely triggered.
    const lenderPermanentId = chosen.permanentId;
    const lenderIsEffectiveSource =
      lenderPermanentId !== undefined &&
      (action.useLenderAsSource === true ||
        (action.asEffectOf === undefined && lenderPermanentId !== ctx.source.permanent()?.permanentId));
    let runCtx = ctx;
    if (lenderIsEffectiveSource) {
      runCtx = {
        ...ctx,
        sourcePermanentIdAtCreation: lenderPermanentId,
        activeTiming: borrowed.effect.trigger,
        source: createLenderCardSource({
          game: ctx.game,
          payload: {
            instanceId: chosen.instanceId,
            cardId: chosen.cardId,
            ownerSeat: ctx.source.ownerSeat,
            permanentId: lenderPermanentId,
          },
        }),
      };
      runCtx.effectSourceKinds = effectProvenanceKinds(runCtx);
    }
    // A Q5331 override belongs only to the matching borrowed lender/effect. Clear any inherited
    // marker at the loop boundary, then seed it per item so another eligible Zaxon On Play lender
    // selected by this same activation retains its ordinary optional/source behavior.
    runCtx = {
      ...runCtx,
      borrowedEffectOverrides: undefined,
    };
    if (lenderIsEffectiveSource) {
      runCtx.fx.enterEffectResolution?.(
        runCtx.source.ownerSeat,
        [...(runCtx.effectSourceKinds ?? effectProvenanceKinds(runCtx))],
        runCtx.source.permanent()?.permanentId,
      );
    }
    try {
      const eff = borrowed.effect;
      const timing = disabledTimingForTrigger(eff.trigger);
      const timingPermanentId = timingGatePermanentId(ctx, action, borrowed);
      if (
        timing !== undefined &&
        timingPermanentId !== undefined &&
        (runCtx.fx.isTimingEffectDisabled?.(timingPermanentId, timing) ??
          runCtx.game.isTimingEffectDisabled?.(timingPermanentId, timing)) === true
      ) {
        continue;
      }
      const borrowedEffectOverrides =
        action.borrowedEffectOverrides?.sourceCardId === borrowed.sourceCardId &&
        action.borrowedEffectOverrides.trigger === eff.trigger
          ? action.borrowedEffectOverrides
          : undefined;
      // The activator's own notice names only its clause; announce the borrowed clause too so
      // the player sees which effect of the lender actually resolves.
      const lenderCard = { ...runCtx.source, cardId: chosen.cardId, instanceId: chosen.instanceId };
      const resolvedNotice = runCtx.fx.announceEffect?.(
        { ...runCtx, source: lenderCard },
        {
          effectKey: eff.effectKey ?? `${borrowed.sourceCardId}/borrowed/${eff.trigger}`,
          description: eff.description ?? describeEffect(eff),
          timing: eff.trigger,
          ...(eff.isInherited === true ? { isInherited: true } : {}),
        },
      );
      try {
        await runEffect(
          {
            ...runCtx,
            borrowedEffectOverrides,
            activeTiming: eff.trigger,
            activeEffectText: eff.description ?? describeEffect(eff),
            activeEffectTextCardId: borrowed.sourceCardId,
          },
          eff,
        );
      } finally {
        resolvedNotice?.();
      }
      const registered = registeredBorrowedEffect(ctx, borrowed);
      if (!transfersBorrowedEffect(action) && registered !== undefined && registered.maxPerTurn > 0) {
        ctx.usage?.register(borrowed.sourceInstanceId, registered.effectKey);
      }
    } finally {
      if (lenderIsEffectiveSource) runCtx.fx.leaveEffectResolution?.();
    }
  }
}

const BORROWABLE_EFFECT_TRIGGERS: readonly EffectTrigger[] = [
  "OnPlay",
  "WhenDigivolving",
  "OnDeletion",
  "OnDestroyedAnyone",
];

function optionUseCommitted(ctx: EffectContext): boolean {
  return ctx.lastOptionUsed === true;
}

export async function runActivateEffect(
  ctx: EffectContext,
  action: Extract<Action, { kind: "ActivateEffect" }>,
): Promise<void> {
  const trigger = action.effectType;
  if (action.target === undefined || !BORROWABLE_EFFECT_TRIGGERS.includes(trigger as EffectTrigger)) {
    unsupported(ctx, action, `legacy ActivateEffect payload is not specific enough to normalize`);
    return;
  }
  const filter = { ...(action.target.filter ?? {}) };
  if (filter.controller === undefined && filter.controllerDefault !== undefined) {
    filter.controller = filter.controllerDefault;
  }
  const targetCount = typeof action.target.count === "number" ? action.target.count : 1;
  // A fixed reference names the lender, not a filter over every card on the board.
  // Resolve it after the cost, preserving the subject's current top card (Rina Q2143).
  const lenderPermanentIds =
    action.target.sourceRef === undefined ? undefined : await resolvePermanentTargets(ctx, action.target);
  await runActivateForeignEffect(
    ctx,
    {
      ...action,
      kind: "ActivateForeignEffect",
      zone: filter.zone === "digivolutionCards" ? "digivolutionCards" : "battleArea",
      fromTriggers: [trigger as EffectTrigger],
      filter,
      count: action.count ?? targetCount,
      lastPlacedOnly: action.lastPlacedOnly,
      asEffectOf: action.asEffectOf,
      useLenderAsSource: action.useLenderAsSource,
    },
    lenderPermanentIds,
  );
}

/**
 * "Use 1 [Option] card from your hand without paying the cost" (EX8-037 / BT15-092 / BT16-094 /
 * BT19-040). Server-authoritative and a sibling of `runActivateForeignEffect`: the engine
 * enumerates the eligible Options server-side, prompts the controller to pick WHICH one (the use
 * is optional — source `canNoSelect: true`), then hands off to `ctx.fx.useOptionFromHand`,
 * which resolves that Option's [Main] effect under the USING card's control/timing (`ctx.source`
 * unchanged).
 * The client supplies only the choice among the engine-resolved candidates — never an effect body
 * (threat T-08-10/11). Eligibility follows the printed filter, live Option color/Use Req.
 * requirements, and use prohibitions (T-08-11). The Option is not a permanent, so it resolves
 * then goes to trash (the `playInstances` `isPermanentKind` gap). The use RESULT binds on
 * `ctx.lastOptionUsed` at use-time (KB EX8-037 Q4738) so an `ifThisEffectUsed` tail can gate.
 */
// Loose DUAL cards carry both sides' colors in the catalog. When selecting an
// Option to use, color predicates (including single-color) read its Option face.
function optionUseDefinition(definition: CardDefinition): CardDefinition {
  return definition.isDualCard && definition.optionColorRequirements !== undefined
    ? { ...definition, colors: definition.optionColorRequirements }
    : definition;
}

function optionUseCandidates(
  ctx: EffectContext,
  action: Extract<Action, { kind: "UseOptionWithoutCost" }>,
  includePayableCostCards = false,
): { candidates: string[]; zones: ZoneRef[]; seat: Seat } {
  const seat = ctx.source.ownerSeat;
  const zones: ZoneRef[] =
    (action.from?.length ?? 0) > 0
      ? (action.from as ZoneRef[])
      : (action.target?.from?.length ?? 0) > 0
        ? (action.target!.from as ZoneRef[])
        : (["hand"] as ZoneRef[]);
  const filter = (action as { filter?: Filter }).filter ?? action.target?.filter;
  const attackerLevelCap =
    filter?.playCostLteAttackerLevel === true
      ? (() => {
          const attackerId = ctx.trigger.attackerPermanentId;
          const attacker = attackerId === undefined ? undefined : ctx.game.permanentById(attackerId);
          return attacker?.topCard === undefined ? undefined : ctx.game.definitionOf(attacker.topCard).level;
        })()
      : undefined;
  const scaledCostCap =
    filter?.playCostLteScaling === undefined
      ? undefined
      : (filter.playCostLte ?? 0) + scaleFactor(ctx, filter.playCostLteScaling);
  const dynamicCostCap =
    action.playCostCeiling === undefined
      ? undefined
      : action.playCostCeiling.base +
        scaleFactor(ctx, {
          per: action.playCostCeiling.per,
          filter: action.playCostCeiling.filter,
          unit: action.playCostCeiling.unit,
        }) *
          action.playCostCeiling.raise;
  const costCap = dynamicCostCap ?? attackerLevelCap ?? scaledCostCap ?? filter?.playCostLte;
  const projectUseCostCeilings = (candidateFilter: Filter, useCost: number, rootCap?: number): Filter => {
    const localCap =
      rootCap ??
      (candidateFilter.playCostLteScaling === undefined
        ? candidateFilter.playCostLte
        : (candidateFilter.playCostLte ?? 0) + scaleFactor(ctx, candidateFilter.playCostLteScaling));
    return {
      ...candidateFilter,
      playCostLte: localCap !== undefined && useCost > localCap ? -1 : undefined,
      playCostLteScaling: undefined,
      or: candidateFilter.or?.map((branch) => projectUseCostCeilings(branch, useCost)),
      and: candidateFilter.and?.map((branch) => projectUseCostCeilings(branch, useCost)),
      not: candidateFilter.not === undefined ? undefined : projectUseCostCeilings(candidateFilter.not, useCost),
    };
  };
  const candidates: string[] = [];
  const addIfEligible = (candidate: { instanceId: string; cardId: string }) => {
    if (candidates.includes(candidate.instanceId)) return;
    const def = ctx.game.definitionOf({ cardId: candidate.cardId } as never);
    const useCost = ctx.fx.effectiveLooseUseCost?.(candidate.instanceId, seat) ?? def.playCost;
    const effectiveFilter = filter === undefined ? undefined : projectUseCostCeilings(filter, useCost, costCap);
    // Exact-cost filters ("an Option with a memory cost of 7") read the cost the card has in
    // hand, which excludes reductions that apply only when it would be used (Q1501).
    const inHandCost = ctx.fx.inHandCost?.(candidate.instanceId, seat) ?? def.playCost;
    if (
      effectiveFilter !== undefined &&
      !definitionMatches(effectiveFilter, { ...optionUseDefinition(def), playCost: inHandCost })
    )
      return;
    if (!def.kinds.includes(CardKind.Option)) return;
    if (
      action.waiveColorRequirement !== true &&
      ctx.game.optionColorRequirementMet?.(seat, candidate.instanceId, def) === false
    )
      return;
    if (ctx.fx.isPlayProhibited?.(seat, candidate.cardId, "useOption") === true) return;
    candidates.push(candidate.instanceId);
  };
  for (const zone of zones) {
    const zoneCandidates =
      action.target === undefined
        ? looseCardsInZone(ctx, seat, zone)
        : candidateLooseInstances(ctx, action.target, [zone], optionUseDefinition);
    for (const candidate of zoneCandidates) {
      addIfEligible(candidate);
    }
  }
  // Some "by trashing ..." costs can put the Option to be used into the requested
  // trash zone (BT26-070 Q7092). Before the cost is paid, treat only an actually
  // payable bottom card as a prospective candidate. This preserves that valid flow
  // without consuming unrelated stack cards when neither the trash nor the cost can
  // supply a legal Option.
  if (
    includePayableCostCards &&
    zones.includes("trash") &&
    action.cost?.controller !== "opponent" &&
    (action.cost?.kind === "trashBottomFaceDownUnderTamer" || action.cost?.kind === "trashBottomFaceDownUnderDigimon")
  ) {
    const required = action.cost.count ?? 1;
    // Paying N cards can expose any of the first N face-down cards of a host,
    // including an Option behind another face-down cost card (Q6301/Q7092).
    const bottomCards = bottomFaceDownCostStacks(ctx, action.cost).flatMap(({ cards }) => cards.slice(0, required));
    if (bottomCards.length >= required) bottomCards.forEach(addIfEligible);
  }
  // A normal digivolution-card trash cost can likewise create the requested
  // trash-zone Option candidate (BT25-083 Q6395). Preflight the payable stack
  // pool so the cost-bearing action is offered when the trash starts empty;
  // after payment, normal trash-zone enumeration still chooses the Option.
  if (
    includePayableCostCards &&
    zones.includes("trash") &&
    action.cost?.kind === "trash" &&
    action.cost.target?.filter.zone === "digivolutionCards"
  ) {
    const costCandidates = candidateLooseInstances(ctx, action.cost.target, ["digivolutionCards"]);
    const required = action.cost.target.count === "all" ? costCandidates.length : (action.cost.target.count ?? 1);
    if (required > 0 && costCandidates.length >= required) costCandidates.forEach(addIfEligible);
  }
  return { candidates, zones, seat };
}

function optionUseReduction(
  ctx: EffectContext,
  action: Extract<Action, { kind: "UseOptionWithoutCost" }>,
  seat: Seat,
): number {
  const memoryReduction =
    action.reduceCostByOpponentMemory === true
      ? Math.max(0, new MemoryGauge(ctx.game.state).memoryFor(ctx.game.opponentOf(seat)))
      : 0;
  const scalingReduction = action.reduceCostByScaling === undefined ? 0 : scaleFactor(ctx, action.reduceCostByScaling);
  return (action.reduceCostBy ?? 0) + memoryReduction + scalingReduction;
}

export async function canAttemptUseOptionWithoutCost(
  ctx: EffectContext,
  action: Extract<Action, { kind: "UseOptionWithoutCost" }>,
): Promise<boolean> {
  const candidates = optionUseCandidates(ctx, action, true).candidates;
  if (candidates.length === 0) return false;
  if (action.payCost !== true || ctx.fx.canAffordEffectPlay === undefined) return true;
  const costDelta = optionUseReduction(ctx, action, ctx.source.ownerSeat);
  const affordability = await Promise.all(
    candidates.map((instanceId) =>
      ctx.fx.canAffordEffectPlay!(instanceId, {
        costDelta,
        useAsOption: true,
        controllerSeat: ctx.source.ownerSeat,
      }),
    ),
  );
  return affordability.some(Boolean);
}

const PRINTED_OPTION_USE =
  /\b(?:you\s+may\s+)?(?:play\s+or\s+)?use\s+(?:up\s+to\s+)?(?:\d+|one|an?|this\s+card)\b[^.]*/i;

function findPrintedOptionUse(effectText: string | undefined): string | undefined {
  if (effectText === undefined) {
    return undefined;
  }
  return PRINTED_OPTION_USE.exec(effectText)?.[0];
}

async function selectOptionToUse(
  ctx: EffectContext,
  action: Extract<Action, { kind: "UseOptionWithoutCost" }>,
  candidates: string[],
): Promise<string[]> {
  const outerEffectTextPart = ctx.activeEffectTextPart;
  const outerEffectTextEmphasis = ctx.activeEffectTextEmphasis;
  const printedUse = action.effectTextPart === undefined ? findPrintedOptionUse(ctx.activeEffectText) : undefined;
  if (printedUse !== undefined) {
    ctx.activeEffectTextPart = ctx.activeEffectText;
    ctx.activeEffectTextEmphasis = printedUse;
  }
  try {
    return await ctx.ask.selectCards(ctx, { candidates, min: action.selectionRequired === true ? 1 : 0, max: 1 });
  } finally {
    ctx.activeEffectTextPart = outerEffectTextPart;
    ctx.activeEffectTextEmphasis = outerEffectTextEmphasis;
  }
}

export async function runUseOptionWithoutCost(
  ctx: EffectContext,
  action: Extract<Action, { kind: "UseOptionWithoutCost" }>,
): Promise<void> {
  // Bind the use OUTCOME on ctx up-front: false until an Option is actually used (read by a
  // subsequent "if this effect used" Condition; KB EX8-037 Q3923/Q4737).
  ctx.lastOptionUsed = false;
  ctx.lastOptionUsedInstanceId = undefined;

  const { candidates, zones, seat } = optionUseCandidates(ctx, action);
  if (candidates.length === 0) return;

  // The controller picks WHICH eligible Option (the use is optional: min 0). The client can only
  // name an engine-offered candidate; it never injects an effect.
  const picked = await selectOptionToUse(ctx, action, candidates);
  const chosenId = picked[0];
  if (chosenId === undefined || !candidates.includes(chosenId)) return;

  // Fetch the chosen Option's compiled [Main] effect SERVER-SIDE and run it under THIS card's
  // control (ctx.source unchanged — same pattern as the borrowed-effect run). Options carry their
  // active effect on the `Main` trigger.
  // Resolve the pick from the SAME zone set used to build the candidates — `action.from` may name
  // a non-hand zone (e.g. ["trash"]), so retrieving from "hand" only would drop a non-hand pick's
  // borrowed effect while still trashing the card and setting lastOptionUsed (WR-02).
  const chosenCard = zones
    .flatMap((z) => looseCardsInZone(ctx, seat, z as ZoneRef))
    .find((c) => c.instanceId === chosenId);

  // The shared use verb owns payment so play-cost restrictions and insufficient-memory checks
  // run exactly once. Fold both printed reductions into its signed cost delta.
  const totalReduction = optionUseReduction(ctx, action, seat);

  // Effect resolution + lifecycle (trash the Option, fire whenOptionUsed) both now live behind
  // `ctx.fx.useOptionFromHand` (primitives.ts), which resolves the chosen card's registered
  // EffectModule for EffectTiming.OnUseOption itself — via the shared registry, so it covers a
  // hand-written module too, not just IR-compiled ones (the old inline `getCompiledCard` +
  // `runEffect` here never ran a hand-written Option's effect). Bind the use result TRUE at
  // use-time — Q4738: bound even if the Option's effect digivolved the source away. Carry the
  // Option's ORIGINAL use cost so a whenOptionUsed watcher can gate on "a cost of 2 or more"
  // (BT19-040; KB Q5471-Q5473 read the cost itself, not the paid/reduced value).
  const usedCost = chosenCard ? ctx.game.definitionOf({ cardId: chosenCard.cardId } as never).playCost : undefined;
  const effectiveUseCost = Math.max(0, (usedCost ?? 0) - totalReduction);
  let paymentHandled = false;
  // The concrete primitive owns payment in production. Lightweight interpreter doubles used
  // by mechanism tests do not expose that lifecycle seam, so charge through the context's
  // memory hook there to keep the action contract observable without double-paying live games.
  if (action.payCost === true && effectiveUseCost > 0 && ctx.fx.resolveCardEffect === undefined) {
    const payer = ctx.fx.gainMemoryForSeat;
    if (payer === undefined) return;
    payer(ctx.source.ownerSeat, -effectiveUseCost);
    paymentHandled = true;
  }
  await ctx.fx.useOptionFromHand(ctx, chosenId, usedCost, {
    payCost: action.payCost,
    ...(totalReduction > 0 ? { costDelta: totalReduction } : {}),
    ...(paymentHandled ? { paymentHandled: true } : {}),
  });
  if (!optionUseCommitted(ctx)) return;
  ctx.lastOptionUsedInstanceId = chosenId;
}

/**
 * "Activate this card's [Main] effect" — run the source card's own [Main]-timing
 * effect from the current (non-main) context (the common [Security] "activate this
 * card's [Main] effect" form). Looks up the compiled record and runs every Main
 * effect's actions through the interpreter. A loud gap when the card has no compiled
 * [Main] effect (so a silent no-op cannot hide a missing main ability).
 */
export async function runActivateMain(ctx: EffectContext): Promise<void> {
  const compiled = runtimeCompiledCard(ctx.source.cardId);
  const mains = (compiled === undefined ? [] : withPrintedClauses(ctx.source.cardId, compiled).effects).filter(
    (e) => e.trigger === "Main" && !e.isSecurity,
  );
  if (mains.length === 0) {
    unsupported(ctx, { kind: "ActivateMain" }, `ActivateMain found no [Main] effect on ${ctx.source.cardId}`);
    return;
  }
  // A DUAL Digimon directly activating its Option-side [Main] produces an Option effect,
  // not a Digimon effect (BT25-104 Q6496-Q6498). Narrow the physical dual definition only
  // for this borrowed Main body so source-kind-qualified immunity sees the correct face.
  const sourceKinds = ctx.source.definition.kinds;
  const activatesDualOptionFace = sourceKinds.includes(CardKind.Digimon) && sourceKinds.includes(CardKind.Option);
  const mainCtx = activatesDualOptionFace ? { ...ctx, effectSourceKinds: [CardKind.Option] } : ctx;
  const outerTiming = mainCtx.activeTiming;
  const outerText = mainCtx.activeEffectText;
  const outerTextPart = mainCtx.activeEffectTextPart;
  const outerInherited = mainCtx.activeEffectIsInherited;
  // Decisions belong to the activated Main body, rather than the clause that invoked it.
  mainCtx.activeTiming = "Main";
  mainCtx.activeEffectTextPart = undefined;
  if (activatesDualOptionFace) {
    ctx.fx.enterEffectResolution?.(ctx.source.ownerSeat, [CardKind.Option], ctx.source.permanent()?.permanentId);
  }
  try {
    for (const [index, effect] of mains.entries()) {
      const resolved = ctx.fx.announceEffect?.(ctx, {
        effectKey: effect.effectKey ?? `${ctx.source.cardId}/main/${index}`,
        description: describeEffect(effect),
        timing: "Main",
        ...(effect.isInherited === true ? { isInherited: true } : {}),
      });
      try {
        await runEffect(mainCtx, effect);
      } finally {
        resolved?.();
      }
    }
  } finally {
    mainCtx.activeTiming = outerTiming;
    mainCtx.activeEffectText = outerText;
    mainCtx.activeEffectTextPart = outerTextPart;
    mainCtx.activeEffectIsInherited = outerInherited;
    if (activatesDualOptionFace) ctx.fx.leaveEffectResolution?.();
  }
}
