// Digivolution, DNA digivolution, App Fusion, DigiXros, and Link.

import type { EffectContext } from "../../EffectContext.js";
import type { ActionScope } from "../dispatch.js";
import { toDuration } from "../duration.js";
import { candidatePermanents, resolvePermanentTargets } from "../targeting/permanents.js";
import { runDigivolve, runDigivolveViaPlacement } from "./digivolve.js";
import { runAppFuse, runDnaDigivolve } from "./dna.js";
import { runLink, runMindLink } from "./link.js";
import { runPlaceUnder, runTrashDigivolution } from "./placeUnder.js";
import { digiXrosZoneExpanderFor } from "@aegis/shared/cards/zoneExpanders";
import { CardKind, type Action, type Target, type ZoneRef } from "@aegis/shared";

function hasDeDigivolvableCandidate(ctx: EffectContext, target: Target, stopAtLevel: number | undefined): boolean {
  const levelFloor = stopAtLevel ?? 3;
  return candidatePermanents(ctx, target).some((permanent) => {
    if (permanent.stack.length === 0 || permanent.topCard === undefined) return false;
    const definition = ctx.game.definitionOf(permanent.topCard);
    const isDigimonOrEgg = definition.kinds.includes(CardKind.Digimon) || definition.kinds.includes(CardKind.DigiEgg);
    return isDigimonOrEgg && (definition.level === undefined || definition.level > levelFloor);
  });
}

