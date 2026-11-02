import { CardMovePosition } from "@aegis/shared/protocol/CardMovePosition";
/* Timed side panels, ported from the reference client's right-hand stack.
   Whenever cards move in a way the player must see — discarded, deleted,
   revealed, added to hand, put under a stack — the reference client opens a
   small titled panel listing the cards and leaves it up long enough to read,
   its border eroding clockwise as the clock runs out.

   A play normally opens no panel: the opponent's played card is already held up
   centre-screen by the zone showcase, so a panel only said the same thing again
   in a corner the player had to look away to read. The showcase is pure motion,
   though, so reduced motion and a hidden tab drop it — and there the panel is the
   only thing that announces the play at all, which is what `showcasePlays` decides.

   This module is the pure half: it maps observed server events to panel
   descriptors and owns the titling, stacking, merging and expiry rules. Titles
   come from the movement's zones alone — the client reads no rules to decide
   what a movement meant. Card identities and ownership are supplied by the
   caller through `SidePanelLookup`, because `cardsMoved` carries only instance
   ids.

   Every panel gets the same fixed reading time, exactly as the reference client
   does: the clock a panel starts with is never shortened by anything that
   happens afterwards, so a panel always leaves on its own schedule. Since the
   presentation queue took over, that clock starts when the queue reaches the
   panel rather than when the server named it (narration.ts). */

import type { GameState, Seat, ServerEvent } from "@aegis/shared";
import type { TranslationKey } from "../i18n";
import { Side } from "./side";
import { TIMINGS } from "./timings";

/**
 * The reference client's Effects.HideShowCard waits 2.5 s, then runs a second 2.5 s
 * accumulator before closing the panel — about five seconds of reading time. It
 * is started without being awaited, so the panel never blocks the game.
 */
export const SIDE_PANEL_LIFETIME_MS = TIMINGS.sidePanelLifetime;

/**
 * the reference client has no attack banner at all — it announces an attack with outlines, a
 * target arrow and the suspend animation. This call-out is an addition, so it
 * takes the length of the reference client's other banners (ShowPhaseNotificationObject holds
 * for 0.3 s inside a ~0.25 s open/close pair) rounded up to a readable glance.
 */
export const ATTACK_ANNOUNCE_MS = TIMINGS.attackAnnounce;

/** Cards moved in quick succession belong to one panel, numbered 1..n. */
export const SIDE_PANEL_MERGE_WINDOW_MS = TIMINGS.sidePanelMergeWindow;

export interface SidePanelCard {
  cardId: string;
  artId?: string;
  badge: number;
}

export interface SidePanel {
  /** Exact effect resolution that owns these discarded sources across server batches. */
  resolutionId?: string;
  id: string;
  titleKey: TranslationKey;
  side: Side;
  cards: SidePanelCard[];
  /** The event put its cards in a meaningful order, so every card wears its number. */
  ordered: boolean;
  createdAt: number;
}

export interface AttackAnnouncement {
  id: string;
  cardId: string;
  artId?: string;
  side: Side;
  createdAt: number;
}

/** Resolves the instance ids carried by `cardsMoved` into identities the panel can show. */
export interface SidePanelLookup {
  cardId: (instanceId: string) => string | undefined;
  artId?: (instanceId: string) => string | undefined;
  seat: (instanceId: string) => Seat | undefined;
}

/**
 * Owner seat for every publicly visible card instance. Trash is public for both
 * seats, so a card that has just been discarded or deleted resolves here even
 * though `cardsMoved` names no seat.
 */
export function buildInstanceSeatIndex(state: GameState): Map<string, Seat> {
  const index = new Map<string, Seat>();
  state.players.forEach((player, playerSeat) => {
    const seat = playerSeat as Seat;
    const add = (instanceId?: string) => {
      if (instanceId) index.set(instanceId, seat);
    };
    player.trash?.forEach((card) => add(card?.instanceId));
    const addPermanent = (permanent?: { permanentId?: string; topCard?: { instanceId?: string } }) => {
      if (!permanent) return;
      add(permanent.permanentId);
      add(permanent.topCard?.instanceId);
    };
    player.battleArea?.forEach(addPermanent);
    addPermanent(player.breeding);
    if (player.hand) player.hand.forEach((card) => add(card?.instanceId));
  });
  return index;
}

