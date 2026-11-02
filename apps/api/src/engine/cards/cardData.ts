import {
  CardColor,
  CardKind,
  getCardDefinition,
  requireCardDefinition,
  hasCardDefinition,
  allCardIds,
  allCards,
  digivolutionRequirementsFor,
  effectiveExactNames,
  effectiveStaticNames,
  effectiveStaticTraits,
  nameIncludesToken,
  isTokenDefinition,
  intrinsicDigivolutionCostReductionFor,
  type CardDefinition,
  type CardInstance,
  type DigivolutionRequirement,
  type EvoCost,
  type Permanent,
  type ZoneRef,
} from "@aegis/shared";
import {
  tamerAsDigimonLevel,
  tamerOntoDigivolveColors,
  tamerOntoDigivolveCostOverride,
  tamerOntoDigivolveLevel,
} from "./tamerOntoDigivolve.js";
import type { GameAccess } from "../effects/EffectContext.js";
import { sameTrait, textMatchesToken } from "@aegis/shared";

/**
 * Engine-side card-data-model access layer.
 *
 * The static card definitions, enums, and the generated reference table live in
 * @aegis/shared (the contract layer both client and server share). This module is
 * the server engine's read-only window onto that table: pure functions, keyed by
 * card id, that the rules engine and every implemented card effect query for static
 * card facts. It owns no game state and mutates nothing.
 *
 * It exists so the engine never reaches into the raw registry ad hoc: lookups that
 * must succeed (a card already in the match) use the throwing variant; derived
 * facts (colors, level, DP, kind, evo costs) have one definition here instead of
 * being recomputed per effect. Source of the data shape: documented behavior /
 * the committed card-data snapshot.
 */

// --- Lookup (thin wrappers over the @aegis/shared registry) ---

/** CardDefinition for `cardId`, or undefined when unknown. */
export function lookupDefinition(cardId: string): CardDefinition | undefined {
  return getCardDefinition(cardId);
}

/**
 * Cost adjustments printed on the card being digivolved INTO that inspect the live base stack.
 * These cannot be installed as battle-area static effects: the source card is still in hand
 * when affordability is calculated. Keep the rule server-authoritative at the digivolve seam.
 */
export function intrinsicDigivolutionCostReduction(evolving: CardDefinition | undefined, base: Permanent): number {
  if (!evolving) return 0;
  return intrinsicDigivolutionCostReductionFor(evolving.cardId, base);
}

/**
 * CardDefinition for `cardId`; throws when unknown. Use this everywhere a card is
 * already part of the match (a CardInstance carries a valid cardId by
 * construction), so a missing definition surfaces as a loud bug, not undefined.
 */
export function definitionOf(cardIdOrInstance: string | Pick<CardInstance, "cardId">): CardDefinition {
  const cardId = typeof cardIdOrInstance === "string" ? cardIdOrInstance : cardIdOrInstance.cardId;
  if (typeof cardId !== "string") {
    throw new Error(
      `definitionOf: cardId resolved to ${typeof cardId} (${JSON.stringify(cardId)}). ` +
        `Input was ${typeof cardIdOrInstance}: ${JSON.stringify(cardIdOrInstance).slice(0, 200)}`,
    );
  }
  return requireCardDefinition(cardId);
}

/** True when a definition exists for the id. */
export function isKnownCard(cardId: string): boolean {
  return hasCardDefinition(cardId);
}

/** Every known card id (sorted, from the generated table). */
export function knownCardIds(): string[] {
  return allCardIds();
}

/** Every card definition (sorted by cardId in the generated data). */
export function allDefinitions(): readonly CardDefinition[] {
  return allCards();
}

// --- Derived static facts (operate on a definition or its card id) ---

const resolve = (def: CardDefinition | string): CardDefinition =>
  typeof def === "string" ? requireCardDefinition(def) : def;

/** Colors printed on the card (source cardColors). */
export function colorsOf(def: CardDefinition | string): readonly CardColor[] {
  return resolve(def).colors;
}

/** source cardSource.HasCardColor(color). */
export function hasColor(def: CardDefinition | string, color: CardColor): boolean {
  return resolve(def).colors.includes(color);
}

/**
 * Card level, or undefined for cards that
 * have no level (Tamers, Options, or a level of 0).
 */
export function levelOf(def: CardDefinition | string): number | undefined {
  return resolve(def).level;
}

