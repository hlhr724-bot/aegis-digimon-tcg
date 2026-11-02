/* What the permanent inspector reads out: not the printed
   card, but the position as it stands right now — its live DP against the printed
   figure, the keywords the server resolved for it, and every card in the stack.

   Every figure here is server truth. `Permanent.keywords` is re-derived by the
   engine each continuous-recompute pass, `currentDP` already has every modifier
   applied, and the stack is the synchronized array. Nothing is re-derived from
   card text.

   Pure projection over a `Permanent`; no rules, no measurement. */

import { getCardDefinition, type Permanent, type Seat } from "@aegis/shared";
import { forcedAttackGrants, restrictionBadges, type ForcedAttackGrant, type RestrictionBadge } from "./fieldBadges";
import { readableStackCardIdentity } from "./stackCardIdentity";
import { originalDP, permanentTransformation, type PermanentTransformation } from "./transformation";
import type { StackCard } from "./overlay";
import { fieldEffectExpiry } from "@/game/fieldEffectExpiry";
import { readFieldEffects } from "@/game/readFieldEffects";
import type { TranslationKey } from "@/i18n/translationTypes";

/** How many security cards an attack checks with no modifier at all. */
const BASE_SECURITY_ATTACK = 1;

export interface PermanentDetail {
  permanentId: string;
  cardId: string;
  artId?: string;
  name: string;
  /** Top card, digivolution sources bottom-up, then linked cards. */
  cards: StackCard[];
  currentDP: number;
  baseDP: number;
  /** How far the live figure sits from the printed one; 0 when nothing modified it. */
  dpDelta: number;
  /** Server-resolved active keywords, printed spelling left to the caller. */
  keywords: readonly string[];
  /** The subset of those that an effect granted rather than the card printing. */
  grantedKeywords: readonly string[];
  /** Active triggered effects granted to this permanent. */
  grantedEffectTexts: readonly string[];
  /** The granted clauses forcing this permanent to attack, with the card that granted each. */
  forcedAttackGrants: readonly ForcedAttackGrant[];
  /** Optional printed parameter labels for the demo editor. */
  keywordLabels?: Readonly<Record<string, string>>;
  /**
   * How many security cards an attack by this position would check, as the server
   * resolved it: base 1 plus every ＜Security Attack ±N＞ in effect, floored at 0
   * (`Permanent.securityAttack`). Undefined when it is the plain 1 nobody needs told.
   * A granted or inverted modifier is already folded in — this is the same figure the
   * security-check loop itself reads, not a number scraped out of printed text.
   */
  securityAttack?: number;
  securityAttackModifier?: number;
  /**
   * The blanket "can't ..." locks currently imposed on this position, in reading order
   * (`restrictionBadges`). Server truth like every other figure here: the engine
   * re-derives each flag from the ledger the rule itself reads.
   */
  restrictions: readonly RestrictionBadge[];
  heldDpEffects: readonly HeldDpEffect[];
  /**
   * What this position counts as after an effect rewrote its ORIGINAL card information
   * (BT11-043 KingSukamon and friends), or undefined while nothing did. Server truth like
   * every other figure here; the inspector reads out the change rather than the board
   * having to infer it from a name that no longer matches the art.
   */
  transformation?: PermanentTransformation;
  suspended: boolean;
  summoningSick: boolean;
  inBreeding: boolean;
}

export interface HeldDpEffect {
  delta: number;
  expiryKey: TranslationKey;
}

function heldDpExpiryKey(effect: Parameters<typeof fieldEffectExpiry>[0], viewerSeat: Seat): TranslationKey {
  const expiry = fieldEffectExpiry(effect);
  switch (expiry.kind) {
    case "whileActive":
      return "game.fieldEffects.whileActive";
    case "turnEnd":
      if (expiry.seat === viewerSeat) {
        return expiry.next ? "game.fieldEffects.untilYourNextTurnEnd" : "game.fieldEffects.untilYourTurnEnd";
      }
      return expiry.next ? "game.fieldEffects.untilOpponentNextTurnEnd" : "game.fieldEffects.untilOpponentTurnEnd";
    case "attackEnd":
      return "game.fieldEffects.untilAttackEnd";
    case "battleEnd":
      return "game.fieldEffects.untilBattleEnd";
    case "activePhase":
      return expiry.seat === viewerSeat
        ? "game.fieldEffects.untilYourActivePhase"
        : "game.fieldEffects.untilOpponentActivePhase";
    case "costCalculated":
      return "game.fieldEffects.untilCost";
    case "thisTurn":
      return "game.fieldEffects.untilTurnEnd";
  }
}

/**
 * The figure worth showing: anything other than the default single check. The keyword
 * being active and the count differing are the same question in the engine, but a
 * ＜Security Attack -1＞ takes the count to 0 with the keyword still listed, so the
 * count is what decides rather than the keyword.
 */
function shownSecurityAttack(permanent: Permanent): number | undefined {
  const resolved = permanent.securityAttack;
  if (resolved === BASE_SECURITY_ATTACK) return undefined;
  return resolved;
}

