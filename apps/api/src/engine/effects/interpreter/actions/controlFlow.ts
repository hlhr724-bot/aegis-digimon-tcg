import { InterpreterCallbackKind } from "#api/engine/effects/interpreter/snapshot/InterpreterCallbackKind";
import { createDelayedEffectBody } from "#api/engine/effects/interpreter/snapshot/createDelayedEffectBody";
import { createDelayedEffectMatcher } from "#api/engine/effects/interpreter/snapshot/createDelayedEffectMatcher";
// Branching, delay, and arming event-driven sub-effects.

import type { EffectContext } from "../../EffectContext.js";
import { evaluateCondition } from "../conditions.js";
import { costIsAskedAsSelection, payCost } from "../costs.js";
import { runAction } from "../dispatch.js";
import { runModal } from "./modal.js";
import { runPrevent, runReplacement } from "./replacement.js";
import { runGainTriggeredEffect, runSubTrigger } from "./subTrigger.js";
import type { Action } from "@aegis/shared";

export async function runControlFlowAction(ctx: EffectContext, action: Action): Promise<boolean> {
  switch (action.kind) {
    case "Modal": {
      return await runModal(ctx, action);
    }
    case "ConditionalBranch": {
      const branch = evaluateCondition(ctx, action.condition) ? action.ifTrue : (action.ifFalse ?? []);
      for (const nested of branch) {
        const abort = await runAction(ctx, nested);
        if (abort) break;
      }
      return false;
    }
    case "DelayedEffect": {
      // The delayed body runs in a FRESH context a turn later, so the effect-result bindings it
      // names ("return THAT Digimon to the hand" — BT17-069, LM-013) have to be carried across
      // explicitly. Snapshot them at arm time: nothing else survives the gap, and without this
      // a `boundRef` target resolves to nothing and the delayed clause silently does nothing.
      const armedBindings = {
        boundPlayed: ctx.boundPlayed === undefined ? undefined : new Map(ctx.boundPlayed),
        boundCardInstances: ctx.boundCardInstances === undefined ? undefined : new Map(ctx.boundCardInstances),
        selections: ctx.selections === undefined ? undefined : new Map(ctx.selections),
        namedCounts: ctx.namedCounts === undefined ? undefined : new Map(ctx.namedCounts),
      };
      ctx.fx.subscribeSubTrigger({
        event: "endOfTurn",
        // A delayed effect has already activated before its printed cost can move/delete
        // the source. Keep the armed body on its live activation context so removing the
        // source does not tear the pending effect down with the permanent's ledgers.
        activationContext: ctx,
        once: true,
        // Pending processing from an effect that already activated: the turn player orders the
        // simultaneous set it lands in (KB Q5564/Q5566/Q5568).
        orderedByTurnPlayer: true,
        expiresOnTurnEndOf: ctx.game.opponentOf(ctx.source.ownerSeat),
        matches:
          ctx.game?.runtimeCallbacks === undefined
            ? createDelayedEffectMatcher()
            : ctx.game?.runtimeCallbacks.create<ReturnType<typeof createDelayedEffectMatcher>>({
                key: InterpreterCallbackKind.DELAYED_MATCH.value,
                payload: null,
              }),
        description: action.raw ?? "DelayedEffect(nextEndOfOpponentTurn)",
        run:
          ctx.game?.runtimeCallbacks === undefined
            ? createDelayedEffectBody({ effect: action.effect, bindings: armedBindings })
            : ctx.game?.runtimeCallbacks.create<ReturnType<typeof createDelayedEffectBody>>({
                key: InterpreterCallbackKind.DELAYED_BODY.value,
                payload: { effect: action.effect, bindings: armedBindings },
              }),
      });
      return false;
    }
    case "SubTrigger": {
      await runSubTrigger(ctx, action);
      return false;
    }
    case "Replacement": {
      await runReplacement(ctx, action);
      return false;
    }
    case "Prevent": {
      await runPrevent(ctx, action);
      return false;
    }
    case "GainTriggeredEffect": {
      await runGainTriggeredEffect(ctx, action);
      return false;
    }
    case "GainEffect": {
      await runGainTriggeredEffect(ctx, {
        ...action,
        kind: "GainTriggeredEffect",
        gainedTrigger: action.grant.trigger,
        gainedActions: action.grant.actions,
      });
      return false;
    }
    case "CostGatedBlock": {
      // This wrapper owns the single payment; nested actions deliberately run without re-paying
      // the wrapper cost (EX6-021, Q3719).
      // An optional hand-trash cost is declined by selecting no card. Propagate that
      // selection contract while paying the wrapper; otherwise `payCost` asks for one
      // card and the client cannot offer its No Selection response.
      const outerCostIsTheQuestion = ctx.costIsTheQuestion;
      ctx.costIsTheQuestion =
        (action.optional === true && costIsAskedAsSelection(action.cost)) ||
        ctx.predecidedCostSelections?.has(action) === true;
      const paid = await payCost(ctx, action.cost);
      ctx.costIsTheQuestion = outerCostIsTheQuestion;
      if (!paid) {
        if ((action.optional === true || action.cost.optional === true) && ctx.oncePerTurnActivationChosen !== true) {
          ctx.oncePerTurnActivationDeclined = true;
        }
        return action.abortOnDecline === true;
      }
      ctx.oncePerTurnActivationChosen = true;
      ctx.oncePerTurnActivationDeclined = false;
      for (const nested of action.actions) {
        const abort = await runAction(ctx, nested);
        if (abort) break;
      }
      return false;
    }
    case "RestrictEffect": {
      if (action.scope === "thisEffect") {
        ctx.effectRestrictions ??= new Set();
        ctx.effectRestrictions.add(action.restriction);
      }
      return false;
    }
    default:
      // Unreachable: runAction routes only this family's kinds here, and its own default
      // reports anything the Action union does not cover.
      return false;
  }
}
