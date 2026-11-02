// Acting on other effects, plus the unparsed escape hatch.

import type { EffectContext } from "../../EffectContext.js";
import { effectProvenanceKinds } from "../../effectProvenance.js";
import { runtimeCompiledCard } from "../compiledCards.js";
import { runEffect } from "../dispatch.js";
import { unsupported } from "../errors.js";
import { scaleFactor } from "../scaling.js";
import { resolvePermanentTargets } from "../targeting/permanents.js";
import { runActivateEffect, runActivateForeignEffect, runActivateMain, runUseOptionWithoutCost } from "./borrowed.js";
import { EffectTiming } from "@aegis/shared";
import type { Action } from "@aegis/shared";

/**
 * Actions that can declare an attack before they finish. The effect's later actions run
 * right after that declaration, before the battle (Q4962).
 */
export function mayDeclareAttack(action: Action): boolean {
  return (
    action.kind === "Attack" ||
    (action.kind === "ReactivateEffect" && action.target === undefined && action.targetSource === "triggerSubject")
  );
}

type CompiledEffect = NonNullable<ReturnType<typeof runtimeCompiledCard>>["effects"][number];

function ownEffectActivationDisabled(ctx: EffectContext, effect: CompiledEffect): boolean {
  const timing =
    effect.trigger === "WhenDigivolving" ? "whenDigivolving" : effect.trigger === "OnPlay" ? "onPlay" : undefined;
  const sourcePermanentId = ctx.source.permanent()?.permanentId;
  return (
    timing !== undefined &&
    sourcePermanentId !== undefined &&
    ctx.game.isTimingEffectDisabled?.(sourcePermanentId, timing) === true
  );
}

/**
 * Whether a self "activate this Digimon's [X] effect" action has any effect it may activate.
 * When none can activate, the action can't be used, so its "by" cost is never paid (KB Q5749).
 */
export function canReactivateOwnEffect(
  ctx: EffectContext,
  action: Extract<Action, { kind: "ReactivateEffect" }>,
): boolean {
  if (action.target !== undefined || action.targetSource !== undefined) return true;
  const effects = runtimeCompiledCard(ctx.source.cardId)?.effects.filter((e) => e.trigger === action.fromTrigger) ?? [];
  if (effects.length === 0) return true;
  return effects.slice(0, action.count).some((effect) => !ownEffectActivationDisabled(ctx, effect));
}

