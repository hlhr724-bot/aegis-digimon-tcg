// Moving cards into and out of a digivolution stack.

import type { EffectContext } from "#api/engine/effects/context/effectContext";
import { relocateByEffect } from "#api/engine/effects/interpreter/costs";
import { redirectDigivolutionTrash } from "#api/engine/effects/interpreter/digivolutionTrashRedirect";
import { unsupported } from "#api/engine/effects/interpreter/errors";
import { definitionMatches, hasExactName, matchNameOrTrait } from "#api/engine/effects/interpreter/matching/definition";
import {
  knownCards,
  orderPermanentsForStackEnd,
  placeAtChosenStackEnd,
  placeAtStackEnd,
} from "#api/engine/effects/interpreter/placeAtChosenStackEnd";
import { scaleFactor } from "#api/engine/effects/interpreter/scaling";
import { candidateLooseInstances, pickLoose, zoneList } from "#api/engine/effects/interpreter/targeting/loose";
import {
  candidatePermanents,
  effectiveTargetCount,
  resolvePermanentTargets,
} from "#api/engine/effects/interpreter/targeting/permanents";
import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { Filter, Target } from "@aegis/shared/effects/ir/filters/filter";
import type { ZoneRef } from "@aegis/shared/effects/ir/filters/zones";

type MixedSourceCandidate = { instanceId: string; cardId: string; permanentId?: string };

function mixedSourceMatches(ctx: EffectContext, filter: Filter, card: { cardId: string }): boolean {
  const definition = ctx.game.definitionOf(card as never);
  if (filter.kind !== undefined && !definition.kinds.some((kind) => filter.kind!.includes(kind))) return false;
  return filter.nameOrTrait === undefined || filter.nameOrTrait.some((ref) => matchNameOrTrait(definition, ref));
}

function collectMixedSourceCandidates(
  ctx: EffectContext,
  action: Extract<Action, { kind: "PlaceUnder" }>,
  destinationId: string,
): MixedSourceCandidate[] {
  const sources = action.mixedSources!;
  const candidates: MixedSourceCandidate[] = [];
  const owner = ctx.game.player(ctx.source.ownerSeat);
  const sourcePermanent = sources.sourcePermanent ? ctx.source.permanent() : undefined;
  if (
    sourcePermanent !== undefined &&
    !sourcePermanent.inBreeding &&
    sourcePermanent.topCard !== undefined &&
    sourcePermanent.permanentId !== destinationId &&
    owner.battleArea.some((permanent) => permanent.permanentId === sourcePermanent.permanentId)
  ) {
    candidates.push({
      instanceId: sourcePermanent.topCard.instanceId,
      cardId: sourcePermanent.topCard.cardId,
      permanentId: sourcePermanent.permanentId,
    });
  }
  if (sources.battleAreaPermanents || sources.linkedCards) {
    for (const permanent of owner.battleArea) {
      if (permanent.inBreeding || permanent.topCard === undefined) continue;
      if (
        permanent.permanentId !== destinationId &&
        permanent.permanentId !== sourcePermanent?.permanentId &&
        sources.battleAreaPermanents &&
        mixedSourceMatches(ctx, action.target.filter, permanent.topCard)
      ) {
        candidates.push({
          instanceId: permanent.topCard.instanceId,
          cardId: permanent.topCard.cardId,
          permanentId: permanent.permanentId,
        });
      }
      if (sources.linkedCards) {
        for (const linked of permanent.linked) {
          if (mixedSourceMatches(ctx, action.target.filter, linked))
            candidates.push({ instanceId: linked.instanceId, cardId: linked.cardId });
        }
      }
    }
  }
  if (sources.hand) {
    for (const card of owner.hand) {
      if (mixedSourceMatches(ctx, action.target.filter, card))
        candidates.push({ instanceId: card.instanceId, cardId: card.cardId });
    }
  }
  if (sources.trash) {
    for (const card of owner.trash) {
      if (mixedSourceMatches(ctx, action.target.filter, card))
        candidates.push({ instanceId: card.instanceId, cardId: card.cardId });
    }
  }
  return candidates;
}

function requiredMixedNamesAvailable(
  ctx: EffectContext,
  action: Extract<Action, { kind: "PlaceUnder" }>,
  candidates: readonly MixedSourceCandidate[],
): boolean {
  const requiredNames = action.target.requiredNamesExact ?? [];
  if (requiredNames.length === 0) return true;
  if (action.target.count !== requiredNames.length) return false;
  return requiredNames.every((name) =>
    candidates.some((candidate) => ctx.game.definitionOf({ cardId: candidate.cardId } as never).nameEn === name),
  );
}

