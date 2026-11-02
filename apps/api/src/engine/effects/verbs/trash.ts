import { locateMoveOrigins } from "#api/engine/effects/verbs/locateMoveOrigins";
import { groupCardsByOrigin } from "#api/engine/effects/verbs/groupCardsByOrigin";
import { Permanent, Zone, EffectTiming, CardInstance, type Seat, type ServerEvent } from "@aegis/shared";
import {
  applyOverflow,
  extractPermanentAt,
  findPermanentInState,
  insertCard,
  setBreeding,
} from "../../state/access.js";
import { isOptionPermanent } from "../../cards/cardData.js";
import { hostOfLinkedInstance, hostOfStackInstance, removeLooseInstance } from "../verbs/looseInstances.js";

import type { PrimitivesContext } from "./context.js";
import { fireSecurityTrashedEvents } from "./securityTrashedEvents.js";

/**
 * Trashing loose cards and a permanent's digivolution cards.
 */

type TrashedSources = NonNullable<Extract<ServerEvent, { kind: "cardsMoved" }>["trashedSources"]>;

export function createTrashVerbs(pc: PrimitivesContext) {
  const { engine, access, continuous, dropPermanentLedgers, ledger, player, state } = pc;
  // Reached through the context because these are built in sibling modules: the
  // whole set exists before any of it runs, so forwarding at call time is safe.
  const isRestricted: PrimitivesContext["helpers"]["isRestricted"] = (...args) => pc.helpers.isRestricted(...args);
  const permanentByTopInstance: PrimitivesContext["helpers"]["permanentByTopInstance"] = (...args) =>
    pc.helpers.permanentByTopInstance(...args);

  // Trash is public and face up (§3-6-3), whatever zone the card left. Flip it before `insertCard`, which
  // tells the visibility port immediately: a card hidden in hand or face down under a stack
  // would otherwise reach the opponent without its identity.
  const insertFaceUpIntoTrash = (card: CardInstance): void => {
    card.faceUp = true;
    insertCard(player(card.ownerSeat), Zone.Trash, card);
  };

  const trash = async (
    instanceIds: string[],
    opts?: { byEffectSeat?: Seat; byRule?: boolean; trashedSources?: TrashedSources },
  ): Promise<CardInstance[]> => {
    // A resolving effect can add a self-trash watcher to hand and discard it before the
    // next timing boundary (BT24-098 drawing BT24-013/-026/-045). Derive its resident
    // watcher while it is still in hand, before moving the batch to trash.
    if (state.players.some((owner) => owner.hand.some((card) => instanceIds.includes(card.instanceId)))) {
      await engine.recomputeContinuousEffects?.();
    }
    // "Effects can't trash it" (§15-1-3, EX9-005). The restriction is keyed by permanent, so it
    // covers every card that permanent owns — its top card, digivolution stack, and link cards.
    // `stackTrashLock` remains the narrower, seat-aware lock for stack cards alone (EX11-070);
    // this is the blanket form. A loose hand/security/deck card belongs to no permanent and is
    // never gated here.
    instanceIds = instanceIds.filter((id) => {
      const host =
        hostOfStackInstance(state, id)?.hostPermanentId ??
        hostOfLinkedInstance(state, id) ??
        permanentByTopInstance(id);
      return opts?.byRule === true || host === undefined || !isRestricted(host, "beTrashed");
    });
    const moved: CardInstance[] = [];
    // SubTrigger bus (System B): "when a link card is trashed" (whenLinkTrashed) fires for each
    // instance that, at trash time, sits in a permanent's `linked` list — a GENUINE effect trash of
    // a link card. The CR 4-9-5 over-limit sweep routes through this verb with `byRule` and is
    // excluded below (KB EX10-062 Q5172 / EX10-073 Q5188). The host
    // permanent (whose link card this is) is carried as `subjectPermanentId` so a watcher can gate
    // on "this Digimon" / "an opponent's Digimon".
    const linkTrashed: { instanceId: string; hostPermanentId: string; hostSnapshot: Permanent }[] = [];
    // Rule-based link-limit cleanup suppresses whenLinkTrashed, but removing the old link
    // still changes the host's observable DP and linked keywords. Keep the host identity
    // separately so refreshing those values does not depend on emitting a subtrigger.
    const linkedHostsToRefresh = new Set<string>();
    const linkedHostByInstance = new Map<string, string>();
    const optionBattleAreaTrashed: { instanceId: string; permanentId: string }[] = [];
    const trashedPermanents: NonNullable<Extract<ServerEvent, { kind: "cardsMoved" }>["trashedPermanents"]> = [];
    // CR 4-9-5's over-limit sweep is rule processing, not an effect: a watcher reading "when
    // effects trash any of this Digimon's link cards" must not see it (Q5088, Q5172, Q5188).
    for (const instanceId of instanceIds) {
      const host = hostOfLinkedInstance(state, instanceId);
      if (host !== undefined) {
        linkedHostByInstance.set(instanceId, host);
        if (engine.fireSubTrigger && opts?.byRule !== true) {
          const hostPermanent = access.permanentById(host);
          if (hostPermanent !== undefined)
            linkTrashed.push({
              instanceId,
              hostPermanentId: host,
              hostSnapshot: hostPermanent.clone(),
            });
        }
      }
    }
    // <Overflow> (CR §4-18) eligibility, recorded BEFORE removal: this verb also trashes loose
    // hand/security/deck cards, which are NOT "under a card" and must NOT trigger Overflow — only
    // an instance currently sitting in a permanent's digivolution stack or linked list qualifies
    // as "moving from under a card to another area".
    const underCard = new Set(
      instanceIds.filter(
        (id) => hostOfStackInstance(state, id) !== undefined || hostOfLinkedInstance(state, id) !== undefined,
      ),
    );
    // Cards sitting in a security stack at trash time: an effect is trashing them FROM security
    // (ST22-10's leave-prevention pays by trashing itself from security — KB Q5438). Recorded before
    // removal so OnDiscardSecurity can fire once the card has landed in trash.
    const securitySeatByInstance = new Map<string, Seat>();
    for (const p of state.players) {
      if (p === undefined) continue;
      for (const card of p.security)
        if (instanceIds.includes(card.instanceId)) securitySeatByInstance.set(card.instanceId, p.seat);
    }
    const fromSecurity = [...securitySeatByInstance.keys()];
    // Seats whose HAND holds a card about to be trashed (recorded before removal). After the move,
    // `whenHandTrashed` fires ONCE per affected seat for this trash ACTION, regardless of card count
    // (KB Q6400/Q6401), carrying the seat so a "when YOUR hand is trashed from" watcher (BT25-084)
    // can gate on its own hand.
    const handTrashedSeats = new Set<Seat>();
    const fromHand: { instanceId: string; cardId: string; seat: Seat }[] = [];
    for (const p of state.players) {
      if (p === undefined) {
        continue;
      }
      for (const card of p.hand) {
        if (!instanceIds.includes(card.instanceId)) {
          continue;
        }
        handTrashedSeats.add(p.seat);
        fromHand.push({ instanceId: card.instanceId, cardId: card.cardId, seat: p.seat });
      }
    }
    // "When an effect trashes this card in your battle area" (BT19-093, BT19-098, P-159) reads
    // the live permanent, so it fires before the move, as in the deletion path.
    if (opts?.byEffectSeat !== undefined && opts.byRule !== true) {
      for (const owner of state.players) {
        for (const permanent of [...owner.battleArea]) {
          if (permanent.topCard === undefined || !instanceIds.includes(permanent.topCard.instanceId)) continue;
          if (!isOptionPermanent(permanent)) continue;
          await engine.fireSubTrigger?.("whenTrashedByEffect", {
            trashedByEffectPermanentId: permanent.permanentId,
            byEffectSeat: opts.byEffectSeat,
          });
        }
      }
    }
    const origins = locateMoveOrigins({ state, instanceIds });
    for (const instanceId of instanceIds) {
      // Options placed in the battle area are permanents, but their printed
      // trash cost names the Option card itself. Remove that permanent as a
      // whole and publish the dedicated watcher event after the move.
      let removedOptionPermanent: CardInstance | undefined;
      for (const owner of state.players) {
        const index = owner.battleArea.findIndex((p) => p.topCard?.instanceId === instanceId);
        const permanent = index >= 0 ? owner.battleArea[index] : undefined;
        if (permanent?.topCard !== undefined && isOptionPermanent(permanent)) {
          const extracted = extractPermanentAt(owner, index)!;
          dropPermanentLedgers(extracted.permanentId);
          removedOptionPermanent = extracted.topCard;
          for (const card of [...extracted.stack, ...extracted.linked]) insertFaceUpIntoTrash(card);
          optionBattleAreaTrashed.push({ instanceId, permanentId: extracted.permanentId });
          trashedPermanents.push({
            permanentId: extracted.permanentId,
            instanceId,
            cardId: extracted.topCard.cardId,
            ...(extracted.topCard.artId ? { artId: extracted.topCard.artId } : {}),
            seat: extracted.controllerSeat,
          });
          break;
        }
      }
      if (removedOptionPermanent !== undefined) {
        insertFaceUpIntoTrash(removedOptionPermanent);
        moved.push(removedOptionPermanent);
        continue;
      }
      // Pass includeTrash=false: a card already in trash must not be removed-then-
      // re-pushed (this verb moves cards INTO trash, never out of it).
      const sourceHost = hostOfStackInstance(state, instanceId);
      const sourceHostCardId = sourceHost
        ? access.permanentById(sourceHost.hostPermanentId)?.topCard.cardId
        : undefined;
      const removed = removeLooseInstance(state, instanceId, false);
      if (removed === undefined) continue;
      insertFaceUpIntoTrash(removed);
      removed.trashOriginCardId = opts?.trashedSources?.hostCardId ?? sourceHostCardId ?? "";
      moved.push(removed);
    }
    applyOverflow(
      engine.memory,
      moved.filter((c) => underCard.has(c.instanceId)),
      state.turnSeat,
    );
    for (const { cards, ...origin } of groupCardsByOrigin({ origins, cards: moved })) {
      const fieldTrashes = trashedPermanents.filter((permanent) =>
        cards.some((card) => card.instanceId === permanent.instanceId),
      );
      engine.emit({
        kind: "cardsMoved",
        instanceIds: cards.map((card) => card.instanceId),
        ...origin,
        to: Zone.Trash,
        ...(origin.from === Zone.Deck || origin.from === Zone.Hand
          ? {
              cardIds: cards.map((card) => card.cardId),
              artIds: cards.map((card) => card.artId || card.cardId),
              seat: cards[0]!.ownerSeat,
            }
          : {}),
        ...(fieldTrashes.length > 0 ? { trashedPermanents: fieldTrashes } : {}),
        ...(opts?.trashedSources !== undefined
          ? {
              cardIds: cards.map((card) => card.cardId),
              artIds: cards.map((card) => card.artId || card.cardId),
              seat: cards[0]!.ownerSeat,
              trashedSources: opts.trashedSources,
            }
          : {}),
      });
    }
    // Identify only linked instances that actually moved; restricted or missing ids must not
    // cause an unrelated host refresh.
    const movedIds = new Set(moved.map((c) => c.instanceId));
    for (const instanceId of movedIds) {
      const host = linkedHostByInstance.get(instanceId);
      if (host !== undefined) linkedHostsToRefresh.add(host);
    }
    // A by-rule link removal intentionally emits no whenLinkTrashed event. Refresh the
    // affected host DP directly after movement so the stale linkDp contribution cannot remain
    // observable; the continuous layer is refreshed immediately below without firing the
    // suppressed whenLinkTrashed watcher.
    for (const hostPermanentId of linkedHostsToRefresh) {
      if (findPermanentInState(state, hostPermanentId) !== undefined) ledger.recomputeDP(state, hostPermanentId);
    }
    if (linkedHostsToRefresh.size > 0) await engine.recomputeContinuousEffects?.();
    // Fire AFTER the move, gated to instances that actually left the linked list.
    for (const entry of linkTrashed) {
      if (!movedIds.has(entry.instanceId)) continue;
      const currentHost = access.permanentById(entry.hostPermanentId) ?? entry.hostSnapshot;
      await engine.fireSubTrigger!("whenLinkTrashed", {
        subjectPermanentId: entry.hostPermanentId,
        linkTrashedSubject: currentHost.clone(),
      });
    }
    for (const { instanceId } of optionBattleAreaTrashed) {
      await engine.fireSubTrigger?.("whenOptionInBattleAreaTrashed", { trashedOptionInstanceId: instanceId });
    }
    // Battle-area Options paid through a generic `trash` cost leave as whole permanents, but
    // this is still a trash event rather than a deletion. Publish the typed batch timing after
    // movement so printed `When this card is trashed in your battle area` effects resolve with
    // the same post-move identity/owner semantics as deletePermanent (BT19-095 / Q3170).
    if (optionBattleAreaTrashed.length > 0 && opts?.byRule !== true && engine.fireTiming) {
      await engine.fireTiming(EffectTiming.WhenTrashedFromBattleArea, {
        deletedPermanentId: optionBattleAreaTrashed[0]!.permanentId,
        deletedInstanceIds: optionBattleAreaTrashed.map(({ instanceId }) => instanceId),
      });
    }
    const discardedFromSecurity = fromSecurity.filter((id) => movedIds.has(id));
    if (discardedFromSecurity.length > 0) {
      // A card trashing itself from security as a cost still removes it from that stack, so
      // "when your security stack is removed from" watchers see it (ST22-06 with ST22-10).
      for (const seat of new Set(discardedFromSecurity.map((id) => securitySeatByInstance.get(id)!))) {
        const trashedHere = moved.filter((card) => securitySeatByInstance.get(card.instanceId) === seat);
        await fireSecurityTrashedEvents(engine, seat, trashedHere, opts?.byRule !== true);
      }
      await engine.fireDiscardedFromSecurity?.(discardedFromSecurity);
    }
    const handTrashedInstanceIdsOf = (seat: Seat): string[] =>
      fromHand
        .filter((entry) => entry.seat === seat && movedIds.has(entry.instanceId))
        .map((entry) => entry.instanceId);
    // Fire once per seat whose hand actually lost a card (the move may have skipped some ids).
    for (const seat of handTrashedSeats) {
      const handTrashedInstanceIds = handTrashedInstanceIdsOf(seat);
      if (handTrashedInstanceIds.length > 0) {
        await engine.fireSubTrigger?.("whenHandTrashed", {
          handTrashedSeat: seat,
          handTrashedInstanceIds,
          ...(opts?.byEffectSeat !== undefined ? { byEffectSeat: opts.byEffectSeat } : {}),
        });
      }
    }
    for (const entry of fromHand) {
      if (!movedIds.has(entry.instanceId)) continue;
      await engine.fireSubTrigger?.("whenTrashedFromHand", {
        handTrashedSeat: entry.seat,
        handTrashedInstanceIds: handTrashedInstanceIdsOf(entry.seat),
        trashedFromHandCardId: entry.cardId,
        trashedFromHandInstanceId: entry.instanceId,
        ...(opts?.byEffectSeat !== undefined ? { byEffectSeat: opts.byEffectSeat } : {}),
      });
    }
    return moved;
  };

  /** Trash the complete breeding stack without firing deletion windows. */
  const trashBreedingPermanent = async (seat: Seat, opts?: { byEffectSeat?: Seat }): Promise<CardInstance[]> => {
    const owner = player(seat);
    const permanent = owner.breeding;
    if (permanent?.topCard === undefined || isRestricted(permanent.permanentId, "beTrashed")) return [];
    setBreeding(owner, undefined);
    dropPermanentLedgers(permanent.permanentId);
    const moved = [permanent.topCard, ...permanent.stack, ...permanent.linked];
    for (const card of moved) insertFaceUpIntoTrash(card);
    applyOverflow(engine.memory, moved, state.turnSeat);
    engine.emit({
      kind: "cardsMoved",
      instanceIds: moved.map((card) => card.instanceId),
      from: Zone.Breeding,
      to: Zone.Trash,
    });
    if (opts?.byEffectSeat !== undefined) {
      await engine.fireSubTrigger?.("whenTrashedByEffect", {
        trashedByEffectPermanentId: permanent.permanentId,
        byEffectSeat: opts.byEffectSeat,
      });
    }
    return moved;
  };

  /**
   * Trash digivolution-stack cards of `hostPermanentId` BY AN EFFECT (the producing site for
   * the whenDigivolutionTrashed SubTrigger; KB P-004 Q4113). Moves the cards via `trash`, then
   * fires whenDigivolutionTrashed once for the whole trash, carrying the host as subject.
   * A return-to-hand bounce that clears digivolution cards routes through returnToHand, never
   * here, so the bounce-clear never fires this event.
   */
  const trashDigivolutionCards = async (
    hostPermanentId: string,
    instanceIds: string[],
    opts?: { byEffectSeat?: Seat; byEffectCardId?: string; isDigiBurst?: boolean },
  ): Promise<CardInstance[]> => {
    // EX11-070 stacked-trash-lock (KB Q5943): an OPPONENT effect may not trash the host's stacked
    // cards. The lock is scoped to the host's opponent — the controller's OWN effects still trash
    //. With no `byEffectSeat` (a rules/non-attributed
    // trash) the lock is conservatively NOT applied, mirroring the engine's other byEffectSeat-gated
    // checks. A locked, opponent-attributed trash removes nothing (returns []).
    if (opts?.byEffectSeat !== undefined && continuous.stackTrashLocked(hostPermanentId)) {
      const hostSeat = access.permanentById(hostPermanentId)?.controllerSeat;
      if (hostSeat !== undefined && opts.byEffectSeat !== hostSeat) return [];
    }
    // BT9-109 X Antibody protects only its own instance, from every effect (including its
    // controller's). Keep other requested cards eligible so "trash the bottom 2" can trash the
    // unprotected one (KB Q1922). Rule-driven identity cleanup uses other seams and is unaffected.
    const hostBeforeTrash = access.permanentById(hostPermanentId);
    if (
      hostBeforeTrash === undefined ||
      hostBeforeTrash.inBreeding ||
      !state.players[hostBeforeTrash.controllerSeat]?.battleArea.some(
        (permanent) => permanent.permanentId === hostPermanentId,
      ) ||
      new Set(instanceIds).size !== instanceIds.length ||
      instanceIds.some((instanceId) => !hostBeforeTrash.stack.some((card) => card.instanceId === instanceId))
    )
      return [];
    const digiBurstDpBefore = opts?.isDigiBurst
      ? [...state.players].flatMap((seat) =>
          [...seat.battleArea].map(({ permanentId, currentDP }) => ({ permanentId, currentDP })),
        )
      : undefined;
    const discardedHostSnapshot = hostBeforeTrash.clone();
    const topStackCardInstanceId = hostBeforeTrash?.stack.at(-1)?.instanceId;
    const faceDownBeforeTrash = new Set(
      hostBeforeTrash?.stack.filter((card) => !card.faceUp).map((card) => card.instanceId) ?? [],
    );
    const trashableInstanceIds = instanceIds.filter((instanceId) => !continuous.stackCardTrashLocked(instanceId));
    // `trash` turns every card face up (BT26-094 Q7159; BT26-095 Q7163).
    const moved = await trash(
      trashableInstanceIds,
      hostBeforeTrash === undefined
        ? undefined
        : {
            trashedSources: {
              permanentId: hostPermanentId,
              hostCardId: hostBeforeTrash.topCard.cardId,
              ...(digiBurstDpBefore !== undefined ? { digiBurstDpBefore } : {}),
              ...(opts?.byEffectCardId !== undefined ? { sourceCardId: opts.byEffectCardId } : {}),
            },
          },
    );
    if (moved.length > 0 && engine.fireSubTrigger) {
      // Digi-Burst trashes all chosen sources simultaneously. Notify its self-card watchers in
      // one batch before any per-card fire can trigger a continuous recompute and tear down the
      // other just-trashed sources' watchers.
      if (opts?.isDigiBurst === true) {
        await engine.fireSubTrigger("onDigiBurstCardDiscarded", {
          subjectPermanentId: hostPermanentId,
          trashedDigivolutionHost: discardedHostSnapshot,
          trashedDigivolutionInstanceIds: moved.map((card) => card.instanceId),
          ...(opts.byEffectSeat !== undefined ? { byEffectSeat: opts.byEffectSeat } : {}),
          ...(opts.byEffectCardId !== undefined ? { byEffectCardId: opts.byEffectCardId } : {}),
          isDigiBurstTrash: true,
        });
      }
      // Exact inherited-source reactions are simultaneous. Fire their watchers against one
      // batch payload before any per-card event triggers a continuous recompute and removes
      // the other just-trashed sources' subscriptions.
      await engine.fireSubTrigger("onDigivolutionCardsDiscardedBatch", {
        subjectPermanentId: hostPermanentId,
        trashedDigivolutionHost: discardedHostSnapshot,
        trashedDigivolutionInstanceIds: moved.map((card) => card.instanceId),
        trashedFaceDownDigivolutionInstanceIds: moved
          .filter((card) => faceDownBeforeTrash.has(card.instanceId))
          .map((card) => card.instanceId),
        ...(opts?.byEffectSeat !== undefined ? { byEffectSeat: opts.byEffectSeat } : {}),
        ...(opts?.byEffectCardId !== undefined ? { byEffectCardId: opts.byEffectCardId } : {}),
        ...(opts?.isDigiBurst === true ? { isDigiBurstTrash: true } : {}),
      });
      for (const trashedCard of moved) {
        // onDigivolutionCardDiscarded ("when THIS digivolution card is trashed") FIRST: its
        // watcher is a CONTINUOUS install whose source IS the just-trashed card (isSelfRef,
        // BT10-006). fireSubTrigger runs a trailing recomputeContinuousEffects, which drops
        // that watcher because its source has left the field. Firing the broader
        // whenDigivolutionTrashed first would tear the self-referential watcher down before it
        // ever sees its own event. whenDigivolutionTrashed watchers anchor on a SURVIVING
        // permanent (the host / another card), so they are order-insensitive.
        await engine.fireSubTrigger("onDigivolutionCardDiscarded", {
          subjectPermanentId: hostPermanentId,
          trashedDigivolutionHost: discardedHostSnapshot,
          trashedDigivolutionInstanceId: trashedCard.instanceId,
          ...(opts?.byEffectSeat !== undefined ? { byEffectSeat: opts.byEffectSeat } : {}),
          ...(opts?.byEffectCardId !== undefined ? { byEffectCardId: opts.byEffectCardId } : {}),
          ...(opts?.isDigiBurst === true ? { isDigiBurstTrash: true } : {}),
        });
      }
      // One effect trashing several cards at once is one event, so "when effects trash cards
      // from under ..." watchers trigger once, not once per card (KB Q1306).
      await engine.fireSubTrigger("whenDigivolutionTrashed", {
        subjectPermanentId: hostPermanentId,
        trashedDigivolutionCardWasTop: moved.some((card) => card.instanceId === topStackCardInstanceId),
        ...(opts?.byEffectSeat !== undefined ? { byEffectSeat: opts.byEffectSeat } : {}),
      });
    }
    ledger.dropSourceInstances(
      state,
      moved.map((card) => card.instanceId),
    );
    return moved;
  };

  const canTrashDigivolutionCard = (instanceId: string): boolean =>
    ![...state.players].some((owner) => owner.breeding?.stack.some((card) => card.instanceId === instanceId)) &&
    !continuous.stackCardTrashLocked(instanceId);

  /**
   * Exact-count multi-host digivolution trash cost. Validation is deliberately a separate
   * phase from mutation: no `cardsMoved` event or trash watcher can invalidate a later host
   * after an earlier card has already paid part of the cost (BT26-006 Q6959).
   */

  return { trash, trashBreedingPermanent, trashDigivolutionCards, canTrashDigivolutionCard };
}
