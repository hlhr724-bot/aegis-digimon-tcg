import { createTrackedPermanentFilterMatch } from "#api/engine/effects/interpreter/matching/createTrackedPermanentFilterMatch";
import { createTrackedTamerAsDigimonMatch } from "#api/engine/effects/interpreter/matching/createTrackedTamerAsDigimonMatch";
import { createTrackedNoPermanentMatch } from "#api/engine/effects/interpreter/matching/createTrackedNoPermanentMatch";
import { getFieldEffectText } from "#api/engine/effects/interpreter/getFieldEffectText";
// Continuous prohibitions and immunities.

import type { EffectContext, Restriction } from "../../EffectContext.js";
import type { ActionScope } from "../dispatch.js";
import { toDuration } from "../duration.js";
import { KIND_MAP } from "../maps.js";
import { definitionMatches } from "../matching/definition.js";
import { permanentMatchesFilter, seatsForController } from "../matching/permanent.js";
import { resolvePermanentTargets } from "../targeting/permanents.js";
import { candidateLooseInstances } from "../targeting/loose.js";
import { evaluateCondition } from "../conditions.js";
import { unsupported } from "../errors.js";
import { extractCardById, insertCard } from "../../../state/access.js";
import { Zone } from "@aegis/shared";
import type { Action, Seat } from "@aegis/shared";
import { subscribeLaterEntrants } from "./laterEntrants.js";

