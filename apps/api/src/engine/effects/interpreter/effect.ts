import { printedSentence } from "#api/engine/decisions/printedSentence";
import { OptionalActivationCancelled } from "#api/engine/effects/OptionalActivationCancelled";
import { canCancelOptionalActivation } from "#api/engine/effects/interpreter/canCancelOptionalActivation";
import { keepsFollowUpAfterDeclinedTarget } from "#api/engine/effects/interpreter/keepsFollowUpAfterDeclinedTarget";
import { getSingleHandActionCostBenefit } from "#api/engine/effects/interpreter/getSingleHandActionCostBenefit";
import { getSingleHandCostBenefit } from "#api/engine/effects/interpreter/getSingleHandCostBenefit";
import { getDecisionActionSummary } from "#api/engine/effects/interpreter/getDecisionActionSummary";
import { getDecisionEffectSummary } from "#api/engine/effects/interpreter/getDecisionEffectSummary";
// Running one CardEffect, and deciding which timing window it belongs to.

import type { Effect } from "../Effect.js";
import type { EffectContext } from "../EffectContext.js";
import {
  activated,
  beforePayCost,
  breeding,
  colorWaiverStatic,
  digiXrosZoneStatic,
  digivolveCostStatic,
  endOfAttack,
  handCounter,
  inTrash,
  onAddHand,
  onDiscardSecurity,
  onDeletion,
  onPlay,
  security,
  securityStatic,
  securityTiming,
  staticModifier,
  turnTiming,
  whenMoving,
  whenAttacking,
  whenBlocked,
  whenDigivolving,
  whenTrashedFromBattleArea,
} from "../builders.js";
import type { BuilderOptions } from "../builders.js";
import { isBlitzGrant } from "./actions/combat.js";
import { canAttemptDnaDigivolve } from "./actions/dna.js";
import { borrowedProcessingCost } from "./borrowedProcessingCost.js";
import { canAttemptDigivolveBeforeCost } from "./actions/digivolve.js";
import { canAttemptDigivolveViaPlacement } from "./actions/canAttemptDigivolveViaPlacement.js";
import { isSecuritySearchDigivolvePair, runSecuritySearchDigivolve } from "./actions/securitySearchDigivolve.js";
import { canAttemptPlaceUnder } from "./actions/placeUnder.js";
import { canAttemptLink, canAttemptMindLink } from "./actions/link.js";
import { mayDeclareAttack } from "./actions/meta.js";
import { evaluateCondition } from "./conditions.js";
import { canPayCost, costIsAskedAsSelection, payCost } from "./costs.js";
import { describeAction, describeCost } from "./describe.js";
import { installEffectRunner, runAction } from "./dispatch.js";
import { ACTION_TYPE_KEYWORDS } from "./errors.js";
import { isBlastDigivolveMarker } from "./registration/keywords.js";
import { allowsOptionalProcessingCostWithoutTarget } from "./processingCondition.js";
import { paysProcessingCostBeforeOptional } from "./paysProcessingCostBeforeOptional.js";
import { candidateLooseInstances } from "./targeting/loose.js";
import { targetAfterSelfPlacementCost } from "./targeting/afterCost.js";
import { candidatePermanents, raiseDeletionDpCap } from "./targeting/permanents.js";
import { EffectDuration, EffectTiming } from "@aegis/shared";
import type { Action, CardEffect, Cost, Target } from "@aegis/shared";
import { canDetachPermanentTop, isDetachTopAction } from "./targeting/detachTop.js";

// ---------------------------------------------------------------------------
// IR -> EffectModule factory
// ---------------------------------------------------------------------------

/**
 * Map an IR trigger + the source flags to an engine EffectTiming. Returns
 * undefined for triggers with no current EffectTiming home (the card simply
 * contributes nothing at any timing for that effect — visible as "none" stub).
 */
function timingForTrigger(effect: CardEffect): EffectTiming | undefined {
  if (effect.timingOverride === "OnEnterFieldAnyone") return EffectTiming.OnEnterFieldAnyone;
  // A compound `[Security][Your Turn]`/`[Security][All Turns]` effect is a persistent
  // watcher while the face-up card remains in security, not the one-shot `[Security]`
  // skill window. Keep pure security skills on SecuritySkill below, but let the
  // continuous trigger reach recomputeContinuousEffects so its SubTrigger can arm.
  if (
    effect.isSecurity &&
    (effect.trigger === "YourTurn" || effect.trigger === "OpponentsTurn" || effect.trigger === "AllTurns")
  ) {
    return EffectTiming.None;
  }
  if (effect.isSecurity && effect.trigger === "Security") return EffectTiming.SecuritySkill;
  // A resident [Your Turn]/[All Turns] "when one of your cards would be played, reduce its
  // play cost" replacement participates in the pay-time window. This includes inherited
  // [Breeding] reducers such as BT23-073: they are neither ordinary static recompute effects
  // nor effects of the hand card being played, so BeforePayCost is their only consuming seam.
  if (
    (effect.trigger === "YourTurn" || effect.trigger === "AllTurns") &&
    effect.actions.some(
      (action) => action.kind === "Replacement" && action.event === "wouldBePlayed" && action.mode !== "instead",
    )
  ) {
    return EffectTiming.BeforePayCost;
  }
  // An `instead` listener can authorize DigiXros materials before payment. Arm it through
  // the ordinary continuous trigger so prepareDigiXrosPlay can consult it before the picker.
  // A printed [Your Turn] clause whose payload is an effect-driven digivolution is a
  // player-declared ability, not a continuous modifier. Keep the turn ownership guard from
  // the original trigger, but surface it in the Main-phase activation window so the player can
  // actually declare it (BT21-040, BT21-010, and the same generated shape in later sets).
  if (
    effect.trigger === "YourTurn" &&
    effect.actions.some((action) => ["Digivolve", "DnaDigivolve", "AppFuse"].includes(action.kind))
  ) {
    return EffectTiming.OnDeclaration;
  }
  switch (effect.trigger) {
    case "OnSecurityCheck":
      return EffectTiming.OnSecurityCheck;
    case "OnDetermineDoSecurityCheck":
      return EffectTiming.OnDetermineDoSecurityCheck;
    case "OnLoseSecurity":
      return EffectTiming.OnLoseSecurity;
    case "OnAddSecurity":
      return EffectTiming.OnAddSecurity;
    case "OnPlay":
      return EffectTiming.OnPlay;
    case "BeforePayCost":
      // "When this card would be played" — the pay-time window fired by the play action for the
      // in-hand card BEFORE memory is paid (EX9-043 / BT25-076 interactive cost reduction).
      return EffectTiming.BeforePayCost;
    case "WhenDigivolving":
      return EffectTiming.WhenDigivolving;
    case "WhenAttacking":
      return effect.attackScope === "ally" ? EffectTiming.OnAllyAttack : EffectTiming.OnUseAttack;
    case "WhenBlocked":
      return EffectTiming.OnBlockAnyone;
    case "OnDeletion":
    case "OnDestroyedAnyone":
      return EffectTiming.OnDestroyedAnyone;
    case "OnDiscardSecurity":
      return EffectTiming.OnDiscardSecurity;
    case "EndOfAttack":
      return EffectTiming.OnEndAttack;
    case "WhenBattleDeleteOpponent":
      return EffectTiming.OnBattleDeleteOpponent;
    case "whenTrashedFromBattleArea":
      return EffectTiming.WhenTrashedFromBattleArea;
    case "StartOfYourTurn":
    case "StartOfOpponentsTurn":
      return EffectTiming.OnStartTurn;
    case "StartOfYourMainPhase":
    case "StartOfOpponentsMainPhase":
      return EffectTiming.OnStartMainPhase;
    case "EndOfYourTurn":
    case "EndOfOpponentsTurn":
    case "EndOfAllTurns":
      return EffectTiming.OnEndTurn;
    case "Main":
      // A ＜Delay＞-keyworded [Main] clause is NOT the on-play option effect — it is the
      // delayed activatable ("by trashing this card in your battle area, [payload]; can't
      // activate the turn it enters"), surfaced as an OnDeclaration ability on the option
      // permanent the on-play effect placed. Routing it here keeps it OFF the OnUseOption play
      // resolution so it no longer fires immediately on play.
      if ((effect.keywords ?? []).some((kw) => kw.keyword === "Delay")) {
        return EffectTiming.OnDeclaration;
      }
      return EffectTiming.OnUseOption;
    case "Security":
      return EffectTiming.SecuritySkill;
    case "WhenEffectAddsToHand":
      // "When one of your Digimon's effects adds cards to your hand" (BT15-002's inherited
      // clause): the engine's own add-to-hand window. Distinct from `Hand`, which tags an
      // effect the controller ACTIVATES while the card sits in hand.
      return EffectTiming.OnAddHand;
    case "Hand":
      return EffectTiming.OnDeclaration;
    case "Counter":
      // A ＜Blast Digivolve＞/＜Blast DNA Digivolve＞-keyworded "Counter" entry is NOT a real
      // [Counter] effect — it's the compiler's marker for those keywords (§16-26/§16-31; see
      // BT14-014/AD1-005/BT19-050's empty-actions Counter entries and EX5-053's hand-written
      // self-GainKeyword variant, plus the "[Hand][Counter] marker" callout in
      // ch16c-deletion-and-advanced-keywords.test.ts's AD1-005 case — isBlastDigivolveMarker
      // recognizes both compile shapes). §16-26-1/§16-31-1's actual behavior — digivolving from
      // hand without paying the cost — is implemented at the `digivolve` verb (GameEngine's
      // digivolveDeps -> DigivolveDeps.costWaived, sourced from registerBlastDigivolveFromEffects'
      // hasBlastDigivolveKeyword registry below), NOT through this marker's IR routing: its
      // `actions` are empty, so there is nothing for the effect-activation framework to resolve
      // either way. Routing it here keeps it OFF the real §11-3 Counter Timing window (which
      // would otherwise offer a no-op/mistagged activation there) and back at its old
      // OnDeclaration home — already unreachable there (activateEffect.ts gates on the turn
      // player / Phase.Main / a board-placed source, none of which a defending player's hand
      // card satisfies), so this preserves prior behavior.
      if (isBlastDigivolveMarker(effect)) {
        return EffectTiming.OnDeclaration;
      }
      // §11-3 Counter Timing: activated by the non-turn (defending) player between
      // an attack's When Attacking effects and block timing, capped at 1 per attack
      // (§11-3-2) — its own window, distinct from the turn-player's OnDeclaration
      // [Main]-activation bucket (activateEffect.ts ACTIVATE_TIMING).
      return EffectTiming.OnCounterTiming;
    case "WhenMoving":
      // §15-16-16-1: "[When Moving] triggers at the point the card with that effect is
      // moved." — the engine's own OnMove window (GameEngine fires it exactly at the
      // breeding <-> battle move point), not the continuous/static bucket.
      return EffectTiming.OnMove;
    case "WhenLinking":
      return EffectTiming.OnLinking;
    case "AllTurns":
    case "YourTurn":
    case "OpponentsTurn":
    case "Trash":
    case "Breeding":
    case "Rule":
    case "Static":
      return EffectTiming.None; // continuous / static window
    default:
      return EffectTiming.None;
  }
}

