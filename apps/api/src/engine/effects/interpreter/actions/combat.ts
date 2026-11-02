// Attacking, battling, and redirecting an attack.

import type { EffectContext } from "../../EffectContext.js";
import { hasPlayCost } from "../../../cards/cardData.js";
import type { ActionScope } from "../dispatch.js";
import { toDuration } from "../duration.js";
import { candidatePermanents, resolvePermanentTargets } from "../targeting/permanents.js";
import type { Action } from "@aegis/shared";
import type { ForceAttackOptions } from "../../context/primitives/index.js";
import { subscribeLaterEntrants } from "./laterEntrants.js";
import { getEffectDecisionText } from "#api/engine/decisions/getEffectDecisionText";
import { getAttackActionTargetScope } from "#api/engine/effects/interpreter/actions/getAttackActionTargetScope";

/**
 * Run an effect-directed attack with the resolving effect's attack plumbing: the attack
 * pauses this effect, the rest of the effect resolves right after the declaration, and
 * its When Attacking pool drains before Counter Timing.
 */
async function withEffectAttackOptions(
  ctx: EffectContext,
  overrides: ForceAttackOptions,
  attack: (opts: ForceAttackOptions) => Promise<void>,
): Promise<void> {
  await attack({
    afterAttackDeclaration: ctx.continueEffectAfterAttackDeclaration,
    artsDigivolveOptionInstanceId: ctx.source.definition.isDualCard ? ctx.source.instanceId : undefined,
    // Combat pauses this effect. Its When Attacking and other pending effects
    // must finish before Counter / security, including attacks without an IR flag.
    drainTimingWindow: ctx.drainCurrentTimingWindow,
    decisionProvenance: {
      sourceCardId: ctx.source.cardId,
      sourceInstanceId: ctx.source.instanceId,
      sourcePermanentId: ctx.source.permanent()?.permanentId ?? ctx.sourcePermanentIdAtCreation,
      timing: ctx.activeTiming,
      ...getEffectDecisionText(ctx),
      effectTextCardId: ctx.activeEffectTextCardId,
      isInherited: ctx.activeEffectIsInherited,
    },
    ...overrides,
  });
}

/** ＜Blitz＞ (CR §16-16-2) executes processing: the Digimon may attack as part of this effect. */
function processBlitz(ctx: EffectContext, attackerPermanentId: string): Promise<void> {
  return withEffectAttackOptions(
    ctx,
    {},
    (opts) => ctx.fx.blitzAttack?.(attackerPermanentId, opts) ?? Promise.resolve(),
  );
}

const CONTINUOUS_TIMINGS = new Set(["Static", "Rule", "YourTurn", "OpponentsTurn", "AllTurns", "None"]);

export function isBlitzGrant(action: Action): boolean {
  if (action.kind !== "GainKeyword") return false;
  const keyword = action.keyword ?? action.keywords?.[0];
  return typeof keyword === "object" && keyword.keyword === "Blitz";
}

/**
 * The ＜Blitz＞ keyword record doubles as the "has ＜Blitz＞" fact other cards read; the
 * resolving effect that grants it is also the one that processes it. A grant made while a
 * Digimon would digivolve (EX2-056) is a gained "[When Digivolving] ＜Blitz＞", so it waits
 * for that Digimon's When Digivolving window instead.
 */
export async function processBlitzGrant(ctx: EffectContext, permanentIds: readonly string[]): Promise<void> {
  if (ctx.trigger.digivolvingIntoCardId !== undefined) {
    for (const permanentId of permanentIds) {
      ctx.fx.subscribeSubTrigger({
        event: "whenOneOfYoursDigivolves",
        sourcePermanentId: permanentId,
        once: false,
        expiresOnTurnEndOf: ctx.source.ownerSeat,
        description: "[When Digivolving] ＜Blitz＞",
        matches: (subCtx) => subCtx.trigger.subjectPermanentId === permanentId,
        run: (subCtx) => processBlitz(subCtx, permanentId),
      });
    }
    return;
  }
  if (ctx.activeTiming === undefined || CONTINUOUS_TIMINGS.has(ctx.activeTiming)) return;
  for (const permanentId of permanentIds) await processBlitz(ctx, permanentId);
}