/** Everything the inspector shows for one field position. */
export function buildPermanentDetail(
  permanent: Permanent,
  { keywordLabels, viewerSeat }: { keywordLabels?: Readonly<Record<string, string>>; viewerSeat?: Seat } = {},
): PermanentDetail {
  const topIdentity = permanent.topCard ? readableStackCardIdentity(permanent.topCard, viewerSeat) : { cardId: "" };
  const topCardId = topIdentity.cardId;
  const cards: StackCard[] = [
    ...(topCardId
      ? [
          {
            cardId: topCardId,
            ...(topIdentity.artId ? { artId: topIdentity.artId } : {}),
            role: "top" as const,
          },
        ]
      : []),
    ...[...permanent.stack].map((card) => {
      const identity = readableStackCardIdentity(card, viewerSeat);
      return {
        cardId: identity.cardId,
        ...(identity.artId ? { artId: identity.artId } : {}),
        ...(!card.faceUp ? { faceDown: true } : {}),
        ...(card.oncePerTurnUsed ? { oncePerTurnUsed: true as const } : {}),
        role: "stack" as const,
      };
    }),
    ...[...permanent.linked].map((card) => {
      const identity = readableStackCardIdentity(card, viewerSeat);
      return {
        cardId: identity.cardId,
        ...(identity.artId ? { artId: identity.artId } : {}),
        ...(!card.faceUp ? { faceDown: true } : {}),
        ...(card.oncePerTurnUsed ? { oncePerTurnUsed: true as const } : {}),
        role: "linked" as const,
      };
    }),
  ];
  const keywords = [...permanent.keywords];
  const transformation = permanentTransformation(permanent);
  return {
    permanentId: permanent.permanentId,
    cardId: topCardId,
    ...(topIdentity.artId ? { artId: topIdentity.artId } : {}),
    name: getCardDefinition(topCardId)?.nameEn ?? topCardId,
    cards,
    currentDP: permanent.currentDP,
    baseDP: originalDP(permanent),
    dpDelta: permanent.currentDP - originalDP(permanent),
    keywords,
    grantedKeywords: [...permanent.grantedKeywords],
    grantedEffectTexts: [...permanent.grantedEffectTexts],
    forcedAttackGrants: forcedAttackGrants(permanent),
    ...(keywordLabels ? { keywordLabels } : {}),
    securityAttack: shownSecurityAttack(permanent),
    securityAttackModifier: permanent.securityAttackModifier ?? permanent.securityAttack - BASE_SECURITY_ATTACK,
    restrictions: restrictionBadges(permanent),
    heldDpEffects: readFieldEffects(permanent.heldDpEffectsJson)
      .filter((effect) => effect.kind === "dp")
      .map((effect) => ({
        delta: Number(effect.value),
        expiryKey: heldDpExpiryKey(effect, viewerSeat ?? permanent.controllerSeat),
      })),
    ...(transformation ? { transformation } : {}),
    suspended: permanent.isSuspended,
    summoningSick: permanent.summoningSick,
    inBreeding: permanent.inBreeding,
  };
}

/** Printed information for a card outside the field, without inventing a permanent. */
export type CardInspectionDetail = Pick<
  PermanentDetail,
  | "cardId"
  | "artId"
  | "name"
  | "cards"
  | "currentDP"
  | "baseDP"
  | "dpDelta"
  | "keywords"
  | "grantedKeywords"
  | "grantedEffectTexts"
  | "forcedAttackGrants"
  | "keywordLabels"
  | "securityAttack"
  | "securityAttackModifier"
  | "restrictions"
  | "heldDpEffects"
  | "transformation"
  | "suspended"
> & { printedOnly?: boolean };

export function buildPrintedCardDetail(cardId: string, artId?: string): CardInspectionDetail {
  const definition = getCardDefinition(cardId);
  return {
    cardId,
    artId,
    printedOnly: true,
    name: definition?.nameEn ?? cardId,
    cards: [{ cardId, artId, role: "top" }],
    currentDP: definition?.dp ?? 0,
    baseDP: definition?.dp ?? 0,
    dpDelta: 0,
    keywords: [],
    grantedKeywords: [],
    grantedEffectTexts: [],
    forcedAttackGrants: [],
    restrictions: [],
    heldDpEffects: [],
    suspended: false,
  };
}

export interface InspectorPlacement {
  /** Which side of the clicked card the panel opens on. */
  side: "left" | "right";
  left: number;
  top: number;
}

/**
 * Where the inspector opens. The reference client puts it on the opposite side of
 * the card that was clicked, so the card stays visible while its detail is read;
 * it flips back rather than sliding off when the far side has no room, and clamps
 * into the viewport either way.
 */
export function inspectorPlacement({
  anchorX,
  anchorY,
  viewportWidth,
  viewportHeight,
  panelWidth,
  panelHeight,
  gap = 16,
  margin = 12,
}: {
  anchorX: number;
  anchorY: number;
  viewportWidth: number;
  viewportHeight: number;
  panelWidth: number;
  panelHeight: number;
  gap?: number;
  margin?: number;
}): InspectorPlacement {
  // Opposite side means: a card on the left half opens its panel to the right.
  const preferRight = anchorX < viewportWidth / 2;
  const rightLeft = anchorX + gap;
  const leftLeft = anchorX - gap - panelWidth;
  const rightFits = rightLeft + panelWidth <= viewportWidth - margin;
  const leftFits = leftLeft >= margin;
  const side: "left" | "right" = preferRight
    ? rightFits || !leftFits
      ? "right"
      : "left"
    : leftFits
      ? "left"
      : "right";
  const rawLeft = side === "right" ? rightLeft : leftLeft;
  return {
    side,
    left: Math.max(margin, Math.min(rawLeft, viewportWidth - panelWidth - margin)),
    top: Math.max(margin, Math.min(anchorY - panelHeight / 2, viewportHeight - panelHeight - margin)),
  };
}