/**
 * Every EffectTiming window an effect contributes at. Usually one (timingForTrigger),
 * but a `[Main]` effect has TWO homes, reconciling the IR with the engine's two
 * distinct main windows:
 *   - {@link EffectTiming.OnUseOption} — an Option's [Main] body, fired by play-card
 *     when the Option resolves from hand.
 *   - {@link EffectTiming.OnDeclaration} — a player-activated [Main] ability on a
 *     permanent, reached via the `activateEffect` verb (ACTIVATE_TIMING). The IR files
 *     every `[Main]` under one trigger, so without also exposing it here a permanent's
 *     activated [Main] ability would be unreachable (the verb queries OnDeclaration).
 * The kernel/verb placement guards keep each correct: play-card only fires OnUseOption
 * for the resolving Option, and activateEffect only reaches a controlled source.
 *
 * The OnDeclaration co-home must NOT be given to an Option's ON-PLAY BODY — its first [Main]
 * clause, the one play-card fires via OnUseOption. Exposing that at OnDeclaration too would make
 * an Option that places itself as a battle-area permanent (the whole option-permanent family)
 * re-activate its play effect on the permanent. A LATER [Main] clause on an option permanent IS a
 * genuine activated ability (e.g. P-103/P-104's "trash self, then digivolve") and keeps the
 * co-home; a ＜Delay＞ clause is keyworded and already routes to OnDeclaration via timingForTrigger.
 * `isOptionPlayBody` (computed by irCardModule, which tracks the first plain [Main]) flags the one
 * clause to restrict.
 */
export function timingsForTrigger(effect: CardEffect, isOptionPlayBody: boolean): EffectTiming[] {
  const primary = timingForTrigger(effect);
  if (primary === undefined) return [];
  const isDelay = (effect.keywords ?? []).some((kw) => kw.keyword === "Delay");
  if (!effect.isSecurity && effect.trigger === "Main" && !isDelay && !isOptionPlayBody) {
    return [EffectTiming.OnUseOption, EffectTiming.OnDeclaration];
  }
  return [primary];
}

/**
 * A `Static` effect whose only job is a digivolve-cost CostModifier (e.g. BT7-040's
 * "When digivolving into this card from your hand, the cost = your security count")
 * is loose-zone resident: the destination stays in hand or its declared resident zones, so it must
 * NOT carry the on-field base guard that `staticModifier` applies (which would make it
 * inert). Detect that shape so the IR routes it through `digivolveCostStatic`.
 */
function isLooseResidentDigivolveCostStatic(effect: CardEffect): boolean {
  const isStaticTrigger = effect.trigger === "Static" || effect.trigger === "Rule";
  if (!isStaticTrigger) return false;
  const actions = effect.actions ?? [];
  if (actions.length === 0) return false;
  // Gate on an explicit loose-zone residency marker (documented behavior
  // `HandCards.Contains(card)` + `cardSource == card`), not merely on "all actions are
  // digivolve CostModifiers". An on-field digivolve-cost static (which lacks the marker)
  // must NOT lose its on-field base guard via this hand-permissive route (WR-01).
  return actions.every((a) => a.kind === "CostModifier" && (a.handResident === true || a.residentZones !== undefined));
}

/**
 * A `Static`/`Rule` effect whose actions are ALL `WaiveColorRequirement` (§16-42 ＜Use
 * Req.＞ and the pre-existing corpus idiom it now matches — EX2-072, BT19-093, BT7-110,
 * ...) must not carry `staticModifier`'s on-field base guard. `WaiveColorRequirement`'s
 * only supported shape is self-targeted, so the effect always describes "waive the SAME
 * card's own color requirement" — checked at PLAY time (playCard.ts) or DIGIVOLVE time
 * (digivolve.ts), i.e. while the card is off the battle area. Requiring on-field presence
 * first makes the waiver permanently inert for that moment (see `colorWaiverStatic` in
 * builders.ts for the full writeup). Scoped narrowly, mirroring
 * `isLooseResidentDigivolveCostStatic`: an ordinary Static effect that ALSO does something
 * else keeps the on-field guard untouched.
 */
function isColorWaiverStatic(effect: CardEffect): boolean {
  const isStaticTrigger = effect.trigger === "Static" || effect.trigger === "Rule";
  if (!isStaticTrigger) return false;
  const actions = effect.actions ?? [];
  if (actions.length === 0) return false;
  return actions.every((a) => a.kind === "WaiveColorRequirement");
}

