import { createTrackedGrantActivity } from "#api/engine/effects/interpreter/matching/createTrackedGrantActivity";
// Auras and continuous permissions.

import type { CardColor } from "@aegis/shared";
import type { EffectContext, Restriction } from "../../EffectContext.js";
import { evaluateCondition } from "../conditions.js";
import { runAction } from "../dispatch.js";
import { laterEntrantGrantClause } from "../describe.js";
import { toDuration } from "../duration.js";
import { unsupported } from "../errors.js";
import { GRANTED_EFFECT_LIBRARY } from "../grantedEffects.js";
import { scaleFactor } from "../scaling.js";
import { resolvePermanentTargets } from "../targeting/permanents.js";
import { permanentMatchesFilter } from "../matching/permanent.js";
import { subscribeLaterEntrants } from "./laterEntrants.js";
import { SUBTRIGGER_EVENT_MAP } from "./subTrigger.js";
import { EffectDuration } from "@aegis/shared";
import type { Action, Target } from "@aegis/shared";

export async function runStaticAction(ctx: EffectContext, action: Action): Promise<boolean> {
  switch (action.kind) {
    case "Aura": {
      // A "while ..." aura: live exactly while its gate holds. The static-effect
      // builder re-runs this resolve each evaluation, so re-checking the gate here
      // condition gives (it lapses the moment the gate fails). The battle-area guard
      // is implicit (no source permanent => no candidates).
      if (action.while !== undefined && !evaluateCondition(ctx, action.while)) return false;
      const hasDynamicSelfConstraint =
        action.target.filter.colors !== undefined || action.target.filter.dp !== undefined;
      const ids = (await resolvePermanentTargets(ctx, action.target)).filter((id) => {
        if (!hasDynamicSelfConstraint) return true;
        const permanent = ctx.game.permanentById(id);
        return permanent !== undefined && permanentMatchesFilter(ctx, permanent, action.target.filter, ctx.source);
      });
      const duration = EffectDuration.UntilEachTurnEnd;
      for (const id of ids) {
        switch (action.effect.kind) {
          case "keyword": {
            const kw = action.effect.keyword.keyword;
            const amount =
              action.effect.keyword.amount === undefined
                ? undefined
                : action.effect.keyword.amount * (action.scaling === undefined ? 1 : scaleFactor(ctx, action.scaling));
            if (kw === "Piercing") ctx.fx.grantPierce(id, duration, { continuous: true });
            else if (kw === "LinkMax") {
              ctx.fx.grantLinkMax(id, amount ?? 1, duration, { continuous: true });
            } else {
              ctx.fx.grantKeyword(id, kw, duration, amount, {
                continuous: true,
                sourceCardId: ctx.source.cardId,
                sourceInstanceId: ctx.source.instanceId,
                sourceEffectText: ctx.activeEffectText,
              });
            }
            break;
          }
          case "modifyDP": {
            const amount = action.effect.amount * (action.scaling === undefined ? 1 : scaleFactor(ctx, action.scaling));
            ctx.fx.modifyDP(id, amount, duration, { continuous: true });
            break;
          }
          case "modifySecurityDP":
            // Security DP is seat-scoped rather than permanent-scoped. Aura target resolution
            // supplies one live host id; apply the seat delta once, not once per board Digimon.
            ctx.fx.modifySecurityDp(
              action.effect.seat === "opponent" ? ctx.game.opponentOf(ctx.source.ownerSeat) : ctx.source.ownerSeat,
              action.effect.amount,
              { continuous: true },
            );
            return false;
          case "securityAttack":
            ctx.fx.grantKeyword(id, "SecurityAttack", duration, action.effect.amount, { continuous: true });
            break;
          case "restriction": {
            // Same drop as the `Restrict` action: a deprecated kind has no consumer, so
            // recording it would be a silent no-op rather than a grant.
            const granted = action.effect.restriction as Restriction;
            if (granted !== "activateEffects") {
              ctx.fx.restrict(id, granted, duration, { continuous: true });
            }
            break;
          }
          default:
            break;
        }
      }
      return false;
    }
    case "GrantAuraToOpponents": {
      // Q1f: most corpus instances of this action kind carry no `event`/`actions` at all —
      // only `target` + `effectText` naming the printed granted ability verbatim (a compiler
      // shell for "X gains '[Trigger] Body'" that never finished compiling the body). Iterating
      // `action.actions` for one of these would throw the moment the watched event fires. Route
      // any instance whose `effectText` names a registered library effect through the SAME
      // "grant a named library effect" mechanism GrantStatic's `grant:"effects"` branch uses
      // (`grantCustomEffect` + `GRANTED_EFFECT_LIBRARY`), instead of installing a raw SubTrigger
      // watcher with undefined actions. Instances naming an UNREGISTERED effectText fall through
      // to the pre-existing behavior below unchanged (still a Q1f gap, not made worse here).
      if (
        action.actions === undefined &&
        typeof action.effectText === "string" &&
        action.effectText in GRANTED_EFFECT_LIBRARY
      ) {
        const ids = await resolvePermanentTargets(
          ctx,
          action.target ??
            ({ filter: action.filter ?? { kind: ["Digimon"], controller: "opponent" }, count: "all" } as Target),
          // A player-wide duration effect still exists while a current recipient is immune.
          // Preserve that recipient so Q2120 can observe the grant becoming active when its
          // immunity expires before this aura's own boundary.
          { preserveUnaffectableSelection: true },
        );
        const grantDuration = toDuration(action.duration ?? "untilOpponentTurnEnd");
        // Each resolved aura is one grant identity. Repeated entry notifications belonging to
        // this resolution stay idempotent, while a separately resolved copy of the same Option
        // receives a different identity and therefore stacks (EX1-068/Q3255).
        const activationIdentity = {};
        const grantedPermanentIds = new Set<string>();
        const grantingSourceKinds =
          ctx.fx.isBeAffectedBySourceKind === undefined
            ? []
            : (ctx.effectSourceKinds ?? ctx.source.definition.kinds).filter(
                (kind) => kind === "Digimon" || kind === "Option",
              );
        const grantToPermanent = (grantCtx: EffectContext, permanentId: string): void => {
          if (grantedPermanentIds.has(permanentId)) return;
          const permanent = grantCtx.game.permanentById(permanentId);
          const top = permanent?.topCard;
          if (top === undefined) return;
          grantCtx.fx.grantCustomEffect?.(top.instanceId, ctx.source.ownerSeat, action.effectText!, grantDuration, {
            activationIdentity,
            continuous: ctx.continuousPass === true,
            sourceCardId: ctx.source.cardId,
            // Q2120/Q2121: a duration-scoped Option aura is applied only while this Digimon can
            // be affected by the granting Option. Re-evaluate at trigger collection time.
            isActive: createTrackedGrantActivity({
              ctx,
              filter: undefined,
              sourceKinds: grantingSourceKinds,
              permanentId,
            }),
          });
          grantedPermanentIds.add(permanentId);
        };
        for (const id of ids) {
          grantToPermanent(ctx, id);
        }
        // "All of their Digimon gain ... until the end of their turn" is a timed player-wide
        // grant, not a snapshot of the board. Keep the existing targets and apply the same
        // token to a matching opponent Digimon that enters before the duration expires.
        if (action.includeLaterEntrants === true) {
          const target =
            action.target ??
            ({ filter: action.filter ?? { kind: ["Digimon"], controller: "opponent" }, count: "all" } as Target);
          // Q3590 includes Digimon that enter after this effect resolves, not merely those played
          // from a card zone; the board-wide seam also carries breeding -> battle movement.
          subscribeLaterEntrants(ctx, {
            filter: { controller: "opponent", ...target.filter },
            duration: action.duration ?? "untilOpponentTurnEnd",
            label: "GrantAuraToOpponents",
            printedClause: laterEntrantGrantClause(ctx.activeEffectText, ctx.source.definition),
            alreadyGranted: ids,
            grant: (permanentId) => grantToPermanent(ctx, permanentId),
          });
        }
        return false;
      }
      // P-075: grant a debuff aura (SubTrigger watcher) to all opponent Digimon.
      // Resolve opponent permanents, install a watcher on each that fires on `action.event`
      // and runs `action.actions`. The scope is ALWAYS the opponent (the action name): force
      // controller:"opponent" onto the filter so a filter that omits it (P-075's IR carries only
      // `{kind:["Digimon"]}`) does not leak the aura onto the controller's own Digimon.
      const declaredTarget =
        action.target ?? ({ filter: action.filter ?? { kind: ["Digimon"] }, count: "all" } as Target);
      const targetIds = await resolvePermanentTargets(ctx, {
        ...declaredTarget,
        filter: { ...declaredTarget.filter, controller: "opponent" },
      });
      const candidates = targetIds
        .map((permanentId) => ctx.game.permanentById(permanentId))
        .filter((permanent): permanent is NonNullable<typeof permanent> => permanent !== undefined);
      const duration = toDuration(action.duration ?? "untilOpponentTurnEnd");
      // Anchor the watcher to its OWN permanent: `fireSubTrigger(event)` runs every watcher of
      // that event (it passes no sourcePermanentId), so without this gate one Digimon suspending
      // would fire EVERY granted watcher. The body's "this Digimon" semantics require the event
      // subject to BE the watched permanent.
      const installAura = (anchorId: string): void => {
        ctx.fx.subscribeSubTrigger({
          event: (action.event === undefined ? undefined : SUBTRIGGER_EVENT_MAP[action.event]) ?? "whenSuspended",
          sourcePermanentId: anchorId,
          watchesSelf: true,
          once: false,
          description: `GrantAura from ${ctx.source.cardId}`,
          expiresOnTurnEndOf:
            duration === EffectDuration.UntilOpponentTurnEnd
              ? ctx.game.opponentOf(ctx.source.ownerSeat)
              : duration === EffectDuration.UntilOwnerTurnEnd
                ? ctx.source.ownerSeat
                : undefined,
          matches: (subCtx) => {
            // Gate to "this Digimon": fire only when the granted permanent IS the event subject.
            // Lenient by design — when the fired event carries no permanent subject we preserve
            // firing (the prior behavior), so this narrows the over-fire (P-075: one suspend fired
            // every watcher) without silencing granted auras on subject-less events.
            const t = subCtx.trigger;
            const subjectId =
              t.subjectPermanentId ??
              t.suspendedPermanentId ??
              t.unsuspendedPermanentId ??
              t.deletedPermanentId ??
              t.attackerPermanentId;
            return subjectId === undefined || subjectId === anchorId;
          },
          run: async (subCtx) => {
            for (const auraAction of action.actions ?? []) {
              await runAction(subCtx, auraAction as Action);
            }
          },
        });
      };
      for (const permanent of candidates) installAura(permanent.permanentId);
      if (action.includeLaterEntrants === true) {
        subscribeLaterEntrants(ctx, {
          filter: { ...declaredTarget.filter, controller: "opponent" },
          duration: action.duration ?? "untilOpponentTurnEnd",
          label: "GrantAuraToOpponents",
          alreadyGranted: targetIds,
          grant: installAura,
        });
      }
      return false;
    }
    case "WaiveColorRequirement": {
      // Defaults to the source card (the common "use this card without meeting its
      // color requirements"). A filtered target (a referenced card) is rarer.
      const duration = toDuration("forTheTurn");
      if (action.target && !(action.target?.isSelf || action.target?.filter?.isSelfRef)) {
        unsupported(ctx, action, "WaiveColorRequirement on a non-self target needs a card selection");
        return false;
      }
      // A printed `color` is the "X ALSO meets this card's colour requirements" family
      // (the LM Memory Boost cards): the printed requirement still has to be met, by the
      // card's own colour OR by this extra one. Without a colour the clause is the blanket
      // "you can ignore this card's colour requirements" waiver (ST20-14, EX9-070).
      const alsoColor =
        typeof action.color === "string"
          ? ((action.color.charAt(0).toUpperCase() + action.color.slice(1).toLowerCase()) as CardColor)
          : undefined;
      ctx.fx.waiveColorRequirement(
        ctx.source.instanceId,
        duration,
        alsoColor === undefined ? undefined : { alsoColor },
      );
      return false;
    }
    default:
      // Unreachable: runAction routes only this family's kinds here, and its own default
      // reports anything the Action union does not cover.
      return false;
  }
}