type AttackAction = Extract<Action, { kind: "Attack" }>;

function attackActionOptions(action: AttackAction): ForceAttackOptions {
  return {
    withoutSuspending: action.withoutSuspending ?? false,
    vortex: action.vortex,
    attackTargetScope: getAttackActionTargetScope(action),
    attackMechanic: action.attackMechanic,
    deleteAtEndOfAttack: action.deleteAtEndOfAttack,
  };
}

/**
 * Whether some Digimon this action names could declare its attack right now: not suspended or
 * barred from attacking, and with a legal target. Q2490: a "may attack" effect does not let a
 * Digimon that can't attack attack, so its "you may" has nothing to offer.
 */
export function canAttemptAttack(ctx: EffectContext, action: AttackAction): boolean {
  const canForceAttack = ctx.fx.canForceAttack;
  const attackSubject = action.attacker ?? action.subject ?? action.target;
  if (canForceAttack === undefined || attackSubject === undefined) return true;
  // Q2859: during another attack the prompt still shows, and explains why no attack follows.
  if (ctx.fx.isAttackResolving?.() === true) return true;
  const options = attackActionOptions(action);
  if (attackSubject.isSelf || attackSubject.filter?.isSelfRef) {
    const self = ctx.source.permanent();
    return self !== undefined && canForceAttack(self.permanentId, options);
  }
  // Choosing an opponent's Digimon that can't attack is still a legal choice (BT22-062 Q4917).
  const subjectController = attackSubject.filter?.controller ?? attackSubject.filter?.controllerDefault;
  if (subjectController === "opponent") return true;
  return candidatePermanents(ctx, attackSubject, { includeUnaffectable: true }).some((permanent) =>
    canForceAttack(permanent.permanentId, options),
  );
}