/**
 * A Static/Rule/YourTurn/AllTurns/OpponentsTurn effect whose actions are ALL a SubTrigger
 * install for the hand-resident event "when this card is trashed from the hand"
 * (BT24-013/-026/-045) must not carry `staticModifier`'s on-field
 * base guard: the watching card is resident in HAND when these events are relevant, never
 * on the battle area (the same shape `isColorWaiverStatic`/`isLooseResidentDigivolveCostStatic`
 * handle one gate over). Without this, `canTrigger` fails before the effect ever reaches
 * `resolve()`, so the eighth-gap anchor-less `subscribeSubTrigger` fix never gets a chance
 * to install the watcher at all — proven empirically (BT24-013 registered in hand, trashed,
 * no draw fired) even after the anchor fix alone.
 */
// `whenHandTrashed` is different: it watches an action affecting the controller's hand
// while the source Digimon/Tamer remains in play (BT25-084). Treating that event as
// hand-resident leaves a phantom watcher alive after its permanent is deleted.
const HAND_TRASH_ANCHOR_LESS_EVENTS = new Set(["whenTrashedFromHand"]);

function isHandTrashWatcherHost(effect: CardEffect): boolean {
  // Only "when this card is trashed" has a hand-resident source. Ordinary reactions
  // to another hand card being trashed (ST16-13, BT6-081) need a live battle-area host.
  // Inherited reactions only exist while their card is in a Digimon's stack. Routing them
  // through the hand-resident builder makes loose copies in hand/trash install phantom
  // watchers (BT6-006/-069/-073), so a later discard can trigger cards that were never in play.
  if (effect.isInherited) return false;
  const continuousLikeTrigger =
    effect.trigger === "Static" ||
    effect.trigger === "Rule" ||
    effect.trigger === "YourTurn" ||
    effect.trigger === "AllTurns" ||
    effect.trigger === "OpponentsTurn";
  if (!continuousLikeTrigger) return false;
  const actions = effect.actions ?? [];
  if (actions.length === 0) return false;
  return actions.every(
    (a) => a.kind === "SubTrigger" && HAND_TRASH_ANCHOR_LESS_EVENTS.has(a.event) && a.sourceFilter?.isSelfRef === true,
  );
}

/**
 * A `Static`/`Rule` effect whose actions are ALL a self-targeted `digixrosFromTrash` GrantStatic
 * ("While you have a black Tamer, cards from your trash may also be placed for THIS CARD's
 * DigiXros" — BT17-057 Q2811; BT18-065's Vemmon prints the same shape) must not carry
 * `staticModifier`'s on-field base guard. The moment the permission matters is the DigiXros
 * declaration, when the card is still in HAND, so the on-field guard makes it permanently inert.
 * Scoped narrowly, mirroring `isColorWaiverStatic`: a Static that also does something else keeps
 * the on-field guard. `runGrantStatic` scopes the resulting ledger entry to this card's own
 * pending play, so an off-field copy never widens anyone else's DigiXros.
 */
function isDigiXrosZoneStatic(effect: CardEffect): boolean {
  const isStaticTrigger = effect.trigger === "Static" || effect.trigger === "Rule";
  if (!isStaticTrigger) return false;
  const actions = effect.actions ?? [];
  if (actions.length === 0) return false;
  return actions.every((a) => a.kind === "GrantStatic" && (a as { grant?: string }).grant === "digixrosFromTrash");
}

/** Pick the timing builder that matches an IR trigger. */
export function builderForTrigger(effect: CardEffect): (opts: BuilderOptions) => Effect {
  if (effect.timingOverride === "OnEnterFieldAnyone") return turnTiming;
  if (
    effect.isSecurity &&
    (effect.trigger === "YourTurn" || effect.trigger === "OpponentsTurn" || effect.trigger === "AllTurns")
  ) {
    return securityStatic;
  }
  if (effect.trigger === "Security") return security;
  if (effect.isSecurity) return securityTiming;
  if (
    effect.trigger === "YourTurn" &&
    effect.actions.some((action) => ["Digivolve", "DnaDigivolve", "AppFuse"].includes(action.kind))
  ) {
    return activated;
  }
  if (isLooseResidentDigivolveCostStatic(effect)) return digivolveCostStatic;
  if (isColorWaiverStatic(effect)) return colorWaiverStatic;
  if (isDigiXrosZoneStatic(effect)) return digiXrosZoneStatic;
  if (isHandTrashWatcherHost(effect)) return onAddHand;
  // A `{Breeding}` timed effect (BT22-007 {Breeding}[Start of Your Main Phase]) keeps its timing
  // (OnStartMainPhase) and turn-owner gate, but its base "still-relevant" guard is "in breeding"
  // rather than "on the battle area". The `breeding` builder supplies
  // that base guard; turnOwnerGuard(effect.trigger) is still ANDed in via the builder `when`.
  if (effect.isBreeding) return breeding;
  // `[Trash]`-tagged timed/continuous effects (§15-14-3-1, e.g. BT26-078's `[Trash][Your
  // Turn]`) keep their timing but swap the base "still-relevant" guard from on-field to
  // actual trash residency — mirroring `effect.isBreeding` above. `[Trash][Main]` is
  // handled separately (see `activated`'s `isFromTrash` opt): it shares the `Main`
  // trigger with every ordinary activated ability, so it cannot be routed by builder
  // selection alone.
  if (effect.isFromTrash && effect.trigger !== "Main") return inTrash;
  if (effect.trigger === "Counter" && effect.isFromHand) return handCounter;
  switch (effect.trigger) {
    case "OnPlay":
      return onPlay;
    case "BeforePayCost":
      return beforePayCost;
    case "WhenDigivolving":
      return whenDigivolving;
    case "WhenAttacking":
      return whenAttacking;
    case "EndOfAttack":
      return endOfAttack;
    case "WhenBlocked":
      return whenBlocked;
    case "WhenMoving":
      return whenMoving;
    case "OnDeletion":
      return onDeletion;
    case "OnDiscardSecurity":
      return onDiscardSecurity;
    case "whenTrashedFromBattleArea":
      return whenTrashedFromBattleArea;
    case "Main":
      return activated;
    case "WhenEffectAddsToHand":
    case "Hand":
      return onAddHand;
    case "Trash":
      return inTrash;
    case "Breeding":
      return breeding;
    case "AllTurns":
    case "YourTurn":
    case "OpponentsTurn":
    case "Static":
    case "Rule":
      return staticModifier;
    default:
      return turnTiming;
  }
}

/**
 * Mark every top-level SubTrigger/Replacement action of a continuous-window ＜Delay＞ effect
 * (CAP-E14 fix, comprehensive rules §16-17) with an INTRINSIC delay gate: "while this card is
 * in the battle area, by trashing it, the effect activates" applies regardless of whether the
 * arming condition is a reactive event (`[All Turns] When X, ＜Delay＞`) rather than a player-
 * declared `[Main]` window — the OnDeclaration branch above already covers the latter. Skips
 * any action that already opts into the separate GainKeyword-armed model
 * (`requiresDelayArmed`, e.g. BT17-097's dynamically-granted Delay) — that model's grant/consume
 * gate is a deliberate, distinct encoding and is left untouched. `delayArmedIntrinsic` is a
 * synthesized marker read by `runSubTrigger`/`runReplacement`, not part of the compiled IR.
 */
export function withIntrinsicDelayGate(effect: CardEffect): CardEffect {
  const actions = (effect.actions ?? []).map((action): typeof action => {
    if (action.kind !== "SubTrigger" && action.kind !== "Replacement") return action;
    if ((action as { requiresDelayArmed?: boolean }).requiresDelayArmed === true) return action;
    return { ...action, delayArmedIntrinsic: true } as unknown as typeof action;
  });
  return { ...effect, actions };
}

/**
 * Carry a continuous effect's printed turn window onto the watcher it installs. The watcher
 * outlives the resolution that armed it, so without this a `[Your Turn]` clause's watcher would
 * keep firing on the opponent's turn (EX11-004's inherited draw).
 */
