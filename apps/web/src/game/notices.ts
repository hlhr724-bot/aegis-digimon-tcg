/* The match screen's one notice system: the framed call-outs that used to be a
   rejection flash, a recovery toast and an effect-clause toast, each with its
   own placement and its own timer.

   A notice no longer owns a corner or a clock of its own. It is half of a
   narration item (narration.ts), and the animation queue presents one item at a
   time per slot: the viewer's side, the opponent's side, or the phone's single
   centred slot. A refused action is the exception — it answers the viewer's own
   tap, so it is shown at once rather than queued.

   This module is the pure half: the model and the mapping from server events.
   Card text and translation belong to NoticeStack.tsx. */

import { type PreventionKeyword, type Seat, type ServerEvent } from "@aegis/shared";
import { noticeDurationScale } from "./noticeDuration";
import { Side } from "./side";
import { TIMINGS } from "./timings";

/** How long a notice gets to be read. Nothing on the board shortens it any more. */
export const NOTICE_LIFETIME_MS = TIMINGS.noticeLifetime;

/**
 * How long a refusal gets. It is the one notice that is not queued, so its clock starts at
 * the refusal itself rather than when a slot reaches it: the player is still watching the
 * card they tapped shake, and a refusal is a sentence to read rather than a card to
 * recognise. It therefore takes the longer clock the opponent feed gives a line carrying
 * text, not the queued notice's.
 */
export const REJECTION_LIFETIME_MS = TIMINGS.feedEffect;

export type NoticeBody =
  | {
      variant: "effect";
      /** The card that owns the clause — for an inherited clause, the card under the top. */
      cardId: string;
      /** That physical copy's printing, never the host permanent's top card. */
      artId?: string;
      timing?: string;
      /** Engine trigger timing, which may differ from the printed timing. */
      triggerTiming?: string;
      /** Resolving clause identity, shared with the decision that asks for its targets. */
      effectKey?: string;
      beforeRemoval?: boolean;
      isContinuation?: boolean;
      description?: string;
      /** The chosen bullet of an "activate 1 of the effects below" clause; shown in place of the clause. */
      effectTextPart?: string;
      manualSignalText?: string;
      isInherited?: boolean;
      sourceInstanceId?: string;
      sourcePermanentId?: string;
      /** The same effect resolving this many times in a row, announced once. Absent means once. */
      count?: number;
    }
  | { variant: "deletion"; cards: readonly DeletedCard[] }
  | {
      variant: "stackStrip";
      reason: StackStripReason;
      /** The top card the permanent lost; the permanent itself stays on the field. */
      cardId: string;
      artId?: string;
      /** The card whose effect stripped it, when the server named one. */
      sourceCardId?: string;
    }
  | { variant: "recovery"; amount: number }
  | { variant: "securityGain"; amount: number }
  | { variant: "rejection"; reason: string }
  | { variant: "timeWarning"; seconds: number }
  | { variant: "keyword"; keyword: NoticeKeyword; cardId: string; materialCardIds?: readonly string[] };

/** Why a permanent lost its top card without leaving the field. */
export type StackStripReason = "trashTop";

/** The named mechanics the board calls out by name as they happen. */
export type NoticeKeyword =
  | "digiXros"
  | "cannotAttack"
  | "cannotBlock"
  | "scapegoat"
  | "decoy"
  | "guard"
  | "fragment"
  | "armorPurge";

/** The notice each prevention keyword earns, keyed by the name the protocol uses. */
const PREVENTION_NOTICE_KEYWORDS: Record<Exclude<PreventionKeyword, "Delay">, NoticeKeyword> = {
  Scapegoat: "scapegoat",
  Decoy: "decoy",
  Guard: "guard",
  Fragment: "fragment",
  "Armor Purge": "armorPurge",
};

/** One permanent named by a deletion call-out. */
export interface DeletedCard {
  cardId: string;
  artId?: string;
}

export type NoticeVariant = NoticeBody["variant"];

