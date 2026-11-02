// Resolving a Target into battle-area permanent ids.

import { requireOpponentAsk } from "../../../decisions/decisionApi.js";
import { hasPlayCost } from "../../../cards/cardData.js";
import type { EffectContext } from "../../EffectContext.js";
import { effectProvenanceKinds } from "../../effectProvenance.js";
import { evaluateCondition } from "../conditions.js";
import { isPermanentUnaffectable, permanentMatchesFilter, seatsForController } from "../matching/permanent.js";
import { selfTargetPermanent } from "../matching/selfTarget.js";
import { scaleFactor } from "../scaling.js";
import type { Condition, Filter, Permanent, Seat, Target } from "@aegis/shared";

/**
 * Candidate battle-area permanents matching a target's filter.
 *
 * `includeUnaffectable` (default false, every existing call site): when true, a
 * permanent that is immune to this source's effects is still INCLUDED in the pool —
 * Comprehensive Rules §15-15-5-3: "'Isn't affected by effects' cards can still be
 * chosen for effects ... but it isn't affected by that effect." Only
 * `resolvePermanentTargets` (the target-CHOICE seam) sets this; it separately filters
 * immune permanents back out of the ids it actually returns for the effect to act on,
 * so the immune permanent is choosable but never affected.
 */
export function candidatePermanents(
  ctx: EffectContext,
  target: Target,
  opts?: { includeUnaffectable?: boolean; allowPendingRotationHost?: boolean },
): Permanent[] {
  const source = ctx.source;
  // A target that IS a prior binding ("place [the chosen Digimon] under ..."): resolve to the
  // stored permanent, no fresh selection. An unbound/gone ref yields nothing.
  if (target.fromSelectionRef !== undefined) {
    const boundIds = new Set(ctx.boundPlayed?.get(target.fromSelectionRef) ?? []);
    const scalarId = ctx.selections?.get(target.fromSelectionRef);
    if (scalarId !== undefined) boundIds.add(scalarId);
    const permanents: Permanent[] = [];
    for (const boundId of boundIds) {
      const permanent = ctx.game.permanentById(boundId);
      if (permanent !== undefined) permanents.push(permanent);
    }
    return permanents;
  }
  // useTriggerSource: resolve to the permanent(s) that triggered the enclosing replacement
  // (the leaving/affected Digimon) rather than scanning the board. A count:"all" target in a
  // simultaneous leave event must preserve the complete deletedPermanentIds set (BT19-053,
  // KB Q3108); the singular fallback remains important for ordinary replacement bodies and
  // synthetic contexts that only provide deletedPermanentId.
  if (target.filter?.useTriggerSource === true) {
    const triggerIds =
      target.count === "all" && (ctx.trigger.deletedPermanentIds?.length ?? 0) > 1
        ? ctx.trigger.deletedPermanentIds!
        : [ctx.trigger.deletedPermanentId ?? ctx.trigger.subjectPermanentId];
    const triggerFilter: Filter = { ...target.filter };
    delete triggerFilter.useTriggerSource;
    return triggerIds
      .filter((id): id is string => id !== undefined)
      .map((id) => ctx.game.permanentById(id))
      .filter((permanent): permanent is Permanent => permanent !== undefined)
      .filter((permanent) => permanentMatchesFilter(ctx, permanent, triggerFilter, source));
  }
  // `filter` is required by the IR type, but the JSON is written by several tools (the
  // prose compiler plus a number of patch scripts) and nothing validates their output
  // before the interpreter consumes it. A target that arrives without one must resolve to
  // no candidates, never throw: a TypeError here aborts the whole intent, so one malformed
  // action silently disables every later action in the same effect.
  if ((target.isSelf || target.filter?.isSelfRef) && (target.orFilters?.length ?? 0) === 0) {
    const self = selfTargetPermanent(ctx, source);
    if (self === undefined) return [];
    // Real self targets still have to satisfy their printed qualifiers (for example,
    // "this blue Digimon with [TS]"). Some lightweight dispatch seams intentionally
    // omit topCard; retain identity-only behavior for those incomplete fakes.
    return self.topCard === undefined ||
      target.filter === undefined ||
      permanentMatchesFilter(ctx, self, target.filter, source)
      ? [self]
      : [];
  }
  if (target.filter === undefined) return [];
  // A bound result is already an exact set of produced permanents. Resolve those ids
  // directly before scanning zones so downstream effects (e.g. BT13-112's Rush) cannot
  // lose a produced permanent to an unrelated board-enumeration filter.
  if (target.filter.boundRef !== undefined) {
    const bound = ctx.boundPlayed?.get(target.filter.boundRef);
    const selected = ctx.selections?.get(target.filter.boundRef);
    if (bound === undefined && selected === undefined) return [];
    const boundPermanents: Permanent[] = [];
    const permanentIds = new Set(bound ?? []);
    if (selected !== undefined) permanentIds.add(selected);
    for (const permanentId of permanentIds) {
      const permanent = ctx.game.permanentById(permanentId);
      if (permanent !== undefined && permanentMatchesFilter(ctx, permanent, target.filter, source)) {
        boundPermanents.push(permanent);
      }
    }
    return boundPermanents;
  }
  // A target may carry `orFilters`: a candidate qualifies if it matches the primary `filter`
  // OR any alternative ("play 1 [X] or 1 [Y]", BT17-074). Each alternative may scope a different
  // controller, so enumerate seats across the whole union.
  const allFilters = [target.filter, ...(target.orFilters ?? [])];
  const seatSet = new Set<Seat>();
  for (const f of allFilters) for (const s of seatsForController(ctx, f)) seatSet.add(s);
  // Determine which source-kind-qualified immunity grants can exclude this target: the
  // immuneToOpponentOptionEffects grant (beAffected+fromSourceKind:Option, BT19-089) and the
  // immuneToOpponentDigimonEffects grant (beAffected+fromSourceKind:Digimon, BT16-063 "isn't
  // affected by the effects of your opponent's Digimon"). Both are stored identically on the
  // continuous ledger and consulted the same way — qualify by whichever kind(s) the source card
  // actually declares.
  const sourceKinds = ctx.effectSourceKinds ?? effectProvenanceKinds(ctx);
  const relevantSourceKinds =
    ctx.fx.isBeAffectedBySourceKind !== undefined ? sourceKinds.filter((k) => k === "Option" || k === "Digimon") : [];
  const result: Permanent[] = [];
  const allowsZone = (filter: Filter, zone: "battleArea" | "breeding"): boolean => {
    if (filter.zone !== undefined) {
      const zones = Array.isArray(filter.zone) ? filter.zone : [filter.zone];
      return zones.includes(zone);
    }
    if (filter.or !== undefined && filter.or.length > 0) return filter.or.some((branch) => allowsZone(branch, zone));
    return zone === "battleArea";
  };
  const isBreedingFilter = (filter: Filter): boolean => allowsZone(filter, "breeding");
  const isBattleAreaFilter = (filter: Filter): boolean => allowsZone(filter, "battleArea");
  for (const seat of seatSet) {
    const p = ctx.game.player(seat);
    if (allFilters.some(isBreedingFilter) && p.breeding !== undefined) {
      if (allFilters.some((f) => isBreedingFilter(f) && permanentMatchesFilter(ctx, p.breeding!, f, source))) {
        result.push(p.breeding);
      }
    }
    for (const permanent of p.battleArea) {
      if (permanent.topCard && ctx.reservedCostInstanceIds?.has(permanent.topCard.instanceId)) continue;
      const allowPendingRotationHost =
        opts?.allowPendingRotationHost === true && permanent.permanentId === ctx.pendingRotationHostPermanentId;
      if (
        !allFilters.some(
          (f) =>
            isBattleAreaFilter(f) && permanentMatchesFilter(ctx, permanent, f, source, { allowPendingRotationHost }),
        )
      )
        continue;
      if (!opts?.includeUnaffectable && isPermanentUnaffectable(ctx, source, permanent, relevantSourceKinds)) continue;
      result.push(permanent);
    }
  }
  return narrowToSuperlative(ctx, result, target.filter.superlative);
}