async function selectMixedSourceCandidates(
  ctx: EffectContext,
  action: Extract<Action, { kind: "PlaceUnder" }>,
  candidates: readonly MixedSourceCandidate[],
): Promise<MixedSourceCandidate[] | undefined> {
  const requiredNames = action.target.requiredNamesExact ?? [];
  const count = action.target.count === "all" ? candidates.length : Number(action.target.count ?? 1);
  if (requiredNames.length > 0) {
    if (count !== requiredNames.length) return undefined;
    const selected: MixedSourceCandidate[] = [];
    const used = new Set<string>();
    for (const name of requiredNames) {
      const matching = candidates.filter(
        (candidate) =>
          !used.has(candidate.instanceId) &&
          ctx.game.definitionOf({ cardId: candidate.cardId } as never).nameEn === name,
      );
      if (matching.length === 0) return undefined;
      const pickedId =
        matching.length === 1
          ? matching[0]!.instanceId
          : (
              await ctx.ask.selectCards(ctx, {
                candidates: matching.map((candidate) => candidate.instanceId),
                min: 1,
                max: 1,
                visible: candidates.map((candidate) => candidate.instanceId),
                visibleCards: candidates.map(({ instanceId, cardId }) => ({ instanceId, cardId })),
              })
            )[0];
      const picked = matching.find((candidate) => candidate.instanceId === pickedId);
      if (picked === undefined) return undefined;
      used.add(picked.instanceId);
      selected.push(picked);
    }
    return selected;
  }
  if (candidates.length < count) return undefined;
  const selected =
    candidates.length === count
      ? [...candidates]
      : (
          await ctx.ask.selectCards(ctx, {
            candidates: candidates.map((candidate) => candidate.instanceId),
            min: count,
            max: count,
          })
        )
          .map((id) => candidates.find((candidate) => candidate.instanceId === id))
          .filter((candidate): candidate is MixedSourceCandidate => candidate !== undefined);
  return selected.length === count ? selected : undefined;
}

function rememberPlacedUnder(ctx: EffectContext, instanceIds: string[]): void {
  ctx.lastPlacedUnderInstanceIds = instanceIds;
  if (instanceIds.length > 0) {
    ctx.placedUnderInstanceIdsThisEffect = [...(ctx.placedUnderInstanceIdsThisEffect ?? []), ...instanceIds];
  }
}

/**
 * "Place [X] under <permanent>" / "place as the bottom digivolution card". The common
 * executable shape places filtered loose cards (from hand/trash) under the SOURCE
 * permanent. The self-placing shape ("place this card under 1 of your Digimon") is a
 * loud gap until the destination selection is modeled.
 */