export interface MatchNotice {
  id: string;
  side: Side;
  /** Raised while a security card was resolving. Provenance only: it no longer moves the notice. */
  fromSecurity: boolean;
  body: NoticeBody;
  /** Deletions earlier in this server batch that caused an on-deletion trigger. */
  afterDeletions?: readonly { seat: Seat; cardId: string }[];
  createdAt: number;
}

function sideOf(seat: Seat, viewerSeat: Seat): Side {
  return seat === viewerSeat ? Side.Viewer : Side.Opponent;
}

/**
 * The notice an effect deserves as it starts resolving, for either seat.
 * Driven by `effectTriggered` rather than `effectResolved`, so the clause is
 * readable before any selection the effect asks its controller for.
 *
 * The art is looked up by the source's own instance, not its host permanent: an inherited
 * clause fires from a card under the top, and the host's art is a different card.
 */
export function effectNoticeFromEvent(
  event: ServerEvent,
  viewerSeat: Seat,
  id: string,
  nowMs: number,
  fromSecurity = false,
  artOfInstance?: (instanceId: string) => string | undefined,
): MatchNotice | null {
  if (event.kind === "effectOptionChosen" || event.kind === "effectClauseAdvanced") {
    const optionArtId = event.sourceInstanceId ? artOfInstance?.(event.sourceInstanceId) : undefined;
    return {
      id,
      side: sideOf(event.seat, viewerSeat),
      fromSecurity,
      body: {
        variant: "effect",
        cardId: event.sourceCardId,
        ...(optionArtId && optionArtId !== event.sourceCardId ? { artId: optionArtId } : {}),
        timing: event.timing,
        effectTextPart: event.clause,
        ...(event.kind === "effectClauseAdvanced" ? { isContinuation: true, effectKey: event.effectKey } : {}),
        isInherited: event.isInherited,
        ...(event.sourceInstanceId ? { sourceInstanceId: event.sourceInstanceId } : {}),
        ...(event.sourcePermanentId ? { sourcePermanentId: event.sourcePermanentId } : {}),
      },
      createdAt: nowMs,
    };
  }
  if (event.kind !== "effectTriggered") return null;
  const artId = event.sourceInstanceId ? artOfInstance?.(event.sourceInstanceId) : undefined;
  return {
    id,
    side: sideOf(event.seat, viewerSeat),
    fromSecurity: fromSecurity || event.duringSecurityCheck === true,
    body: {
      variant: "effect",
      cardId: event.sourceCardId,
      ...(artId && artId !== event.sourceCardId ? { artId } : {}),
      timing: event.printedTiming ?? event.timing,
      triggerTiming: event.timing,
      effectKey: event.effectKey,
      ...(event.beforeRemoval === true ? { beforeRemoval: true } : {}),
      description: event.description,
      ...(event.effectTextPart !== undefined ? { effectTextPart: event.effectTextPart } : {}),
      isInherited: event.isInherited,
      ...(event.sourceInstanceId ? { sourceInstanceId: event.sourceInstanceId } : {}),
      ...(event.sourcePermanentId ? { sourcePermanentId: event.sourcePermanentId } : {}),
    },
    createdAt: nowMs,
  };
}

/**
 * The field deletion call-out, one per side the movement deleted from.
 *
 * Only the engine's field-to-trash movement earns this notice; trashing a card from hand,
 * deck, security, or a stack is a different action. `deletedPermanents` is carried on the
 * public movement so this remains truthful even when the state patch and event arrive in
 * different ticks.
 *
 * An effect that deletes several permanents at once is one moment, not one per card, so
 * every card it took from the same side is named by the same notice. The two sides stay
 * apart because they are read out of opposite corners.
 */