/**
 * SERVER-SIDE superlative play-cost narrowing (threat T-08-01): keep only the minimum
 * (`lowestPlayCost`) or maximum (`highestPlayCost`) printed-play-cost permanents in the eligible
 * pool (ties: all extrema). Candidates with no play cost are excluded; synthetic definitions use
 * a non-positive sentinel for that absence, so only positive printed costs are comparable. If NONE
 * has a play cost the set is empty (KB BT23-024 Q6025/Q6026 / EX11-011 Q5796). Because target resolution
 * (and thus client-intent validation in resolvePermanentTargets) runs over this narrowed pool, a
 * client naming a permanent outside the superlative set is rejected.
 */
function narrowToSuperlative(
  ctx: EffectContext,
  pool: Permanent[],
  superlative:
    | "highestPlayCost"
    | "lowestPlayCost"
    | "highestDP"
    | "lowestDP"
    | "highestLevel"
    | "lowestLevel"
    | "highestDigivolutionCards"
    | "lowestDigivolutionCards"
    | undefined,
): Permanent[] {
  if (superlative === undefined || pool.length === 0) return pool;

  // Digivolution-card count superlatives: compare the number of cards under each
  // candidate's top card. Ties keep every extremum, matching other superlatives.
  if (superlative === "highestDigivolutionCards" || superlative === "lowestDigivolutionCards") {
    const extremum =
      superlative === "lowestDigivolutionCards"
        ? Math.min(...pool.map((permanent) => permanent.stack.length))
        : Math.max(...pool.map((permanent) => permanent.stack.length));
    return pool.filter((permanent) => permanent.stack.length === extremum);
  }

  // Level superlatives: compare printed Digimon level (documented behavior IsMinLevel/IsMaxLevel over
  // permanent.Level, scoped to permanents that HasLevel — Tamers/Options/0-level cards are
  // excluded; ties keep every extremum, per IsMinLevel `permanent.Level == Levels.Min()`).
  if (superlative === "highestLevel" || superlative === "lowestLevel") {
    const withLevel: { permanent: Permanent; level: number }[] = [];
    for (const permanent of pool) {
      if (permanent.topCard === undefined) continue;
      const level = ctx.game.definitionOf(permanent.topCard).level;
      if (level === undefined || level <= 0) continue;
      withLevel.push({ permanent, level });
    }
    if (withLevel.length === 0) return [];
    const extremum =
      superlative === "lowestLevel"
        ? Math.min(...withLevel.map((e) => e.level))
        : Math.max(...withLevel.map((e) => e.level));
    return withLevel.filter((e) => e.level === extremum).map((e) => e.permanent);
  }

  if (superlative === "highestDP" || superlative === "lowestDP") {
    const withDp: { permanent: Permanent; dp: number }[] = [];
    for (const permanent of pool) {
      // DP must be defined and positive to be comparable (Tamers/Options have 0/undefined DP)
      if (permanent.currentDP === undefined || permanent.currentDP <= 0) continue;
      withDp.push({ permanent, dp: permanent.currentDP });
    }
    if (withDp.length === 0) return [];
    const extremum =
      superlative === "lowestDP" ? Math.min(...withDp.map((e) => e.dp)) : Math.max(...withDp.map((e) => e.dp));
    return withDp.filter((e) => e.dp === extremum).map((e) => e.permanent);
  }

  // Play cost superlatives (existing behavior)
  const withCost: { permanent: Permanent; cost: number }[] = [];
  for (const permanent of pool) {
    if (permanent.topCard === undefined) continue;
    const definition = ctx.game.definitionOf(permanent.topCard);
    if (!hasPlayCost(definition)) continue;
    const cost = definition.playCost;
    if (cost === undefined || cost <= 0) continue;
    withCost.push({ permanent, cost });
  }
  if (withCost.length === 0) return [];
  const extremum =
    superlative === "lowestPlayCost"
      ? Math.min(...withCost.map((e) => e.cost))
      : Math.max(...withCost.map((e) => e.cost));
  return withCost.filter((e) => e.cost === extremum).map((e) => e.permanent);
}