export async function runPlaceUnder(
  ctx: EffectContext,
  action: Extract<Action, { kind: "PlaceUnder" }>,
): Promise<void> {
  const self = ctx.source.permanent();
  if (action.groupedEggAndPermanents === true) {
    if (self === undefined) return;
    const egg = ctx.game.player(ctx.source.ownerSeat).eggDeck?.[0];
    const permanentIds = await resolvePermanentTargets(ctx, action.target);
    const candidates = [
      ...(egg === undefined ? [] : [{ instanceId: egg.instanceId, kind: "egg" as const }]),
      ...permanentIds.map((permanentId) => ({
        instanceId: ctx.game.permanentById(permanentId)!.topCard.instanceId,
        kind: "permanent" as const,
        permanentId,
      })),
    ];
    if (candidates.length === 0) return;
    let orderedIds = candidates.map((candidate) => candidate.instanceId);
    if (orderedIds.length > 1 && ctx.ask.orderCards !== undefined) {
      orderedIds = await ctx.ask.orderCards(ctx, {
        candidates: orderedIds,
        visibleCards: candidates.map((candidate) => ({
          instanceId: candidate.instanceId,
          cardId:
            candidate.kind === "egg" ? egg!.cardId : ctx.game.permanentById(candidate.permanentId!)!.topCard.cardId,
        })),
        destination: "stackBottom",
      });
    }
    const byId = new Map(candidates.map((candidate) => [candidate.instanceId, candidate]));
    if (ctx.fx.placeEggAndPermanentsUnder === undefined)
      return unsupported(ctx, action, "simultaneous Digi-Egg and permanent placement");
    await ctx.fx.placeEggAndPermanentsUnder(
      self.permanentId,
      orderedIds.flatMap((instanceId) => {
        const candidate = byId.get(instanceId);
        if (candidate === undefined) return [];
        return [{ instanceId, ...(candidate.kind === "permanent" ? { permanentId: candidate.permanentId } : {}) }];
      }),
    );
    return;
  }
  if (action.mixedSources !== undefined) {
    const destination = action.destination;
    if (destination === undefined) return;
    const destinationIds = await resolvePermanentTargets(ctx, { filter: destination.filter, count: destination.count });
    const destinationId =
      destinationIds.length === 1
        ? destinationIds[0]
        : (await ctx.ask.chooseTargets(ctx, { candidates: destinationIds, min: 1, max: 1 }))[0];
    if (destinationId === undefined) return;
    if (action.bindHostAs !== undefined) ctx.selections?.set(action.bindHostAs, destinationId);
    const candidates = collectMixedSourceCandidates(ctx, action, destinationId);
    const count = action.target.count === "all" ? candidates.length : Number(action.target.count ?? 1);
    const selected = await selectMixedSourceCandidates(ctx, action, candidates);
    if (selected === undefined) return;
    const orderedIds = ctx.ask.orderCards
      ? await ctx.ask.orderCards(ctx, {
          candidates: selected.map((candidate) => candidate.instanceId),
          destination: "stackBottom",
        })
      : selected.map((candidate) => candidate.instanceId);
    if (
      orderedIds.length !== selected.length ||
      new Set(orderedIds).size !== selected.length ||
      orderedIds.some((id) => !selected.some((candidate) => candidate.instanceId === id))
    )
      return;
    const ordered = orderedIds
      .map((id) => selected.find((candidate) => candidate.instanceId === id))
      .filter((candidate): candidate is MixedSourceCandidate => candidate !== undefined);
    for (const candidate of [...ordered].reverse()) {
      if (candidate.permanentId !== undefined) {
        if (
          (await ctx.fx.relocatePermanentByEffect?.(destinationId, candidate.permanentId, {
            belowTop: false,
            faceUp: true,
            shedOwnCards: true,
          })) !== true
        )
          return;
      } else if ((await ctx.fx.placeUnder(destinationId, [candidate.instanceId])).length !== 1) return;
    }
    if (action.trackCount !== undefined) {
      ctx.namedCounts ??= new Map();
      ctx.namedCounts.set(action.trackCount, count);
    }
    return;
  }
  // "Place the top card of your Digi-Egg deck as this Digimon's bottom digivolution card"
  // (BT13-007 / EX6-006). The card source is the Digi-Egg deck (not loose cards), routed
  // through the dedicated primitive; the host is the SOURCE permanent. The primitive no-ops
  // when the Digi-Egg deck is empty (Q3694: the rest of the effect still resolves).
  if (action.fromEggDeck) {
    if (self === undefined) return;
    if (action.asTop) {
      // BT22-007: place the Digi-Egg-deck top as the host's TOP digivolution card (revealed), but
      // A non-matching top is left in the deck (Q4857: returned face down — i.e. unmoved).
      const top = ctx.game.player(ctx.source.ownerSeat).eggDeck?.[0];
      if (top === undefined) return;
      const filter = action.target.filter;
      if (filter.nameOrTrait !== undefined && filter.nameOrTrait.length > 0) {
        const def = ctx.game.definitionOf({ cardId: top.cardId } as never);
        if (!filter.nameOrTrait.some((ref) => matchNameOrTrait(def, ref))) return;
      }
      await ctx.fx.placeAsTopFromEggDeck(self.permanentId, ctx.source.ownerSeat);
      return;
    }
    await ctx.fx.placeUnderFromEggDeck(self.permanentId, ctx.source.ownerSeat);
    return;
  }
  // "Place [a battle-area permanent A] under another permanent B" (the cross-select
  // IPlacePermanentToDigivolutionCards form): relocate the whole permanent through the shared
  // effect relocation primitive, preserving its stack unless shedOwnCards requests the
  // DigiXros-style source shedding required by the printed effect.
  if (action.targetIsPermanent) {
    const levelCeilingTarget =
      action.scaling?.levelCeilingAdd !== undefined && action.target.filter.levelComparison?.value !== undefined
        ? {
            ...action.target,
            filter: {
              ...action.target.filter,
              levelComparison: {
                ...action.target.filter.levelComparison,
                value:
                  action.target.filter.levelComparison.value +
                  scaleFactor(ctx, action.scaling) * action.scaling.levelCeilingAdd,
              },
            },
          }
        : action.target;
    const sourceIds = await resolvePermanentTargets(ctx, levelCeilingTarget);
    if (sourceIds.length === 0) return;
    let destId: string | undefined;
    if (action.underSelectionRef && ctx.selections?.has(action.underSelectionRef)) {
      destId = ctx.selections.get(action.underSelectionRef);
    } else if (action.underFilter) {
      const destTarget: Target = { filter: { ...action.underFilter, excludeToken: true }, count: 1 };
      // "Other" excludes the cards being moved before the host choice is offered.
      // An empty result (including a chosen immune host) must not retarget the move.
      const destIds = await resolvePermanentTargets(ctx, destTarget, {
        eligible: (id) => !sourceIds.includes(id),
      });
      destId = destIds[0];
    } else {
      unsupported(ctx, action, "PlaceUnder permanent relocation without underFilter/underSelectionRef");
      return;
    }
    if (destId === undefined) return;
    let placedCount = 0;
    const atTop = action.position !== "bottom";
    const orderedSourceIds = await orderPermanentsForStackEnd(ctx, sourceIds, atTop);
    for (const sourcePermanentId of [...orderedSourceIds].reverse()) {
      const moved = await relocateByEffect(ctx, destId, sourcePermanentId, {
        belowTop: atTop,
        ...(action.shedOwnCards === true ? { shedOwnCards: true } : {}),
      });
      if (moved) placedCount += 1;
    }
    if (action.trackCount !== undefined) {
      ctx.namedCounts ??= new Map();
      ctx.namedCounts.set(action.trackCount, placedCount);
    }
    return;
  }
  if (action.fromSelectedPermanentDigivolutionCards) {
    const sourceIds = await resolvePermanentTargets(ctx, action.target);
    const sourcePermanent = sourceIds[0] === undefined ? undefined : ctx.game.permanentById(sourceIds[0]);
    if (sourcePermanent === undefined || action.underFilter === undefined) return;
    const cards = sourcePermanent.stack.filter((card) =>
      ctx.game.definitionOf(card).kinds.includes("Digimon" as never),
    );
    if (cards.length === 0) return;
    const hostIds = await resolvePermanentTargets(ctx, { filter: action.underFilter, count: 1 });
    const hostId = hostIds[0];
    if (hostId === undefined) return;
    let chosen = cards.map((card) => card.instanceId);
    if (action.order === "any" && chosen.length > 1 && ctx.ask.orderCards !== undefined) {
      chosen = await ctx.ask.orderCards(ctx, {
        candidates: chosen,
        visibleCards: cards.map(({ instanceId, cardId }) => ({ instanceId, cardId })),
        destination: "stackBottom",
      });
    }
    // The primitive inserts bottom placements one card at a time with unshift,
    // so reverse the logical bottom-to-top order before handing it off.
    const placementIds = action.position === "bottom" ? [...chosen].reverse() : chosen;
    await ctx.fx.placeUnder(hostId, placementIds, { belowTop: action.position !== "bottom" });
    rememberPlacedUnder(ctx, chosen);
    ctx.lastEffectActed = chosen.length > 0;
    if (action.trackCount !== undefined) {
      ctx.namedCounts ??= new Map();
      ctx.namedCounts.set(action.trackCount, chosen.length);
    }
    return;
  }
  if (action.target?.isSelf || action.target?.filter?.isSelfRef) {
    // A deleted source that an earlier action already moved cannot move again as
    // "this card", nor can its new host become the source of the continuation.
    if (ctx.activeTiming === "OnDeletion" && ctx.source.isInTrash?.() === false) return;
    // ＜Save＞ form: place THIS card under one of the controller's Tamers (chosen).
    // `underFilter` carries the destination predicate (mine, Tamer, non-Token).
    const underFilter = action.underFilter ?? {
      controller: "mine",
      kind: ["Tamer", "Digimon"],
      excludeToken: true,
    };
    if (underFilter) {
      const sourcePerm =
        ctx.source.permanent() ??
        ctx.game
          .player(ctx.source.ownerSeat)
          .battleArea.find((permanent) => permanent.topCard?.instanceId === ctx.source.instanceId);
      // `lastPlayed`: the host is whatever this effect's own PlayWithoutCost just played
      // ("place this card as the PLAYED Digimon's bottom digivolution card" — EX9-005),
      // not a fresh choice among the controller's board.
      const destIds =
        action.underFilter?.lastPlayed === true
          ? (ctx.lastPlayedPermanentIds ?? [])
          : candidatePermanents(ctx, { filter: underFilter, count: 1 })
              .map((permanent) => permanent.permanentId)
              .filter((permanentId) => permanentId !== sourcePerm?.permanentId);
      if (destIds.length === 0) return;
      const chosen =
        destIds.length === 1 ? destIds : await ctx.ask.chooseTargets(ctx, { candidates: destIds, min: 1, max: 1 });
      if (chosen.length === 0) return;
      // When the source is a battle-area permanent, relocate the whole permanent
      // (top card + digivolution stack) under the chosen Tamer. The placeUnder
      // primitive only handles loose cards and cannot remove a permanent's top card.
      if (sourcePerm !== undefined) {
        const options = { belowTop: action.position !== "bottom" };
        await relocateByEffect(ctx, chosen[0]!, sourcePerm.permanentId, options);
      } else {
        const placed = await ctx.fx.placeUnder(chosen[0]!, [ctx.source.instanceId], {
          belowTop: action.position !== "bottom",
        });
        // Minimal effect-context fakes may record the mutation without returning the
        // primitive's normal instance-id array. Treat an undefined result as an
        // accepted mutation; real primitives still report success through the array.
        ctx.lastEffectActed = placed === undefined || placed.length > 0;
      }
      if (action.bindHostAs) {
        ctx.boundPlayed ??= new Map();
        ctx.boundPlayed.set(action.bindHostAs, new Set([chosen[0]!]));
      }
      return;
    }
    unsupported(ctx, action, "PlaceUnder of this card under a chosen permanent needs a destination selection");
    return;
  }
  if (action.fromDeckTop) {
    const deck = ctx.game.player(ctx.source.ownerSeat).deck;
    const count = action.target.count === "all" ? deck.length : Number(action.target.count ?? 1);
    const cards = deck.slice(0, count);
    if (cards.length === 0) {
      return;
    }
    let destId: string | undefined;
    if (action.underFilter) {
      const destTarget: Target = { filter: { ...action.underFilter, excludeToken: true }, count: 1 };
      const destIds = await resolvePermanentTargets(ctx, destTarget);
      if (destIds.length === 0) return;
      destId =
        destIds.length === 1
          ? destIds[0]
          : (await ctx.ask.chooseTargets(ctx, { candidates: destIds, min: 1, max: 1 }))[0];
    } else if (self !== undefined) {
      destId = self.permanentId;
    }
    if (destId === undefined) return;
    await ctx.fx.placeUnder(
      destId,
      cards.map((card) => card.instanceId),
      {
        belowTop: action.position !== "bottom",
        faceUp: false,
      },
    );
    return;
  }
  // Cards to place: loose cards matching the target filter.
  // Priority: action.from (top-level) > action.target.from > target.filter.zone (for non-default
  // zones like "underTamer" used by BT19-081) > legacy hand/trash/deck sweep.
  const levelCeilingTarget =
    action.scaling?.levelCeilingAdd !== undefined && action.target.filter.levelComparison?.value !== undefined
      ? {
          ...action.target,
          filter: {
            ...action.target.filter,
            levelComparison: {
              ...action.target.filter.levelComparison,
              value:
                action.target.filter.levelComparison.value +
                scaleFactor(ctx, action.scaling) * action.scaling.levelCeilingAdd,
            },
          },
        }
      : action.target;
  const zones: ZoneRef[] =
    (action.from?.length ?? 0) > 0
      ? (action.from as ZoneRef[])
      : (levelCeilingTarget.from?.length ?? 0) > 0
        ? (levelCeilingTarget.from as ZoneRef[])
        : levelCeilingTarget.filter.zone !== undefined
          ? zoneList(levelCeilingTarget.filter.zone)
          : ["hand", "trash", "deck"];
  const candidates = candidateLooseInstances(ctx, levelCeilingTarget, zones);
  if (candidates.length === 0) return;
  let scopedCandidates = candidates;
  const underTamerZones = new Set<ZoneRef>(["underMyTamers", "underTamers", "underTamer"]);
  if (action.underTamerHostScope === "single" && zones.length > 0 && zones.every((zone) => underTamerZones.has(zone))) {
    const hostIds = [...new Set(candidates.map((candidate) => candidate.hostPermanentId))].filter(
      (hostId): hostId is string => hostId !== undefined,
    );
    const selectedHostIds =
      hostIds.length <= 1 ? hostIds : await ctx.ask.chooseTargets(ctx, { candidates: hostIds, min: 1, max: 1 });
    const selectedHostId = selectedHostIds[0];
    if (selectedHostId === undefined) return;
    scopedCandidates = candidates.filter((candidate) => candidate.hostPermanentId === selectedHostId);
  }
  // Destination host (priority): explicit `destination` selector (BT19-038: place a card
  // from hand/trash under a chosen Tamer) > `underFilter` > the source permanent itself.
  let hostId: string | undefined;
  if (action.destination) {
    const destTarget: Target = { filter: action.destination.filter, count: action.destination.count };
    const destIds = await resolvePermanentTargets(ctx, destTarget);
    if (destIds.length === 0) return;
    hostId =
      destIds.length === 1
        ? destIds[0]
        : (await ctx.ask.chooseTargets(ctx, { candidates: destIds, min: 1, max: 1 }))[0];
  } else if (action.underSelectionRef && ctx.selections?.has(action.underSelectionRef)) {
    hostId = ctx.selections.get(action.underSelectionRef);
  } else if (action.underFilter?.isTriggerSource === true) {
    // `isTriggerSource: true` in underFilter resolves to the permanent that drove the
    // enclosing trigger: the Digimon being played for wouldBePlayed replacements, or
    // the Digimon that just digivolved for SubTrigger bodies such as BT12 Tamers.
    const triggerPermanentId =
      ctx.trigger?.wouldBePlayedInstanceId ??
      ctx.trigger?.subjectPermanentId ??
      ctx.trigger?.attackerPermanentId ??
      ctx.trigger?.deletedPermanentId;
    if (triggerPermanentId !== undefined) {
      const triggerPermanent = ctx.game.permanentById(triggerPermanentId);
      if (triggerPermanent !== undefined) hostId = triggerPermanent.permanentId;
    }
    if (hostId === undefined) return;
  } else if (action.underFilter) {
    const destTarget: Target = { filter: { ...action.underFilter, excludeToken: true }, count: 1 };
    const destIds = await resolvePermanentTargets(ctx, destTarget);
    if (destIds.length === 0) return;
    hostId =
      destIds.length === 1
        ? destIds[0]
        : (await ctx.ask.chooseTargets(ctx, { candidates: destIds, min: 1, max: 1 }))[0];
  } else {
    if (self === undefined) {
      unsupported(ctx, action, "PlaceUnder onto the source needs the source to be a battle-area permanent");
      return;
    }
    hostId = self.permanentId;
  }
  if (hostId === undefined) return;
  if (action.bindHostAs !== undefined) ctx.selections?.set(action.bindHostAs, hostId);
  // Older compiled PlaceUnder records carry their printed quantity on the action rather
  // than on `target`. Treat that quantity as "as many as possible, up to N": cards such as
  // EX10-025 require 2 when 2 exist but still permit the single available card (Q5078-Q5079).
  const placementTarget =
    typeof action.count === "number"
      ? { ...levelCeilingTarget, count: Math.min(action.count, scopedCandidates.length) }
      : action.count === "all"
        ? { ...levelCeilingTarget, count: scopedCandidates.length }
        : levelCeilingTarget;
  const chosen = await pickLoose(
    ctx,
    placementTarget,
    scopedCandidates,
    undefined,
    ctx.ask,
    action.blind === true ? [] : scopedCandidates.map((candidate) => candidate.instanceId),
  );
  rememberPlacedUnder(ctx, chosen);
  // `asDigiXrosMaterial: true` marks placed cards as DigiXros materials for the host Digimon.
  // The placeUnder primitive records them as material cards in the host's stack (belowTop as
  // the DigiXros convention; the flag is structural metadata for the DigiXros system to read).
  // DigiXros fixes the material order by its requirement, so the player does not order them.
  const faceUp = action.faceDown !== true;
  if (chosen.length > 0 && action.asDigiXrosMaterial === true) {
    await ctx.fx.placeUnder(hostId, chosen, { belowTop: action.position !== "bottom", faceUp });
  } else if (chosen.length > 0) {
    const visibleCards =
      action.blind === true
        ? []
        : knownCards(
            ctx,
            scopedCandidates.filter(({ instanceId }) => chosen.includes(instanceId)),
          );
    if (action.position === "choice") await placeAtChosenStackEnd(ctx, hostId, chosen, visibleCards, faceUp);
    else await placeAtStackEnd(ctx, hostId, chosen, visibleCards, { atTop: action.position !== "bottom", faceUp });
  }
  if (action.bindHostAs && chosen.length > 0) {
    ctx.boundPlayed ??= new Map();
    ctx.boundPlayed.set(action.bindHostAs, new Set([hostId]));
  }
  // Bind the branch-acted result so an "if this effect placed" tail (AD1-020) can gate.
  ctx.lastEffectActed = chosen.length > 0;
  // Record the placed count so a later `namedCount` scaling can read it (EX6-015: "for each
  // card placed in this Digimon's digivolution cards, add 1 to the level this effect may return").
  if (action.trackCount !== undefined) {
    if (ctx.namedCounts === undefined) ctx.namedCounts = new Map();
    ctx.namedCounts.set(action.trackCount, chosen.length);
  }
  if (action.trackDistinctNames !== undefined) {
    const names = new Set(
      chosen.map((instanceId) => {
        const candidate = candidates.find((entry) => entry.instanceId === instanceId);
        return candidate === undefined
          ? instanceId
          : ctx.game.definitionOf({ cardId: candidate.cardId } as never).nameEn;
      }),
    );
    ctx.namedCounts ??= new Map();
    ctx.namedCounts.set(action.trackDistinctNames, names.size);
  }
}

