import { Phase, type Intent, type IntentResult, type Seat } from "@aegis/shared";
import { handleEndPhase, handleReady, handleRespondDecision, handleSurrender } from "../../intentRouter.js";
import {
  applyDeclareBlock,
  applyDeclineBlock,
  applyRespondAlliance,
  applyRespondBarrier,
  applyRespondEvade,
} from "../../actions/index.js";
import { ATTACK_BLOCKED_INTENTS, isBlastDigivolve } from "../intentGating.js";
import { blockDeps, combatDecisionDeps, intentRouterDeps } from "../actionDeps.js";
import type { GameEngine } from "../../GameEngine.js";
import { handleBreedingSkip, handleHatchEgg, handleMoveFromBreeding } from "./breeding.js";
import { declareBlitzAttack } from "../blitz.js";
import { handleAttack, handleRespondCounter } from "./combat.js";
import { handleDigivolve, handleDnaDigivolve, handleLinkCard } from "./digivolve.js";
import { handleActivateEffect, handleAppFusion, handlePlayCard } from "./play.js";
import { checkTurnEndAfterVerb } from "./turnEnd.js";

/**
 * Validate and apply a single client intent (subsystem: intent-protocol-and-room).
 * Mutates state only on success; every path returns a stable IntentResult the room
 * surfaces (the rejection codes are the API-CONTRACT section 4 vocabulary).
 *
 * Replaces all network transport RPC entry points (RoomManager / TurnStateMachine / OptionalSkill
 * / MultipleSkills RPCs): the only client->server channel is engine dispatch table.
 * Each verb's own action module enforces the validation contract (seat/turn ->
 * open-decision -> legality) and is server-authoritative.
 *
 * The decision gate is enforced per verb (and, for the always-available verbs,
 * deliberately bypassed): while a decision is open only respondDecision and
 * surrender are accepted. Every gated verb keys off the synchronized
 * state.pendingDecision (the contract's source of truth, which the DecisionManager
 * mirrors), so the action modules and the router agree.
 */
