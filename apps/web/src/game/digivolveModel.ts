/* Digivolution routes and their prices: which stacks a hand card can evolve onto, which
   requirement a candidate satisfies, and what each route costs the viewer. */

import {
  getCardDefinition,
  getCompiledCard,
  digivolutionRequirementsFor,
  effectiveExactNames,
  effectiveStaticNames,
  effectiveStaticTraits,
  nameIncludesToken,
  sameTrait,
  textMatchesToken,
  tamerOntoDigivolveSpec,
  baseGrantedDigivolveFor,
  dnaDigivolutionRequirementsFor,
  digivolutionRequirementHasSideEffect,
  intrinsicDigivolutionCostReductionFor,
  type BaseGrantedDigivolve,
  type DigivolutionRequirement,
  type Permanent,
  type PlayerState,
  CardKind,
  type CardColor,
} from "@aegis/shared";
import { permanentTransformation } from "./transformation";

/**
 * The colors a base answers to for digivolution. A rewrite such as EX13-031's "white
 * [Sukamon]" replaces the printed colors (KB Q7294), so the printed card no longer counts.
 */
function baseColorsOf(
  base: Permanent,
  baseDef: NonNullable<ReturnType<typeof getCardDefinition>>,
): readonly CardColor[] {
  const rewritten = permanentTransformation(base)?.colors ?? [];
  return rewritten.length > 0 ? rewritten : baseDef.colors;
}

/** Find one server-valid-looking DNA material assignment for a hand card on the current board. */
export function findDnaMaterialCombination(cardId: string, permanents: readonly Permanent[]): string[] | undefined {
  // Same source of truth as the server's `matchingDnaDigivolveCost`: the hand-authored
  // overrides carry the printed DNA header that the pre-EX9 card imports dropped.
  const requirements = dnaDigivolutionRequirementsFor(cardId);
  if (requirements.length === 0) return undefined;
  const digimon = permanents.filter((permanent) => {
    const def = permanent.topCard ? getCardDefinition(permanent.topCard.cardId) : undefined;
    return def?.kinds.includes(CardKind.Digimon) === true;
  });
  for (const requirement of requirements) {
    if (requirement.materials.length < 2) continue;
    const matches = (permanent: Permanent, spec: (typeof requirement.materials)[number]) => {
      const def = permanent.topCard ? getCardDefinition(permanent.topCard.cardId) : undefined;
      if (!def) return false;
      if (spec.level !== undefined && def.level !== spec.level) return false;
      if (spec.color !== undefined && !def.colors.some((color) => color.toLowerCase() === spec.color!.toLowerCase()))
        return false;
      const names = effectiveStaticNames(def);
      const exactNames = effectiveExactNames(def).map((name) => name.toLowerCase());
      if (spec.names?.length && !spec.names.some((token) => names.some((name) => nameIncludesToken(name, token))))
        return false;
      if (spec.namesExact?.length && !spec.namesExact.some((token) => exactNames.includes(token.toLowerCase())))
        return false;
      if (spec.namesInText?.length) {
        const text = `${def.effectText ?? ""}\n${def.inheritedEffectText ?? ""}`.toLowerCase();
        if (!spec.namesInText.some((token) => text.includes(token.toLowerCase()))) return false;
      }
      const traits = effectiveStaticTraits(def);
      if (spec.traits?.length && !spec.traits.some((trait) => traits.some((t) => sameTrait(t, trait)))) return false;
      return true;
    };
    const assign = (slot: number, used: Set<string>, result: string[]): string[] | undefined => {
      if (slot === requirement.materials.length) return result;
      for (const permanent of digimon) {
        if (used.has(permanent.permanentId) || !matches(permanent, requirement.materials[slot]!)) continue;
        const nextUsed = new Set(used).add(permanent.permanentId);
        const found = assign(slot + 1, nextUsed, [...result, permanent.permanentId]);
        if (found) return found;
      }
      return undefined;
    };
    const found = assign(0, new Set(), []);
    if (found) return found;
  }
  return undefined;
}

export type HandCardEvolutionRoute =
  | { kind: "normal" }
  | { kind: "dna"; materialPermanentIds: string[] }
  | { kind: "both"; materialPermanentIds: string[] }
  | undefined;

export interface ProjectedDnaDigivolveRoute {
  materialPermanentIds: readonly string[];
  projectedCost: number;
}

export interface AppFusionOverlayRoute {
  linkedInstanceId: string;
  linkedCardId: string;
  projectedCost: number;
}

