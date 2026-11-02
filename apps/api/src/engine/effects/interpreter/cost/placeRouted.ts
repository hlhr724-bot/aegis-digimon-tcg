import type { EffectContext } from "../../EffectContext.js";
import { revealPrivateRequirementPicks } from "#api/engine/effects/interpreter/targeting/privateReveal";
import { seatsForController } from "../matching/permanent.js";
import {
  knownCards,
  orderPermanentsForStackEnd,
  placeAtChosenStackEnd,
  placeAtStackEnd,
} from "../placeAtChosenStackEnd.js";
import { candidateLooseInstances, looseCardsInZone, pickLoose } from "../targeting/loose.js";
import { effectiveTargetCount, resolvePermanentTargets } from "../targeting/permanents.js";
import { distinctColorPermanentIds, placeCostHostCandidates } from "./candidates.js";
import { relocateByEffect } from "./relocate.js";
import { CardKind } from "@aegis/shared";
import type { Cost, ZoneRef } from "@aegis/shared";

/**
 * A `place` cost with an explicit `destination` — `undefined` when the cost has
 * none, so the caller falls through to the default place-under.
 */
export async function payRoutedPlaceCost(
  ctx: EffectContext,
  cost: Cost,
  out?: { paidCount: number },
): Promise<boolean | undefined> {
  // Routed place-as-cost (cost.destination set): the chosen card(s) go to the
  // security stack or a chosen/own digivolution stack at top/bottom, instead of
  // the default "under the source" placeUnder below. Loose-card source zones come from
  // cost.target.from (defaulting to hand); permanent relocation tracks actual moves.
  if (cost.destination === undefined) return undefined;
  if (!cost.target) return false;
  if (cost.targetIsPermanent === true) {
    // `bindAs` is needed while resolving an `excludeSelectionRef` destination, but it
    // must not leak from a failed payment into a reused activation context (notably a
    // hand-resident replacement). Preserve any earlier binding until the payment commits.
    const bindAs = cost.target.bindAs;
    const hadPreviousBinding = bindAs !== undefined && ctx.selections?.has(bindAs) === true;
    const previousBinding = bindAs === undefined ? undefined : ctx.selections?.get(bindAs);
    const hostBindAs = cost.bindHostAs;
    const hadPreviousHostBinding = hostBindAs !== undefined && ctx.selections?.has(hostBindAs) === true;
    const previousHostBinding = hostBindAs === undefined ? undefined : ctx.selections?.get(hostBindAs);
    let committedBinding = false;
    const restoreBinding = (): void => {
      if (bindAs !== undefined) {
        if (hadPreviousBinding && previousBinding !== undefined) {
          ctx.selections ??= new Map();
          ctx.selections.set(bindAs, previousBinding);
        } else {
          ctx.selections?.delete(bindAs);
        }
      }
      if (hostBindAs !== undefined) {
        if (hadPreviousHostBinding && previousHostBinding !== undefined) {
          ctx.selections ??= new Map();
          ctx.selections.set(hostBindAs, previousHostBinding);
        } else {
          ctx.selections?.delete(hostBindAs);
        }
      }
    };
    try {
      // "Place the top card of ..." means a card WITH cards underneath it: a Digimon
      // with no digivolution cards is not a legal source, because detaching its only
      // card would remove the permanent itself (BT17-098 Q2892). Constrain the target
      // before the decision so an illegal host is never even offered.
      const sourceTarget =
        cost.detachPermanentTop === true
          ? { ...cost.target, filter: { ...cost.target.filter, hasDigivolutionCards: true } }
          : cost.target;
      const resolvedSourceIds = await resolvePermanentTargets(ctx, sourceTarget);
      const sourceIds =
        cost.target.filter.differentColors === true
          ? distinctColorPermanentIds(ctx, resolvedSourceIds)
          : resolvedSourceIds;
      if (sourceIds.length === 0) return false;
      const requiredSourceCount =
        cost.target.upTo === true
          ? 0
          : cost.target.count === "all"
            ? sourceIds.length
            : effectiveTargetCount(ctx, cost.target);
      if (sourceIds.length < requiredSourceCount) return false;
      if (cost.target.bindAs !== undefined) {
        ctx.selections ??= new Map();
        ctx.selections.set(cost.target.bindAs, sourceIds[0]!);
      }
      if (cost.storeAs !== undefined) {
        const sourcePermanent = ctx.game.permanentById(sourceIds[0]!);
        const level = sourcePermanent?.topCard ? ctx.game.definitionOf(sourcePermanent.topCard).level : undefined;
        if (level !== undefined && level > 0) {
          if (ctx.namedCounts === undefined) ctx.namedCounts = new Map();
          ctx.namedCounts.set(cost.storeAs, level);
        }
      }
      if (cost.destination === "security") {
        for (const sourcePermanentId of sourceIds) {
          const permanent = ctx.game.permanentById(sourcePermanentId);
          if (permanent?.topCard === undefined) return false;
          const topInstanceId = permanent.topCard.instanceId;
          const toTop =
            cost.position === "choice"
              ? (await ctx.ask.chooseOption(ctx, ["top", "bottom"], { topBottomZone: "security" })) === 0
              : cost.position !== "bottom";
          await ctx.fx.addSecurity(permanent.controllerSeat, [topInstanceId], {
            toTop,
            detachPermanentTop: cost.detachPermanentTop === true,
          });
          if (cost.detachPermanentTop === true) {
            const reachedSecurity = ctx.game.state.players.some((player) =>
              player.security.some((card) => card.instanceId === topInstanceId),
            );
            if (!reachedSecurity) return false;
            continue;
          }
          // The cost is paid only if the permanent actually left. A leave-prevention
          // replacement can keep it in the battle area (ST22-06 Q5425), in which case the
          // dependent effect must not resolve even though the placement was attempted.
          if (ctx.game.permanentById(sourcePermanentId) !== undefined) return false;
        }
        if (out) out.paidCount = sourceIds.length;
        committedBinding = true;
        return true;
      }
      let hostPermId: string | undefined;
      if (cost.host !== null && typeof cost.host === "object") {
        const destIds = placeCostHostCandidates(ctx, {
          filter: cost.host.filter,
          count: cost.host.count,
          orFilters: cost.host.orFilters,
        }).map((permanent) => permanent.permanentId);
        if (destIds.length === 0) return false;
        hostPermId =
          destIds.length === 1
            ? destIds[0]
            : (await ctx.ask.chooseTargets(ctx, { candidates: destIds, min: 1, max: 1 }))[0];
      } else if (cost.host === "target" && cost.underFilter) {
        const destIds = await resolvePermanentTargets(ctx, {
          filter: cost.underFilter,
          orFilters: cost.underOrFilters,
          count: 1,
        });
        if (destIds.length === 0) return false;
        hostPermId =
          destIds.length === 1
            ? destIds[0]
            : (await ctx.ask.chooseTargets(ctx, { candidates: destIds, min: 1, max: 1 }))[0];
      } else if (cost.host === "triggerSource") {
        hostPermId =
          ctx.trigger.subjectPermanentId ?? ctx.trigger.attackerPermanentId ?? ctx.trigger.deletedPermanentId;
      } else {
        const selfPerm =
          ctx.source.permanent() ??
          (ctx.trigger.attackerPermanentId !== undefined
            ? ctx.game.permanentById(ctx.trigger.attackerPermanentId)
            : undefined);
        if (selfPerm === undefined) return false;
        hostPermId = selfPerm.permanentId;
      }
      if (hostPermId === undefined) return false;
      // A permanent cannot be placed under itself. The destination filter normally
      // excludes the selected source through `excludeSelectionRef`; retain this
      // identity guard at the mutation seam so a malformed/stale selection can never
      // partially pay the cost.
      if (sourceIds.includes(hostPermId)) return false;
      if (sourceIds.some((sourceId) => ctx.game.permanentById(sourceId)?.topCard === undefined)) return false;
      if (cost.bindHostAs !== undefined) {
        ctx.selections ??= new Map();
        ctx.selections.set(cost.bindHostAs, hostPermId);
      }
      const placedSourceIds: string[] = [];
      const sourceTopInstanceIds = new Map(
        sourceIds.map((sourcePermanentId) => [
          sourcePermanentId,
          ctx.game.permanentById(sourcePermanentId)?.topCard?.instanceId,
        ]),
      );
      if (sourceIds.length > 1) {
        // A multi-source permanent payment must be one atomic operation. The production
        // primitive preflights every source before mutating; refusing the batch in a
        // minimal/legacy context is safer than falling back to partial sequential moves.
        if (ctx.fx.relocatePermanentsByEffect === undefined) return false;
        const atTop = cost.position !== "bottom";
        const orderedSourceIds = await orderPermanentsForStackEnd(ctx, sourceIds, atTop);
        // The primitive relocates in list order, so the last source lands nearest the end.
        const moved = await ctx.fx.relocatePermanentsByEffect(hostPermId, [...orderedSourceIds].reverse(), {
          belowTop: atTop,
          shedOwnCards: cost.shedOwnCards !== false,
          ...(cost.faceDown !== undefined ? { faceUp: !cost.faceDown } : {}),
        });
        if (
          moved.length !== sourceIds.length ||
          moved.some((sourcePermanentId) => !sourceIds.includes(sourcePermanentId))
        )
          return false;
        placedSourceIds.push(...sourceIds);
      } else {
        const moved = await relocateByEffect(ctx, hostPermId, sourceIds[0]!, {
          belowTop: cost.position !== "bottom",
          shedOwnCards: cost.shedOwnCards !== false,
          ...(cost.faceDown !== undefined ? { faceUp: !cost.faceDown } : {}),
        });
        if (moved) placedSourceIds.push(sourceIds[0]!);
      }
      if (placedSourceIds.length === 0) return false;
      ctx.lastPlacedUnderInstanceIds = placedSourceIds
        .map((sourcePermanentId) => sourceTopInstanceIds.get(sourcePermanentId))
        .filter((instanceId): instanceId is string => instanceId !== undefined);
      ctx.lastEffectActed = true;
      if (cost.trackCount !== undefined) {
        ctx.namedCounts ??= new Map();
        ctx.namedCounts.set(cost.trackCount, placedSourceIds.length);
      }
      if (out) out.paidCount = placedSourceIds.length;
      committedBinding = true;
      return true;
    } finally {
      if (!committedBinding) restoreBinding();
    }
  }
  const srcZones: ZoneRef[] = (cost.target.from?.length ?? 0) > 0 ? (cost.target.from as ZoneRef[]) : ["hand"];
  const srcCandidates = candidateLooseInstances(ctx, cost.target, srcZones);
  const visibleSourceIds = srcZones.every((zone) => zone === "hand" || zone === "trash")
    ? seatsForController(ctx, cost.target.filter).flatMap((seat) =>
        srcZones.flatMap((zone) => looseCardsInZone(ctx, seat, zone).map((candidate) => candidate.instanceId)),
      )
    : undefined;
  const wantN = cost.target.count === "all" ? srcCandidates.length : (cost.target.count ?? 1);
  if (wantN <= 0) return false;
  if (!cost.target.upTo && srcCandidates.length < wantN) return false;
  const picked = await pickLoose(
    ctx,
    { ...cost.target, count: wantN },
    srcCandidates,
    undefined,
    ctx.ask,
    visibleSourceIds,
  );
  if (!cost.target.upTo && picked.length < wantN) return false;
  if (cost.trackCount !== undefined) {
    if (ctx.namedCounts === undefined) ctx.namedCounts = new Map();
    ctx.namedCounts.set(cost.trackCount, picked.length);
  }
  // `storeAs`: record the FIRST picked card's level under a named count, readable by a
  // later action's `levelComparison.scaling` (unit "namedCount") — e.g. "delete 1 of your
  // opponent's Digimon with the SAME level as the placed card" (EX9-055). Honored for
  // every destination, not just security (the earlier placement predates digivolutionStack
  // reuse of this hook).
  if (cost.storeAs !== undefined && picked.length > 0) {
    const pickedCard = srcCandidates.find((c) => c.instanceId === picked[0]);
    const def = pickedCard !== undefined ? ctx.game.definitionOf(pickedCard as never) : undefined;
    const level = def?.level;
    if (level !== undefined && level > 0) {
      if (ctx.namedCounts === undefined) ctx.namedCounts = new Map();
      ctx.namedCounts.set(cost.storeAs, level);
    }
  }
  if (cost.destination === "security") {
    if (cost.bindResultAs) {
      ctx.boundPlayed ??= new Map();
      ctx.boundPlayed.set(cost.bindResultAs, new Set(picked));
    }
    // "top or bottom" is a controller choice, including when the
    // destination is security (not only when placing under a Digimon).
    // Without this branch, a `position: "choice"` cost silently always
    // inserted at the top of security.
    let toTop: boolean;
    if (cost.position === "choice") {
      const choice = await ctx.ask.chooseOption(ctx, ["top", "bottom"], { topBottomZone: "security" });
      toTop = choice === 0;
    } else {
      toTop = cost.position !== "bottom";
    }
    // Security cards are face down unless the card prints "face up" (BT18-004: faceDown false).
    await ctx.fx.addSecurity(ctx.source.ownerSeat, picked, {
      toTop,
      faceUp: cost.faceDown === false,
    });
    if (out) out.paidCount = picked.length;
    return true;
  }
  if (cost.destination === "battleArea") {
    const placed: string[] = [];
    for (const instanceId of picked) {
      const permanent = await ctx.fx.placeOptionAsPermanent?.(instanceId);
      if (permanent !== undefined) placed.push(permanent.permanentId);
    }
    if (placed.length !== picked.length) return false;
    if (out) out.paidCount = placed.length;
    return true;
  }
  // digivolutionStack: resolve the host (self or the underFilter target) and
  // place under it at the chosen end. placeUnder forces face-down (digivolution
  // cards are always face-down), satisfying the face-down variants too.
  let hostPermId: string | undefined;
  if (cost.host !== null && typeof cost.host === "object") {
    // Object form: { filter, count } — player picks a destination Digimon (BT21-071).
    const destIds = placeCostHostCandidates(ctx, {
      filter: cost.host.filter,
      count: cost.host.count,
      orFilters: cost.host.orFilters,
    }).map((permanent) => permanent.permanentId);
    if (destIds.length === 0) return false;
    hostPermId =
      destIds.length === 1
        ? destIds[0]
        : (await ctx.ask.chooseTargets(ctx, { candidates: destIds, min: 1, max: 1 }))[0];
  } else if (cost.host === "target" && cost.underFilter) {
    const destIds = await resolvePermanentTargets(ctx, {
      filter: cost.underFilter,
      orFilters: cost.underOrFilters,
      count: 1,
    });
    if (destIds.length === 0) return false;
    hostPermId =
      destIds.length === 1
        ? destIds[0]
        : (await ctx.ask.chooseTargets(ctx, { candidates: destIds, min: 1, max: 1 }))[0];
  } else if (cost.host === "triggerSource") {
    hostPermId = ctx.trigger.subjectPermanentId ?? ctx.trigger.attackerPermanentId ?? ctx.trigger.deletedPermanentId;
  } else {
    // "place ... as 1 of your Digimon's ... card" names the destination
    // separately from the material filter. Older IR omitted an explicit host
    // target, so do not incorrectly default to the source Tamer; choose one of
    // the controller's Digimon permanents through the production target seam.
    const sourcePermanent = ctx.source.permanent();
    const sourceIsTamer =
      sourcePermanent !== undefined && ctx.game.definitionOf(sourcePermanent.topCard).kinds.includes(CardKind.Tamer);
    if (
      (cost.raw && /as 1 of your Digimon's/i.test(cost.raw)) ||
      (sourceIsTamer && cost.target.filter.kind?.includes("Digimon"))
    ) {
      const candidates = ctx.game
        .player(ctx.source.ownerSeat)
        .battleArea.filter((permanent) => ctx.game.definitionOf(permanent.topCard).kinds.includes(CardKind.Digimon))
        .map((permanent) => permanent.permanentId);
      if (candidates.length === 0) return false;
      hostPermId =
        candidates.length === 1 ? candidates[0] : (await ctx.ask.chooseTargets(ctx, { candidates, min: 1, max: 1 }))[0];
    } else {
      const selfPerm =
        ctx.source.permanent() ??
        (ctx.trigger.attackerPermanentId !== undefined
          ? ctx.game.permanentById(ctx.trigger.attackerPermanentId)
          : undefined);
      if (selfPerm === undefined) return false;
      hostPermId = selfPerm.permanentId;
    }
  }
  if (hostPermId === undefined) return false;
  const visibleCards = knownCards(
    ctx,
    srcCandidates.filter(({ instanceId }) => picked.includes(instanceId)),
  );
  const host = ctx.game.permanentById(hostPermId);
  const hostIsTamer = host !== undefined && ctx.game.definitionOf(host.topCard).kinds.includes(CardKind.Tamer);
  const faceUp = cost.faceDown !== true && !(cost.faceDownUnderTamer === true && hostIsTamer);
  if (!faceUp) {
    revealPrivateRequirementPicks(ctx, cost.target, srcCandidates, picked);
  }
  const placedCards =
    cost.position === "choice"
      ? await placeAtChosenStackEnd(ctx, hostPermId, picked, visibleCards, faceUp)
      : await placeAtStackEnd(ctx, hostPermId, picked, visibleCards, { atTop: cost.position !== "bottom", faceUp });
  const placedIds = new Set(placedCards.map((card) => card.instanceId));
  // A placement cost is paid only when every selected card actually entered the
  // requested digivolution stack.  The primitive is allowed to reject individual
  // cards (for example, if a replacement or intervening effect makes one no longer
  // movable), so a selection alone must not bind a target or unlock a dependent
  // "if you did" action.
  if (placedIds.size !== picked.length || picked.some((instanceId) => !placedIds.has(instanceId))) {
    return false;
  }
  ctx.lastPlacedUnderInstanceIds = [...picked];
  if (cost.bindHostAs !== undefined) {
    ctx.selections ??= new Map();
    ctx.selections.set(cost.bindHostAs, hostPermId);
  }
  if (cost.storeAs !== undefined && picked.length > 0) {
    const pickedCard = srcCandidates.find((c) => c.instanceId === picked[0]);
    const def = pickedCard !== undefined ? ctx.game.definitionOf(pickedCard as never) : undefined;
    const level = def?.level;
    if (level !== undefined && level > 0) {
      if (ctx.namedCounts === undefined) ctx.namedCounts = new Map();
      ctx.namedCounts.set(cost.storeAs, level);
    }
  }
  // A successful placement cost is the producer for following "if you did"
  // clauses (BT13-088). Keep the effect-result binding consistent with the
  // equivalent place/trash action paths.
  ctx.lastEffectActed = picked.length > 0;
  if (out) out.paidCount = picked.length;
  return true;
}