/** Printed Digimon Power (0 for non-Digimon). */
export function dpOf(def: CardDefinition | string): number {
  return resolve(def).dp;
}

/**
 * Memory cost to play (source PlayCost). -1 means the card has no play cost
 * (e.g. a DigiEgg).
 */
export function playCostOf(def: CardDefinition | string): number {
  return resolve(def).playCost;
}

/** True when the card has a payable play cost (PlayCost >= 0 and not an Option). */
export function hasPlayCost(def: CardDefinition | string): boolean {
  const d = resolve(def);
  return !d.kinds.includes(CardKind.Option) && d.playCost >= 0;
}

/** The digivolution requirements printed on the card (source EvoCosts). */
export function evoCostsOf(def: CardDefinition | string): readonly EvoCost[] {
  return resolve(def).evoCosts;
}

// Kind predicates. The card-data-model exposes its own (accepting `string |
// CardDefinition`, consistent with every other helper here) rather than
// re-exporting the shared `CardDefinition`-only versions, so callers have one
// uniform calling convention.
export function isDigimon(def: CardDefinition | string): boolean {
  return resolve(def).kinds.includes(CardKind.Digimon);
}
export function isTamer(def: CardDefinition | string): boolean {
  return resolve(def).kinds.includes(CardKind.Tamer);
}
export function isOption(def: CardDefinition | string): boolean {
  return resolve(def).kinds.includes(CardKind.Option);
}
/**
 * An Option card in the battle area. A DUAL card on the field is a Digimon, unless a "place this
 * card in the battle area" effect put it there as an Option (CR 4-6-3; KB Q6436).
 */
export function isOptionPermanent(permanent: Permanent): boolean {
  if (permanent.topCard === undefined) return false;
  const kinds = resolve(permanent.topCard.cardId).kinds;
  return kinds.includes(CardKind.Option) && (!kinds.includes(CardKind.Digimon) || permanent.placedByEffect);
}
export function isDigiEgg(def: CardDefinition | string): boolean {
  return resolve(def).kinds.includes(CardKind.DigiEgg);
}

/** A card is a field permanent if it is a Digimon, Tamer, or DigiEgg (source IsPermanent). */
export function isPermanentKind(def: CardDefinition | string): boolean {
  const kinds = resolve(def).kinds;
  return kinds.includes(CardKind.Digimon) || kinds.includes(CardKind.Tamer) || kinds.includes(CardKind.DigiEgg);
}

/** ACE card (source IsACE: OverflowMemory >= 1). */
export function isAce(def: CardDefinition | string): boolean {
  return resolve(def).isAce === true;
}

/** Dual-kind card (source IsDualCard: more than one CardKind). */
export function isDualKind(def: CardDefinition | string): boolean {
  return resolve(def).kinds.length > 1;
}

// --- Digivolution matching (read-only rule helper over static data) ---

/**
 * The colors that gate an EvoCost color test. `effectiveBaseColors` is the base's complete
 * effective set, never an addition to the printed colors: an "also treated as <color>" grant
 * already includes the printed colors (KB BT3-040 Q1075), and an original-color rewrite
 * replaces them (EX13-031/BT11-043 "white [Sukamon]"), so a rewritten green Digimon no longer
 * meets a green requirement. Without effective colors, the printed colors apply.
 */
function colorsForEvoCost(
  baseDef: CardDefinition,
  effectiveBaseColors: readonly CardColor[] | undefined,
): readonly CardColor[] {
  return effectiveBaseColors === undefined || effectiveBaseColors.length === 0 ? baseDef.colors : effectiveBaseColors;
}

/**
 * The EvoCost entry (if any) by which `evolving` may digivolve on top of a base
 * card `base`, per the requirement: the base must include the required color and
 * be EXACTLY the required level (documented behavior `Permanent.Level == EvoCost.Level`,
 * documented behavior). Returns the matching entry so a caller can read its
 * `memoryCost`; returns undefined when no entry is satisfied.
 *
 * This is the pure static-data half of the digivolve legality check (the full
 * check, owned by the `digivolve` subsystem, also reads live memory and the
 * permanent's runtime state). Mirrors the color+level test in
 * the card-data loader.GetEvoCosts / the digivolve flow.
 */
