// Matching a filter against a live PERMANENT, and the source-relative helpers it needs.

import type { CardSource } from "../../CardSource.js";
import type { EffectContext } from "../../EffectContext.js";
import { printedKeywordsOf } from "../../../combat/keywords.js";
import { hasPlayCost } from "../../../cards/cardData.js";
import { COLOR_MAP, KIND_MAP } from "../maps.js";
import { scaleFactor } from "../scaling.js";
import { definitionMatches, matchNameOrTrait, textHasKeyword } from "./definition.js";
import { selfTargetPermanent } from "./selfTarget.js";
import { CardKind, effectiveExactNames, traitKey } from "@aegis/shared";
import type { CardColor, CardDefinition, Condition, Filter, Permanent, Seat } from "@aegis/shared";

/**
 * Whether a card matching the trait `filter` is in the SOURCE permanent's digivolution stack
 * (BT7-024 "while a card with [Hybrid] in its traits is in this Digimon's digivolution cards").
 * Matches each stack card's definition against `filter.nameOrTrait` via the shared
 * `matchNameOrTrait` (Form ∪ Attribute ∪ Type union). On a post-deletion timing window the
 * source permanent is already gone; use the deletion snapshot's stack instance ids and the
 * owner's trash to recover the same stack facts (P-145's conditional On Deletion). Returns
 * false when no live/source snapshot or trait filter is available.
 */
export function selfStackMatchesTrait(ctx: EffectContext, filter: Filter | undefined): boolean {
  if (filter === undefined) return false;
  const hasPredicate =
    (filter.nameOrTrait?.length ?? 0) > 0 || (filter.or?.length ?? 0) > 0 || (filter.and?.length ?? 0) > 0;
  if (!hasPredicate) return false;
  const self = ctx.source.permanent();
  if (self !== undefined)
    return self.stack.some((card) => card.faceUp === true && definitionMatches(filter, ctx.game.definitionOf(card)));
  const deletedStackIds = ctx.trigger.deletedWasStackInstanceIds;
  if (deletedStackIds === undefined || deletedStackIds.length === 0) return false;
  const trash = ctx.game.player(ctx.source.ownerSeat).trash;
  return deletedStackIds.some((instanceId) => {
    const card = trash.find((candidate) => candidate.instanceId === instanceId);
    // Deletion LKI reads the moved stack instance, retaining its event-time visibility state.
    return card?.faceUp === true && definitionMatches(filter, ctx.game.definitionOf(card));
  });
}

/**
 * Whether the SOURCE permanent's TOP card's trait union (Form ∪ Attribute ∪ Type) matches the
 * trait token(s) in `filter.nameOrTrait` (EX12-004 "this Digimon with the [TB] trait"). Only the
 * top card is checked — the permanent's live identity, not its digivolution stack. Returns false
 * when there is no source permanent (off-field) or no filter (conservative; we never invent a gate).
 */
export function selfTopMatchesTrait(ctx: EffectContext, filter: Filter | undefined): boolean {
  const refs = filter?.nameOrTrait;
  if (refs === undefined || refs.length === 0) return false;
  const self = ctx.source.permanent();
  if (self?.topCard === undefined) return false;
  const def = ctx.game.definitionOf(self.topCard);
  return refs.some((ref) => matchNameOrTrait(def, ref));
}

/**
 * Whether the SOURCE permanent's (the inherited host's) TOP card carries the text token(s) in
 * against the union via the shared `matchNameOrTrait`. Returns false when there is no source
 * permanent (off-field) or no filter (conservative; we never invent a gate).
 *
 * The TOP card only, deliberately: comprehensive.md §4-23-2 states that a Digimon does NOT gain a
 * digivolution card's text, and gives exactly this shape as its example — "A Digimon won't gain
 * the <Save> text from a digivolution card whose inherited effect reads '[Your Turn] While this
 * Digimon has <Save> in its text, it gets +2000 DP.'" Reading the whole stack here would make
 * BT17-034's and BT17-036's inherited "[Pulsemon] in its text" gates self-satisfying, since each
 * card names [Pulsemon] in its own digivolution requirement.
 */
export function selfTopMatchesText(ctx: EffectContext, filter: Filter | undefined): boolean {
  const refs = filter?.nameOrTrait;
  if (refs === undefined || refs.length === 0) return false;
  const self = ctx.source.permanent();
  const topCard =
    self?.topCard ??
    (ctx.trigger.deletedTopCardId !== undefined ? { cardId: ctx.trigger.deletedTopCardId } : undefined);
  if (topCard === undefined) return false;
  const def = ctx.game.definitionOf(topCard as never);
  return refs.some((ref) => matchNameOrTrait(def, ref));
}

export function sourceTopDefinition(ctx: EffectContext) {
  const topCard = ctx.source.permanent()?.topCard;
  if (topCard !== undefined) return ctx.game.definitionOf(topCard);
  // [On Deletion] conditions are evaluated after the permanent has moved to trash.
  // The live source can no longer recover its host, so use the per-instance host snapshot
  // the deletion producers capture. It is preferred over `deletedTopCardId` because a
  // two-sided battle deletion names only one host there, and an inherited effect on the
  // OTHER loser must read its own host (BT17-053).
  const hostInstanceId = ctx.trigger.deletedHostInstanceByInstanceId?.[ctx.source.instanceId];
  const host =
    hostInstanceId === undefined
      ? undefined
      : Array.from(ctx.game.state.players)
          .flatMap((player) => Array.from(player.trash))
          .find((card) => card.instanceId === hostInstanceId);
  if (host !== undefined) return ctx.game.definitionOf(host);
  // Fallback for producers that capture only the single deleted top card (and for a
  // token host, which leaves the match instead of entering trash).
  return ctx.trigger.deletedTopCardId === undefined
    ? undefined
    : ctx.game.definitionOf({ cardId: ctx.trigger.deletedTopCardId } as never);
}

export function compareNumber(actual: number, op: Condition["op"] | undefined, expected: number): boolean {
  switch (op) {
    case "lt":
      return actual < expected;
    case "lte":
      return actual <= expected;
    case "eq":
      return actual === expected;
    case "gt":
      return actual > expected;
    default:
      return actual >= expected;
  }
}

export function permanentStackHasSameLevelCards(ctx: EffectContext, permanent: Permanent, minCount: number): boolean {
  const levelCounts = new Map<number, number>();
  const cards = [permanent.topCard, ...permanent.stack].filter(
    (card): card is NonNullable<typeof card> => card !== undefined,
  );
  for (const card of cards) {
    const level = ctx.game.definitionOf(card).level;
    if (typeof level !== "number") continue;
    const next = (levelCounts.get(level) ?? 0) + 1;
    if (next >= minCount) return true;
    levelCounts.set(level, next);
  }
  return false;
}

