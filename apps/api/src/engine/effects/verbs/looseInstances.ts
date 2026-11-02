import { peekCheckedCard, takeCheckedCard } from "../../security/checkedCard.js";
import { CardInstance, Zone } from "@aegis/shared";
import type { GameState, PlayerState, Seat, ZoneRef } from "@aegis/shared";
import {
  extractPermanentAt,
  extractCardById,
  findPermanentInState,
  noteRoutedUsedOption,
  setBreeding,
  setResolvingOption,
  spliceById,
} from "../../state/access.js";
import type { SubTriggerInstall } from "../EffectContext.js";
import type { SubTriggerRootZone } from "../subtriggers.js";

/**
 * Finding, reading and removing a loose card instance — one that sits in a hand,
 * deck, trash, security stack, digivolution stack or link list rather than being a
 * permanent of its own. Every function here reads `GameState` directly and closes
 * over nothing.
 */

export interface LocatedInZone {
  owner: PlayerState;
  index: number;
}

/** Find a card instance in any player's hand. */
export function locateInHand(state: GameState, instanceId: string): LocatedInZone | undefined {
  for (const owner of state.players) {
    const index = owner.hand.findIndex((c) => c.instanceId === instanceId);
    if (index >= 0) return { owner, index };
  }
  return undefined;
}

/** Find a card instance in any player's security stack. */
export function locateInSecurity(state: GameState, instanceId: string): LocatedInZone | undefined {
  for (const owner of state.players) {
    const index = owner.security.findIndex((c) => c.instanceId === instanceId);
    if (index >= 0) return { owner, index };
  }
  return undefined;
}

/**
 * Remove a "loose" card instance (in hand, security, deck, trash, or as a permanent's
 * digivolution-stack / linked card — NOT a permanent's top card) from wherever it
 * sits and return it. Returns undefined when not found or when the instance is a
 * permanent's top card (those move only via delete/bounce of the whole permanent).
 *
 * `includeTrash` (default true) lets effects pull a card OUT of the trash ("play 1 [X]
 * from your trash"). The one verb that must NOT pull from trash is `trash` itself (it
 * moves cards INTO trash), so it passes `false`; every other caller wants the full set.
 */
export function removeLooseInstance(
  state: GameState,
  instanceId: string,
  includeTrash = true,
  hostPermanentId?: string,
): CardInstance | undefined {
  const checked = takeCheckedCard(state, instanceId);
  if (checked !== undefined) return checked;
  if (hostPermanentId !== undefined) {
    const host = findPermanentInState(state, hostPermanentId);
    if (host !== undefined) {
      const fromStack = spliceById(host.stack, instanceId);
      if (fromStack) return fromStack;
      const fromLinked = spliceById(host.linked, instanceId);
      if (fromLinked) return fromLinked;
    }
  }
  for (const owner of state.players) {
    // See the matching note in peekLooseInstance: a resolving Option's own effect is allowed
    // to move it out of the transient `resolvingOption` slot into a real area (§9-1-5's
    // placement exception). Checked first so it takes priority over the (impossible, since
    // it isn't in trash yet) trash lookup below.
    if (owner.resolvingOption?.instanceId === instanceId) {
      const card = owner.resolvingOption;
      setResolvingOption(owner, undefined);
      // Whatever area this claim is heading for, the movement that lands it there is the used
      // Option's final routing, and the client's Option dock closes on that event's `optionUsed`
      // marker. Marked at the claim rather than at each destination so no placement route can
      // leave the dock waiting for a close that never comes.
      noteRoutedUsedOption(state, instanceId);
      return card;
    }
    const fromHand = spliceById(owner.hand, instanceId);
    if (fromHand) return fromHand;
    const fromSecurity = spliceById(owner.security, instanceId);
    if (fromSecurity) return fromSecurity;
    const fromDeck = spliceById(owner.deck, instanceId);
    if (fromDeck) return fromDeck;
    if (includeTrash) {
      const fromTrash = extractCardById(owner, Zone.Trash, instanceId);
      if (fromTrash) return fromTrash;
    }
    for (const permanent of owner.battleArea) {
      const fromStack = spliceById(permanent.stack, instanceId);
      if (fromStack) return fromStack;
      const fromLinked = spliceById(permanent.linked, instanceId);
      if (fromLinked) return fromLinked;
    }
    if (owner.breeding !== undefined) {
      const fromStack = spliceById(owner.breeding.stack, instanceId);
      if (fromStack) return fromStack;
      const fromLinked = spliceById(owner.breeding.linked, instanceId);
      if (fromLinked) return fromLinked;
    }
  }
  return undefined;
}