/**
 * Raise a deletion target's printed numeric DP cap by the controller's active
 * DP-deletion-maximum bonus (the consumer side of the subsystem; producers are
 * `DeletionMaxDpModifier`). Per KB Q2721/Q2722 this applies ONLY to a printed numeric
 * `<= N` cap, never a DP-relative threshold (`relativeToSource`/`relativeTo`). A zero
 * bonus (the common case) returns the target unchanged.
 */
export function raiseDeletionDpCap(ctx: EffectContext, target: Target): Target {
  // `filter` is required by the IR type but is not validated before the interpreter sees it
  // (see candidatePermanents' note); a target that arrives without one has no cap to raise.
  const dp = target.filter?.dp;
  if (!dp || dp.op !== "lte" || dp.value === undefined || dp.relativeToSource) return target;
  const bonus = ctx.fx.deletionMaxDpBonus?.(ctx.source.ownerSeat, ctx.source.permanent()?.permanentId) ?? 0;
  if (bonus === 0) return target;
  return { ...target, filter: { ...target.filter, dp: { ...dp, value: dp.value + bonus } } };
}

/**
 * Resolve "choose any number ... whose total DP adds up to N or less" targets.
 *
 * `Target.totalDpCap` predates the dedicated `DeleteByDPBudget` action, but several
 * live card modules still emit it (EX2-011, ST7-12, BT9-094, BT12-014). Treat it as
 * the same aggregate DP-deletion family: the generic deletion-maximum modifier
 * raises the budget (EX2-011 KB Q3296), while a relative DP threshold is irrelevant.
 * The selection is submitted as one aggregate choice and revalidated as a whole. A
 * hostile over-budget response resolves to no targets; it is never reinterpreted as
 * a smaller legal subset chosen on the player's behalf.
 */