export function sourceStackHasSameLevelCards(ctx: EffectContext, minCount: number): boolean {
  const self = ctx.source.permanent();
  return self !== undefined && permanentStackHasSameLevelCards(ctx, self, minCount);
}

// ---------------------------------------------------------------------------
// Target / filter resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a filter's controller scope to concrete seats relative to the source. Uses
 * the explicit `controller` when set; otherwise falls back to the runtime-only
 * `controllerDefault` hint (the prose default for an un-possessived target) so seat
 * enumeration still narrows even though the structural signature carried no owner
 * predicate. An unset/`any` scope spans both seats.
 */
export function seatsForController(ctx: EffectContext, filter: Filter): Seat[] {
  const mine = ctx.source.ownerSeat;
  const opp = ctx.game.opponentOf(mine);
  const scope = filter.controller ?? filter.controllerDefault;
  switch (scope) {
    case "mine":
      return [mine];
    case "opponent":
      return [opp];
    case "any":
    case undefined:
      return [mine, opp];
    default:
      return [mine, opp];
  }
}

/** Does a permanent's top card satisfy the (battle-area) filter? */
/**
 * The level bound for a `levelComparison.relativeTo:"lastDeleted"` filter: the printed level of
 * the Digimon just deleted in this resolution. Prefer the effect-result capture set by a
 * `deleteOwn` cost / Delete action (BT8-107). Fall back to the SubTrigger deletion subject, whose
 * top card is read from the event snapshot once the permanent has already left play (a
 * battle deletion's `onDeletionOf` watcher runs after the loser is gone — BT17-071).
 */
function lastDeletedLevelBound(ctx: EffectContext): number | undefined {
  if (ctx.lastDeletedLevel !== undefined) return ctx.lastDeletedLevel;
  const id = ctx.trigger.deletedPermanentId ?? ctx.trigger.subjectPermanentId;
  if (id === undefined) return undefined;
  const perm = ctx.game.permanentById(id);
  const topCardId =
    perm?.topCard?.cardId ??
    ctx.trigger.deletedPermanentSnapshots?.find((snapshot) => snapshot.permanentId === id)?.topCardId ??
    (id === ctx.trigger.deletedPermanentId ? ctx.trigger.deletedTopCardId : undefined);
  if (topCardId === undefined) return undefined;
  const level = ctx.game.definitionOf({ cardId: topCardId } as never).level;
  return level !== undefined && level > 0 ? level : undefined;
}

function lastDeletedDPBound(ctx: EffectContext): number | undefined {
  if (ctx.lastDeletedDP !== undefined) return ctx.lastDeletedDP;
  const id = ctx.trigger.deletedPermanentId ?? ctx.trigger.subjectPermanentId;
  if (id === undefined) return undefined;
  return ctx.game.permanentById(id)?.currentDP;
}

/**
 * Colors of every Digimon the effect's controller has on the field (battle area and breeding
 * area), used by `sharesColorWithControllersFieldDigimon`. Reads live (granted) colors where the
 * engine exposes them, so a color-changed Digimon counts as the color it currently is.
 */
export function controllersFieldDigimonColors(ctx: EffectContext): Set<CardColor> {
  const colors = new Set<CardColor>();
  const { battleArea, breeding } = ctx.game.player(ctx.source.ownerSeat);
  const fieldPermanents = breeding === undefined ? battleArea : [...battleArea, breeding];
  for (const permanent of fieldPermanents) {
    if (permanent.topCard === undefined) continue;
    const definition = ctx.game.definitionOf(permanent.topCard);
    if (!permanentMatchesFilter(ctx, permanent, { controller: "mine", kind: ["Digimon"] }, ctx.source)) continue;
    const effective =
      typeof ctx.game.effectiveColors === "function" ? ctx.game.effectiveColors(permanent) : definition.colors;
    for (const color of effective) colors.add(color);
  }
  return colors;
}

/**
 * `permanentMatchesFilter` with the permanent's top card read as `definition`: a Tamer that
 * digivolves "as if it is a level N Digimon" is matched as that Digimon (KB Q1157).
 */