/**
 * Preflight the ordinary loose-card PlaceUnder shape before an optional confirmation is
 * published. Specialized shapes own different source/destination rules and keep their
 * existing resolver-specific handling.
 */
export function canAttemptPlaceUnder(ctx: EffectContext, action: Extract<Action, { kind: "PlaceUnder" }>): boolean {
  if (action.mixedSources !== undefined) {
    const destination = action.destination;
    if (destination === undefined) return false;
    const destinationIds = candidatePermanents(ctx, { filter: destination.filter, count: destination.count }).map(
      (permanent) => permanent.permanentId,
    );
    if (destinationIds.length === 0) return false;
    return destinationIds.some((destinationId) => {
      const candidates = collectMixedSourceCandidates(ctx, action, destinationId);
      if (!requiredMixedNamesAvailable(ctx, action, candidates)) return false;
      const required = action.target.count === "all" ? candidates.length : Number(action.target.count ?? 1);
      return required > 0 && candidates.length >= required;
    });
  }
  if (action.fromDeckTop === true) {
    return ctx.source.permanent() !== undefined && ctx.game.player(ctx.source.ownerSeat).deck.length > 0;
  }
  if (
    action.fromEggDeck === true ||
    action.targetIsPermanent === true ||
    action.target?.isSelf === true ||
    action.target?.filter?.isSelfRef === true
  ) {
    // The source side needs no zone search for these shapes, but the host side still must
    // exist: "place this card as the bottom digivolution card of 1 of your level 5 or higher
    // Digimon" is unactivatable with no such Digimon (BT17-050 Q2803). Without this the
    // action reported itself attemptable, its activation cost was charged, and the placement
    // silently moved nothing.
    return hostPreflight(ctx, action) ?? true;
  }

  const zones: ZoneRef[] =
    (action.from?.length ?? 0) > 0
      ? (action.from as ZoneRef[])
      : (action.target.from?.length ?? 0) > 0
        ? (action.target.from as ZoneRef[])
        : action.target.filter.zone !== undefined
          ? zoneList(action.target.filter.zone)
          : ["hand", "trash", "deck"];
  const looseCandidates = candidateLooseInstances(ctx, action.target, zones);
  const requiredNamesExactUpTo = action.target.requiredNamesExactUpTo ?? [];
  const eligibleLooseCandidates =
    requiredNamesExactUpTo.length > 0
      ? looseCandidates.filter((candidate) => {
          const definition = ctx.game.definitionOf({ cardId: candidate.cardId } as never);
          return requiredNamesExactUpTo.some((name) => hasExactName(definition, name));
        })
      : looseCandidates;
  // A named "up to one of each" selection may legitimately contain only the names
  // currently available. It still needs one candidate to make the optional action
  // meaningful, but must not be suppressed merely because a different required name
  // is absent (BT6-075 Q1465).
  const required =
    requiredNamesExactUpTo.length > 0
      ? 1
      : action.target.count === "all"
        ? eligibleLooseCandidates.length
        : effectiveTargetCount(ctx, action.target);
  if (required <= 0 || (action.target.upTo !== true && eligibleLooseCandidates.length < required)) return false;

  return hostPreflight(ctx, action) ?? ctx.source.permanent() !== undefined;
}