export function matchingEvoCost(
  evolving: CardDefinition | string,
  base: CardDefinition | string,
  effectiveBaseColors?: readonly CardColor[],
): EvoCost | undefined {
  const baseDef = resolve(base);
  // Manual §"Token Cards": a token can't be digivolved onto ("Cards can't be stacked with
  // tokens"); it satisfies no EvoCost as a base, regardless of its level/color.
  if (isTokenDefinition(baseDef)) return undefined;
  // Q4242: a Lv.- base (no level) cannot be referenced by level, so it satisfies no
  // level-gated EvoCost — do NOT coerce a missing level to 0 (which would match every entry).
  if (baseDef.level === undefined) return undefined;
  const baseLevel = baseDef.level;
  const colors = colorsForEvoCost(baseDef, effectiveBaseColors);
  for (const cost of resolve(evolving).evoCosts) {
    if (colors.includes(cost.color) && baseLevel === cost.level) {
      return cost;
    }
  }
  return undefined;
}

/**
 * Match a printed EvoCost by color while waiving only its source-level gate.
 * Used by effects that explicitly say "ignoring level"; color remains mandatory.
 */
export function matchingEvoCostIgnoringLevel(
  evolving: CardDefinition | string,
  base: CardDefinition | string,
  effectiveBaseColors?: readonly CardColor[],
): EvoCost | undefined {
  const baseDef = resolve(base);
  if (isTokenDefinition(baseDef)) return undefined;
  const colors = colorsForEvoCost(baseDef, effectiveBaseColors);
  let best: EvoCost | undefined;
  for (const cost of resolve(evolving).evoCosts) {
    if (colors.includes(cost.color) && (best === undefined || cost.memoryCost < best.memoryCost)) {
      best = cost;
    }
  }
  return best;
}

/**
 * Like {@link matchingEvoCost} but IGNORING the printed color of the base — only the
 * EXACT level test is applied. Used by the digivolve color-legality waiver
 * (WaiveColorRequirement, CONTEXT.md LOCKED Q3): when the evolving card's color
 * requirement is waived, an EvoCost entry is satisfied on level alone. The waiver
 * drops ONLY the COLOR test; the level test stays exact (`baseLevel === cost.level`,
 * never relaxes the level gate. The cheapest level-satisfying entry is returned so the
 * waived path never pays more memory than a color-satisfying play would.
 */
export function matchingEvoCostIgnoringColor(
  evolving: CardDefinition | string,
  base: CardDefinition | string,
): EvoCost | undefined {
  // Mirror matchingEvoCost's level semantics exactly: a Lv.- base (no level) is not
  // referenceable by level (Q4242), so it matches no EvoCost. The waiver drops only the
  // COLOR test (LOCKED Q3); it must not also relax the level test for level-less cards.
  const baseDef = resolve(base);
  // Manual §"Token Cards": a token can't be digivolved onto, even under a color waiver.
  if (isTokenDefinition(baseDef)) return undefined;
  if (baseDef.level === undefined) return undefined;
  const baseLevel = baseDef.level;
  let best: EvoCost | undefined;
  for (const cost of resolve(evolving).evoCosts) {
    if (baseLevel === cost.level && (best === undefined || cost.memoryCost < best.memoryCost)) {
      best = cost;
    }
  }
  return best;
}

/** True when `evolving` can be placed on `base` by some printed EvoCost. */
export function canDigivolveOnto(evolving: CardDefinition | string, base: CardDefinition | string): boolean {
  return matchingEvoCost(evolving, base) !== undefined;
}

/**
 * Like {@link canDigivolveOnto} but ALSO considers alternate digivolution
 * requirements (trait/name/text-gated paths like "[Digivolve] Lv.2 w/[Appmon]
 * trait: Cost 0"). Used by the digivolve action validator where alternate
 * paths are a legitimate substitute for the printed EvoCost, but NOT by
 * general-purpose callers (e.g. card-module ad-hoc legality checks) where
 * the alternate requirement might over-match.
 */
export function canDigivolveOntoWithAlternates(
  evolving: CardDefinition | string,
  base: CardDefinition | string,
): boolean {
  return (
    matchingEvoCost(evolving, base) !== undefined ||
    matchingAlternateDigivolutionRequirement(evolving, base) !== undefined
  );
}

/** Static printed traits, including traits added by a [Rule] line in every zone. */
export function staticTraitsOf(def: CardDefinition | string): string[] {
  return effectiveStaticTraits(resolve(def));
}

