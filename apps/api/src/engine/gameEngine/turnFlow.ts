import { EffectTiming, Zone, type CardInstance, type Seat } from "@aegis/shared";
import { insertCard, takeTop } from "../state/access.js";
import { type DurationBoundary as TurnBoundary } from "../TurnStateMachine.js";
import { canHatch, canMove } from "../actions/breeding.js";
import { fireTiming } from "./timing.js";
import { fireOncePerTurnWatchersOverSimultaneousSubjects, withPendingSubTriggers } from "./subTriggers.js";
import type { GameEngine } from "../GameEngine.js";

/**
 * Expire duration-scoped modifiers/rules at a turn/phase boundary, then re-derive
 * the continuous tier (subsystems: static-continuous-effects, effect-primitives).
 * Maps the turn-machine's boundary vocabulary to the ledgers' `DurationBoundary`
 * (whose seat-relative sweeps mirror how the engine's `Until*Effects`
 * clearing): a per-turn-end boundary sweeps both ledgers relative to the seat whose
 * turn just ended, so an `UntilOwnerTurnEnd` buff clears on its owner's end and an
 * `UntilOpponentTurnEnd` buff clears on the opponent's. The recompute that follows
 * re-applies the still-valid persistent effects from the post-sweep board.
 *
 * `ownerTurnStart` carries no modifier expiry of its own. `ownerActivePhaseEnd`
 * sweeps phase-scoped entries after the active-phase unsuspend, including the
 * `UntilNextUntap` window used by "during the next unsuspend phase" effects.
 */
export async function sweepDurations(engine: GameEngine, boundary: TurnBoundary): Promise<void> {
  const seat = engine.state.turnSeat;
  const sweep = (b: "ownerTurnEnd" | "opponentTurnEnd" | "eachTurnEnd" | "ownerActivePhase" | "nextUntap"): void => {
    engine.modifiers.sweep(engine.state, b, seat);
    engine.continuous.sweep(engine.state, b, seat);
  };
  switch (boundary) {
    case "ownerTurnEnd":
      sweep("ownerTurnEnd");
      // GRANTED timed watchers (BT23-056's [Start of Your Main Phase] install) expire at
      // their owner's turn end. `seat` is the seat whose turn
      // just ended, so a watcher anchored on that seat's permanent is now dropped.
      engine.subTriggers.sweepExpired(seat);
      break;
    case "opponentTurnEnd":
      sweep("opponentTurnEnd");
      break;
    case "eachTurnEnd":
      sweep("eachTurnEnd");
      engine.securityDp.sweepTurnEnd(seat);
      break;
    case "ownerTurnStart":
      break; // the recompute below refreshes the persistent tier for the new turn
    case "ownerActivePhaseEnd":
      // Active-phase unsuspend runs before engine boundary. A restriction with
      // UntilNextUntap must therefore block that unsuspend, then expire here.
      sweep("ownerActivePhase");
      sweep("nextUntap");
      break;
  }
  engine.projection.recomputeExpiredAffectationRecipients();
  // Re-derive the persistent tier from the post-sweep board.
  await engine.recomputeContinuousEffects();
}

/** Open an identity token for one battle, so nested battles do not sweep parent grants. */
export function beginBattleScope(engine: GameEngine): number {
  const scopeId = ++engine.battleScopeSequence;
  engine.modifiers.beginBattleScope(scopeId);
  engine.continuous.beginBattleScope(scopeId);
  return scopeId;
}

export function endBattleScope(engine: GameEngine, scopeId: number): void {
  engine.modifiers.endBattleScope(scopeId);
  engine.continuous.endBattleScope(scopeId);
}

/** Expire battle grants after its reactions, independently of the enclosing attack. */
export async function sweepBattleDurations(engine: GameEngine, scopeId?: number): Promise<void> {
  engine.modifiers.sweep(engine.state, "endBattle", engine.state.turnSeat, scopeId);
  engine.continuous.sweep(engine.state, "endBattle", engine.state.turnSeat, scopeId);
  engine.projection.recomputeExpiredAffectationRecipients();
  await engine.recomputeContinuousEffects();
  if (scopeId !== undefined) endBattleScope(engine, scopeId);
}

