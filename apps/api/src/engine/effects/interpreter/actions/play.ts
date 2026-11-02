// Playing cards from hand, deck, trash, and security.

import type { EffectContext } from "../../EffectContext.js";
import { requireOpponentAsk } from "../../../decisions/decisionApi.js";
import { evaluateCondition } from "../conditions.js";
import type { ActionScope } from "../dispatch.js";
import { definitionMatches, hasExactName } from "../matching/definition.js";
import { permanentMatchesFilter, seatsForController } from "../matching/permanent.js";
import { countMatching, scaleFactor } from "../scaling.js";
import { DEFAULT_PLAY_ZONES, candidateLooseInstances, looseCardsInZone, pickLoose } from "../targeting/loose.js";
import { stackHostMatches } from "../targeting/stackHostMatches.js";
import { runPlayPerLevel } from "./dna.js";
import { CardKind, effectiveStaticNames, getCardDefinition, resolveTokenCardId } from "@aegis/shared";
import type { Action, Filter, Scaling, Seat, Target } from "@aegis/shared";
import { availableEffectPlayAssembly, playEffectInstances } from "./effectPlayAssembly.js";
import { availableEffectPlayDigiXrosReduction } from "./effectPlayDigiXrosAvailability.js";

/**
 * The card kinds a play target explicitly asks for, across its filter and every alternative.
 * Empty means the IR named no kind at all.
 */
function requestedPlayKinds(target: Target | undefined): string[] {
  if (target === undefined) return [];
  const filters = [target.filter, ...(target.orFilters ?? []), ...(target.filter?.orFilters ?? [])];
  return filters.flatMap((filter) => filter?.kind ?? []);
}

/**
 * Exclude Options (including DUAL cards) from permanent-play selections.
 *
 * Only Digimon and Tamers are ever PLAYED; an Option card is USED (comprehensive rules
 * §6-4 vs §6-5), and no printed card says "play N ... Option card". A kind-less filter such
 * as BT21-098's "play 1 card with [Vemmon] in its text and a play cost of 6 or less"
 * therefore means Digimon and Tamers, but matched Options too because `kind` was the only
 * thing excluding them.
 *
 * An IR that genuinely means "use an Option" says so with `kind: ["Option"]`, which is the
 * same signal the play-vs-use split further down already reads. Naming Option keeps Option
 * cards in the pool — including alongside Digimon/Tamer, as EX12-077's "Digimon, Tamer, or
 * Option card" does — and the play-vs-use split routes each one. A DUAL card is kept only for
 * an Option-only target or a normalized mixed play/use picker; it always resolves as an Option.
 */
/**
 * Registry name for one PlayToken reference. The catalog sometimes carries the printed
 * token descriptor rather than the registry alias, so both spellings resolve here.
 */
export function tokenRegistryName(tokenRef: string | { name: string }): string {
  const tokenName = typeof tokenRef === "string" ? tokenRef : tokenRef.name;
  return tokenName === "Atho, René & Por" ? "AthoRenePor Token" : tokenName;
}

/**
 * Names of the resolving seat's Digimon when this effect carries the same-name play ban,
 * otherwise undefined. Q5224: "with the same names" is satisfied by even one shared name.
 */
function sameNameRestrictedOwnDigimonNames(ctx: EffectContext): Set<string> | undefined {
  if (ctx.effectRestrictions?.has("cannotPlaySameNameAsOwnDigimon") !== true) return undefined;
  // `battleArea` is an ArraySchema, which throws on flatMap: iterate and collect.
  const names = new Set<string>();
  for (const permanent of ctx.game.player(ctx.source.ownerSeat).battleArea) {
    if (permanent.topCard === undefined) continue;
    for (const name of effectiveStaticNames(ctx.game.definitionOf(permanent.topCard))) names.add(name);
  }
  return names;
}

/**
 * The tokens a PlayToken may still create. A token in play is a Digimon with that token's name
 * (Q1033), and cannot bypass the resolving player's play prohibitions. Under
 * `cannotPlaySameNameAsOwnDigimon`, a token whose name is already on your field
 * cannot be played — the same ban Q5224 applies to the play-from-zone route (BT23-013).
 */
export function playableTokenRefs<T extends string | { name: string }>(
  ctx: EffectContext,
  tokenRefs: readonly T[],
): T[] {
  const bannedNames = sameNameRestrictedOwnDigimonNames(ctx);
  return tokenRefs.filter((tokenRef) => {
    const registryName = tokenRegistryName(tokenRef);
    const cardId = resolveTokenCardId(registryName);
    const definition = cardId === undefined ? undefined : getCardDefinition(cardId);
    if (cardId !== undefined && ctx.fx.isPlayProhibited?.(ctx.source.ownerSeat, cardId, "play") === true) return false;
    const names = definition === undefined ? [registryName] : effectiveStaticNames(definition);
    return bannedNames === undefined || !names.some((name) => bannedNames.has(name));
  });
}

/** Drop play candidates this effect's same-name ban forbids; a no-op without the ban. */
export function candidatesAllowedBySameNameRestriction<T extends { cardId: string }>(
  ctx: EffectContext,
  candidates: readonly T[],
): T[] {
  const bannedNames = sameNameRestrictedOwnDigimonNames(ctx);
  if (bannedNames === undefined) return [...candidates];
  return candidates.filter((candidate) => {
    const names = effectiveStaticNames(ctx.game.definitionOf({ cardId: candidate.cardId } as never));
    return !names.some((name) => bannedNames.has(name));
  });
}

/** DUAL candidates that reach play-or-use resolve as Options, never as played Digimon. */
export function isEffectPlayProhibited(ctx: EffectContext, card: { cardId: string }): boolean {
  const isProhibited = ctx.fx.isPlayProhibited;
  if (isProhibited === undefined) return false;
  const definition = ctx.game.definitionOf({ cardId: card.cardId } as never);
  return (
    isProhibited(
      ctx.source.ownerSeat,
      card.cardId,
      definition.kinds.includes(CardKind.Option) ? "useOption" : "play",
    ) === true
  );
}

export function playableCandidates<
  T extends { instanceId: string; cardId: string; hostPermanentId?: string; faceUp?: boolean },
