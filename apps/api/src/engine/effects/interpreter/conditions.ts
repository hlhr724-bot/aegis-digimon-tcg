// Evaluating an IR Condition against live game state.

import { attackedWithDigimonThisTurn } from "../../turnActivity.js";
import type { EffectContext } from "../EffectContext.js";
import { COLOR_MAP, KIND_MAP } from "./maps.js";
import { definitionMatches, matchNameOrTrait } from "./matching/definition.js";
import {
  compareNumber,
  permanentMatchesFilter,
  selfStackMatchesTrait,
  selfTopMatchesText,
  selfTopMatchesTrait,
  sourceStackHasSameLevelCards,
  sourceTopDefinition,
  seatsForController,
} from "./matching/permanent.js";
import {
  triggerAddedSecurityMatches,
  triggerSubjectMatchesColor,
  triggerSubjectMatchesFilter,
} from "./matching/trigger.js";
import { countMatching } from "./scaling.js";
import { findLooseCandidateByInstance } from "./targeting/loose.js";
import { candidatePermanents } from "./targeting/permanents.js";
import {
  CardColor,
  CardKind,
  getCardDefinition,
  effectiveStaticNames,
  isDigimon,
  nameIncludesToken,
  requireCardDefinition,
} from "@aegis/shared";
import type { Condition, Filter, Seat } from "@aegis/shared";
import type { TriggerInfo } from "../EffectContext.js";

/**
 * A checked card has already left security in the real check flow (CR 13-1-6;
 * EX1-027 Q3211). Direct SecuritySkill probes can still stage their source in security;
 * exclude that source so their count predicates observe the same rules state.
 */
function securityCardsForCondition(ctx: EffectContext, seat: Seat) {
  const security = ctx.game.player(seat).security;
  const isSecuritySkill = ctx.activeTiming === "Security" || ctx.activeTiming === "SecuritySkill";
  return isSecuritySkill ? security.filter((card) => card.instanceId !== ctx.source.instanceId) : security;
}

function securityCountForCondition(ctx: EffectContext, seat: Seat): number {
  return securityCardsForCondition(ctx, seat).length;
}

/**
 * "You have N memory" reads the effect owner's side of the gauge on either player's turn
 * (EX8-068 Q3956); only an explicit `controller: "opponent"` reads the other side.
 */
function memoryForCondition(ctx: EffectContext, cond: Condition): number {
  const owner = ctx.source.ownerSeat;
  const seat = cond.controller === "opponent" ? ctx.game.opponentOf(owner) : owner;
  return seat === ctx.game.state.turnSeat ? ctx.game.state.memory : -ctx.game.state.memory;
}

function placedOptionByInstance(ctx: EffectContext, instanceId: string) {
  for (const player of ctx.game.state.players) {
    const placed = player.battleArea.find((permanent) => permanent.topCard?.instanceId === instanceId);
    if (placed !== undefined) return placed.topCard;
  }
  return undefined;
}

/** Evaluate a parsed Condition. An unrecognized ("raw") condition is treated as
 *  unmet so the interpreter never guesses a gate it could not parse. */