/**
 * Projects server-authorized App Fusion routes for the currently selected host.
 * A route is shown only while both its host and linked physical card are still
 * present; legality and projected cost remain server-owned.
 */
export function appFusionRoutesForHost(
  routes: readonly { hostPermanentId: string; linkedInstanceId: string; projectedCost: number }[],
  host: Permanent | undefined,
): AppFusionOverlayRoute[] {
  if (host === undefined) return [];
  const linkedById = new Map((host.linked ?? []).map((card) => [card.instanceId, card.cardId]));
  return routes
    .filter((route) => route.hostPermanentId === host.permanentId && linkedById.has(route.linkedInstanceId))
    .map((route) => ({
      linkedInstanceId: route.linkedInstanceId,
      linkedCardId: linkedById.get(route.linkedInstanceId)!,
      projectedCost: route.projectedCost,
    }));
}

/**
 * Resolve the legal evolution modes when a hand card is dropped onto one of its possible
 * bases. `normal` is the server's own verdict for this (card, base) pair
 * (`CardInstance.digivolveTargetPermanentIds`); only the DNA route is shape-matched here,
 * because a DNA declaration names its materials and so has no server projection to read.
 */
export function handCardEvolutionRoute(
  cardId: string,
  battleArea: readonly Permanent[],
  normal: boolean,
  projectedDnaRoutes?: readonly ProjectedDnaDigivolveRoute[],
  preferredPermanentId?: string,
): HandCardEvolutionRoute {
  const projectedRoute = projectedDnaRoutes?.find(
    (route) => preferredPermanentId === undefined || route.materialPermanentIds.includes(preferredPermanentId),
  );
  const materialPermanentIds =
    projectedDnaRoutes === undefined
      ? findDnaMaterialCombination(cardId, battleArea)
      : projectedRoute?.materialPermanentIds
        ? [...projectedRoute.materialPermanentIds]
        : undefined;
  if (normal && materialPermanentIds) return { kind: "both", materialPermanentIds };
  if (normal) return { kind: "normal" };
  return materialPermanentIds ? { kind: "dna", materialPermanentIds } : undefined;
}

/**
 * The battle-area permanents a digivolution of `cardId` would build on: the bases the
 * server offered for this hand card (`CardInstance.digivolveTargetPermanentIds`, passed in
 * as `serverBasePermanentIds`) plus the materials a DNA declaration would consume. Dropping
 * the card anywhere else on the field plays it instead — an offer the battle area itself
 * carries — so no other permanent, Tamer or Digimon, is a digivolution target.
 */
export function digivolveBasePermanentIds(
  cardId: string,
  battleArea: readonly Permanent[],
  serverBasePermanentIds: readonly string[],
  projectedDnaRoutes?: readonly ProjectedDnaDigivolveRoute[],
): string[] {
  const dnaMaterials =
    projectedDnaRoutes === undefined
      ? (findDnaMaterialCombination(cardId, battleArea) ?? [])
      : projectedDnaRoutes.flatMap((route) => [...route.materialPermanentIds]);
  const bases = new Set([...serverBasePermanentIds, ...dnaMaterials]);
  return battleArea.filter((permanent) => bases.has(permanent.permanentId)).map((permanent) => permanent.permanentId);
}

/** True when `def` has `trait` in its printed or Rule traits. Tolerates printed-text vs card-data
 * casing and spacing drift ("[NSP]" vs "NSp", "[Blue Flare]" vs "BlueFlare"); mirrors the server's
 * cardHasTrait. Trait values are whole-token identities, so this folding cannot over-match. */
function cardHasTrait(def: ReturnType<typeof getCardDefinition>, trait: string): boolean {
  if (!def) return false;
  return effectiveStaticTraits(def).some((t) => sameTrait(t, trait));
}

/** How many of `player`'s hand+trash cards satisfy an alternate requirement's `placementCost`
 *  predicate (kind ∈ kinds OR a trait ∈ traits, over the listed `from` zones). */
function placementCostAvailable(
  player: PlayerState | undefined,
  spec: NonNullable<DigivolutionRequirement["placementCost"]>,
): number {
  if (!player) return 0;
  const matches = (cardId: string): boolean => {
    const def = getCardDefinition(cardId);
    if (!def) return false;
    if ((spec.kinds ?? []).some((k) => def.kinds.includes(CardKind[k]))) return true;
    return (spec.traits ?? []).some((t) => cardHasTrait(def, t));
  };
  let n = 0;
  for (const zone of spec.from) {
    const cards = zone === "hand" ? player.hand : player.trash;
    for (const c of cards) if (matches(c.cardId)) n += 1;
  }
  return n;
}

