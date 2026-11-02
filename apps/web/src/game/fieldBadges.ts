/* The badges a permanent wears for as long as it stands there, rather than for the
   length of a cue: the ＜Blocker＞ shield, the `×N` digivolution-source count, the DP
   chip a dual-colour Digimon splits between its two colours, and the debuff chips for
   the blanket restrictions an effect has imposed on it.

   Server truth throughout. The shield reads `Permanent.keywords`, which the
   engine re-derives on every continuous-effect pass and therefore already
   includes a Blocker a card only has because something granted it — the printed
   text on the art is not consulted. The stack count is the synchronized stack's
   own length, and the colours are card data.

   Pure: this module answers what the badges say, `boardPieces.tsx` draws them. */

import { getCardDefinition, type Permanent } from "@aegis/shared";
import { colorKey, palettePairFor, type ColorName } from "../design/theme";
import type { Translate, TranslationKey } from "../i18n";
import { cardDisplayName } from "./cardLinks";

/**
 * The keyword name the engine projects for ＜Blocker＞. Compared against
 * `Permanent.keywords` exactly as projected — the normalized spelling is the
 * contract, and `formatKeyword` only exists to print it.
 */
export const BLOCKER_KEYWORD = "Blocker";

/** Whether this permanent can block right now, as the server resolved it. */
export function hasBlocker(permanent: Pick<Permanent, "keywords">): boolean {
  return [...permanent.keywords].includes(BLOCKER_KEYWORD);
}

export interface SourceCountBadge {
  /** How many digivolution cards sit under the top card. */
  count: number;
  /** Palette key of the top card's first colour, which tints the badge. */
  color: ColorName;
}

/**
 * The `×N` badge, or null when nothing is stacked underneath. Tinted by the TOP
 * card rather than by the card at the bottom of the stack: the badge belongs to
 * the Digimon standing there now.
 */
export function sourceCountBadge(permanent: Pick<Permanent, "stack" | "topCard">): SourceCountBadge | null {
  const count = permanent.stack.length;
  if (count === 0) return null;
  const topId = permanent.topCard?.cardId;
  return { count, color: colorKey(getCardDefinition(topId ?? "")?.colors[0]) };
}

/**
 * The two ends of the DP chip's gradient. A single-colour Digimon returns the
 * same colour twice, so the chip is drawn one way for every card and simply
 * stops splitting when there is nothing to split.
 */
export interface DpChipColors {
  from: string;
  to: string;
  /** True when the card really carries two distinct printed colours. */
  split: boolean;
}

/** The DP chip's colours for a permanent's top card. */
export function dpChipColors(permanent: Pick<Permanent, "topCard">): DpChipColors {
  const pair = palettePairFor(getCardDefinition(permanent.topCard?.cardId ?? "")?.colors);
  return { from: pair.from.base, to: pair.to.base, split: pair.split };
}

/** A blanket restriction a permanent wears as a standing debuff chip. */
export type RestrictionBadgeKind =
  | "immuneToOpponentEffects"
  | "cannotAttack"
  | "cannotBlock"
  | "cannotSuspend"
  | "cannotUnsuspend"
  | "cannotDigivolve"
  | "cannotActivateWhenDigivolving"
  | "immuneToOpponentDigimonEffects"
  | "immuneToOpponentOptionEffects"
  | "immuneToOpponentTamerEffects"
  | "protectedFromStackTrash"
  | "protectedFromStackReturn"
  | "protectedFromDpReduction"
  | "protectedFromDeDigivolve"
  | "protectedFromBattleDeletion"
  | "protectedFromEffectDeletion"
  | "protectedFromEffectReturn"
  | "attacksAtStartOfMainPhase";

/** The translation key each chip prints, named per restriction so a rename is caught. */
export type RestrictionLabelKey = `game.restriction.${RestrictionBadgeKind}`;

export interface RestrictionBadge {
  kind: RestrictionBadgeKind;
  /** Translation key of the chip's short label. */
  labelKey: RestrictionLabelKey;
  protection?: boolean;
  action?: boolean;
  icon?:
    | "allEffects"
    | "digimon"
    | "option"
    | "tamer"
    | "attackOff"
    | "blockOff"
    | "suspendOff"
    | "unsuspendOff"
    | "digivolveOff"
    | "effectOff"
    | "dpShield"
    | "deDigivolveShield"
    | "deleteShield"
    | "returnShield";
  shortLabelKey?: Extract<TranslationKey, `game.badge.${string}` | `game.protectionBadge.${string}`>;
}

/**
 * The chip order, which is also the reading order on the card: what the position
 * cannot do in combat first, then what it cannot do on its own turn.
 */
