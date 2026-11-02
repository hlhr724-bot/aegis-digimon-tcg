import { CardKind, type Seat } from "@aegis/shared";
import { lookupDefinition } from "../../cards/cardData.js";
import {
  type AttackIntent,
  validateAttack,
  validateDigivolve,
  validateDnaDigivolve,
  validatePlayCard,
} from "../../actions/index.js";
import { playableFromHand } from "../intentGating.js";
import { attackDeps, digivolveDeps, dnaDigivolveDeps, playCardDeps } from "../actionDeps.js";
import type { GameEngine } from "../../GameEngine.js";
import { validateAppFusion } from "./play.js";

/**
 * Re-evaluate the turn-end condition after a turn-player verb has resolved: end the
 * Main phase if the gauge has crossed to the opponent, then auto-end it if the turn
 * player has no remaining legal action. Must run AFTER a continuation-based verb's
 * awaited effect resolves — running it synchronously after dispatch would end the
 * turn on the play cost's cross before the On Play effect ever ran.
 */
export function checkTurnEndAfterVerb(engine: GameEngine): void {
  // Main becomes observable before its asynchronous entry timing has completely
  // unwound. If a client submits a verb in that interval, the entry finalizer and
  // any nested state sync must not end the phase from the already-paid memory cost;
  // the continuation's own final check will run after every effect and decision.
  if (engine.mainVerbContinuationsInFlight > 0) return;
  // Nested plays/digivolutions can invoke engine hook while the outer card effect is
  // still resolving; the turn-end check belongs after that whole effect window.
  if (engine.activeWindowToken !== undefined) return;

  // Effects resolved inside an attack (for example ST12-10 playing Sistermon Ciel)
  // may restore memory and call engine hook before CombatController has released its
  // in-progress guard. At that instant every normal Main verb is intentionally
  // illegal, so `hasAnyMainPhaseAction` would mistake the transient combat window
  // for a dead Main phase and close the turn. The attack continuation calls engine
  // method again after `isAttacking` becomes false; only that final check may decide
  // whether the restored-memory turn remains open.
  if (engine.combat.isAttacking) return;

  engine.mainPhase.checkTurnEnd();
  if (engine.mainPhase.isOpen && !hasAnyMainPhaseAction(engine, engine.state.turnSeat)) {
    engine.mainPhase.endPhaseRequested(engine.state.turnSeat);
  }
}

export function isNewlyPlayedRushAttacker(engine: GameEngine, permanentId: string): boolean {
  const permanent = engine.access.permanentById(permanentId);
  return (
    permanent !== undefined &&
    engine.crossedMemoryRushAttackers.has(permanentId) &&
    permanent.controllerSeat === engine.state.turnSeat &&
    permanent.enterFieldTurnCount === engine.state.turnCount &&
    !permanent.isSuspended &&
    !engine.combat.attackedThisTurn.has(permanentId) &&
    engine.continuous.hasKeyword(permanentId, "Rush")
  );
}

/**
 * Whether `seat` has at least one legal Main-phase action right now: a playable
 * card, a digivolve option, a DNA digivolution, a link declaration, an available
 * attack, or an activatable [Main] effect. Returns as soon as any action is found
 * possible (short-circuit). Used to auto-end the turn when the player has nothing
 * left to do.
 *
 * Effect and link availability is read from the projections `syncActivatableEffects`
 * and `syncLinkTargets` publish for the client, recomputed here so the gate and the
 * affordances the player sees can never disagree about what is legal.
 */