/** Reads only visible physical copies; concealed identities never enter this index. */
export function buildInstanceArtIndex(state: GameState): Map<string, string> {
  const index = new Map<string, string>();
  const add = (card?: { instanceId?: string; cardId?: string; artId?: string }) => {
    if (card?.instanceId && card.cardId && card.artId) index.set(card.instanceId, card.artId);
  };
  for (const player of state.players) {
    for (const zone of [player.hand, player.trash, player.delayZone, player.security]) zone?.forEach(add);
    // The opponent's face-up security cards reach this client only through the public projection.
    player.securityView?.forEach(add);
    add(player.resolvingOption);
    for (const permanent of [...player.battleArea, ...(player.breeding ? [player.breeding] : [])]) {
      add(permanent.topCard);
      if (permanent.permanentId && permanent.topCard?.cardId && permanent.topCard.artId) {
        index.set(permanent.permanentId, permanent.topCard.artId);
      }
      permanent.stack?.forEach(add);
      permanent.linked?.forEach(add);
    }
  }
  return index;
}

function trashTitle(from: string): TranslationKey | null {
  switch (from) {
    case "hand":
      return "panel.discardedCards";
    case "battleArea":
    case "breeding":
      return "panel.deletedCards";
    case "deck":
    case "security":
    case "eggDeck":
    case "delay":
    case CardMovePosition.VARIOUS.value:
    case CardMovePosition.DIGIVOLUTION_CARDS.value:
    case CardMovePosition.LINKED_CARDS.value:
    case CardMovePosition.UNDER_TAMER.value:
    case CardMovePosition.RESOLVING_OPTION.value:
    case CardMovePosition.DECK_TOP.value:
    case CardMovePosition.DECK_BOTTOM.value:
      return "panel.trashedCards";
    default:
      return null;
  }
}

/**
 * The panel title a movement earns, read off its zones only. `deckBottom` and
 * `selected` are destinations the protocol may name for an ordering or a
 * selection; a plain `deck` destination stays unqualified because the event
 * carries no position and the client may not infer one.
 */
export function titleForMovement(from: string, to: string): TranslationKey | null {
  switch (to) {
    case "trash":
      return trashTitle(from);
    case "hand":
      return "panel.cardsAddedToHand";
    case "deckBottom":
      return "panel.deckBottomCard";
    case "deck":
      return "panel.deckCards";
    case "selected":
      return "panel.selectedCards";
    case "stackBottom":
      return "panel.digivolutionCards";
    default:
      return null;
  }
}

function sideOf(seat: Seat, viewerSeat: Seat): Side {
  return seat === viewerSeat ? Side.Viewer : Side.Opponent;
}

function numbered(cards: readonly (string | Omit<SidePanelCard, "badge">)[]): SidePanelCard[] {
  return cards.map((card, index) => ({ ...(typeof card === "string" ? { cardId: card } : card), badge: index + 1 }));
}

/**
 * The panel an event deserves, or null when the event opens none. A movement
 * whose cards cannot be identified yields null rather than an empty panel.
 *
 * Digivolutions open no panel: the centre-screen showcase holds the card up,
 * and a corner panel saying the same thing again would only duplicate it.
 *
 * `showcasePlays` is whether the centre-stage zone showcase will actually play for
 * this viewer; it decides only whether a play needs announcing here instead.
 */