/**
 * True when `def` has `trait` anywhere in its forms, attributes, types, or rule-granted traits.
 * (the Digimon TCG "trait" = forms ∪ attributes ∪ types).
 */
export function cardHasTrait(def: CardDefinition | string, trait: string): boolean {
  // Printed text and card data occasionally disagree on the casing or spacing of a trait token
  // (text "[NSP]" vs data "NSp", text "[Blue Flare]" vs data "BlueFlare"). Trait values are
  // whole-token identities, so this equality cannot over-match (it never collapses "App" into "Appmon").
  return staticTraitsOf(def).some((candidate) => sameTrait(candidate, trait));
}

/** Match a live permanent against its printed and continuously granted traits. */
export function permanentHasTrait(game: GameAccess, permanent: Permanent, trait: string): boolean {
  if (permanent.topCard === undefined) return false;
  const effective = game.effectiveTraits?.(permanent.permanentId);
  if (effective === undefined) return cardHasTrait(game.definitionOf(permanent.topCard), trait);
  return effective.some((candidate) => sameTrait(candidate, trait));
}

/**
 * The alternate digivolution requirement (if any) by which `evolving` may
 * digivolve onto `base`, per the compiled card's `digivolutionRequirement`
 * entries (trait/name/text-gated alternate paths like "[Digivolve] Lv.2
 * w/[Appmon]/[Hero] trait: Cost 0"). Returns the matched entry so a caller can
 * read its `cost`; returns undefined when no alternate requirement is satisfied.
 *
 * Each entry matches when ALL of its stated gates pass:
 * - level: base.level === requirement.level (exact), or within [levelMin, levelMax]
 * - traits: base has at least one of the listed traits (via {@link cardHasTrait})
 * - names: one of the base's effective static names contains one of the listed name tokens
 * - texts: base.effectText contains one of the listed text tokens
 *
 * An entry with no gates (no level/traits/names/texts/baseIsTamer) is a data defect and matches
 * NO base — see {@link requirementHasGate} and the guard in the loop below.
 *
 * The "digivolve from hand onto a <color> Tamer as if it is a level N Digimon" mechanic is
 * handled separately and FIRST: effects.json carries only a STALE gateless `{cost, isAlternate}`
 * for these cards (it would match any base of any color), so the correctly-gated requirement is
 * derived here from the registered static Tamer-onto metadata action's `asLevel` — a Tamer base that
 * shares a color with the evolving card, paying the card's level-N evo cost. For such a card the
 * stale gateless effects.json entry is ignored.
 */
/**
 * Whether an alternate digivolution requirement carries at least one base gate (level, level
 * range, trait, name, text, or Tamer-base). A requirement with none would match every base and
 * is treated as non-matching by {@link matchingAlternateDigivolutionRequirement}.
 */
function requirementHasGate(req: DigivolutionRequirement): boolean {
  return (
    req.level !== undefined ||
    req.levelMin !== undefined ||
    req.levelMax !== undefined ||
    (req.traits !== undefined && req.traits.length > 0) ||
    (req.traitSubstrings !== undefined && req.traitSubstrings.length > 0) ||
    (req.excludeTraits !== undefined && req.excludeTraits.length > 0) ||
    req.colorCount !== undefined ||
    (req.names !== undefined && req.names.length > 0) ||
    (req.namesExact !== undefined && req.namesExact.length > 0) ||
    (req.texts !== undefined && req.texts.length > 0) ||
    req.baseIsTamer === true
  );
}

/**
 * Options for {@link matchingAlternateDigivolutionRequirement}.
 * @param isBlastDigivolve - when true, entries with `incompatibleWithBlastDigivolve: true`
 *   are excluded (KB Q3056: BT18-102's 10-[Hybrid] stack-count path cannot be used as
 *   the base for a Blast Digivolve).
 */
export interface AlternateDigivolveOptions {
  /** Full name identities granted to the live base, separate from substring-only aliases. */
  grantedBaseExactNames?: readonly string[];
  isBlastDigivolve?: boolean;
  /** Waive only level/levelMin/levelMax; preserve every color, trait, name, and live gate. */
  ignoreLevel?: boolean;
  /** Match only this stable index in `digivolutionRequirementsFor`; invalid/nonmatching indexes fail. */
  requirementIndex?: number;
  /** Actual loose-card source zone when an effect digivolves from a named zone. */
  sourceZone?: ZoneRef;
}