/**
 * Whether the destination side of a PlaceUnder has at least one legal host, or `undefined`
 * when the action names no host descriptor at all and the caller must apply its own default.
 */
function hostPreflight(ctx: EffectContext, action: Extract<Action, { kind: "PlaceUnder" }>): boolean | undefined {
  if (action.destination !== undefined) {
    return (
      candidatePermanents(ctx, {
        filter: action.destination.filter,
        count: action.destination.count,
      }).length > 0
    );
  }
  if (action.underSelectionRef !== undefined) {
    const hostId = ctx.selections?.get(action.underSelectionRef);
    return hostId !== undefined && ctx.game.permanentById(hostId) !== undefined;
  }
  if (action.underFilter?.isTriggerSource === true) {
    const triggerPermanentId =
      ctx.trigger?.wouldBePlayedInstanceId ??
      ctx.trigger?.subjectPermanentId ??
      ctx.trigger?.attackerPermanentId ??
      ctx.trigger?.deletedPermanentId;
    return triggerPermanentId !== undefined && ctx.game.permanentById(triggerPermanentId) !== undefined;
  }
  if (action.underFilter !== undefined) {
    return candidatePermanents(ctx, { filter: preflightHostFilter(action.underFilter), count: 1 }).length > 0;
  }
  return undefined;
}

