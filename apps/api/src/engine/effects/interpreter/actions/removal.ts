// Deleting, trashing, and returning cards.

import { requireOpponentAsk } from "../../../decisions/decisionApi.js";
import { hasPlayCost } from "../../../cards/cardData.js";
import type { ActionScope } from "../dispatch.js";
import type { EffectContext } from "../../EffectContext.js";
import { CardColor, CardKind } from "@aegis/shared";
import { viableColorCandidates } from "../targeting/colorMatching.js";
import { seatsForController } from "../matching/permanent.js";
import { countMatching, scaleFactor } from "../scaling.js";
import { candidateLooseInstances, looseCardsInZone, pickLoose, zoneList } from "../targeting/loose.js";
import { revealPrivateRequirementPicks } from "../targeting/privateReveal.js";
import {
  candidatePermanents,
  raiseDeletionDpCap,
  resolveExceptSurvivors,
  resolvePermanentTargets,
  resolveTotalDpCapTargets,
  resolveTotalPlayCostBudgetTargets,
  topInstanceIds,
} from "../targeting/permanents.js";
import type { Action, CardInstance, Permanent, Seat, Target } from "@aegis/shared";
import { definitionMatches } from "../matching/definition.js";
import { COLOR_MAP } from "../maps.js";
import { redirectDigivolutionTrash } from "../digivolutionTrashRedirect.js";
import { isOptionPermanent, trashOptionPermanents } from "../optionTrash.js";

function isCompleteCardOrder(candidates: readonly string[], order: readonly string[]): order is string[] {
  return (
    order.length === candidates.length &&
    new Set(order).size === candidates.length &&
    order.every((instanceId) => candidates.includes(instanceId))
  );
}

type StackFirstAction = {
  order?: "any";
  returnDigivolutionCardsFirst?: boolean;
};

function deletedPermanentSnapshots(
  ctx: EffectContext,
  ids: readonly string[],
): Array<{ permanentId: string; controllerSeat: Seat; topCard: CardInstance }> {
  return ids.flatMap((permanentId) => {
    const permanent = ctx.game.permanentById(permanentId);
    const topCard = permanent?.topCard;
    return permanent === undefined || topCard === undefined
      ? []
      : [{ permanentId, controllerSeat: permanent.controllerSeat, topCard }];
  });
}

/**
 * The one Digimon whose digivolution cards a stack-card trash names ("this Digimon's", the
 * trigger subject's, a bound Digimon's), or undefined for a pooled "any of your Digimon" trash.
 */
function designatedDigivolutionHost(ctx: EffectContext, target: Target): string | undefined {
  const hostFilter = target.filter.hostFilter;
  if (target.filter.isSelfRef === true || hostFilter?.isSelfRef === true) return ctx.source.permanent()?.permanentId;
  if (hostFilter?.sourceRef === "triggerSubject") {
    return ctx.trigger.subjectPermanentId ?? ctx.trigger.attackerPermanentId ?? ctx.trigger.deletedPermanentId;
  }
  const boundRef = (hostFilter as { boundRef?: string } | undefined)?.boundRef;
  return boundRef === undefined ? undefined : ctx.selections?.get(boundRef);
}

async function returnDigivolutionCardsFirst(
  ctx: EffectContext,
  action: StackFirstAction,
  permanentIds: string[],
): Promise<void> {
  const stackCardsByPermanent = permanentIds.map((permanentId) =>
    Array.from(ctx.game.permanentById(permanentId)?.stack ?? []),
  );
  const stackIdsByPermanent = stackCardsByPermanent.map((cards) => cards.map((card) => card.instanceId));
  const stackIds = stackIdsByPermanent.flatMap((ids) => ids);
  let orderedStackIds = stackIds;
  if (action.order === "any" && stackIds.length > 1 && ctx.ask.orderCards !== undefined) {
    const requestedOrder = await ctx.ask.orderCards(ctx, {
      candidates: stackIds,
      visibleCards: stackCardsByPermanent
        .flatMap((cards) => cards)
        .map(({ instanceId, cardId }) => ({ instanceId, cardId })),
      destination: "deckBottom",
    });
    // A malformed response must not move an arbitrary prefix before the rest of the
    // stack. Fall back atomically to the printed/default stack order instead.
    if (isCompleteCardOrder(stackIds, requestedOrder)) orderedStackIds = requestedOrder;
  }
  for (const ids of stackIdsByPermanent) {
    const orderedForPermanent = orderedStackIds.filter((instanceId) => ids.includes(instanceId));
    if (orderedForPermanent.length > 0) await ctx.fx.returnToDeck(orderedForPermanent, { toTop: false });
  }
}

/** The cards under the resolving Digimon that a "return from this Digimon's digivolution cards" may take. */
export function returnableDigivolutionCards(ctx: EffectContext, target: Target): CardInstance[] {
  return (
    ctx.source.permanent()?.stack.filter((card) => definitionMatches(target.filter, ctx.game.definitionOf(card))) ?? []
  );
}