/**
 * Read a "loose" card instance (in hand, security, deck, trash, or as a permanent's
 * digivolution-stack / linked card — NOT a permanent's top card) WITHOUT removing it.
 * Used to inspect a card's definition (kind/cost) before deciding to play it.
 */
export type LooseInstanceLocation = {
  card: CardInstance;
  ownerSeat: Seat;
  zone: "checked" | "resolvingOption" | "hand" | "security" | "deck" | "trash" | "stack" | "linked";
};

export function locateLooseInstance(state: GameState, instanceId: string): LooseInstanceLocation | undefined {
  // CR 13-1-6: a card being checked from security has no area until the check ends.
  const checked = peekCheckedCard(state, instanceId);
  if (checked !== undefined) return { card: checked.card, ownerSeat: checked.seat, zone: "checked" };
  for (const owner of state.players) {
    // §9-1-4/9-1-5: an Option resolving its own [Main] effect is held on `resolvingOption`
    // (no zone array) rather than pre-trashed. Its own effect can still relocate it into a
    // real area during that resolution — §9-1-5's "unless it is considered to be placed in
    // an area" clause is exactly this: PlaceInBattleAreaSelf (BT18-100 option permanents),
    // PlayWithoutCost, and self-referencing SecurityManipulation (P-181) all resolve by
    // finding and moving "this card" through these loose-instance helpers.
    if (owner.resolvingOption?.instanceId === instanceId) {
      return { card: owner.resolvingOption, ownerSeat: owner.seat, zone: "resolvingOption" };
    }
    for (const [zone, list] of [
      ["hand", owner.hand],
      ["security", owner.security],
      ["deck", owner.deck],
      ["trash", owner.trash],
    ] as const) {
      const found = list.find((c) => c.instanceId === instanceId);
      if (found) return { card: found, ownerSeat: owner.seat, zone };
    }
    for (const permanent of owner.battleArea) {
      const inStack = permanent.stack.find((c) => c.instanceId === instanceId);
      if (inStack) return { card: inStack, ownerSeat: owner.seat, zone: "stack" };
      const inLinked = permanent.linked.find((c) => c.instanceId === instanceId);
      if (inLinked) return { card: inLinked, ownerSeat: owner.seat, zone: "linked" };
    }
    if (owner.breeding !== undefined) {
      const inStack = owner.breeding.stack.find((c) => c.instanceId === instanceId);
      if (inStack) return { card: inStack, ownerSeat: owner.seat, zone: "stack" };
      const inLinked = owner.breeding.linked.find((c) => c.instanceId === instanceId);
      if (inLinked) return { card: inLinked, ownerSeat: owner.seat, zone: "linked" };
    }
  }
  return undefined;
}

export function peekLooseInstance(state: GameState, instanceId: string): CardInstance | undefined {
  return locateLooseInstance(state, instanceId)?.card;
}

/**
 * The root zone `instanceId` sits in right now, restricted to the three a permanent-less
 * effect source can act from: trash, hand, or FACE-UP security (a face-down security card
 * shows no effect at all). Undefined for a card in any other zone or in none (a resolving
 * Option, §9-1-4).
 */
export function rootZoneOfLooseInstance(state: GameState, instanceId: string): SubTriggerRootZone | undefined {
  for (const owner of state.players) {
    if (owner === undefined) continue;
    if (owner.trash.some((c) => c.instanceId === instanceId)) return "trash";
    if (owner.hand.some((c) => c.instanceId === instanceId)) return "hand";
    if (owner.security.some((c) => c.instanceId === instanceId && c.faceUp === true)) return "security";
  }
  return undefined;
}

