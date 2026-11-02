// Matching a filter against the payload of the firing trigger event.

import type { EffectContext } from "../../EffectContext.js";
import { definitionMatches, matchNameOrTrait } from "./definition.js";
import { permanentMatchesFilter, seatsForController } from "./permanent.js";
import type { Filter } from "@aegis/shared";

/**
 * Resolve the permanent whose entry/exit drove a SubTrigger event (the played card, the
 * deleted permanent, the attacker, …) from the freshly bound context's `trigger` payload,
 * and test the captured `sourceFilter` against it. Controller scope ("mine"/"opponent") is
 * checked relative to the watcher's source seat (via `seatsForController`, exactly as the
 * normal target enumeration does); the rest of the filter (kind/colors/level/trait/DP) goes
 * through `permanentMatchesFilter`. An unresolved subject never matches (the event is not
 * about a card this watcher cares for).
 */
export function matchingSubjectPermanentIds(subCtx: EffectContext, filter: Filter): string[] {
  const t = subCtx.trigger;
  // Top-card trash promotes the next source before reactions resolve. Match the old
  // printed identity rather than the promoted Digimon (BT21-094 Armor Form watcher).
  if (t.trashedDigimonTop !== undefined) {
    const snapshot = t.trashedDigimonTop;
    const selfId = subCtx.source.permanent()?.permanentId;
    if (filter.isSelfRef === true && selfId !== snapshot.permanentId) return [];
    if ((filter.excludeSelf === true || filter.isSelfRef === false) && selfId === snapshot.permanentId) return [];
    if (!seatsForController(subCtx, filter).includes(snapshot.controllerSeat)) return [];
    const definition = subCtx.game.definitionOf({ cardId: snapshot.cardId });
    return definitionMatches(filter, definition) ? [snapshot.permanentId] : [];
  }
  // `whenOptionUsed` carries the used Option's instance id, not a battle-area
  // permanent id. Resolve that event directly from the owner's zones so trait/name
  // source filters remain meaningful both at use (resolvingOption) and activation. A Plug-In that linked
  // itself (ST22-08) sits among a permanent's linked cards once its effect resolves.
  if (t.usedOptionCost !== undefined && t.subjectPermanentId !== undefined) {
    const allowedSeats = seatsForController(subCtx, filter);
    for (const seat of allowedSeats) {
      const player = subCtx.game.player(seat);
      const permanentCards = Array.from(player.battleArea).flatMap((permanent) => [
        ...permanent.stack,
        permanent.topCard,
        ...permanent.linked,
      ]);
      const card = [
        player.resolvingOption,
        ...player.hand,
        ...player.trash,
        ...player.security,
        ...permanentCards,
      ].find((candidate) => candidate?.instanceId === t.subjectPermanentId);
      if (card !== undefined && definitionMatches(filter, subCtx.game.definitionOf(card)))
        return [t.subjectPermanentId];
    }
  }
  const subjectIds =
    t.subjectPermanentIds ??
    [
      t.subjectPermanentId ??
        t.attackerPermanentId ??
        t.deletedPermanentId ??
        t.suspendedPermanentId ??
        t.unsuspendedPermanentId,
    ].filter((id): id is string => id !== undefined);
  if (subjectIds.length === 0) return [];
  const subjectSnapshot = t.linkTrashedSubject ?? t.digivolvedSubject;
  // A POSITIVE self-gate: `isSelfRef: true` means the event subject must BE this watcher's own
  // card.PermanentOfThisCard()`). permanentMatchesFilter only enforces the NEGATIVE excludeSelf /
  // isSelfRef===false direction, so the positive restriction lives here at the subject seam.
  // `fromDigivolution: true` gates on the played card having originated from a digivolution
  // stack. The `whenPlayed` fire seam sets TriggerInfo.playedFromZone to "digivolutionCards"
  // when the played instance came from a battle-area permanent's digivolution stack (BT20-028
  // KB Q4321: "when any of your Digimon are played from digivolution cards").
  if (filter.fromDigivolution === true && subCtx.trigger.playedFromZone !== "digivolutionCards") {
    return [];
  }
  // `byEffect: true` gates events caused by effects. Play events carry `playedByEffect`, while
  // effect-driven digivolutions carry `enteredByEffect`; their corresponding manual actions
  // carry neither marker.
  if (
    filter.byEffect === true &&
    subCtx.trigger.playedByEffect !== true &&
    subCtx.trigger.enteredByEffect === undefined
  ) {
    return [];
  }
  let effectiveFilter = filter;
  if (filter.zone !== undefined && filter.zone !== "battleArea" && subCtx.trigger.playedFromZone !== undefined) {
    if (subCtx.trigger.playedFromZone !== filter.zone) return [];
    effectiveFilter = { ...filter, zone: undefined };
  }
  const allowedSeats = seatsForController(subCtx, effectiveFilter);
  return subjectIds.filter((subjectId) => {
    const subject =
      subjectSnapshot?.permanentId === subjectId
        ? subjectSnapshot
        : (subCtx.game.permanentById(subjectId) ??
          (t.playedSubject?.permanentId === subjectId ? t.playedSubject : undefined));
    if (subject === undefined) return false;
    if (filter.isSelfRef === true) {
      const self = subCtx.source.permanent();
      if (self === undefined || self.permanentId !== subject.permanentId) return false;
    }
    if (!allowedSeats.includes(subject.controllerSeat)) return false;
    // Attack watchers evaluate a DP threshold at attack declaration. The combat seam captures
    // the post-suspension value before [When Attacking] effects resolve (KB Q6263); otherwise
    // a later self-boost could incorrectly make a 12000 DP attacker satisfy a 13000+ watcher.
    if (
      effectiveFilter.dp !== undefined &&
      subjectId === t.attackerPermanentId &&
      t.attackerDPAtDeclaration !== undefined
    ) {
      const { dp, ...withoutDp } = effectiveFilter;
      const actual = t.attackerDPAtDeclaration;
      const threshold = dp.relativeToSource ? subCtx.source.permanent()?.currentDP : dp.value;
      const dpMatches =
        threshold !== undefined &&
        ((dp.op === "gte" && actual >= threshold) ||
          (dp.op === "lte" && actual <= threshold) ||
          (dp.op === "eq" && actual === threshold));
      return dpMatches && permanentMatchesFilter(subCtx, subject, withoutDp, subCtx.source);
    }
    return permanentMatchesFilter(subCtx, subject, effectiveFilter, subCtx.source);
  });
}