export function withSubTriggerTurnScope(effect: CardEffect): CardEffect {
  const turnScope =
    effect.trigger === "YourTurn" ? "yourTurn" : effect.trigger === "OpponentsTurn" ? "opponentsTurn" : undefined;
  if (turnScope === undefined) return effect;
  const actions = (effect.actions ?? []).map((action): typeof action =>
    action.kind === "SubTrigger" && action.turnScope === undefined ? { ...action, turnScope } : action,
  );
  return { ...effect, actions };
}

/** Carry a continuous effect's printed frequency onto the watcher that actually fires. */
export function withSubTriggerFrequency(effect: CardEffect, effectKey: string): CardEffect {
  if (effect.frequency !== "OncePerTurn") return effect;
  const actions = (effect.actions ?? []).map((action): typeof action =>
    action.kind === "SubTrigger" || action.kind === "Replacement"
      ? ({ ...action, oncePerTurnKey: action.oncePerTurnKey ?? effectKey } as typeof action)
      : action,
  );
  return { ...effect, actions };
}

/**
 * A continuous effect that reads a live keyword depends on keyword-provider effects from the
 * same board. This includes `selfHasKeyword` conditions and TargetFilter keyword clauses such
 * as Craniamon's "all of your Digimon with Blocker" restriction. Providers must resolve at
 * priority 0 and these consumers at priority 1, otherwise board enumeration order can make a
 * conferred/inherited keyword invisible for the whole continuous pass.
 */
export function readsSelfKeyword(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(readsSelfKeyword);
  const record = value as Record<string, unknown>;
  if (record.kind === "selfHasKeyword") return true;
  const filter = record.filter;
  if (filter !== null && typeof filter === "object" && !Array.isArray(filter)) {
    const candidate = filter as Record<string, unknown>;
    if (
      candidate.dp !== undefined ||
      (Array.isArray(candidate.keywords) && candidate.keywords.length > 0) ||
      (Array.isArray(candidate.excludeKeywords) && candidate.excludeKeywords.length > 0)
    ) {
      return true;
    }
  }
  return Object.values(record).some(readsSelfKeyword);
}

/**
 * Blanket or source-kind effect immunity must exist before opponent continuous effects resolve
 * their targets. Otherwise a board enumerated source-first can install an aura restriction before
 * the recipient's later static immunity is visible, making continuous results depend on seat/card
 * order (EX11-011 Q5799). Run these providers one tier before ordinary continuous effects.
 */
export function providesEffectImmunity(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(providesEffectImmunity);
  const record = value as Record<string, unknown>;
  if (record.kind === "GrantImmunity") return true;
  if (record.kind === "Restrict" && record.restriction === "beAffected") return true;
  if (record.kind === "GrantStatic") {
    if (
      record.grant === "immuneToOpponentEffects" ||
      record.grant === "immuneToOpponentDigimonEffects" ||
      record.grant === "immuneToOpponentOptionEffects"
    ) {
      return true;
    }
    const grant = record.grant;
    if (grant !== null && typeof grant === "object") {
      const objectGrant = grant as Record<string, unknown>;
      if (objectGrant.immunity === true || objectGrant.immuneToOpponentEffects === true) return true;
    }
  }
  return Object.values(record).some(providesEffectImmunity);
}

/**
 * (`(!yourTurn || IsOwnerTurn) && (!opponentTurn || IsOpponentTurn)`). A `[Your Turn]` /
 * StartOf-Your / EndOf-Your effect may fire only while its owner is the turn player; the
 * `[Opponent's Turn]` variants only on the opponent's turn. AllTurns / Static / Rule have no
 * turn gate. The IR carries the owner in the trigger string but emits no `isYourTurn`
 * condition, so the gate is derived here (and routed through the builder's `when`, ANDed
 * into `canTrigger`) rather than read from a `when` clause.
 */
export function turnOwnerGuard(trigger: CardEffect["trigger"]): ((ctx: EffectContext) => boolean) | undefined {
  switch (trigger) {
    case "YourTurn":
    case "StartOfYourTurn":
    case "StartOfYourMainPhase":
    case "EndOfYourTurn":
      return (ctx) => ctx.game.state.turnSeat === ctx.source.ownerSeat;
    case "OpponentsTurn":
    case "StartOfOpponentsTurn":
    case "StartOfOpponentsMainPhase":
    case "EndOfOpponentsTurn":
      return (ctx) => ctx.game.state.turnSeat === ctx.game.opponentOf(ctx.source.ownerSeat);
    default:
      return undefined;
  }
}

/** Run all actions of a CardEffect in order against the context. */
/**
 * Effect-RESULT bindings a resolution produces. `runEffect` runs the actions on its own derived
 * context, so these are mirrored back onto the caller's context afterwards: the outcome of the
 * resolution ("did this effect delete / use an Option / digivolve") is what a caller and the
 * gated tail both read (KB EX8-037 Q4738).
 */
const RESULT_BINDING_KEYS = [
  "lastDeleteCount",
  "lastDeletedLevel",
  "lastDeletedDP",
  "lastDigivolveResult",
  "lastOptionUsed",
  "lastEffectActed",
  "lastOpponentDeclined",
  "lastPlayedPermanentIds",
  "lastSuspendedPermanentIds",
  "lastRevealedCards",
  "lastDeletedByThisEffectIds",
  "lastDeletedPermanentSnapshots",
  "namedCounts",
  "boundPlayed",
  "playCostDelta",
] as const satisfies readonly (keyof EffectContext)[];

function mirrorResultBindings(from: EffectContext, to: EffectContext): void {
  if (from === to) return;
  for (const key of RESULT_BINDING_KEYS) {
    if (from[key] !== undefined) (to as unknown as Record<string, unknown>)[key] = from[key];
  }
}

function isPredecidableProcessingCost(
  action: Action,
): action is Exclude<Action, { kind: "RawUnparsed" }> & { cost: Cost } {
  return !(
    action.kind === "RawUnparsed" ||
    action.kind === "SubTrigger" ||
    action.kind === "Replacement" ||
    action.kind === "WaiveColorRequirement" ||
    action.cost === undefined ||
    typeof action.cost === "number" ||
    action.condition !== undefined ||
    ("while" in action && action.while !== undefined)
  );
}

function paysFromHandOnly(cost: Cost): boolean {
  if (cost.kind !== "trash" || cost.target?.from === undefined) return true;
  const zones = Array.isArray(cost.target.from) ? cost.target.from : [cost.target.from];
  return zones.every((zone) => zone === "hand");
}

/**
 * Asks a later action's optional processing condition ("Then, by X, Y") when its clause is
 * reached, in printed order: whether to pay, or which hand card or own Digimon pays. The answer
 * goes into the context's predecided maps, which `runAction` consumes for this action. A
 * condition that can't be paid in full is not offered and counts as declined (§15-7-3, §15-7-4),
 * so its payload is skipped (§15-7-2). A printed "By X" is the player's choice even when the IR
 * payload is mandatory (§15-7-1).
 */