>(ctx: EffectContext, target: Target | undefined, candidates: readonly T[], chooseDualMode?: true): T[] {
  const requestedKinds = requestedPlayKinds(target);
  const namesOption = requestedKinds.includes("Option");
  const optionOnly = namesOption && !requestedKinds.includes("Digimon") && !requestedKinds.includes("Tamer");
  return candidates.filter((candidate) => {
    if (candidate.hostPermanentId !== undefined && candidate.faceUp === false) return false;
    const definition = ctx.game.definitionOf({ cardId: candidate.cardId } as never);
    const kinds = definition.kinds;
    if (!kinds.includes(CardKind.Option)) return true;
    const isDual = kinds.includes(CardKind.Digimon) || kinds.includes(CardKind.Tamer);
    if (isDual && !optionOnly && chooseDualMode !== true) return false;
    return (
      (namesOption || (isDual && chooseDualMode === true)) &&
      ctx.game.optionColorRequirementMet?.(ctx.source.ownerSeat, candidate.instanceId, definition) !== false
    );
  });
}

export function playCostScalingDelta(scaling: Scaling, factor: number): number {
  if (scaling.subtract !== undefined) return -scaling.subtract * factor;
  if (scaling.bonus !== undefined) return scaling.bonus * factor;
  return factor;
}

export function ownStackPlayCandidates(ctx: EffectContext, target: Target) {
  const filters = [target.filter, ...(target.orFilters ?? []), ...(target.filter.orFilters ?? [])];
  const matching = playableCandidates(
    ctx,
    target,
    (ctx.source.permanent()?.stack ?? []).filter((card) => {
      const definition = ctx.game.definitionOf(card);
      return (
        card.faceUp !== false &&
        filters.some((filter) => definitionMatches(filter, definition)) &&
        !ctx.fx.isPlayProhibited?.(ctx.source.ownerSeat, card.cardId, "play")
      );
    }),
  );
  return target.totalPlayCostBudget === undefined
    ? matching
    : matching.filter((card) => ctx.game.definitionOf(card).playCost <= target.totalPlayCostBudget!);
}

/**
 * Materialize a dynamic level ceiling before matching loose cards.
 *
 * Permanent matching evaluates `levelComparison.scaling` against live permanents,
 * but loose-card matching delegates to `definitionMatches`, which intentionally only
 * understands static filters. Play effects therefore need to turn the dynamic ceiling
 * into a static value before resolving hand/trash candidates (EX9-054).
 */
export function materializeLevelComparisonScaling(target: Target, factor: number): Target {
  const comparison = target.filter.levelComparison;
  if (comparison?.value === undefined || comparison.scaling === undefined) return target;
  const { scaling: _scaling, ...staticComparison } = comparison;
  return {
    ...target,
    filter: {
      ...target.filter,
      levelComparison: {
        ...staticComparison,
        value: comparison.value + factor,
      },
    },
  };
}

/**
 * Materialize a dynamic play-cost ceiling before matching loose cards.
 *
 * Same reason as `materializeLevelComparisonScaling`: `definitionMatches` only understands a
 * static `playCostLte`, so a `playCostLteScaling` ceiling must be folded into that value before
 * loose candidates are resolved. Both the optional-play preflight in `runAction` and the play
 * resolver below go through this helper so the gate and the resolution agree (BT19-100).
 */
export function materializePlayCostLteScaling(ctx: EffectContext, target: Target): Target {
  const scaling = target.filter.playCostLteScaling;
  if (scaling === undefined) return target;
  return {
    ...target,
    filter: {
      ...target.filter,
      playCostLte: (target.filter.playCostLte ?? 0) + playCostScalingDelta(scaling, scaleFactor(ctx, scaling)),
      playCostLteScaling: undefined,
    },
  };
}

function paidReduction(ctx: EffectContext, action: Extract<Action, { kind: "PlayWithoutCost" }>): number | undefined {
  const base = action.reduceCostBy;
  const scaling = action.reduceCostByScaling === undefined ? 0 : scaleFactor(ctx, action.reduceCostByScaling);
  const conditional = (
    action as typeof action & { reduceCostByIf?: { amount: number; condition: import("@aegis/shared").Condition } }
  ).reduceCostByIf;
  if (base === undefined && action.reduceCostByScaling === undefined && conditional === undefined) return undefined;
  return (
    (base ?? 0) +
    scaling +
    (conditional !== undefined && evaluateCondition(ctx, conditional.condition) ? conditional.amount : 0)
  );
}

/**
 * ＜Decode＞ plays from "that Digimon's digivolution cards" (CR 16-36-1). A Decode play whose
 * target names no host scope would otherwise pool every digivolution card the controller owns,
 * so scope it to the resolving source permanent unless the IR already scopes the host.
 */
export function applyDecodeHostScope(action: Extract<Action, { kind: "PlayWithoutCost" }>, target: Target): Target {
  const zones = action.from && action.from.length > 0 ? action.from : DEFAULT_PLAY_ZONES;
  const sources = target.source === undefined ? [] : Array.isArray(target.source) ? target.source : [target.source];
  const alreadyScoped =
    target.filter.hostFilter !== undefined ||
    sources.includes("thisDigimon") ||
    action.fromOwnDigivolutionStack === true;
  if (action.playedByDecode !== true || alreadyScoped || !zones.includes("digivolutionCards")) return target;
  return { ...target, filter: { ...target.filter, hostFilter: { isSelfRef: true } } };
}

function isVisibleStackHost(
  ctx: EffectContext,
  target: Target,
  filter: Filter,
  hostPermanentId: string | undefined,
): boolean {
  const sources = target.source === undefined ? [] : Array.isArray(target.source) ? target.source : [target.source];
  if (sources.includes("thisDigimon") && hostPermanentId !== ctx.source.permanent()?.permanentId) return false;
  const { or: branches, ...common } = filter;
  const filters = branches && branches.length > 0 ? branches.map((branch) => ({ ...common, ...branch })) : [filter];
  return filters.some((branch) => stackHostMatches(ctx, branch.hostFilter, hostPermanentId));
}