/** Filter keys that describe the host's CURRENT digivolution cards rather than its identity. */
const DIGIVOLUTION_STACK_CONDITION_KEYS = [
  "digivolutionStackKind",
  "digivolutionStackKindExclude",
  "digivolutionStackNameOrTrait",
] as const;

/**
 * The destination filter to preflight a PlaceUnder activation against.
 *
 * A SELF-REFERENTIAL host is not chosen from the board — it IS the source's own permanent — so
 * the digivolution-stack keys on such a filter state a CONDITION on that fixed host ("...as the
 * bottom digivolution card of this Digimon with no Tamer cards in its digivolution cards",
 * BT20-003). Placement conditions are checked when the effect RESOLVES, not when it triggers:
 * the clause carries no "if" gate, so it activates alongside every other effect at its timing
 * and the turn player orders the whole simultaneous set (CR §15-4). Preflighting the stack
 * condition made BT20-003 miss its own [End of Your Turn] window whenever an earlier effect in
 * that window — BT14-087's inherited "play 1 [Eiji Nagasumi] from this Digimon's digivolution
 * cards" — was what made the placement legal. `runPlaceUnder` re-reads the full `underFilter`
 * and places nothing when the condition is still unmet at resolution.
 *
 * Every other key (and every non-self host, which really is a board scan the effect needs a
 * candidate for — BT17-050/Q2803) is preflighted unchanged.
 */