export async function runDigivolutionAction(ctx: EffectContext, action: Action, scope: ActionScope): Promise<boolean> {
  const { scale } = scope;
  switch (action.kind) {
    case "DeDigivolve": {
      // Dynamic amount: "＜De-Digivolve 1＞ for each of this Digimon's face-down digivolution
      // cards" (EX9-043). placeUnder marks effect-placed cards face-down, so the count is the
      // source permanent's face-down stack cards at resolution time.
      const amount =
        typeof action.amount === "number"
          ? action.amount
          : (ctx.source.permanent()?.stack.filter((c) => !c.faceUp).length ?? 0);
      const declaredAmount =
        amount > 1
          ? amount -
            (await ctx.ask.chooseOption(
              ctx,
              Array.from({ length: amount }, (_, index) => `${amount - index} card${amount - index === 1 ? "" : "s"}`),
            ))
          : amount;
      // A scaling on DeDigivolve is a repetition count, not one larger peel. BT21-061 Q4568:
      // four Tamer colors perform De-Digivolve 1 twice, with state checked between peels.
      const repeat = scale ?? 1;
      for (let i = 0; i < repeat; i++) {
        let target = action.target;
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
        if (scale !== undefined && !hasDeDigivolvableCandidate(ctx, target, action.stopAtLevel)) break;
        const ids = await resolvePermanentTargets(ctx, target);
        // The trashing effect's seat gates EX11-070's stacked-trash-lock (KB Q5943).
        for (const id of ids)
          await ctx.fx.deDigivolve(id, declaredAmount, {
            byEffectSeat: ctx.source.ownerSeat,
            byEffectCardId: ctx.source.cardId,
            stopAtLevel: action.stopAtLevel,
          });
      }
      if (action.trackOpponentDigimonCountAs !== undefined) {
        const opponent = ctx.game.opponentOf(ctx.source.ownerSeat);
        const count = ctx.game.player(opponent).battleArea.filter((permanent) => {
          const top = permanent.topCard;
          if (top === undefined) return false;
          const kinds = ctx.game.definitionOf(top).kinds;
          return kinds.includes(CardKind.Digimon) || kinds.includes(CardKind.DigiEgg);
        }).length;
        ctx.namedCounts ??= new Map();
        ctx.namedCounts.set(action.trackOpponentDigimonCountAs, count);
      }
      return false;
    }
    case "Digivolve": {
      // A Static Tamer-onto declaration is legality metadata, not an effect-driven
      // digivolution to execute. Historical IR spells it as target+asIf; current IR uses
      // onto+asLevel. Both intentionally omit `into` because the evolving card is THIS card
      // in the player's hand. Recomputing static effects must therefore leave it inert.
      const metadata = action as typeof action & {
        onto?: unknown;
        asLevel?: number;
        asIf?: { level?: number };
      };
      if (
        action.into === undefined &&
        (metadata.onto !== undefined || metadata.asLevel !== undefined || metadata.asIf !== undefined)
      ) {
        return false;
      }
      await runDigivolve(ctx, action);
      return false;
    }
    case "DigivolveViaPlacement": {
      await runDigivolveViaPlacement(ctx, action);
      return false;
    }
    case "DnaDigivolve": {
      await runDnaDigivolve(ctx, action);
      return false;
    }
    case "AppFuse": {
      await runAppFuse(ctx, action);
      return false;
    }
    case "PlaceUnder": {
      await runPlaceUnder(ctx, action);
      return false;
    }
    case "TrashDigivolution": {
      const completed = await runTrashDigivolution(ctx, {
        ...action,
        amount:
          action.amount === "all" || action.scaling?.unit === "targetColors"
            ? action.amount === "all"
              ? "all"
              : (action.amount ?? 1)
            : (action.amount ?? 1) * (scale ?? 1),
      });
      return action.abortOnDecline === true && !completed;
    }
    case "Link": {
      await runLink(ctx, action);
      return false;
    }
    case "GrantLinkCostReduction": {
      // Install a recipient-scoped continuous link-cost reduction (documented behavior rule implementation,
      // documented behavior). The recipient defaults to the source permanent ("to this Digimon");
      // when an explicit target is given it resolves to the chosen friendly Digimon. runLink reads
      // the recipient's grant when a `whenLinkingTrait` card would link to it.
      const ids = await resolvePermanentTargets(ctx, action.target);
      const duration = toDuration(action.duration);
      for (const id of ids) {
        ctx.fx.grantLinkCostReduction(id, action.amount, action.whenLinkingTrait, duration, {
          sourceCardId: ctx.source.cardId,
          sourceInstanceId: ctx.source.instanceId,
          controllerSeat: ctx.source.ownerSeat,
          optional: action.optionalAtDeclaration === true,
          oncePerTurnKey: action.oncePerTurn === true ? `${ctx.source.instanceId}/link-cost-reduction` : undefined,
        });
      }
      return false;
    }
    case "CannotIgnoreDigivolutionRequirements": {
      // Seat-level "players can't ignore digivolution requirements" (documented behavior
      // rule implementation, documented behavior). Affects BOTH seats (KB Q1738). The
      // normal digivolve color-waiver and effect-driven ignore-requirements paths both consult
      // this flag (KB Q1741-Q1742).
      const duration = toDuration(action.duration);
      ctx.fx.cannotIgnoreDigivolution(0, duration);
      ctx.fx.cannotIgnoreDigivolution(1, duration);
      return false;
    }
    case "MindLink": {
      await runMindLink(ctx, action);
      return false;
    }
    case "DigiXrosMaterialZoneExpansion": {
      // BT19-079 / BT19-087: expand DigiXros material source zones at BeforePayCost.
      // Records per-seat zone expansion for `duration`; the DigiXros material-picking
      // code in the play-card path reads it. For v1 the record is the deliverable.
      const duration = toDuration(action.duration);
      if (ctx.trigger?.wouldBePlayedInstanceId === undefined) {
        ctx.fx.expandDigiXrosZones?.(ctx.source.ownerSeat, action.zones, duration);
      } else {
        if (ctx.fx.expandDigiXrosZonesForPlay !== undefined) {
          const expander = digiXrosZoneExpanderFor(ctx.source.cardId);
          const materialLimits: Partial<Record<ZoneRef, number>> | undefined = expander
            ? { underTamers: expander.underTamerMax, trash: expander.trashMax }
            : undefined;
          for (const pendingId of ctx.trigger.wouldBePlayedInstanceIds ?? [ctx.trigger.wouldBePlayedInstanceId]) {
            ctx.fx.expandDigiXrosZonesForPlay(ctx.source.ownerSeat, action.zones, duration, pendingId, materialLimits);
          }
        } else {
          ctx.fx.expandDigiXrosZones?.(ctx.source.ownerSeat, action.zones, duration);
        }
      }
      return false;
    }
    case "AllowDigiXrosMaterialsFromTrash":
      // Declarative marker consumed statically by the DigiXros validator — no runtime action.
      return false;
    default:
      // Unreachable: runAction routes only this family's kinds here, and its own default
      // reports anything the Action union does not cover.
      return false;
  }
}