export function applyPlayCostCeiling(
  ctx: EffectContext,
  action: Extract<Action, { kind: "PlayWithoutCost" }>,
  target: Target,
): Target {
  const ceiling = action.playCostCeiling;
  if (ceiling === undefined) return target;
  const mine = ctx.source.ownerSeat;
  const opp = ctx.game.opponentOf(mine);
  const filter = ceiling.filter;
  const zone = (filter as { zone?: string }).zone;
  const controller = (filter as { controller?: string }).controller;
  const seats: Seat[] =
    controller === "any" || controller === "both" || controller === undefined
      ? [mine, opp]
      : controller === "opponent"
        ? [opp]
        : [mine];
  let totalCards = 0;
  if (ceiling.unit === "digivolutionCards") {
    for (const seat of seats) {
      for (const permanent of ctx.game.player(seat).battleArea) {
        if (permanentMatchesFilter(ctx, permanent, filter, ctx.source)) totalCards += permanent.stack.length;
      }
    }
  } else if (ceiling.unit === "selfFaceDownDigivolutionCards") {
    totalCards = scaleFactor(ctx, { per: 1, filter, unit: ceiling.unit });
  } else if (zone === "trash") {
    for (const seat of seats) totalCards += ctx.game.player(seat).trash.length;
  } else if (ceiling.unit === "cards") {
    totalCards = scaleFactor(ctx, { per: 1, filter, unit: "cards" });
  }
  const computedCeiling = ceiling.base + Math.floor(totalCards / ceiling.per) * ceiling.raise;
  return { ...target, filter: { ...target.filter, playCostLte: computedCeiling } };
}

/** Apply a live DP ceiling modifier before loose-card candidate matching. */
export function applyPlayDpCeilingModifier(
  ctx: EffectContext,
  action: Extract<Action, { kind: "PlayWithoutCost" }>,
  target: Target,
): Target {
  const mod = action.dpCeilingModifier;
  if (mod === undefined) return target;
  const scaledCount =
    mod.scaling !== undefined ? scaleFactor(ctx, mod.scaling) : (ctx.namedCounts?.get(mod.scalingSource ?? "") ?? 0);
  const adjustment = mod.amount * scaledCount;
  const origDp = target.filter.dp;
  if (origDp === undefined || typeof origDp !== "object" || !("value" in origDp)) return target;
  const newValue =
    mod.mode === "raiseCeiling" ? (origDp.value as number) + adjustment : (origDp.value as number) - adjustment;
  if (newValue <= 0) return { ...target, filter: { ...target.filter, dp: { ...origDp, value: -1 } } };
  return { ...target, filter: { ...target.filter, dp: { ...origDp, value: newValue } } };
}

/** Select each printed own-stack group before any of the selected cards enter play. */
async function selectOwnStackPlayGroup(ctx: EffectContext, target: Target, reservedIds: ReadonlySet<string>) {
  const matching = ownStackPlayCandidates(ctx, target).filter((card) => !reservedIds.has(card.instanceId));
  const totalPlayCostBudget = target.totalPlayCostBudget;
  const playCostOf = (card: (typeof matching)[number]): number => ctx.game.definitionOf(card).playCost ?? 0;
  if (matching.length === 0) {
    return [];
  }
  const cap = target.count === "all" ? matching.length : Math.min(target.count, matching.length);
  // Named own-stack targets need the same exact-name semantics as loose-card targeting.
  // This matters for BT7-063: its On Play target is up-to by name, while its deletion
  // replacement requires both names when both are present (Q1623).
  const requiredNamesExact = target.requiredNamesExact ?? [];
  const requiredNamesExactUpTo = target.requiredNamesExactUpTo ?? [];
  const namedSelection = (names: string[], requireAll: boolean) => {
    const selected: typeof matching = [];
    const used = new Set<string>();
    let spent = 0;
    for (const requiredName of names) {
      const candidate = matching.find((card) => {
        if (used.has(card.instanceId)) return false;
        const definition = ctx.game.definitionOf({ cardId: card.cardId } as never);
        return (
          hasExactName(definition, requiredName) &&
          (totalPlayCostBudget === undefined || spent + playCostOf(card) <= totalPlayCostBudget)
        );
      });
      if (candidate === undefined) {
        if (requireAll) return [];
        continue;
      }
      used.add(candidate.instanceId);
      selected.push(candidate);
      spent += playCostOf(candidate);
    }
    return selected;
  };
  // A required exact set is all-or-none; an up-to set takes one of each available name.
  // With neither field, preserve the normal mandatory as-many-as-possible selection.
  const selectedNamed =
    requiredNamesExact.length > 0
      ? namedSelection(requiredNamesExact, true)
      : requiredNamesExactUpTo.length > 0
        ? namedSelection(requiredNamesExactUpTo, false)
        : undefined;
  const chosenBeforeBudget =
    selectedNamed !== undefined
      ? selectedNamed.slice(0, cap).map((card) => card.instanceId)
      : matching.length > cap || target.upTo === true
        ? await ctx.ask.selectCards(ctx, {
            candidates: matching.map((card) => card.instanceId),
            min: target.upTo === true ? 0 : cap,
            max: cap,
            ...(totalPlayCostBudget === undefined ? {} : { maxTotalPlayCost: totalPlayCostBudget }),
          })
        : matching.map((card) => card.instanceId);
  const chosenOwn =
    totalPlayCostBudget === undefined
      ? chosenBeforeBudget
      : chosenBeforeBudget.reduce<{ ids: string[]; spent: number }>(
          (result, instanceId) => {
            const card = matching.find((candidate) => candidate.instanceId === instanceId);
            if (card === undefined) return result;
            const cost = playCostOf(card);
            if (result.spent + cost <= totalPlayCostBudget) {
              result.ids.push(instanceId);
              result.spent += cost;
            }
            return result;
          },
          { ids: [], spent: 0 },
        ).ids;
  return chosenOwn
    .map((id) => matching.find((card) => card.instanceId === id))
    .filter((card): card is (typeof matching)[number] => card !== undefined);
}