export function hasAnyMainPhaseAction(engine: GameEngine, seat: Seat): boolean {
  const player = engine.state.players[seat];
  if (!player) return false;

  // 1. Activatable [Main] effects on every zone the projection covers: battle area,
  //    breeding, hand ([Hand][Main]) and trash ([Trash][Main]).
  engine.projection.syncActivatableEffects();
  const effectPermanents = [...player.battleArea];
  if (player.breeding !== undefined) effectPermanents.push(player.breeding);
  for (const perm of effectPermanents) {
    if (perm.activatableEffectsJson) return true;
  }
  for (const instance of [...player.hand, ...player.trash]) {
    if (instance.activatableEffectsJson) return true;
  }

  // 1b. Declare a link (§6-5-1-4) from hand or from a battle-area top card.
  engine.projection.syncLinkTargets();
  for (const instance of player.hand) {
    if (instance.linkTargetPermanentIds.length > 0) return true;
  }
  for (const perm of player.battleArea) {
    if (perm.topCard !== undefined && perm.topCard.linkTargetPermanentIds.length > 0) return true;
  }

  // 2. Play a card from hand. The plain validation prices the card at its printed cost, so a
  //    DigiXros / Assembly card whose declaration would lower the cost into range must read as
  //    an available action through the same material-route escape the hand affordances use
  //    (§7-2 / §7-3) — otherwise the turn auto-ends on a player who can still play it.
  const playDeps = playCardDeps(engine);
  const playCostReductionBlocked = engine.continuous.blocksCostReduction(seat, "play");
  for (const card of player.hand) {
    const def = lookupDefinition(card.cardId);
    if (!def || def.kinds.includes(CardKind.DigiEgg)) continue;
    const check = validatePlayCard(engine.state, seat, { type: "playCard", instanceId: card.instanceId }, playDeps);
    if (playableFromHand(check, card.cardId, playCostReductionBlocked)) return true;
  }

  // 3. App Fusion from hand using an explicitly linked physical material.
  for (const card of player.hand) {
    const def = lookupDefinition(card.cardId);
    if (!def?.kinds.includes(CardKind.Digimon)) continue;
    for (const perm of player.battleArea) {
      for (const linked of perm.linked) {
        const check = validateAppFusion(engine, seat, {
          type: "appFusion",
          permanentId: perm.permanentId,
          instanceId: card.instanceId,
          linkedInstanceId: linked.instanceId,
        });
        if (check.ok) return true;
      }
    }
  }

  // 4. Digivolve a hand Digimon onto a battle-area or breeding permanent
  const digiDeps = digivolveDeps(engine);
  for (const card of player.hand) {
    const def = lookupDefinition(card.cardId);
    if (!def?.kinds.includes(CardKind.Digimon)) continue;
    const targets = [...player.battleArea];
    if (player.breeding) targets.push(player.breeding);
    for (const perm of targets) {
      const check = validateDigivolve(
        engine.state,
        seat,
        {
          type: "digivolve",
          permanentId: perm.permanentId,
          instanceId: card.instanceId,
        },
        digiDeps,
      );
      if (check.ok) return true;
    }
  }

  // 5. DNA digivolve (§8-2): a printed DNA requirement names two materials, so the
  //    single-base `validateDigivolve` probe above always rejects it.
  if (player.battleArea.length >= 2) {
    const dnaDeps = dnaDigivolveDeps(engine);
    for (const card of player.hand) {
      const def = lookupDefinition(card.cardId);
      if (!def?.kinds.includes(CardKind.Digimon)) continue;
      for (let first = 0; first < player.battleArea.length; first++) {
        for (let second = first + 1; second < player.battleArea.length; second++) {
          const materialPermanentIds = [player.battleArea[first]!.permanentId, player.battleArea[second]!.permanentId];
          const check = validateDnaDigivolve(
            engine.state,
            seat,
            { type: "dnaDigivolve", materialPermanentIds, instanceId: card.instanceId },
            dnaDeps,
          );
          if (check.ok) return true;
        }
      }
    }
  }

  // 6. Attack with an unsuspended Digimon
  const deps = attackDeps(engine);
  const oppPlayer = engine.state.players[1 - seat];
  for (const perm of player.battleArea) {
    const intent: AttackIntent = { attackerPermanentId: perm.permanentId, target: { kind: "player" } };
    if (validateAttack(deps, seat, intent) === null) return true;
    if (oppPlayer) {
      for (const oppPerm of oppPlayer.battleArea) {
        if (!oppPerm.isSuspended) continue;
        const permIntent: AttackIntent = {
          attackerPermanentId: perm.permanentId,
          target: { kind: "permanent", permanentId: oppPerm.permanentId },
        };
        if (validateAttack(deps, seat, permIntent) === null) return true;
      }
    }
  }

  return false;
}