export function sidePanelFromEvent(
  event: ServerEvent,
  viewerSeat: Seat,
  lookup: SidePanelLookup,
  id: string,
  nowMs: number,
  showcasePlays = true,
): SidePanel | null {
  switch (event.kind) {
    case "cardsMoved": {
      // A used Option is presented in the resolving-effect dock until its Main body
      // finishes. Its eventual trip to trash is bookkeeping, not a discard moment.
      if (event.optionUsed) return null;
      // Identified field deletions already receive one dedicated notice per Digimon.
      // Announcing the whole stack here duplicates that notice and calls sources deleted.
      if (event.to === "trash" && (event.deletedPermanents?.length ?? 0) > 0) return null;
      // An Option trashed from the battle area breaks where it stood, which names it; a panel
      // repeating the same card beside its own clause pulls the eye off the break.
      if (
        event.to === "trash" &&
        event.instanceIds.every((movedId) => event.trashedPermanents?.some((trashed) => trashed.instanceId === movedId))
      )
        return null;
      // A draw already has a deck-to-hand flight. Showing the private drawn card
      // in a narration panel duplicates that motion (and, for effect draws, the
      // effect notice itself). Digivolution draws are never separate effects.
      if (event.from === "deck" && event.to === "hand") return null;
      const titleKey = event.strippedStackTops
        ? event.strippedStackTops.reason === "deDigivolve"
          ? "panel.deDigivolvedCards"
          : "panel.strippedTopCards"
        : event.trashedSources
          ? "panel.trashedDigivolutionCards"
          : titleForMovement(event.from, event.to);
      if (!titleKey) return null;
      // The event's own identities first: the index can be one state patch behind
      // the movement the event narrates (see securityDestructionsFromEvents).
      const cardIds = event.instanceIds.flatMap((instanceId, index) => {
        const cardId = event.cardIds?.[index] ?? lookup.cardId(instanceId);
        const artId = event.artIds?.[index] ?? lookup.artId?.(instanceId);
        return cardId ? [{ cardId, ...(artId ? { artId } : {}) }] : [];
      });
      if (cardIds.length === 0) return null;
      const owner =
        event.seat ?? event.instanceIds.map((instanceId) => lookup.seat(instanceId)).find((s) => s !== undefined);
      if (owner === undefined) return null;
      return {
        id,
        titleKey,
        side: sideOf(owner, viewerSeat),
        cards: numbered(cardIds),
        ordered: cardIds.length > 1,
        createdAt: nowMs,
      };
    }
    case "cardRevealed":
      // A reveal exists to inform the other player; the revealer's own client
      // already shows the card through the zone it came from or moves to.
      if (event.seat === viewerSeat) return null;
      return {
        id,
        titleKey: "panel.revealedCards",
        side: Side.Opponent,
        cards: numbered([{ cardId: event.cardId, ...(event.artId ? { artId: event.artId } : {}) }]),
        // A reveal is shown in the order it came off the deck, so it is numbered
        // from the first card even before a second one joins it.
        ordered: true,
        createdAt: nowMs,
      };
    case "cardPlayed":
      // Only the opponent's play needs announcing; the viewer just made theirs.
      if (event.seat === viewerSeat) return null;
      // The showcase, when it plays, already holds this card up centre-screen.
      if (showcasePlays) return null;
      return {
        id,
        titleKey: "panel.playedCard",
        side: Side.Opponent,
        cards: numbered([{ cardId: event.cardId, ...(event.artId ? { artId: event.artId } : {}) }]),
        ordered: false,
        createdAt: nowMs,
      };
    default:
      return null;
  }
}

/** The attack call-out an event deserves, for either seat. */
export function attackAnnouncementFromEvent(
  event: ServerEvent,
  viewerSeat: Seat,
  id: string,
  nowMs: number,
): AttackAnnouncement | null {
  if (event.kind !== "attackDeclared") return null;
  // A redirect re-aims an attack that has already been announced; announcing it again
  // would read as the attacker declaring a second time.
  if (event.redirected === true) return null;
  return {
    id,
    cardId: event.attackerCardId,
    ...(event.attackerArtId ? { artId: event.attackerArtId } : {}),
    side: sideOf(event.seat, viewerSeat),
    createdAt: nowMs,
  };
}

function sameSlot(a: SidePanel, b: SidePanel): boolean {
  return a.titleKey === b.titleKey && a.side === b.side;
}

/**
 * Add a panel to the set one batch is about to narrate. A panel of the same title
 * and side that is still fresh absorbs the new cards and keeps counting from its own
 * badge numbers, so cards moved by one effect stay one panel; an older one is
 * replaced outright. Nothing is dropped for want of room: the queue presents the set
 * one item at a time (narration.ts), so there is no column left to overflow.
 */
export function pushSidePanel(
  panels: readonly SidePanel[],
  incoming: SidePanel,
  mergeWindowMs: number = SIDE_PANEL_MERGE_WINDOW_MS,
): SidePanel[] {
  const existing = panels.find((panel) => sameSlot(panel, incoming));
  if (existing) {
    const merged =
      incoming.createdAt - existing.createdAt <= mergeWindowMs
        ? {
            ...incoming,
            cards: numbered([...existing.cards, ...incoming.cards]),
            ordered: existing.ordered || incoming.ordered,
          }
        : incoming;
    return panels.map((panel) => (panel === existing ? merged : panel));
  }
  return [...panels, incoming];
}

/** Milliseconds left on a panel's own clock, never negative. */
export function sidePanelRemaining(panel: SidePanel, nowMs: number): number {
  return Math.max(0, panel.createdAt + SIDE_PANEL_LIFETIME_MS - nowMs);
}