export async function resolveTotalDpCapTargets(ctx: EffectContext, target: Target): Promise<string[]> {
  // "whose total DP adds up to equal or less than THIS DIGIMON's DP" (LM-021): the budget is the
  // source's LIVE DP, so a DP buff or reduction moves it. `totalDpCap` remains the fallback for
  // a source that is not a battle-area permanent when the effect resolves.
  const sourceDp = target.totalDpCapFromSourceDp === true ? ctx.source.permanent()?.currentDP : undefined;
  const baseBudget = sourceDp ?? target.totalDpCap;
  if (baseBudget === undefined) return [];
  const sourcePermanentId = ctx.source.permanent()?.permanentId;
  // Q3295: a source-relative budget is not a numeric maximum, so generic
  // DP-deletion-ceiling modifiers must not raise it.
  const modifier =
    target.totalDpCapFromSourceDp === true
      ? 0
      : (ctx.fx.deletionMaxDpBonus?.(ctx.source.ownerSeat, sourcePermanentId) ?? 0);
  const budget = baseBudget + modifier;
  const candidates = candidatePermanents(ctx, target, { includeUnaffectable: true })
    .map((permanent) => ({ permanentId: permanent.permanentId, dp: permanent.currentDP }))
    .filter(({ dp }) => dp > 0 && dp <= budget)
    .sort((left, right) => left.dp - right.dp || left.permanentId.localeCompare(right.permanentId));
  if (candidates.length === 0) {
    ctx.lastResolvedPermanentIds = [];
    return [];
  }

  const selected = await ctx.ask.chooseTargets(ctx, {
    candidates: candidates.map(({ permanentId }) => permanentId),
    min: target.upTo === true ? 0 : 1,
    max: candidates.length,
    maxTotalDP: budget,
  });
  const selectedCandidates = selected
    .map((id) => candidates.find(({ permanentId }) => permanentId === id))
    .filter((candidate): candidate is { permanentId: string; dp: number } => candidate !== undefined);
  const totalDp = selectedCandidates.reduce((sum, candidate) => sum + candidate.dp, 0);
  if (selectedCandidates.length === 0 || totalDp > budget) {
    ctx.lastResolvedPermanentIds = [];
    return [];
  }

  const affectable = filterAffectable(
    ctx,
    selectedCandidates.map(({ permanentId }) => permanentId),
  );
  if (target.minimum !== undefined && affectable.length < target.minimum) return [];
  ctx.lastResolvedPermanentIds = affectable;
  return affectable;
}

/** Resolve an optional set of permanents whose printed play costs fit one aggregate budget. */
export async function resolveTotalPlayCostBudgetTargets(ctx: EffectContext, target: Target): Promise<string[]> {
  const budget = target.totalPlayCostBudget;
  if (budget === undefined) return [];
  const candidates = candidatePermanents(ctx, target, { includeUnaffectable: true })
    .filter((permanent) => permanent.topCard !== undefined && hasPlayCost(ctx.game.definitionOf(permanent.topCard)))
    .map((permanent) => ({
      permanentId: permanent.permanentId,
      cost: permanent.topCard === undefined ? undefined : (ctx.game.definitionOf(permanent.topCard).playCost ?? 0),
    }))
    .filter(
      (candidate): candidate is { permanentId: string; cost: number } =>
        candidate.cost !== undefined && candidate.cost <= budget,
    )
    .sort((left, right) => left.cost - right.cost || left.permanentId.localeCompare(right.permanentId));
  if (candidates.length === 0) {
    ctx.lastResolvedPermanentIds = [];
    return [];
  }
  const max =
    target.count === "all" ? candidates.length : Math.min(effectiveTargetCount(ctx, target), candidates.length);
  const selected = await ctx.ask.chooseTargets(ctx, {
    candidates: candidates.map(({ permanentId }) => permanentId),
    min: 0,
    max,
    maxTotalPlayCost: budget,
  });
  const totalCost = selected.reduce(
    (sum, id) => sum + (candidates.find(({ permanentId }) => permanentId === id)?.cost ?? 0),
    0,
  );
  if (totalCost > budget) {
    ctx.lastResolvedPermanentIds = [];
    return [];
  }
  const affectable = filterAffectable(ctx, selected);
  ctx.lastResolvedPermanentIds = affectable;
  return affectable;
}