/**
 * Whether an alternate digivolution requirement matches `baseDef`. Mirrors the server's
 * `matchingAlternateDigivolutionRequirement` gates (level/trait/name/text + the Tamer-base
 * gate). When the requirement carries a non-memory `placementCost`, the digivolve is only
 * legal while the viewer can pay it — checked against `viewer`'s hand+trash when provided.
 */
function requirementHasGate(req: DigivolutionRequirement): boolean {
  return (
    req.level !== undefined ||
    req.levelMin !== undefined ||
    req.levelMax !== undefined ||
    (req.traits !== undefined && req.traits.length > 0) ||
    (req.traitSubstrings !== undefined && req.traitSubstrings.length > 0) ||
    (req.names !== undefined && req.names.length > 0) ||
    (req.namesExact !== undefined && req.namesExact.length > 0) ||
    (req.texts !== undefined && req.texts.length > 0) ||
    req.baseIsTamer === true
  );
}

/**
 * Whether a requirement carries a base-IDENTITY gate (name/trait/text) rather than only a
 * "is a Tamer"/level shape. Mirrors the server's `requirementHasIdentityGate`: a Tamer-onto
 * card (BT17-012) prints SPECIFIC named requirements ([Takuya Kanbara]: Cost 2, [Agunimon]:
 * Cost 1) alongside the generic "onto any <color> Tamer as level N" effect; only the named
 * paths come from its `digivolutionRequirement` list — its stale gateless/`baseIsTamer`-only
 * entry must be ignored in favor of the derived generic path.
 */
function requirementHasIdentityGate(req: DigivolutionRequirement): boolean {
  return (
    (req.names !== undefined && req.names.length > 0) ||
    (req.namesExact !== undefined && req.namesExact.length > 0) ||
    (req.texts !== undefined && req.texts.length > 0) ||
    (req.traits !== undefined && req.traits.length > 0) ||
    (req.traitSubstrings !== undefined && req.traitSubstrings.length > 0)
  );
}

/**
 * The alternate digivolution requirements that apply when evolving `handCardId` onto `baseDef`,
 * each paired with its memory cost — mirrors the server's `matchingAlternateDigivolutionRequirement`.
 * For a Tamer-onto card, only its SPECIFIC named requirements are drawn from the compiled list,
 * and the generic "onto any <shared-color> Tamer as level N" path is derived from the card's
 * EvoCosts (so the cost label matches what the server charges); its stale `baseIsTamer`-only
 * compiled entry is ignored. For every other card, all gated requirements apply as-is.
 */
function alternateDigivolveMatches(
  handCardId: string,
  hand: NonNullable<ReturnType<typeof getCardDefinition>>,
  base: Permanent,
  baseDef: NonNullable<ReturnType<typeof getCardDefinition>>,
  viewer: PlayerState | undefined,
): { req: DigivolutionRequirement; cost: number; requirementIndex?: number }[] {
  const requirements = digivolutionRequirementsFor(handCardId) ?? [];
  const tamerOntoSpec = tamerOntoDigivolveSpec(handCardId);
  const tamerOntoLevel = tamerOntoSpec?.asLevel;
  const matches: { req: DigivolutionRequirement; cost: number; requirementIndex?: number }[] = [];

  for (const [requirementIndex, req] of requirements.entries()) {
    // Tamer-onto cards: consult ONLY their specific named requirements from the compiled list.
    if (tamerOntoLevel !== undefined && !requirementHasIdentityGate(req)) continue;
    if (altRequirementMatches(req, base, baseDef, viewer)) matches.push({ req, cost: req.cost, requirementIndex });
  }

  if (tamerOntoLevel !== undefined && baseDef.kinds.includes(CardKind.Tamer)) {
    // Generic "onto one of your <color> Tamers as if a level-N Digimon": legal onto a Tamer that
    // satisfies the printed Tamer-color filter and shares a color with an EvoCost at the "as if"
    // level. A printed fixed cost takes precedence over the ordinary level-N EvoCost.
    if (
      tamerOntoSpec?.baseColors !== undefined &&
      !tamerOntoSpec.baseColors.some((color) => baseColorsOf(base, baseDef).includes(color as CardColor))
    ) {
      return matches;
    }
    const evo = hand.evoCosts.find(
      (ev) => ev.level === tamerOntoLevel && baseColorsOf(base, baseDef).includes(ev.color),
    );
    if (evo) {
      const cost = tamerOntoSpec?.costOverride ?? evo.memoryCost;
      matches.push({
        req: {
          cost,
          isAlternate: true,
          baseIsTamer: true,
          ...(tamerOntoSpec?.baseColors === undefined ? {} : { baseColors: tamerOntoSpec.baseColors }),
        },
        cost,
      });
    }
  }

  return matches;
}