/**
 * Whether a requirement carries a base-IDENTITY gate (name/trait/text) rather than only a
 * "is a Tamer"/level shape. Tamer-onto cards (BT17-012) print SPECIFIC named requirements
 * ([Takuya Kanbara]: Cost 2, [Agunimon]: Cost 1) alongside the generic "onto any <color>
 * Tamer as level N" effect; those named paths must win over the generic derived path, while
 * the stale gateless/baseIsTamer-only effects.json entry for such cards must NOT.
 */
function requirementHasIdentityGate(req: DigivolutionRequirement): boolean {
  return (
    (req.names !== undefined && req.names.length > 0) ||
    (req.namesExact !== undefined && req.namesExact.length > 0) ||
    (req.texts !== undefined && req.texts.length > 0) ||
    (req.traits !== undefined && req.traits.length > 0) ||
    (req.traitSubstrings !== undefined && req.traitSubstrings.length > 0) ||
    (req.excludeTraits !== undefined && req.excludeTraits.length > 0)
  );
}

/**
 * The first requirement in `requirements` whose gates all pass for `baseDef`. When
 * `identityOnly` is true, only requirements carrying a base-identity gate (name/trait/text)
 * are considered — used by the Tamer-onto path so a card's specific named requirements are
 * honored while its stale gateless/baseIsTamer-only entry is not.
 */