async function decideProcessingConditionAtClause(ctx: EffectContext, action: Action, index: number): Promise<void> {
  if (index === 0 || !isPredecidableProcessingCost(action)) return;
  const effectiveCost = borrowedProcessingCost(ctx, action.cost);
  const selectionChoice = costIsAskedAsSelection(effectiveCost) && paysFromHandOnly(effectiveCost);
  if (
    !/^\s*by\b/i.test(effectiveCost.raw ?? "") &&
    effectiveCost.optional !== true &&
    !(selectionChoice && action.optional === true)
  )
    return;
  const canPay = canPayCost(ctx, effectiveCost);
  const paysCostFirst = paysProcessingCostBeforeOptional(action);
  const costChoice =
    effectiveCost.optional === true ||
    action.optional !== true ||
    paysCostFirst ||
    action.kind === "CostGatedBlock" ||
    action.kind === "CostModifier";
  const outerSingleHandCostBenefit = ctx.activeSingleHandCostBenefit;
  ctx.activeSingleHandCostBenefit = getSingleHandActionCostBenefit({ action });
  const outerDecisionSummary = ctx.activeDecisionSummary;
  ctx.activeDecisionSummary = getDecisionActionSummary({ action });
  const outerEffectTextPart = ctx.activeEffectTextPart;
  const outerEffectTextEmphasis = ctx.activeEffectTextEmphasis;
  const outerPayingCostDepth = ctx.payingCostDepth;
  const outerTargetFate = ctx.activeTargetFate;
  if (action.effectTextPart !== undefined) ctx.activeEffectTextPart = action.effectTextPart;
  const printedCostClause =
    action.effectTextPart === undefined && effectiveCost.raw !== undefined && ctx.activeEffectText !== undefined
      ? printedSentence(ctx.activeEffectText, effectiveCost.raw)
      : undefined;
  if (costChoice && paysCostFirst && effectiveCost.raw !== undefined) {
    ctx.activeEffectTextPart = ctx.activeEffectText;
    ctx.activeEffectTextEmphasis = action.costTextEmphasis ?? effectiveCost.raw;
  } else if (printedCostClause !== undefined) {
    ctx.activeEffectTextPart = ctx.activeEffectText;
    ctx.activeEffectTextEmphasis = action.costTextEmphasis ?? printedCostClause;
  }
  let chosen: boolean;
  try {
    if (selectionChoice && canPay) {
      const cost = effectiveCost;
      ctx.payingCostDepth = (outerPayingCostDepth ?? 0) + 1;
      ctx.activeTargetFate = cost.kind === "deleteOwn" ? "delete" : "trash";
      let selected: string[];
      if (cost.kind === "trash" && cost.target !== undefined) {
        const candidates = candidateLooseInstances(ctx, cost.target, ["hand"]).map((card) => card.instanceId);
        const want = typeof cost.target.count === "number" ? cost.target.count : 1;
        selected = candidates.length >= want ? await ctx.ask.selectCards(ctx, { candidates, min: 0, max: want }) : [];
      } else if (cost.kind === "deleteOwn" && cost.target !== undefined) {
        const candidates = candidatePermanents(ctx, raiseDeletionDpCap(ctx, cost.target)).map(
          (permanent) => permanent.permanentId,
        );
        const want = typeof cost.target.count === "number" ? cost.target.count : 1;
        selected = candidates.length >= want ? await ctx.ask.chooseTargets(ctx, { candidates, min: 0, max: want }) : [];
      } else {
        selected = [];
      }
      ctx.predecidedCostSelections?.set(action, selected);
      chosen = selected.length === (effectiveCost.target?.count ?? 1);
    } else {
      chosen =
        canPay &&
        (await ctx.ask.optional(
          ctx,
          costChoice ? `Pay cost: ${describeCost(effectiveCost)}?` : describeAction(action),
        ));
    }
  } finally {
    ctx.activeSingleHandCostBenefit = outerSingleHandCostBenefit;
    ctx.activeDecisionSummary = outerDecisionSummary;
    ctx.activeEffectTextPart = outerEffectTextPart;
    ctx.activeEffectTextEmphasis = outerEffectTextEmphasis;
    ctx.payingCostDepth = outerPayingCostDepth;
    ctx.activeTargetFate = outerTargetFate;
  }
  if (costChoice) ctx.predecidedOptionalCosts?.set(action, chosen);
  else ctx.predecidedOptionalActions?.set(action, chosen);
  if (chosen) {
    ctx.onActivationChosen?.();
    ctx.oncePerTurnActivationChosen = true;
    ctx.oncePerTurnActivationDeclined = false;
  }
}