export function subjectMatchesFilter(subCtx: EffectContext, filter: Filter): boolean {
  return matchingSubjectPermanentIds(subCtx, filter).length > 0;
}

/**
 * whenAddSecurity trait gate: did at least one card JUST ADDED to the watcher controller's
 * security stack (TriggerInfo.addedToSecurityInstanceIds) match `filter`, while being FACE UP?
 * EqualsTraits("Zaxon"))`). A ＜Recovery＞-style face-down add never satisfies it. An absent
 * filter (no trait clause) means "any added card" — but the IR always carries the trait filter.
 */
export function triggerAddedSecurityMatches(ctx: EffectContext, filter: Filter | undefined): boolean {
  const ids = ctx.trigger.addedToSecurityInstanceIds;
  if (ids === undefined || ids.length === 0) return false;
  const seat = ctx.trigger.addedToSecuritySeat ?? ctx.source.ownerSeat;
  const security = ctx.game.player(seat).security;
  for (const id of ids) {
    const card = security.find((c) => c.instanceId === id);
    if (card === undefined || card.faceUp !== true) continue;
    if (filter === undefined) return true;
    const def = ctx.game.definitionOf({ cardId: card.cardId } as never);
    if (filter.nameOrTrait && filter.nameOrTrait.length > 0) {
      if (filter.nameOrTrait.some((ref) => matchNameOrTrait(def, ref))) return true;
    }
  }
  return false;
}

/**
 * triggerSubjectHasColor gate: does the permanent that drove this SubTrigger event
 * (TriggerInfo.subjectPermanentId — the just-played / just-digivolved Digimon) carry one of
 * (`permanent.TopCard.CardColors.Contains(CardColor.Red)`), read at activation (fire) time so
 * a Digimon that digivolved to a red stage is checked POST-digivolve (KB Q6290/Q6291). An
 * unresolved subject, a subject with no top card, or an absent color filter never matches.
 */
export function triggerSubjectMatchesColor(ctx: EffectContext, filter: Filter | undefined): boolean {
  const wanted = filter?.colors;
  if (wanted === undefined || wanted.length === 0) return false;
  const subjectId = ctx.trigger.subjectPermanentId;
  if (subjectId === undefined) return false;
  const subject = ctx.game.permanentById(subjectId);
  if (subject?.topCard === undefined) return false;
  const colors = ctx.game.definitionOf(subject.topCard).colors;
  return wanted.some((w) => colors.includes(w as never));
}

export function triggerSubjectMatchesFilter(ctx: EffectContext, filter: Filter | undefined): boolean {
  if (filter === undefined) return false;
  const subjectIds =
    ctx.trigger.subjectPermanentIds ??
    (ctx.trigger.subjectPermanentId === undefined ? [] : [ctx.trigger.subjectPermanentId]);
  return subjectIds.some((subjectId) => {
    const subject = ctx.game.permanentById(subjectId);
    return subject !== undefined && permanentMatchesFilter(ctx, subject, filter, ctx.source);
  });
}