function matchGatedRequirement(
  requirements: readonly DigivolutionRequirement[],
  baseDef: CardDefinition,
  baseEffectiveNames: string[],
  options: AlternateDigivolveOptions | undefined,
  identityOnly: boolean,
): DigivolutionRequirement | undefined {
  for (const [requirementIndex, req] of requirements.entries()) {
    if (options?.requirementIndex !== undefined && options.requirementIndex !== requirementIndex) continue;
    // The shared list also contains ordinary color/level routes. They must not shadow
    // a printed alternate route when an effect asks the controller to choose a cost.
    // Keep identity-gated ordinary Appmon form badges, which also use this matcher.
    // Explicit indices still address the full list used by the public intent.
    if (options?.requirementIndex === undefined && req.isAlternate === false && !requirementHasIdentityGate(req))
      continue;
    if (
      options?.sourceZone !== undefined &&
      req.sourceZones !== undefined &&
      !req.sourceZones.includes(options.sourceZone as "hand" | "trash")
    ) {
      continue;
    }
    // A requirement with NO gate (no level/traits/names/texts/baseIsTamer) is a data defect,
    // not a real "digivolve onto any base" rule — every printed alternate digivolution names a
    // level, trait, name, or Tamer base. The runtime record flattens special-mechanic paths it can't
    // express (Armor / X-Antibody / Blast digivolve) to a gateless `{cost, isAlternate}`; honoring
    // that as "matches any base" let cards stack onto an illegal base of any level (e.g. BT21-021
    // onto a Lv.2). Treat gateless as matching NOTHING — the safe failure is the alternate path
    // being unavailable, never an unrestricted one.
    if (!requirementHasGate(req)) continue;
    if (identityOnly && !requirementHasIdentityGate(req)) continue;
    // Blast Digivolve exclusion (KB Q3056): paths that require a digivolution-stack count
    // (BT18-102's 10-[Hybrid] path) cannot be used as the base for a Blast Digivolve. When
    // called from a Blast Digivolve context, skip these entries so only the standard EvoCost
    // is a valid Blast Digivolve candidate.
    if (options?.isBlastDigivolve && req.incompatibleWithBlastDigivolve) continue;
    // Tamer-base gate: the alternate path digivolves onto a Tamer ("as if the Tamer is a
    if (req.baseIsTamer && !isTamer(baseDef)) continue;
    // Color gate on the base: "onto one of your <color> Tamers" restricts which Tamers qualify.
    if (req.baseColors && req.baseColors.length > 0) {
      if (!req.baseColors.some((c) => baseDef.colors.includes(c as CardColor))) continue;
    }
    if (req.baseColorCountMax !== undefined && baseDef.colors.length > req.baseColorCountMax) continue;
    // Level gate: exact match, or within [levelMin, levelMax].
    if (req.level !== undefined && options?.ignoreLevel !== true) {
      if (baseDef.level === undefined || baseDef.level !== req.level) continue;
    }
    if (req.levelMin !== undefined && options?.ignoreLevel !== true) {
      if (baseDef.level === undefined || baseDef.level < req.levelMin) continue;
    }
    if (req.levelMax !== undefined && options?.ignoreLevel !== true) {
      if (baseDef.level === undefined || baseDef.level > req.levelMax) continue;
    }

    // Trait gate: base must have at least one of the listed traits.
    if (req.traits && req.traits.length > 0) {
      if (!req.traits.some((t) => cardHasTrait(baseDef, t))) continue;
    }
    if (req.traitSubstrings && req.traitSubstrings.length > 0) {
      const sourceTraits = staticTraitsOf(baseDef);
      if (!req.traitSubstrings.some((token) => sourceTraits.some((trait) => trait.includes(token)))) continue;
    }

    // Color gate: base must have at least one of the listed printed colors.
    if (req.colors && req.colors.length > 0) {
      if (!req.colors.some((c) => baseDef.colors.includes(c as CardColor))) continue;
    }
    if (req.colorCount !== undefined && baseDef.colors.length !== req.colorCount) continue;

    // Exclude-trait gate: base must NOT carry any listed trait ("from a Digimon without
    // the [X Antibody] trait", EX8-037).
    if (req.excludeTraits && req.excludeTraits.length > 0) {
      if (req.excludeTraits.some((t) => cardHasTrait(baseDef, t))) continue;
    }

    // Name gate: base name must contain at least one token (substring; "[X] in name").
    if (req.names && req.names.length > 0) {
      if (!req.names.some((n) => baseEffectiveNames.some((name) => nameIncludesToken(name, n)))) continue;
    }

    // Exact-name gate: one of the base's effective names must EQUAL one token. It reads the
    // EXACT alias channel only: a card printed as "also treated as having [X] in its name"
    // carries [X] inside its name, never as its name, so it cannot answer an exact route
    // (KB Q2868 — EX4-030 Kuzuhamon is not a [Sakuyamon]).
    if (req.namesExact && req.namesExact.length > 0) {
      const baseExactNames = [...effectiveExactNames(baseDef), ...(options?.grantedBaseExactNames ?? [])];
      if (!req.namesExact.some((n) => baseExactNames.some((name) => name.toLowerCase() === n.toLowerCase()))) continue;
    }

    // Base play-cost gate: distinguishes same-name reprints ("Play cost 12 [Ceresmon]").
    if (req.baseWithoutPlayCost === true && hasPlayCost(baseDef)) {
      continue;
    }
    if (req.basePlayCost !== undefined && baseDef.playCost !== req.basePlayCost) continue;
    if (req.basePlayCostMin !== undefined && baseDef.playCost < req.basePlayCostMin) continue;
    if (req.basePlayCostMax !== undefined && baseDef.playCost > req.basePlayCostMax) continue;

    // Text gate: "[X] in its text" is the full card-information union, not effectText-only
    // (EX12-051 Q6829). A card's name and traits count, as do every printed effect field; the
    // catalog's requirement headers are preserved in effectText/linkRequirement. This also makes
    // a base named SymbareAngoramon satisfy "[Angoramon] in text" even when its effectText is empty.
    if (req.texts && req.texts.length > 0) {
      const textUnion = [
        ...baseEffectiveNames,
        ...(baseDef.types ?? []),
        ...(baseDef.forms ?? []),
        ...(baseDef.attributes ?? []),
        baseDef.effectText,
        baseDef.inheritedEffectText,
        baseDef.securityEffectText,
        baseDef.linkEffect,
        baseDef.linkRequirement,
        baseDef.dualEffect,
        baseDef.optionEffect,
      ]
        .filter((value): value is string => value !== undefined)
        .join(" ")
        .toLowerCase();
      // A printed keyword token ("＜Save＞ in its text") is delimiter-anchored, so it no longer
      // matches ＜Material Save＞ or a card named [Savemon] (EX10 seam 12).
      if (!req.texts.some((token) => textMatchesToken(textUnion, token))) continue;
    }

    return req;
  }

  return undefined;
}