export async function runEffect(ctx: EffectContext, effect: CardEffect): Promise<void> {
  const outerActivationCancellation = ctx.optionalActivationCancellation;
  ctx.optionalActivationCancellation = undefined;
  try {
    const declaredProcessingCondition = ctx.declaredProcessingCondition === true;
    // Consume even if this resolution fizzles before any action can run.
    ctx.declaredProcessingCondition = false;
    if (effect.condition && !evaluateCondition(ctx, effect.condition)) return;
    // Turn-condition gate for triggers that carry an explicit turnCondition field rather than
    // encoding the turn direction in the trigger name (e.g. whenTrashedFromBattleArea, BT19-095).
    if (effect.turnCondition !== undefined) {
      const isOwnerTurn = ctx.game.state.turnSeat === ctx.source.ownerSeat;
      if (effect.turnCondition === "yourTurn" && !isOwnerTurn) return;
      if (effect.turnCondition === "opponentsTurn" && isOwnerTurn) return;
    }
    // Fresh selection-binding store for this resolution (SelectBind -> later relativeTo refs).
    // A caller that already seeded `selections` is asking to be resolved ON ITS OWN context, because
    // it reads back what the actions write there (GameEngine.fireBeforePayCost and its
    // `playCostDelta`). Copying would strand every such write, so only an unseeded context is cloned.
    // Nested effects receive their own choice; the declaration commits only this clause.
    const ctxWithSelections: EffectContext = ctx.selections ? ctx : { ...ctx, selections: new Map() };
    // Restrictions belong to this effect resolution only, so the inherited set is swapped for a clone
    // and put back afterwards: a nested or subsequent effect must not retain this card's restriction.
    const outerCancellation = ctxWithSelections.optionalActivationCancellation;
    const activationIsTentative =
      canCancelOptionalActivation({ effect }) &&
      ctx.oncePerTurnActivationChosen !== true &&
      ctx.isActivationPending?.() !== false;
    const declinedTargetKeepsFollowUp =
      activationIsTentative && keepsFollowUpAfterDeclinedTarget({ ctx: ctxWithSelections, effect });
    ctxWithSelections.optionalActivationCancellation =
      activationIsTentative && !declinedTargetKeepsFollowUp ? { available: true } : undefined;
    if (declinedTargetKeepsFollowUp) {
      ctxWithSelections.onActivationChosen?.();
      ctxWithSelections.oncePerTurnActivationChosen = true;
      ctxWithSelections.oncePerTurnActivationDeclined = false;
    }
    const outerRestrictions = ctxWithSelections.effectRestrictions;
    ctxWithSelections.effectRestrictions = new Set(ctx.effectRestrictions ?? []);
    const sourceDefinition = ctx.source.definition ?? ctx.game.definitionOf({ cardId: ctx.source.cardId } as never);
    ctxWithSelections.activeTiming =
      effect.timingOverride ?? (ctx.activeTiming === "None" ? undefined : ctx.activeTiming) ?? effect.trigger;
    ctxWithSelections.activeEffectIsInherited = effect.isInherited === true;
    ctxWithSelections.activeEffectText =
      effect.description ??
      (effect.isInherited
        ? sourceDefinition?.inheritedEffectText
        : // Resident [Security][Your Turn] clauses are printed in the main text.
          // Only the checked-card skill uses the separate security-effect text.
          effect.trigger === "Security"
          ? sourceDefinition?.securityEffectText
          : // [When Linking] and every linked-card effect are printed only in the link box.
            effect.trigger === "WhenLinking" || effect.isLinked === true
            ? (sourceDefinition?.linkEffect ?? sourceDefinition?.effectText)
            : sourceDefinition?.effectText);
    // A whole-clause cost is an activation cost for every action below it (Comprehensive §5-3):
    // preflight it before anything resolves and pay it once. An action inside the clause that
    // aborts — an opponent declining an optional — does not refund it.
    if (effect.cost !== undefined) {
      const outerSingleHandCostBenefit = ctxWithSelections.activeSingleHandCostBenefit;
      ctxWithSelections.activeSingleHandCostBenefit = getSingleHandCostBenefit({
        actions: effect.actions,
        cost: effect.cost,
      });
      const outerDecisionSummary = ctxWithSelections.activeDecisionSummary;
      ctxWithSelections.activeDecisionSummary = getDecisionEffectSummary({
        actions: effect.actions,
        cost: effect.cost,
      });
      try {
        // The selection this cost asks for is the clause's own question wherever the resolver
        // skipped the separate optional prompt (see `costIsAskedAsSelection`).
        ctxWithSelections.costIsTheQuestion = effect.optional === true && costIsAskedAsSelection(effect.cost);
        if (
          effect.cost.optional === true &&
          canPayCost(ctxWithSelections, effect.cost) &&
          !(await ctxWithSelections.ask.optional(ctxWithSelections, effect.cost.raw ?? "Pay processing condition?"))
        ) {
          if (ctx.oncePerTurnActivationChosen !== true) ctx.oncePerTurnActivationDeclined = true;
          ctxWithSelections.effectRestrictions = outerRestrictions;
          return;
        }
        const canPay = canPayCost(ctxWithSelections, effect.cost);
        if (canPay && !costIsAskedAsSelection(effect.cost)) ctxWithSelections.onActivationChosen?.();
        const paid = canPay && (await payCost(ctxWithSelections, effect.cost));
        ctxWithSelections.costIsTheQuestion = undefined;
        if (!paid) {
          ctxWithSelections.effectRestrictions = outerRestrictions;
          return;
        }
        ctxWithSelections.onActivationChosen?.();
        ctxWithSelections.oncePerTurnActivationChosen = true;
        ctxWithSelections.oncePerTurnActivationDeclined = false;
      } finally {
        ctxWithSelections.activeSingleHandCostBenefit = outerSingleHandCostBenefit;
        ctxWithSelections.activeDecisionSummary = outerDecisionSummary;
      }
    }
    const actions = effect.actions ?? [];
    // Each "by" processing condition is asked when its own clause is reached, in printed order:
    // "Suspend 1 ... Then, by trashing ..., may digivolve" resolves the suspend first and only then
    // offers the optional digivolve (see `decideProcessingConditionAtClause`).
    const outerPredecidedOptionalActions = ctxWithSelections.predecidedOptionalActions;
    const outerPredecidedOptionalCosts = ctxWithSelections.predecidedOptionalCosts;
    const outerPredecidedCostSelections = ctxWithSelections.predecidedCostSelections;
    const predecidedOptionalActions = new Map<Action, boolean>();
    const predecidedOptionalCosts = new Map<Action, boolean>();
    const predecidedCostSelections = new Map<Action, readonly string[]>();
    ctxWithSelections.predecidedOptionalActions = predecidedOptionalActions;
    ctxWithSelections.predecidedOptionalCosts = predecidedOptionalCosts;
    ctxWithSelections.predecidedCostSelections = predecidedCostSelections;
    if (actions.length === 0 && (effect.keywords?.length ?? 0) > 0) {
      const durationStr =
        effect.trigger === "Static" || effect.trigger === "Rule" || effect.trigger === "YourTurn"
          ? "permanent"
          : "forTheTurn";
      for (const kw of effect.keywords ?? []) {
        await runAction(ctxWithSelections, {
          kind: "GainKeyword",
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          keyword: {
            keyword: kw.keyword,
            ...(kw.amount !== undefined ? { amount: kw.amount } : {}),
          },
          duration: durationStr,
        });
      }
      ctxWithSelections.predecidedOptionalActions = outerPredecidedOptionalActions;
      ctxWithSelections.predecidedOptionalCosts = outerPredecidedOptionalCosts;
      ctxWithSelections.predecidedCostSelections = outerPredecidedCostSelections;
      return;
    }
    // A continuous record may carry both resident keywords and executable actions. Do not
    // drop the keywords merely because the action list is non-empty (BT13-027 combines
    // opponent-turn Blocker with a when-opponent-attacks subscription).
    if (
      effect.trigger === "Static" ||
      effect.trigger === "Rule" ||
      effect.trigger === "YourTurn" ||
      effect.trigger === "OpponentsTurn" ||
      effect.trigger === "AllTurns"
    ) {
      const duration =
        effect.trigger === "Static" || effect.trigger === "Rule" || effect.trigger === "YourTurn"
          ? "permanent"
          : "forTheTurn";
      for (const keyword of effect.keywords ?? []) {
        // Delay on a continuous trigger is an activation marker whose trash cost is
        // installed by `withIntrinsicDelayGate`; it is not a resident keyword grant.
        if (keyword.keyword === "Reboot" || keyword.keyword === "Delay" || ACTION_TYPE_KEYWORDS.has(keyword.keyword))
          continue;
        await runAction(ctxWithSelections, {
          kind: "GainKeyword",
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          keyword: {
            keyword: keyword.keyword,
            ...(keyword.amount !== undefined ? { amount: keyword.amount } : {}),
          },
          duration,
        });
      }
    }
    const isRebootMarker =
      effect.trigger === "Static" && (effect.keywords ?? []).some((keyword) => keyword.keyword === "Reboot");
    if (isRebootMarker) {
      const self = ctxWithSelections.source.permanent();
      if (self !== undefined) {
        ctxWithSelections.fx.grantKeyword(self.permanentId, "Reboot", EffectDuration.Permanent);
      }
    }
    // `placedCards` is scoped to this CardEffect resolution, not to the lifetime of a reusable
    // context. Most callers create a fresh context, but pay-time and nested effect paths may seed
    // `selections` and intentionally reuse one; reset here so a prior PlaceUnder cannot inflate a
    // later effect's count. Restore the caller's outer accumulator after nested resolution.
    const outerPlacedUnderInstanceIds = ctxWithSelections.placedUnderInstanceIdsThisEffect;
    ctxWithSelections.placedUnderInstanceIdsThisEffect = [];
    try {
      const runActionsFrom = async (startIndex: number): Promise<void> => {
        for (let actionIndex = startIndex; actionIndex < actions.length; actionIndex += 1) {
          const action = actions[actionIndex]!;
          if (actionIndex > 0 && ctxWithSelections.optionalActivationCancellation) {
            ctxWithSelections.optionalActivationCancellation.available = false;
          }
          // Legacy compiled Reboot records carry a self-Unsuspend action beside the keyword
          // marker. It describes what Reboot does during the opponent's unsuspend phase; it is
          // not a continuously re-fired "unsuspend now" action. Executing it in the static pass
          // makes a Reboot Digimon stand back up immediately after declaring an attack.
          if (isRebootMarker && action.kind === "Unsuspend") continue;
          const outerActionPath = ctxWithSelections.activeActionPath;
          const outerChainsSameTarget = ctxWithSelections.nextActionChainsSameTarget;
          const outerAttackContinuation = ctxWithSelections.continueEffectAfterAttackDeclaration;
          const outerOptionalAnswer = ctxWithSelections.presetOptionalAnswer;
          // An optional attack on the result of an earlier action is a separate
          // decision: accepting DNA in the plan does not also accept its attack.
          if (
            actionIndex > 0 &&
            action.kind === "Attack" &&
            action.optional === true &&
            action.target.filter.boundRef !== undefined &&
            outerOptionalAnswer === true
          )
            ctxWithSelections.presetOptionalAnswer = undefined;
          ctxWithSelections.activeActionPath = `${actionIndex}`;
          ctxWithSelections.nextActionChainsSameTarget =
            (actions[actionIndex + 1] as { target?: { sameTarget?: boolean } } | undefined)?.target?.sameTarget ===
            true;
          let attackContinuationRan = false;
          // A processed ＜Blitz＞ attacks like an Attack clause, so the rest of its effect also
          // resolves right after the declaration, before When Attacking effects (Q777).
          if ((mayDeclareAttack(action) || isBlitzGrant(action)) && actionIndex + 1 < actions.length) {
            ctxWithSelections.continueEffectAfterAttackDeclaration = async () => {
              attackContinuationRan = true;
              await runActionsFrom(actionIndex + 1);
            };
          }
          let abort: boolean;
          try {
            const resolvingAction =
              declaredProcessingCondition && actionIndex === 0 && action.kind === "CostGatedBlock"
                ? { ...action, optional: false, cost: { ...action.cost, optional: false } }
                : action;
            // Only awaited when there is a condition to decide: an extra tick before every action
            // would let callers observe an action that has not started yet.
            if (actionIndex > 0 && isPredecidableProcessingCost(resolvingAction))
              await decideProcessingConditionAtClause(ctxWithSelections, resolvingAction, actionIndex);
            const nextAction = actions[actionIndex + 1];
            if (isSecuritySearchDigivolvePair(resolvingAction, nextAction)) {
              abort = await runSecuritySearchDigivolve(
                ctxWithSelections,
                resolvingAction as Extract<Action, { kind: "Search" }>,
                nextAction as Extract<Action, { kind: "Digivolve" }>,
              );
              actionIndex += 1;
            } else {
              abort = await runAction(ctxWithSelections, resolvingAction);
            }
          } finally {
            ctxWithSelections.activeActionPath = outerActionPath;
            ctxWithSelections.nextActionChainsSameTarget = outerChainsSameTarget;
            ctxWithSelections.continueEffectAfterAttackDeclaration = outerAttackContinuation;
            ctxWithSelections.presetOptionalAnswer = outerOptionalAnswer;
          }
          if (abort || attackContinuationRan) return;
        }
      };
      try {
        await runActionsFrom(0);
      } catch (error) {
        if (
          !(error instanceof OptionalActivationCancelled) ||
          error.activation !== ctxWithSelections.optionalActivationCancellation
        ) {
          throw error;
        }
        ctxWithSelections.optionalActivationCancellation.available = false;
        ctxWithSelections.oncePerTurnActivationChosen = false;
        ctxWithSelections.oncePerTurnActivationDeclined = true;
        ctxWithSelections.lastEffectActed = false;
      }
    } finally {
      // `activeTiming` / `activeEffectText` deliberately survive: they are the provenance a decision
      // raised by this resolution is stamped with, and it is read after the resolution returns.
      ctxWithSelections.optionalActivationCancellation = outerCancellation;
      ctxWithSelections.placedUnderInstanceIdsThisEffect = outerPlacedUnderInstanceIds;
      ctxWithSelections.effectRestrictions = outerRestrictions;
      ctxWithSelections.predecidedOptionalActions = outerPredecidedOptionalActions;
      ctxWithSelections.predecidedOptionalCosts = outerPredecidedOptionalCosts;
      ctxWithSelections.predecidedCostSelections = outerPredecidedCostSelections;
      mirrorResultBindings(ctxWithSelections, ctx);
      ctx.oncePerTurnActivationChosen = ctxWithSelections.oncePerTurnActivationChosen;
      ctx.oncePerTurnActivationDeclined = ctxWithSelections.oncePerTurnActivationDeclined;
    }
  } finally {
    ctx.optionalActivationCancellation = outerActivationCancellation;
  }
}