export function permanentMatchesFilterAs(
  ctx: EffectContext,
  permanent: Permanent,
  filter: Filter,
  source: CardSource,
  definition: CardDefinition,
): boolean {
  const topInstanceId = permanent.topCard?.instanceId;
  const game = new Proxy(ctx.game, {
    get(target, property) {
      if (property === "definitionOf") {
        return (card: Parameters<typeof target.definitionOf>[0]) =>
          topInstanceId !== undefined && "instanceId" in card && card.instanceId === topInstanceId
            ? definition
            : target.definitionOf(card);
      }
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const asDefinitionContext = new Proxy(ctx, {
    get: (target, property) => (property === "game" ? game : Reflect.get(target, property, target)),
  });
  return permanentMatchesFilter(asDefinitionContext, permanent, filter, source);
}

export function permanentMatchesFilter(
  ctx: EffectContext,
  permanent: Permanent,
  filter: Filter,
  source: CardSource,
  opts?: { allowPendingRotationHost?: boolean },
): boolean {
  if (permanent.topCard === undefined) return false;
  const definition = ctx.game.definitionOf(permanent.topCard);
  const inactiveDualKind = permanent.placedByEffect ? CardKind.Digimon : CardKind.Option;
  const def = definition.isDualCard
    ? { ...definition, kinds: definition.kinds.filter((kind) => kind !== inactiveDualKind) }
    : definition;
  // DUAL stores its Option use cost in the catalog's cost field. On the field it
  // has no play cost to compare, even if a modifier would change that number.
  const referencesPlayCost =
    filter.playCost !== undefined ||
    filter.playCostLte !== undefined ||
    filter.playCostGte !== undefined ||
    (filter.playCostOneOf?.length ?? 0) > 0 ||
    filter.playCostLteTriggerSource === true ||
    filter.playCostLteAttackerLevel === true ||
    filter.playCostLteSourceDigivolutionCards === true ||
    filter.playCostLteScaling !== undefined ||
    filter.relativeTo?.attr === "playCost";
  if (referencesPlayCost && !hasPlayCost(definition)) {
    return false;
  }
  // Controller is a live permanent property, not part of the card definition. Keep
  // watcher-side matching (for example, a later entrant to an opponent-only aura)
  // subject to the same source-relative seat scope used during target enumeration.
  if (!seatsForController(ctx, filter).includes(permanent.controllerSeat)) return false;
  // A permanent filter naming a field zone must distinguish the breeding area from
  // the battle area. Cost-modifier predicates receive both kinds of permanent directly,
  // so relying on the caller's candidate scan would let battle-area-only reducers apply
  // in breeding (BT2-088 Q1038).
  if (filter.zone !== undefined) {
    const zones = Array.isArray(filter.zone) ? filter.zone : [filter.zone];
    const fieldZones = zones.filter((zone) => zone === "battleArea" || zone === "breeding");
    if (fieldZones.length > 0 && !fieldZones.includes(permanent.inBreeding ? "breeding" : "battleArea")) return false;
  }
  if (filter.excludeLeavingSubject === true && ctx.trigger.deletedPermanentId === permanent.permanentId) return false;
  const stackKeywords = (filter as Filter & { stackKeywords?: string[] }).stackKeywords;
  if (stackKeywords !== undefined) {
    if (
      !stackKeywords.every((keyword) =>
        permanent.stack.some(
          (card) =>
            card.faceUp === true &&
            textHasKeyword({ inheritedEffectText: ctx.game.definitionOf(card).inheritedEffectText }, keyword),
        ),
      )
    )
      return false;
    const { stackKeywords: _omit, ...withoutStackKeywords } = filter as Filter & { stackKeywords?: string[] };
    filter = withoutStackKeywords;
  }
  if (filter.excludeSelf || filter.isSelfRef === false) {
    const self = selfTargetPermanent(ctx, source);
    if (self !== undefined && self.permanentId === permanent.permanentId) {
      if (filter.excludeSelf) return false;
    }
  }
  // `isSelfRef: true` restricts the filter to THIS card's own permanent. Most targets carrying
  // it short-circuit in `candidatePermanents` before reaching here; the exception is a union
  // (`orFilters`) where "this Digimon" is one alternative among several (BT21-013: place the
  // card under this Digimon OR under a red Tamer with inherited effects).
  if (filter.isSelfRef === true) {
    const self = selfTargetPermanent(ctx, source);
    if (self === undefined || self.permanentId !== permanent.permanentId) return false;
  }
  // boundRef: restrict to permanents in the named effect-result binding (written by PlayPerLevel
  // or another producing action via `bindResultAs`). An unbound or empty ref matches nothing.
  if (filter.boundRef !== undefined) {
    const bound = ctx.boundPlayed?.get(filter.boundRef);
    const selected = ctx.selections?.get(filter.boundRef);
    if (!bound?.has(permanent.permanentId) && selected !== permanent.permanentId) return false;
  }
  if (
    typeof filter.playCost === "object" &&
    filter.playCost !== null &&
    "lteBindResult" in filter.playCost &&
    typeof filter.playCost.lteBindResult === "string"
  ) {
    const bound = ctx.boundPlayed?.get(filter.playCost.lteBindResult);
    const boundId = bound?.values().next().value as string | undefined;
    const boundPermanent = boundId === undefined ? undefined : ctx.game.permanentById(boundId);
    if (boundPermanent?.topCard === undefined) return false;
    if (!hasPlayCost(ctx.game.definitionOf(boundPermanent.topCard))) return false;
    const maximum = ctx.game.definitionOf(boundPermanent.topCard).playCost;
    const candidateCost = ctx.game.definitionOf(permanent.topCard).playCost;
    if (maximum === undefined || candidateCost === undefined || candidateCost > maximum) return false;
    const { playCost: _boundPlayCost, ...rest } = filter;
    filter = rest;
  }
  // excludeSelectionRef: drop a permanent bound earlier under SelectBind/Target.bindAs (the
  // positive counterpart of boundRef). Used for "choose N exemptions, then delete all other
  // Digimon" (EX11-011).
  if (filter.excludeSelectionRef !== undefined) {
    const refs = Array.isArray(filter.excludeSelectionRef) ? filter.excludeSelectionRef : [filter.excludeSelectionRef];
    for (const ref of refs) {
      if (ctx.selections?.get(ref) === permanent.permanentId) return false;
    }
  }
  // Host/target predicate for stack-card costs that refer to "that Digimon" from the
  // enclosing trigger (e.g. cards under the Digimon that attacked). This is useful inside
  // `hostFilter` for loose `digivolutionCards` candidates.
  if (filter.isTriggerSource === true) {
    const triggerId =
      ctx.trigger.subjectPermanentId ?? ctx.trigger.attackerPermanentId ?? ctx.trigger.deletedPermanentId;
    if (triggerId === undefined || permanent.permanentId !== triggerId) return false;
    const { isTriggerSource: _omit, ...rest } = filter;
    filter = rest;
  }
  if (filter.stackHasSameLevelCards !== undefined) {
    if (!permanentStackHasSameLevelCards(ctx, permanent, filter.stackHasSameLevelCards)) return false;
    const { stackHasSameLevelCards: _sameLevel, ...rest } = filter;
    filter = rest;
  }
  // Disjunctive sub-filter ("black or has [Legend-Arms] in its traits"): the permanent matches
  // the OR group if it satisfies ANY alternative. Each alternative is a full Filter, so it is
  // evaluated against the LIVE permanent (recursing) — an alternative may itself constrain DP,
  // suspended state, kind, etc. The remaining (non-`or`) fields on the parent still apply (AND),
  // so strip `or` before delegating to the field-by-field checks to avoid re-evaluating it.
  if (filter.or && filter.or.length > 0) {
    if (!filter.or.some((alt) => permanentMatchesFilter(ctx, permanent, alt, source))) return false;
    const { or: _or, ...rest } = filter;
    filter = rest;
  }

  if (filter.colorMatchesAnyDigivolutionCard === true) {
    // Iterated rather than flatMapped: the stack is an ArraySchema, which implements the array
    // methods it can synchronize and throws on the rest — `flatMap` is one of the rest.
    const sourceColors = new Set<CardColor>();
    for (const card of source.permanent()?.stack ?? []) {
      if (card.faceUp !== true) continue;
      for (const color of ctx.game.definitionOf(card).colors) sourceColors.add(color);
    }
    const effectiveColors =
      typeof ctx.game.effectiveColors === "function" ? ctx.game.effectiveColors(permanent) : def.colors;
    if (!effectiveColors.some((color) => sourceColors.has(color))) return false;
    const { colorMatchesAnyDigivolutionCard: _colorMatch, ...rest } = filter;
    filter = rest;
  }

  if (filter.sharesColorWithControllersFieldDigimon === true) {
    const boardColors = controllersFieldDigimonColors(ctx);
    const effectiveColors =
      typeof ctx.game.effectiveColors === "function" ? ctx.game.effectiveColors(permanent) : def.colors;
    if (!effectiveColors.some((color) => boardColors.has(color))) return false;
    const { sharesColorWithControllersFieldDigimon: _sharesColor, ...rest } = filter;
    filter = rest;
  }

  // `placedInBattleAreaByEffect`: an Option only becomes a battle-area permanent when a
  // "place this card in the battle area" effect put it there (normal Option use trashes it), so
  // a battle-area Option permanent satisfies this — a non-Option never does (Cap-E-006). A DUAL
  // card on the field as a Digimon was not placed that way, so it doesn't either (KB Q6436).
  const placedOption =
    def.kinds.includes(CardKind.Option) && (!def.kinds.includes(CardKind.Digimon) || permanent.placedByEffect);
  if (filter.placedInBattleAreaByEffect === true && !placedOption) {
    return false;
  }

  // Dynamic level bounds such as "level >= the total cards in both security stacks"
  // carry their live counting filter as the comparison value. Resolve that count before
  // delegating to definitionMatches; treating the object as a numeric bound silently rejects
  // every candidate (EX5-033 / KB Q3597-Q3599).
  const levelComparison = filter.levelComparison as
    | { op?: Condition["op"]; value?: number | { kind?: string; filter?: Filter } }
    | undefined;
  const dynamicCount = levelComparison?.value;
  if (typeof dynamicCount === "object" && dynamicCount !== null && dynamicCount.kind === "dynamicCount") {
    const bound = scaleFactor(ctx, {
      per: 1,
      unit: "cards",
      filter: dynamicCount.filter ?? {},
    });
    if (
      def.level === undefined ||
      levelComparison?.op === undefined ||
      !compareNumber(def.level, levelComparison.op, bound)
    )
      return false;
    const { levelComparison: _levelComparison, ...rest } = filter;
    filter = rest;
  }

  // DP threshold needs the live permanent, so it lives here (not in definitionMatches).
  // Strip dp from filter after evaluation so definitionMatches doesn't double-check using
  // the printed (static) dp, which may differ from currentDP after ModifyDP effects.
  if (filter.dp) {
    const cmp = filter.dp;
    let bound: number | undefined;
    if (cmp.relativeTo === "lastDeleted") {
      bound = lastDeletedDPBound(ctx);
    } else if (cmp.relativeToSource) {
      bound = source.permanent()?.currentDP;
    } else if (cmp.relativeToFilter !== undefined) {
      const referenceDps = seatsForController(ctx, cmp.relativeToFilter).flatMap((seat) =>
        ctx.game
          .player(seat)
          .battleArea.filter((candidate) => permanentMatchesFilter(ctx, candidate, cmp.relativeToFilter!, source))
          .map((candidate) => candidate.currentDP),
      );
      bound = referenceDps.length > 0 ? Math.max(...referenceDps) : undefined;
    } else if (cmp.valueFrom !== undefined) {
      const boundIds = ctx.boundPlayed?.get(cmp.valueFrom);
      const boundId = boundIds?.values().next().value as string | undefined;
      const boundPermanent = boundId !== undefined ? ctx.game.permanentById(boundId) : undefined;
      bound = boundPermanent?.currentDP;
    } else {
      bound = cmp.value;
    }
    if (bound === undefined) return false;
    if (cmp.op === "lte" && !(permanent.currentDP <= bound)) return false;
    if (cmp.op === "gte" && !(permanent.currentDP >= bound)) return false;
    if (cmp.op === "eq" && permanent.currentDP !== bound) return false;
    const { dp: _dp, ...rest } = filter;
    filter = rest;
  }

  // Runtime DP threshold bound to the permanent suspended by this effect's immediately preceding
  // suspend payment/action (BT16-048: return a Digimon with DP <= the Digimon this effect
  // suspended). If multiple were suspended, use the maximum DP to preserve "up to" benefit.
  if (filter.dpLessOrEqualToSuspendedDigimon === true) {
    const bound = (ctx.lastSuspendedPermanentIds ?? [])
      .map((id) => ctx.game.permanentById(id)?.currentDP)
      .filter((dp): dp is number => dp !== undefined)
      .reduce<number | undefined>((max, dp) => (max === undefined ? dp : Math.max(max, dp)), undefined);
    if (bound === undefined || permanent.currentDP > bound) return false;
    const { dpLessOrEqualToSuspendedDigimon: _dpBound, ...rest } = filter;
    filter = rest;
  }

  // Selection-relative threshold ("DP/level/play cost <op> the chosen Digimon's"): compare the
  // candidate's live attribute to the bound selection's. An unresolved ref excludes the
  if (filter.relativeTo) {
    const rel = filter.relativeTo;
    const boundId = ctx.selections?.get(rel.selectionRef);
    const boundPerm = boundId !== undefined ? ctx.game.permanentById(boundId) : undefined;
    const attrOf = (p: Permanent): number | undefined => {
      if (rel.attr === "dp") return p.currentDP;
      if (rel.attr === "digivolutionCount") return p.stack.length;
      const cardDef = p.topCard ? ctx.game.definitionOf(p.topCard) : undefined;
      if (rel.attr === "level") return cardDef?.level ?? undefined;
      if (rel.attr === "playCost") return cardDef !== undefined && hasPlayCost(cardDef) ? cardDef.playCost : undefined;
      return undefined;
    };
    // The bound permanent may already have left the board — the same clause often deletes it
    // before the comparison runs — so fall back to the snapshot taken when it was chosen.
    const rhs = boundPerm !== undefined ? attrOf(boundPerm) : ctx.selectionFacts?.get(rel.selectionRef)?.[rel.attr];
    if (rhs === undefined) return false;
    const lhs = attrOf(permanent);
    if (lhs === undefined || rhs === undefined) return false;
    if (rel.op === "lte" && !(lhs <= rhs)) return false;
    if (rel.op === "gte" && !(lhs >= rhs)) return false;
    if (rel.op === "eq" && lhs !== rhs) return false;
  }

  // Runtime-scaled level threshold ("delete 1 level 4 or lower; add 1 to the level cap for
  // each of your other Digimon" — BT16-079). This is a target-cap adjustment, distinct from
  // DeleteLevelBudget's "sum of levels" semantics. Strip the comparison afterward so
  // definitionMatches does not re-apply the unscaled base threshold.
  if (filter.levelComparison?.value !== undefined && filter.levelComparison.scaling !== undefined) {
    const level = def.level;
    if (level === undefined) return false;
    const { op, value, scaling } = filter.levelComparison;
    const bound = value + scaleFactor(ctx, scaling);
    if (op === "lte" && !(level <= bound)) return false;
    if (op === "gte" && !(level >= bound)) return false;
    if (op === "eq" && level !== bound) return false;
    const { levelComparison: _lc, ...rest } = filter;
    filter = rest;
  }

  // Dynamic level threshold bound to a just-deleted Digimon ("delete an opponent's Digimon with
  // level <= the deleted Digimon's level" — BT8-107 cost-deleted, BT17-071 SubTrigger subject;
  // definitionMatches does not re-apply it with a missing `value`. An unresolved bound (no
  if (filter.levelComparison?.relativeTo === "lastDeleted") {
    const bound = lastDeletedLevelBound(ctx);
    const level = def.level;
    if (bound === undefined || level === undefined) return false;
    const { op } = filter.levelComparison;
    if (op === "lte" && !(level <= bound)) return false;
    if (op === "gte" && !(level >= bound)) return false;
    if (op === "eq" && level !== bound) return false;
    const { levelComparison: _lc, ...rest } = filter;
    return permanentMatchesFilter(ctx, permanent, rest, source);
  }

  // Dynamic level cap ("level 4 or lower. For each of your other Digimon, add 1 to the
  // maximum level you can choose", BT16-079). Apply the runtime scaling to the static bound,
  // then strip the dynamic comparison before delegating to definitionMatches.
  if (filter.levelComparison?.scaling !== undefined && filter.levelComparison.value !== undefined) {
    const level = def.level;
    if (level === undefined) return false;
    const { op, value, scaling } = filter.levelComparison;
    const bound = value + scaleFactor(ctx, scaling);
    if (op === "lte" && !(level <= bound)) return false;
    if (op === "gte" && !(level >= bound)) return false;
    if (op === "eq" && level !== bound) return false;
    const { levelComparison: _lc, ...rest } = filter;
    return permanentMatchesFilter(ctx, permanent, rest, source);
  }

  // Dynamic level upper bound from a named context variable (string) or a static numeric cap
  // (BT19-002 "levelLte: 'returnedDigimonLevel'" — the cap is the returned Digimon's level stored
  // by the preceding return cost's `storeAs`). A string key missing from namedCounts excludes all.
  if (filter.levelLte !== undefined) {
    const bound = typeof filter.levelLte === "string" ? ctx.namedCounts?.get(filter.levelLte) : filter.levelLte;
    if (bound === undefined || def.level === undefined || !(def.level <= bound)) return false;
  }
  if (filter.levelLteTriggerSource === true) {
    const bound = ctx.trigger.playedLevel;
    if (bound === undefined || def.level === undefined || def.level > bound) return false;
  }
  if (filter.levelEqTriggerSource === true) {
    const bound = ctx.trigger.playedLevel;
    if (bound === undefined || def.level === undefined || def.level !== bound) return false;
  }
  if (filter.playCostLteTriggerSource === true) {
    const triggerPermanentId = ctx.trigger.suspendedPermanentId ?? ctx.trigger.subjectPermanentId;
    const triggerPermanent = triggerPermanentId === undefined ? undefined : ctx.game.permanentById(triggerPermanentId);
    const triggerDefinition =
      triggerPermanent?.topCard === undefined ? undefined : ctx.game.definitionOf(triggerPermanent.topCard);
    if (triggerDefinition !== undefined && !hasPlayCost(triggerDefinition)) return false;
    const bound = ctx.trigger.playedPlayCost ?? triggerDefinition?.playCost;
    if (bound === undefined || def.playCost > bound) return false;
    const { playCostLteTriggerSource: _bound, ...rest } = filter;
    filter = rest;
  }
  if (filter.playCostLteAttackerLevel === true) {
    const attackerId = ctx.trigger.attackerPermanentId;
    const attacker = attackerId === undefined ? undefined : ctx.game.permanentById(attackerId);
    const attackerLevel = attacker?.topCard === undefined ? undefined : ctx.game.definitionOf(attacker.topCard).level;
    if (attackerLevel === undefined || def.playCost > attackerLevel) return false;
    const { playCostLteAttackerLevel: _bound, ...rest } = filter;
    filter = rest;
  }
  if (filter.levelEq !== undefined) {
    const bound = typeof filter.levelEq === "string" ? ctx.namedCounts?.get(filter.levelEq) : filter.levelEq;
    if (bound === undefined || def.level === undefined || def.level !== bound) return false;
  }

  // Alternative generated shape for "level <= the number of cards in your or their security
  // stack" (BT16-063). A candidate is legal if it fits at least one of the two counts, which is
  // equivalent to checking against the maximum count.
  {
    const levelShape = filter.level;
    if (
      typeof levelShape === "object" &&
      levelShape !== null &&
      "lte" in levelShape &&
      levelShape.lte.kind === "chooseEitherSecurityCount"
    ) {
      const mine = ctx.game.player(ctx.source.ownerSeat).security.length;
      const opp = ctx.game.player(ctx.game.opponentOf(ctx.source.ownerSeat)).security.length;
      const bound = Math.max(mine, opp);
      if (def.level === undefined || def.level > bound) return false;
      const { level: _level, ...rest } = filter;
      filter = rest;
    }
  }

  // Suspended-state filter ("1 of your opponent's suspended Digimon") — live state.
  if (filter.suspended === true && !permanent.isSuspended) return false;
  if (filter.suspended === false && permanent.isSuspended) return false;
  // Unsuspended-state filter ("opponent has no unsuspended Digimon") — live state.
  if (filter.unsuspended && permanent.isSuspended) return false;
  if (filter.sameOrientationAsSource) {
    // In an attack window, the trigger's attacker is the authoritative live "this Digimon"
    // identity. Prefer it over a possibly stale/conferred CardSource, while retaining the
    // source lookup for non-attack effect contexts that use this predicate.
    const relativePermanentId = ctx.trigger.attackerPermanentId ?? ctx.trigger.subjectPermanentId;
    const sourcePermanent =
      relativePermanentId !== undefined ? ctx.game.permanentById(relativePermanentId) : source?.permanent();
    if (sourcePermanent === undefined || permanent.isSuspended !== sourcePermanent.isSuspended) return false;
  }

  if ((filter.digivolutionCards === "none" || filter.digivolutionCards === "hasNone") && permanent.stack.length > 0)
    return false;
  if (filter.digivolutionCards === "hasAny" && permanent.stack.length === 0) return false;
  if (filter.digivolutionCards === "hasFaceDown" && !permanent.stack.some((card) => !card.faceUp)) return false;
  // "WITH digivolution cards" alias (BT17-098): at least one card under the top.
  if (filter.hasDigivolutionCards === true && permanent.stack.length === 0) return false;

  // Digivolution-stack KIND gate ("a Digimon with a Tamer card in its digivolution cards",
  // BT17-090): at least one stacked card must be of one of the requested kinds. Distinct from
  // the count-only `digivolutionCards:"hasAny"`.
  if (filter.digivolutionStackKind && filter.digivolutionStackKind.length > 0) {
    const wanted = filter.digivolutionStackKind.map((k) => KIND_MAP[k as keyof typeof KIND_MAP]);
    const hit = permanent.stack.some((card) => {
      if (card.faceUp !== true) return false;
      const stackDef = ctx.game.definitionOf(card);
      return wanted.some((k) => k !== undefined && stackDef.kinds.includes(k));
    });
    if (!hit) return false;
  }
  if (filter.digivolutionStackKindExclude && filter.digivolutionStackKindExclude.length > 0) {
    const excluded = filter.digivolutionStackKindExclude.map((k) => KIND_MAP[k as keyof typeof KIND_MAP]);
    const hit = permanent.stack.some((card) => {
      if (card.faceUp !== true) return false;
      const stackDef = ctx.game.definitionOf(card);
      return excluded.some((k) => k !== undefined && stackDef.kinds.includes(k));
    });
    if (hit) return false;
  }

  // Digivolution-stack name/trait gate: unlike the ordinary `nameOrTrait` predicate (which
  // inspects the permanent's TOP card), this requires a matching card UNDER that top card.
  if (filter.digivolutionStackNameOrTrait && filter.digivolutionStackNameOrTrait.length > 0) {
    const refs = filter.digivolutionStackNameOrTrait;
    const hit = permanent.stack.some((card) => {
      if (card.faceUp !== true) return false;
      const stackDefinition = ctx.game.definitionOf(card);
      return refs.some((ref) => definitionMatches({ nameOrTrait: [{ ...ref, negate: false }] }, stackDefinition));
    });
    // A negated stack predicate means that NONE of the stacked cards may match the
    // referenced name/trait (EX5-070: without [X Antibody] in its digivolution cards).
    if (refs.every((ref) => ref.negate === true)) {
      if (hit) return false;
    } else if (!hit) {
      return false;
    }
  }

  // Digivolution-stack NAME exclusion ("[Diaboromon] without [Doomsday Clock] in its
  // digivolution cards", BT17-100): reject if any stacked card has an excluded exact name.
  if (filter.excludeCardsNamed && filter.excludeCardsNamed.length > 0) {
    const excluded = filter.excludeCardsNamed.map((n) => n.toLowerCase());
    const hasExcluded = permanent.stack.some((card) => {
      if (card.faceUp !== true) return false;
      const name = (ctx.game.definitionOf(card).nameEn ?? "").toLowerCase();
      return excluded.some((n) => name === n);
    });
    if (hasExcluded) return false;
  }

  // Same-name-as-source filter ("another Digimon with the same name as this Digimon", BT2-053).
  // Compares the candidate's live top-card name to the SOURCE permanent's live top-card name
  // (the evolved-into form, not the printed card id — KB Q1023). An off-field source matches none.
  if (filter.isSameName === true) {
    const selfTop = source.permanent()?.topCard;
    if (selfTop === undefined) return false;
    const selfName = (ctx.game.definitionOf(selfTop).nameEn ?? "").toLowerCase();
    const candName = (def.nameEn ?? "").toLowerCase();
    if (selfName === "" || selfName !== candName) return false;
  }

  if (filter.sameNameAsSelection !== undefined) {
    const selectedId = ctx.selections?.get(filter.sameNameAsSelection);
    const selected = selectedId === undefined ? undefined : ctx.game.permanentById(selectedId);
    if (permanent.topCard === undefined) return false;
    // Sharing a name means sharing any one name, "also treated as" names included (Q2338).
    const liveNames = (live: Permanent): readonly string[] =>
      ctx.game.effectiveNames?.(live) ?? effectiveExactNames(ctx.game.definitionOf(live.topCard));
    const selectedNames = new Set(
      (selected?.topCard === undefined
        ? (ctx.selectionFacts?.get(filter.sameNameAsSelection)?.names ?? [])
        : liveNames(selected)
      )
        .map((name) => name.toLowerCase())
        .filter((name) => name !== ""),
    );
    if (!liveNames(permanent).some((name) => selectedNames.has(name.toLowerCase()))) return false;
  }

  // Comparative digivolution-stack-size filter relative to the effect source ("a Digimon with as
  // many or fewer digivolution cards as this Digimon" — AD1-025, BT16-027). Compare the candidate's
  // stack size to the source Digimon's; an unresolvable source excludes the candidate.
  if (filter.digivolutionCardsCompareToSource) {
    const sourceStack = source.permanent()?.stack.length;
    if (sourceStack === undefined) return false;
    const op = filter.digivolutionCardsCompareToSource;
    if (op === "lte" && !(permanent.stack.length <= sourceStack)) return false;
    if (op === "gte" && !(permanent.stack.length >= sourceStack)) return false;
    if (op === "eq" && permanent.stack.length !== sourceStack) return false;
  }

  // Dynamic play-cost cap relative to the effect source's stack size ("play costs less than or
  // equal to this Digimon's digivolution cards" — BT7-065). This compares the candidate's printed
  // play cost to the source permanent's current digivolution-card count.
  if (filter.playCostLteSourceDigivolutionCards === true) {
    const sourceStack = source.permanent()?.stack.length;
    if (sourceStack === undefined || def.playCost > sourceStack) return false;
    const { playCostLteSourceDigivolutionCards: _cap, ...rest } = filter;
    filter = rest;
  }

  // Absolute digivolution-stack-size upper bound ("1 or fewer digivolution cards" — BT20-055,
  // CAP-H-02). Distinct from digivolutionCards:"none" (stack.length === 0).
  if (filter.digivolutionCardsAtMost !== undefined && permanent.stack.length > filter.digivolutionCardsAtMost)
    return false;

  // Absolute digivolution-stack-size lower bound ("4 or more digivolution cards" — BT1-085).
  if (filter.digivolutionCardsAtLeast !== undefined && permanent.stack.length < filter.digivolutionCardsAtLeast)
    return false;

  // Runtime-scaled play-cost cap ("delete a play cost 3 or lower Digimon; for each [X] in
  // your trash add 1 to the maximum" — EX5-054). The effective cap is the static base plus
  // the scaled bonus; check it against the candidate's printed play cost, then strip the cap
  // fields so definitionMatches does not re-apply the static-only bound.
  if (filter.playCostLteScaling) {
    const base = filter.playCostLte ?? 0;
    const cap = base + scaleFactor(ctx, filter.playCostLteScaling);
    if ((def.playCost ?? 0) > cap) return false;
    const { playCostLte: _baseCap, playCostLteScaling: _scaledCap, ...rest } = filter;
    return definitionMatches(rest, def);
  }

  // A live Digimon's "play cost" observes active modifiers (EX10-028 Q5100), unlike a loose
  // hand/trash/deck card whose filter necessarily uses its printed definition. Resolve and strip
  // these bounds here so definitionMatches does not reapply them to the printed value.
  if (filter.playCostLte !== undefined || filter.playCostGte !== undefined) {
    const cost = ctx.fx.effectivePlayCost?.(permanent) ?? def.playCost;
    if (filter.playCostLte !== undefined && cost > filter.playCostLte) return false;
    if (filter.playCostGte !== undefined && cost < filter.playCostGte) return false;
    const { playCostLte: _lte, playCostGte: _gte, ...rest } = filter;
    filter = rest;
  }

  // Runtime-scaled printed-DP cap for hand/deck play candidates (BT11-016).
  if (filter.dpAtMostScaling) {
    const base = filter.dpAtMost ?? 0;
    const cap = base + scaleFactor(ctx, filter.dpAtMostScaling) * (filter.dpAtMostScaling.bonus ?? 1);
    if ((def.dp ?? 0) > cap) return false;
    const { dpAtMost: _baseCap, dpAtMostScaling: _scaledCap, ...rest } = filter;
    return definitionMatches(rest, def);
  }

  // Name predicates on a LIVE permanent observe original-name rewrites and granted names.
  // A rewrite replaces the printed name, so do not let definitionMatches fall back to it when
  // none of the effective names match. Other entries in nameOrTrait remain valid OR branches.
  if (filter.nameOrTrait?.some((reference) => reference.match === "name" || reference.match === "nameExact")) {
    const effectiveNames = ctx.game.effectiveNames?.(permanent);
    if (effectiveNames !== undefined) {
      const nameReferences = filter.nameOrTrait.filter(
        (reference) => reference.match === "name" || reference.match === "nameExact",
      );
      const matchesEffectiveName = nameReferences.some((reference) =>
        effectiveNames.some((name) =>
          matchNameOrTrait({ ...def, cardId: undefined, nameEn: name, nameAliases: undefined }, reference),
        ),
      );
      if (matchesEffectiveName) {
        const { nameOrTrait: _nameOrTrait, ...rest } = filter;
        filter = rest;
      } else {
        const printedNameStillEffective = effectiveNames.some((name) =>
          matchNameOrTrait(
            { ...def, cardId: undefined, nameEn: name, nameAliases: undefined },
            { tokens: [def.nameEn], match: "nameExact" },
          ),
        );
        // Definition matching also supplies static Rule aliases. Retain the name branches
        // while the printed identity is still live so those aliases remain order-independent
        // during continuous-effect recomputation.
        if (!printedNameStillEffective) {
          const remainingReferences = filter.nameOrTrait.filter(
            (reference) => reference.match !== "name" && reference.match !== "nameExact",
          );
          if (remainingReferences.length === 0) return false;
          filter = { ...filter, nameOrTrait: remainingReferences };
        }
      }
    }
  }

  // Trait predicates on a LIVE permanent observe continuously granted traits as well as
  // printed ones. `nameOrTrait` is an OR-list, so one matching runtime trait satisfies the
  // complete clause; other name/text alternatives remain definition-matched when it does not.
  // A negated reference ("without [X-Antibody] in its traits", BT7-106) excludes rather than
  // qualifies, so it never short-circuits the clause; matchNameOrTrait applies its negation.
  const isPositiveTrait = (reference: { match: string; negate?: boolean }) =>
    reference.match === "trait" && reference.negate !== true;
  if (filter.nameOrTrait?.some(isPositiveTrait)) {
    const effectiveTraits = ctx.game.effectiveTraits?.(permanent.permanentId) ?? [
      ...(def.forms ?? []),
      ...(def.attributes ?? []),
      ...(def.types ?? []),
    ];
    const normalized = new Set(effectiveTraits.map(traitKey));
    const matchesGrantedTrait = filter.nameOrTrait.some(
      (reference) => isPositiveTrait(reference) && reference.tokens.some((token) => normalized.has(traitKey(token))),
    );
    if (matchesGrantedTrait) {
      const { nameOrTrait: _nameOrTrait, ...rest } = filter;
      filter = rest;
    }
  }

  // Text-presence references such as "with an [On Deletion] effect" observe live
  // inherited text and named effects granted by another card (EX1-021 Q3208), not
  // merely the printed text of the permanent's top card.  Keep name/trait matching
  // definition-based; a live text hit satisfies the whole OR-list.
  if (filter.printedTextOnly !== true && filter.nameOrTrait?.some((reference) => reference.match === "text")) {
    const textRefs = filter.nameOrTrait.filter((reference) => reference.match === "text");
    const inheritedText = permanent.stack
      .filter((card) => card.faceUp === true)
      .map((card) => ctx.game.definitionOf(card).inheritedEffectText ?? "")
      .join("\n")
      .toLowerCase()
      // A condition such as "this Digimon with [Pulsemon] in its text" references the token
      // rather than carrying it, so it must not satisfy its own text test (comprehensive rule 4-23-2; BT20-089).
      .replace(/\[[^\]]+\](?:\s*(?:,|\/|or)\s*\[[^\]]+\])*\s+in\s+(?:its|their)\s+texts?/g, "");
    const normalizedInheritedText = inheritedText.replace(/[\s-]+/g, "");
    const grantedTokens = ctx.fx.customEffectGrants?.(permanent.permanentId) ?? [];
    const liveMatches = textRefs.some((reference) =>
      reference.tokens.some((token) => {
        const normalizedToken = token.toLowerCase().replace(/[\s-]+/g, "");
        const inheritedHeader = new RegExp(
          `(?:^|\\n)\\s*\\[${token.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\]`,
          "i",
        );
        return (
          inheritedHeader.test(inheritedText) ||
          normalizedInheritedText.includes(`[${normalizedToken}]`) ||
          grantedTokens.some((grant) => {
            const granted = grant.token.toLowerCase();
            return (
              granted.includes(`[${token.toLowerCase()}]`) || granted.replace(/[\s-]+/g, "").includes(normalizedToken)
            );
          })
        );
      }),
    );
    if (liveMatches) {
      // nameOrTrait is a union (OR), so a live text hit satisfies the whole field;
      // retaining non-text alternatives here would accidentally turn it into AND.
      const { nameOrTrait: _nameOrTrait, ...rest } = filter;
      filter = rest;
    }
  }

  // Color predicates on a LIVE permanent must observe "also treated as <color>" grants.
  // Definition-only filters still use printed colors, but board predicates such as `youHave`
  // and effect targets see the permanent's effective set (printed union active grants).
  if (
    (filter.colors && filter.colors.length > 0) ||
    (filter.colorsAll && filter.colorsAll.length > 0) ||
    (filter.excludeColors && filter.excludeColors.length > 0) ||
    filter.multicolor === true ||
    filter.colorCount !== undefined
  ) {
    const effective = typeof ctx.game.effectiveColors === "function" ? ctx.game.effectiveColors(permanent) : def.colors;
    if (filter.colors && filter.colors.length > 0) {
      const wanted = filter.colors.map((color) => COLOR_MAP[color]);
      if (!wanted.some((color) => effective.includes(color))) return false;
    }
    if (filter.colorsAll && filter.colorsAll.length > 0) {
      const wanted = filter.colorsAll.map((color) => COLOR_MAP[color]);
      if (!wanted.every((color) => effective.includes(color))) return false;
    }
    if (filter.excludeColors && filter.excludeColors.length > 0) {
      const banned = filter.excludeColors.map((color) => COLOR_MAP[color]);
      if (banned.some((color) => effective.includes(color))) return false;
    }
    if (filter.multicolor === true && new Set(effective).size < 2) return false;
    if (filter.colorCount !== undefined && new Set(effective).size !== filter.colorCount) return false;
    const {
      colors: _colors,
      colorsAll: _colorsAll,
      excludeColors: _excludeColors,
      multicolor: _multicolor,
      colorCount: _colorCount,
      ...rest
    } = filter;
    filter = rest;
  }

  // Kind filter with effective-type grants ("treat as Digimon"): a Tamer permanent
  // granted Digimon kind should pass a kind:["Digimon"] filter (HARD-01). When
  // GameAccess.effectiveKinds is available, check effective kinds first; fall back
  // to the static CardDefinition.kinds when it isn't (test fakes / lightweight calls).
  if (filter.kind?.includes("Digimon")) {
    const effective = (ctx.game.effectiveKinds?.(permanent.permanentId, def.kinds) ?? def.kinds).filter(
      (kind) => !def.isDualCard || kind !== inactiveDualKind,
    );
    if (effective !== undefined) {
      const wanted = filter.kind.map((k) => KIND_MAP[k]);
      const tokenAsDigimon = filter.allowTokens === true && def.isToken === true && wanted.includes(CardKind.Digimon);
      const liveDigimon =
        permanent.topCard.faceUp !== false &&
        wanted.includes(CardKind.Digimon) &&
        (def.kinds.includes(CardKind.Digimon) || def.kinds.includes(CardKind.DigiEgg));
      const pendingEgg =
        opts?.allowPendingRotationHost === true &&
        def.kinds.includes(CardKind.DigiEgg) &&
        permanent.permanentId === ctx.pendingRotationHostPermanentId;
      if (!tokenAsDigimon && !liveDigimon && !pendingEgg && !wanted.some((k) => effective.includes(k))) return false;
      // Strip kind from filter so definitionMatches doesn't double-check against static def.kinds
      const { kind: _k, ...rest } = filter;
      filter = rest;
    }
  }

  // Keyword-presence on a LIVE permanent ("Digimon with ＜Security Attack＞") must see
  // keywords conferred by ＜...+/-＞ grants, not only the printed text (KB BT12-040 Q2172).
  // Ask GameAccess first: its engine binding resolves the permanent's complete live keyword
  // set, including inherited/static stack keywords (for example ST5-11 conferring Blocker),
  // while `fx.grantedKeywords` only contains ledger grants. Keep both reads because lightweight
  // interpreter tests may supply a primitive grant store without a fully bound GameAccess.
  // Delegate the remaining definition-only predicates with the keyword clause stripped so it
  // is not re-checked against printed text alone.
  if (filter.keywords && filter.keywords.length > 0) {
    const granted = new Set((ctx.fx.grantedKeywords?.(permanent.permanentId) ?? []).map((g) => g.keyword));
    const hasKeyword = (kw: string | { keyword?: string }): boolean => {
      const token = typeof kw === "string" ? kw : (kw.keyword ?? "");
      const liveKeyword = ctx.game.hasKeyword?.(permanent.permanentId, token);
      return (
        liveKeyword === true ||
        granted.has(token) ||
        printedKeywordsOf(def.effectText).includes(token) ||
        permanent.stack.some(
          (card) =>
            card.faceUp === true && printedKeywordsOf(ctx.game.definitionOf(card).inheritedEffectText).includes(token),
        )
      );
    };
    if (!filter.keywords.every(hasKeyword)) return false;
    const { keywords: _omit, ...rest } = filter;
    return definitionMatches(rest, def);
  }
  if (filter.excludeKeywords && filter.excludeKeywords.length > 0) {
    const granted = new Set((ctx.fx.grantedKeywords?.(permanent.permanentId) ?? []).map((g) => g.keyword));
    const hasKeyword = (kw: string | { keyword?: string }): boolean => {
      const token = typeof kw === "string" ? kw : (kw.keyword ?? "");
      const liveKeyword = ctx.game.hasKeyword?.(permanent.permanentId, token);
      return (
        liveKeyword === true ||
        granted.has(token) ||
        printedKeywordsOf(def.effectText).includes(token) ||
        permanent.stack.some(
          (card) =>
            card.faceUp === true && printedKeywordsOf(ctx.game.definitionOf(card).inheritedEffectText).includes(token),
        )
      );
    };
    if (filter.excludeKeywords.some(hasKeyword)) return false;
    const { excludeKeywords: _omit, ...rest } = filter;
    return definitionMatches(rest, def);
  }

  return definitionMatches(filter, def);
}

/**
 * True when `permanent` is immune to effects from `source` (Comprehensive Rules
 * §15-15-5: "isn't affected by effects" grants — BT19-089's Option-sourced immunity,
 * BT16-063's Digimon-sourced immunity, and CAP-C-06's blanket opponent immunity). A
 * controller's own effects are blocked only by immunities not scoped to the opponent's
 * effects (LM-020's declared category, Q2657).
 */
export function isPermanentUnaffectable(
  ctx: EffectContext,
  source: CardSource,
  permanent: Permanent,
  relevantSourceKinds: readonly string[],
): boolean {
  if (source.ownerSeat === permanent.controllerSeat) {
    return ctx.fx.isUnaffectedByOwnEffects?.(permanent.permanentId, relevantSourceKinds) === true;
  }
  if (relevantSourceKinds.some((k) => ctx.fx.isBeAffectedBySourceKind!(permanent.permanentId, k))) return true;
  return ctx.fx.isUnaffectableByOpponentEffects?.(permanent.permanentId) === true;
}