const RESTRICTION_BADGES: readonly RestrictionBadge[] = [
  {
    kind: "protectedFromBattleDeletion",
    labelKey: "game.restriction.protectedFromBattleDeletion",
    protection: true,
    icon: "deleteShield",
  },
  {
    kind: "protectedFromStackTrash",
    labelKey: "game.restriction.protectedFromStackTrash",
    shortLabelKey: "game.protectionBadge.protectedFromStackTrash",
    protection: true,
    icon: "deDigivolveShield",
  },
  {
    kind: "protectedFromStackReturn",
    labelKey: "game.restriction.protectedFromStackReturn",
    shortLabelKey: "game.protectionBadge.protectedFromStackReturn",
    protection: true,
    icon: "returnShield",
  },
  {
    kind: "attacksAtStartOfMainPhase",
    labelKey: "game.restriction.attacksAtStartOfMainPhase",
    shortLabelKey: "game.badge.attacksAtStartOfMainPhase",
    action: true,
  },
  {
    kind: "immuneToOpponentOptionEffects",
    labelKey: "game.restriction.immuneToOpponentOptionEffects",
    shortLabelKey: "game.protectionBadge.immuneToOpponentOptionEffects",
    protection: true,
    icon: "option",
  },
  {
    kind: "immuneToOpponentTamerEffects",
    labelKey: "game.restriction.immuneToOpponentTamerEffects",
    shortLabelKey: "game.protectionBadge.immuneToOpponentTamerEffects",
    protection: true,
    icon: "tamer",
  },
  {
    kind: "protectedFromDpReduction",
    labelKey: "game.restriction.protectedFromDpReduction",
    shortLabelKey: "game.protectionBadge.protectedFromDpReduction",
    protection: true,
    icon: "dpShield",
  },
  {
    kind: "protectedFromDeDigivolve",
    labelKey: "game.restriction.protectedFromDeDigivolve",
    shortLabelKey: "game.protectionBadge.protectedFromDeDigivolve",
    protection: true,
    icon: "deDigivolveShield",
  },
  {
    kind: "protectedFromEffectDeletion",
    labelKey: "game.restriction.protectedFromEffectDeletion",
    shortLabelKey: "game.protectionBadge.protectedFromEffectDeletion",
    protection: true,
    icon: "deleteShield",
  },
  {
    kind: "protectedFromEffectReturn",
    labelKey: "game.restriction.protectedFromEffectReturn",
    shortLabelKey: "game.protectionBadge.protectedFromEffectReturn",
    protection: true,
    icon: "returnShield",
  },
  {
    kind: "immuneToOpponentDigimonEffects",
    labelKey: "game.restriction.immuneToOpponentDigimonEffects",
    shortLabelKey: "game.protectionBadge.immuneToOpponentDigimonEffects",
    protection: true,
    icon: "digimon",
  },
  { kind: "cannotAttack", labelKey: "game.restriction.cannotAttack", icon: "attackOff" },
  { kind: "cannotBlock", labelKey: "game.restriction.cannotBlock", icon: "blockOff" },
  { kind: "cannotSuspend", labelKey: "game.restriction.cannotSuspend", icon: "suspendOff" },
  { kind: "cannotUnsuspend", labelKey: "game.restriction.cannotUnsuspend", icon: "unsuspendOff" },
  { kind: "cannotDigivolve", labelKey: "game.restriction.cannotDigivolve", icon: "digivolveOff" },
  {
    kind: "cannotActivateWhenDigivolving",
    labelKey: "game.restriction.cannotActivateWhenDigivolving",
    icon: "effectOff",
  },
];

/**
 * Every blanket restriction currently imposed on this permanent, read straight off
 * the server's projection. Each flag is re-derived by the engine on every
 * continuous-effect pass from the same ledger the rule itself consults, so a chip
 * appears exactly while the restriction applies and no card text is parsed here.
 *
 * Target-scoped restrictions ("can't attack players") are deliberately absent: the
 * server resolves those into `attackablePermanentIds` / `canAttackPlayer`, and a chip
 * would double-count them.
 */
export interface ForcedAttackGrant {
  clause: string;
  sourceCardId?: string;
}

/** The granted clauses the server says force this permanent to attack, oldest first. */
export function forcedAttackGrants(permanent: Pick<Permanent, "forcedAttackGrantsJson">): readonly ForcedAttackGrant[] {
  if (!permanent.forcedAttackGrantsJson) return [];
  try {
    const parsed: unknown = JSON.parse(permanent.forcedAttackGrantsJson);
    return Array.isArray(parsed)
      ? parsed.filter((grant): grant is ForcedAttackGrant => typeof grant?.clause === "string")
      : [];
  } catch {
    return [];
  }
}

/** "Trident Arm granted: [Start of Your Main Phase] This Digimon attacks." */
export function forcedAttackGrantText(
  { clause, sourceCardId }: ForcedAttackGrant,
  t: Translate,
  getCardName?: (cardId: string) => string,
): string {
  return sourceCardId
    ? t("redesign.arena.restriction.attacksAtStartOfMainPhaseGranted", {
        card: getCardName?.(sourceCardId) ?? cardDisplayName(sourceCardId, t),
        clause,
      })
    : clause;
}

export function restrictionBadges(
  permanent: Pick<Permanent, Exclude<RestrictionBadgeKind, "immuneToOpponentEffects">>,
): readonly RestrictionBadge[] {
  const immuneToAllOpponentEffects =
    permanent.immuneToOpponentDigimonEffects &&
    permanent.immuneToOpponentOptionEffects &&
    permanent.immuneToOpponentTamerEffects;
  const badges = RESTRICTION_BADGES.filter((badge) => {
    // This aggregate kind is synthesized below and has no direct Permanent flag.
    if (badge.kind === "immuneToOpponentEffects") return false;
    if (
      immuneToAllOpponentEffects &&
      (badge.kind === "immuneToOpponentDigimonEffects" ||
        badge.kind === "immuneToOpponentOptionEffects" ||
        badge.kind === "immuneToOpponentTamerEffects")
    ) {
      return false;
    }
    return permanent[badge.kind];
  });
  if (!immuneToAllOpponentEffects) return badges;
  return [
    {
      kind: "immuneToOpponentEffects",
      labelKey: "game.restriction.immuneToOpponentEffects",
      shortLabelKey: "game.protectionBadge.immuneToOpponentEffects",
      protection: true,
      icon: "allEffects",
    },
    ...badges,
  ];
}