export async function runMetaAction(ctx: EffectContext, action: Action): Promise<boolean> {
  switch (action.kind) {
    case "ActivateMain": {
      // Some IR records carry declarative metadata for custom turn-end rules under the
      // legacy ActivateMain shape so older audit tooling can see a non-empty action.
      // This is not the security "activate this card's [Main] effect" operation, so it
      // must not call runActivateMain or emit a loud missing-[Main] gap.
      if ("turnEndCondition" in action && action.turnEndCondition !== undefined) return false;
      await runActivateMain(ctx);
      return false;
    }
    case "ActivateOptionMain": {
      const count = Math.max(1, action.count ?? 1);
      for (let i = 0; i < count; i++) await runActivateMain(ctx);
      return false;
    }
    case "WinGame": {
      const winner = action.winner === "controller" ? ctx.source.ownerSeat : ctx.game.opponentOf(ctx.source.ownerSeat);
      ctx.fx.declareWinner(winner);
      return false;
    }
    case "ReactivateEffect": {
      if (action.target !== undefined) {
        let timing: EffectTiming | undefined;
        if (action.fromTrigger === "WhenDigivolving") {
          timing = EffectTiming.WhenDigivolving;
        }
        if (action.fromTrigger === "OnDeletion") {
          timing = EffectTiming.OnDestroyedAnyone;
        }
        if (timing === undefined) {
          unsupported(ctx, action, `targeted reactivation does not support ${action.fromTrigger}`);
          return false;
        }
        const targetIds = await resolvePermanentTargets(ctx, action.target);
        ctx.lastEffectActed = false;
        for (const permanentId of targetIds) {
          ctx.lastEffectActed =
            (await ctx.fx.reactivateOnPlay?.(permanentId, {
              timings: [timing],
              chooseOne: action.fromTrigger === "OnDeletion",
              outsideTriggerWindow: action.fromTrigger === "OnDeletion",
            })) === true || ctx.lastEffectActed;
        }
        return false;
      }
      if (action.targetSource === "triggerSubject") {
        const permanentId = ctx.trigger.subjectPermanentId;
        if (permanentId === undefined) {
          ctx.lastEffectActed = false;
          return false;
        }
        const timing = action.fromTrigger === "Main" ? EffectTiming.OnDeclaration : undefined;
        if (timing === undefined) {
          unsupported(ctx, action, `trigger-subject reactivation does not support ${action.fromTrigger}`);
          ctx.lastEffectActed = false;
          return false;
        }
        // Q4962: the rest of the outer effect waits for the whole reactivated [Main]. When
        // that [Main] ends in an attack, "whole" means up to the attack declaration.
        const outerContinuation = ctx.continueEffectAfterAttackDeclaration;
        ctx.lastEffectActed =
          (await ctx.fx.reactivateOnPlay?.(permanentId, {
            timings: [timing],
            ...(outerContinuation === undefined
              ? {}
              : {
                  continueEffectAfterAttackDeclaration: async () => {
                    ctx.lastEffectActed = true;
                    await outerContinuation();
                  },
                }),
          })) === true;
        return false;
      }
      const compiled = runtimeCompiledCard(ctx.source.cardId);
      if (!compiled) return false;
      const factor = action.scaling ? scaleFactor(ctx, action.scaling) : 1;
      const reps = action.count * factor;
      const toRun = compiled.effects.filter((e) => e.trigger === action.fromTrigger).slice(0, action.count);
      for (let i = 0; i < reps; i++) {
        for (const eff of toRun) {
          if (ownEffectActivationDisabled(ctx, eff)) continue;
          // Reactivation is a nested CardEffect coroutine. Keep its effect-resolution
          // frame balanced with the outer timing resolver: nested actions may open
          // deferred timing/sub-trigger work, and those queues must not outlive the
          // reactivated body. Preserve the caller's provenance after each body so a
          // second repeated activation gets its own timing label and the enclosing
          // combat continuation resumes with the outer [When Attacking] context.
          const outerTiming = ctx.activeTiming;
          const outerEffectText = ctx.activeEffectText;
          ctx.activeTiming = eff.trigger;
          ctx.activeEffectText = eff.description;
          ctx.fx.enterEffectResolution?.(
            ctx.source.ownerSeat,
            effectProvenanceKinds(ctx),
            ctx.source.permanent()?.permanentId,
          );
          const finishAnnouncement = ctx.fx.announceEffect?.(ctx, {
            ...eff,
            effectKey: eff.effectKey ?? `${ctx.source.cardId}/reactivated/${eff.trigger}`,
            description: eff.description ?? action.raw ?? action.fromTrigger,
            timing: eff.timing ?? eff.trigger,
          });
          try {
            await runEffect(ctx, eff);
          } finally {
            finishAnnouncement?.();
            ctx.fx.leaveEffectResolution?.();
            ctx.activeTiming = outerTiming;
            ctx.activeEffectText = outerEffectText;
          }
        }
      }
      return false;
    }
    case "ActivateForeignEffect":
      await runActivateForeignEffect(ctx, action);
      return false;
    case "ActivateEffect":
      await runActivateEffect(ctx, action);
      return false;
    case "UseOptionWithoutCost":
      await runUseOptionWithoutCost(ctx, action);
      return false;
    case "RawUnparsed":
      unsupported(ctx, action, `unparsed clause: "${action.text}"`);
      return false;
    default:
      // Unreachable: runAction routes only this family's kinds here, and its own default
      // reports anything the Action union does not cover.
      return false;
  }
}