export function deletionNoticesFromEvent(
  event: ServerEvent,
  viewerSeat: Seat,
  nextId: () => string,
  nowMs: number,
): MatchNotice[] {
  if (event.kind !== "cardsMoved" || event.to !== "trash" || !event.deletedPermanents?.length) return [];
  const bySide = new Map<Side, DeletedCard[]>();
  for (const deleted of event.deletedPermanents) {
    const side = sideOf(deleted.seat, viewerSeat);
    const cards = bySide.get(side) ?? [];
    cards.push({ cardId: deleted.cardId, ...(deleted.artId ? { artId: deleted.artId } : {}) });
    bySide.set(side, cards);
  }
  return [...bySide].map(([side, cards]) => ({
    id: nextId(),
    side,
    fromSecurity: false,
    body: { variant: "deletion" as const, cards },
    createdAt: nowMs,
  }));
}

/**
 * The call-out for a permanent whose stack tops an effect trashed while it stayed on the
 * field. It is not a deletion, so it earns no deletion notice; without this the board only
 * swapped the top card in the next patch. Drawn on the side of the player who owns the
 * stripped permanent. A ＜De-Digivolve＞ strip gets no notice.
 */
export function stackStripNoticeFromEvent(
  event: ServerEvent,
  viewerSeat: Seat,
  id: string,
  nowMs: number,
): MatchNotice | null {
  if (event.kind !== "cardsMoved" || event.strippedStackTops === undefined || event.seat === undefined) return null;
  const cardId = event.cardIds?.[0];
  if (cardId === undefined) return null;
  const artId = event.artIds?.[0];
  const { reason, sourceCardId } = event.strippedStackTops;
  if (reason !== "trashTop") return null;
  return {
    id,
    side: sideOf(event.seat, viewerSeat),
    fromSecurity: false,
    body: {
      variant: "stackStrip",
      reason,
      cardId,
      ...(artId && artId !== cardId ? { artId } : {}),
      ...(sourceCardId !== undefined ? { sourceCardId } : {}),
    },
    createdAt: nowMs,
  };
}

/** The notice a security recovery deserves, on the recovering player's side. */
export function recoveryNoticeFromEvent(
  event: ServerEvent,
  viewerSeat: Seat,
  id: string,
  nowMs: number,
): MatchNotice | null {
  if (event.kind !== "securityRecovered") return null;
  return {
    id,
    side: sideOf(event.seat, viewerSeat),
    fromSecurity: false,
    body: { variant: "recovery", amount: event.amount },
    createdAt: nowMs,
  };
}

/**
 * The notice a security stack deserves when an effect adds to it outside a recovery —
 * a card placed there from the hand, the deck or the trash. The stack is face-down,
 * so the notice carries only the count; on the stacking player's side.
 */
export function securityGainNotice(side: Side, amount: number, id: string, nowMs: number): MatchNotice {
  return { id, side, fromSecurity: false, body: { variant: "securityGain", amount }, createdAt: nowMs };
}

/**
 * The same notice, read off the movement itself when the server names the seat whose
 * stack grew. The count alone cannot narrate an add that the same patch undoes — "place
 * 1 card from your hand as the bottom security card, then trash your top security card"
 * (BT24-016) leaves the count where it was — so the event is the source of truth and
 * the count watcher is the fallback for a movement that names no seat. A recovery's
 * movement names none: `securityRecovered` narrates that growth.
 */
export function securityGainNoticeFromEvent(
  event: ServerEvent,
  viewerSeat: Seat,
  id: string,
  nowMs: number,
): MatchNotice | null {
  if (event.kind !== "cardsMoved" || event.to !== "security" || event.seat === undefined) return null;
  if (event.instanceIds.length === 0) return null;
  return securityGainNotice(sideOf(event.seat, viewerSeat), event.instanceIds.length, id, nowMs);
}

/**
 * The call-out a prevention keyword earns when it pays to keep a Digimon on the board.
 *
 * These keywords have no prompt/resolved event pair of their own: without this the viewer
 * sees the cost card leave and the deletion silently not happen, with nothing naming the
 * keyword that did it. Guard is drawn over the Digimon that paid for it; older prevention
 * events without that identity retain the saved card as their subject.
 */