export async function runPlayAction(ctx: EffectContext, action: Action, scope: ActionScope): Promise<boolean> {
  const { scale } = scope;
  // This selection carries the optional activation itself, including a one-card pool.
  if (action.kind === "PlayWithoutCost" && ctx.selectingOptionalTarget === true) {
    action = { ...action, target: { ...action.target, upTo: true, minimum: 0 } };
  }
  switch (action.kind) {
    case "PlayMultiple": {
      const from = Array.isArray(action.from)
        ? action.from
        : [action.from === "digivolution" ? "digivolutionCards" : action.from];
      const target: Target = { filter: action.filter, count: "all", upTo: true };
      const budget = action.totalCostScaling
        ? action.totalCostScaling.base +
          Math.floor(countMatching(ctx, action.totalCostScaling.filter) / action.totalCostScaling.per) *
            action.totalCostScaling.raise
        : action.totalCost;
      const candidates = playableCandidates(ctx, target, candidateLooseInstances(ctx, target, from)).filter(
        (candidate) => {
          const playCost = ctx.game.definitionOf({ cardId: candidate.cardId } as never).playCost;
          return playCost !== undefined && playCost <= budget;
        },
      );
      if (candidates.length === 0) {
        ctx.lastPlayedPermanentIds = [];
        return false;
      }
      const selected = await ctx.ask.selectCards(ctx, {
        candidates: candidates.map((c) => c.instanceId),
        min: action.optional ? 0 : 1,
        max: candidates.length,
        maxTotalPlayCost: budget,
      });
      const chosen: string[] = [];
      let usedCost = 0;
      for (const instanceId of selected) {
        const cand = candidates.find((c) => c.instanceId === instanceId);
        if (cand === undefined) continue;
        const playCost = ctx.game.definitionOf({ cardId: cand.cardId } as never).playCost;
        if (playCost === undefined || usedCost + playCost > budget) continue;
        chosen.push(instanceId);
        usedCost += playCost;
      }
      if (chosen.length === 0) {
        ctx.lastPlayedPermanentIds = [];
        return false;
      }
      const chosenCards = chosen
        .map((instanceId) => candidates.find((candidate) => candidate.instanceId === instanceId))
        .filter((candidate): candidate is (typeof candidates)[number] => candidate !== undefined);
      const played = await playEffectInstances(ctx, chosenCards, {
        payCost: action.payCost,
        ...(action.suppressOnPlayEffects === true ? { suppressOnPlayEffects: true } : {}),
      });
      ctx.lastPlayedPermanentIds = (played ?? []).map((p) => p.permanentId);
      return false;
    }
    case "PlayWithoutCost": {
      // Bind "the Digimon this effect played" from whichever branch resolves the play, so a later
      // action (e.g. BT16-015's Delete with dp.valueFrom) can reference exactly what was played.
      const bindPlayWithoutCost = (playedPermanentIds = ctx.lastPlayedPermanentIds) => {
        // `sameTarget` continuations (for example, "that Digimon gains Rush")
        // consume the common last-resolved target register. A play action is itself
        // a target-producing action, so preserve the actual permanents it created.
        ctx.lastResolvedPermanentIds = playedPermanentIds ?? [];
        if (action.bindResultAs && playedPermanentIds !== undefined) {
          ctx.boundPlayed ??= new Map();
          ctx.boundPlayed.set(action.bindResultAs, new Set(playedPermanentIds));
        }
      };
      // ＜Delay＞-armed gate: if the action is marked requiresDelayArmed, the source permanent
      // must carry an active Delay keyword grant (armed by a prior GainKeyword(Delay) on an
      // earlier turn). Off-field source → skip. Armed → consume the grant, then proceed.
      if (action.requiresDelayArmed === true) {
        if (ctx.delayArmedConsumed !== true) {
          const self = ctx.source.permanent();
          if (self === undefined) return false;
          const hasDelay = (ctx.fx.grantedKeywords?.(self.permanentId) ?? []).some((g) => g.keyword === "Delay");
          if (!hasDelay) return false;
          ctx.fx.revokeKeyword?.(self.permanentId, "Delay");
        }
      }
      // Empty-breeding gate: a breeding-area play requires the slot empty (single-occupancy
      // rule) — BT18-101 "play [Lucemon: Larva] to your EMPTY breeding area". Honor both the
      // real `breeding: true` flag the card emits and the spec's `requiresEmpty` form.
      if (action.requiresEmpty === "breedingArea" || action.breeding === true) {
        const mine = ctx.source.ownerSeat;
        const breeding = ctx.game.player(mine).breeding;
        if (breeding !== undefined && breeding.topCard !== undefined) return false;
      }
      // A self-reference with an explicit loose-card zone (notably `linked`) scopes the
      // host, it does not mean "play the source card again". The latter is reserved for the
      // targetless/self target forms used by Security and revive clauses.
      const selfPlayTarget =
        action.target?.isSelf ||
        (action.target?.filter?.isSelfRef === true &&
          action.target.filter.zone === undefined &&
          action.from?.includes("digivolutionCards") !== true);
      if (selfPlayTarget) {
        // "Play this card without paying its cost" — from security (the common
        // [Security] form) or from hand.
        const self = ctx.source;
        // Self-play actions bypass the loose-candidate pool below, so enforce the
        // same player-level effect-play prohibition explicitly (Crimson Blaze vs.
        // a Digimon's own Security "play this card" effect).
        if (ctx.fx.isPlayProhibited?.(self.ownerSeat, self.cardId, "play") === true) {
          ctx.lastPlayedPermanentIds = [];
          return false;
        }
        // Lightweight card-module seams may provide only the game state and effect verbs;
        // they do not need to model every player zone just to assert that self-play delegates
        // to the correct primitive. In the production engine `player()` is always present,
        // so this fallback only affects those deliberately narrow contexts.
        const owner = ctx.game.player?.(self.ownerSeat);
        const fromSecurity =
          action.from?.includes("security") === true ||
          (ctx.activeTiming === "Security" &&
            owner?.trash !== undefined &&
            !owner.trash.some((card) => card.instanceId === self.instanceId)) ||
          owner?.security?.some((card) => card.instanceId === self.instanceId) === true;
        if (fromSecurity) {
          if (owner === undefined) {
            const played = await ctx.fx.playFromSecurity(self.instanceId, { payCost: action.payCost });
            ctx.lastPlayedPermanentIds = played === undefined ? [] : [played.permanentId];
          } else {
            const played = await playEffectInstances(ctx, [self], { payCost: action.payCost });
            ctx.lastPlayedPermanentIds = played.map((permanent) => permanent.permanentId);
          }
        } else if (action.from?.includes("trash") === true) {
          // "Play this card FROM THE TRASH ..." (BT2-083's OnDeletion revive, EX7-060's
          // `[Trash][Main]` self-play): the source is a loose trash-resident CardInstance,
          // not a hand card — `playFromHand`'s `locateInHand` cannot find it there (a
          // silent no-op; the trash-activation half of the eighth engine gap). Route
          // through the zone-agnostic `playInstances` instead, which locates a loose
          // instance in ANY zone.
          // A scaled reduction ("with the play cost reduced by the play cost of the returned
          // Tamer" — LM-006) resolves against the live context, which already carries the
          // receipts written while this action's own cost was paid.
          const scaledReduction = paidReduction(ctx, action);
          const played = await playEffectInstances(ctx, [self], {
            payCost: action.payCost,
            ...(action.breeding === true ? { breeding: true } : {}),
            ...(scaledReduction !== undefined ? { costDelta: scaledReduction } : {}),
            ...(action.suppressOnPlayEffects === true ? { suppressOnPlayEffects: true } : {}),
          });
          ctx.lastPlayedPermanentIds = (played ?? []).map((p) => p.permanentId);
        } else {
          // "Play this card with the play cost reduced by N" (EX10-035): fold the reduction into
          // the play verb when paying. A free play (payCost false) ignores reduceCostBy.
          // This is an effect-driven play, not a bare zone move. Route through the
          // generalized play seam so the card's [On Play] window and `whenPlayed`
          // watchers both fire (the same contract used by filtered plays).
          const selfReduction = paidReduction(ctx, action);
          const played = await playEffectInstances(ctx, [self], {
            payCost: action.payCost,
            ...(action.breeding === true ? { breeding: true } : {}),
            ...(selfReduction !== undefined ? { costDelta: selfReduction } : {}),
            ...(action.suppressOnPlayEffects === true ? { suppressOnPlayEffects: true } : {}),
          });
          ctx.lastPlayedPermanentIds = (played ?? []).map((p) => p.permanentId);
        }
        bindPlayWithoutCost();
        return false;
      }
      // "Play N [X] from THIS Digimon's OWN digivolution cards" (BT22-007, KB Q4858-Q4860):
      // source strictly from the SOURCE permanent's stack (not every battle-area permanent's, and
      // valid for a breeding-area source). Play up to `count` matching cards, as many as possible.
      if (action.fromOwnDigivolutionStack) {
        const self = ctx.source.permanent();
        if (self === undefined) return false;
        const chosenCards = [];
        const reservedIds = new Set<string>();
        for (const target of [action.target, ...(action.additionalSimultaneousTargets ?? [])]) {
          const group = await selectOwnStackPlayGroup(ctx, target, reservedIds);
          chosenCards.push(...group);
          for (const card of group) reservedIds.add(card.instanceId);
        }
        const chosenOwn = chosenCards.map((card) => card.instanceId);
        if (chosenOwn.length > 0) {
          const played = await playEffectInstances(ctx, chosenCards, {
            payCost: action.payCost,
            ...(action.playedByDecode === true ? { playedByDecode: true } : {}),
            hostPermanentIds: Object.fromEntries(chosenOwn.map((instanceId) => [instanceId, self.permanentId])),
            ...(action.suspended === true ? { suspended: true } : {}),
            ...(action.suppressOnPlayEffects === true ? { suppressOnPlayEffects: true } : {}),
          });
          ctx.lastPlayedPermanentIds = (played ?? []).map((p) => p.permanentId);
        } else {
          ctx.lastPlayedPermanentIds = [];
        }
        ctx.lastEffectActed = chosenOwn.length > 0;
        bindPlayWithoutCost();
        return false;
      }
      // Filtered "play N [X] from <zones> without paying the cost". Resolve the
      // candidate loose cards by filter across the stated zones (defaulting to the
      // hand), prompt the controller, and play the chosen instances.
      //
      // dpCeilingModifier: raise or lower the dp filter's value ceiling before resolving
      // candidates. The scaled count comes from either a prior Trash action's `trackCount`
      // (`scalingSource`, CAP-E13, BT20-077) or a live board count (`scaling`, EX11-032's
      // "for each suspended Digimon"). If the adjusted ceiling is ≤ 0 the candidate pool is
      // empty and no card can be played.
      const scaledPlayTarget: Target =
        action.scaling !== undefined && typeof action.target.count === "number"
          ? {
              ...action.target,
              count: action.target.count * scaleFactor(ctx, action.scaling),
            }
          : action.target;
      const playTarget = applyPlayDpCeilingModifier(ctx, action, scaledPlayTarget);
      const levelCeilingAdjustedTarget =
        ctx.playLevelCeilingDelta === undefined || ctx.playLevelCeilingDelta === 0
          ? playTarget
          : {
              ...playTarget,
              filter: {
                ...playTarget.filter,
                levelComparison:
                  playTarget.filter.levelComparison?.op === "lte" &&
                  playTarget.filter.levelComparison.value !== undefined
                    ? {
                        ...playTarget.filter.levelComparison,
                        value: playTarget.filter.levelComparison.value + ctx.playLevelCeilingDelta,
                      }
                    : playTarget.filter.levelComparison,
              },
            };
      const scaledCostAdjustedTarget = materializePlayCostLteScaling(ctx, levelCeilingAdjustedTarget);
      // playCostCeiling: dynamically raise the playCostLte ceiling before resolving candidates.
      // Counts cards matching filter.zone/controller across all applicable seats, then computes:
      //   ceiling = base + Math.floor(totalCards / per) * raise
      // and overrides the target filter's playCostLte with the result. (CAP-E16, BT21-079)
      const levelComparison = scaledCostAdjustedTarget.filter.levelComparison;
      const levelScaledTarget = materializeLevelComparisonScaling(
        scaledCostAdjustedTarget,
        levelComparison?.scaling === undefined ? 0 : scaleFactor(ctx, levelComparison.scaling),
      );
      const adjustedTarget = applyDecodeHostScope(action, applyPlayCostCeiling(ctx, action, levelScaledTarget));
      const playCostAdjustedTarget =
        action.ignorePlayCostLimit === true
          ? {
              ...adjustedTarget,
              filter: {
                ...adjustedTarget.filter,
                playCostLte: undefined,
                playCostLteScaling: undefined,
              },
            }
          : adjustedTarget;
      const zones = action.from && action.from.length > 0 ? action.from : DEFAULT_PLAY_ZONES;
      let candidates = playableCandidates(
        ctx,
        playCostAdjustedTarget,
        candidateLooseInstances(ctx, playCostAdjustedTarget, zones),
        action.chooseDualMode,
      );
      if (action.fromTriggerHandTrash === true) {
        const triggeringIds = new Set(ctx.trigger.handTrashedInstanceIds ?? []);
        candidates = candidates.filter((candidate) => triggeringIds.has(candidate.instanceId));
      }
      // Seat-level RestrictPlay: drop candidates the resolving effect's owner is forbidden
      // from playing (the effect is attributed to ctx.source.ownerSeat, so the prohibition on
      // THAT seat applies — Q4676; the source player's own effects are unaffected — Q4675).
      candidates = candidates.filter((c) => !isEffectPlayProhibited(ctx, c));
      if (action.target?.filter?.excludeSameNameAsOwnTamers === true) {
        const ownTamerNames = new Set<string>();
        for (const permanent of ctx.game.player(ctx.source.ownerSeat).battleArea) {
          if (permanent.topCard === undefined) continue;
          const definition = ctx.game.definitionOf(permanent.topCard);
          if (!definition.kinds.includes(CardKind.Tamer)) continue;
          for (const name of effectiveStaticNames(definition)) ownTamerNames.add(name);
        }
        candidates = candidates.filter((candidate) => {
          const names = effectiveStaticNames(ctx.game.definitionOf({ cardId: candidate.cardId } as never));
          return !names.some((name) => ownTamerNames.has(name));
        });
      }
      candidates = candidatesAllowedBySameNameRestriction(ctx, candidates);
      // sameLevelAsAttacker: restrict to cards whose printed level matches the open attacker
      // (EX12-069 "of the same level as the attacking Digimon"). Return no candidates when
      // no attack is open (no subject/attacker id in the trigger).
      if (action.target?.filter?.sameLevelAsAttacker === true) {
        const attackerId = ctx.trigger.subjectPermanentId ?? ctx.trigger.attackerPermanentId;
        const attackerPermanent = attackerId !== undefined ? ctx.game.permanentById(attackerId) : undefined;
        const attackerLevel =
          attackerPermanent?.topCard !== undefined ? ctx.game.definitionOf(attackerPermanent.topCard).level : undefined;
        candidates =
          attackerLevel !== undefined
            ? candidates.filter((c) => ctx.game.definitionOf({ cardId: c.cardId } as never).level === attackerLevel)
            : [];
      }
      // notSameNameAs: "without the same name as cards in the battle area or trash" (EX5 Deva
      // Security effects). Drop any candidate whose card name already appears among the
      // controller's permanents (top cards) and/or trash in the listed zones.
      if (action.notSameNameAs && action.notSameNameAs.length > 0) {
        const seat = ctx.source.ownerSeat;
        const player = ctx.game.player(seat);
        const excludedNames = new Set<string>();
        for (const zone of action.notSameNameAs) {
          if (zone === "battleArea") {
            for (const permanent of player.battleArea) {
              if (permanent.topCard === undefined) continue;
              const n = ctx.game.definitionOf(permanent.topCard).nameEn;
              if (n) excludedNames.add(n);
            }
          } else {
            for (const card of player.trash) {
              const n = ctx.game.definitionOf(card).nameEn;
              if (n) excludedNames.add(n);
            }
          }
        }
        candidates = candidates.filter(
          (c) => !excludedNames.has(ctx.game.definitionOf({ cardId: c.cardId } as never).nameEn),
        );
      }
      const excludedTriggerSubjectName = (action as typeof action & { excludeNameOfTriggerSubject?: boolean })
        .excludeNameOfTriggerSubject
        ? ctx.trigger.subjectPermanentId !== undefined
          ? ctx.game.permanentById(ctx.trigger.subjectPermanentId)?.topCard !== undefined
            ? ctx.game.definitionOf(ctx.game.permanentById(ctx.trigger.subjectPermanentId)!.topCard!).nameEn
            : undefined
          : undefined
        : undefined;
      if (excludedTriggerSubjectName !== undefined) {
        candidates = candidates.filter(
          (c) => ctx.game.definitionOf({ cardId: c.cardId } as never).nameEn !== excludedTriggerSubjectName,
        );
      }
      const costReduction = paidReduction(ctx, action) ?? action.costReduction;
      if (action.payCost === true && ctx.fx.canAffordEffectPlay !== undefined) {
        const affordability: { candidate: (typeof candidates)[number]; play: boolean; use: boolean }[] = [];
        for (const candidate of candidates) {
          const definition = ctx.game.definitionOf({ cardId: candidate.cardId } as never);
          const hasOption = definition.kinds.includes(CardKind.Option);
          const hasPermanent =
            !hasOption && (definition.kinds.includes(CardKind.Digimon) || definition.kinds.includes(CardKind.Tamer));
          const canUseByColor =
            hasOption &&
            ctx.game.optionColorRequirementMet?.(ctx.source.ownerSeat, candidate.instanceId, definition) !== false;
          // Project single-card choices only: simultaneous plays reserve other played cards
          // and cannot use expanders that require playing exactly one Digimon.
          const digiXrosReduction =
            hasPermanent && playCostAdjustedTarget.count === 1
              ? availableEffectPlayDigiXrosReduction(ctx, candidate)
              : 0;
          const basePlayAffordable =
            hasPermanent &&
            (await ctx.fx.canAffordEffectPlay!(candidate.instanceId, {
              costDelta: (costReduction ?? 0) + digiXrosReduction,
              controllerSeat: ctx.source.ownerSeat,
            }));
          const assembly = basePlayAffordable ? undefined : availableEffectPlayAssembly(ctx, candidate);
          const play =
            basePlayAffordable ||
            (hasPermanent &&
              assembly !== undefined &&
              (await ctx.fx.canAffordEffectPlay!(candidate.instanceId, {
                costDelta: (costReduction ?? 0) + assembly.reduction,
                controllerSeat: ctx.source.ownerSeat,
              })));
          const use =
            canUseByColor &&
            (await ctx.fx.canAffordEffectPlay!(candidate.instanceId, {
              costDelta: costReduction,
              useAsOption: true,
              controllerSeat: ctx.source.ownerSeat,
            }));
          affordability.push({ candidate, play, use });
        }
        candidates = affordability
          .filter(({ candidate, play, use }) => {
            const kinds = ctx.game.definitionOf({ cardId: candidate.cardId } as never).kinds;
            return kinds.includes(CardKind.Option) ? use : play;
          })
          .map(({ candidate }) => candidate);
      }
      const visibleZoneIds = zones.every((zone) => zone === "trash" || zone === "hand")
        ? seatsForController(ctx, playCostAdjustedTarget.filter).flatMap((seat) =>
            zones.flatMap((zone) => looseCardsInZone(ctx, seat, zone).map((candidate) => candidate.instanceId)),
          )
        : zones.every((zone) => zone === "digivolutionCards")
          ? [
              playCostAdjustedTarget.filter,
              ...(playCostAdjustedTarget.orFilters ?? []),
              ...(playCostAdjustedTarget.filter.orFilters ?? []),
            ]
              .flatMap((filter) =>
                seatsForController(ctx, filter).flatMap((seat) =>
                  looseCardsInZone(ctx, seat, "digivolutionCards")
                    .filter(({ hostPermanentId }) =>
                      isVisibleStackHost(ctx, playCostAdjustedTarget, filter, hostPermanentId),
                    )
                    .map(({ instanceId }) => instanceId),
                ),
              )
              .filter((instanceId, index, all) => all.indexOf(instanceId) === index)
          : undefined;
      const asker = playCostAdjustedTarget.chooser === "opponent" ? requireOpponentAsk(ctx) : ctx.ask;
      const chosen = await pickLoose(ctx, playCostAdjustedTarget, candidates, undefined, asker, visibleZoneIds);
      if (playCostAdjustedTarget.chooser === "opponent" && action.optional === true) {
        ctx.lastOpponentDeclined = chosen.length === 0;
      }
      if (chosen.length > 0) {
        // Options are USED, not played as permanents. `playInstances` intentionally rejects
        // Option definitions, so routing every PlayWithoutCost target through it silently
        // dropped effects such as BT4-089 using Hell's Gate from hand. Preserve the Option
        // lifecycle here: resolve [Main], move it to trash, and fire whenOptionUsed. The
        // printed cost is still reported to watchers even though this action pays no cost.
        // DUAL cards cannot be played, including by effects. A mixed play/use
        // picker therefore resolves a selected DUAL exclusively as an Option.
        const requestedKinds = action.target?.filter?.kind ?? [];
        const explicitlyUsesOption =
          requestedKinds.includes("Option") && !requestedKinds.includes("Digimon") && !requestedKinds.includes("Tamer");
        const optionIds = chosen.filter((instanceId) => {
          const candidate = candidates.find((c) => c.instanceId === instanceId);
          if (candidate === undefined) return false;
          const kinds = ctx.game.definitionOf({ cardId: candidate.cardId } as never).kinds;
          const hasPermanentSide = kinds.includes(CardKind.Digimon) || kinds.includes(CardKind.Tamer);
          return (
            kinds.includes(CardKind.Option) &&
            (!hasPermanentSide || explicitlyUsesOption || action.chooseDualMode === true)
          );
        });
        for (const optionId of optionIds) {
          const candidate = candidates.find((c) => c.instanceId === optionId);
          const usedCost =
            candidate === undefined ? undefined : ctx.game.definitionOf({ cardId: candidate.cardId } as never).playCost;
          await ctx.fx.useOptionFromHand(ctx, optionId, usedCost, {
            payCost: action.payCost,
            ...(costReduction !== undefined ? { costDelta: costReduction } : {}),
          });
        }
        const permanentIds = chosen.filter((instanceId) => !optionIds.includes(instanceId));
        const permanentCards = permanentIds
          .map((instanceId) => candidates.find((candidate) => candidate.instanceId === instanceId))
          .filter((candidate): candidate is (typeof candidates)[number] => candidate !== undefined);
        const hostPermanentIds = Object.fromEntries(
          permanentIds
            .map((instanceId) => {
              const hostPermanentId = candidates.find(
                (candidate) => candidate.instanceId === instanceId,
              )?.hostPermanentId;
              return hostPermanentId === undefined ? undefined : [instanceId, hostPermanentId];
            })
            .filter((entry): entry is [string, string] => entry !== undefined),
        );
        const played =
          permanentIds.length > 0
            ? await playEffectInstances(ctx, permanentCards, {
                payCost: action.payCost,
                breeding: action.breeding,
                suspended: action.suspended,
                effectSourceCardId: ctx.source.cardId,
                ...(action.playedByDecode === true ? { playedByDecode: true } : {}),
                ...(costReduction !== undefined ? { costDelta: costReduction } : {}),
                ...((action as typeof action & { costOverride?: number }).costOverride !== undefined
                  ? { costOverride: (action as typeof action & { costOverride?: number }).costOverride }
                  : {}),
                ...(action.suppressOnPlayEffects === true ? { suppressOnPlayEffects: true } : {}),
                hostPermanentIds,
              })
            : [];
        const playedPermanentIds = (played ?? []).map((p) => p.permanentId);
        ctx.lastPlayedPermanentIds = playedPermanentIds;
        bindPlayWithoutCost(playedPermanentIds);
      } else {
        ctx.lastPlayedPermanentIds = [];
      }
      // Bind the branch-acted result so an "if you did" tail (BT16-094 OR-modal) can gate.
      ctx.lastEffectActed = chosen.length > 0;
      bindPlayWithoutCost();
      return false;
    }
    case "PlayFromZone": {
      // CAP-A10 (BT19-099): play a card from specified zone(s) with an optional cost reduction.
      // Semantics: gather candidates from `from` zones, post-filter by relativeToLeavingDigimon
      // when present, prompt the controller, then play the chosen instance with cost reduced by
      // `costReduction` (floored at 0). `payCost` defaults to true; false means free play.
      const zones = action.from && action.from.length > 0 ? action.from : DEFAULT_PLAY_ZONES;
      let pfzCandidates = playableCandidates(ctx, action.target, candidateLooseInstances(ctx, action.target, zones));

      // relativeToLeavingDigimon: the target's printed playCost must equal the triggering
      // leaving Digimon's playCost + N (BT19-099 ＜Delay＞ body, KB Q3175).
      // The leaving Digimon is identified via ctx.trigger.subjectPermanentId (the whenLeavesPlay
      // event subject). Because the permanent may have already left the field, its playCost is
      // read from the definition via its last-known cardId stored on the trigger.
      const playCostFilter = action.target?.filter?.playCost;
      if (
        playCostFilter !== null &&
        typeof playCostFilter === "object" &&
        "relativeToLeavingDigimon" in playCostFilter
      ) {
        // Leave/deletion events resolve AFTER the permanent has left the battle area, so the
        // live board usually no longer holds it (see subTrigger.ts `deletionSourceFilterGate`,
        // which reads the same removal snapshot). Try the live permanent first (other event
        // seams still fire pre-removal), then fall back to the snapshot top-card id.
        const leavingId = ctx.trigger.deletedPermanentId ?? ctx.trigger.subjectPermanentId;
        const leavingPerm = leavingId !== undefined ? ctx.game.permanentById(leavingId) : undefined;
        const snapshotCardId =
          ctx.trigger.deletedPermanentSnapshots?.find((snapshot) => snapshot.permanentId === leavingId)?.topCardId ??
          ctx.trigger.deletedTopCardId;
        const leavingCardId = leavingPerm?.topCard?.cardId ?? snapshotCardId;
        const leavingCost =
          leavingCardId === undefined
            ? undefined
            : (ctx.game.definitionOf({ cardId: leavingCardId } as never).playCost ?? 0);
        if (leavingCost === undefined) {
          // No triggering Digimon in context — the condition can't be evaluated; skip play.
          ctx.lastEffectActed = false;
          return false;
        }
        const targetCost = leavingCost + playCostFilter.relativeToLeavingDigimon;
        pfzCandidates = pfzCandidates.filter(
          (c) => (ctx.game.definitionOf({ cardId: c.cardId } as never).playCost ?? 0) === targetCost,
        );
      }

      const payCost = action.payCost !== false; // true by default
      // Static reduction plus an optional per-unit dynamic reduction scoped to THIS play
      // ("reduce this effect's paid play cost by 1 for each face-up security card", EX11-034).
      const scaledReduction =
        action.costReductionScaling !== undefined ? scaleFactor(ctx, action.costReductionScaling) : 0;
      const costDelta = payCost ? (action.costReduction ?? 0) + scaledReduction : 0;
      const pfzChosen = await pickLoose(ctx, action.target, pfzCandidates);
      if (pfzChosen.length > 0) {
        const chosenCards = pfzChosen
          .map((instanceId) => pfzCandidates.find((candidate) => candidate.instanceId === instanceId))
          .filter((candidate): candidate is (typeof pfzCandidates)[number] => candidate !== undefined);
        const played = await playEffectInstances(
          ctx,
          chosenCards,
          {
            payCost,
            ...(costDelta > 0 ? { costDelta } : {}),
            ...(action.suppressOnPlayEffects === true ? { suppressOnPlayEffects: true } : {}),
          },
          {
            ...(action.digiXrosMaterialsFrom !== undefined ? { extraMaterialZones: action.digiXrosMaterialsFrom } : {}),
            ...(action.digiXrosSourceMaterialName !== undefined
              ? {
                  sourceMaterial: {
                    instanceId: ctx.source.instanceId,
                    nameEn: action.digiXrosSourceMaterialName,
                  },
                }
              : {}),
          },
        );
        ctx.lastPlayedPermanentIds = (played ?? []).map((p) => p.permanentId);
        if (action.bindResultAs) {
          if (!ctx.boundPlayed) (ctx as { boundPlayed: Map<string, Set<string>> }).boundPlayed = new Map();
          ctx.boundPlayed!.set(action.bindResultAs, new Set(ctx.lastPlayedPermanentIds));
        }
      } else {
        ctx.lastPlayedPermanentIds = [];
        if (action.bindResultAs) {
          if (!ctx.boundPlayed) (ctx as { boundPlayed: Map<string, Set<string>> }).boundPlayed = new Map();
          ctx.boundPlayed!.set(action.bindResultAs, new Set());
        }
      }
      ctx.lastEffectActed = pfzChosen.length > 0;
      return false;
    }
    case "PlayToken": {
      // Accept both the `tokens[]`/`count` and the singular `token`/`amount` field conventions —
      // a card written with the singular form was otherwise silently inert (EX11-012, BT21-029).
      const tokenNames = action.tokens ?? (action.token !== undefined ? [action.token] : []);
      const rawCount = action.count ?? action.amount ?? 1;
      const count = scale === undefined ? rawCount : rawCount * scale;
      // `placedAs: "opponentDigimon"` places the token under the OPPONENT's control even though this
      // effect's controller activates it (KB Q5800). Otherwise it enters under the source's seat.
      const placementSeat =
        action.placedAs === "opponentDigimon" ? ctx.game.opponentOf(ctx.source.ownerSeat) : ctx.source.ownerSeat;
      const playedTokenIds: string[] = [];
      for (let i = 0; i < count; i++) {
        // A token already in play is a Digimon with that name (Q1033), so an effect carrying
        // `cannotPlaySameNameAsOwnDigimon` cannot create one whose name is already on the field
        // (BT23-013, issue #4894). Re-checked each pass: a token this action just played is
        // itself one of your Digimon for the next pass.
        for (const tokenRef of playableTokenRefs(ctx, tokenNames)) {
          // The catalog sometimes carries the complete synthetic-token descriptor rather
          // than the registry alias. Resolve the printed descriptor to the shared token
          // registry while preserving the card's authored stats for future token metadata.
          const registryName = tokenRegistryName(tokenRef);
          const token = await ctx.fx.playToken(placementSeat, registryName, {
            payCost: action.payCost ?? false,
            suspended: action.suspended ?? false,
            ...(typeof tokenRef === "string" || tokenRef.keywords === undefined
              ? {}
              : {
                  keywords: tokenRef.keywords.map((keyword) => ({
                    keyword: keyword.keyword,
                    amount: keyword.amount,
                    specifiers: keyword.colors,
                  })),
                }),
          });
          if (token !== undefined) playedTokenIds.push(token.permanentId);
        }
      }
      // "delete that token" (P-165): bind the tokens this action produced so a following
      // action's `filter.boundRef` cannot reach an identically named token already in play.
      if (action.bindResultAs !== undefined) {
        ctx.boundPlayed ??= new Map();
        ctx.boundPlayed.set(action.bindResultAs, new Set(playedTokenIds));
      }
      return false;
    }
    case "PlayPerLevel": {
      await runPlayPerLevel(ctx, action);
      return false;
    }
    default:
      // Unreachable: runAction routes only this family's kinds here, and its own default
      // reports anything the Action union does not cover.
      return false;
  }
}