export async function runRestrictionAction(ctx: EffectContext, action: Action, scope: ActionScope): Promise<boolean> {
  switch (action.kind) {
    case "DeclareCategoryImmunity": {
      const categories = ["Digimon", "Tamer", "Option", "DigiEgg"] as const;
      const categoryIndex = await ctx.ask.chooseOption(
        ctx,
        categories.map((category) => `Declare category: ${category}`),
      );
      const category = categories[categoryIndex] ?? categories[0];
      const opponent = ctx.game.opponentOf(ctx.source.ownerSeat);
      const [revealed] = await ctx.fx.reveal(opponent, 1, ctx.source.cardId);
      if (revealed === undefined) return false;
      if (ctx.game.definitionOf(revealed).kinds.includes(KIND_MAP[category])) {
        const ids = await resolvePermanentTargets(ctx, action.target);
        for (const id of ids) {
          ctx.fx.restrict(id, "beAffected", toDuration(action.duration), { fromSourceKind: [category] });
        }
      }
      const returnChoice = await ctx.ask.chooseOption(ctx, [
        "Return to the top of the deck",
        "Return to the bottom of the deck",
      ]);
      revealed.faceUp = false;
      if (returnChoice !== 0) {
        const deck = ctx.game.player(opponent).deck;
        const index = deck.findIndex((card) => card.instanceId === revealed.instanceId);
        if (index >= 0) {
          const returned = extractCardById(ctx.game.player(opponent), Zone.Deck, revealed.instanceId);
          if (returned !== undefined) insertCard(ctx.game.player(opponent), Zone.Deck, returned, "bottom");
        }
      }
      return false;
    }
    case "Restrict": {
      if (action.target === undefined) return false;
      const gate = action.while ?? action.condition;
      if (gate !== undefined && !evaluateCondition(ctx, gate)) return false;
      const duration = toDuration(action.duration);
      const continuous = action.while !== undefined ? true : undefined;
      const scaledTarget =
        scope.scale !== undefined && typeof action.target.count === "number"
          ? { ...action.target, count: action.target.count * scope.scale }
          : action.target;
      const filter = scaledTarget.filter;
      const dynamicTargetFilter =
        (action as typeof action & { whileMatchesTargetFilter?: boolean }).whileMatchesTargetFilter === true ||
        // A continuous source-relative restriction is inherently live: "all opponent Digimon
        // with as many or fewer digivolution cards as this Digimon" must reopen when either
        // stack changes.  The compiler's permanent Restrict shape predates the explicit
        // whileMatchesTargetFilter marker, so infer only this unambiguous all-target form and
        // route it through the existing player-scoped predicate ledger.
        (ctx.continuousPass === true &&
          scaledTarget.count === "all" &&
          filter?.digivolutionCardsCompareToSource !== undefined);
      const restriction = (
        action.restriction === "returnToHandOrDeck" || action.restriction === "cannotReturnToHandOrDeck"
          ? "beReturned"
          : action.restriction === "suspend"
            ? "beSuspended"
            : action.restriction
      ) as Restriction;
      const blocksCombatSuspend = action.restriction === "suspend" && action.blocksCombatSuspend === true;
      const sourceKinds = (ctx.effectSourceKinds ?? ctx.source.definition.kinds).filter(
        (kind) => kind === "Digimon" || kind === "Option",
      );
      // KB Q1157: "Digimon can't digivolve" also stops a Tamer digivolving as if it is a Digimon.
      // That Tamer is not a Digimon on the board, so it is matched as its "as if" Digimon only
      // when it attempts the digivolution.
      const locksTamersAsDigimon =
        restriction === "digivolve" && scaledTarget.count === "all" && filter?.kind?.includes("Digimon") === true;
      const matchesAsDigimon = (seat: Seat, dynamic: boolean) =>
        createTrackedTamerAsDigimonMatch({
          ctx,
          filter,
          sourceKinds,
          present:
            dynamic || ctx.continuousPass === true
              ? undefined
              : new Set(ctx.game.player(seat).battleArea.map(({ permanentId }) => permanentId)),
        });
      // Card IR spells this immunity using the printed-action vocabulary, while the engine's
      // legality layer consumes the normalized `beReturned` restriction for both hand and deck.
      // A deprecated kind has no consumer, so recording it would be a silent no-op. Drop it
      // here instead: `restrict()` no longer accepts one, and the ~32 IR records still
      // carrying `activateEffects` are superseded by the disableSecurityEffect /
      // disableTimingEffect verbs.
      if (restriction === "activateEffects") return false;
      if (restriction === "beTrashed" && filter.zone === "digivolutionCards") {
        const cards = candidateLooseInstances(ctx, scaledTarget, ["digivolutionCards"]);
        for (const card of cards) ctx.fx.stackCardTrashLock?.(card.instanceId, card.ownerSeat, duration);
        return false;
      }
      if (
        dynamicTargetFilter &&
        scaledTarget.count === "all" &&
        ctx.fx.restrictPlayer !== undefined &&
        filter !== undefined
      ) {
        for (const seat of seatsForController(ctx, filter)) {
          ctx.fx.restrictPlayer(
            seat,
            restriction,
            duration,
            createTrackedPermanentFilterMatch({ ctx, filter, sourceKinds }),
            {
              sourceCardId: ctx.source.definition.cardId,
              effectText: getFieldEffectText({ action, ctx }),
              ...(locksTamersAsDigimon ? { matchesAsDigimon: matchesAsDigimon(seat, true) } : {}),
              fromSourceKind: action.fromSourceKind as string[] | undefined,
              byOpponentEffectsOnly: action.byOpponentEffectsOnly === true ? true : undefined,
              byEffectsOnly: action.byEffectsOnly === true ? true : undefined,
            },
          );
        }
        return false;
      }
      if (locksTamersAsDigimon && ctx.fx.restrictPlayer !== undefined) {
        for (const seat of seatsForController(ctx, filter)) {
          ctx.fx.restrictPlayer(seat, restriction, duration, createTrackedNoPermanentMatch(ctx), {
            sourceCardId: ctx.source.definition.cardId,
            effectText: getFieldEffectText({ action, ctx }),
            fromSourceKind: action.fromSourceKind as string[] | undefined,
            byOpponentEffectsOnly: action.byOpponentEffectsOnly === true ? true : undefined,
            byEffectsOnly: action.byEffectsOnly === true ? true : undefined,
            matchesAsDigimon: matchesAsDigimon(seat, false),
          });
        }
      }
      // Restrictions are continuous state. An immune permanent is still a legal chosen target;
      // preserve it so the restriction becomes effective when that immunity ends (Q831/Q2120).
      const ids = await resolvePermanentTargets(ctx, scaledTarget, { preserveUnaffectableSelection: true });
      // Target-scoped prohibition (BT10-042): affected Digimon can't attack THIS source,
      // but may still attack the player or a different Digimon. A plain `attack`
      // restriction would incorrectly suppress the entire declaration.
      if ((action as typeof action & { specificTarget?: string }).specificTarget === "source") {
        const sourcePermanentId = ctx.source.permanent()?.permanentId;
        if (sourcePermanentId !== undefined) {
          for (const id of ids) ctx.fx.restrictAttackTarget(id, sourcePermanentId, duration);
        }
        return false;
      }
      if ((action.restriction as string) === "attackOrBlock") {
        for (const id of ids) {
          ctx.fx.restrict(id, "attack", duration, { continuous });
          ctx.fx.restrict(id, "block", duration, { continuous });
        }
        return false;
      }
      const fromSourceKind = action.fromSourceKind as string[] | undefined;
      const byOpponentEffectsOnly = action.byOpponentEffectsOnly === true ? true : undefined;
      const byEffectsOnly = action.byEffectsOnly === true ? true : undefined;
      for (const id of ids) {
        ctx.fx.restrict(id, restriction, duration, {
          fromSourceKind,
          byOpponentEffectsOnly,
          byEffectsOnly,
          continuous,
        });
        if (blocksCombatSuspend) {
          ctx.fx.restrict(id, "suspend", duration, {
            fromSourceKind,
            byOpponentEffectsOnly,
            byEffectsOnly,
            continuous,
          });
        }
      }
      return false;
    }
    case "RestrictUnsuspendedDigivolve": {
      const seat = action.seat === "opponent" ? ctx.game.opponentOf(ctx.source.ownerSeat) : ctx.source.ownerSeat;
      ctx.fx.restrictUnsuspendedDigivolve(seat, ctx.source.ownerSeat, toDuration(action.duration));
      return false;
    }
    case "RestrictDigivolveInto": {
      // EX10-035: "this Digimon can only digivolve into [Apocalymon]". Record a positive
      // digivolve-target constraint on the resolved target(s) carrying the allowed into-filter;
      // digivolve-legality (validateDigivolve) rejects any other evolving card onto them.
      const ids = await resolvePermanentTargets(ctx, action.target);
      const duration = toDuration(action.duration);
      const into = action.into;
      for (const id of ids) {
        ctx.fx.restrictDigivolveInto?.(id, (def) => definitionMatches(into, def), duration);
      }
      return false;
    }
    case "MinDpFloor": {
      // EX11-070 [All Turns]: "this Digimon can't have less than 1000 DP". A persistent floor on
      // the resolved target(s) (the inherited-effect host), applied in the DP-calc layer AFTER all
      // +/- changes (KB Q5941). Re-derived each continuous pass (CR-01).
      const ids = await resolvePermanentTargets(ctx, action.target);
      const duration = toDuration(action.duration);
      for (const id of ids) ctx.fx.minDpFloor?.(id, action.floor, duration);
      return false;
    }
    case "StackTrashLock": {
      // EX11-070 [All Turns]: "your opponent's effects can't trash this Digimon's stacked cards"
      // (KB Q5943). A persistent lock on the resolved target(s) (the inherited-effect host),
      // consulted at the digivolution-card trash sites. Re-derived each continuous pass (CR-01).
      const duration = toDuration(action.duration);
      if (action.includeLaterEntrants === true && coversEveryDigimonOfController(action.target)) {
        for (const seat of seatsForController(ctx, action.target.filter)) ctx.fx.seatStackTrashLock?.(seat, duration);
        return false;
      }
      const ids = await resolvePermanentTargets(ctx, action.target);
      const lock = (id: string): void => ctx.fx.stackTrashLock?.(id, duration);
      for (const id of ids) lock(id);
      if (action.includeLaterEntrants === true) {
        subscribeLaterEntrants(ctx, {
          filter: action.target.filter,
          duration: action.duration,
          label: "StackTrashLock",
          alreadyGranted: ids,
          grant: lock,
        });
      }
      return false;
    }
    case "RestrictMemoryGain": {
      const seats = seatsForController(ctx, { controller: action.seat });
      const duration = toDuration(action.duration);
      for (const seat of seats) ctx.fx.restrictMemoryGain(seat, duration);
      return false;
    }
    case "RestrictCostReduction": {
      const seats = seatsForController(ctx, { controller: action.seat });
      const duration = toDuration(action.duration);
      for (const seat of seats) ctx.fx.restrictCostReduction(seat, action.costType, duration);
      return false;
    }
    case "RestrictPlay": {
      // Seat-level "can't play/move <X>" prohibition. The restricted seat is the source's
      // opponent (action.seat === "opponent"); resolve it via the same seat-scoping helper.
      // The IR Filter narrows to a serializable PlayMatch (kind + DP cap) — the only forms the
      // source CardCondition uses (IsOption / IsDigimon + CardDP <= N).
      const seats = seatsForController(ctx, { controller: action.seat });
      const duration = toDuration(action.duration);
      const match = {
        ...(action.filter.kind ? { kinds: action.filter.kind } : {}),
        ...(action.filter.dpAtMost !== undefined ? { dpAtMost: action.filter.dpAtMost } : {}),
        ...(action.filter.allowTokens === true ? { allowTokens: true } : {}),
        ...(action.filter.zone !== undefined
          ? { fromZones: Array.isArray(action.filter.zone) ? action.filter.zone : [action.filter.zone] }
          : {}),
      };
      for (const seat of seats)
        ctx.fx.restrictPlay(seat, ctx.source.ownerSeat, match, action.mode, duration, action.byEffectOnly, {
          sourceCardId: ctx.source.definition.cardId,
          effectText: getFieldEffectText({ action, ctx }),
        });
      return false;
    }
    case "GlobalRestrict": {
      if (action.restriction === "opponentCannotAddToSecurity") {
        ctx.fx.restrictSecurityAddsFromEffect?.(
          ctx.game.opponentOf(ctx.source.ownerSeat),
          ctx.source.ownerSeat,
          toDuration(action.duration),
        );
      }
      return false;
    }
    case "GrantImmunity": {
      // Store blanket opponent-effect immunity as an unqualified restriction, but preserve
      // the printed source-kind scope for clauses such as "opponent's Digimon effects".
      // The shared action gate has already evaluated `condition` / `while` for this pass.
      const ids = await resolvePermanentTargets(ctx, action.target);
      const duration = toDuration(action.duration);
      const fromSourceKind = action.immuneFrom === "opponentDigimonEffects" ? ["Digimon"] : undefined;
      for (const id of ids) {
        ctx.fx.restrict(id, "beAffected", duration, {
          ...(fromSourceKind === undefined ? {} : { fromSourceKind }),
          byOpponentEffectsOnly: true,
        });
      }
      return false;
    }
    case "ArmSuspendRestriction": {
      // BT23-024: arm the suspend-restriction-with-superlative-exception on THIS source for the
      // stated duration ("until their turn ends" => UntilOpponentTurnEnd). The affected opponent
      // set is recomputed each continuous pass by applySuspendRestrictionRecompute (KB Q5250/Q5252).
      const self = ctx.source.permanent();
      if (self !== undefined) {
        ctx.fx.armSuspendRestrictionSource?.(self.permanentId, toDuration(action.duration ?? "untilOpponentTurnEnd"));
      }
      return false;
    }
    case "DisableTimingEffect": {
      if (action.whileMatchesTargetFilter === true) {
        if (
          action.target.count !== "all" ||
          action.target.filter === undefined ||
          ctx.fx.disableTimingEffectsForPlayer === undefined
        ) {
          unsupported(
            ctx,
            action,
            "Overall timing disable requires all targets, a filter, and the player-scoped primitive",
          );
          return false;
        }
        const filter = action.target.filter;
        for (const seat of seatsForController(ctx, filter)) {
          ctx.fx.disableTimingEffectsForPlayer(seat, action.timings, toDuration(action.duration), (permanentId) => {
            const permanent = ctx.game.permanentById(permanentId);
            return permanent !== undefined && permanentMatchesFilter(ctx, permanent, filter, ctx.source);
          });
        }
        return false;
      }
      // The disable suppresses the masked timing effects of the resolved (opponent) permanents.
      const ids = await resolvePermanentTargets(ctx, action.target);
      const duration = toDuration(action.duration);
      for (const id of ids) ctx.fx.disableTimingEffect(id, action.timings, duration);
      return false;
    }
    default:
      // Unreachable: runAction routes only this family's kinds here, and its own default
      // reports anything the Action union does not cover.
      return false;
  }
}

type StackTrashLockTarget = Extract<Action, { kind: "StackTrashLock" }>["target"];

function coversEveryDigimonOfController(target: StackTrashLockTarget): boolean {
  const { controller, kind, ...narrowing } = target.filter;
  return (
    target.count === "all" &&
    controller !== undefined &&
    kind?.length === 1 &&
    kind[0] === "Digimon" &&
    Object.keys(narrowing).length === 0
  );
}