/** Expire attack grants, including unused battle grants when no battle occurred. */
export async function sweepCombatDurations(engine: GameEngine): Promise<void> {
  for (const boundary of ["endBattle", "endAttack"] as const) {
    engine.modifiers.sweep(engine.state, boundary, engine.state.turnSeat);
    engine.continuous.sweep(engine.state, boundary, engine.state.turnSeat);
  }
  engine.projection.recomputeExpiredAffectationRecipients();
  await engine.recomputeContinuousEffects();
}

/**
 * Unsuspend the turn player's permanents at the start of the Active phase
 * (Comprehensive Rules §6-2: "the turn player unsuspends all of their Digimon and
 * Tamers on the field at the same time"). Returns the permanent ids actually
 * flipped from suspended to unsuspended (for the event log). Breeding-area
 * permanents are also unsuspended (the source ActivePhase unsuspends every
 * controlled permanent).
 *
 * §16-11 ＜Reboot＞: opponent's Digimon with engine keyword also unsuspend during
 * the turn player's unsuspend phase.
 */
export async function unsuspendForActivePhase(engine: GameEngine, seat: Seat): Promise<string[]> {
  // The active-turn gate changes at passTurn(), and OpponentsTurn watchers are
  // continuous effects derived from that gate. Rebuild immediately before the
  // actual unsuspend operation so the transition cannot outrun watcher install.
  await engine.recomputeContinuousEffects();
  const flipped = await engine.unsuspendAllForSeat(seat);
  // ＜Reboot＞: the opponent's Digimon also unsuspend (§16-11)
  const oppSeat = seat === 0 ? 1 : 0;
  const oppFlipped = unsuspendRebootForSeat(engine, oppSeat);
  const allFlipped = [...flipped, ...oppFlipped];
  // Publish the simultaneous transition before its reactions can ask for input,
  // digivolve a subject, or suspend a just-unsuspended Tamer again (EX13 Rina).
  // Deferring these events until the hook returns shows the cause after its effects.
  for (const permanentId of allFlipped) {
    engine.hooks.emit({ kind: "cardsMoved", instanceIds: [permanentId], from: "suspended", to: "unsuspended" });
  }
  await fireOncePerTurnWatchersOverSimultaneousSubjects(engine, "whenUnsuspended", allFlipped, (permanentId) => ({
    unsuspendedPermanentId: permanentId,
  }));
  // SubTrigger bus: "when [engine/a matching] Digimon/Tamer becomes unsuspended" watchers
  // (23-card cluster). Covers both the turn player's own unsuspend and the opponent's
  // ＜Reboot＞ unsuspend — both are genuine suspended -> unsuspended transitions.
  for (const permanentId of allFlipped) {
    // Both seams of "becomes unsuspended": the timing window handwritten modules listen on
    // (BT11-032's bounce) and the SubTrigger bus the compiled watchers use. Dispatch the
    // event bus against the watcher armed immediately before engine unsuspend first; the
    // legacy timing window performs a trailing continuous recompute and would otherwise
    // invalidate that watcher before it could resolve.
    const payload = { unsuspendedPermanentId: permanentId };
    await engine.fireSubTrigger("whenUnsuspended", payload);
    await fireTiming(engine, EffectTiming.OnUnTappedAnyone, payload);
  }
  // The next timing is [Start of Your Main Phase]. Rebuild once after the whole
  // simultaneous unsuspend so conditional protection (for example, "while this
  // Digimon is suspended") has lapsed before granted main-phase effects test
  // whether they can activate and announce themselves.
  await engine.recomputeContinuousEffects();
  return allFlipped;
}

export async function unsuspendAllForSeat(engine: GameEngine, seat: Seat): Promise<string[]> {
  const player = engine.state.players[seat];
  if (player === undefined) return [];
  const flipped: string[] = [];
  const permanents = [...player.battleArea];
  if (player.breeding !== undefined) permanents.push(player.breeding);
  for (const permanent of permanents) {
    if (permanent.isSuspended) {
      if (engine.continuous.hasRestriction(permanent.permanentId, "unsuspend")) continue;
      if (
        engine.continuous.hasRestriction(permanent.permanentId, "unsuspendDuringOwnUnsuspendPhase") ||
        engine.continuous.hasRestriction(permanent.permanentId, "unsuspendDuringUnsuspendPhase")
      )
        continue;
      const handTrashCost = engine.continuous.restrictionCount(permanent.permanentId, "unsuspendHandTrashCost");
      if (handTrashCost > 0) {
        if (player.hand.length < handTrashCost) continue;
        const response = await engine.decisions.request({
          seat,
          kind: "selectCards",
          promptText: `Trash ${handTrashCost} card${handTrashCost === 1 ? "" : "s"} from your hand to unsuspend this Digimon?`,
          options: {
            candidateInstanceIds: Array.from(player.hand, (card) => card.instanceId),
            min: 0,
            max: handTrashCost,
            purpose: "cost",
          },
        });
        if (response.kind !== "selectCards" || response.instanceIds.length !== handTrashCost) continue;
        // BT7-055 GRANTS this cost to the opponent's Digimon ("You must trash 1 card in your
        // hand to unsuspend this Digimon"), so the granted effect is controlled by that
        // Digimon's controller — the same player paying. Carry that seat so "when one of your
        // effects trashes a card in your hand" watchers (BT7-077, ST16-13, …) see the payment.
        await engine.primitives.trash(response.instanceIds, { byEffectSeat: seat });
      }
      permanent.isSuspended = false;
      flipped.push(permanent.permanentId);
    }
  }
  return flipped;
}