export function evaluateCondition(ctx: EffectContext, cond: Condition): boolean {
  const mine = ctx.source.ownerSeat;
  // Some focused IR probes evaluate local trigger predicates with a minimal game double that
  // omits opponentOf; defer to the local seat for predicates that do not read opponent state.
  const opp = ctx.game.opponentOf?.(mine) ?? mine;
  switch (cond.kind) {
    case "true":
      return true;
    case "selfBattlesOpponentMatching": {
      const source = ctx.source.permanent();
      const opponent = source === undefined ? undefined : ctx.game.battleOpponentOf?.(source.permanentId);
      return (
        opponent !== undefined &&
        cond.filter !== undefined &&
        permanentMatchesFilter(ctx, opponent, cond.filter, ctx.source)
      );
    }
    case "attackTargetsPlayer":
      return (
        ctx.trigger.attackerPermanentId !== undefined &&
        ctx.trigger.targetPermanentId === undefined &&
        ctx.trigger.defenderPermanentId === undefined
      );
    case "attackTargetMatchesFilter": {
      // System-A timing effects historically use targetPermanentId, while the combat
      // SubTrigger bus publishes the same declared target as defenderPermanentId.
      // Both are captured before Blocker redirection, so either shape describes the
      // originally attacked permanent rather than a later effective blocker.
      const targetId = ctx.trigger.targetPermanentId ?? ctx.trigger.defenderPermanentId;
      if (targetId === undefined || cond.filter === undefined) return false;
      // The declared defender's stack size and DP are read from the declaration snapshot, not
      // from the live board: an effect resolving in the SAME [When Attacking] window (BT16-016's
      // inherited digivolution-card trash) must not retroactively satisfy "attacks a Digimon with
      // no digivolution cards" (KB Q2816). Every other predicate stays on the live candidate scan,
      // which is where controller scope, superlatives and stack-content reads live.
      const snapshot =
        ctx.trigger.defenderAtDeclaration?.permanentId === targetId ? ctx.trigger.defenderAtDeclaration : undefined;
      if (ctx.game.permanentById(targetId) === undefined) {
        return snapshot !== undefined && departedDefenderMatches(ctx, snapshot, cond.filter);
      }
      if (snapshot !== undefined && !declarationTimeDefenderFactsMatch(snapshot, cond.filter)) return false;
      const liveFilter = snapshot === undefined ? cond.filter : withoutDeclarationTimeFacts(cond.filter);
      const candidates = candidatePermanents(ctx, { filter: liveFilter, count: "all" });
      return candidates.some((permanent) => permanent.permanentId === targetId);
    }
    case "lastTargetDpAtLeast": {
      const ids = ctx.lastResolvedPermanentIds ?? [];
      return (
        ids.length > 0 &&
        ids.every((id) => (ctx.game.permanentById(id)?.currentDP ?? -Infinity) >= (cond.value ?? Infinity))
      );
    }
    case "lastTargetDpAtMostSelf": {
      const source = ctx.source.permanent();
      const ids = ctx.lastResolvedPermanentIds ?? [];
      return (
        source !== undefined &&
        ids.length > 0 &&
        ids.every((id) => (ctx.game.permanentById(id)?.currentDP ?? Infinity) <= source.currentDP)
      );
    }
    case "lastTargetDpGreaterThanSelf": {
      const source = ctx.source.permanent();
      const ids =
        (ctx.lastResolvedPermanentIds?.length ?? 0) > 0
          ? ctx.lastResolvedPermanentIds!
          : [ctx.trigger.targetPermanentId ?? ctx.trigger.defenderPermanentId].filter(
              (id): id is string => id !== undefined,
            );
      return (
        source !== undefined &&
        ids.length > 0 &&
        ids.every((id) => (ctx.game.permanentById(id)?.currentDP ?? -Infinity) > source.currentDP)
      );
    }
    case "lastTargetCanTrashDigivolution": {
      const ids = ctx.lastResolvedPermanentIds ?? [];
      return (
        ids.length > 0 &&
        ids.every((id) => {
          const permanent = ctx.game.permanentById(id);
          if (permanent === undefined || permanent.stack.length <= 1) return false;
          const level = permanent.topCard === undefined ? undefined : ctx.game.definitionOf(permanent.topCard).level;
          return level !== 3;
        })
      );
    }
    case "lastTargetPlayCostAtMost": {
      const ids = ctx.lastResolvedPermanentIds ?? [];
      const maximum = cond.value ?? Infinity;
      return (
        ids.length > 0 &&
        ids.every((id) => {
          const permanent = ctx.game.permanentById(id);
          if (permanent?.topCard === undefined) return false;
          return ctx.game.definitionOf(permanent.topCard).playCost <= maximum;
        })
      );
    }
    case "triggerRevealedFromDeck":
      return (ctx.lastRevealedCards ?? []).some((card) => card.cardId === ctx.source.cardId);
    case "triggerRevealedMatchesFilter":
      return (
        cond.filter !== undefined &&
        (ctx.lastRevealedCards ?? []).some((card) =>
          definitionMatches(cond.filter!, ctx.game.definitionOf(card as never)),
        )
      );
    case "triggerAllRevealedMatchFilter":
      return (
        cond.filter !== undefined &&
        (ctx.lastRevealedCards ?? []).length > 0 &&
        (ctx.lastRevealedCards ?? []).every((card) =>
          definitionMatches(cond.filter!, ctx.game.definitionOf(card as never)),
        )
      );
    case "lastTrashedMatchesFilter":
      return (
        cond.filter !== undefined &&
        (ctx.lastTrashedCards ?? []).some((card) =>
          definitionMatches(cond.filter!, ctx.game.definitionOf({ cardId: card.cardId } as never)),
        )
      );
    case "triggerAttackBy":
      return ctx.trigger.attackMechanic === cond.keyword;
    case "allYoursMatchFilter": {
      // Preserve the legacy no-filter predicate exactly: an omitted filter is a
      // structural/vacuous gate and remains true even with an empty battle area.
      if (cond.filter === undefined) return true;
      const filter = { ...cond.filter, controller: "mine" as const };
      // "All of your Digimon and Tamers" quantifies only those card kinds and is not
      // vacuously true when the battle area has none (KB BT19-100 Q3176-Q3178). This
      // also leaves unrelated battle-area Options outside the quantified domain.
      const quantified = ctx.game.player(mine).battleArea.filter((permanent) => {
        if (filter.kind === undefined || filter.kind.length === 0) return true;
        if (permanent.topCard === undefined) return false;
        const definition = ctx.game.definitionOf(permanent.topCard);
        const effectiveKinds = ctx.game.effectiveKinds?.(permanent.permanentId, definition.kinds) ?? definition.kinds;
        return filter.kind.some((kind) => {
          const mapped = KIND_MAP[kind];
          return mapped !== undefined && effectiveKinds.includes(mapped);
        });
      });
      return (
        quantified.length > 0 &&
        quantified.every((permanent) => permanentMatchesFilter(ctx, permanent, filter, ctx.source))
      );
    }
    case "breedingAreaEmpty":
      return ctx.game.player(mine).breeding === undefined;
    case "digivolutionCountCompare": {
      const ids = ctx.lastResolvedPermanentIds ?? [];
      const target = ids.length === 1 ? ctx.game.permanentById(ids[0]!) : undefined;
      const source = ctx.source.permanent();
      if (target === undefined || source === undefined) return false;
      const targetCount = target.stack.length - 1;
      const sourceCount = source.stack.length - 1;
      return compareNumber(targetCount, cond.op, sourceCount);
    }
    case "digivolutionCardCount": {
      // EX11-046: count matching cards in this Digimon's digivolution stack. The
      // permanent stack stores only digivolution cards, so the count is not
      // polluted by the live top card.
      const source = ctx.source.permanent();
      if (source === undefined || cond.nameOrTrait === undefined) return false;
      const count = source.stack.filter((card) =>
        definitionMatches({ nameOrTrait: cond.nameOrTrait }, ctx.game.definitionOf(card)),
      ).length;
      return compareNumber(count, cond.op, cond.value ?? 0);
    }
    case "triggerPlayCostAtMostStackCount": {
      const source = ctx.source.permanent();
      const playCost = ctx.trigger.playedPlayCost;
      return source !== undefined && playCost !== undefined && playCost <= source.stack.length - 1;
    }
    case "selfHasKeyword": {
      const permanent = ctx.source.permanent();
      return permanent !== undefined && cond.keyword !== undefined
        ? (ctx.game.hasKeyword?.(permanent.permanentId, cond.keyword) ?? false)
        : false;
    }
    case "selfHasOnPlayEffect": {
      const topCard = ctx.source.permanent()?.topCard;
      if (topCard === undefined) return false;
      return /\[On Play\]/i.test(ctx.game.definitionOf(topCard).effectText ?? "");
    }
    case "youDigivolvedThisTurn":
      return ctx.game.digivolvedThisTurn?.(mine) ?? false;
    case "opponentDidNotAttackWithDigimonThisTurn":
      return !attackedWithDigimonThisTurn(ctx.game.state, opp);
    // The condition kind sets the DEFAULT side, but an explicit `controller` in the IR
    // filter wins: the runtime record emits e.g. `youHave {controller:"opponent"}` for a
    // CanSelectPermanentCondition ("there is an opponent permanent to target"), and that
    // explicit side must not be clobbered back to the kind's default.
    case "youHave": {
      if (cond.filter === undefined) return false;
      const { countMax, ...matchingFilter } = cond.filter;
      const count = countMatching(ctx, { controller: "mine", ...matchingFilter });
      if (countMax !== undefined) return count <= countMax;
      return count >= (cond.countMin ?? cond.count ?? 1);
    }
    case "anyHas": {
      // "There is a ..." / "any player has ..." gates quantify both players unless
      // the filter carries an explicit controller. This is distinct from youHave,
      // which is intentionally scoped to the source controller.
      if (cond.filter === undefined) return false;
      const count = countMatching(ctx, { controller: "any", ...cond.filter });
      return count >= (cond.countMin ?? cond.count ?? 1);
    }
    case "youHaveGreenLevelAtLeastInBattle":
      return ctx.game.player(mine).battleArea.some((permanent) => {
        const top = permanent.topCard;
        if (top === undefined) return false;
        const definition = ctx.game.definitionOf(top);
        return (
          isDigimon(definition) &&
          definition.colors.includes(CardColor.Green) &&
          (definition.level ?? 0) >= (cond.value ?? 5)
        );
      });
    case "breedingActionAvailable": {
      const player = ctx.game.player(mine);
      if (player.breeding === undefined) return player.eggDeck.length > 0;
      const top = player.breeding.topCard;
      if (top === undefined) return false;
      const definition = ctx.game.definitionOf(top);
      return isDigimon(definition) && (definition.level ?? 0) >= 3;
    }
    case "opponentHas": {
      const threshold = cond.countMin ?? cond.count ?? 1;
      const count = cond.filter ? countMatching(ctx, { controller: "opponent", ...cond.filter }) : 0;
      return count >= threshold && (cond.countMax === undefined || count <= cond.countMax);
    }
    case "youHaveNone":
      return cond.filter ? countMatching(ctx, { controller: "mine", ...cond.filter }) === 0 : false;
    case "noFaceUpSecurity":
      return ctx.game.player(mine).security.every((card) => card.faceUp !== true);
    case "ifOpponentDeclined":
    case "opponentDeclinedTrash":
      return ctx.lastOpponentDeclined === true;
    case "opponentHasNone":
      return cond.filter ? countMatching(ctx, { controller: "opponent", ...cond.filter }) === 0 : false;
    case "memoryAtLeast":
      return memoryForCondition(ctx, cond) >= (cond.value ?? 0);
    case "memoryAtMost":
      return memoryForCondition(ctx, cond) <= (cond.value ?? 0);
    case "securityAtLeast":
      return securityCountForCondition(ctx, mine) >= (cond.value ?? 0);
    case "securityAtMost":
      return securityCountForCondition(ctx, mine) <= (cond.value ?? 0);
    case "faceUpSecurityAtMost":
      return securityCardsForCondition(ctx, mine).filter((card) => card.faceUp === true).length <= (cond.value ?? 0);
    case "securityAtMostSelfFaceDownDigivolutionCards": {
      // EX9-029 / KB Q4783: "you have as many or fewer security cards as this Digimon has
      // face-down digivolution cards". An off-field source has an empty stack (0), not "always
      const self = ctx.source.permanent();
      const faceDownCount = self?.stack.filter((c) => c.faceUp !== true).length ?? 0;
      return securityCountForCondition(ctx, mine) <= faceDownCount;
    }
    case "handAtMost": {
      const seat = cond.controller === "opponent" ? opp : mine;
      return ctx.game.player(seat).hand.length <= (cond.value ?? 0);
    }
    case "handAtLeast": {
      const seat = cond.controller === "opponent" ? opp : mine;
      return ctx.game.player(seat).hand.length >= (cond.value ?? 0);
    }
    case "zoneCount": {
      // Generic resource-count gate: "if you/your opponent have N or more/fewer cards
      // in your/their hand|trash|security|deck". Sizes the seat's zone and compares. The
      // digivolution-card branch also keeps the shared `zone` field total after
      // `playedFromZone` gained that source-zone value for BT7-018.
      const seat = cond.seat === "opponent" ? opp : mine;
      const player = ctx.game.player(seat);
      const zone = cond.zone ?? "hand";
      let size: number;
      switch (zone) {
        case "battleArea":
          size = player.battleArea.filter(
            (permanent) =>
              permanent.topCard !== undefined &&
              (cond.filter === undefined || definitionMatches(cond.filter, ctx.game.definitionOf(permanent.topCard))),
          ).length;
          break;
        case "security":
          size = securityCountForCondition(ctx, seat);
          break;
        case "digivolutionCards":
          size = Array.from(player.battleArea).reduce((total, permanent) => total + permanent.stack.length, 0);
          break;
        case "hand":
        case "trash":
        case "deck":
          size = player[zone].length;
          break;
        default:
          return false;
      }
      const value = cond.value ?? 0;
      switch (cond.op ?? "gte") {
        case "eq":
          return size === value;
        case "lt":
          return size < value;
        case "gt":
          return size > value;
        case "lte":
          return size <= value;
        case "gte":
          return size >= value;
        default:
          return false;
      }
    }
    case "combinedTrashCount": {
      const size = ctx.game.player(mine).trash.length + ctx.game.player(opp).trash.length;
      const value = cond.value ?? 0;
      if (cond.op === "eq") return size === value;
      if (cond.op === "lt") return size < value;
      if (cond.op === "gt") return size > value;
      return cond.op === "lte" ? size <= value : size >= value;
    }
    case "zoneColorCount": {
      // "Your Tamers have N or more total colors" counts each distinct printed color once,
      // even when multiple Tamers share it (KB Q4456). The condition's zone is intentionally
      // fixed to battle-area permanents: colors are a property of cards in play, not loose zones.
      const seat = cond.seat === "opponent" ? opp : mine;
      const colors = new Set<CardColor>();
      for (const permanent of ctx.game.player(seat).battleArea) {
        if (permanent.topCard === undefined) continue;
        const definition = ctx.game.definitionOf(permanent.topCard);
        if (cond.cardType !== undefined && !definition.kinds.includes(cond.cardType as never)) continue;
        if (cond.filter !== undefined && !permanentMatchesFilter(ctx, permanent, cond.filter, ctx.source)) continue;
        for (const color of definition.colors) colors.add(color);
      }
      const value = cond.value ?? 0;
      switch (cond.op) {
        case "lte":
          return colors.size <= value;
        case "lt":
          return colors.size < value;
        case "gt":
          return colors.size > value;
        default:
          return colors.size >= value;
      }
    }
    case "securityCompare": {
      // "If you have fewer/more security cards than your opponent" (P-127/P-129) —
      // cross-player relative comparison of YOUR security-stack size vs the OPPONENT's
      //.
      const mineCount = ctx.game.player(mine).security.length;
      const oppCount = ctx.game.player(opp).security.length;
      return cond.op === "gt" ? mineCount > oppCount : mineCount < oppCount;
    }
    case "handCompare": {
      const mineCount = ctx.game.player(mine).hand.length;
      const oppCount = ctx.game.player(opp).hand.length;
      return compareNumber(mineCount, cond.op, oppCount);
    }
    case "totalSecurityCount": {
      // "There are N or fewer total cards in both players' security stacks" (BT13/EX5
      // inherited Vaccine line). Sums both stacks, then applies the encoded comparison.
      const total = ctx.game.player(mine).security.length + ctx.game.player(opp).security.length;
      return compareNumber(total, cond.op, cond.value ?? 0);
    }
    case "totalDigimonCount":
    case "totalDigimonGte": {
      // "There are N or more Digimon in play" counts BOTH players' battle areas (BT9-110
      // Q1924). Tamers and Options are excluded even though they share the same permanent zone.
      // When a filter is present, it further restricts the counted Digimon (for example,
      // "there are 2 or more suspended Digimon").
      let total = 0;
      for (const seat of [mine, opp]) {
        total += ctx.game.player(seat).battleArea.filter((permanent) => {
          if (permanent.topCard === undefined) return false;
          if (!permanentMatchesFilter(ctx, permanent, { kind: ["Digimon"] }, ctx.source)) return false;
          return cond.filter === undefined || permanentMatchesFilter(ctx, permanent, cond.filter, ctx.source);
        }).length;
      }
      return compareNumber(total, cond.kind === "totalDigimonGte" ? "gte" : cond.op, cond.value ?? cond.count ?? 3);
    }
    case "totalDigimonLevelsGte": {
      let totalLevels = 0;
      for (const seat of [mine, opp]) {
        for (const permanent of ctx.game.player(seat).battleArea) {
          if (permanent.inBreeding || permanent.topCard === undefined) continue;
          const definition = ctx.game.definitionOf(permanent.topCard);
          if (!(definition.kinds as string[]).includes(CardKind.Digimon)) continue;
          totalLevels += definition.level ?? 0;
        }
      }
      return totalLevels >= (cond.value ?? cond.count ?? 0);
    }
    case "permanentCount": {
      // "If you/your opponent have N or more/fewer permanents matching [filter]" (BT21-010).
      // Counts the seat's battle-area permanents matching the filter; with `distinctNames`,
      // collapses same-named permanents to one ("3+ [Hero] Tamers with different names").
      const seat = cond.seat === "opponent" ? opp : mine;
      const filter = { ...(cond.filter ?? {}), controller: cond.seat === "opponent" ? "opponent" : "mine" } as Filter;
      let count: number;
      if (cond.filter?.distinctNames === true) {
        const names = new Set<string>();
        for (const permanent of ctx.game.player(seat).battleArea) {
          if (!permanentMatchesFilter(ctx, permanent, filter, ctx.source)) continue;
          if (permanent.topCard === undefined) continue;
          names.add((ctx.game.definitionOf(permanent.topCard).nameEn ?? "").toLowerCase());
        }
        count = names.size;
      } else {
        count = countMatching(ctx, filter);
      }
      const value = cond.value ?? 0;
      return cond.op === "lte" || cond.op === "lt" ? count <= value : count >= value;
    }
    case "boardCountCompare": {
      // Cross-player board comparison: "your opponent has as many or more/fewer total
      // Digimon and Tamers as you". Counts battle-area permanents matching the same filter
      // on both sides, then compares opponent vs mine by default.
      const filter = cond.filter ?? { kind: ["Digimon", "Tamer"] };
      const leftSeat = cond.left === "mine" ? "mine" : "opponent";
      const rightSeat = cond.right === "opponent" ? "opponent" : "mine";
      const left = countMatching(ctx, { ...filter, controller: leftSeat } as Filter);
      const right = countMatching(ctx, { ...filter, controller: rightSeat } as Filter);
      switch (cond.op) {
        case "lt":
          return left < right;
        case "lte":
          return left <= right;
        case "eq":
          return left === right;
        case "gt":
          return left > right;
        default:
          return left >= right;
      }
    }
    case "selfHasMinTrash": {
      // "While you have N or more cards in your trash" (BT2-111). Counts the controller's (or
      // `filter.controllerDefault`'s) trash, honoring a card-definition `filter` if present.
      const seat = cond.filter?.controllerDefault === "opponent" ? opp : mine;
      const trash = ctx.game.player(seat).trash;
      const matching = cond.filter
        ? Array.from(trash).filter((c) => definitionMatches(cond.filter!, ctx.game.definitionOf(c))).length
        : trash.length;
      return matching >= (cond.count ?? 0);
    }
    case "selfHasTrait": {
      // "This Digimon with the [X] trait" (EX12-004). Matches the SOURCE permanent's LIVE top
      // card's trait union (Form ∪ Attribute ∪ Type) against `filter.nameOrTrait`. Only the top
      // card is checked (the permanent's current identity); stack cards below are not included
      // (use `selfDigivolutionStackHasTrait` for that). An off-field source or absent filter
      // returns false (conservative — we never invent a gate).
      const self = ctx.source.permanent();
      if (self !== undefined) return selfTopMatchesTrait(ctx, cond.filter);
      const deleted = sourceTopDefinition(ctx);
      if (deleted === undefined || cond.filter?.nameOrTrait === undefined) return false;
      return cond.filter.nameOrTrait.some((ref) => matchNameOrTrait(deleted, ref));
    }
    case "selfIsInBattleArea": {
      const self = ctx.source.permanent();
      return (
        self !== undefined &&
        !(ctx.trigger.deletedPermanentIds ?? []).includes(self.permanentId) &&
        ctx.game.permanentById(self.permanentId) !== undefined
      );
    }
    case "selfHasName": {
      // "This Digimon is [X]" — exact effective name check, including dynamic aliases from
      // lower-level cards in the current digivolution stack (BT17-102).
      const def = sourceTopDefinition(ctx);
      if (def === undefined) return false;
      const self = ctx.source.permanent();
      const names =
        self?.topCard === undefined ? [def.nameEn ?? ""] : (ctx.game.effectiveNames?.(self) ?? [def.nameEn ?? ""]);
      return (cond.names ?? []).some((name) => names.some((actual) => actual.toLowerCase() === name.toLowerCase()));
    }
    case "selfColorCount": {
      // "This Digimon has N or more colors" — use the deleted HOST's effective-color
      // snapshot for inherited On Deletion effects; otherwise read the live/current top.
      const deletedColors = ctx.trigger.deletedEffectiveColorsByInstanceId?.[ctx.source.instanceId];
      if (deletedColors !== undefined) {
        return compareNumber(new Set(deletedColors).size, cond.op, cond.value ?? 0);
      }
      const self = ctx.source.permanent();
      if (self !== undefined && ctx.game.effectiveColors !== undefined) {
        return compareNumber(new Set(ctx.game.effectiveColors(self)).size, cond.op, cond.value ?? 0);
      }
      const def = sourceTopDefinition(ctx);
      if (def === undefined) return false;
      const permanent = ctx.source.permanent();
      const colors =
        permanent === undefined ? (def.colors ?? []) : (ctx.game.effectiveColors?.(permanent) ?? def.colors ?? []);
      return compareNumber(new Set(colors).size, cond.op, cond.value ?? 0);
    }
    case "selfLevelIs": {
      // "This Digimon is level N" — exact current top-card level.
      const def = sourceTopDefinition(ctx);
      return typeof def?.level === "number" && def.level === (cond.value ?? -1);
    }
    case "selfLevelAtLeast": {
      // "This Digimon is level N or higher" — lower-bound current top-card level.
      const def = sourceTopDefinition(ctx);
      return typeof def?.level === "number" && def.level >= (cond.value ?? Number.POSITIVE_INFINITY);
    }
    case "stackHasSameLevelCards":
      return sourceStackHasSameLevelCards(ctx, cond.count ?? cond.countMin ?? 2);
    case "selfHasNoDigivolutionCards": {
      // "If this Digimon has no digivolution cards" (BT19-101) — true only when the SOURCE
      // permanent is on the field with an empty stack (played directly, not digivolved into).
      const self = ctx.source.permanent();
      return self !== undefined && self.stack.length === 0;
    }
    case "selfHadDigivolutionCards":
      // "if this card had digivolution cards" asked from an OnDeletion window: the permanent is
      // already off the field, so a live stack read (selfHasNoDigivolutionCards) cannot answer it.
      // The deletion payload carries what the stack held (BT2-083).
      return (ctx.trigger.deletedWasStackInstanceIds?.length ?? 0) > 0;
    case "ifThisEffectDidNotSuspend":
      return (ctx.lastSuspendedPermanentIds?.length ?? 0) === 0;
    case "selfHasInDigivolutionCards": {
      // "[X] is in this Digimon's digivolution cards" (BT19-073 AllTurns gate). True when the
      // SOURCE permanent has at least one digivolution stack card whose name or trait matches
      // any of `cond.nameOrTrait`. Mirrors `selfDigivolutionStackHasTrait` but driven by the
      // condition's own `nameOrTrait` field rather than `filter.nameOrTrait`. Off-field source
      // or absent refs => false (conservative).
      const refs = cond.nameOrTrait;
      if (!refs || refs.length === 0) return false;
      const selfPerm = ctx.source.permanent();
      if (selfPerm === undefined) return false;
      return selfPerm.stack.some((card) => {
        const stackDef = ctx.game.definitionOf(card);
        return refs.some((ref) => matchNameOrTrait(stackDef, ref));
      });
    }
    case "bindingEmpty": {
      // True when the named binding in `cond.ref` holds zero cards — i.e. the prior
      // SecurityManipulation (or similar) action trashed/moved nothing. An absent or
      // never-written binding is treated as empty (conservative: the gate passes only when the
      // action provably did something). BT18-101 EndOfAllTurns: delete Digimon + Tamer only
      // when trashing opponent's top security moved 0 cards (opponent had no security).
      if (!cond.ref) return true; // no ref means always-empty (degenerate case)
      const binding = ctx.boundPlayed?.get(cond.ref);
      return binding === undefined || binding.size === 0;
    }
    case "lastEffectDidNotAct":
      return ctx.lastEffectActed !== true;
    case "bindingExists": {
      // True when a previous action in this same resolution wrote at least one card/permanent
      // into the named binding. Used for "if this effect digivolved/played/moved a card, then..."
      // branches where a specific produced object gates a downstream action.
      if (!cond.ref) return false;
      const binding = ctx.boundPlayed?.get(cond.ref);
      return binding !== undefined && binding.size > 0;
    }
    case "bindingContains": {
      // True when the named binding contains at least one card whose definition matches
      // `cond.filter`. This is used after a movement action binds the exact instance ids it moved
      // (e.g. "if this effect returned a white level 7 card"). We search current zones because the
      // card has already moved by the time the downstream condition runs.
      if (!cond.ref || !cond.filter) return false;
      // Loose-card costs bind their paid instance in `selections` (the same binding
      // namespace used by relative filters), while movement actions bind permanent/card
      // ids in `boundPlayed`. Accept both so a following branch can inspect the exact
      // card paid by a cost even after a later Delete replaces `lastTrashedCards`.
      const binding = ctx.boundPlayed?.get(cond.ref);
      const selected = ctx.selections?.get(cond.ref);
      const instanceIds =
        binding !== undefined && binding.size > 0 ? binding : selected === undefined ? undefined : new Set([selected]);
      if (instanceIds === undefined || instanceIds.size === 0) return false;
      for (const instanceId of instanceIds) {
        const card = findLooseCandidateByInstance(ctx, instanceId);
        if (card === undefined) continue;
        const def = ctx.game.definitionOf({ cardId: card.cardId } as never);
        if (definitionMatches(cond.filter, def)) return true;
      }
      return false;
    }
    case "isYourTurn":
      return ctx.game.state.turnSeat === mine;
    case "isOpponentsTurn":
      return ctx.game.state.turnSeat === opp;
    case "phaseIs":
      return cond.phase !== undefined && ctx.game.state.phase === cond.phase;
    case "duringAttack":
      return ctx.trigger.attackerPermanentId !== undefined || ctx.fx.isAttackResolving?.() === true;
    case "wouldBeUsedAsOption":
      return ctx.trigger.wouldBePlayedAsOption === true;
    case "selfDigivolutionStackHasTrait":
      // "While a card with [X] in its traits is in THIS Digimon's digivolution cards" (BT7-024).
      // Reads the SOURCE permanent's stack and matches each card against the trait token(s) in
      // `filter.nameOrTrait`, using the same Form ∪ Attribute ∪ Type union as every other trait
      // match. An unset filter never matches (we do not guess).
      return selfStackMatchesTrait(ctx, cond.filter);
    case "selfLacksInDigivolutionCards":
      // P-144: a Gotsumon-named card in the SOURCE Digimon's digivolution stack
      // is the exception to its Your Turn attack restriction. An absent source stack
      // therefore satisfies the "lacks" predicate.
      return !selfStackMatchesTrait(ctx, cond.filter);
    case "selfDigivolutionStackDistinctNameCount": {
      const self = ctx.source.permanent();
      if (self === undefined) return false;
      const names = new Set(self.stack.map((card) => ctx.game.definitionOf(card).nameEn.toLowerCase()));
      return compareNumber(names.size, cond.op, cond.value ?? 0);
    }
    case "selfDigivolutionStackMatchesFilter": {
      const self = ctx.source.permanent();
      return (
        self !== undefined &&
        cond.filter !== undefined &&
        self.stack.some((card) => definitionMatches(cond.filter!, ctx.game.definitionOf(card)))
      );
    }
    case "selfDigivolutionStackHasColor": {
      const self = ctx.source.permanent();
      const colors = cond.filter?.colors ?? [];
      return (
        self !== undefined &&
        self.stack.some((card) => {
          const definition = ctx.game.definitionOf(card);
          return colors.some((color) => definition.colors.includes(COLOR_MAP[color]));
        })
      );
    }
    case "selfDigivolutionStackHasNonColor": {
      const self = ctx.source.permanent();
      const colors = cond.filter?.colors ?? [];
      return (
        self !== undefined &&
        colors.length > 0 &&
        self.stack.some((card) => {
          const definition = ctx.game.definitionOf(card);
          return colors.every((color) => !definition.colors.includes(COLOR_MAP[color]));
        })
      );
    }
    case "selfDigivolutionStackDistinctColorCount": {
      const self = ctx.source.permanent();
      if (self === undefined) return false;
      const matchingCards = self.stack.filter(
        (card) =>
          card.faceUp === true &&
          (cond.filter === undefined || definitionMatches(cond.filter, ctx.game.definitionOf(card))),
      );
      const distinctColors = new Set(matchingCards.flatMap((card) => ctx.game.definitionOf(card).colors));
      return compareNumber(distinctColors.size, cond.op, cond.value ?? 0);
    }
    case "selfTopHasText":
      // "While THIS permanent's top card has [X] in its text" (EX11-070's inherited [All Turns]
      // name/traits/effect text (KB Q5942), so an "any"/"text"-match ref is used. An off-field
      // source or absent filter never matches (we do not guess a gate).
      return selfTopMatchesText(ctx, cond.filter);
    case "selfIsSuspended": {
      // "While/if this Digimon is suspended" (EX3-042, EX8-043) — reads the SOURCE
      // permanent's suspended flag. An off-field source never matches.
      return ctx.source.permanent()?.isSuspended === true;
    }
    case "selfUnsuspended": {
      // "While this is unsuspended" (P-199) — true only when the SOURCE permanent is on the
      // field and NOT suspended. An off-field source never matches.
      const sp = ctx.source.permanent();
      return sp !== undefined && sp.isSuspended !== true;
    }
    case "selfCanDeclareAttack": {
      const self = ctx.source.permanent();
      return self !== undefined && (ctx.game.canDeclareAttack?.(self) ?? true);
    }
    case "selfDpAtLeast": {
      const self = ctx.source.permanent();
      return (ctx.game.effectiveDP?.(self?.permanentId ?? "") ?? self?.currentDP ?? -1) >= (cond.value ?? 0);
    }
    case "selfDigivolutionCountAtLeast": {
      // "If this Digimon has N or more digivolution cards" — the SOURCE permanent's stack size
      // (BT22-007 "10 or more digivolution cards", KB Q4858). An off-field source => 0 => false.
      const self = ctx.source.permanent();
      return (self?.stack.length ?? 0) >= (cond.value ?? 0);
    }
    case "selfLinkCountAtLeast": {
      const self = ctx.source.permanent();
      return (self?.linked.length ?? 0) >= (cond.value ?? 0);
    }
    case "selfLinkedMatchesFilter": {
      // "This Digimon linked with [X]" (EX11-006): count the SOURCE host's link cards whose
      // definition matches the filter. An off-field source or a missing filter is never linked.
      const self = ctx.source.permanent();
      if (self === undefined || cond.filter === undefined) return false;
      const filter = cond.filter;
      const matches = self.linked.filter((card) =>
        definitionMatches(filter, ctx.game.definitionOf(card as never)),
      ).length;
      return matches >= (cond.count ?? 1);
    }
    case "selfDigivolutionCountExactly": {
      const self = ctx.source.permanent();
      return (self?.stack.length ?? 0) === (cond.value ?? 0);
    }
    case "selfDigivolutionStackCountAtLeast": {
      // "If N or more cards matching [filter] are in THIS Digimon's digivolution cards" (BT11-065
      // "4+ [Vemmon]"). Counts SOURCE-permanent stack cards whose definition matches a
      // full definition filter (name/trait, kind, color, level, etc.). An off-field source or
      // absent filter => 0 => false.
      const self = ctx.source.permanent();
      const filter = cond.filter;
      if (self === undefined || filter === undefined) return false;
      const count = self.stack.filter((card) => {
        const def = ctx.game.definitionOf(card);
        return definitionMatches(filter, def);
      }).length;
      return count >= (cond.count ?? 1);
    }
    case "selfDigivolutionStackHasSameLevelPair": {
      const self = ctx.source.permanent();
      if (self === undefined) return false;
      // "This Digimon's stack" means every stacked card, including the current
      // top card (BT22-031 Q4879).  Looking only under the top incorrectly misses
      // the explicit ruling example of a level 5 Digimon over a level 5 card.
      const stackedCards = self.topCard === undefined ? self.stack : [...self.stack, self.topCard];
      const levels = stackedCards
        .map((card) => ctx.game.definitionOf(card).level)
        .filter((level): level is number => level !== undefined && level > 0);
      return new Set(levels).size < levels.length;
    }
    case "notEnteredThisTurn": {
      // ＜Delay＞ option gate: the SOURCE permanent must be on
      // the field AND have entered on a turn OTHER than the current one. An off-field source
      // never qualifies (the option must still be a battle-area permanent to be trashed for cost).
      const self = ctx.source.permanent();
      return self !== undefined && self.enterFieldTurnCount !== ctx.game.state.turnCount;
    }
    case "sourceWasFaceUpSecurity":
      return ctx.trigger.securityWasFaceUp === true;
    case "allOf":
      // Logical AND: every conjunct must hold (P-116: three distinct named Digimon in
      // play). An empty/missing list never passes (we do not guess an unparsed gate).
      return (cond.conditions?.length ?? 0) > 0 && cond.conditions!.every((c) => evaluateCondition(ctx, c));
    case "anyOf":
      // Logical OR: at least one disjunct must hold ("[X] is in this Digimon's digivolution
      // cards OR you have a Digimon with [Y]"). Empty/missing list never passes.
      return (cond.conditions?.length ?? 0) > 0 && cond.conditions!.some((c) => evaluateCondition(ctx, c));
    case "not":
      // Logical negation for "otherwise/instead" branches. Require a child condition; a
      // malformed missing child must not become an unconditional true branch.
      if (cond.condition === undefined) return false;
      // "Deleted other than in battle" still presupposes a deletion: an [On Deletion] effect
      // activated without one (e.g. attached [End of Attack]) has no removal cause (Q2614).
      if (cond.condition.kind === "triggerRemovalCause" && ctx.trigger.removalCause === undefined) return false;
      return !evaluateCondition(ctx, cond.condition);
    case "orConditions":
      // Explicit OR combinator — identical semantics to "anyOf". Used when the runtime record
      // encodes a logical OR between heterogeneous sub-conditions (e.g. BT21-010's
      // "2 or fewer security cards OR 3+ [Hero] Tamers with different names").
      return (cond.conditions?.length ?? 0) > 0 && cond.conditions!.some((c) => evaluateCondition(ctx, c));
    // --- effect-result-binding gates: read the ctx outcome bound by a PRIOR action in this
    // resolution. An UNSET binding means the producing action never ran; treat that the same as
    // the negative outcome (no delete / no use / no digivolve) so the gate is conservative. ---
    case "ifThisEffectDidNotDelete":
      // True when the prior Delete removed 0 (an immune/prevented target counts as not deleted —
      // KB BT23-069 Q5338). Unset (no Delete ran) => 0 => true.
      return (ctx.lastDeleteCount ?? 0) === 0;
    case "ifThisEffectDidNotDeleteChosenTarget":
      return ctx.lastDeleteTargetSelected !== true;
    case "lastDeletedMatchesFilter": {
      const filter = cond.filter;
      if (filter === undefined) return false;
      const allowedSeats = seatsForController(ctx, filter);
      return (ctx.lastDeletedPermanentSnapshots ?? []).some(
        ({ controllerSeat, topCard }) =>
          allowedSeats.includes(controllerSeat) && definitionMatches(filter, ctx.game.definitionOf(topCard)),
      );
    }
    case "ifThisEffectUsed":
      // True when an Option-use happened this resolution (bool set by the 08-06 use verb).
      return ctx.lastOptionUsed === true;
    case "ifThisEffectDigivolved":
      // True when the prior digivolve happened (KB BT19-084 Q3146-Q3150).
      return ctx.lastDigivolveResult === true;
    case "ifThisEffectActed":
      // True when the prior place/trash branch actually moved >=1 card (BT16-094 "if you did
      // either"). Unset (no producing action ran) => false (conservative).
      return (
        ctx.lastEffectActed === true ||
        (ctx.lastDeleteCount ?? 0) > 0 ||
        (ctx.lastDeletedByThisEffectIds?.length ?? 0) > 0
      );
    case "ifThisEffectDidNotAct":
      // Complement of ifThisEffectActed: true when the prior action moved 0 cards — "your opponent
      // may trash 1 Option card; if they do not, you gain 2 memory" (EX4-070, KB Q3514). Unset
      // (no producing action ran) => true (nothing acted).
      return ctx.lastEffectActed !== true;
    case "namedCountAtLeast":
      // "if N or more cards were returned/trashed by this effect" — reads the tally a prior action
      // wrote via trackCount into ctx.namedCounts (BT7-015: 7+ cards returned). Unset => 0 => false.
      return (ctx.namedCounts?.get(cond.countSource ?? "") ?? 0) >= (cond.count ?? 1);
    case "triggerSecurityIsYours":
      // whenAddSecurity: the stack that grew is the watcher controller's own (documented behavior
      return ctx.trigger.addedToSecuritySeat === mine;
    case "triggerSecurityIsOpponents":
      return ctx.trigger.addedToSecuritySeat === opp;
    case "triggerAddedSecurityHasTrait":
      // whenAddSecurity: at least one card just added to security is FACE-UP and matches the
      // A face-down add (＜Recovery＞) never satisfies the gate.
      return triggerAddedSecurityMatches(ctx, cond.filter);
    case "triggerByYourEffect":
      // whenDigivolutionTrashed: the firing trash was driven by the watcher controller's own
      // effect (KB P-004 "when YOU trash a digivolution card"). An opponent-driven trash of the
      // same opponent Digimon must not fire this.
      return ctx.trigger.byEffectSeat === mine;
    case "triggerByYourDigimonEffect": {
      const byEffect = ctx.trigger.addedToHand?.byEffect;
      return byEffect?.ownerSeat === mine && byEffect.isDigimonEffect === true;
    }
    case "triggerEnteredByEffect":
      // OnPlay/WhenDigivolving: this card entered the battle area BY AN EFFECT (the entry was
      // gating BT25-084's "after, if played or digivolved by an effect". A manual entry and every
      // non-entry timing (e.g. When Attacking) leave it unset, so the gate fails.
      return ctx.trigger.enteredByEffect === mine;
    case "triggerPlayedOrDigivolvedByEffect":
      // Cross-permanent watchers receive effect-play events through `playedByEffect`,
      // while effect-digivolve events carry `enteredByEffect` (BT25-077).
      return ctx.trigger.playedByEffect === true || ctx.trigger.enteredByEffect !== undefined;
    case "selfEnteredByEffect":
      return ctx.source.permanent()?.enteredByEffect === true;
    case "triggerPlayedByEffectSource":
      return cond.sourceCardId !== undefined && ctx.trigger.playedByEffectSourceCardId === cond.sourceCardId;
    case "triggerPlayedByDecode":
      return ctx.trigger.playedByDecode === true;
    case "lastSuspendedIsMine": {
      const ids = ctx.lastSuspendedPermanentIds ?? [];
      return ids.some((id) => ctx.game.permanentById(id)?.controllerSeat === mine);
    }
    case "isDnaDigivolving":
      // WhenDigivolving: the digivolve that reached this window was a DNA digivolve (two materials
      // merged). The DNA-digivolve fire seam sets TriggerInfo.isDnaDigivolve; a single digivolve and
      // every non-digivolve timing leave it unset, so a DNA-only branch (BT20-045, P-221, EX9-021)
      // resolves only on the DNA path.
      return ctx.trigger.isDnaDigivolve === true;
    case "digivolvedFromZone":
      return ctx.trigger.digivolvedFromZone === cond.zone;
    case "playedFromZone":
      return ctx.trigger.playedFromZone === cond.zone;
    case "digiXrosCount":
      // OnPlay/WhenDigivolving: the DigiXros that triggered this window used at least `minimum`
      // material cards (BT19-063 "DigiXrosing with 2 cards"). The DigiXros fire seam carries the
      // material count in TriggerInfo.digiXrosMaterialCount; a non-DigiXros play leaves it unset,
      // so the gate fails (a plain play can never satisfy a DigiXros material-count check).
      return (ctx.trigger.digiXrosMaterialCount ?? 0) >= (cond.minimum ?? 1);
    case "triggerOptionCostAtLeast":
      // whenOptionUsed: use cost after card-level changes, before payment-only reductions
      // (BT10-032 Q1956/Q1957). Unset payload is conservative => does not fire.
      return (ctx.trigger.usedOptionCost ?? -1) >= (cond.value ?? 0);
    case "triggerOptionMatchesFilter": {
      const instanceId = ctx.trigger.subjectPermanentId;
      if (instanceId === undefined || cond.filter === undefined) return false;
      // The use event precedes Main; its Option is already in the no-area slot.
      const candidate =
        ctx.game.state.players.find((player) => player.resolvingOption?.instanceId === instanceId)?.resolvingOption ??
        findLooseCandidateByInstance(ctx, instanceId) ??
        placedOptionByInstance(ctx, instanceId);
      return (
        candidate !== undefined && definitionMatches(cond.filter, ctx.game.definitionOf({ cardId: candidate.cardId }))
      );
    }
    case "triggerSubjectHasColor":
      // whenPlayed/whenOneOfYoursDigivolves fire-time gate: the permanent that drove the event
      // (TriggerInfo.subjectPermanentId) has one of `filter.colors` on its top card. Read at
      // fire-time, POST-digivolve (the subject is the digivolved Digimon — KB BT25-026 Q6290/Q6291).
      // An unresolved subject or unset color filter never matches (we do not guess).
      return triggerSubjectMatchesColor(ctx, cond.filter);
    case "triggerSubjectMatchesFilter":
      return triggerSubjectMatchesFilter(ctx, cond.filter);
    case "triggerDigivolvedSameLevel": {
      const subject =
        ctx.trigger.subjectPermanentId !== undefined
          ? ctx.game.permanentById(ctx.trigger.subjectPermanentId)
          : undefined;
      const currentLevel = subject !== undefined ? ctx.game.definitionOf(subject.topCard).level : undefined;
      return currentLevel !== undefined && currentLevel === ctx.trigger.previousDigivolutionLevel;
    }
    case "triggerSubjectStackHasSameLevel": {
      const subject =
        ctx.trigger.subjectPermanentId === undefined
          ? undefined
          : ctx.game.permanentById(ctx.trigger.subjectPermanentId);
      const currentLevel = subject?.topCard === undefined ? undefined : ctx.game.definitionOf(subject.topCard).level;
      return (
        currentLevel !== undefined &&
        subject !== undefined &&
        subject.stack.some((card) => ctx.game.definitionOf(card).level === currentLevel)
      );
    }
    case "triggerDeletedLevelAtLeast": {
      const cardId = ctx.trigger.deletedTopCardId;
      const definition = cardId !== undefined ? getCardDefinition(cardId) : undefined;
      return definition !== undefined && (definition.level ?? -1) >= (cond.value ?? 0);
    }
    case "triggerDeletedMatchesFilter": {
      if (cond.filter === undefined) return false;
      const cardIds =
        ctx.trigger.deletedPermanentSnapshots?.map((snapshot) => snapshot.topCardId) ??
        (ctx.trigger.deletedTopCardId === undefined ? [] : [ctx.trigger.deletedTopCardId]);
      return cardIds.some((cardId) => definitionMatches(cond.filter!, ctx.game.definitionOf({ cardId } as never)));
    }
    case "triggerDeletedStackMatchesFilter": {
      const filter = cond.filter;
      if (filter === undefined) return false;
      const ids = ctx.trigger.deletedWasStackInstanceIds ?? [];
      const trash = ctx.game.player(ctx.source.ownerSeat).trash;
      return ids.some((id) => {
        const card = trash.find((candidate) => candidate.instanceId === id);
        return card !== undefined && definitionMatches(filter, ctx.game.definitionOf(card));
      });
    }
    case "triggerDeleterIsSelf":
      return ctx.source.permanent()?.permanentId === ctx.trigger.deletingPermanentId;
    case "triggerAttackerIsSelf":
      return ctx.source.permanent()?.permanentId === ctx.trigger.attackerPermanentId;
    case "triggerAttackerMatchesFilter": {
      const attackerId = ctx.trigger.attackerPermanentId;
      if (attackerId === undefined || cond.filter === undefined) return false;
      return candidatePermanents(ctx, { filter: cond.filter, count: "all" }, { includeUnaffectable: true }).some(
        (permanent) => permanent.permanentId === attackerId,
      );
    }
    case "triggerDefenderIsSelf":
      return ctx.source.permanent()?.permanentId === ctx.trigger.defenderPermanentId;
    case "triggerDefenderMatchesFilter": {
      const defenderId = ctx.trigger.defenderPermanentId;
      if (defenderId === undefined || cond.filter === undefined) return false;
      return candidatePermanents(ctx, { filter: cond.filter, count: "all" }, { includeUnaffectable: true }).some(
        (permanent) => permanent.permanentId === defenderId,
      );
    }
    case "triggerRemovedSecuritySeat": {
      const seat = cond.seat === "opponent" ? opp : mine;
      return ctx.trigger.removedFromSecuritySeat === seat;
    }
    case "triggerSecurityRemovedByEffect":
      return ctx.trigger.securityRemovedByEffect === true;
    case "triggerHandTrashedSeat": {
      if (cond.seat === "any") return ctx.trigger.handTrashedSeat !== undefined;
      const seat = cond.seat === "opponent" ? opp : mine;
      return ctx.trigger.handTrashedSeat === seat;
    }
    case "triggeredByEffect":
      return ctx.trigger.effectSuspendSeat !== undefined;
    case "triggerRemovalCause":
      return (
        ctx.trigger.removalCause === cond.removalCause &&
        (cond.removalMechanic === undefined || ctx.trigger.removalMechanic === cond.removalMechanic)
      );
    case "triggerDeletedIsOpponent":
      return ctx.trigger.deletedControllerSeat === ctx.game.opponentOf(ctx.source.ownerSeat);
    case "triggerDeletedIsYourOther": {
      const self = ctx.source.permanent();
      const snapshots = ctx.trigger.deletedPermanentSnapshots;
      if (self === undefined) return false;
      if (snapshots !== undefined) {
        return (
          !snapshots.some(({ permanentId }) => permanentId === self.permanentId) &&
          snapshots.some(({ permanentId, controllerSeat, topCardId }) => {
            const definition = getCardDefinition(topCardId);
            return (
              permanentId !== self.permanentId &&
              controllerSeat === ctx.source.ownerSeat &&
              definition !== undefined &&
              isDigimon(definition)
            );
          })
        );
      }
      const deleted = ctx.trigger.deletedPermanentId;
      const definition =
        ctx.trigger.deletedTopCardId === undefined ? undefined : getCardDefinition(ctx.trigger.deletedTopCardId);
      return (
        deleted !== undefined &&
        deleted !== self.permanentId &&
        ctx.trigger.deletedControllerSeat === ctx.source.ownerSeat &&
        definition !== undefined &&
        isDigimon(definition)
      );
    }
    case "triggerDeletedByDpZero":
      return ctx.trigger.deletedByDpZero === true;
    case "triggerIsFirstDeletedPermanent": {
      const subject = ctx.trigger.deletedPermanentId;
      const deleted = ctx.trigger.deletedPermanentIds ?? [];
      return subject !== undefined && deleted[0] === subject;
    }
    case "triggerSourceNotDeletedAtSameTiming": {
      // whenDeletesInBattle fireCondition: the trigger source (the attacker that deleted the
      // opponent's Digimon) must NOT have been deleted at the same timing. The combat controller
      // only fires the `whenDeletesInBattle` watcher when the attacker survived (`attackerSurvived`
      // is true at the fire seam), so in practice this condition is always true when reachable.
      // We still check the board to handle edge cases where the permanent may have left after the
      // event fired (KB Q4364/Q4367: simultaneous deletion → cannot activate). (CAP-E11, BT20-044)
      const attackerId = ctx.trigger.attackerPermanentId;
      if (attackerId === undefined) return false;
      return ctx.game.permanentById(attackerId) !== undefined;
    }
    case "triggerAttackerSurvivedBattle": {
      // Combat matches battle-deletion watchers while both losers are still on the field (Q7339),
      // so the board cannot show a trade yet. The event's deletion batch can.
      const attackerId = ctx.trigger.attackerPermanentId;
      if (attackerId === undefined) return false;
      return !(ctx.trigger.deletedPermanentIds ?? []).includes(attackerId);
    }
    case "selfHasNameContaining": {
      const definition = sourceTopDefinition(ctx);
      if (definition === undefined) return false;
      const live = ctx.source.permanent();
      const currentNames =
        live === undefined
          ? effectiveStaticNames(definition)
          : (ctx.game.effectiveNames?.(live) ?? effectiveStaticNames(definition));
      // Rule inclusion aliases are not exact identities. They still satisfy "in its
      // name" while the printed identity is live, but an original-name rewrite removes them.
      const printedNameStillEffective = currentNames.some(
        (name) => name.toLowerCase() === definition.nameEn.toLowerCase(),
      );
      const topNames = printedNameStillEffective
        ? [...currentNames, ...effectiveStaticNames(definition)]
        : currentNames;
      const names = cond.names ?? [];
      const excluded = cond.excludeNames ?? [];
      return (
        names.some((n) => topNames.some((name) => nameIncludesToken(name, n))) &&
        !excluded.some((n) => topNames.some((name) => nameIncludesToken(name, n)))
      );
    }
    case "raw":
      {
        if (/this card had digivolution cards/i.test(cond.raw ?? "")) {
          return (ctx.trigger.deletedWasStackInstanceIds?.length ?? 0) > 0;
        }
        const gained = /you gain(?:ed)?\s+(\d+)\s+or\s+more memory by this effect/i.exec(cond.raw ?? "");
        if (gained) return (ctx.lastMemoryGainAmount ?? 0) >= Number(gained[1]);
        const selfLevelAtLeast = /this Digimon is level\s+(\d+)\s+or higher/i.exec(cond.raw ?? "");
        if (selfLevelAtLeast) {
          const top = ctx.source.permanent()?.topCard;
          const level = top === undefined ? undefined : ctx.game.definitionOf(top).level;
          return level !== undefined && level >= Number(selfLevelAtLeast[1]);
        }
        if (/this Digimon is suspended/i.test(cond.raw ?? "")) {
          return ctx.source.permanent()?.isSuspended === true;
        }
        {
          // Multicolor inherited conditions (BT16-001–004 and peers) refer to the
          // host Digimon's effective colors, including continuous color grants.
          const m = /this Digimon has (\d+) or more colors/i.exec(cond.raw ?? "");
          if (m) {
            const self = ctx.source.permanent();
            const top = self?.topCard;
            if (self === undefined || top === undefined) return false;
            const definition = ctx.game.definitionOf(top);
            const colors = ctx.game.effectiveColors?.(self) ?? definition.colors;
            return new Set(colors).size >= Number(m[1]);
          }
        }
        {
          const m = /this Digimon is \[([^\]]+)\]/i.exec(cond.raw ?? "");
          if (m) {
            const self = ctx.source.permanent();
            const top = self?.topCard;
            return top !== undefined && (ctx.game.definitionOf(top).nameEn ?? "").toLowerCase() === m[1]!.toLowerCase();
          }
        }
        {
          const m = /this Digimon has (.+?) in its name/i.exec(cond.raw ?? "");
          if (m) {
            const self = ctx.source.permanent();
            const top = self?.topCard;
            if (top === undefined) return false;
            const name = (ctx.game.definitionOf(top).nameEn ?? "").toLowerCase();
            const names = [...m[1]!.matchAll(/\[([^\]]+)\]/g)].map((x) => x[1]!.toLowerCase());
            return names.some((token) => nameIncludesToken(name, token));
          }
        }
        if (/deleted outside of a battle/i.test(cond.raw ?? "")) {
          return ctx.trigger.removalCause !== undefined && ctx.trigger.removalCause !== "byBattle";
        }
        if (/attacked a Digimon with higher DP than this Digimon/i.test(cond.raw ?? "")) {
          const self = ctx.source.permanent();
          const targetId = ctx.trigger.targetPermanentId ?? ctx.trigger.defenderPermanentId;
          const target = targetId !== undefined ? ctx.game.permanentById(targetId) : undefined;
          return self?.currentDP !== undefined && target?.currentDP !== undefined && target.currentDP > self.currentDP;
        }
        // Counter-window gate: "one of their Digimon is attacking" is true only while the
        // combat controller has an in-flight attacker bound to the trigger context (BT15-049).
        if (/one of their Digimon is attacking/i.test(cond.raw ?? "")) {
          return ctx.trigger.attackerPermanentId !== undefined;
        }
        {
          const m = /this Digimon has the \[([^\]]+)\] trait/i.exec(cond.raw ?? "");
          if (m) {
            const self = ctx.source.permanent();
            if (self === undefined) return false;
            return self.stack.some((card) =>
              matchNameOrTrait(ctx.game.definitionOf(card), { tokens: [m[1]!], match: "trait" }),
            );
          }
        }
        {
          const rawHasTrait = /this Digimon has (.+?) trait/i.exec(cond.raw ?? "");
          if (rawHasTrait) {
            const self = ctx.source.permanent();
            const top = self?.topCard;
            if (top === undefined) return false;
            const def = ctx.game.definitionOf(top);
            const tokens = [...rawHasTrait[1]!.matchAll(/\[([^\]]+)\]/g)].map((x) => x[1]!);
            return tokens.some((token) => matchNameOrTrait(def, { tokens: [token], match: "trait" }));
          }
        }
        // "this Digimon had [X] or [Y] in its name" (BT13-062/EX5-045): on-deletion
        // inherited effects must inspect the deleted host's top card, not the inherited
        // source card that remains as the trigger owner.
        {
          const m = /this Digimon had (?:\[([^\]]+)\](?:\s+or\s+)?)+ in its name/i.exec(cond.raw ?? "");
          if (m) {
            const deleted = ctx.trigger.deletedTopCardId;
            const def = deleted !== undefined ? ctx.game.definitionOf({ cardId: deleted } as never) : undefined;
            const name = (def?.nameEn ?? "").toLowerCase();
            const names = [...(cond.raw ?? "").matchAll(/\[([^\]]+)\]/g)].map((x) => x[1]!.toLowerCase());
            return names.some((token) => nameIncludesToken(name, token));
          }
        }
      }
      // Known runtime record-raw phrases that map onto effect-result bindings the parser
      // did not normalize: "this effect digivolved" (BT16-024's place-as-security gate)
      // is the digivolve-result binding, identical to ifThisEffectDigivolved.
      if (/this effect digivolved/i.test(cond.raw ?? "")) return ctx.lastDigivolveResult === true;
      // "this effect placed" (AD1-020): gates on the preceding PlaceUnder having moved >=1 card.
      if (/this effect placed/i.test(cond.raw ?? "")) return ctx.lastEffectActed === true;
      // "you did" (BT21-012, BT16-094) / "you do" (BT11-057, BT10-106, BT11-083, BT6-068,
      // BT9-108, ST10-01 — present-tense "If you do, ..." printed text): generic "if the
      // preceding optional/conditional action actually performed its verb (play, trash,
      // place, etc.)". Both tenses normalize to the same raw phrase family and share the
      // same effect-result binding. `\b` around "do"/"did" keeps this from matching the
      // unrelated "you don't have..." negative-condition family (word boundary fails
      // inside "don't").
      if (/\byou (did|do)\b/i.test(cond.raw ?? "")) return ctx.lastEffectActed === true;
      // "N or more [TRAIT] trait cards under this Tamer/Digimon" (AD1-020 memory gate):
      // delegate to selfDigivolutionStackCountAtLeast logic.
      {
        const m = /(\d+)\s+or\s+more\s+\[([^\]]+)\]\s+trait\s+cards\s+under\s+this/i.exec(cond.raw ?? "");
        if (m) {
          const self = ctx.source.permanent();
          if (self === undefined) return false;
          const count = self.stack.filter((card) => {
            const def = ctx.game.definitionOf(card);
            return matchNameOrTrait(def, { tokens: [m[2]!], match: "trait" });
          }).length;
          return count >= Number(m[1]);
        }
      }
      // "this Digimon had [TRAIT] trait" (BT17-053's [On Deletion] token-play precondition,
      // (available even after the permanent has left the field) and match its trait union.
      {
        const m = /this Digimon had \[([^\]]+)\] trait/i.exec(cond.raw ?? "");
        if (m) {
          const def = requireCardDefinition(ctx.source.cardId);
          return def !== undefined && matchNameOrTrait(def, { tokens: [m[1]!], match: "trait" });
        }
      }
      // "N or more cards with different names in this/its digivolution cards" (EX6-006's
      // reduce-by-4 threshold and its [Breeding][End of Opponent's Turn] delete-cost gate):
      // count distinct card names in the SOURCE permanent's own digivolution stack. KB Q3696
      // confirms the effect's own host card counts toward this total (it is itself a stack
      // card when this is an inherited use), so no special-casing is needed beyond a plain
      // distinct-name count of `self.stack`.
      {
        const m =
          /(\d+)\s+or\s+more\s+cards\s+with\s+different\s+names\s+in\s+(?:its|this Digimon'?s)\s+digivolution\s+cards/i.exec(
            cond.raw ?? "",
          );
        if (m) {
          const self = ctx.source.permanent();
          if (self === undefined) return false;
          const names = new Set(
            self.stack.map((card) => (ctx.game.definitionOf(card).nameEn ?? card.cardId).toLowerCase()),
          );
          return names.size >= Number(m[1]);
        }
      }
      // "this effect deleted" (EX6-006's [Start of Your Main Phase] egg-clause: mandatory
      // Delete always runs per KB Q3694, so this reads whether it actually removed >=1
      // permanent). Positive counterpart of the structured `ifThisEffectDidNotDelete`.
      if (/^this effect deleted$/i.test((cond.raw ?? "").trim())) return (ctx.lastDeleteCount ?? 0) > 0;
      // "this effect didn't trash" (BT18-034, BT18-101, BT19-043, EX7-067's "then" clause):
      // gates on the preceding trash-capable action (SecurityManipulation trashTop, or
      // TrashDigivolution) having actually removed >=1 card. Negative counterpart of "you did".
      if (/this effect didn'?t trash|this effect did not trash/i.test(cond.raw ?? ""))
        return ctx.lastEffectActed !== true;
      return false;
    default:
      return false;
  }
}