function altRequirementMatches(
  req: DigivolutionRequirement,
  base: Permanent,
  baseDef: NonNullable<ReturnType<typeof getCardDefinition>>,
  viewer: PlayerState | undefined,
): boolean {
  // A gateless requirement is a data defect, never an "any base" rule (mirror the server's
  // matchingAlternateDigivolutionRequirement guard) — match nothing rather than highlight every base.
  if (!requirementHasGate(req)) return false;
  const baseLevel = baseDef.level;
  if (req.baseIsTamer && !baseDef.kinds.includes(CardKind.Tamer)) return false;
  if (
    req.baseColors &&
    req.baseColors.length > 0 &&
    !req.baseColors.some((color) => baseColorsOf(base, baseDef).includes(color as CardColor))
  )
    return false;
  const colors = baseColorsOf(base, baseDef);
  if (req.baseColorCountMax !== undefined && colors.length > req.baseColorCountMax) return false;
  if (req.colors && req.colors.length > 0 && !req.colors.some((color) => colors.includes(color as CardColor)))
    return false;
  if (req.colorCount !== undefined && colors.length !== req.colorCount) return false;
  if (req.excludeTraits?.some((trait) => cardHasTrait(baseDef, trait))) return false;
  if (req.baseWithoutPlayCost === true && !baseDef.kinds.includes(CardKind.Option) && baseDef.playCost >= 0) {
    return false;
  }
  if (req.basePlayCost !== undefined && baseDef.playCost !== req.basePlayCost) return false;
  if (req.basePlayCostMin !== undefined && (baseDef.playCost ?? 0) < req.basePlayCostMin) return false;
  if (req.basePlayCostMax !== undefined && (baseDef.playCost ?? 0) > req.basePlayCostMax) return false;
  if (req.level !== undefined && baseLevel !== req.level) return false;
  if (req.levelMin !== undefined && (baseLevel === undefined || baseLevel < req.levelMin)) return false;
  if (req.levelMax !== undefined && (baseLevel === undefined || baseLevel > req.levelMax)) return false;
  if (req.traits && req.traits.length > 0 && !req.traits.some((t) => cardHasTrait(baseDef, t))) return false;
  if (
    req.traitSubstrings?.length &&
    !req.traitSubstrings.some((token) => effectiveStaticTraits(baseDef).some((trait) => trait.includes(token)))
  )
    return false;
  // Name gates read the base's EFFECTIVE names (printed name + aliases such as AD1-020's
  // "Tommy, Takuya, & Zoe" answering to [Takuya Kanbara]) — same source as the server.
  // The substring gate reads the alias union; the exact gate reads the exact channel only, so a
  // card "treated as having [X] in its name" (EX4-030 Kuzuhamon, Q2868) never satisfies an exact
  // [X] route — mirrors matchGatedRequirement in apps/api/src/engine/cards/cardData.ts.
  const baseNames = effectiveStaticNames(baseDef);
  if (req.names && req.names.length > 0 && !req.names.some((n) => baseNames.some((name) => nameIncludesToken(name, n))))
    return false;
  const baseExactNames = effectiveExactNames(baseDef);
  if (req.namesExact && req.namesExact.length > 0 && !req.namesExact.some((n) => baseExactNames.includes(n)))
    return false;
  // Q7313: "in text" includes names, traits and every printed effect/header field.
  // Mirror the server's text union and keyword matching before building cost choices.
  if (req.texts?.length) {
    const textUnion = [
      ...baseNames,
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
    if (!req.texts.some((token) => textMatchesToken(textUnion, token))) return false;
  }
  if (req.placementCost && viewer && placementCostAvailable(viewer, req.placementCost) < req.placementCost.count)
    return false;
  // Burst Digivolve pays its additional cost by returning the named Tamer from the
  // controller's battle area. Match the server's burstDigivolveTamerCandidates gate.
  if (
    req.burstDigivolve &&
    !viewer?.battleArea.some((permanent) => {
      const def = permanent.topCard ? getCardDefinition(permanent.topCard.cardId) : undefined;
      return (
        def !== undefined &&
        def.kinds.includes(CardKind.Tamer) &&
        effectiveExactNames(def).some((name) =>
          req.burstDigivolve!.returnTamerNamesExact.some((wanted) => wanted.toLowerCase() === name.toLowerCase()),
        )
      );
    })
  )
    return false;
  if (!stackGatesSatisfied(req, base)) return false;
  return true;
}

/**
 * Digivolution-stack gates on the BASE — "[Takuya Kanbara] w/2 or more [Hybrid] trait cards
 * under it" (AD1-002) and friends. Mirrors steps 4d/4d-2/4e of the server's validateDigivolve
 * so the client does not offer a path the server will reject.
 */
function stackGatesSatisfied(req: DigivolutionRequirement, base: Permanent): boolean {
  const stackDefs = [...base.stack].map((card) => getCardDefinition(card.cardId));

  if (req.minTraitStackCount !== undefined) {
    const traits = req.minTraitStackTraits ?? [];
    const matching = stackDefs.filter((def) => def && traits.some((t) => cardHasTrait(def, t))).length;
    if (matching < req.minTraitStackCount) return false;
  }

  if (req.minNameStackNames !== undefined) {
    const matching = stackDefs.filter(
      (def) =>
        def &&
        req.minNameStackNames!.some((n) =>
          req.minNameStackMatch === "contains" ? nameIncludesToken(def.nameEn, n) : def.nameEn === n,
        ),
    ).length;
    if (matching < (req.minNameStackCount ?? 1)) return false;
  }

  if (req.requiredDigivolutionCardCount !== undefined) {
    const { trait, min } = req.requiredDigivolutionCardCount;
    const matching = stackDefs.filter((def) => def && cardHasTrait(def, trait)).length;
    if (matching < min) return false;
  }

  return true;
}

/**
 * Whether the BASE permanent grants `handCardId` a digivolution path onto it (ST7-03/BT6-060):
 * a static on the base lets a specific hand card digivolve onto it, ignoring color/level. Keyed by
 * the base card; the target predicate matches the evolving (hand) card. Mirrors the server's
 * GameEngine.matchBaseGrantedDigivolve — the base must be on the battle area, and a conditional
 * grant needs `opponent` (the digivolving seat's opponent) to evaluate its activation gate.
 * Returns the matched grant, or undefined.
 */
function baseGrantConditionHolds(
  condition: NonNullable<BaseGrantedDigivolve["condition"]>,
  viewer: PlayerState | undefined,
  opponent: PlayerState | undefined,
): boolean {
  if (condition.kind === "anyOf") {
    return condition.conditions.some((nested) => baseGrantConditionHolds(nested, viewer, opponent));
  }
  if (condition.kind === "opponentHasDigimonLevelAtLeast") {
    if (!opponent) return false;
    return opponent.battleArea.some((p) => {
      const def = p.topCard ? getCardDefinition(p.topCard.cardId) : undefined;
      return def?.kinds.includes(CardKind.Digimon) && def.level !== undefined && def.level >= condition.level;
    });
  }
  if (condition.kind === "distinctNamedTamersWithTrait") {
    if (!viewer) return false;
    const names = new Set<string>();
    for (const p of viewer.battleArea) {
      const def = p.topCard ? getCardDefinition(p.topCard.cardId) : undefined;
      if (!def?.kinds.includes(CardKind.Tamer) || !cardHasTrait(def, condition.trait)) continue;
      names.add(def.nameEn);
    }
    return names.size >= condition.count;
  }
  if (condition.kind === "tamerHasExactName") {
    if (!viewer) return false;
    return viewer.battleArea.some((p) => {
      const def = p.topCard ? getCardDefinition(p.topCard.cardId) : undefined;
      return def?.kinds.includes(CardKind.Tamer) && def.nameEn === condition.name;
    });
  }
  return false;
}

function baseGrantedMatch(
  handDef: NonNullable<ReturnType<typeof getCardDefinition>>,
  base: Permanent,
  viewer: PlayerState | undefined,
  opponent: PlayerState | undefined,
): BaseGrantedDigivolve | undefined {
  if (base.inBreeding || !base.topCard) return undefined;
  const grants = baseGrantedDigivolveFor(base.topCard.cardId);
  if (grants === undefined) return undefined;
  return grants.find((g) => {
    const t = g.target;
    const targetMatch =
      Boolean(t.namesExact?.some((n) => handDef.nameEn === n)) ||
      Boolean(t.names?.some((n) => nameIncludesToken(handDef.nameEn, n))) ||
      Boolean(t.traits?.some((tr) => cardHasTrait(handDef, tr)));
    if (!targetMatch) return false;
    // A conditional grant needs the board state its gate reads; without it, do not highlight
    // (the server still validates).
    return g.condition === undefined || baseGrantConditionHolds(g.condition, viewer, opponent);
  });
}

/** A hand-resident "set the digivolution cost to <count>" static, declared through
 *  `residentZones` or the legacy `handResident` flag. */
interface HandResidentSetDigivolveCost {
  amount: number;
  scaling?: { per?: number; unit?: string; floor?: number };
  sourceFilter?: {
    level?: number;
    traits?: string[];
    nameOrTrait?: { tokens?: string[]; match?: string }[];
  };
}

function handResidentSetDigivolveCostOf(handCardId: string): HandResidentSetDigivolveCost | undefined {
  for (const effect of getCompiledCard(handCardId)?.effects ?? []) {
    for (const action of effect.actions ?? []) {
      const candidate = action as unknown as HandResidentSetDigivolveCost & {
        kind?: string;
        costType?: string;
        mode?: string;
        handResident?: boolean;
        residentZones?: ("hand" | "trash")[];
      };
      if (
        candidate.kind === "CostModifier" &&
        candidate.costType === "digivolve" &&
        candidate.mode === "set" &&
        (candidate.residentZones?.includes("hand") ?? candidate.handResident === true)
      ) {
        return candidate;
      }
    }
  }
  return undefined;
}

/** Whether the SET static's base gate (BT24-101's "[Aegiochusmon] in name") admits this base.
 *  A gateless static (BT7-040) rewrites every path. Mirrors the server's `sourceFilter` check
 *  against the base permanent in the hand-resident branch of the digivolve CostModifier. */
function setCostBaseGateHolds(
  gate: HandResidentSetDigivolveCost["sourceFilter"],
  baseDef: NonNullable<ReturnType<typeof getCardDefinition>>,
): boolean {
  if (gate === undefined) return true;
  if (gate.level !== undefined && baseDef.level !== gate.level) return false;
  if (gate.traits?.length && !gate.traits.some((trait) => cardHasTrait(baseDef, trait))) return false;
  for (const ref of gate.nameOrTrait ?? []) {
    const tokens = ref.tokens ?? [];
    if (tokens.length === 0) continue;
    const names = effectiveStaticNames(baseDef);
    const matched =
      ref.match === "trait"
        ? tokens.some((token) => cardHasTrait(baseDef, token))
        : ref.match === "nameExact"
          ? tokens.some((token) => effectiveExactNames(baseDef).includes(token))
          : tokens.some((token) => names.some((name) => nameIncludesToken(name, token)));
    if (!matched) return false;
  }
  return true;
}

/**
 * The absolute cost a hand-resident SET static charges for digivolving `handCardId` onto
 * `baseDef`, or undefined when the card prints no such static or its base gate fails.
 *
 * These cards print a per-unit RATE where every other card prints a price: BT24-101 reads
 * "Cost 1 for each of your security cards" and BT7-040 "Cost equal to your security count",
 * and the compiled requirement carries only the rate (1). Rendering that rate as the price
 * showed "Cost 1" at 0 security, where the real cost is 0 (KB BT24-101 Q5714) — visible
 * whenever the server has published no route to read instead, which is every moment outside
 * the viewer's own Main phase (`syncHandAffordances` fills routes only there).
 *
 * `scaling.floor` clamps the multiplier UP, which is what keeps BT7-040 at 1 on an empty
 * security stack while BT24-101, which prints no floor, reaches 0.
 */
function handResidentSetDigivolveCost(
  handCardId: string,
  baseDef: NonNullable<ReturnType<typeof getCardDefinition>>,
  viewer: PlayerState | undefined,
): number | undefined {
  const modifier = handResidentSetDigivolveCostOf(handCardId);
  if (modifier === undefined) return undefined;
  if (!setCostBaseGateHolds(modifier.sourceFilter, baseDef)) return undefined;
  const scaling = modifier.scaling;
  if (scaling === undefined) return Math.max(0, modifier.amount);
  // Only the security unit is priced here, the sole unit these statics count. Any other unit
  // keeps the printed figure rather than inventing a number the server would disagree with.
  if (scaling.unit !== "security") return undefined;
  if (viewer === undefined) return undefined;
  const per = scaling.per !== undefined && scaling.per > 0 ? scaling.per : 1;
  const scaled = Math.floor(viewer.security.length / per);
  return Math.max(0, scaling.floor !== undefined && scaled < scaling.floor ? scaling.floor : scaled);
}

/** A cost path for digivolving a hand card onto a base permanent. */
export interface EvoCostOption {
  type: "normal" | "alternate";
  /** Human-readable path label; the localized overlay renders the numeric memory cost. */
  label: string;
  cost: number;
  /**
   * Index into the card's printed alternate requirements, sent back as the digivolve intent's
   * `alternateRequirementIndex` so the server charges the path the player actually picked.
   * Absent for the printed EvoCost and for derived paths the server resolves on its own
   * (Tamer-onto, base-granted), which it takes when the intent names no index.
   */
  alternateRequirementIndex?: number;
}

/** A server-priced route, as projected onto the hand card (`CardInstance.digivolveRoutes`). */
export interface ProjectedDigivolveRoute {
  permanentId: string;
  alternateRequirementIndex: number;
  projectedCost: number;
}

/**
 * Returns all valid digivolution cost paths (normal + alternate) for evolving
 * `handCardId` onto `base`. When only one path matches, returns a single-element
 * array. When both match, returns both so the UI can offer a choice.
 */
export function getDigivolveCostOptions(
  handCardId: string,
  base: Permanent,
  viewer?: PlayerState,
  opponent?: PlayerState,
  projectedRoutes?: readonly ProjectedDigivolveRoute[],
): EvoCostOption[] {
  const hand = getCardDefinition(handCardId);
  const printedBase = base.topCard ? getCardDefinition(base.topCard.cardId) : undefined;
  const baseDef = printedBase ? { ...printedBase, nameEn: base.originalNameOverride || printedBase.nameEn } : undefined;
  if (!hand || !baseDef) return [];
  if (!hand.kinds.includes(CardKind.Digimon)) return [];

  const baseLevel = baseDef.level;
  const options: EvoCostOption[] = [];
  // A SET static replaces the printed base cost on EVERY path (KB BT7-040 Q1568), so it is
  // resolved once, before the paths are priced.
  const setCost = handResidentSetDigivolveCost(handCardId, baseDef, viewer);
  const intrinsicReduction = intrinsicDigivolutionCostReductionFor(handCardId, base);

  // Normal printed EvoCosts
  const baseColors = baseColorsOf(base, baseDef);
  for (const ev of hand.evoCosts) {
    if (ev.level === baseLevel && baseColors.includes(ev.color)) {
      const cost = Math.max(0, (setCost ?? ev.memoryCost) - intrinsicReduction);
      // A multicolor base may satisfy multiple printed color rows with the same cost. They
      // are the same server intent, so presenting duplicate buttons adds no player choice.
      if (options.some((option) => option.type === "normal" && option.cost === cost)) continue;
      options.push({
        type: "normal",
        label: `${ev.color} Lv.${ev.level}`,
        cost,
      });
    }
  }

  // Alternate digivolution requirements (named paths + any derived Tamer-onto path).
  const interchangeableAlternates = new Set<EvoCostOption>();
  for (const { req, requirementIndex } of alternateDigivolveMatches(handCardId, hand, base, baseDef, viewer)) {
    const opponentDigimonDpMin = req.opponentDigimonDpMin;
    if (
      opponentDigimonDpMin !== undefined &&
      !opponent?.battleArea.some(
        (candidate) =>
          candidate.topCard &&
          getCardDefinition(candidate.topCard.cardId)?.kinds.includes(CardKind.Digimon) &&
          candidate.currentDP >= opponentDigimonDpMin,
      )
    )
      continue;
    const cost = Math.max(0, (setCost ?? req.cost) - intrinsicReduction);
    const option: EvoCostOption = {
      type: "alternate",
      label: alternateCostLabel(req, baseLevel),
      cost,
      ...(requirementIndex === undefined ? {} : { alternateRequirementIndex: requirementIndex }),
    };
    if (!digivolutionRequirementHasSideEffect(req)) interchangeableAlternates.add(option);
    options.push(option);
  }

  // Base-granted path (ST7-03/BT6-060): a fixed-cost path the base offers this card.
  const granted = baseGrantedMatch(hand, base, viewer, opponent);
  if (granted) {
    const gate = granted.target.traits?.length
      ? `[${granted.target.traits.join("/")}]`
      : (granted.target.namesExact ?? granted.target.names ?? []).join("/");
    options.push({ type: "alternate", label: `${gate} · ${granted.cost} memory`, cost: granted.cost });
  }

  // Live identity grants can open paths absent from the printed definition. The server
  // already validates and prices these indexed routes against the current permanent.
  for (const route of projectedRoutes ?? []) {
    if (route.permanentId !== base.permanentId || route.alternateRequirementIndex < 0) continue;
    if (options.some((option) => option.alternateRequirementIndex === route.alternateRequirementIndex)) continue;
    const req = digivolutionRequirementsFor(handCardId)?.[route.alternateRequirementIndex];
    if (!req) continue;
    const option: EvoCostOption = {
      type: "alternate",
      label: alternateCostLabel(req, baseLevel),
      cost: route.projectedCost,
      alternateRequirementIndex: route.alternateRequirementIndex,
    };
    if (!digivolutionRequirementHasSideEffect(req)) interchangeableAlternates.add(option);
    options.push(option);
  }

  const priced = options.map((option) => priceFromServer(option, base.permanentId, projectedRoutes));
  // An alternate path that only sets the cost is no choice at all when a printed EvoCost costs
  // the same; the server takes the printed path without asking.
  const printedCosts = new Set(priced.filter((option) => option.type === "normal").map((option) => option.cost));
  return mergeEquivalentCostOptions(
    priced.filter(
      (option, index) => !(interchangeableAlternates.has(options[index]!) && printedCosts.has(option.cost)),
    ),
  );
}

/** Collapse alternate requirements that produce the same server-priced choice on this base. */
function mergeEquivalentCostOptions(options: readonly EvoCostOption[]): EvoCostOption[] {
  const merged: EvoCostOption[] = [];
  for (const option of options) {
    const existing = merged.find((candidate) => candidate.type === option.type && candidate.cost === option.cost);
    if (existing === undefined) {
      merged.push({ ...option });
      continue;
    }
    if (existing.label === option.label) continue;
    const first = /^(.*?)(?: trait)?( Lv\.[^ ]+)$/.exec(existing.label);
    const next = /^(.*?)(?: trait)?( Lv\.[^ ]+)$/.exec(option.label);
    existing.label =
      first !== null && next !== null && first[2] === next[2]
        ? `${first[1]} / ${next[1]} trait${first[2]}`
        : `${existing.label} / ${option.label}`;
  }
  return merged;
}

/**
 * Replace a path's printed price with the server's own, when the server projected that path
 * onto this base. Printed EvoCosts are only a starting point: an active continuous cost
 * modifier can rewrite the figure (BT24-101 charges 1 per security card, and does so on EVERY
 * path while an [Aegiochusmon] base is under it), and that rewrite lives in the engine. The
 * printed figure survives only as the fallback for a path the server did not price — a
 * prediction, never a promise, exactly like `projectedPlayCost`.
 */
function priceFromServer(
  option: EvoCostOption,
  permanentId: string,
  projectedRoutes: readonly ProjectedDigivolveRoute[] | undefined,
): EvoCostOption {
  if (!projectedRoutes) return option;
  const wanted = option.alternateRequirementIndex ?? -1;
  const route = projectedRoutes.find(
    (candidate) => candidate.permanentId === permanentId && candidate.alternateRequirementIndex === wanted,
  );
  return route === undefined ? option : { ...option, cost: route.projectedCost };
}

/** Human-readable label for an alternate digivolution path (gate + cost + any placement cost). */
function alternateCostLabel(req: DigivolutionRequirement, baseLevel: number | undefined): string {
  const gate = req.baseIsTamer
    ? "onto a Tamer"
    : req.traits && req.traits.length > 0
      ? `[${req.traits.join("/")}] trait`
      : req.traitSubstrings?.length
        ? `[${req.traitSubstrings.join("/")}] in trait`
        : req.names && req.names.length > 0
          ? req.names.join("/")
          : req.namesExact && req.namesExact.length > 0
            ? req.namesExact.join("/")
            : "alternate";
  const levelLabel = req.baseIsTamer
    ? ""
    : req.level !== undefined
      ? ` Lv.${req.level}`
      : req.levelMin !== undefined || req.levelMax !== undefined
        ? ` Lv.${req.levelMin ?? "?"}-${req.levelMax ?? "?"}`
        : baseLevel !== undefined
          ? ` Lv.${baseLevel}`
          : "";
  let label = `${gate}${levelLabel}`;
  if (req.placementCost) {
    const kinds = (req.placementCost.kinds ?? []).join("/");
    const traits = (req.placementCost.traits ?? []).map((t) => `[${t}]`).join("/");
    const what = [traits, kinds].filter(Boolean).join("/");
    label += ` + place ${req.placementCost.count} ${what} cards`;
  }
  return label;
}