/**
 * Unsuspend every opponent permanent that has ＜Reboot＞ and is eligible
 * to unsuspend (§16-11).
 */
export function unsuspendRebootForSeat(engine: GameEngine, seat: Seat): string[] {
  const player = engine.state.players[seat];
  if (player === undefined) return [];
  const flipped: string[] = [];
  for (const permanent of player.battleArea) {
    if (!permanent.isSuspended) continue;
    if (engine.continuous.hasRestriction(permanent.permanentId, "unsuspend")) continue;
    if (engine.continuous.hasRestriction(permanent.permanentId, "unsuspendDuringUnsuspendPhase")) continue;
    if (!engine.continuous.hasKeyword(permanent.permanentId, "Reboot")) continue;
    permanent.isSuspended = false;
    flipped.push(permanent.permanentId);
  }
  if (
    player.breeding?.isSuspended &&
    engine.continuous.hasKeyword(player.breeding.permanentId, "Reboot") &&
    !engine.continuous.hasRestriction(player.breeding.permanentId, "unsuspend") &&
    !engine.continuous.hasRestriction(player.breeding.permanentId, "unsuspendDuringUnsuspendPhase")
  ) {
    player.breeding.isSuspended = false;
    flipped.push(player.breeding.permanentId);
  }
  return flipped;
}

/**
 * Drive the interactive breeding phase (Comprehensive Rules §6-4). Opens the
 * breeding window for the turn player via the BreedingPhaseController; the player
 * takes at most one breeding action (the hatchEgg / moveFromBreeding intents drive
 * it) or skips with endPhase. When no breeding action is possible the window
 * auto-skips with no client round-trip (§6-4-1-3).
 */
export async function runBreedingPhase(engine: GameEngine, seat: Seat): Promise<void> {
  const possible = canHatch(engine.state, seat) || canMove(engine.state, seat);
  await engine.breeding.run(seat, !possible);
}

/**
 * Interim draw primitive: move the top `n` cards from a seat's deck to its hand,
 * returning the moved instances. Mirrors the source `rule implementation(owner, n).Draw()`
 * (deck top -> hand). The deck-out loss check is the security-and-win-check
 * subsystem's responsibility; engine stops at an empty deck and returns fewer cards.
 *
 * TODO(effect-primitives / deck-and-setup): replace with the canonical draw once
 *   that subsystem lands (which will also fire OnDraw and trigger deck-out loss).
 */
export async function drawCards(engine: GameEngine, seat: Seat, n: number): Promise<CardInstance[]> {
  const player = engine.state.players[seat];
  if (player === undefined) return [];
  const drawn: CardInstance[] = [];
  for (let i = 0; i < n; i++) {
    const top = takeTop(player, Zone.Deck);
    if (top === undefined) break; // deck-out; handled elsewhere
    insertCard(player, Zone.Hand, top);
    drawn.push(top);
  }
  if (drawn.length > 0) {
    // Both halves of one draw: the OnDraw window and the reactive watchers. The event
    // carries the drawing seat; the gate in runSubTrigger (interpreter.ts) fires a watcher
    // only when drawingSeat is the OPPONENT of the watcher's controller seat.
    await withPendingSubTriggers(engine, ["whenOpponentDraws"], { drawingSeat: seat }, () =>
      fireTiming(engine, EffectTiming.OnDraw, { drawnInstanceIds: drawn.map((c) => c.instanceId) }),
    );
  }
  return drawn;
}