export function preventionNoticeFromEvent(
  event: ServerEvent,
  viewerSeat: Seat,
  id: string,
  nowMs: number,
): MatchNotice | null {
  if (event.kind !== "deletionPrevented" || event.cardId === undefined) return null;
  // A ＜Delay＞ save is already named by its own clause, read out as the Option breaks.
  if (event.keyword === "Delay") return null;
  return {
    id,
    side: sideOf(event.seat, viewerSeat),
    fromSecurity: false,
    body: {
      variant: "keyword",
      keyword: PREVENTION_NOTICE_KEYWORDS[event.keyword],
      cardId:
        ["Guard", "Scapegoat", "Decoy"].includes(event.keyword) && event.paidCardId !== undefined
          ? event.paidCardId
          : event.cardId,
    },
    createdAt: nowMs,
  };
}

/**
 * The call-out a named mechanic earns as it happens, for either seat.
 *
 * The mechanic and its public materials come directly from the server event. The
 * client does not infer DigiXros from printed requirements because those cards may
 * also be played normally.
 */
export function keywordNoticeFromEvent(
  event: ServerEvent,
  viewerSeat: Seat,
  id: string,
  nowMs: number,
): MatchNotice | null {
  if (event.kind !== "cardPlayed" || event.mechanic !== "digiXros") return null;
  return {
    id,
    side: sideOf(event.seat, viewerSeat),
    fromSecurity: false,
    body: {
      variant: "keyword",
      keyword: "digiXros",
      cardId: event.cardId,
      materialCardIds: event.sourceCardIds,
    },
    createdAt: nowMs,
  };
}

/** A refused action is always the viewer's own, so it lands on the viewer's side. */
export function rejectionNotice(reason: string, id: string, nowMs: number): MatchNotice {
  return { id, side: Side.Viewer, fromSecurity: false, body: { variant: "rejection", reason }, createdAt: nowMs };
}

/** Milliseconds left on a notice's clock, never negative. */
export function noticeRemaining(notice: MatchNotice, nowMs: number): number {
  return Math.max(0, notice.createdAt + getNoticeLifetime(notice) - nowMs);
}

function getNoticeLifetime(notice: MatchNotice): number {
  if (notice.body.variant === "rejection") {
    return REJECTION_LIFETIME_MS;
  }
  if (notice.body.variant === "timeWarning") {
    return Math.round(REJECTION_LIFETIME_MS * noticeDurationScale());
  }
  return NOTICE_LIFETIME_MS;
}

/**
 * True for the viewer's own effect notice for `cardId`.
 *
 * The decision dialog that asks the viewer whether to activate their own effect already
 * names the card and prints the clause, so the notice would repeat it word for word.
 * The opponent's notices stay: their dialog is not on this screen.
 */
export interface EffectNoticeScope {
  timing?: string;
  sourceInstanceId?: string;
}

export function isOwnEffectNotice(notice: MatchNotice, cardId: string, scope?: EffectNoticeScope): boolean {
  return (
    notice.side === Side.Viewer &&
    notice.body.variant === "effect" &&
    notice.body.cardId === cardId &&
    (scope?.timing === undefined || notice.body.timing === scope.timing) &&
    (scope?.sourceInstanceId === undefined || notice.body.sourceInstanceId === scope.sourceInstanceId)
  );
}

/**
 * True when the dialog for a decision prints the clause its notice would open with.
 *
 * A dialog prints only the passage that raised it. When that passage is a later step of the
 * clause ("Then, this Digimon may attack."), the earlier steps are read nowhere but the
 * notice, so the notice must stay.
 */
export function dialogRepeatsEffectNotice(options: { effectText?: string; effectTextPart?: string } | undefined) {
  const part = options?.effectTextPart?.trim();
  if (!part) return true;
  const clause = options?.effectText?.trim();
  return clause === undefined || clause.startsWith(part);
}