/**
 * Carve the survivor(s) `target.except` spares out of a `count: "all"` mass-delete
 * ("delete all of your opponent's Digimon except 1" — BT20-102, EX11-046). `selector`
 * narrows the except pool via the same superlative machinery `Filter.superlative`
 * already uses (`"highestPlayCost"` ties into `narrowToSuperlative`'s existing
 * no-play-cost-candidates-means-empty-pool rule, KB BT23-024 Q6025/Q6026 / EX11-046
 * Q5895); `"any"` leaves the pool unnarrowed. Interactive when the narrowed pool has
 * more members than `except.count` — mirrors the printed "Choose 1 ..." on both cards.
 * `chooser:"opponent"` routes the survivor decision to the defending player (EX3-063:
 * "your opponent chooses 1 of their Digimon"). Without it, the effect controller chooses.
 */
export async function resolveExceptSurvivors(ctx: EffectContext, target: Target): Promise<string[]> {
  const except = target.except;
  if (except === undefined) return [];
  const superlative = except.selector === "highestPlayCost" ? ("highestPlayCost" as const) : undefined;
  const filter: Filter = { ...except.filter, superlative };
  return resolvePermanentTargets(ctx, {
    filter,
    count: except.count,
    ...(except.chooser !== undefined ? { chooser: except.chooser } : {}),
  });
}

/**
 * Resolve a target to concrete permanentIds, prompting the controller to choose
 * when there are more candidates than the count and the choice is non-trivial.
 * Returns [] when nothing matches.
 */