export async function runCombatAction(ctx: EffectContext, action: Action, scope: ActionScope): Promise<boolean> {
  const { deferredCostSuspensions } = scope;
  switch (action.kind) {
    case "Attack": {
      // "This Digimon attacks" (self) or "1 of your Digimon attacks" (targeted): make
      // the resolved permanent(s) declare an attack. The controller chooses each
      // attack's target (player / suspended enemy Digimon) inside the combat verb.
      // `withoutSuspending` declares the attack without tapping the attacker.
      const attackSubject = action.attacker ?? action.subject ?? action.target;
      if (attackSubject === undefined) return false;
      let suspensionTriggersFired = false;
      const fireDeferredSuspensionTriggers = async (): Promise<void> => {
        if (suspensionTriggersFired || deferredCostSuspensions.length === 0) return;
        suspensionTriggersFired = true;
        await ctx.fx.fireSuspensionTriggers?.(deferredCostSuspensions, {
          byEffectSeat: ctx.source.ownerSeat,
          byEffectCardId: ctx.source.cardId,
        });
      };
      if (ctx.fx.isAttackResolving?.() === true) {
        await fireDeferredSuspensionTriggers();
        return false;
      }
      const overrides: ForceAttackOptions = {
        ...attackActionOptions(action),
        afterAttackTriggers: fireDeferredSuspensionTriggers,
      };
      await withEffectAttackOptions(ctx, overrides, async (opts) => {
        if (attackSubject.isSelf || attackSubject.filter?.isSelfRef) {
          const self = ctx.source.permanent();
          if (self !== undefined) await ctx.fx.forceAttack(self.permanentId, opts);
          await fireDeferredSuspensionTriggers();
          return;
        }
        // A forced attack by an opponent's Digimon affects the player who attacks with
        // it, rather than the chosen Digimon itself. An opponent Digimon that is
        // unaffected by this source's effects must therefore remain a legal choice and
        // still declare the attack (Q2320, Q4919). Keep the normal affectability
        // filtering for own/unspecified attack subjects.
        const preserveUnaffectableSelection =
          attackSubject.filter?.controller === "opponent" || attackSubject.filter?.controllerDefault === "opponent";
        const ids = await resolvePermanentTargets(ctx, attackSubject, { preserveUnaffectableSelection });
        for (const id of ids) await ctx.fx.forceAttack(id, opts);
        await fireDeferredSuspensionTriggers();
      });
      return false;
    }
    case "Battle": {
      // Direct battle ("1 of your Digimon may battle 1 of your opponent's Digimon"): resolve
      // an attacker (self or chosen) and a defender (chosen opponent Digimon), then run a §14
      // DP battle. Optional => the controller may decline either pick.
      let attackerId: string | undefined;
      if (action.attacker.isSelf || action.attacker.filter.isSelfRef) {
        attackerId = ctx.source.permanent()?.permanentId;
      } else {
        attackerId = (await resolvePermanentTargets(ctx, action.attacker, { preserveUnaffectableSelection: true }))[0];
      }
      if (attackerId === undefined) return false;
      // The compiler emits the defender as either `defender` or the alternative `target`
      // (BattleAction allows both); honor whichever is present.
      const defenderTarget = action.defender ?? action.target;
      if (defenderTarget === undefined) return false;
      // Q7016: the selection is performed by an effect, but the battle itself is rule
      // processing. An unaffected Digimon remains a legal choice and can still lose the
      // ensuing DP comparison, so retain chosen immune ids for both battle participants.
      const defenderId = (
        await resolvePermanentTargets(ctx, defenderTarget, { preserveUnaffectableSelection: true })
      )[0];
      if (defenderId === undefined) return false;
      if (action.comparison === undefined) await ctx.fx.forceBattle?.(attackerId, defenderId);
      else await ctx.fx.forceBattle?.(attackerId, defenderId, { comparison: action.comparison });
      return false;
    }
    case "RedirectAttack": {
      // Legacy generated IR encodes "end the attack" as a RedirectAttack mode with no
      // target (BT13-088/BT16-032). Optional activation is handled by runAction before
      // dispatch; once accepted, this is the same primitive as the canonical EndAttack.
      if (action.mode === "endAttack") {
        ctx.fx.endAttack();
        return false;
      }
      if (ctx.fx.isAttackTargetLocked?.() === true) {
        return false;
      }
      // "Change the target of the attack to 1 of your Digimon": resolve the candidate
      // permanents from the filter and let the CHOOSER pick which becomes the new attack
      // target. `chooser` defaults to "controller" (the source's controller); BT4-075 sets
      // "opponent" so the DEFENDING player chooses among their own unsuspended Digimon, and
      // `optional` lets them decline. A no-op when no attack is open (combat guards it).
      if (action.chooser === "opponent") {
        // The DEFENDING player picks among THEIR OWN matching Digimon — enumerate the
        // candidates (scoped to the opponent/defender seat; the recognizer may strip the
        // controller predicate when the activation gate already credits it) without prompting
        // the controller; the primitive prompts the opponent. Optional => may decline.
        const candidateSeat = ctx.game.opponentOf(ctx.source.ownerSeat);
        const scopedTarget = { ...action.target, filter: { ...action.target.filter, controller: "opponent" as const } };
        const ids = candidatePermanents(ctx, scopedTarget).map((p) => p.permanentId);
        await ctx.fx.redirectAttack(ids, { chooserSeat: candidateSeat, optional: action.optional ?? false });
        return false;
      }
      // Switching the attack target affects the attack, not the new target, so a Digimon
      // unaffected by this effect is still a legal new target (Q3129, Q3133).
      const ids = await resolvePermanentTargets(ctx, action.target, { preserveUnaffectableSelection: true });
      if (action.includePlayer) ids.push("player");
      // NOT `action.optional`: on this branch the "you may" is the ACTIVATION gate, which
      // `runAction` already asked (and whose cost it already charged) before dispatching here.
      // Forwarding it again made the new target declinable a second time, so a controller who
      // had just suspended their Tamer to pay for BT11-092 could answer the target prompt with
      // nothing and keep neither the cost nor the redirect. Once the effect is activated,
      // switching the target is mandatory while a legal one exists. The `chooser: "opponent"`
      // branch above is the exception the gate skips, so its decline stays with the primitive.
      await ctx.fx.redirectAttack(ids);
      return false;
    }
    case "SelectBind": {
      // Resolve the binding target and record the chosen permanentId under its handle for a
      // later action's relativeTo / fromSelectionRef / underSelectionRef to reference. No other
      // effect. When nothing is chosen the handle stays unset and dependents resolve to nothing.
      const name = action.target.bindAs;
      if (name === undefined) return false;
      const target = action.chooser === undefined ? action.target : { ...action.target, chooser: action.chooser };
      const existingIds = ctx.boundPlayed?.get(name);
      const existingId = ctx.selections?.get(name);
      const ids =
        existingIds !== undefined
          ? [...existingIds]
          : existingId !== undefined
            ? [existingId]
            : await resolvePermanentTargets(ctx, target, { preserveUnaffectableSelection: true });
      if (ids.length > 0) {
        ctx.selections ??= new Map();
        ctx.selections.set(name, ids[0]!);
        // Keep the scalar binding for relative attribute comparisons, and retain the complete
        // chosen set for plural `fromSelectionRef` consumers (for example, "suspend 2 ... cards
        // this effect suspended can't unsuspend"). `boundPlayed` is already the resolution-scoped
        // set-valued binding store read by target resolution, despite its historical name.
        ctx.boundPlayed ??= new Map();
        ctx.boundPlayed.set(name, new Set(ids));
        const bound = ctx.game.permanentById(ids[0]!);
        if (bound !== undefined) {
          const definition = bound.topCard ? ctx.game.definitionOf(bound.topCard) : undefined;
          ctx.selectionFacts ??= new Map();
          ctx.selectionFacts.set(name, {
            dp: bound.currentDP,
            level: definition?.level,
            playCost: definition !== undefined && hasPlayCost(definition) ? definition.playCost : undefined,
            digivolutionCount: bound.stack.length,
          });
        }
      }
      if (action.optional === true && action.preserveOncePerTurnOnDecline === true) {
        if (ids.length > 0) {
          ctx.onActivationChosen?.();
          ctx.oncePerTurnActivationChosen = true;
          ctx.oncePerTurnActivationDeclined = false;
        } else if (ctx.oncePerTurnActivationChosen !== true) {
          ctx.oncePerTurnActivationDeclined = true;
        }
      }
      ctx.lastEffectActed = ids.length > 0;
      return ids.length === 0 && action.abortOnDecline === true;
    }
    case "EndAttack": {
      // "End that attack" (BT23-069): terminate the in-flight attack (transition to
      // end-of-attack). A no-op when no attack is open; changes the timing, not the Digimon.
      ctx.fx.endAttack();
      return false;
    }
    case "GrantCanAttackUnsuspended": {
      // "This Digimon may also attack your opponent's unsuspended Digimon" (ST12-08): a
      // positive attack-legality grant on the resolved target(s), read by combat legality.
      const ids = await resolvePermanentTargets(ctx, action.target);
      const duration = toDuration(action.duration);
      const noDigivolutionCards = action.noDigivolutionCards === true;
      const grant = (id: string): void =>
        ctx.fx.grantCanAttackUnsuspended(id, duration, {
          noDigivolutionCards,
          defenderLevelMax: action.defenderLevelMax,
        });
      for (const id of ids) grant(id);
      if (action.includeLaterEntrants === true) {
        subscribeLaterEntrants(ctx, {
          filter: action.target.filter,
          duration: action.duration,
          label: "GrantCanAttackUnsuspended",
          alreadyGranted: ids,
          grant,
        });
      }
      return false;
    }
    case "GrantVortexCanAttackPlayers": {
      // EX11-062 [Your Turn]: "while your opponent has no unsuspended Digimon, your ＜Vortex＞ can
      // also attack players" (KB Q5920). A positive ＜Vortex＞ attack-target grant on the resolved
      // target(s) (your Digimon), read by combat legality for a ＜Vortex＞-mode declaration. The
      // [Your Turn] condition (opponent has no unsuspended Digimon) is evaluated by the effect's
      // own condition gate; this records the grant when the effect fires.
      const ids = await resolvePermanentTargets(ctx, action.target);
      const duration = toDuration(action.duration);
      for (const id of ids) ctx.fx.grantVortexCanAttackPlayers?.(id, duration);
      return false;
    }
    default:
      // Unreachable: runAction routes only this family's kinds here, and its own default
      // reports anything the Action union does not cover.
      return false;
  }
}