/**
 * Record the install-time root zone of a watcher anchored ONLY by a loose CardInstance, so the
 * engine can drop it once that card moves (CR §15-4-4-3; KB Q2671, Q2805).
 *
 * Restricted to CONTINUOUS installs, which is the whole of the residency-gated family: a
 * `{Trash}` / `[Your Turn]` / `[All Turns]` clause on a permanent-less card is re-derived by
 * every continuous recompute, and Q5728 says such an effect "can't be triggered or activated in
 * areas other than the trash" — the watcher IS the pending trigger, so the zone gates it.
 *
 * A NON-continuous install is the opposite case: a one-shot consequence armed by an effect that
 * has ALREADY activated, which Q2671's "pending activation" wording does not reach. BT6-111 and
 * BT23-028 are the shape — a `[Security]` effect activates during the security check and arms
 * `whenSecurityBattleEnded`; by the time it fires, the card has legitimately moved to the trash
 * (Q1495: "it activates at the end of the battle, regardless of outcome"), and several such
 * bodies then play that very card FROM the trash. Zone-checking those would cancel the effect
 * for doing exactly what it says. Same reasoning as the deferred security-removal reactions
 * (Q2611/Q2629).
 *
 * A watcher that also has a permanent anchor is already governed by `dropPermanent`, and one
 * whose source is in no nameable zone keeps the previous unchecked lifecycle.
 */
export function looseSourceRootZone(
  state: GameState,
  sub: SubTriggerInstall,
): { sourceRootZone?: SubTriggerRootZone } | undefined {
  if (sub.continuous !== true) return undefined;
  if (sub.sourcePermanentId !== undefined || sub.sourceInstanceId === undefined) return undefined;
  const zone = rootZoneOfLooseInstance(state, sub.sourceInstanceId);
  return zone === undefined ? undefined : { sourceRootZone: zone };
}

/** The loose zone that currently contains `instanceId`, if it is in a zone we can name. */
export function looseZoneOfInstance(state: GameState, instanceId: string): ZoneRef | undefined {
  for (const owner of state.players) {
    if (owner.hand.some((c) => c.instanceId === instanceId)) return "hand";
    if (owner.security.some((c) => c.instanceId === instanceId)) return "security";
    if (owner.deck.some((c) => c.instanceId === instanceId)) return "deck";
    if (owner.trash.some((c) => c.instanceId === instanceId)) return "trash";
    for (const permanent of owner.battleArea) {
      if (permanent.stack.some((c) => c.instanceId === instanceId)) return "digivolutionCards";
      if (permanent.linked.some((c) => c.instanceId === instanceId)) return undefined;
    }
    if (owner.breeding !== undefined && owner.breeding.stack.some((c) => c.instanceId === instanceId)) {
      return "digivolutionCards";
    }
  }
  return undefined;
}

/** The owner seat of a loose instance (where it currently sits), or undefined. */
export function ownerSeatOfLoose(state: GameState, instanceId: string): Seat | undefined {
  return peekLooseInstance(state, instanceId)?.ownerSeat;
}

/**
 * If `instanceId` currently sits as a LINK card (in some permanent's `linked` list — battle
 * area or the breeding slot, per Comprehensive Rules §3-4-4 "the field is divided into the
 * breeding area and the battle area"), return that host permanent's id; otherwise undefined.
 * Read by the `trash` verb to fire whenLinkTrashed only for a genuine link-card trash (a
 * digivolution-stack card or a loose hand/trash card yields undefined).
 */
export function hostOfLinkedInstance(state: GameState, instanceId: string): string | undefined {
  for (const owner of state.players) {
    for (const permanent of owner.battleArea) {
      if (permanent.linked.some((c) => c.instanceId === instanceId)) return permanent.permanentId;
    }
    if (owner.breeding?.linked.some((c) => c.instanceId === instanceId) === true) {
      return owner.breeding.permanentId;
    }
  }
  return undefined;
}

/**
 * The field permanent (battle area or breeding slot — §3-4-4) whose DIGIVOLUTION STACK
 * contains `instanceId` (its host), with the stacked card's cardId — used to fire
 * onDigivolutionCardReturnToDeckBottom for the host's watcher. Only a stack card (not a top
 * card) qualifies; undefined when the instance is elsewhere.
 */