export async function resolvePermanentTargets(
  ctx: EffectContext,
  target: Target,
  opts?: {
    /**
     * Extra per-candidate legality the filter alone cannot express, applied BEFORE the
     * prompt so the controller is never offered a pick the verb would then reject
     * server-side (e.g. a digivolve base with no legal card to digivolve into).
     */
    eligible?: (permanentId: string) => boolean;
    /** Keep an immune chosen permanent in the result when the action grants an effect that
     * is checked only when its later trigger activates (Q7060-Q7066). */
    preserveUnaffectableSelection?: boolean;
    allowPendingRotationHost?: boolean;
    /** Let an otherwise fixed-count selection answer an optional processing condition with zero picks. */
    allowDecline?: boolean;
    promptKey?: "digivolveHost";
  },
): Promise<string[]> {
  // SourceRef: resolve to the permanent that triggered this SubTrigger event.
  // Falls back to attackerPermanentId so that "trash its bottom N digivolution cards"
  // inside a whenOpponentAttacks watcher correctly targets the attacking Digimon
  // (whenOpponentAttacks fires with attackerPermanentId, not subjectPermanentId).
  if (!target) return [];
  const budgetSelectionRef = target.totalPlayCostBudgetFromSelectionRef;
  if (budgetSelectionRef !== undefined) {
    const selectedId = ctx.selections?.get(budgetSelectionRef);
    const selected = selectedId === undefined ? undefined : ctx.game.permanentById(selectedId);
    if (selected?.topCard === undefined || !hasPlayCost(ctx.game.definitionOf(selected.topCard))) return [];
    const budget = selected?.topCard === undefined ? undefined : ctx.game.definitionOf(selected.topCard).playCost;
    if (budget === undefined) return [];
    const budgetTarget = { ...target } as Target & { totalPlayCostBudgetFromSelectionRef?: string };
    delete budgetTarget.totalPlayCostBudgetFromSelectionRef;
    budgetTarget.totalPlayCostBudget = budget;
    return resolveTotalPlayCostBudgetTargets(ctx, budgetTarget);
  }
  if (target.totalPlayCostBudget !== undefined) return resolveTotalPlayCostBudgetTargets(ctx, target);
  // sameTarget: reuse the permanent(s) chosen by the immediately preceding action
  // rather than prompting again ("1 of your Digimon gains X … that Digimon also gains Y").
  if (target.sameTarget) return ctx.lastResolvedPermanentIds ?? [];
  if (target.sourceRef === "triggerSubject") {
    const subjectIds = ctx.trigger.subjectPermanentIds;
    if (subjectIds !== undefined && subjectIds.length > 1) {
      const allowed = new Set(subjectIds);
      const subjectTarget: Target = { ...target, sourceRef: undefined };
      const visibleCandidates = candidatePermanents(ctx, subjectTarget, { includeUnaffectable: true }).filter(
        (permanent) => allowed.has(permanent.permanentId),
      );
      const wanted = effectiveTargetCount(ctx, subjectTarget);
      const max = Math.min(wanted, visibleCandidates.length);
      if (max === 0) return [];
      const chosen =
        visibleCandidates.length > max
          ? await ctx.ask.chooseTargets(ctx, {
              candidates: visibleCandidates.map((permanent) => permanent.permanentId),
              min: max,
              max,
            })
          : visibleCandidates.map((permanent) => permanent.permanentId);
      const result = filterAffectable(ctx, chosen);
      ctx.lastResolvedPermanentIds = result;
      return result;
    }
    // Some board-state SubTrigger buses carry their subject under an event-specific field
    // rather than the generic subjectPermanentId (suspension/unsuspension are the canonical
    // examples). A sourceRef:"triggerSubject" action still means that same event subject, so
    // preserve it through target resolution instead of silently fizzing after the watcher
    // matched. This is especially important for whenUnsuspended De-Digivolve effects.
    const id =
      ctx.trigger.subjectPermanentId ??
      ctx.trigger.subjectPermanentIds?.[0] ??
      ctx.trigger.unsuspendedPermanentId ??
      ctx.trigger.suspendedPermanentId ??
      ctx.trigger.deletedPermanentId ??
      ctx.trigger.attackerPermanentId;
    if (id) {
      ctx.lastResolvedPermanentIds = [id];
      return [id];
    }
    return [];
  }
  if (target.sourceRef === "triggerDefender") {
    const id = ctx.trigger.defenderPermanentId ?? ctx.trigger.targetPermanentId;
    if (id) return [id];
  }
  if (target.sourceRef === "battleOpponent") {
    const opponentId = ctx.trigger.battleOpponentPermanentIdByInstanceId?.[ctx.source.instanceId];
    if (opponentId) return [opponentId];
    return [];
  }
  // §15-15-5-3: a permanent immune to this source's effects is still a legal,
  // CHOOSABLE candidate — it simply isn't affected once selected. Gather the pool
  // inclusively so it can be offered/counted, then strip immune ids from whatever this
  // function actually returns (every branch below), so the effect never acts on one.
  const eligible = opts?.eligible;
  const finalize = (ids: readonly string[]): string[] =>
    opts?.preserveUnaffectableSelection === true ? [...ids] : filterAffectable(ctx, ids);
  const visibleCandidates = candidatePermanents(ctx, target, {
    includeUnaffectable: true,
    allowPendingRotationHost: opts?.allowPendingRotationHost,
  });
  const candidates =
    eligible === undefined ? visibleCandidates : visibleCandidates.filter((p) => eligible(p.permanentId));
  if (candidates.length === 0) {
    ctx.lastResolvedPermanentIds = [];
    return [];
  }
  if (target.count === "all") {
    const all = finalize(candidates.map((p) => p.permanentId));
    ctx.lastResolvedPermanentIds = all;
    return all;
  }
  if (
    ((target.isSelf || target.filter?.isSelfRef) && (target.orFilters?.length ?? 0) === 0) ||
    target.fromSelectionRef !== undefined
  ) {
    const result = finalize(candidates.map((p) => p.permanentId));
    ctx.lastResolvedPermanentIds = result;
    return result;
  }

  const want = effectiveTargetCount(ctx, target);
  // §15-15-5-3: with `allowUnaffectableChoice` the player still makes the choice when an immune
  // permanent is in the pool, even though every branch below strips it from the result.
  const holdsUnaffectableCandidate =
    target.allowUnaffectableChoice === true &&
    filterAffectable(
      ctx,
      candidates.map((p) => p.permanentId),
    ).length < candidates.length;
  if (
    candidates.length <= want &&
    ctx.optionalActivationCancellation?.available !== true &&
    !target.upTo &&
    opts?.allowDecline !== true &&
    ctx.payingDeclinableCost !== true &&
    !(ctx.pickingAcceptedOptional === true && ctx.presetOptionalAnswer === true) &&
    !holdsUnaffectableCandidate &&
    (target as Target & { forceSelection?: boolean }).forceSelection !== true
  ) {
    const result = finalize(candidates.map((p) => p.permanentId));
    ctx.lastResolvedPermanentIds = result;
    return result;
  }
  // Choice required: ask the printed chooser to pick (min = want unless "up to"). The FULL
  // (immune-inclusive) pool is offered so an immune permanent can be chosen.
  const ids = candidates.map((p) => p.permanentId);
  let visibleIds = visibleCandidates.map((p) => p.permanentId);
  if (target.filter?.suspended !== undefined) {
    const visibleFilter = { ...target.filter };
    delete visibleFilter.suspended;
    visibleIds = candidatePermanents(ctx, { ...target, filter: visibleFilter }, { includeUnaffectable: true }).map(
      (p) => p.permanentId,
    );
  }
  const min = target.upTo || opts?.allowDecline === true ? 0 : Math.min(want, candidates.length);
  const max = Math.min(want, candidates.length);
  const asker = target.chooser === "opponent" ? requireOpponentAsk(ctx) : ctx.ask;
  const chosen = await asker.chooseTargets(ctx, {
    candidates: ids,
    visible: visibleIds,
    min,
    max,
    ...(opts?.promptKey !== undefined ? { promptKey: opts.promptKey } : {}),
  });
  const affectableChosen = finalize(chosen);
  ctx.lastResolvedPermanentIds = affectableChosen;
  return affectableChosen;
}