export function applyIntent(engine: GameEngine, seat: Seat, intent: Intent): IntentResult {
  // An activated ＜Blitz＞ attacks inside the effect that processed it, so its declaration
  // bypasses the gates that refuse verbs while an effect resolves. Passing abandons it; any
  // other board verb would start on top of that paused effect.
  const pendingBlitz = engine.pendingBlitzAttack;
  if (pendingBlitz !== undefined) {
    if (intent.type === "attack") return declareBlitzAttack(engine, pendingBlitz, seat, intent);
    if (intent.type === "endPhase" && seat === pendingBlitz.seat) {
      pendingBlitz.settle(undefined);
      if (engine.state.phase !== Phase.Main) return { ok: true };
    } else if (ATTACK_BLOCKED_INTENTS.has(intent.type)) {
      return { ok: false, reason: "wrong-phase" };
    }
  }
  const mainActionWhileResolving =
    engine.activeWindowToken !== undefined || engine.effectResolutionDepth > 0 || engine.optionResolutionDepth > 0;
  // CR 6-5-1: a new ordinary Main action requires all earlier processing to finish.
  // Queuing it would let a paid action cross memory yet spend again before turn end.
  // Reactive windows outside a Main verb also remain closed to ordinary actions.
  // Keep decision-pending precedence and Counter Timing's Blast declarations.
  const noDecisionOpen = engine.state.pendingDecision === undefined;
  if (
    (engine.mainPhase.hasEnded ||
      engine.mainVerbContinuationsInFlight > 0 ||
      (mainActionWhileResolving &&
        (engine.mainEntryPending || engine.mainVerbContinuationsInFlight === 0 || intent.type === "activateEffect"))) &&
    noDecisionOpen &&
    ["playCard", "appFusion", "digivolve", "attack", "activateEffect", "linkCard", "dnaDigivolve"].includes(
      intent.type,
    ) &&
    !isBlastDigivolve(intent)
  ) {
    return { ok: false, reason: "wrong-phase" };
  }
  // CR section 11: an attack runs from declaration to the end of the battle as one
  // uninterrupted process. While it is in flight — including while it is parked on a
  // combat prompt the defending seat still owes an answer to (block, Counter Timing,
  // Alliance, Evade, Barrier) — no board verb is accepted from either seat. Those
  // prompts are mirrored in `state.combatWindow`, not in `state.pendingDecision`, so
  // the per-verb `decision-pending` gates do not see them; without engine the turn
  // player could play Digimon between a redirected attack and its battle, and end the
  // turn with the attack never resolved. The room's answer-timeout backstop
  // (`expireCombatWindow`) guarantees the window always closes, so engine cannot wedge
  // the turn. The combat response verbs, `respondDecision`, `ready` and `surrender`
  // stay open: they are how the attack makes progress or the match ends.
  if (
    engine.combat.currentAttackerId !== undefined &&
    ATTACK_BLOCKED_INTENTS.has(intent.type) &&
    !isBlastDigivolve(intent)
  ) {
    return { ok: false, reason: "wrong-phase" };
  }
  // An attack runs outside the `continueMainVerb` queue, so it would start on top of an
  // earlier verb still resolving — for example one parked on an ＜Evade＞ prompt. Both
  // chains then open decisions, and the DecisionManager allows only one at a time.
  // Observed in match 8da59026-c857-4a14-99f4-d240e5276b82.
  if (intent.type === "attack" && engine.mainVerbContinuationsInFlight > 0) {
    return { ok: false, reason: "wrong-phase" };
  }
  // A voluntary pass is deferred while start-of-main entry is in flight. A held
  // combat window above must finish first; after that, the entry finalizer can
  // replay this valid pass when Main is ready to close.
  if (
    intent.type === "endPhase" &&
    engine.mainEntryPending &&
    mainActionWhileResolving &&
    noDecisionOpen &&
    !engine.state.gameOver &&
    engine.state.phase === Phase.Main &&
    engine.mainPhase.seat === seat
  ) {
    engine.deferredEndPhaseSeat = seat;
    return { ok: true };
  }
  // A play/digivolution can still be resolving its entry effects after Main looks
  // idle to the client. Keep a valid voluntary pass behind that accepted action;
  // closing Main here would let a forced attack continue into the next phase.
  if (
    intent.type === "endPhase" &&
    noDecisionOpen &&
    !engine.state.gameOver &&
    engine.mainVerbContinuationsInFlight > 0 &&
    engine.state.phase === Phase.Main &&
    engine.mainPhase.seat === seat
  ) {
    engine.deferredEndPhaseSeat = seat;
    return { ok: true };
  }
  switch (intent.type) {
    case "manual":
      return { ok: false, reason: "unknown-intent" };

    case "playCard":
      return handlePlayCard(engine, seat, intent);

    case "appFusion":
      return handleAppFusion(engine, seat, intent);

    case "digivolve":
      return handleDigivolve(engine, seat, intent);

    case "attack":
      return handleAttack(engine, seat, intent);

    case "declareBlock":
      return applyDeclareBlock(blockDeps(engine), seat, intent);

    case "declineBlock":
      return applyDeclineBlock(blockDeps(engine), seat);

    case "respondCounter":
      return handleRespondCounter(engine, seat, intent);

    case "respondAlliance":
      return applyRespondAlliance(combatDecisionDeps(engine), seat, intent);

    case "respondEvade":
      return applyRespondEvade(combatDecisionDeps(engine), seat, intent);

    case "respondBarrier":
      return applyRespondBarrier(combatDecisionDeps(engine), seat, intent);

    case "activateEffect":
      return handleActivateEffect(engine, seat, intent);

    case "linkCard":
      return handleLinkCard(engine, seat, intent);

    case "dnaDigivolve":
      return handleDnaDigivolve(engine, seat, intent);

    case "endPhase":
      // During the Breeding phase, endPhase is "do nothing" — it skips the breeding
      // action window (API-CONTRACT "advance Main -> End (or skip Breeding action)").
      // During the Main phase it ends the turn (intentRouter / MainPhaseController).
      if (engine.state.phase === Phase.Breeding) {
        return handleBreedingSkip(engine, seat);
      }
      return handleEndPhase(intentRouterDeps(engine), seat);

    case "respondDecision":
      return handleRespondDecision(intentRouterDeps(engine), seat, intent);

    case "ready":
      return handleReady(intentRouterDeps(engine), seat);

    case "surrender":
      return handleSurrender(intentRouterDeps(engine), seat);

    case "mulligan":
      return engine.mulligan.answer(seat, intent.keep) ? { ok: true } : { ok: false, reason: "decision-pending" };

    case "hatchEgg":
      return handleHatchEgg(engine, seat, intent);

    case "moveFromBreeding":
      return handleMoveFromBreeding(engine, seat, intent);

    default: {
      // Exhaustiveness guard: a new Intent variant must be handled above.
      const exhaustive: never = intent;
      void exhaustive;
      return { ok: false, reason: "unknown-intent" };
    }
  }
}

