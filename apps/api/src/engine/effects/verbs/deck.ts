import { locateMoveOrigins } from "#api/engine/effects/verbs/locateMoveOrigins";
import { groupCardsByOrigin } from "#api/engine/effects/verbs/groupCardsByOrigin";
import {
  CardKind,
  Zone,
  requireCardDefinition,
  CardInstance,
  type CardDefinition,
  type Permanent,
  type Seat,
} from "@aegis/shared";
import { applyOverflow, extractCardAt, insertCard, popFromStack, setTopCard } from "../../state/access.js";
import { collectForReturn } from "../verbs/looseInstances.js";

import type { PrimitivesContext } from "./context.js";
import { createPartitionReactions } from "./partition.js";

/**
 * Revealing, searching and adding to a security stack.
 */

export function createDeckVerbs(pc: PrimitivesContext) {
  const partition = createPartitionReactions(pc);
  const { engine, continuous, dropPermanentLedgers, effectSeatStack, ledger, player, state } = pc;
  // Reached through the context because these are built in sibling modules: the
  // whole set exists before any of it runs, so forwarding at call time is safe.
  const filterBouncePrevented: PrimitivesContext["helpers"]["filterBouncePrevented"] = (...args) =>
    pc.helpers.filterBouncePrevented(...args);
  const fireWhenReturnedPermanentsLeave: PrimitivesContext["helpers"]["fireWhenReturnedPermanentsLeave"] = (...args) =>
    pc.helpers.fireWhenReturnedPermanentsLeave(...args);
  const isRestricted: PrimitivesContext["helpers"]["isRestricted"] = (...args) => pc.helpers.isRestricted(...args);
  const permanentByTopInstance: PrimitivesContext["helpers"]["permanentByTopInstance"] = (...args) =>
    pc.helpers.permanentByTopInstance(...args);

  const reveal = async (seat: Seat, n: number, sourceCardId?: string): Promise<CardInstance[]> => {
    const p = player(seat);
    const revealed: CardInstance[] = [];
    for (let i = 0; i < n && i < p.deck.length; i++) {
      const card = p.deck[i];
      if (card === undefined) break;
      card.faceUp = true;
      revealed.push(card);
    }
    // A deck card flipped face-up stays inside a view-tagged private zone, so the opponent's
    // synchronized state never carries its identity — the event is the only channel that makes
    // the reveal public. Security reveals narrate through `revealCard` at their own call sites
    // and never route through here, so nothing is announced twice.
    for (const card of revealed)
      engine.emit({
        kind: "cardRevealed",
        seat,
        cardId: card.cardId,
        ...(card.artId ? { artId: card.artId } : {}),
        ...(sourceCardId !== undefined ? { sourceCardId } : {}),
      });
    return revealed;
  };

  /**
   * Search `seat`'s deck for cards matching `filter`, let the controller pick between
   * `min` and `max` of them, add the picked cards to hand, then re-hide the deck and
   * (caller) shuffle (source search-and-add-to-hand selection UI). The picked cards
   * leave the deck for the hand; the rest are turned face-down again. Returns the
   * instances added to hand. Awaits a player decision unless the candidate set is
   * empty or `min === max === candidates.length` (forced).
   */
  const searchDeck = async (
    seat: Seat,
    filter: (def: CardDefinition) => boolean,
    opts?: { min?: number; max?: number },
  ): Promise<CardInstance[]> => {
    const p = player(seat);
    const min = opts?.min ?? 0;
    const max = opts?.max ?? 1;
    const candidates = Array.from(p.deck).filter((c) => filter(requireCardDefinition(c.cardId)));
    if (candidates.length === 0) return [];

    let chosenIds: string[];
    if (min >= candidates.length && max >= candidates.length) {
      chosenIds = candidates.map((c) => c.instanceId); // forced: take all matches
    } else {
      chosenIds = await engine.ask.selectInstances(
        seat,
        candidates.map((c) => c.instanceId),
        min,
        Math.min(max, candidates.length),
        "Search your deck.",
      );
    }

    const added: CardInstance[] = [];
    for (const id of chosenIds) {
      const idx = p.deck.findIndex((c) => c.instanceId === id);
      if (idx < 0) continue;
      const card = extractCardAt(p, Zone.Deck, idx)!;
      card.faceUp = true;
      insertCard(p, Zone.Hand, card);
      added.push(card);
    }
    // Re-hide any cards revealed by the search that remain in the deck.
    for (const card of p.deck) card.faceUp = false;
    if (added.length > 0) {
      engine.emit({
        kind: "cardsMoved",
        instanceIds: added.map((c) => c.instanceId),
        from: Zone.Deck,
        to: Zone.Hand,
        seat,
        handAddition: "transfer",
      });
    }
    return added;
  };

  /**
   * Add card instances to `seat`'s security stack (source PlaceToSecurityEffect).
   * `toTop` puts them on top (index 0, the "top of security"); otherwise the bottom.
   * Cards go face-down by default (security is hidden); `faceUp` places them FACE UP
   * (BT25-102's "place this card face up as the bottom security card" — revealed to
   * both players but otherwise normal security, re-hidden by a shuffle). The instances
   * must currently be loose (hand/deck/trash) or a bounced permanent's cards; ids not
   * found are skipped. `detachPermanentTop` instead sheds only the named permanent's top
   * card and promotes its top digivolution card, leaving that permanent in play (BT9-044).
   */
  const addSecurity = async (
    seat: Seat,
    instanceIds: string[],
    opts?: { toTop?: boolean; faceUp?: boolean; detachPermanentTop?: boolean },
  ): Promise<void> => {
    if (continuous.cannotAddSecurityFromEffect(effectSeatStack.at(-1))) return;
    // The detach form bypasses filterBouncePrevented below. It still cannot peel the top card
    // from a Digimon carrying BT16-051's broader non-deletion leave lock. A "top card" also
    // needs cards under it, so a permanent with no stacked cards has none to place
    // (BT9-044 Q1840, BT17-098 Q2892).
    if (opts?.detachPermanentTop === true) {
      instanceIds = instanceIds.filter((instanceId) => {
        const hasNoStackedCards = state.players.some((owner) =>
          owner.battleArea.some(
            (permanent) => permanent.topCard?.instanceId === instanceId && permanent.stack.length === 0,
          ),
        );
        if (hasNoStackedCards) return false;
        const permanentId = permanentByTopInstance(instanceId);
        return permanentId === undefined || !isRestricted(permanentId, "leaveBattleAreaExceptByDeletion");
      });
    }
    // A permanent's top-card id here means the whole permanent is LEAVING the battle
    // area for security — mirrors returnToHand/returnToDeck's leave-prevention consult.
    // filterBouncePrevented only matches battle-area permanent top-cards, so ids sourced
    // from hand/deck/trash (not leaving the battle area) pass through untouched.
    if (opts?.detachPermanentTop !== true) {
      const targetedPermanentByInstance = new Map(
        instanceIds.flatMap((instanceId) => {
          const permanentId = permanentByTopInstance(instanceId);
          return permanentId === undefined ? [] : [[instanceId, permanentId] as const];
        }),
      );
      const partitionCandidates = partition.captureReturns(instanceIds, undefined, "security");
      instanceIds = await filterBouncePrevented(instanceIds, "security");
      await partition.resolve(partitionCandidates);
      // A Partition play can replace the holder; placement cannot chase its old top into a new stack.
      instanceIds = instanceIds.filter((instanceId) => {
        const originalPermanentId = targetedPermanentByInstance.get(instanceId);
        return (
          originalPermanentId === undefined ||
          pc.access.permanentById(originalPermanentId)?.topCard?.instanceId === instanceId
        );
      });
      await fireWhenReturnedPermanentsLeave(instanceIds);
    }
    const p = player(seat);
    const toTop = opts?.toTop ?? false;
    const faceUp = opts?.faceUp ?? false;
    const added: CardInstance[] = [];
    const trashedAttachments: CardInstance[] = [];
    const divertedToEggDeck: CardInstance[] = [];
    const overflowLeavers: CardInstance[] = [];
    const origins = locateMoveOrigins({ state, instanceIds });
    for (const instanceId of instanceIds) {
      if (opts?.detachPermanentTop === true) {
        let permanent: Permanent | undefined;
        for (const owner of state.players) {
          permanent = owner?.battleArea.find((candidate) => candidate.topCard?.instanceId === instanceId);
          if (permanent !== undefined) break;
        }
        if (permanent === undefined || permanent.topCard === undefined) continue;
        const detached = permanent.topCard;
        const promoted = popFromStack(permanent);
        if (promoted === undefined) continue;
        setTopCard(permanent, promoted);
        continuous.reanchorCustomEffectGrants(detached.instanceId, promoted.instanceId);
        const promotedDefinition = requireCardDefinition(promoted.cardId);
        permanent.baseDP =
          promotedDefinition.kinds.includes(CardKind.Digimon) || promotedDefinition.kinds.includes(CardKind.DigiEgg)
            ? promotedDefinition.dp
            : 0;
        permanent.invalidNoDpStackTop = pc.promotedTopNeedsInvalidRuleTrash(promotedDefinition);
        // The Digimon stays in play after its top card is placed in security.
        // Keep temporary grants on that permanent, including Security Attack
        // for the remaining checks of this attack. Continuous printed effects
        // and subscriptions are refreshed against the promoted top below.
        ledger.recomputeDP(state, permanent.permanentId);
        // The promoted card is now the active top card. Recompute printed keywords and
        // continuous effects before the next deletion/prevention window (BT9-044's
        // security redirect can promote a Digimon with Armor Purge, such as BT8-038).
        await engine.recomputeContinuousEffects?.();
        const detachedDefinition = requireCardDefinition(detached.cardId);
        if (detachedDefinition.isToken === true) {
          // Tokens leaving the field cease to exist instead of entering a non-field zone
          // (CR §4-20-5; BT4-105 Q1271).
          ledger.dropSourceInstances(state, [detached.instanceId]);
          continue;
        }
        if (detachedDefinition.kinds.includes(CardKind.DigiEgg)) {
          // A Digi-Egg treated as a Digimon cannot enter security; it goes face-down to
          // the bottom of its owner's Digi-Egg deck (BT4-105 Q1270/Q1272).
          detached.faceUp = false;
          insertCard(player(detached.ownerSeat), Zone.EggDeck, detached);
          ledger.dropSourceInstances(state, [detached.instanceId]);
          divertedToEggDeck.push(detached);
          continue;
        }
        detached.faceUp = faceUp;
        if (toTop) insertCard(p, Zone.Security, detached, "top");
        else insertCard(p, Zone.Security, detached);
        ledger.dropSourceInstances(state, [detached.instanceId]);
        added.push(detached);
        overflowLeavers.push(detached);
        continue;
      }
      const leavesBattleArea = state.players.some((owner) =>
        owner.battleArea.some(
          (permanent) =>
            permanent.topCard?.instanceId === instanceId ||
            permanent.stack.some((card) => card.instanceId === instanceId) ||
            permanent.linked.some((card) => card.instanceId === instanceId),
        ),
      );
      const collected = collectForReturn(state, instanceId, dropPermanentLedgers);
      if (collected === undefined) continue;
      if (leavesBattleArea) overflowLeavers.push(...collected);
      for (const card of collected) {
        if (card.instanceId === instanceId || collected.length === 1) {
          const definition = requireCardDefinition(card.cardId);
          if (definition.isToken === true) {
            // Tokens cease to exist when removed from the field; they never become security
            // cards and must not fire the security-added trigger (BT4-105 Q1271).
            ledger.dropSourceInstances(state, [card.instanceId]);
            continue;
          }
          if (definition.kinds.includes(CardKind.DigiEgg)) {
            // Digi-Egg cards treated as Digimon are redirected to the bottom of the owner's
            // Digi-Egg deck instead of security (BT4-105 Q1270/Q1272).
            card.faceUp = false;
            insertCard(player(card.ownerSeat), Zone.EggDeck, card);
            ledger.dropSourceInstances(state, [card.instanceId]);
            divertedToEggDeck.push(card);
            continue;
          }
          card.faceUp = faceUp;
          if (toTop) insertCard(p, Zone.Security, card, "top");
          else insertCard(p, Zone.Security, card);
          added.push(card);
        } else {
          card.faceUp = true;
          insertCard(player(card.ownerSeat), Zone.Trash, card);
          trashedAttachments.push(card);
        }
      }
    }
    // <Overflow> (CR §4-18): a permanent moved to security is the same genuine leave as a
    // hand/deck bounce — security is neither the field nor under a card.
    applyOverflow(engine.memory, overflowLeavers, state.turnSeat);
    if (trashedAttachments.length > 0) {
      engine.emit({
        kind: "cardsMoved",
        instanceIds: trashedAttachments.map((card) => card.instanceId),
        from: "battleArea",
        to: Zone.Trash,
      });
    }
    for (const { cards, ...origin } of groupCardsByOrigin({ origins, cards: divertedToEggDeck })) {
      engine.emit({
        kind: "cardsMoved",
        instanceIds: cards.map((card) => card.instanceId),
        ...origin,
        to: Zone.EggDeck,
      });
    }
    if (added.length > 0) {
      // The stack is face-down and the cards may have come from a hidden hand, so the
      // seat is the only thing a client can narrate the growth from: a net-zero patch
      // ("place 1 card as bottom security, then trash the top card", BT24-016) shows no
      // count change at all.
      for (const { cards, ...origin } of groupCardsByOrigin({ origins, cards: added })) {
        engine.emit({
          kind: "cardsMoved",
          instanceIds: cards.map((card) => card.instanceId),
          ...origin,
          to: Zone.Security,
          seat,
        });
      }
      // SubTrigger bus: "when cards are added to security" —
      // PlaceToSecurityEffect runs through the same IAddSecurity.AddSecurity seam as ＜Recovery＞.
      // Awaited (not detached `void`) so the watcher body — which may prompt a decision — is
      // sequenced after this add and BEFORE the calling effect continues, matching the
      // onDeletionOf/whenLeavesPlay seam (WR-01); a `void` fire ran the body in a later
      // microtask, interleaving its decisions with subsequent actions of the same effect.
      if (engine.fireSubTrigger) {
        await engine.fireSubTrigger("whenAddSecurity", {
          addedToSecuritySeat: seat,
          addedToSecurityInstanceIds: added.map((c) => c.instanceId),
        });
        // Piggyback whenFaceUpCardsAddedToOpponentSecurity on the same add (EX11-004): this is
        // the only PlaceToSecurityEffect seam that can add FACE-UP (opts.faceUp), unlike
        // ascendToSecurity/recoverToSecurity which always add face-down — so only this site
        // needs the extra fire. The interpreter gate itself filters for actually-face-up cards.
        await engine.fireSubTrigger("whenFaceUpCardsAddedToOpponentSecurity", {
          addedToSecuritySeat: seat,
          addedToSecurityInstanceIds: added.map((c) => c.instanceId),
        });
      }
    }
  };

  return { reveal, searchDeck, addSecurity };
}