/**
 * CR §15-6-3: "an effect can't be activated when none of its processing conditions are
 * met." CR §15-8-4-3-1: "a player can only declare activation of an activation-type effect
 * while its processing conditions are met" — and an action's own cost ("by paying N cost")
 * is such a processing condition: declaring an activation whose cost can't be paid must be
 * refused outright, not accepted and left to fail at resolution.
 *
 * A whole-effect `condition` is a hard gate. Below that, an effect's actions are a
 * DISJUNCTION of processing conditions (condition AND cost together) — activation is
 * refused only when EVERY action is gated (by a condition, a cost, or both) and NONE of
 * them currently has both its condition met and its cost payable; an effect with at least
 * one action that carries neither gate always stays activatable. `RawUnparsed` actions are
 * skipped, mirroring `runAction`'s own handling of unparsed IR.
 *
 * A `raw` (unparsed) condition, or a cost kind `canPayCost` cannot evaluate, is excluded
 * from the gate on BOTH sides: the interpreter cannot tell whether it holds/is payable, so
 * it must not silently REFUSE an activation the game would actually allow
 * (evaluateCondition's own "unrecognized => unmet" default, and canPayCost's own "unknown =>
 * payable" default, exist as resolve-time no-op safety nets, not as license to gate
 * activation on a guess).
 */
/**
 * Action kinds whose `target` can only ever name a live battle-area (or breeding) permanent.
 * Kinds that also reach cards in hand/deck/trash/security are deliberately absent: their empty
 * board scan says nothing about whether the action can do something.
 */
const BOARD_TARGETED_ACTION_KINDS = new Set<Action["kind"]>(["Delete", "SetBaseDP"]);

/**
 * Whether any of `actions` consumes the named selection as its own source — a
 * `fromSelectionRef`/`boundRef`/`underSelectionRef`/`selectionRef` reference. An
 * `excludeSelectionRef` is not a dependency: the action still resolves without the binding.
 */
function dependsOnSelection(actions: readonly Action[], name: string): boolean {
  const referenced = new RegExp(`"(fromSelectionRef|boundRef|underSelectionRef|selectionRef)":"${name}"`);
  return referenced.test(JSON.stringify(actions));
}

/**
 * How the caller is asking. A mandatory triggered effect still triggers when its only
 * board-targeted action currently finds nothing (CR §15-4-2, and the ＜Alliance＞ precedent in
 * `GameEngine`): it takes its place in the ordered set and fizzles at resolution if it is
 * still targetless. Triggered evolutions likewise stay in the ordering choice without a
 * destination yet; their optional action checks live candidates when it resolves. A manual
 * `[Main]` declaration keeps its destination gate. Cost and condition gates still apply.
 */
export interface ActivationGateOptions {
  readonly collectsMandatoryTrigger?: boolean;
  readonly collectsTriggeredEffect?: boolean;
}