export function matchingAlternateDigivolutionRequirement(
  evolving: CardDefinition | string,
  base: CardDefinition | string,
  options?: AlternateDigivolveOptions,
): DigivolutionRequirement | undefined {
  const evolvingId = typeof evolving === "string" ? evolving : evolving.cardId;
  const baseDef = resolve(base);
  // Manual §"Token Cards": a token can't be digivolved onto, including by an alternate
  // (trait/name/text-gated) requirement.
  if (isTokenDefinition(baseDef)) return undefined;
  const baseEffectiveNames = [...effectiveStaticNames(baseDef), ...(options?.grantedBaseExactNames ?? [])];

  // `digivolutionRequirementsFor` (shared) returns the hand-authored override when one exists
  // (e.g. BT7-112's Tamer-gated requirement with its placement cost, REPLACING the gateless
  // generated `{cost:7, isAlternate:true}`), otherwise the compiled effects.json list. This is
  // the same source the client reads, so server legality and client highlighting cannot drift.
  const requirements = digivolutionRequirementsFor(evolvingId) ?? [];

  // Tamer-onto path (BT4-025 etc.): derived from the registered IR, not effects.json.
  const tamerOntoLevel = tamerOntoDigivolveLevel(evolvingId);
  if (tamerOntoLevel !== undefined) {
    // Family-A tamer-onto cards (BT17-012 etc.) print SPECIFIC named digivolution requirements
    // ([Takuya Kanbara]: Cost 2, [Agunimon]: Cost 1) IN ADDITION to the generic "onto any
    // <color> Tamer as level N" effect. Honor a matching named/trait/text requirement first —
    // its specific (cheaper) cost and its named non-Tamer bases (e.g. slide-evolution onto
    // [Agunimon], a Digimon) must not be shadowed by the generic derived path below.
    const named = matchGatedRequirement(requirements, baseDef, baseEffectiveNames, options, true);
    if (named) return named;
    // An indexed declaration must match that printed route. Only a matching generic
    // Tamer entry may use the derived price; a failed named route must not fall back.
    if (
      options?.requirementIndex !== undefined &&
      matchGatedRequirement(requirements, baseDef, baseEffectiveNames, options, false) === undefined
    ) {
      return undefined;
    }
    if (!isTamer(baseDef)) return undefined;
    const tamerColors = tamerOntoDigivolveColors(evolvingId);
    if (tamerColors !== undefined && !tamerColors.some((color) => baseDef.colors.includes(color as CardColor))) {
      return undefined;
    }
    // The base Tamer must satisfy the printed "onto one of your <color> Tamers" filter, then
    // share a color with the evolving card (standard digivolve color rule), and the cost is the
    // evolving card's evo cost at the "as if" level for that shared color. The stale gateless/baseIsTamer-only
    // effects.json entry for these cards is intentionally ignored here.
    const evolvingDef = resolve(evolving);
    const evo = evolvingDef.evoCosts.find((c) => c.level === tamerOntoLevel && baseDef.colors.includes(c.color));
    if (evo === undefined) return undefined;
    return {
      cost: tamerOntoDigivolveCostOverride(evolvingId) ?? evo.memoryCost,
      isAlternate: true,
      baseIsTamer: true,
      ...(tamerColors === undefined ? {} : { baseColors: [...tamerColors] }),
    };
  }

  if (requirements.length === 0) return undefined;
  return matchGatedRequirement(requirements, baseDef, baseEffectiveNames, options, false);
}

/**
 * How the alternate `requirement` that digivolves `evolvingId` onto a Tamer treats that Tamer.
 * `asDigimon` means the route prints "as if the Tamer is a level N Digimon" (KB Q1157), so the
 * Tamer digivolves as a Digimon. `asDigimonOrTamer` is a named Tamer requirement ([Takuya
 * Kanbara]: Cost 2) on a card that also prints the generic "as if" route: the player may treat
 * the Tamer as a Digimon, and must digivolve it as a Tamer while a Digimon can't digivolve
 * (KB Q2724, Q2733). Any other route digivolves the Tamer as a Tamer (KB Q2957).
 */
export function tamerBaseTreatment(
  evolvingId: string,
  requirement: DigivolutionRequirement,
): { kind: "asTamer" } | { kind: "asDigimon" | "asDigimonOrTamer"; level: number } {
  const level = tamerAsDigimonLevel(evolvingId);
  if (level === undefined) return { kind: "asTamer" };
  const namedRequirement =
    tamerOntoDigivolveLevel(evolvingId) !== undefined &&
    (digivolutionRequirementsFor(evolvingId) ?? []).includes(requirement);
  return { kind: namedRequirement ? "asDigimonOrTamer" : "asDigimon", level };
}