/**
 * Drop permanentIds the source cannot affect (§15-15-5-3) from a list already chosen/
 * counted as legal targets — the second half of the `includeUnaffectable` seam in
 * `resolvePermanentTargets`.
 */
function filterAffectable(ctx: EffectContext, permanentIds: readonly string[]): string[] {
  return permanentIds.filter(affectabilityBySource(ctx));
}

/**
 * Whether the resolving source can affect a permanent, frozen to this source's identity so
 * a caller may re-ask later (a granted effect checks its recipient when it would trigger,
 * Q4561). A permanent no longer on the field counts as affectable.
 */
export function affectabilityBySource(ctx: EffectContext): (permanentId: string) => boolean {
  const source = ctx.source;
  const sourceKinds = ctx.effectSourceKinds ?? effectProvenanceKinds(ctx);
  const relevantSourceKinds =
    ctx.fx.isBeAffectedBySourceKind !== undefined ? sourceKinds.filter((k) => k === "Option" || k === "Digimon") : [];
  return (permanentId) => {
    const permanent = ctx.game.permanentById(permanentId);
    return permanent === undefined || !isPermanentUnaffectable(ctx, source, permanent, relevantSourceKinds);
  };
}

export function effectiveTargetCount(ctx: EffectContext, target: Target): number {
  if (target.count === "all") return Number.POSITIVE_INFINITY;
  const encodedCount = target.count as unknown as {
    kind?: string;
    condition?: Condition;
    then?: number;
    else?: number;
  };
  if (
    typeof encodedCount === "object" &&
    encodedCount !== null &&
    encodedCount.kind === "conditional" &&
    encodedCount.condition !== undefined
  ) {
    return evaluateCondition(ctx, encodedCount.condition) ? (encodedCount.then ?? 1) : (encodedCount.else ?? 1);
  }
  const mod = target.countModifier;
  const baseCount = target.count ?? 1;
  if (mod === undefined) return baseCount;
  if (mod.condition !== undefined && !evaluateCondition(ctx, mod.condition)) return baseCount;
  const units = mod.scaling !== undefined ? scaleFactor(ctx, mod.scaling) : 1;
  return Math.max(0, baseCount + units * mod.amount);
}

/** The top-card instance ids of resolved permanents (for trash/return verbs). */
export function topInstanceIds(ctx: EffectContext, permanentIds: string[]): string[] {
  const ids: string[] = [];
  for (const pid of permanentIds) {
    const p = ctx.game.permanentById(pid);
    if (p?.topCard) ids.push(p.topCard.instanceId);
  }
  return ids;
}