export function hostOfStackInstance(
  state: GameState,
  instanceId: string,
): { hostPermanentId: string; cardId: string } | undefined {
  for (const owner of state.players) {
    for (const permanent of owner.battleArea) {
      const card = permanent.stack.find((c) => c.instanceId === instanceId);
      if (card !== undefined) return { hostPermanentId: permanent.permanentId, cardId: card.cardId };
    }
    if (owner.breeding !== undefined) {
      const card = owner.breeding.stack.find((c) => c.instanceId === instanceId);
      if (card !== undefined) return { hostPermanentId: owner.breeding.permanentId, cardId: card.cardId };
    }
  }
  return undefined;
}

/**
 * The memory cost by which `evolving` may digivolve onto a base card `base`, per the
 * printed EvoCost requirement (base includes the required color and is at most the
 * required level). Returns the matching entry's memoryCost, or undefined when no
 * printed requirement is satisfied.
 *
 * Delegates to the single shared `cardData.matchingEvoCost` so the color+level test —
 * including the Q4242 level-less-base rejection — has ONE source of truth across the
 * effect-driven digivolve path here and the player-action digivolve path in cardData.
 * `cardData` is the engine's pure static-data window (no digivolve-subsystem dependency).
 */

export function overflowOriginInstanceIds(state: GameState): Set<string> {
  // CR 4-19-1 and 3-4-6: only cards leaving the field (including breeding) or from
  // under a card incur Overflow. Loose hand/deck/trash/security moves do not.
  return new Set(
    [...state.players].flatMap((owner) => {
      const permanents = [...owner.battleArea, ...(owner.breeding === undefined ? [] : [owner.breeding])];
      return permanents.flatMap((permanent) =>
        [...permanent.stack, ...(permanent.topCard === undefined ? [] : [permanent.topCard]), ...permanent.linked].map(
          (card) => card.instanceId,
        ),
      );
    }),
  );
}

/**
 * Collect the card instances to move when `instanceId` is "returned" (to hand, deck,
 * or security). If the id is a loose card, that single card. If it is a permanent's
 * TOP card, the whole permanent (top + stack + linked) is taken off the field and its
 * cards are returned (source bounce of a permanent returns the stack with it).
 * Removes the cards from their current location. Returns undefined when not found.
 *
 * A bounce of a permanent is a TRUE leave-the-battle-area: the source `permanentId`
 * ceases to exist (its cards move to hand/deck/security; a re-play makes a NEW id), so
 * its modifier + continuous + subTrigger ledgers must drop — the same WR-02 teardown
 * every other leave seam (delete, DNA-consume, relocate, toBreeding) performs. The
 * teardown is co-located with the removal via `onPermanentRemoved` rather than
 * resolved separately in each caller: hand-rolling the drop per site is exactly how
 * the subTrigger drop drifted out of the relocate/toBreeding seams (see the
 * `dropPermanentLedgers` note above). Loose-card returns leave no battle-area
 * permanent, so the callback is not invoked for them.
 */
export function collectForReturn(
  state: GameState,
  instanceId: string,
  onPermanentRemoved?: (permanentId: string) => void,
): CardInstance[] | undefined {
  // Top card of a permanent => take the whole permanent.
  for (const owner of state.players) {
    const index = owner.battleArea.findIndex((p) => p.topCard !== undefined && p.topCard.instanceId === instanceId);
    if (index >= 0) {
      const permanent = extractPermanentAt(owner, index)!;
      onPermanentRemoved?.(permanent.permanentId);
      return [...permanent.stack, ...(permanent.topCard ? [permanent.topCard] : []), ...permanent.linked];
    }
    if (owner.breeding !== undefined && owner.breeding.topCard?.instanceId === instanceId) {
      const permanent = owner.breeding;
      setBreeding(owner, undefined);
      onPermanentRemoved?.(permanent.permanentId);
      return [...permanent.stack, ...(permanent.topCard ? [permanent.topCard] : []), ...permanent.linked];
    }
  }
  // Otherwise a loose card (hand/security/deck/trash/under-a-permanent): no battle-area
  // permanent left play, so no ledger teardown — `onPermanentRemoved` is not called.
  const loose = removeLooseInstance(state, instanceId);
  return loose ? [loose] : undefined;
}