/**
 * The digivolution-stack predicates over a defender that a same-window [When Attacking] effect
 * can change, and which {@link TriggerInfo.defenderAtDeclaration} therefore answers from the declaration
 * snapshot instead of from live state (KB Q2816).
 *
 * `digivolutionCards: "hasFaceDown"` is deliberately absent: face state is not carried by the
 * count snapshot, so it stays on the live scan.
 */
function declarationTimeDefenderFactsMatch(
  snapshot: NonNullable<TriggerInfo["defenderAtDeclaration"]>,
  filter: Filter,
): boolean {
  const stack = snapshot.digivolutionCardCount;
  if (filter.digivolutionCards === "none" || filter.digivolutionCards === "hasNone") {
    if (stack !== 0) return false;
  }
  if (filter.digivolutionCards === "hasAny" && stack === 0) return false;
  if (filter.hasDigivolutionCards === true && stack === 0) return false;
  if (filter.hasDigivolutionCards === false && stack !== 0) return false;
  if (filter.digivolutionCardsAtMost !== undefined && stack > filter.digivolutionCardsAtMost) return false;
  if (filter.digivolutionCardsAtLeast !== undefined && stack < filter.digivolutionCardsAtLeast) return false;
  return true;
}

/**
 * "If you attack an opponent's Digimon" stays true for the whole [When Attacking] window after
 * another effect removes the declared defender (KB Q648, Q650). Only controller, kind and the
 * declaration-time stack facts are answered from the snapshot; any other predicate needs the
 * live permanent, so the gate fails closed.
 */
function departedDefenderMatches(
  ctx: EffectContext,
  snapshot: NonNullable<TriggerInfo["defenderAtDeclaration"]>,
  filter: Filter,
): boolean {
  const { controller: _controller, controllerDefault: _default, kind, ...rest } = withoutDeclarationTimeFacts(filter);
  if (Object.values(rest).some((value) => value !== undefined)) return false;
  if (!declarationTimeDefenderFactsMatch(snapshot, filter)) return false;
  if (!seatsForController(ctx, filter).includes(snapshot.controllerSeat)) return false;
  return kind === undefined || kind.some((wanted) => snapshot.kinds.includes(KIND_MAP[wanted]));
}

/** `filter` with the predicates {@link declarationTimeDefenderFactsMatch} has already answered. */
function withoutDeclarationTimeFacts(filter: Filter): Filter {
  const rest = { ...filter };
  if (rest.digivolutionCards !== "hasFaceDown") delete rest.digivolutionCards;
  delete rest.hasDigivolutionCards;
  delete rest.digivolutionCardsAtMost;
  delete rest.digivolutionCardsAtLeast;
  return rest;
}