export function canActivateEffect(
  ctx: EffectContext,
  effect: Pick<CardEffect, "condition" | "cost" | "actions">,
  options: ActivationGateOptions = {},
): boolean {
  // An unparsed condition is not evidence that the effect is activatable. Treat it as
  // restrictive here, matching runAction's resolution behavior; otherwise the UI offers an
  // effect that resolution will silently skip.
  if (effect.condition && (effect.condition.kind === "raw" || !evaluateCondition(ctx, effect.condition))) return false;
  // A whole-clause cost is a processing condition for every action below it, so an unpayable
  // one refuses the declaration outright — the same gate `runEffect` applies at resolution.
  // §15-7-4 forbids choosing an unexecutable optional processing condition.
  // §15-7-5 still permits a payable condition when only its payload has no target.
  if (effect.cost !== undefined && !canPayCost(ctx, effect.cost)) return false;
  type ParsedAction = Exclude<Action, { kind: "RawUnparsed" }>;
  const relevantActions = (effect.actions ?? []).filter(
    (action): action is ParsedAction => action.kind !== "RawUnparsed",
  );
  const isGated = (action: ParsedAction) =>
    action.kind === "Digivolve" ||
    action.kind === "DigivolveViaPlacement" ||
    action.kind === "DnaDigivolve" ||
    action.kind === "PlaceUnder" ||
    action.kind === "MindLink" ||
    (action.kind === "RedirectAttack" && action.mode !== "endAttack") ||
    isDetachTopAction(action) ||
    (action.kind !== "ConditionalBranch" && action.condition !== undefined) ||
    action.cost !== undefined ||
    action.additionalCost !== undefined ||
    (action.additionalCosts?.length ?? 0) > 0 ||
    (action.costOptions?.length ?? 0) > 0;
  const costsPayable = (action: ParsedAction): boolean => {
    // A reactive listener pays its activation costs when the future event fires, against
    // that event's payload. Preflighting those costs while installing the listener can lack
    // its trigger subject and incorrectly suppress the watcher entirely (EX10-067's
    // triggerSource placement host).
    if (action.kind === "SubTrigger" || action.kind === "Replacement") return true;
    const primaryPayable = action.cost === undefined || typeof action.cost === "number" || canPayCost(ctx, action.cost);
    if (!primaryPayable) return false;
    if (action.additionalCost !== undefined && !canPayCost(ctx, action.additionalCost)) return false;
    if ((action.additionalCosts ?? []).some((cost) => !canPayCost(ctx, cost))) return false;
    return (action.costOptions?.length ?? 0) === 0 || action.costOptions!.some((cost) => canPayCost(ctx, cost));
  };
  const intrinsicPossible = (action: ParsedAction): boolean => {
    // CR 15-7-5 permits performing a payable processing condition even when
    // its subsequent content cannot execute. The cost/condition gates below
    // still apply; the nested resolver decides which payload actions can run.
    if (action.kind === "CostGatedBlock") return true;
    if (action.kind === "RedirectAttack" && action.mode !== "endAttack") {
      return (
        allowsOptionalProcessingCostWithoutTarget(action) ||
        ctx.fx.isAttackTargetLocked?.(ctx.trigger.attackerPermanentId) !== true
      );
    }
    if (action.kind === "Digivolve") {
      // A triggered evolution belongs in the simultaneous-effect choice even when
      // its destination is not in hand yet (CR 15-4-2 / 15-4-3). Another pending
      // effect can draw it before this one resolves, e.g. BT20-007 + BT21-046.
      // runAction/runDigivolve check the live candidates before offering or paying
      // for the evolution. Manual declarations retain their destination preflight.
      if (options.collectsTriggeredEffect === true) return true;
      // §15-8-4-4-1: a [Main] with a printed "By" condition is declarable while the condition
      // itself can be paid, even with no legal destination.
      if (allowsOptionalProcessingCostWithoutTarget(action)) return true;
      return canAttemptDigivolveBeforeCost(ctx, action);
    }
    if (action.kind === "PlaceUnder")
      return allowsOptionalProcessingCostWithoutTarget(action) || canAttemptPlaceUnder(ctx, action);
    if (action.kind === "DigivolveViaPlacement") return canAttemptDigivolveViaPlacement(ctx, action);
    if (action.kind === "MindLink") return canAttemptMindLink(ctx, action);
    if (isDetachTopAction(action)) return canDetachPermanentTop(ctx, action);
    if (action.kind === "DnaDigivolve")
      return allowsOptionalProcessingCostWithoutTarget(action) || canAttemptDnaDigivolve(ctx, action);
    return action.kind !== "Link" || canAttemptLink(ctx, action);
  };
  // Board-targeted actions gate activation: an action that names live battle-area (or
  // breeding) permanents resolves to nothing when the board holds no candidate. An effect
  // whose every action is board-targeted and finds nothing must not be offered (BT3-014's
  // "1 of your opponent's Lv.4 or lower Digimon" against a Lv.5-only board). Targets that
  // resolve out of a hand/deck/trash zone, a prior binding, or the trigger source are not
  // board scans and are left to their own action's gate.
  const boardTargetOf = (action: Action): Target | undefined => {
    if (!BOARD_TARGETED_ACTION_KINDS.has(action.kind)) return undefined;
    // Some rulings explicitly allow paying the processing cost even when the payload has no
    // target (BT15-009). Those actions opt out of declaration-time target gating.
    if (allowsOptionalProcessingCostWithoutTarget(action)) return undefined;
    // A scaled/bound deletion can acquire its target only after a cost or earlier action has
    // produced the value it compares against. Keep those on the resolver's transactional
    // preflight; only statically answerable deletion targets are safe to gate here.
    if (
      action.kind === "Delete" &&
      (action.additionalSimultaneousTargets?.length ||
        action.dpCeilingScaling !== undefined ||
        action.totalDpCapScaling !== undefined ||
        action.playCostCeiling !== undefined ||
        action.scaling !== undefined ||
        action.target.filter.playCostLteScaling !== undefined ||
        /"(lastDeleted|selectionRef|namedCount|sameNameAsSelection|levelEq)"/.test(JSON.stringify(action.target)))
    ) {
      return undefined;
    }
    // A self-placement cost that raises the deletion's level ceiling (EX9-061) can create the
    // only legal target; scan the board as it will look once that cost is paid, exactly as
    // the resolver's own preflight does.
    // A printed DP cap is read with the controller's live DP-deletion-maximum bonus (BT12-001's
    // inherited "+1000"), exactly as the resolver reads it when the Delete runs.
    const target =
      action.kind === "Delete"
        ? raiseDeletionDpCap(ctx, targetAfterSelfPlacementCost(ctx, action) ?? action.target)
        : (action as { target?: Target }).target;
    if (target === undefined || target.fromSelectionRef !== undefined) return undefined;
    const filter = target.filter;
    if (filter === undefined || filter.boundRef !== undefined || filter.useTriggerSource === true) return undefined;
    if (target.isSelf === true || filter.isSelfRef === true) return undefined;
    return filter.zone === undefined || filter.zone === "battleArea" || filter.zone === "breeding" ? target : undefined;
  };
  const isBoardEmptyFor = (action: Action): boolean => {
    const target = boardTargetOf(action);
    if (target === undefined) return false;
    try {
      return candidatePermanents(ctx, target).length === 0;
    } catch {
      // A partially built context (dispatch seams that omit `fx`) cannot answer the board
      // scan; treat it as "target may exist" rather than gating the effect off.
      return false;
    }
  };
  const boardTargeted = relevantActions.filter((action) => boardTargetOf(action) !== undefined);
  if (
    options.collectsMandatoryTrigger !== true &&
    boardTargeted.length > 0 &&
    boardTargeted.length === relevantActions.length &&
    boardTargeted.every(isBoardEmptyFor)
  ) {
    return false;
  }
  // A leading SelectBind is the clause's target gate: every following action consumes the
  // binding it produces, so with no candidate the whole clause resolves to nothing and must
  // not be offered (BT7-104 "choose 1 of your [X Antibody] Digimon, then draw per its sources").
  const leadingBind = relevantActions[0]?.kind === "SelectBind" ? relevantActions[0] : undefined;
  const bindAs = leadingBind?.target.bindAs;
  if (
    leadingBind !== undefined &&
    bindAs !== undefined &&
    leadingBind.target.upTo !== true &&
    ctx.selections?.get(bindAs) === undefined &&
    relevantActions.slice(1).every((action) => dependsOnSelection([action], bindAs)) &&
    candidatePermanents(ctx, leadingBind.target).length === 0
  ) {
    return false;
  }
  // A leading abort-on-decline action is the activation gate for the complete clause:
  // "If ..., by paying ..., do X. Then, do Y." The dependent `Then` action is often
  // mechanically ungated because it consumes a binding produced by X; treating Y as an
  // independent processing path would allow the player to declare the effect when X's
  // condition/cost is impossible (BT10-025). Mirror runEffect's ordered abort semantics here.
  // A ConditionalBranch condition is read after its cost is paid and only picks the branch
  // ("By suspending ..., if your hand has 7 or fewer cards, ＜Draw 1＞", P-245), so it never
  // blocks the declaration. runAction exempts it from the pre-cost gate the same way.
  const conditionMet = (action: ParsedAction): boolean =>
    action.kind === "ConditionalBranch" ||
    action.condition === undefined ||
    (action.condition.kind !== "raw" && evaluateCondition(ctx, action.condition));
  const leadingAction = relevantActions[0];
  if (leadingAction?.abortOnDecline === true && isGated(leadingAction)) {
    const actionPossible = intrinsicPossible(leadingAction);
    const costPayable = costsPayable(leadingAction);
    return actionPossible && conditionMet(leadingAction) && costPayable;
  }
  const gatedActions = relevantActions.filter(isGated);
  const ungatedCount = relevantActions.length - gatedActions.length;
  if (gatedActions.length === 0 || ungatedCount > 0) return true;
  return gatedActions.some((action) => {
    const actionPossible = intrinsicPossible(action);
    const costPayable = costsPayable(action);
    return actionPossible && conditionMet(action) && costPayable;
  });
}

installEffectRunner(runEffect);