/**
 * Track one accepted async Main verb and make its final turn-end check authoritative.
 *
 * `start` is a THUNK, not a promise: the verb must not begin until every previously
 * accepted verb has fully settled. Intents are gated on an open decision, but nothing
 * gated them on a verb whose triggers were merely still settling, so two resolutions
 * ran concurrently and both could reach a prompt — the second threw out of
 * `DecisionManager.request`, aborting a card's clause halfway (memory never gained, a
 * card never drawn) in whichever card lost the race.
 *
 * Public ordinary verbs are refused while one is in flight (CR 6-5-1). The chain
 * still protects internal continuation ordering. The replies that DRIVE a resolution —
 * respondDecision, respondCounter, and the combat decisions — deliberately bypass engine
 * seam, so serializing here cannot deadlock the chain they are answering.
 *
 * A verb arriving while nothing is in flight still begins SYNCHRONOUSLY, exactly as
 * before: a verb's synchronous prefix (paying cost, moving the card out of hand) has
 * always run by the time `applyIntent` returns, and callers read state expecting that.
 * Only an internally scheduled continuation behind another waits; a client must
 * submit a fresh legal intent after the current action finishes.
 */
export function continueMainVerb<T>(
  engine: GameEngine,
  start: () => Promise<T>,
  onResolved: (value: T) => void,
  onRejected: (error: unknown) => void,
): void {
  const idle = engine.mainVerbContinuationsInFlight === 0;
  engine.mainVerbContinuationsInFlight += 1;
  const begun = idle ? start() : engine.mainVerbChain.then(start);
  const settled = begun.then(onResolved).catch(onRejected);
  // The queue tail must never carry a rejection forward, or one failed verb would
  // reject every verb queued behind it.
  engine.mainVerbChain = settled.then(
    () => {},
    () => {},
  );
  void settled.finally(() => {
    engine.mainVerbContinuationsInFlight -= 1;
    if (engine.mainVerbContinuationsInFlight === 0 && !engine.mainEntryPending) {
      const passed = engine.deferredEndPhaseSeat;
      engine.deferredEndPhaseSeat = undefined;
      // The paid action may have crossed memory or ended the game while resolving.
      // In that case the ordinary post-verb check owns the turn end; a previously
      // requested voluntary pass no longer applies.
      if (passed !== undefined && !engine.state.gameOver && !engine.memory.hasCrossedToOpponent()) {
        applyIntent(engine, passed, { type: "endPhase" });
      }
    }
    if (engine.mainVerbContinuationsInFlight === 0) engine.projection.syncHandAffordances();
    checkTurnEndAfterVerb(engine);
  });
}