export async function runRemovalAction(ctx: EffectContext, action: Action, scope: ActionScope): Promise<boolean> {
  const { scale } = scope;
  switch (action.kind) {
    case "TrashTopStackedCards": {
      const targetIds = await resolvePermanentTargets(ctx, action.target);
      const moved = [];
      for (const permanentId of targetIds) {
        moved.push(
          ...(await ctx.fx.trashStackTops(permanentId, action.amount, {
            byEffectSeat: ctx.source.ownerSeat,
            byEffectCardId: ctx.source.cardId,
          })),
        );
      }
      ctx.lastEffectActed = moved.length > 0;
      return false;
    }
    case "ReturnTopDigivolutionCards": {
      const targetIds = await resolvePermanentTargets(ctx, action.target);
      const cards = targetIds.flatMap((id) => {
        const permanent = ctx.game.permanentById(id);
        if (permanent?.topCard === undefined) return [];
        return action.position === "bottom"
          ? Array.from(permanent.stack).slice(0, action.cardsPerTarget)
          : [...Array.from(permanent.stack), permanent.topCard].slice(
              -Math.min(action.cardsPerTarget, permanent.stack.length),
            );
      });
      if (cards.length === 0) return false;
      let ordered = cards.map((card) => card.instanceId);
      if (action.order === "any" && ordered.length > 1 && ctx.ask.orderCards !== undefined) {
        ordered = await ctx.ask.orderCards(ctx, { candidates: ordered, destination: "deckTop" });
      }
      await ctx.fx.returnStackTopsToDeck(ordered, {
        byEffectSeat: ctx.source.ownerSeat,
        byEffectCardId: ctx.source.cardId,
        position: action.position,
      });
      ctx.lastEffectActed = true;
      return false;
    }
    case "Delete": {
      const survivorIds = await resolveExceptSurvivors(ctx, action.target);
      let target = action.target;
      if (action.dpCeilingScaling && target.filter.dp?.value !== undefined) {
        target = {
          ...target,
          filter: {
            ...target.filter,
            dp: {
              ...target.filter.dp,
              value:
                target.filter.dp.value + scaleFactor(ctx, action.dpCeilingScaling) * action.dpCeilingScaling.amount,
            },
          },
        };
      }
      if (action.totalDpCapScaling && target.totalDpCap !== undefined) {
        target = {
          ...target,
          totalDpCap: target.totalDpCap + scaleFactor(ctx, action.totalDpCapScaling) * action.totalDpCapScaling.amount,
        };
      }
      target = raiseDeletionDpCap(ctx, target);
      if (action.playCostCeiling !== undefined) {
        const ceiling = action.playCostCeiling;
        const units = scaleFactor(ctx, ceiling);
        target = {
          ...target,
          filter: {
            ...target.filter,
            playCostLte: ceiling.base + units * ceiling.raise,
          },
        };
      }
      if (scale !== undefined && action.scaling?.levelCeilingAdd === undefined && typeof target.count === "number") {
        target = { ...target, count: target.count * scale };
      }
      if (
        scale !== undefined &&
        action.scaling?.levelCeilingAdd !== undefined &&
        target.filter.levelComparison?.value !== undefined
      ) {
        target = {
          ...target,
          filter: {
            ...target.filter,
            levelComparison: {
              ...target.filter.levelComparison,
              value: target.filter.levelComparison.value + scale * action.scaling.levelCeilingAdd,
            },
          },
        };
      }
      // Deletion targets remain legally selectable even when protected by an effect. Preserve
      // those chosen IDs through the delete primitive so the actual removal count is 0 and
      // downstream `ifThisEffectDidNotDelete` clauses can observe the failed deletion (BT25-014
      // Q6260). The primitive still enforces protection; this only preserves target selection.
      const resolved =
        target.totalDpCap !== undefined
          ? await resolveTotalDpCapTargets(ctx, target)
          : await resolvePermanentTargets(ctx, target, {
              preserveUnaffectableSelection: true,
              allowDecline: ctx.selectingOptionalTarget === true,
            });
      const ids = resolved.filter((id) => !survivorIds.includes(id));
      for (const additionalTarget of action.additionalSimultaneousTargets ?? []) {
        const chosen = new Set(ids);
        const additionalIds = await resolvePermanentTargets(ctx, raiseDeletionDpCap(ctx, additionalTarget), {
          preserveUnaffectableSelection: true,
          eligible: (permanentId) => !chosen.has(permanentId),
        });
        ids.push(...additionalIds.filter((id) => !chosen.has(id)));
      }
      ctx.lastDeleteTargetSelected = ids.length > 0;
      ctx.lastDeletedPermanentSnapshots = [];
      if (action.at === "endOfTurn") {
        for (const id of ids) ctx.fx.delayedDeletePlayed?.(id);
        ctx.lastDeleteCount = 0;
        return false;
      }
      // Bind the delete OUTCOME on ctx (effect-result binding): the count actually removed, read
      // by a subsequent "if this effect didn't delete" Condition (KB BT23-069 Q5338). A resolve
      // that chose 0 targets (none eligible) is also "didn't delete" => bind 0.
      const selectedLevels = ids.map((id) => {
        const permanent = ctx.game.permanentById(id);
        return permanent?.topCard === undefined ? undefined : ctx.game.definitionOf(permanent.topCard).level;
      });
      const selectedDP = ids.map((id) => ctx.game.permanentById(id)?.currentDP);
      const selectedSnapshots = deletedPermanentSnapshots(ctx, ids);
      ctx.lastDeleteCount = ids.length > 0 ? await ctx.fx.deletePermanent(ids) : 0;
      ctx.lastDeletedByThisEffectIds = ids.filter((id) => ctx.game.permanentById(id) === undefined);
      const actuallyDeleted = new Set(ctx.lastDeletedByThisEffectIds);
      ctx.lastDeletedPermanentSnapshots = selectedSnapshots.filter(({ permanentId }) =>
        actuallyDeleted.has(permanentId),
      );
      ctx.lastDeletedLevel =
        ctx.lastDeletedByThisEffectIds.length > 0 ? selectedLevels.find((level) => level !== undefined) : undefined;
      ctx.lastDeletedDP =
        ctx.lastDeletedByThisEffectIds.length > 0 ? selectedDP.find((dp) => dp !== undefined) : undefined;
      ctx.deletedThisEffectIds = [
        ...(ctx.deletedThisEffectIds ?? []),
        ...ctx.lastDeletedByThisEffectIds.filter((id) => !(ctx.deletedThisEffectIds ?? []).includes(id)),
      ];
      ctx.lastEffectActed = ctx.lastDeletedByThisEffectIds.length > 0;
      if (action.trackCount !== undefined) {
        ctx.namedCounts ??= new Map();
        ctx.namedCounts.set(action.trackCount, ctx.lastDeletedByThisEffectIds.length);
      }
      return false;
    }
    case "DeletePerColor": {
      const source = ctx.source.permanent();
      if (source === undefined || action.source !== "digivolutionCards") return false;
      // The source-color threshold is the IR condition. Q5003 then considers all seven colors.
      const colors = [
        CardColor.Red,
        CardColor.Blue,
        CardColor.Yellow,
        CardColor.Green,
        CardColor.Black,
        CardColor.Purple,
        CardColor.White,
      ];
      const selected: string[] = [];
      for (let index = 0; index < colors.length; index++) {
        const candidates = candidatePermanents(ctx, action.target)
          .filter((permanent) => !selected.includes(permanent.permanentId))
          .map((permanent) => ({
            id: permanent.permanentId,
            colors:
              permanent.topCard === undefined
                ? []
                : (ctx.game.effectiveColors?.(permanent) ?? ctx.game.definitionOf(permanent.topCard).colors),
          }));
        const orderedCandidates = viableColorCandidates(colors.slice(index), candidates).sort(
          (left, right) => left.colors.length - right.colors.length,
        );
        if (orderedCandidates.length === 0) continue;
        const chosen =
          orderedCandidates.length === 1
            ? orderedCandidates[0]!.id
            : (
                await ctx.ask.chooseTargets(ctx, {
                  candidates: orderedCandidates.map((p) => p.id),
                  min: 1,
                  max: 1,
                })
              )[0];
        if (chosen !== undefined) selected.push(chosen);
      }
      if (selected.length > 0) await ctx.fx.deletePermanent(selected);
      ctx.lastEffectActed = selected.length > 0;
      return false;
    }
    case "DeleteUntilCount": {
      // BT19-094 Lucemon: delete opponent Digimon until their remaining Digimon count equals
      // the number of your security cards. If they already have that many or fewer, nothing is
      // deleted. Selection is interactive among the eligible target pool.
      const desiredCount =
        action.untilCountSource === "mineSecurityCount" ? ctx.game.player(ctx.source.ownerSeat).security.length : 0;
      const candidates = candidatePermanents(ctx, { ...action.target, count: "all" });
      const toDelete = Math.max(0, candidates.length - desiredCount);
      if (toDelete === 0) {
        ctx.lastDeleteCount = 0;
        ctx.lastDeletedByThisEffectIds = [];
        ctx.lastDeletedPermanentSnapshots = [];
        ctx.lastEffectActed = false;
        if (action.trackCount !== undefined) {
          if (ctx.namedCounts === undefined) ctx.namedCounts = new Map();
          ctx.namedCounts.set(action.trackCount, 0);
        }
        return false;
      }
      const target: Target = { ...action.target, count: toDelete };
      const selected = await resolvePermanentTargets(ctx, target);
      const selectedSnapshots = deletedPermanentSnapshots(ctx, selected);
      const deleted = selected.length > 0 ? await ctx.fx.deletePermanent(selected) : 0;
      const actuallyDeleted = deleted > 0 ? selected.filter((id) => ctx.game.permanentById(id) === undefined) : [];
      ctx.lastDeleteCount = deleted;
      ctx.lastDeletedByThisEffectIds = actuallyDeleted;
      const actuallyDeletedSet = new Set(actuallyDeleted);
      ctx.lastDeletedPermanentSnapshots = selectedSnapshots.filter(({ permanentId }) =>
        actuallyDeletedSet.has(permanentId),
      );
      ctx.lastEffectActed = deleted > 0;
      if (action.trackCount !== undefined) {
        if (ctx.namedCounts === undefined) ctx.namedCounts = new Map();
        ctx.namedCounts.set(action.trackCount, deleted);
      }
      return false;
    }
    case "DeleteBudget": {
      // Q1783: the controller picks any combination whose printed play costs fit the budget.
      // BT19-096: optional scaling.budgetAdd raises the budget per counted unit.
      let effectiveBudget = action.budget;
      if (action.scaling !== undefined && action.scaling.budgetAdd !== undefined) {
        const units = scaleFactor(ctx, action.scaling);
        effectiveBudget += units * action.scaling.budgetAdd;
      }
      const printedPlayCost = (permanent: Permanent) =>
        permanent.topCard === undefined ? 0 : (ctx.game.definitionOf(permanent.topCard).playCost ?? 0);
      // Cheapest first, so an auto-responder or timeout default fits the most Digimon.
      const affordable = candidatePermanents(ctx, { filter: action.filter, count: "all" } as Target)
        .filter((candidate) => candidate.topCard !== undefined && hasPlayCost(ctx.game.definitionOf(candidate.topCard)))
        .filter((candidate) => printedPlayCost(candidate) <= effectiveBudget)
        .sort((first, second) => printedPlayCost(first) - printedPlayCost(second));
      const minimum = action.minimum ?? 0;
      if (affordable.length === 0 || affordable.length < minimum) {
        ctx.lastDeleteCount = 0;
        return false;
      }
      const picked = await ctx.ask.selectPermanents(ctx, {
        candidates: affordable.map((candidate) => candidate.permanentId),
        min: minimum,
        max: affordable.length,
        maxTotalPlayCost: effectiveBudget,
      });
      const costById = new Map(affordable.map((candidate) => [candidate.permanentId, printedPlayCost(candidate)]));
      const selected: string[] = [];
      let spent = 0;
      for (const permanentId of picked) {
        const cost = costById.get(permanentId);
        if (cost === undefined || spent + cost > effectiveBudget) continue;
        selected.push(permanentId);
        spent += cost;
      }
      ctx.lastDeleteCount = selected.length > 0 ? await ctx.fx.deletePermanent(selected) : 0;
      return false;
    }
    case "DeleteByStackColorBudget": {
      const source = ctx.source.permanent();
      if (source === undefined) return false;
      const hasColor = (color: "Red" | "Black") =>
        source.stack.some((card) => ctx.game.definitionOf(card).colors.includes(COLOR_MAP[color]));
      const filters = [
        ...(hasColor("Red") ? [action.redFilter] : []),
        ...(hasColor("Black") ? [action.blackFilter] : []),
      ];
      if (filters.length === 0) return false;
      const candidates = candidatePermanents(ctx, { filter: { or: filters }, count: "all" } as Target).filter(
        (candidate) => candidate.topCard !== undefined && hasPlayCost(ctx.game.definitionOf(candidate.topCard)),
      );
      const selected = await ctx.ask.selectPermanents(ctx, {
        candidates: candidates.map((candidate) => candidate.permanentId),
        min: 0,
        max: candidates.length,
        maxTotalPlayCost: action.budget,
      });
      ctx.lastDeleteCount = selected.length > 0 ? await ctx.fx.deletePermanent(selected) : 0;
      ctx.lastEffectActed = ctx.lastDeleteCount > 0;
      return false;
    }
    case "DeleteLevelBudget": {
      // BT17-051 Argomon: delete any number of opponent Digimon whose LEVELS sum to <= budget.
      // The budget is `baseBudget` plus a scaling-driven add ("for every 2 [Argomon] in its
      // digivolution cards, +1 to the maximum"): scaleFactor() yields the floor(count/per) units,
      // each worth `scaling.budgetAdd`. `filter.hasLevel` excludes Lv.- candidates (KB Q2807).
      let budget = action.baseBudget;
      if (action.scaling) {
        const units = scaleFactor(ctx, action.scaling);
        budget += units * (action.scaling.budgetAdd ?? 1);
      }
      const candidates = candidatePermanents(ctx, { filter: action.filter, count: "all" } as Target);
      const byLevel = candidates
        .map((p) => ({
          permanentId: p.permanentId,
          level: p.topCard !== undefined ? (ctx.game.definitionOf(p.topCard).level ?? 0) : 0,
        }))
        .filter((c) => c.level > 0)
        .sort((a, b) => a.level - b.level);
      const selected: string[] = [];
      let spent = 0;
      for (const candidate of byLevel) {
        if (spent + candidate.level > budget) {
          if (action.upTo) continue;
          break;
        }
        const yes = action.upTo
          ? await ctx.ask.optional(
              ctx,
              `Delete ${candidate.permanentId} (level ${candidate.level}, spent ${spent}/${budget})?`,
            )
          : true;
        if (yes) {
          selected.push(candidate.permanentId);
          spent += candidate.level;
        }
      }
      ctx.lastDeleteCount = selected.length > 0 ? await ctx.fx.deletePermanent(selected) : 0;
      return false;
    }
    case "DeleteByDPBudget": {
      // BT19-011: select any combination of opponent Digimon whose DP values sum to <= budget.
      // Generic "add N to the maximum DP you can choose with DP-based deletion effects"
      // modifiers also raise aggregate budgets (BT9-009/011 feeding BT9-014), in addition
      // to the dedicated AddToDPDeleteBudget producer used by later cards.
      const sourcePerm = ctx.source.permanent();
      const dedicatedBudgetBonus =
        sourcePerm !== undefined ? (ctx.fx.dpDeleteBudgetBonus?.(sourcePerm.permanentId) ?? 0) : 0;
      const genericDeletionMaxBonus = ctx.fx.deletionMaxDpBonus?.(ctx.source.ownerSeat, sourcePerm?.permanentId) ?? 0;
      const scaledBonus = action.budgetBonus
        ? action.budgetBonus.per *
          Math.floor(
            (action.budgetBonus.unit === "selfDigivolutionCards"
              ? (sourcePerm?.stack.length ?? 0)
              : countMatching(ctx, action.budgetBonus.filter ?? {})) / (action.budgetBonus.perCount ?? 1),
          )
        : 0;
      const effectiveBudget = action.baseBudget + dedicatedBudgetBonus + genericDeletionMaxBonus + scaledBonus;
      const candidates = candidatePermanents(ctx, { filter: action.target.filter, count: "all" } as Target);
      if (candidates.length === 0) {
        ctx.lastDeleteCount = 0;
        ctx.lastDeletedByThisEffectIds = [];
        ctx.lastDeletedPermanentSnapshots = [];
        return false;
      }
      // Sort ascending by live DP so the greedy pass picks cheapest first.
      const byDP = candidates.map((p) => ({ permanentId: p.permanentId, dp: p.currentDP })).sort((a, b) => a.dp - b.dp);
      const selected: string[] = [];
      let spent = 0;
      for (const candidate of byDP) {
        if (spent + candidate.dp > effectiveBudget) continue; // skip; another may still fit
        const yes = await ctx.ask.optional(
          ctx,
          `Delete ${candidate.permanentId} (DP ${candidate.dp}, spent ${spent}/${effectiveBudget})?`,
        );
        if (yes) {
          selected.push(candidate.permanentId);
          spent += candidate.dp;
        }
      }
      const selectedSnapshots = deletedPermanentSnapshots(ctx, selected);
      const deleted = selected.length > 0 ? await ctx.fx.deletePermanent(selected) : 0;
      ctx.lastDeleteCount = deleted;
      // `selected` is the ATTEMPTED set; deletePermanent silently no-ops entries a
      // reaction (Evade/Barrier/leave-prevention) survived, so it does not equal what
      // was actually removed. `scaleFactor`'s `deletedByThisEffect` branch scales by
      // this list (KB CAP-A3 "for each deleted this way"), so it must be the ACTUAL
      // survivors only (engine-audit finding 7) — derive it by checking which
      // permanentIds are gone from the board post-delete, the same signal deletePermanent
      // itself uses internally (there is no id-level return from the primitive, only a count).
      ctx.lastDeletedByThisEffectIds =
        deleted > 0 ? selected.filter((id) => ctx.game.permanentById(id) === undefined) : [];
      const actuallyDeletedSet = new Set(ctx.lastDeletedByThisEffectIds);
      ctx.lastDeletedPermanentSnapshots = selectedSnapshots.filter(({ permanentId }) =>
        actuallyDeletedSet.has(permanentId),
      );
      return false;
    }
    case "AddToDPDeleteBudget": {
      // Inherited [All Turns] modifier (BT19-011): stack a DP-deletion-budget bonus on the
      // source permanent so any subsequent DeleteByDPBudget in the same resolution adds it.
      const perm = ctx.source.permanent();
      if (perm !== undefined) {
        ctx.fx.addDpDeleteBudget?.(perm.permanentId, action.amount);
      }
      return false;
    }
    case "Trash": {
      if (Array.isArray(action.target.filter.zone)) {
        const zones = action.target.filter.zone;
        if (zones.every((zone) => zone === "hand" || zone === "security")) {
          const asker = action.chooser === "opponent" ? requireOpponentAsk(ctx) : ctx.ask;
          const candidates = candidateLooseInstances(ctx, action.target, zones);
          const seats = seatsForController(ctx, action.target.filter);
          const visible = seats.flatMap((seat) => Array.from(ctx.game.player(seat).hand, (card) => card.instanceId));
          const chosen = await pickLoose(ctx, action.target, candidates, undefined, asker, visible);
          for (const seat of seats) {
            const securityIds = chosen.filter((id) =>
              Array.from(ctx.game.player(seat).security).some((card) => card.instanceId === id),
            );
            if (securityIds.length > 0) {
              await ctx.fx.trashFromSecurity(seat, securityIds.length, { instanceIds: securityIds });
            }
            const handIds = chosen.filter((id) =>
              Array.from(ctx.game.player(seat).hand).some((card) => card.instanceId === id),
            );
            if (handIds.length > 0) {
              await ctx.fx.trash(handIds, { byEffectSeat: ctx.source.ownerSeat });
            }
          }
          return false;
        }
      }
      // A hand-zone target is a discard ("trash N card(s) in your/their hand"): resolve
      // loose hand cards and trash the chosen ones. Otherwise it is a field trash (the
      // resolved permanents' top cards).
      if (action.target.filter.zone === "hand") {
        // "your opponent trashes 1 card in their hand" sets chooser: "opponent" — the OWNER
        // of the hand picks their own discard, routed through requireOpponentAsk rather than
        // the controller's ctx.ask (see TrashAction.chooser doc comment). Default/absent
        // (the controller reaching into a hand, e.g. "trash 1 of your opponent's cards in
        // their hand") is unchanged.
        const asker = action.chooser === "opponent" ? requireOpponentAsk(ctx) : ctx.ask;
        const passage = action.effectTextPart?.trim();
        const continuationCandidates = candidateLooseInstances(ctx, action.target, ["hand"]);
        let discardCount = continuationCandidates.length;
        if (typeof action.target.count === "number") {
          discardCount = action.target.count;
        }
        if (action.target.untilHandSize !== undefined) {
          discardCount = Math.max(0, continuationCandidates.length - action.target.untilHandSize);
        }
        if (
          action.chooser === "opponent" &&
          action.optional !== true &&
          passage !== undefined &&
          /^Then,\s/i.test(passage) &&
          (ctx.activeEffectText?.indexOf(passage) ?? -1) > 0 &&
          continuationCandidates.length > 0 &&
          discardCount > 0
        ) {
          ctx.fx.announceEffectClauseAdvanced?.(ctx, passage);
        }
        // Only an explicit printed look/search permission exposes an opponent hand.
        // Blind selections take precedence and keep their opaque handles.
        const visible =
          action.blind === true
            ? []
            : action.revealHand === true
              ? candidateLooseInstances(ctx, action.target, ["hand"]).map((card) => card.instanceId)
              : undefined;
        let chosen: string[];
        if (action.target.untilHandSize !== undefined) {
          // "Trash cards from your hand until you have untilHandSize left" (BT20-077).
          // Compute how many must leave; player selects them. (CAP-E12)
          const handSeat = seatsForController(ctx, action.target.filter)[0] ?? ctx.source.ownerSeat;
          const handSize = ctx.game.player(handSeat).hand.length;
          const toTrash = Math.max(0, handSize - action.target.untilHandSize);
          if (toTrash === 0) {
            chosen = [];
          } else {
            const untilCandidates = candidateLooseInstances(ctx, { ...action.target, count: toTrash }, ["hand"]);
            chosen = await pickLoose(
              ctx,
              { ...action.target, count: toTrash },
              untilCandidates,
              undefined,
              asker,
              visible,
            );
          }
        } else {
          const candidates = candidateLooseInstances(ctx, action.target, ["hand"]);
          chosen = await pickLoose(
            ctx,
            action.optional === true ? { ...action.target, upTo: true } : action.target,
            candidates,
            undefined,
            asker,
            visible,
          );
        }
        const movedResult = chosen.length > 0 ? await ctx.fx.trash(chosen, { byEffectSeat: ctx.source.ownerSeat }) : [];
        // Production returns the moved instances. Lightweight behavioral seams may only
        // acknowledge the operation by resolving undefined after recording it; selection is
        // still the best available proof of the number acted on in that contract.
        const moved = movedResult ?? [];
        const movedCount = movedResult === undefined ? chosen.length : moved.length;
        // An opponent-directed optional hand trash is the printed "opponent may trash"
        // choice (BT13-102). Preserve the opponent's decline for a following conditional
        // reward even when the up-to selection is answered with zero cards.
        if (action.chooser === "opponent" && action.optional === true) {
          ctx.lastOpponentDeclined = chosen.length === 0 || movedCount === 0;
        }
        ctx.lastTrashedCards = moved.map((card) => ({
          instanceId: card.instanceId,
          cardId: card.cardId,
          dp: ctx.game.definitionOf(card).dp ?? 0,
        }));
        // Bind the branch-acted result so an "if you did" tail (BT16-094 OR-modal) can gate.
        ctx.lastEffectActed = movedCount > 0;
        // Store actual trash count under the named key for downstream scaling. (CAP-E12/E13)
        if (action.trackCount !== undefined) {
          if (ctx.namedCounts === undefined) ctx.namedCounts = new Map();
          ctx.namedCounts.set(action.trackCount, movedCount);
        }
        if (action.bindResultAs !== undefined) {
          if (ctx.boundPlayed === undefined) ctx.boundPlayed = new Map();
          ctx.boundPlayed.set(action.bindResultAs, new Set(moved.map((card) => card.instanceId)));
        }
        // A selected card that a restriction/replacement kept in hand did not pay a
        // printed "by trashing" gate. Abort the dependent tail just like an explicit
        // decline; candidate selection alone is never proof that the cost was paid.
        return action.abortOnDecline === true && (chosen.length === 0 || movedCount !== chosen.length);
      }
      // Security-zone trash ("trash the top security card", BT20-080 onDeletion body).
      // Security cards are loose card instances, not battle-area permanents, so
      // resolvePermanentTargets would find nothing. Route through trashFromSecurity instead.
      if (action.target.filter.zone === "security") {
        const seat =
          action.target.filter.controller === "opponent"
            ? ctx.game.opponentOf(ctx.source.ownerSeat)
            : ctx.source.ownerSeat;
        const n =
          action.target.count === "all" ? ctx.game.player(seat).security.length : action.target.count * (scale ?? 1);
        if (n <= 0 || ctx.game.player(seat).security.length < n) return false;
        if (action.target.filter.position === undefined) {
          const candidates = candidateLooseInstances(ctx, action.target, ["security"]);
          const chosen = await pickLoose(
            ctx,
            action.optional === true ? { ...action.target, upTo: true } : action.target,
            candidates,
          );
          if (chosen.length > 0) await ctx.fx.trashFromSecurity(seat, chosen.length, { instanceIds: chosen });
          return false;
        }
        const isBottom = action.target.filter.position === "bottom";
        await ctx.fx.trashFromSecurity(seat, n, { fromTop: !isBottom });
        return false;
      }
      if (action.target.filter.zone === "deck") {
        const seat =
          action.target.filter.controller === "opponent"
            ? ctx.game.opponentOf(ctx.source.ownerSeat)
            : ctx.source.ownerSeat;
        const deck = ctx.game.player(seat).deck;
        const n = action.target.count === "all" ? deck.length : action.target.count * (scale ?? 1);
        const topCards = deck.slice(0, n);
        const topIds = topCards.map((card) => card.instanceId);
        if (topIds.length > 0) {
          await ctx.fx.trash(topIds, { byEffectSeat: ctx.source.ownerSeat });
          await ctx.fx.fireOnDiscardLibrary(seat, topIds);
          for (const card of topCards) {
            await ctx.fx.fireWhenTrashedFromDeck(card.cardId, card.instanceId, ctx.source.cardId);
          }
        }
        ctx.lastEffectActed = topIds.length > 0;
        return false;
      }
      if (action.target.filter.zone === "digivolutionCards") {
        let candidates = candidateLooseInstances(ctx, action.target, ["digivolutionCards"]);
        let chooser = ctx.ask;
        const designatedHostId = designatedDigivolutionHost(ctx, action.target);
        if (designatedHostId !== undefined) {
          const redirect = await redirectDigivolutionTrash(ctx, [designatedHostId]);
          const hostId = redirect.hostPermanentIds[0];
          if (hostId !== designatedHostId) {
            chooser = redirect.chooser;
            const { hostFilter: _hostFilter, isSelfRef: _isSelfRef, ...cardFilter } = action.target.filter;
            candidates = candidateLooseInstances(
              ctx,
              { ...action.target, filter: { ...cardFilter, controller: "any" } },
              ["digivolutionCards"],
            ).filter((candidate) => candidate.hostPermanentId === hostId);
          }
        }
        const chosen = await pickLoose(ctx, action.target, candidates, undefined, chooser);
        // Per-host stack trash, not the generic verb: only it fires the trashed cards'
        // "when trashed from digivolution cards" triggers (EX7-071, P-180).
        const chosenByHost = new Map<string, string[]>();
        for (const instanceId of chosen) {
          const hostPermanentId = candidates.find((candidate) => candidate.instanceId === instanceId)?.hostPermanentId;
          if (hostPermanentId === undefined) continue;
          chosenByHost.set(hostPermanentId, [...(chosenByHost.get(hostPermanentId) ?? []), instanceId]);
        }
        for (const [hostPermanentId, instanceIds] of chosenByHost) {
          await ctx.fx.trashDigivolutionCards(hostPermanentId, instanceIds, {
            byEffectSeat: ctx.source.ownerSeat,
            byEffectCardId: ctx.source.cardId,
          });
        }
        ctx.lastEffectActed = chosen.length > 0;
        // A "by trashing N" condition trashes as many as it can but is met only by all N (Q2006).
        const required = action.target.upTo === true ? undefined : action.target.count;
        return action.abortOnDecline === true && typeof required === "number" && chosen.length < required;
      }
      const permanentIds = await resolvePermanentTargets(ctx, action.target);
      if (action.returnDigivolutionCardsFirst) {
        await returnDigivolutionCardsFirst(ctx, action, permanentIds);
      }
      // `topCardOnly`: "trash the TOP CARD of 1 of your Digimon" (BT8-110). The `trash` verb
      // below moves loose cards, and a permanent's top card is not loose — it would be skipped
      // in silence. `armorPurge` is the move this wording describes: the top card goes to
      // trash and the digivolution card beneath is promoted (CR §16-19-1). With nothing
      // beneath it, the permanent has no "stacked card" to trash and the action does nothing.
      if (action.target.topCardOnly === true) {
        let acted = false;
        for (const permanentId of permanentIds) {
          const permanent = ctx.game.permanentById(permanentId);
          if (permanent === undefined || permanent.stack.length === 0) continue;
          const trashed = await ctx.fx.armorPurge?.(permanentId);
          if (trashed !== undefined) acted = true;
        }
        ctx.lastEffectActed = acted;
        return false;
      }
      // A field-scoped Trash action names a card in a permanent's stack (the IR uses the
      // dedicated TrashDigivolution verb when the wording is explicit, but older generated
      // records encode the same operation as Trash against a Digimon target). The permanent's
      // top card is not a loose card and must never be passed to the generic trash primitive,
      // except an Option permanent, which the trash verb removes whole (CR 4-16-3: not a deletion).
      const ids: string[] = [];
      const options: Permanent[] = [];
      for (const permanentId of permanentIds) {
        const permanent = ctx.game.permanentById(permanentId);
        const top = permanent?.topCard;
        if (permanent !== undefined && top !== undefined) {
          if (isOptionPermanent(ctx, permanent)) {
            options.push(permanent);
            continue;
          }
          const kinds = ctx.game.definitionOf(top).kinds;
          if (kinds.includes(CardKind.Option) || kinds.includes(CardKind.Tamer)) {
            await ctx.fx.deletePermanent([permanentId]);
            continue;
          }
        }
        const source = permanent?.stack.at(-1);
        if (source !== undefined) ids.push(source.instanceId);
      }
      await trashOptionPermanents(ctx, options);
      if (ids.length > 0) await ctx.fx.trash(ids, { byEffectSeat: ctx.source.ownerSeat });
      return false;
    }
    case "Return": {
      const scaledTarget =
        action.scaling !== undefined &&
        action.scaling.levelCeilingAdd === undefined &&
        typeof action.target.count === "number"
          ? { ...action.target, count: action.target.count * scaleFactor(ctx, action.scaling) }
          : action.target;
      let returnTarget = scaledTarget;
      if (action.dpCeilingScaling && returnTarget.filter.dp?.value !== undefined) {
        returnTarget = {
          ...returnTarget,
          filter: {
            ...returnTarget.filter,
            dp: {
              ...returnTarget.filter.dp,
              value:
                returnTarget.filter.dp.value +
                scaleFactor(ctx, action.dpCeilingScaling) * action.dpCeilingScaling.amount,
            },
          },
        };
      }
      if (action.scaling?.levelCeilingAdd !== undefined && returnTarget.filter.levelComparison?.value !== undefined) {
        returnTarget = {
          ...returnTarget,
          filter: {
            ...returnTarget.filter,
            levelComparison: {
              ...returnTarget.filter.levelComparison,
              value:
                returnTarget.filter.levelComparison.value +
                scaleFactor(ctx, action.scaling) * action.scaling.levelCeilingAdd,
            },
          },
        };
      }
      if (action.playCostCeiling !== undefined) {
        returnTarget = {
          ...returnTarget,
          filter: {
            ...returnTarget.filter,
            playCostLte:
              action.playCostCeiling.base +
              Math.floor(
                scaleFactor(ctx, {
                  per: action.playCostCeiling.per,
                  filter: action.playCostCeiling.filter,
                  unit: action.playCostCeiling.unit,
                }),
              ) *
                action.playCostCeiling.raise,
          },
        };
      }
      // Security effects such as BT10-109 encode "add this card to its owner's hand"
      // as Return(isSelfRef). The source is a loose security card, so it has no
      // permanent for resolvePermanentTargets to find.
      if (action.from?.includes("digivolutionCards")) {
        const candidates = returnableDigivolutionCards(ctx, returnTarget);
        if (candidates.length === 0) {
          ctx.lastEffectActed = false;
          return false;
        }
        const picked =
          candidates.length === 1
            ? [candidates[0]!.instanceId]
            : await ctx.ask.selectCards(ctx, {
                candidates: candidates.map((card) => card.instanceId),
                min: 1,
                max: 1,
                visibleCards: candidates.map((card) => ({ instanceId: card.instanceId, cardId: card.cardId })),
              });
        if (picked.length === 0) {
          ctx.lastEffectActed = false;
          return false;
        }
        const pickedCard = candidates.find((card) => card.instanceId === picked[0]);
        const moved =
          action.to === "hand"
            ? await ctx.fx.returnToHand(picked)
            : await ctx.fx.returnToDeck(picked, { toTop: action.to === "deckTop" });
        ctx.lastEffectActed = moved.length > 0;
        const level = pickedCard === undefined ? undefined : ctx.game.definitionOf(pickedCard).level;
        if (action.storeAs !== undefined && level !== undefined) {
          ctx.namedCounts ??= new Map();
          ctx.namedCounts.set(action.storeAs, level);
        }
        if (action.bindResultAs !== undefined) {
          ctx.boundPlayed ??= new Map();
          ctx.boundPlayed.set(action.bindResultAs, new Set(moved.map((card) => card.instanceId)));
        }
        return false;
      }
      if (returnTarget.isSelf || returnTarget.filter.isSelfRef) {
        if (
          action.from !== undefined &&
          !candidateLooseInstances(ctx, returnTarget, action.from).some(
            (candidate) => candidate.instanceId === ctx.source.instanceId,
          )
        ) {
          ctx.lastEffectActed = false;
          return action.abortOnDecline === true;
        }
        const moved =
          action.to === "hand"
            ? await ctx.fx.returnToHand([ctx.source.instanceId])
            : await ctx.fx.returnToDeck([ctx.source.instanceId], { toTop: action.to === "deckTop" });
        ctx.lastEffectActed = moved.length > 0;
        return action.abortOnDecline === true && moved.length === 0;
      }
      if (returnTarget.totalPlayCostBudget !== undefined) {
        const ids = topInstanceIds(ctx, await resolveTotalPlayCostBudgetTargets(ctx, returnTarget));
        if (ids.length === 0) {
          ctx.lastEffectActed = false;
          return false;
        }
        const moved =
          action.to === "hand"
            ? await ctx.fx.returnToHand(ids)
            : await ctx.fx.returnToDeck(ids, { toTop: action.to === "deckTop" });
        ctx.lastEffectActed = moved.length > 0;
        return false;
      }
      let returnPermanentIds: string[] | undefined;
      if (action.returnDigivolutionCardsFirst) {
        returnPermanentIds = await resolvePermanentTargets(ctx, returnTarget);
        await returnDigivolutionCardsFirst(ctx, action, returnPermanentIds);
      }
      // A non-battle-area zone target ("return 1 [X] from your trash/hand/security/... to
      // your hand", BT1-011) sources a LOOSE card instance, not a battle-area permanent —
      // resolvePermanentTargets only scans battleArea and would always find zero candidates,
      // silently no-opping the whole effect. Route through the same loose-instance resolution
      // the "Trash" case already uses for its hand-zone branch.
      const zone = returnTarget.filter.zone;
      const looseZones = action.from ?? (zone !== undefined && zone !== "battleArea" ? zoneList(zone) : undefined);
      if (looseZones !== undefined) {
        const candidates = candidateLooseInstances(ctx, returnTarget, looseZones);
        const visibleZoneIds =
          looseZones.length === 1 && (looseZones[0] === "trash" || looseZones[0] === "hand")
            ? seatsForController(ctx, returnTarget.filter).flatMap((seat) =>
                looseCardsInZone(ctx, seat, looseZones[0]!).map((candidate) => candidate.instanceId),
              )
            : undefined;
        const chosen = await pickLoose(ctx, returnTarget, candidates, undefined, ctx.ask, visibleZoneIds);
        if (chosen.length === 0) {
          ctx.lastEffectActed = false;
          if (action.trackCount !== undefined) {
            if (ctx.namedCounts === undefined) ctx.namedCounts = new Map();
            ctx.namedCounts.set(action.trackCount, 0);
          }
          if (action.bindResultAs) {
            ctx.boundPlayed ??= new Map();
            ctx.boundPlayed.set(action.bindResultAs, new Set());
          }
          return false;
        }
        if (action.to === "hand" || action.to === "deckTop" || action.to === "deckBottom")
          revealPrivateRequirementPicks(ctx, returnTarget, candidates, chosen);
        let ordered = chosen;
        if (action.order === "any" && chosen.length > 1) {
          ordered =
            (await ctx.ask.orderCards?.(ctx, {
              candidates: chosen,
              visibleCards: candidates
                .filter((candidate) => chosen.includes(candidate.instanceId))
                .map((candidate) => ({
                  instanceId: candidate.instanceId,
                  cardId: candidate.cardId,
                })),
              destination: action.to === "deckTop" ? "deckTop" : "deckBottom",
            })) ?? chosen;
        }
        const moved =
          action.to === "hand"
            ? await ctx.fx.returnToHand(ordered)
            : await ctx.fx.returnToDeck(action.to === "deckTop" ? [...ordered].reverse() : ordered, {
                toTop: action.to === "deckTop",
              });
        ctx.lastEffectActed = moved.length > 0;
        if (action.bindResultAs) {
          ctx.boundPlayed ??= new Map();
          ctx.boundPlayed.set(action.bindResultAs, new Set(moved.map((card) => card.instanceId)));
          if (moved.length > 0) {
            ctx.selections ??= new Map();
            ctx.selections.set(action.bindResultAs, moved[0]!.instanceId);
          }
        }
        if (action.trackCount !== undefined) {
          if (ctx.namedCounts === undefined) ctx.namedCounts = new Map();
          ctx.namedCounts.set(action.trackCount, moved.length);
        }
        return false;
      }
      let ids = topInstanceIds(ctx, returnPermanentIds ?? (await resolvePermanentTargets(ctx, returnTarget)));
      // A played card can become a source of a new DNA permanent before a delayed
      // return resolves. Its former permanent id is gone, but its instance id survives.
      if (ids.length === 0 && returnTarget.filter.boundRef !== undefined) {
        const boundInstances = ctx.boundCardInstances?.get(returnTarget.filter.boundRef);
        if (boundInstances !== undefined) {
          ids = Array.from(ctx.game.state.players).flatMap((player) =>
            Array.from(player.battleArea).flatMap((permanent) =>
              Array.from(permanent.stack)
                .filter((card) => boundInstances.has(card.instanceId))
                .map((card) => card.instanceId),
            ),
          );
        }
      }
      if (ids.length === 0) {
        ctx.lastEffectActed = false;
        if (action.trackCount !== undefined) {
          if (ctx.namedCounts === undefined) ctx.namedCounts = new Map();
          ctx.namedCounts.set(action.trackCount, 0);
        }
        if (action.bindResultAs) {
          ctx.boundPlayed ??= new Map();
          ctx.boundPlayed.set(action.bindResultAs, new Set());
        }
        return false;
      }
      if (action.order === "any" && ids.length > 1) {
        ids =
          (await ctx.ask.orderCards?.(ctx, {
            candidates: ids,
            destination: action.to === "deckTop" ? "deckTop" : "deckBottom",
          })) ?? ids;
      }
      if (action.storeAs !== undefined) {
        let selected: Permanent | undefined;
        for (const player of ctx.game.state.players) {
          selected = player.battleArea.find((permanent) => permanent.topCard?.instanceId === ids[0]);
          if (selected !== undefined) break;
        }
        const level = selected?.topCard === undefined ? undefined : ctx.game.definitionOf(selected.topCard).level;
        if (level !== undefined) {
          ctx.namedCounts ??= new Map();
          ctx.namedCounts.set(action.storeAs, level);
        }
      }
      const movedResult =
        action.to === "hand"
          ? await ctx.fx.returnToHand(ids)
          : await ctx.fx.returnToDeck(action.to === "deckTop" ? [...ids].reverse() : ids, {
              toTop: action.to === "deckTop",
            });
      const moved = movedResult ?? [];
      ctx.lastEffectActed = movedResult === undefined ? ids.length > 0 : moved.length > 0;
      if (action.bindResultAs) {
        ctx.boundPlayed ??= new Map();
        ctx.boundPlayed.set(action.bindResultAs, new Set(moved.map((card) => card.instanceId)));
      }
      if (action.trackCount !== undefined) {
        if (ctx.namedCounts === undefined) ctx.namedCounts = new Map();
        ctx.namedCounts.set(action.trackCount, moved.length);
      }
      return false;
    }
    case "ReturnToEggDeck": {
      const zones =
        action.from ?? (action.target.filter.zone !== undefined ? zoneList(action.target.filter.zone) : ["trash"]);
      const candidates = candidateLooseInstances(ctx, action.target, zones);
      const count = action.target.count === "all" ? candidates.length : (action.target.count ?? 1);
      if (count <= 0 || candidates.length < count || ctx.fx.returnToEggDeck === undefined) return false;
      const chosen = await pickLoose(ctx, { ...action.target, count }, candidates);
      if (chosen.length !== count) return false;
      await ctx.fx.returnToEggDeck(chosen);
      return false;
    }
    case "DeletionMaxDpModifier": {
      // Producer side of the DP-deletion-maximum subsystem: record a continuous bonus the
      // Delete branch reads. Self-scoped to this source permanent, or owner-wide by seat.
      if (action.scope === "self") {
        const self = ctx.source.permanent();
        if (self !== undefined)
          ctx.fx.addDeletionMaxDp?.({ permanentId: self.permanentId }, action.amount * (scope.scale ?? 1));
      } else {
        ctx.fx.addDeletionMaxDp?.({ seat: ctx.source.ownerSeat }, action.amount * (scope.scale ?? 1));
      }
      return false;
    }
    case "DelayedDelete": {
      // "At the next end of your opponent's turn, delete it" after a PlayWithoutCost branch.
      // The target is the permanent(s) just created by the prior play action in this same
      // effect resolution, not the card currently resolving the effect.
      const playedIds = ctx.lastPlayedPermanentIds ?? [];
      const permanentIds =
        playedIds.length > 0 && (action.target === undefined || action.target.isSelf || action.target.filter?.isSelfRef)
          ? playedIds
          : action.target === undefined
            ? []
            : await resolvePermanentTargets(ctx, action.target);
      for (const permanentId of permanentIds) {
        if (action.timing === "endOfOpponentTurn") {
          ctx.fx.delayedDeletePlayed?.(permanentId, "endOfOpponentTurn", ctx.source.cardId);
        } else {
          ctx.fx.delayedDeletePlayed?.(permanentId, "endOfOwnerTurn", ctx.source.cardId);
        }
      }
      return false;
    }
    case "DelayedDeletePlayed": {
      // EX10-035: "at turn end, delete the Digimon this effect played." The played permanent is
      // deletes it at the owner's turn end, expiring at that same boundary.
      const playedIds = ctx.lastPlayedPermanentIds ?? [];
      if (playedIds.length > 0) {
        for (const permanentId of playedIds)
          ctx.fx.delayedDeletePlayed?.(
            permanentId,
            action.timing === "endOfCurrentTurn"
              ? "endOfCurrentTurn"
              : action.timing === "endOfOpponentTurn"
                ? "endOfOpponentTurn"
                : "endOfOwnerTurn",
            ctx.source.cardId,
          );
      }
      return false;
    }
    default:
      // Unreachable: runAction routes only this family's kinds here, and its own default
      // reports anything the Action union does not cover.
      return false;
  }
}