function preflightHostFilter(underFilter: Filter): Filter {
  if (underFilter.isSelfRef !== true) return underFilter;
  if (!DIGIVOLUTION_STACK_CONDITION_KEYS.some((key) => underFilter[key] !== undefined)) return underFilter;
  const relaxed = { ...underFilter };
  for (const key of DIGIVOLUTION_STACK_CONDITION_KEYS) delete relaxed[key];
  return relaxed;
}

/**
 * "Trash the top/bottom digivolution card of <target>". Resolve the target permanents,
 * then for each take `amount` source cards from the top (last in `stack` — the card
 * directly beneath the top, which is the "top" digivolution card) or bottom (`stack`
 * front) and trash them via the trash verb (which can move a stack card to its owner's
 * trash). A permanent with no digivolution cards is unaffected.
 */
export async function runTrashDigivolution(
  ctx: EffectContext,
  action: Extract<Action, { kind: "TrashDigivolution" }>,
): Promise<boolean> {
  // Generic scaling is computed once by runAction and folded into `amount` by
  // runDigivolutionAction. Recomputing it here squared the multiplier for pooled
  // TrashDigivolution actions (BT25-103: 2 source cards incorrectly trashed 4).
  // targetColors remains per-host and is handled below after each target is known.
  const amount = action.amount ?? 1;
  const fromTop = action.fromTop ?? true;
  const minimum = action.minAmount;
  const isDigiBurst = /Digi-?Burst/i.test(action.raw ?? "");
  const trashOptions = {
    byEffectSeat: ctx.source.ownerSeat,
    byEffectCardId: ctx.source.cardId,
    ...(isDigiBurst ? { isDigiBurst: true } : {}),
  };
  const stackCardMatches = (card: { cardId: string }): boolean =>
    action.cardFilter === undefined || definitionMatches(action.cardFilter, ctx.game.definitionOf(card));

  // "acrossDigimon": pool all digivolution cards from every matching permanent and let
  // the controller pick `amount` from the combined pool (EX12-035 "any 4 digivolution
  // cards from your opponent's Digimon"). NOT routed through redirectDigivolutionTrashHosts:
  // no KB ruling describes how a pooled, individually-per-card selection across several hosts
  // collapses onto one reacting Digimon, so this scope is left outside BT10-084's redirect
  // rather than guessed at (residual — see BT10-084.ts).
  if (action.scope === "acrossDigimon") {
    const permanents = candidatePermanents(ctx, action.target);
    // Build a flat candidate list: each entry knows which host permanent it came from.
    const pool: { instanceId: string; permanentId: string }[] = [];
    for (const permanent of permanents) {
      for (const card of permanent.stack) {
        if (!stackCardMatches(card)) continue;
        pool.push({ instanceId: card.instanceId, permanentId: permanent.permanentId });
      }
    }
    if (pool.length === 0) {
      ctx.lastEffectActed = false;
      return false;
    }
    if (
      action.optional === true &&
      action.abortOnDecline === true &&
      typeof amount === "number" &&
      pool.length < (action.upTo === true ? (action.minAmount ?? 1) : amount)
    ) {
      ctx.lastEffectActed = false;
      return false;
    }
    const take = amount === "all" ? pool.length : Math.min(amount, pool.length);
    let chosen: string[];
    if (pool.length <= take && action.upTo !== true) {
      chosen = pool.map((c) => c.instanceId);
    } else {
      chosen = await ctx.ask.selectCards(ctx, {
        candidates: pool.map((c) => c.instanceId),
        min: action.upTo === true ? Math.min(action.minAmount ?? 1, pool.length) : take,
        max: take,
      });
    }
    // Group chosen instance ids back to their host permanents, then trash per-host.
    const byHost = new Map<string, string[]>();
    for (const id of chosen) {
      const entry = pool.find((c) => c.instanceId === id);
      if (entry === undefined) continue;
      const bucket = byHost.get(entry.permanentId) ?? [];
      bucket.push(id);
      byHost.set(entry.permanentId, bucket);
    }
    for (const [pid, ids] of byHost) {
      if (ids.length > 0) await ctx.fx.trashDigivolutionCards(pid, ids, trashOptions);
    }
    ctx.lastEffectActed = chosen.length > 0;
    if (action.trackCount !== undefined) {
      if (ctx.namedCounts === undefined) ctx.namedCounts = new Map();
      ctx.namedCounts.set(action.trackCount, chosen.length);
    }
    return amount === "all" || action.upTo === true ? chosen.length > 0 : chosen.length === amount;
  }

  // Default: single-target path — resolve 1 permanent, trash `amount` from its stack.
  const resolvedIds = await resolvePermanentTargets(ctx, action.target);
  if (resolvedIds.length === 0) {
    ctx.lastEffectActed = false;
    return false;
  }
  // Redirect BEFORE selecting which cards to take (KB BT10-084 Q2002-Q2008): a "would trash"
  // reaction may collapse this whole operation onto ONE reacting Digimon's stack instead. The
  // loop below then re-applies the SAME fromTop/choose/amount logic to whichever ids come back,
  // which is what preserves the original action's count and selection kind after a redirect.
  const { hostPermanentIds: permanentIds, chooser } = await redirectDigivolutionTrash(ctx, resolvedIds);
  // Check the supply only after replacement chooses the actual host. Q2007 explicitly
  // permits SnowAgumon to choose a source-free Digimon and have Tactimon supply the
  // digivolution card instead; checking the original host would suppress that window.
  if (
    minimum !== undefined &&
    permanentIds.some((id) => (ctx.game.permanentById(id)?.stack.filter(stackCardMatches).length ?? 0) < minimum)
  ) {
    ctx.lastEffectActed = false;
    return false;
  }
  // An optional fixed-count action that gates the rest of its effect is an atomic
  // activation cost (for example BT5-111: "by trashing 2 ... end the attack").
  // If any selected host cannot supply the printed count, do not partially trash its
  // remaining cards and abort the payload. Mandatory trash effects still do as much as
  // possible, including after a BT10-084 redirect.
  if (
    (action.optional === true || isDigiBurst) &&
    action.abortOnDecline === true &&
    typeof amount === "number" &&
    permanentIds.some((pid) => (ctx.game.permanentById(pid)?.stack.filter(stackCardMatches).length ?? 0) < amount)
  ) {
    ctx.lastEffectActed = false;
    return false;
  }
  // Per host permanent: which of its digivolution-stack cards this effect trashes. The
  // dedicated primitive trashes them AND fires whenDigivolutionTrashed (carrying the host as
  // subject) — a GENUINE effect-trash. A return-to-hand bounce clears digivolution cards via
  // returnToHand, a different path that never routes here, so it does not fire (KB P-004 Q4113).
  // Track the total cards actually trashed across every host so "this effect didn't trash"
  // (BT18-034, EX7-067's "then" clause) reads a real outcome instead of defaulting to unset.
  let totalTrashed = 0;
  for (const pid of permanentIds) {
    const permanent = ctx.game.permanentById(pid);
    if (permanent === undefined) continue;
    const stack = permanent.stack.filter(stackCardMatches);
    // Count before trashing: removing sources can immediately change gained colors.
    const targetAmount =
      action.scaling?.unit === "targetColors"
        ? new Set(ctx.game.effectiveColors?.(permanent) ?? ctx.game.definitionOf(permanent.topCard).colors).size
        : amount;
    let take = targetAmount === "all" ? stack.length : Math.min(targetAmount, stack.length);
    if (action.upTo === true && action.choose !== true && typeof targetAmount === "number" && take > 1) {
      // "up to" source trash still requires one card under CR 1-3-6, then lets the
      // controller decline each additional card. Asking one card at a time preserves
      // the printed bottom/top prefix; a free multi-card selection could skip a card.
      for (let i = 1; i < take; i++) {
        if (!(await chooser.optional(ctx, `Trash another digivolution card (${i + 1} of ${take})?`))) {
          take = i;
          break;
        }
      }
    }
    let ids: string[];
    if (action.choose === true) {
      // "trash any 1 card under [permanent]" (RB1-016, KB Q4094): the controller picks freely
      // from the whole stack rather than a deterministic top/bottom slice.
      const candidateIds = stack.map((card) => card.instanceId);
      ids =
        candidateIds.length <= take && action.upTo !== true
          ? candidateIds
          : await chooser.selectCards(
              isDigiBurst && action.abortOnDecline === true ? { ...ctx, payingDeclinableCost: true } : ctx,
              {
                candidates: candidateIds,
                min: action.upTo === true ? Math.min(action.minAmount ?? 1, candidateIds.length) : take,
                max: take,
              },
            );
    } else {
      ids = [];
      for (let i = 0; i < take; i++) {
        // `stack` is ordered bottom (index 0) -> top (last); the "top digivolution card"
        // is the most-recently-added source at the end.
        const idx = fromTop ? stack.length - 1 - i : i;
        const instance = stack[idx];
        if (instance !== undefined) ids.push(instance.instanceId);
      }
    }
    if (ids.length > 0) {
      await ctx.fx.trashDigivolutionCards(pid, ids, trashOptions);
      totalTrashed += ids.length;
    }
  }
  ctx.lastEffectActed = totalTrashed > 0;
  if (action.trackCount !== undefined) {
    ctx.namedCounts ??= new Map();
    ctx.namedCounts.set(action.trackCount, totalTrashed);
  }
  if (amount === "all" || action.upTo === true) return totalTrashed > 0;
  if (action.scaling?.unit === "targetColors") return totalTrashed > 0;
  return totalTrashed === amount * permanentIds.length;
}
