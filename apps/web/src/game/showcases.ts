/* Zone-change showcases: what the board plays when a card leaves one zone and
   appears in another.

   A public play is hide → centre-screen overlay → reveal (battle-animation-spec.md,
   "Cross-cutting notes" §1). Plays, evolutions and hatches share a
   colour-keyed burst — one component, keyed by the effect's colour vocabulary:
   a play takes the card's own colour, an evolution opens white into that colour, a hatch
   opens white/blue.
   A raised permanent moves between its existing slots without that burst.

   This module is the pure half: it decides, from a server event alone, which
   showcase and which burst an event earns. It reads no rules and infers no game
   state — seat, zone and card identity all come off the event payload. */

import type { Seat, ServerEvent } from "@aegis/shared";
import { getCardDefinition } from "@aegis/shared";
import { colorKey, type ColorName } from "../design/theme";

export interface ZoneShowcase {
  key: number;
  cardId: string;
  artId?: string;
  seat: Seat;
  mine: boolean;
  /** What the hold announces: a card arriving from hand or one digivolving in breeding. */
  kind: "play" | "digivolve";
  /** Card colour, so the halo behind the card matches the card. */
  color: ColorName;
}

/** The looks the shared burst component can wear. */
export type BurstVariant = "play" | "evolve" | "hatch" | "draw" | "delete" | "shatter";

export interface PermanentBurst {
  key: number;
  permanentId: string;
  seat: Seat;
  variant: Exclude<BurstVariant, "draw" | "shatter">;
  color: ColorName;
  /** The breeding area rather than the battle area, which is lit differently. */
  inBreeding: boolean;
  /** A raised stack travels to the battle area without the play burst. */
  moveFromBreeding?: true;
}

/** The palette key a card's burst is drawn in. */
export function burstColorFor(cardId: string): ColorName {
  return colorKey(getCardDefinition(cardId)?.colors[0]);
}

/**
 * The centre-screen showcase an event earns, or null when it earns none.
 *
 * Both seats reveal public plays and digivolutions before their destination
 * lights up. The event supplies the identity; no private hand is inspected.
 */
export function zoneShowcaseFromEvent(event: ServerEvent, viewerSeat: Seat, key: number): ZoneShowcase | null {
  if (event.kind !== "cardPlayed" && event.kind !== "digivolved") return null;
  return {
    key,
    cardId: event.cardId,
    ...(event.artId ? { artId: event.artId } : {}),
    seat: event.seat,
    mine: event.seat === viewerSeat,
    kind: event.kind === "digivolved" ? "digivolve" : "play",
    color: burstColorFor(event.cardId),
  };
}

/**
 * The arrival a permanent earns, for either seat. A raised stack transfers without
 * the burst used by a newly played card; a digivolution burns over
 * the stack it grew; a hatch opens in the breeding slot.
 */
export function permanentBurstFromEvent(event: ServerEvent, key: number): PermanentBurst | null {
  switch (event.kind) {
    case "cardPlayed":
      // An Option resolves without ever becoming a permanent, so it has nothing
      // on the field to burst behind.
      if (!event.permanentId) return null;
      return {
        key,
        permanentId: event.permanentId,
        seat: event.seat,
        variant: "play",
        color: burstColorFor(event.cardId),
        inBreeding: false,
      };
    case "movedFromBreeding":
      return {
        key,
        permanentId: event.permanentId,
        seat: event.seat,
        variant: "play",
        color: burstColorFor(event.cardId),
        inBreeding: false,
        moveFromBreeding: true,
      };
    case "digivolved":
      return {
        key,
        permanentId: event.permanentId,
        seat: event.seat,
        variant: "evolve",
        color: burstColorFor(event.cardId),
        inBreeding: event.inBreeding ?? false,
      };
    case "hatched":
      return {
        key,
        permanentId: event.permanentId,
        seat: event.seat,
        variant: "hatch",
        color: burstColorFor(event.cardId),
        inBreeding: true,
      };
    default:
      return null;
  }
}

/** The two tones one burst is drawn in: the bright centre and the outer edge. */
export interface BurstPalette {
  base: string;
  edge: string;
}

/* Emissive light needs brighter colours than the muted card rims. Magenta
   follows the observed purple evolution; the other hues follow card identity. */
const BURST_LIGHT: Record<ColorName, string> = {
  Red: "#ff4765",
  Blue: "#5db9ff",
  Yellow: "#fff16b",
  Green: "#67f794",
  Purple: "#f555dc",
  Black: "#b4bfdb",
  White: "#edf8ff",
  Neutral: "#e2ecff",
};

/**
 * The effect-colour vocabulary of the reference client
 * (battle-animation-spec.md, "Effect colour vocabulary"): an arrival takes the
 * card's own colour, an evolution opens white into that colour, a hatch opens white
 * into blue, and a drawn card lands on the same blue starburst.
 */
export function burstPalette(variant: BurstVariant, color: ColorName = "Neutral"): BurstPalette {
  switch (variant) {
    case "evolve":
      return { base: "#ffffff", edge: BURST_LIGHT[color] };
    case "hatch":
      return { base: "#ffffff", edge: "#7fc4ff" };
    case "draw":
      return { base: "#d6e9ff", edge: "#2f6fe0" };
    // Legacy central security-card fracture palette. Field deletion uses the card-coloured
    // evolution light separately; security fracture/material comparison remains pending.
    case "delete":
      return { base: "#ff9f43", edge: "#3ddc84" };
    case "shatter":
      return { base: "#e4f1ff", edge: "#3b82f6" };
    case "play":
      return { base: BURST_LIGHT[color], edge: BURST_LIGHT[color] };
  }
}

export type FieldDeparture = NonNullable<Extract<ServerEvent, { kind: "cardsMoved" }>["deletedPermanents"]>[number];

/**
 * The permanents a move to the trash took off the field: the deleted ones, and the Options
 * trashed from the battle area (a ＜Delay＞ paying its cost). Trashing is not deletion, but on
 * the board both are a card breaking where it stood.
 */
export function fieldDeparturesFromEvent(event: ServerEvent): readonly FieldDeparture[] {
  if (event.kind !== "cardsMoved" || event.to !== "trash") return [];
  return [...(event.deletedPermanents ?? []), ...(event.trashedPermanents ?? [])];
}

/**
 * What an event says just left the field, as ids the board can be asked to locate. A
 * combat resolution names permanents; an effect that trashes a permanent narrates the card
 * instance instead, so both are returned as anchors and the caller resolves whichever it
 * has a last position for.
 */
export function deletionAnchorIdsFromEvent(event: ServerEvent): readonly string[] {
  if (event.kind === "combatResolved") return event.deletedPermanentIds;
  return fieldDeparturesFromEvent(event).map((departed) => departed.permanentId);
}

/** The phase name the protocol uses for the draw step of a turn. */
const DRAW_PHASE = "Draw";

/**
 * Whether a hand that grew during this batch of events grew because the turn
 * started. The draw phase is announced by `phaseChanged`, so a draw observed
 * alongside it is the turn-start draw and earns the starburst at the hand slot;
 * a draw an effect caused arrives with no phase change and keeps only its notice.
 */
export function hasTurnStartDraw(events: readonly ServerEvent[], seat: Seat): boolean {
  return events.some((event) => event.kind === "phaseChanged" && event.phase === DRAW_PHASE && event.turnSeat === seat);
}
