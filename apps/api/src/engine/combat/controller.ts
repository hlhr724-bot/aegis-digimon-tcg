import type { CombatControllerState } from "#api/engine/combat/CombatControllerState";
import type { CounterChoice } from "@aegis/shared/protocol/CounterChoice";
import { DecisionSelectionGoal } from "@aegis/shared/protocol/DecisionSelectionGoal";
import {
  CardKind,
  EffectTiming,
  type Permanent,
  type Seat,
  type AttackTarget,
  type CardColor,
  type CombatWindowKind,
  type PreventionKeyword,
  CombatWindow,
  getCardDefinition,
} from "@aegis/shared";
import { ArraySchema } from "@colyseus/schema";
import type { GameStateAccess } from "../state/access.js";
import type { SubTriggerEventName, TriggerInfo } from "../effects/EffectContext.js";
import { canPaySuspendCost, eligibleBlockers, hasCollision } from "./legality.js";
import { fragmentCountOf } from "./keywords.js";
import { inheritedDigimonHost } from "../effects/kernel.js";
import { resolvePermanentBattle } from "./resolve.js";
import { recordDigimonAttack } from "../turnActivity.js";
import type {
  AllianceDecisionWindow,
  BarrierDecisionWindow,
  CombatHooks,
  CombatTrigger,
  CompletedCombat,
  DecisionSource,
  EvadeDecisionWindow,
  OpenBlockWindow,
  OpenCounterWindow,
} from "./types.js";

export type { CombatHooks, CombatTrigger } from "./types.js";

interface DigimonBattleKind {
  /** The attack's own battle, as opposed to an effect battle resolved during it. */
  isAttackBattle?: boolean;
  comparison?: "digivolutionCards";
}

/**
 * The attack lifecycle + block window (subsystem: attack-and-block).
 *
 * source coroutine state machine (Attack -> Counter -> Block -> Battle -> End ->
 * CleanUp; documented behavior) becomes one linear `async` resolveAttack;
 * anywhere the original blocked a coroutine waiting on the defender to pick a
 * blocker, the TS version `await`s a block-window promise resolved by an incoming
 * declareBlock / declineBlock intent (ARCHITECTURE.md section 5; API-CONTRACT.md
 * section 6 "Attack into security").
 *
 * All presentation is stripped. The Digimon-vs-Digimon DP
 * battle is delegated to the pure resolver in resolve.ts; the player-directed
 * (security) case is handed off to the security-and-win-check subsystem via the
 * injected `checkSecurity` hook — this module does not own security resolution
 * (it only opens the door and lets that subsystem flip/resolve/declare).
 *
 * Effect timings (When Attacking, OnBlock, end-of-attack) fire through the
 * injected `fireTiming` seam so this module does not depend on the
 * effect-stack-resolution subsystem; until that lands the seam is a no-op and the
 * narration events below are the visible record of combat.
 */

export class CombatController {
  private readonly battles: { attacker: Permanent; defender: Permanent }[] = [];

  /** Only the innermost active field battle contributes battle-conditional passive effects. */
  battleOpponentOf(permanentId: string): Permanent | undefined {
    const battle = this.battles.at(-1);
    if (battle?.attacker.permanentId === permanentId) return battle.defender;
    if (battle?.defender.permanentId === permanentId) return battle.attacker;
    return undefined;
  }

  private attackSequence = 0;
  private openWindow: OpenBlockWindow | undefined;
  private resolving = false;
  /**
   * The in-flight attack's mutable attacker/target, exposed so an effect resolving at
   * an attack timing (When Attacking, Counter) can REDIRECT it before the defender is
   * locked in (`redirectTarget`). Undefined when no attack is resolving.
   */
  private currentAttack:
    | {
        attackerPermanentId: string;
        attackerCardId: string;
        attackerArtId?: string;
        seat: Seat;
        target: AttackTarget;
        piercingTriggered?: boolean;
      }
    | undefined;
  /**
   * Set by {@link endAttack} when an effect (e.g. BT23-069) ends the in-flight attack: the
   * flow skips the block window and battle and transitions straight to end-of-attack
   * (AttackProcess.EndAttack). Reset by `cleanup`.
   */
  private endRequested = false;
  /**
   * The in-flight attack's End of Attack trigger, cleared once that timing arrives so an
   * effect resolving at End of Attack cannot queue it a second time.
   */
  private pendingEndOfAttackTrigger: CombatTrigger | undefined;
  /** Withdraws the End of Attack timing {@link endAttack} queued, if it has not activated yet. */
  private withdrawDeferredEndOfAttack: (() => boolean) | undefined;
  /** Attack activity bookkeeping; prior attacks do not forbid a new declaration. */
  private attackHistory = new Set<string>();
  private settlementDepth = 0;
  /** Active ＜Alliance＞ decision window. */
  private allianceDecision: AllianceDecisionWindow | undefined;
  /** Active ＜Evade＞ decision window. */
  private evadeDecision: EvadeDecisionWindow | undefined;
  /** Active ＜Barrier＞ decision window. */
  private barrierDecision: BarrierDecisionWindow | undefined;
  /** Active §11-3 Counter Timing window. */
  private counterWindow: OpenCounterWindow | undefined;
  /** Battle completion payload held until the outer attack reaches cleanup. */
  private completedCombat: CompletedCombat | undefined;

  /**
   * Take the held battle-completion payload and clear it. Reading the field directly from
   * `resolveAttack` is not enough: that method clears the field on entry, so the compiler's
   * control-flow analysis narrows every later read to `undefined` and cannot see that the
   * intervening battle resolution repopulated it.
   */
  private takeCompletedCombat(): CompletedCombat | undefined {
    const completed = this.completedCombat;
    this.completedCombat = undefined;
    return completed;
  }
  /**
   * [Counter] effects activated so far THIS attack (§11-3-2 caps it at 1). Reset by
   * `cleanup` at the end of every attack.
   */
  private counterActivationsThisAttack = 0;

  constructor(
    private readonly access: GameStateAccess,
    private readonly hooks: CombatHooks,
  ) {}

  get attackedThisTurn(): Set<string> {
    return this.attackHistory;
  }

  getRuntimeState(): CombatControllerState {
    this.assertSnapshotBoundary();
    return { attackSequence: this.attackSequence, attackedThisTurn: this.attackHistory };
  }

  restoreRuntimeState(state: unknown): void {
    this.assertSnapshotBoundary();
    if (!isCombatControllerState(state)) {
      throw new Error("Invalid combat controller state");
    }
    this.attackSequence = state.attackSequence;
    this.attackHistory = state.attackedThisTurn;
  }

  private assertSnapshotBoundary(): void {
    if (
      this.resolving ||
      this.settlementDepth !== 0 ||
      this.battles.length !== 0 ||
      this.currentAttack !== undefined ||
      this.openWindow !== undefined ||
      this.counterWindow !== undefined ||
      this.allianceDecision !== undefined ||
      this.evadeDecision !== undefined ||
      this.barrierDecision !== undefined ||
      this.endRequested ||
      this.pendingEndOfAttackTrigger !== undefined ||
      this.withdrawDeferredEndOfAttack !== undefined ||
      this.completedCombat !== undefined ||
      this.counterActivationsThisAttack !== 0 ||
      this.access.game.combatWindow !== undefined
    ) {
      throw new Error("Cannot snapshot or restore active combat");
    }
  }

  private hasKeyword(permanentId: string, keyword: string): boolean {
    return (
      this.hooks.hasKeyword?.(permanentId, keyword) ?? this.hooks.continuous?.hasKeyword(permanentId, keyword) ?? false
    );
  }

  /**
   * Mirror the open prompt into synchronized state, so a client that missed the broadcast
   * (a socket down at send time is never redelivered a channel message) still learns the
   * window is open from its next state sync. Cleared by {@link clearMirroredWindow}.
   */
  private mirrorWindow(
    kind: CombatWindowKind,
    seat: Seat,
    fields: {
      attackerPermanentId?: string;
      permanentId?: string;
      eligiblePermanentIds?: readonly string[];
      eligibleCounters?: readonly CounterChoice[];
      mustBlock?: boolean;
    },
  ): void {
    const window = new CombatWindow();
    window.kind = kind;
    window.seat = seat;
    window.attackerPermanentId = fields.attackerPermanentId ?? "";
    window.permanentId = fields.permanentId ?? "";
    window.eligiblePermanentIds = new ArraySchema<string>(...(fields.eligiblePermanentIds ?? []));
    window.eligibleCountersJson = fields.eligibleCounters ? JSON.stringify(fields.eligibleCounters) : "";
    window.mustBlock = fields.mustBlock === true;
    this.access.game.combatWindow = window;
  }

  /** Drop the mirror, but only when it still describes the window that just closed. */
  private clearMirroredWindow(kind: CombatWindowKind): void {
    if (this.access.game.combatWindow?.kind === kind) this.access.game.combatWindow = undefined;
  }

  private effectiveKindsOf(permanent: Permanent): CardKind[] {
    const printed = permanent.topCard === undefined ? [] : (getCardDefinition(permanent.topCard.cardId)?.kinds ?? []);
    const granted = this.hooks.continuous?.grantedKinds?.(permanent.permanentId) ?? [];
    return [...new Set([...printed, ...granted])];
  }

  /**
   * Resolve whatever prompt is currently parked to its safe default, as the backstop for a
   * player who never answers (a connection lost beyond the reconnect grace window would
   * otherwise wedge the match for both seats). Returns whether a window was actually closed.
   *
   * The defaults are the ones a player declining costs nothing for: pass the block (unless
   * ＜Collision＞ forces it, where the first eligible blocker is taken), pass the Counter
   * window, pass Alliance, and decline Evade / Barrier.
   */
  expireOpenWindow(): boolean {
    if (this.openWindow !== undefined) {
      const forced = this.openWindow.eligibleBlockerIds.values().next().value;
      const attacker = this.access.permanentById(this.openWindow.attackerPermanentId);
      const mustBlock = attacker !== undefined && hasCollision(attacker, this.hooks.continuous);
      return this.resolveBlock(this.openWindow.defendingSeat, mustBlock ? forced : undefined);
    }
    if (this.counterWindow !== undefined) return this.resolveCounterPass(this.counterWindow.defendingSeat);
    if (this.allianceDecision !== undefined) return this.resolveAlliance(this.allianceDecision.seat, undefined);
    if (this.evadeDecision !== undefined)
      return this.resolveEvade(this.evadeDecision.seat, this.evadeDecision.permanentId, false);
    if (this.barrierDecision !== undefined)
      return this.resolveBarrier(this.barrierDecision.seat, this.barrierDecision.permanentId, false);
    return false;
  }

  /** Silently release parked responses after a terminal outcome. */
  cancel(): void {
    const block = this.openWindow;
    const counter = this.counterWindow;
    const alliance = this.allianceDecision;
    const evade = this.evadeDecision;
    const barrier = this.barrierDecision;
    this.openWindow = undefined;
    this.counterWindow = undefined;
    this.allianceDecision = undefined;
    this.evadeDecision = undefined;
    this.barrierDecision = undefined;
    this.access.game.combatWindow = undefined;
    block?.resolve(null);
    counter?.resolve();
    alliance?.resolve(null);
    evade?.resolve(false);
    barrier?.resolve(false);
  }

  /** True while an attack is mid-resolution (source AttackProcess.IsAttacking). */
  get isAttacking(): boolean {
    return this.resolving;
  }

  /** The attacker permanent id of the in-flight attack, if any (for effect-driven redirect). */
  get currentAttackerId(): string | undefined {
    return this.currentAttack?.attackerPermanentId;
  }

  /** Unsuspending after an attack makes the Digimon eligible to declare another attack. */
  resetAttackEligibility(permanentId: string): void {
    this.attackedThisTurn.delete(permanentId);
  }

  /**
   * Tell the client that a keyword paid to prevent `saved`'s deletion. These keywords resolve
   * through a plain decision and then a silent board change, so without this the viewer sees
   * only the cost card leaving and a battle that quietly failed.
   */
  private permanentSource(perm: Permanent): DecisionSource {
    return {
      sourceCardId: perm.topCard!.cardId,
      sourceInstanceId: perm.topCard!.instanceId,
      sourcePermanentId: perm.permanentId,
    };
  }

  private emitDeletionPrevented(
    keyword: PreventionKeyword,
    saved: Permanent,
    paidPermanentId?: string,
    paidCardId?: string,
  ): void {
    this.hooks.emit({
      kind: "deletionPrevented",
      keyword,
      seat: saved.controllerSeat,
      permanentId: saved.permanentId,
      ...(saved.topCard === undefined ? {} : { cardId: saved.topCard.cardId }),
      ...(paidPermanentId === undefined ? {} : { paidPermanentId }),
      ...(paidCardId === undefined ? {} : { paidCardId }),
    });
  }

  /**
   * Redirect the in-flight attack onto `target` (a Counter/When-Attacking effect
   * changing who is attacked). Mutates the resolving attack's target so the upcoming
   * block-window / battle resolution uses it (Comprehensive Rules §11-2-7-2: the
   * attack target may switch). A no-op when no attack is resolving. Re-narrates via
   * `attackDeclared` (the new target) so the client log reflects the switch; the event
   * carries `redirected` so the client re-aims the open attack rather than narrating a
   * second declaration.
   */
  redirectTarget(target: AttackTarget): boolean {
    if (
      this.currentAttack === undefined ||
      this.access.permanentById(this.currentAttack.attackerPermanentId) === undefined
    ) {
      return false;
    }
    // "This Digimon's attack target can't change" (§15-1-3, LM-039/EX7-022/BT13-029). The
    // restriction sits on the ATTACKER, and every printed instance is unscoped — it blocks the
    // switch whoever is attempting it. Returning false lets the caller see the redirect failed.
    if (this.hooks.continuous?.hasRestriction(this.currentAttack.attackerPermanentId, "attackTargetChange") === true) {
      return false;
    }
    this.currentAttack.target = target;
    const targetCardId =
      target.kind === "permanent" ? this.access.permanentById(target.permanentId)?.topCard.cardId : undefined;
    this.hooks.emit({
      kind: "attackDeclared",
      seat: this.currentAttack.seat,
      attackerPermanentId: this.currentAttack.attackerPermanentId,
      attackerCardId: this.currentAttack.attackerCardId,
      ...(this.currentAttack.attackerArtId ? { attackerArtId: this.currentAttack.attackerArtId } : {}),
      target,
      ...(targetCardId === undefined ? {} : { targetCardId }),
      ...(target.kind === "permanent" && this.access.permanentById(target.permanentId)?.topCard.artId
        ? { targetArtId: this.access.permanentById(target.permanentId)!.topCard.artId }
        : {}),
      redirected: true,
    });
    return true;
  }

  /**
   * End the in-flight attack (BT23-069 "end that attack"): the upcoming block-window /
   * battle resolution is skipped and the flow transitions to end-of-attack. The attack
   * does NOT succeed (no block/counter/battle). A no-op when no attack is resolving.
   * Comprehensive Rules: this changes the TIMING, not the attacking Digimon (KB Q5340).
   */
  endAttack(): boolean {
    if (this.currentAttack === undefined) return false;
    // "If an attack is ended, the end of attack timing comes immediately": its [End of Attack]
    // effects are derived triggers of the ending effect, activating before the effects still
    // pending, e.g. the attacker's other [When Attacking] effect (CR §15-4-5-2, KB Q6490).
    if (!this.endRequested && this.pendingEndOfAttackTrigger !== undefined) {
      this.withdrawDeferredEndOfAttack = this.hooks.deferEndOfAttack?.({
        ...this.pendingEndOfAttackTrigger,
        target: this.currentAttack.target,
      });
    }
    this.endRequested = true;
    return true;
  }

  private async fireEndOfAttack(trigger: CombatTrigger): Promise<void> {
    if (this.access.game.gameOver) return;
    const withdrawDeferred = this.withdrawDeferredEndOfAttack;
    this.withdrawDeferredEndOfAttack = undefined;
    this.pendingEndOfAttackTrigger = undefined;
    if (withdrawDeferred !== undefined && !withdrawDeferred()) return;
    await this.hooks.fireTiming(EffectTiming.OnEndAttack, trigger);
  }

  /** True while the defending seat may declare/decline a block. */
  get hasOpenBlockWindow(): boolean {
    return this.openWindow !== undefined;
  }

  /** The seat that must answer the open block window, if any. */
  get blockingSeat(): Seat | undefined {
    return this.openWindow?.defendingSeat;
  }

  /** The attacking permanent id of the open block window, if any. */
  get attackingPermanentId(): string | undefined {
    return this.openWindow?.attackerPermanentId;
  }

  /** True while an ＜Alliance＞ decision window is open. */
  get hasOpenAllianceDecision(): boolean {
    return this.allianceDecision !== undefined;
  }

  /** The seat that must answer the open Alliance decision, if any. */
  get allianceDecisionSeat(): Seat | undefined {
    return this.allianceDecision?.seat;
  }

  /** The permanent id the Alliance decision is for, if any. */
  get allianceDecisionPermanentId(): string | undefined {
    return this.allianceDecision?.permanentId;
  }

  /** The eligible ally ids for the open Alliance decision, if any. */
  get allianceDecisionEligibleAllyIds(): Set<string> | undefined {
    return this.allianceDecision?.eligibleAllyIds;
  }

  /** True while an ＜Evade＞ decision window is open. */
  get hasOpenEvadeDecision(): boolean {
    return this.evadeDecision !== undefined;
  }

  /** The permanent id the Evade decision is for, if any. */
  get evadeDecisionPermanentId(): string | undefined {
    return this.evadeDecision?.permanentId;
  }

  /** True while a ＜Barrier＞ decision window is open. */
  get hasOpenBarrierDecision(): boolean {
    return this.barrierDecision !== undefined;
  }

  /** The permanent id the Barrier decision is for, if any. */
  get barrierDecisionPermanentId(): string | undefined {
    return this.barrierDecision?.permanentId;
  }

  /** True while a §11-3 Counter Timing window is open. */
  get hasOpenCounterWindow(): boolean {
    return this.counterWindow !== undefined;
  }

  /** The defending seat that must answer the open Counter Timing window, if any. */
  get counterWindowSeat(): Seat | undefined {
    return this.counterWindow?.defendingSeat;
  }

  /** The attacking permanent id of the open Counter Timing window, if any. */
  get counterWindowAttackerPermanentId(): string | undefined {
    return this.counterWindow?.attackerPermanentId;
  }

  /** How many more [Counter] effects may be activated THIS attack (§11-3-2 caps it at 1). */
  get counterActivationsRemaining(): number {
    return this.counterActivationsThisAttack >= 1 ? 0 : 1;
  }

  /**
   * Run a full attack to completion. The caller (the attack action) has already
   * validated legality. Phases mirror AttackProcess.Attack -> ProcessNextState:
   *   1. suspend the attacker (unless withoutTap) and fire When Attacking,
   *   2. open the §11-3 Counter Timing window: the defending seat may activate at
   *      most 1 [Counter] effect for this attack,
   *   3. open the block window; if a blocker is declared, switch the defender onto
   *      it (suspend it, fire OnBlock),
   *   4. resolve combat: vs a Digimon -> DP battle (delete loser/both on a tie);
   *      vs the player -> security-and-win-check hand-off,
   *   5. fire end-of-attack, then clean up.
   */
  async resolveAttack(
    attackerSeat: Seat,
    attacker: Permanent,
    target: AttackTarget,
    opts: {
      withoutTap?: boolean;
      attackMechanic?: string;
      /** Resolve an attack-cost payload after attack declaration and before declaration-triggered effects. */
      afterAttackDeclaration?: () => Promise<void>;
      afterAttackTriggers?: () => Promise<void>;
      drainTimingWindow?: (options?: { retireUnactivatable?: boolean }) => Promise<void>;
      /**
       * Wrap the Counter Timing -> End of Attack steps. An effect-directed attack supplies this
       * to pause the effect body that ordered the attack, so triggers arising in those steps
       * resolve as their own windows instead of being parked as nested pending effects (§11-1).
       */
      runAttackSteps?: (body: () => Promise<void>) => Promise<void>;
      /**
       * Flush effects an attack step deferred, at the boundary between two steps. Battle
       * deletions park their [On Deletion] windows behind the ordering effect's still-open
       * window token, and §11-1-4 puts them before End of Attack.
       */
      settleBetweenSteps?: () => Promise<void>;
    } = {},
  ): Promise<void> {
    this.resolving = true;
    this.completedCombat = undefined;
    const attackSequence = ++this.attackSequence;
    // Raid triggers at declaration; evolution during When Attacking cannot
    // retroactively add that trigger (EX9-001 / Q4751-Q4752).
    const raidTriggeredAtDeclaration = this.hasKeyword(attacker.permanentId, "Raid");
    this.currentAttack = {
      attackerPermanentId: attacker.permanentId,
      attackerCardId: attacker.topCard.cardId,
      ...(attacker.topCard.artId ? { attackerArtId: attacker.topCard.artId } : {}),
      seat: attackerSeat,
      target,
    };
    this.attackedThisTurn.add(attacker.permanentId);
    // Attack declarations are legal only for Digimon-kind permanents, so recording the seat
    // unconditionally here also covers Tamers temporarily treated as Digimon.
    recordDigimonAttack(this.access.game, attackerSeat);
    try {
      // 1. Suspend the attacker (documented behavior).
      const attackerSuspended = opts.withoutTap !== true ? this.suspendInCombat(attacker) : false;
      const targetCardId =
        target.kind === "permanent" ? this.access.permanentById(target.permanentId)?.topCard.cardId : undefined;
      this.hooks.emit({
        kind: "attackDeclared",
        seat: attackerSeat,
        attackerPermanentId: attacker.permanentId,
        attackerCardId: attacker.topCard.cardId,
        ...(attacker.topCard.artId ? { attackerArtId: attacker.topCard.artId } : {}),
        target,
        ...(targetCardId === undefined ? {} : { targetCardId }),
        ...(target.kind === "permanent" && this.access.permanentById(target.permanentId)?.topCard.artId
          ? { targetArtId: this.access.permanentById(target.permanentId)!.topCard.artId }
          : {}),
      });
      // Suspending the attacker used to be followed immediately by the suspension window,
      // whose trailing continuous recompute is what first brought resident grants up to date:
      // an inherited ＜Alliance＞ grant, or a "while suspended" DP boost the attacker's own
      // [When Attacking] condition reads. That window now runs inside `fireAttackTiming`,
      // after the declaration facts below are captured, so refresh the continuous tier here.
      if (attackerSuspended) await this.hooks.refreshContinuousEffects?.();
      // The declaration is complete. Resolve an attack-cost payload before suspension-triggered
      // and When Attacking effects while the in-flight attack remains open. Keeping this callback
      // inside the outer try/finally guarantees combat cleanup if it rejects.
      await opts.afterAttackDeclaration?.();
      // When Attacking. source fires OnAllyAttack here (documented behavior);
      // also fire OnUseAttack so "when this attacks" triggered/inherited effects
      // (e.g. the BT7-089 pierce builder) get their window once the stack lands.
      // Volatile defender facts, read BEFORE any [When Attacking] effect resolves. An effect in
      // this window can strip the defender's digivolution cards (BT16-016's inherited trash);
      // "attacks a Digimon with no digivolution cards" is still answered by the declaration-time
      // board (KB Q2816), so the answer is captured here rather than re-derived at fire time.
      const declaredDefender = target.kind === "permanent" ? this.access.permanentById(target.permanentId) : undefined;
      const defenderAtDeclaration =
        declaredDefender === undefined
          ? undefined
          : {
              permanentId: declaredDefender.permanentId,
              digivolutionCardCount: declaredDefender.stack.length,
              controllerSeat: declaredDefender.controllerSeat,
              kinds: this.effectiveKindsOf(declaredDefender),
            };
      const attackTrigger: CombatTrigger = {
        attackerPermanentId: attacker.permanentId,
        target,
        ...(opts.attackMechanic === undefined ? {} : { attackMechanic: opts.attackMechanic }),
        ...(target.kind === "permanent" ? { defenderPermanentId: target.permanentId } : {}),
        ...(defenderAtDeclaration === undefined ? {} : { defenderAtDeclaration }),
      };
      this.pendingEndOfAttackTrigger = attackTrigger;
      const attackSubTriggerPayload: TriggerInfo = {
        attackerPermanentId: attacker.permanentId,
        attackerDPAtDeclaration: attacker.currentDP,
        attackSequence,
        ...(attackTrigger.attackMechanic === undefined ? {} : { attackMechanic: attackTrigger.attackMechanic }),
        ...(attackTrigger.defenderPermanentId !== undefined
          ? { defenderPermanentId: attackTrigger.defenderPermanentId }
          : {}),
        ...(defenderAtDeclaration === undefined ? {} : { defenderAtDeclaration }),
      };
      const preparedWhenAttacking = this.hooks.prepareSubTrigger?.("whenAttacking", attackSubTriggerPayload);
      const preparedWhenOpponentAttacks = this.hooks.prepareSubTrigger?.(
        "whenOpponentAttacks",
        attackSubTriggerPayload,
      );
      // ＜Alliance＞ triggers at the same time as the attacker's own [When Attacking]
      // effects, and each printed/granted instance is a separate trigger (Q5257). Order them
      // together in ONE window only when there is actually something to order: a second
      // Alliance instance, or at least one [When Attacking] effect on the attacker. Any other
      // attack keeps the legacy sequence below, so engines and tests that supply neither hook
      // are unaffected.
      const allianceCount =
        this.hooks.allianceCount?.(attacker.permanentId) ?? (this.hasKeyword(attacker.permanentId, "Alliance") ? 1 : 0);
      const fireAttackTiming = this.hooks.fireAttackTiming;
      const combineAttackTiming =
        fireAttackTiming !== undefined &&
        (attackerSuspended ||
          raidTriggeredAtDeclaration ||
          preparedWhenAttacking !== undefined ||
          preparedWhenOpponentAttacks !== undefined ||
          (allianceCount > 0 &&
            (allianceCount > 1 || (this.hooks.combineAllianceTiming?.(attacker.permanentId) ?? false))));
      let allianceResolvedInWindow = false;
      let raidResolvedInWindow = false;
      let subTriggersResolvedInWindow = false;
      if (combineAttackTiming) {
        const result = await fireAttackTiming(attackTrigger, allianceCount, {
          includeSubTriggers: true,
          subTriggerPayload: attackSubTriggerPayload,
          raidTriggered: raidTriggeredAtDeclaration,
          ...(attackerSuspended ? { suspendedPermanentId: attacker.permanentId } : {}),
        });
        allianceResolvedInWindow = result.allianceResolvedInWindow;
        raidResolvedInWindow = result.raidResolvedInWindow;
        subTriggersResolvedInWindow = result.subTriggersResolvedInWindow;
      } else {
        await this.fireSuspended(attacker, attackerSuspended);
        await this.hooks.fireTiming(EffectTiming.OnUseAttack, attackTrigger);
      }
      if (!subTriggersResolvedInWindow) await this.hooks.fireTiming(EffectTiming.OnAllyAttack, attackTrigger);

      // SubTrigger bus (System B): armed "when this attacks" / "when an opponent's Digimon
      // attacks" watchers. Fired EXACTLY ONCE here (not at both OnUseAttack and OnAllyAttack)
      // so a single attack runs each watcher's body once — these bus watchers are distinct
      // installs from the System-A timing-collected attack builders, so there is no
      // cross-system double-fire (RESEARCH Pitfall 4 / Assumption A3). The attacker is the
      // event subject for both events; a watcher's captured sourceFilter gates on it.
      const fireOpponentAttackWatchers = async (): Promise<void> => {
        if (preparedWhenOpponentAttacks !== undefined) await preparedWhenOpponentAttacks();
        else await this.hooks.fireSubTrigger?.("whenOpponentAttacks", attackSubTriggerPayload);
      };
      // Set only when the non-turn player's attack watchers are held back for the drain below;
      // undefined means they already ran inline at the declaration.
      let deferredOpponentAttackWatchers: (() => Promise<void>) | undefined;
      if (!subTriggersResolvedInWindow) {
        if (preparedWhenAttacking !== undefined) await preparedWhenAttacking();
        else await this.hooks.fireSubTrigger?.("whenAttacking", attackSubTriggerPayload);
        // Turn-player priority (§15-4-3): every effect triggered by one attack declaration
        // resolves the turn player's first, then the non-turn player's — the attacker's
        // [When Attacking] effect before the defending Tamer's [Opponent's Turn] redirect
        // (KB Q1976/Q1993, and Q3399 for the suspension half of the same event).
        //
        // On an EFFECT-DRIVEN attack the declaration happens inside the ordering effect's own
        // paused window, so the attacker's printed [When Attacking] effects pool there and are
        // drained by `drainTimingWindow` further down rather than resolving above. Firing the
        // opponent's watchers here would put them ahead of that pool, so they wait for it.
        const armedOpponentWatchers = this.hooks.armedSubTriggerCount?.("whenOpponentAttacks", attackSubTriggerPayload);
        if (opts.drainTimingWindow === undefined || armedOpponentWatchers === 0) await fireOpponentAttackWatchers();
        else deferredOpponentAttackWatchers = fireOpponentAttackWatchers;
      }
      // A suspension paid as the cost of an effect-driven forced attack triggers at the
      // same time as the attack declaration. Resolve the turn player's When Attacking
      // effects first, then the deferred non-turn suspension watchers (EX3-024/074,
      // Q3399/Q3401). The target was already fixed while Examon was still suspended.
      if (opts.afterAttackTriggers !== undefined) await opts.afterAttackTriggers();

      // ＜Alliance＞ (§16-24): when this Digimon attacks, you may suspend another
      // Digimon you control to add its DP to this Digimon for the battle.
      // (Skipped when the window above already resolved them as ordered triggers.)
      const legacyAllianceCount = allianceResolvedInWindow ? 0 : allianceCount;
      for (let allianceIndex = 0; allianceIndex < legacyAllianceCount; allianceIndex += 1) {
        const allyIds = this.access
          .battleAreaPermanents(attackerSeat)
          .filter(
            (p) =>
              p.permanentId !== attacker.permanentId &&
              canPaySuspendCost(p, this.hooks.continuous) &&
              this.access.isBattleAreaDigimon(p, this.hooks.continuous),
          )
          .map((p) => p.permanentId);
        if (allyIds.length > 0) {
          const allyId = await this.runAllianceDecision(attackerSeat, attacker.permanentId, allyIds);
          if (this.access.game.gameOver) return;
          if (allyId !== null) {
            const ally = this.access.permanentById(allyId);
            if (ally !== undefined) {
              // Cost then benefit, with no yield between them (§16-24 is one effect).
              if (!canPaySuspendCost(ally, this.hooks.continuous)) continue;
              const allySuspended = this.suspendInCombat(ally);
              this.hooks.addDpModifier?.(attacker.permanentId, ally.currentDP);
              this.hooks.addSecurityAttack?.(attacker.permanentId);
              await this.fireSuspended(ally, allySuspended, {
                effectSuspendSeat: attackerSeat,
                byEffectCardId: attacker.topCard.cardId,
                byEffectKeyword: "Alliance",
              });
              // Alliance suspends its chosen ally as an effect cost (§16-24), so the
              // effect-suspension bus must observe the actual transition after the keyword's
              // DP/security benefit has been installed. Carry the resolving keyword as the
              // cause so inherited watchers also recognize granted Alliance, without confusing
              // an unrelated suspension effect on an Alliance card for the keyword itself.
              if (allySuspended) {
                await this.hooks.fireSubTrigger?.("whenEffectSuspends", {
                  subjectPermanentId: ally.permanentId,
                  suspendedPermanentId: ally.permanentId,
                  effectSuspendSeat: attackerSeat,
                  byEffectCardId: attacker.topCard.cardId,
                  byEffectKeyword: "Alliance",
                });
              }
            }
          }
        }
      }

      if (this.access.game.gameOver) return;
      if (raidTriggeredAtDeclaration && !raidResolvedInWindow) await this.resolveRaidEffect(attacker.permanentId);

      // A flagged forced attack can drain the remainder of its already-open timing
      // window here. Combat stays marked as resolving, so another forced attack from
      // that same simultaneous group is correctly a no-op instead of nesting.
      if (opts.drainTimingWindow !== undefined) await opts.drainTimingWindow({ retireUnactivatable: true });
      // The turn player's pooled attack-declaration effects are done; the non-turn player's
      // attack watchers resolve now, still before Counter Timing so a redirect lands in time.
      // Their eligibility was captured at the declaration (`prepareSubTrigger`), so a target
      // switch made meanwhile does not retroactively gate them (BT11-092 Q2118).
      if (deferredOpponentAttackWatchers !== undefined) await deferredOpponentAttackWatchers();

      // The target may also have been switched by an effect resolved by the drain;
      // read it only after every pre-Counter redirect opportunity has completed.
      const effectiveTarget = this.currentAttack?.target ?? target;

      // An attack ordered by an effect interrupts that effect (§11-1): from Counter Timing
      // through End of Attack the enclosing body counts as paused, so each step's triggers
      // resolve before the attack advances. Step 1 above deliberately stays outside the pause
      // so the attacker's [When Attacking] effects keep pooling for `drainTimingWindow`
      // (Q3944). Plain player-declared attacks pass no hook and run the body directly.
      const runAttackSteps = opts.runAttackSteps ?? ((body: () => Promise<void>) => body());
      // Read once and branch on it rather than `await opts.settleBetweenSteps?.()`: awaiting an
      // absent hook still burns a microtask tick on EVERY attack, and the fixed tick budget
      // `testkit/harness.ts`'s `settle()` gives deep async chains does not absorb that (same
      // hazard the `counterWait` comment below documents).
      const settleBetweenSteps = opts.settleBetweenSteps;
      if (this.access.game.gameOver) return;
      await runAttackSteps(async () => {
        // Ending the attack in a When Attacking or opponent attack watcher moves
        // directly to End of Attack. Counter Timing never opens for that attack.
        if (this.endRequested) {
          if (settleBetweenSteps !== undefined) await settleBetweenSteps();
          await this.fireEndOfAttack({ ...attackTrigger, target: effectiveTarget });
          return;
        }

        // 2. §11-3 Counter Timing (11-1-3's ordered list places it here: after the When
        // Attacking timings have fully resolved — 11-1-4's own example — and before block
        // timing). 11-1-5: this window still occurs even if the attacker later becomes
        // invalid, so it runs before the attacker-validity short-circuit below.
        //
        // `runCounterWindow` returns undefined (not a resolved Promise) when nothing is
        // eligible, so this conditionally skips the `await` entirely rather than awaiting an
        // already-resolved Promise — every attack pays this window's cost in a real await tick
        // ONLY when there is something to actually wait for. An unconditional await here (even
        // of `Promise.resolve()`) would add a microtask tick to EVERY attack, silently exhausting
        // the fixed microtask-tick budget `testkit/harness.ts`'s `settle()` gives already-deep
        // async chains elsewhere in the suite (mechanic.test.ts BLK-03, overflow.test.ts,
        // keywordBattle.test.ts all went from green to red on exactly that regression).
        const counterWait = this.runCounterWindow(attackerSeat, attacker);
        if (counterWait !== undefined) await counterWait;
        if (this.access.game.gameOver) return;

        // A Counter can create new nested timing effects while an effect-directed attack is
        // paused inside its enclosing effect body. Blast Digivolve is the canonical case: its
        // When Digivolving effect must finish before the attack advances to Block Timing.
        // The pre-Counter drain above cannot see effects that have not triggered yet, so drain
        // the same attack window again after the Counter response resolves.
        if (opts.drainTimingWindow !== undefined) await opts.drainTimingWindow();
        const targetAfterCounter = this.currentAttack?.target ?? effectiveTarget;

        // source fires OnEndAttack (AttackProcess.EndAttack) whenever the attack reaches its
        // end, including an early end (Comprehensive Rules §11-5-1-4 / §11-6: an unsuccessful
        // attack "ends without anything happening" but still reaches the End of Attack timing).
        // The attacker-invalidation guards below must fire it too, mirroring the endRequested
        // sibling path, rather than returning silently and skipping the window.
        if (!this.attackerStillValid(attacker)) {
          if (settleBetweenSteps !== undefined) await settleBetweenSteps();
          await this.fireEndOfAttack({ ...attackTrigger, target: targetAfterCounter });
          return;
        }

        // An effect (e.g. BT23-069) may have ended the attack during the When Attacking
        // timings: skip the block window and battle and transition straight to end-of-attack
        // (AttackProcess.EndAttack). The attack does not succeed.
        if (this.endRequested) {
          if (settleBetweenSteps !== undefined) await settleBetweenSteps();
          await this.fireEndOfAttack({ ...attackTrigger, target: targetAfterCounter });
          return;
        }

        // 3. Block window (AttackProcess.BlockTiming, cs:322-405).
        let defender = this.currentDefender(targetAfterCounter);
        const blockerId = await this.runBlockWindow(attackerSeat, attacker);
        if (this.access.game.gameOver) return;
        if (blockerId !== null) {
          const blocker = this.access.permanentById(blockerId);
          if (blocker !== undefined) {
            defender = blocker;
            await this.switchDefenderToBlocker(attacker, blocker);
          }
        }

        if (!this.attackerStillValid(attacker)) {
          if (settleBetweenSteps !== undefined) await settleBetweenSteps();
          await this.fireEndOfAttack({ ...attackTrigger, target: targetAfterCounter });
          return;
        }

        // An effect may end the attack specifically because the block switched its target
        // (BT16-032). That trigger resolves inside switchDefenderToBlocker, after the earlier
        // pre-block endRequested check, so honor the newly-requested end before comparing DP.
        if (this.endRequested) {
          if (settleBetweenSteps !== undefined) await settleBetweenSteps();
          await this.fireEndOfAttack({ ...attackTrigger, target: targetAfterCounter });
          return;
        }

        // 4. Battle resolution (AttackProcess.DetermineAttackOutcome, cs:407-468).
        let ordinarySecurityProcessed = false;
        if (!this.defenderStillValid(targetAfterCounter, defender)) {
          // Comprehensive Rules §11-2-6: even though the attack target Digimon was removed
          // mid-resolution (e.g. deleted/bounced during When Attacking or the block window),
          // that Digimon REMAINS the attack target — the attack simply fails. It must NOT fall
          // back to a player-directed security check just because `defender` is undefined.
        } else if (defender === undefined) {
          // Player-directed, unblocked: hand off to security-and-win-check.
          ordinarySecurityProcessed = true;
          await this.hooks.checkSecurity(this.access.opponentOf(attackerSeat), attacker.permanentId, "attack");
        } else if (
          this.access.isBattleAreaDigimon(defender, this.hooks.continuous) &&
          this.access.isBattleAreaDigimon(attacker, this.hooks.continuous)
        ) {
          await this.resolveDigimonBattle(attacker, defender, { isAttackBattle: true });
          if (this.access.game.gameOver) return;
          // §11-1-4: the battle's [On Deletion] windows were parked behind the ordering
          // effect's window token; activate them before Piercing and End of Attack.
          if (settleBetweenSteps !== undefined) await settleBetweenSteps();
        }

        // CR 16-7-4: Piercing triggered by a direct effect battle remains pending
        // even if that battle removed the original attack target. The official attack
        // flowchart routes an unsuccessful attack through this step before End of Attack.
        // A normal player attack already used this attack's one security transition.
        if (
          this.currentAttack?.piercingTriggered &&
          !this.endRequested &&
          !ordinarySecurityProcessed &&
          this.attackerStillValid(attacker)
        ) {
          this.currentAttack.piercingTriggered = false;
          await this.hooks.checkSecurity(this.access.opponentOf(attackerSeat), attacker.permanentId, "piercing");
        }

        // 5. End of attack (AttackProcess.EndAttack, cs:473-484).
        if (settleBetweenSteps !== undefined) await settleBetweenSteps();
        await this.fireEndOfAttack({ ...attackTrigger, target: targetAfterCounter });
      });
    } finally {
      this.settlementDepth++;
      try {
        await this.cleanup();
        const completedCombat = this.takeCompletedCombat();
        if (completedCombat !== undefined && !this.access.game.gameOver)
          this.hooks.emit({ kind: "combatResolved", ...completedCombat });
        // `gameOver` stays the last event of a match; it already closes everything an attack opened.
        if (!this.access.game.gameOver) {
          this.hooks.emit({ kind: "attackEnded", seat: attackerSeat, attackerPermanentId: attacker.permanentId });
        }
      } finally {
        this.settlementDepth--;
      }
    }
    if (!this.access.game.gameOver) await this.hooks.afterAttackEnded?.();
  }

  /**
   * Resolve an open block window. Called by the GameEngine when a declareBlock or
   * declineBlock intent arrives from the defending seat (`blockerPermanentId`
   * undefined => decline). Returns whether the response was accepted (a window was
   * open for this seat and the choice was legal); the engine maps a false return to
   * a rejected intent.
   */
  resolveBlock(seat: Seat, blockerPermanentId: string | undefined): boolean {
    const window = this.openWindow;
    if (window === undefined || window.defendingSeat !== seat) {
      return false;
    }
    if (blockerPermanentId !== undefined && !window.eligibleBlockerIds.has(blockerPermanentId)) {
      return false;
    }
    // ＜Collision＞ (§16-30): while the attacker has this effect, the defending player
    // "is forced to block whenever possible" — a decline is only legal when no
    // eligible blocker exists (runBlockWindow already resolves the window immediately
    // in that case, so this only rejects a decline offered against a real choice).
    if (blockerPermanentId === undefined && window.eligibleBlockerIds.size > 0) {
      const attacker = this.access.permanentById(window.attackerPermanentId);
      if (attacker !== undefined && hasCollision(attacker, this.hooks.continuous)) {
        return false;
      }
    }
    this.openWindow = undefined;
    this.clearMirroredWindow("block");
    if (blockerPermanentId === undefined) {
      this.hooks.emit({ kind: "blockDeclined", attackerPermanentId: window.attackerPermanentId });
    }
    window.resolve(blockerPermanentId ?? null);
    return true;
  }

  /**
   * Resolve an open ＜Alliance＞ decision. `allyPermanentId` is the
   * chosen ally, or undefined to pass.
   */
  resolveAlliance(seat: Seat, allyPermanentId: string | undefined): boolean {
    const decision = this.allianceDecision;
    if (decision === undefined || decision.seat !== seat) return false;
    if (allyPermanentId !== undefined && !decision.eligibleAllyIds.has(allyPermanentId)) return false;
    this.allianceDecision = undefined;
    this.clearMirroredWindow("alliance");
    this.hooks.emit({ kind: "allianceResolved", permanentId: decision.permanentId });
    decision.resolve(allyPermanentId ?? null);
    return true;
  }

  /**
   * Resolve an open ＜Evade＞ decision. `accept: true` suspends the permanent to
   * prevent deletion; `false` lets it be deleted.
   */
  resolveEvade(seat: Seat, permanentId: string, accept: boolean): boolean {
    const decision = this.evadeDecision;
    if (decision === undefined || decision.seat !== seat || decision.permanentId !== permanentId) return false;
    this.evadeDecision = undefined;
    this.clearMirroredWindow("evade");
    this.hooks.emit({ kind: "evadeResolved", permanentId, accepted: accept });
    decision.resolve(accept);
    return true;
  }

  /**
   * Resolve an open ＜Barrier＞ decision. `accept: true` trashes top security to
   * prevent deletion; `false` lets it be deleted.
   */
  resolveBarrier(seat: Seat, permanentId: string, accept: boolean): boolean {
    const decision = this.barrierDecision;
    if (decision === undefined || decision.seat !== seat || decision.permanentId !== permanentId) return false;
    this.barrierDecision = undefined;
    this.clearMirroredWindow("barrier");
    this.hooks.emit({ kind: "barrierResolved", permanentId, accepted: accept });
    decision.resolve(accept);
    return true;
  }

  /**
   * Pass the open §11-3 Counter Timing window without activating a [Counter]
   * effect. Called by the `respondCounter` intent handler when the response has
   * no chosen source.
   */
  resolveCounterPass(seat: Seat): boolean {
    const window = this.counterWindow;
    if (window === undefined || window.defendingSeat !== seat) return false;
    this.counterWindow = undefined;
    this.clearMirroredWindow("counter");
    this.hooks.emit({ kind: "counterResolved", attackerPermanentId: window.attackerPermanentId, activated: false });
    window.resolve();
    return true;
  }

  /**
   * Close the open §11-3 Counter Timing window AFTER the intent handler has
   * already run the chosen [Counter] effect's body, registering the §11-3-2 cap
   * (1 activated [Counter] effect per attack). The window doesn't reopen for a
   * second choice — the cap is spent.
   */
  resolveCounterActivated(seat: Seat): boolean {
    const window = this.counterWindow;
    if (window === undefined || window.defendingSeat !== seat) return false;
    this.counterWindow = undefined;
    this.clearMirroredWindow("counter");
    this.counterActivationsThisAttack += 1;
    this.hooks.emit({ kind: "counterResolved", attackerPermanentId: window.attackerPermanentId, activated: true });
    window.resolve();
    return true;
  }

  // --- internals -----------------------------------------------------------

  private currentDefender(target: AttackTarget): Permanent | undefined {
    if (target.kind === "player") {
      return undefined;
    }
    return this.access.permanentById(target.permanentId);
  }

  /**
   * source guards `AttackingPermanent.TopCard == null || !IsDigimon` at every
   * state transition (documented behavior 325, 386, 410): if the attacker has
   * left play or stopped being a Digimon mid-resolution, skip straight to end.
   */
  private attackerStillValid(attacker: Permanent): boolean {
    return this.access.isBattleAreaDigimon(attacker, this.hooks.continuous);
  }

  /**
   * Whether the attack's target is still resolvable at battle-resolution time. A
   * player target is always valid; a permanent target is valid only if that
   * permanent is still around. Mirrors {@link attackerStillValid} on the defender
   * side: Comprehensive Rules §11-2-6 — if the attack target Digimon is removed
   * during an attack (deleted/bounced by a When-Attacking effect or during the
   * block window), it REMAINS the attack target and the attack fails, rather than
   * being reinterpreted as a player-directed attack.
   */
  private defenderStillValid(target: AttackTarget, defender: Permanent | undefined): boolean {
    return target.kind === "player" || defender !== undefined;
  }

  /**
   * Open the block window and await the defending seat's response. When no
   * eligible blocker exists, resolve immediately with null (no round trip),
   * mirroring the source guard that only prompts when >= 1 blocker is available
   * (documented behavior). `blockWindowOpened` is a protocol promise that a real
   * response is pending, so an empty candidate set must not publish it.
   */
  private runBlockWindow(attackerSeat: Seat, attacker: Permanent): Promise<string | null> {
    const defendingSeat = this.access.opponentOf(attackerSeat);
    const target = this.currentAttack?.target;
    // CR 12-1-5: the current attack target cannot perform a block, including after Raid.
    const blockers = eligibleBlockers(this.access, attacker, this.hooks.continuous).filter(
      (blocker) => target?.kind !== "permanent" || blocker.permanentId !== target.permanentId,
    );
    const eligibleBlockerIds = blockers.map((b) => b.permanentId);

    if (blockers.length === 0) {
      return Promise.resolve(null);
    }

    // ＜Collision＞ forces the block (§16-30), and `resolveBlock` rejects a decline while a
    // blocker is left. The window says so, so the defender is never offered that refusal.
    const mustBlock = hasCollision(attacker, this.hooks.continuous);
    // Mirrored before the event goes out: the room arms the window's answer timeout off the
    // mirrored state as it broadcasts, so the field must already describe this window.
    this.mirrorWindow("block", defendingSeat, {
      attackerPermanentId: attacker.permanentId,
      eligiblePermanentIds: eligibleBlockerIds,
      mustBlock,
    });
    this.hooks.emit({
      kind: "blockWindowOpened",
      attackerPermanentId: attacker.permanentId,
      eligibleBlockerIds,
      ...(mustBlock ? { mustBlock: true } : {}),
    });

    return new Promise<string | null>((resolve) => {
      this.openWindow = {
        attackerPermanentId: attacker.permanentId,
        defendingSeat,
        eligibleBlockerIds: new Set(eligibleBlockerIds),
        resolve,
      };
    });
  }

  /**
   * Open an ＜Alliance＞ decision window: ask `seat` to choose an
   * ally to suspend from `eligibleAllyIds`. Resolves immediately with null when
   * no eligible allies exist.
   */
  private runAllianceDecision(seat: Seat, permanentId: string, eligibleAllyIds: string[]): Promise<string | null> {
    if (eligibleAllyIds.length === 0) return Promise.resolve(null);

    const promise = new Promise<string | null>((resolve) => {
      this.allianceDecision = {
        permanentId,
        seat,
        eligibleAllyIds: new Set(eligibleAllyIds),
        resolve,
      };
    });
    this.mirrorWindow("alliance", seat, { permanentId, eligiblePermanentIds: eligibleAllyIds });
    this.hooks.emit({
      kind: "alliancePrompt",
      permanentId,
      eligibleAllyIds,
    });
    return promise;
  }

  /** Unsuspended other Digimon `attackerPermanentId`'s controller could suspend for ＜Alliance＞. */
  private allianceAllyIds(attackerPermanentId: string): string[] {
    const attacker = this.access.permanentById(attackerPermanentId);
    if (attacker === undefined) return [];
    return this.access
      .battleAreaPermanents(attacker.controllerSeat)
      .filter(
        (p) =>
          p.permanentId !== attacker.permanentId &&
          canPaySuspendCost(p, this.hooks.continuous) &&
          this.access.isBattleAreaDigimon(p, this.hooks.continuous),
      )
      .map((p) => p.permanentId);
  }

  /**
   * ＜Raid＞ (§16-23): when this Digimon attacks, you may switch the attack target onto the
   * opponent's UNSUSPENDED Digimon with the highest DP (§16-23-4: the attacker's controller
   * picks among any tied for highest). The trigger is fixed at declaration, but the keyword
   * must still be there when it resolves: an attacker that lost it meanwhile (for example by
   * app fusing into a card without it) cannot activate it (Q5444).
   */
  canResolveRaid(attackerPermanentId: string): boolean {
    const attacker = this.access.permanentById(attackerPermanentId);
    return (
      this.currentAttack?.attackerPermanentId === attackerPermanentId &&
      attacker !== undefined &&
      this.attackerStillValid(attacker) &&
      this.hasKeyword(attackerPermanentId, "Raid")
    );
  }

  /** True when ＜Raid＞ resolving now could switch the attack target. */
  hasRaidTarget(attackerPermanentId: string): boolean {
    const attack = this.currentAttack;
    return attack !== undefined && this.canResolveRaid(attackerPermanentId) && this.raidTargets(attack.seat).length > 0;
  }

  private raidTargets(attackingSeat: Seat): Permanent[] {
    return this.access
      .battleAreaPermanents(this.access.opponentOf(attackingSeat))
      .filter(
        (p) => !p.isSuspended && this.access.isBattleAreaDigimon(p, this.hooks.continuous) && p.topCard !== undefined,
      );
  }

  /**
   * Resolve ＜Raid＞ from the combined [When Attacking] window or the legacy inline step.
   * `presetAnswer` is the Yes/No the controller set in the effect order: No skips the
   * redirect, and Yes skips the prompt when only one Digimon ties for the highest DP.
   */
  async resolveRaidEffect(attackerPermanentId: string, presetAnswer?: boolean): Promise<void> {
    if (presetAnswer === false) return;
    const attack = this.currentAttack;
    const attacker = this.access.permanentById(attackerPermanentId);
    if (attack === undefined || attacker === undefined || !this.canResolveRaid(attackerPermanentId)) return;
    const unsuspended = this.raidTargets(attack.seat);
    if (unsuspended.length === 0) return;
    const highestDP = Math.max(...unsuspended.map((p) => p.currentDP));
    const tied = unsuspended.filter((p) => p.currentDP === highestDP);
    const onlyTarget = presetAnswer === true && tied.length === 1 ? tied[0]!.topCard!.instanceId : undefined;
    const chosenInstanceId =
      onlyTarget ??
      (await this.hooks.selectOptionalInstance?.(
        attack.seat,
        tied.map((p) => p.topCard!.instanceId),
        "＜Raid＞: switch the attack target to this opponent's Digimon?",
        attacker.topCard === undefined ? undefined : this.permanentSource(attacker),
      ));
    if (chosenInstanceId === undefined) return;
    const chosen = tied.find((p) => p.topCard?.instanceId === chosenInstanceId);
    if (chosen === undefined) return;
    if (this.redirectTarget({ kind: "permanent", permanentId: chosen.permanentId })) {
      await this.hooks.fireSubTrigger?.("whenAttackTargetSwitched", {
        subjectPermanentId: attacker.permanentId,
        attackerPermanentId: attacker.permanentId,
      });
    }
  }

  /** Whether an ＜Alliance＞ instance still has a suspendable ally, re-read from live state. */
  hasAllianceAlly(attackerPermanentId: string): boolean {
    return this.allianceAllyIds(attackerPermanentId).length > 0;
  }

  /**
   * Resolve ONE ＜Alliance＞ instance from the combined [When Attacking] window. Allies are
   * re-read here, so an instance ordered after another one (or after a derived evolution)
   * sees the current board. The DP/security benefit it pays for is installed on the attacker
   * and is not undone by a later evolution of the suspended ally.
   */
  async resolveAllianceEffect(attackerPermanentId: string, presetAnswer?: boolean): Promise<void> {
    if (presetAnswer === false) return;
    const attacker = this.access.permanentById(attackerPermanentId);
    if (attacker === undefined) return;
    const allyIds = this.allianceAllyIds(attacker.permanentId);
    // No eligible ally left when this instance resolves: the keyword simply does nothing.
    // Prompting an empty choice would be a decision with one answer.
    if (allyIds.length === 0) return;
    const allyId =
      presetAnswer === true && allyIds.length === 1
        ? allyIds[0]!
        : await this.runAllianceDecision(attacker.controllerSeat, attacker.permanentId, allyIds);
    if (this.access.game.gameOver || allyId === null) return;
    const ally = this.access.permanentById(allyId);
    if (ally === undefined) return;
    if (!canPaySuspendCost(ally, this.hooks.continuous)) return;
    const allySuspended = this.suspendInCombat(ally);
    this.hooks.addDpModifier?.(attacker.permanentId, ally.currentDP);
    this.hooks.addSecurityAttack?.(attacker.permanentId);
    await this.fireSuspended(ally, allySuspended, {
      effectSuspendSeat: attacker.controllerSeat,
      byEffectCardId: attacker.topCard.cardId,
      byEffectKeyword: "Alliance",
    });
    if (allySuspended) {
      await this.hooks.fireSubTrigger?.("whenEffectSuspends", {
        subjectPermanentId: ally.permanentId,
        suspendedPermanentId: ally.permanentId,
        effectSuspendSeat: attacker.controllerSeat,
        byEffectCardId: attacker.topCard.cardId,
        byEffectKeyword: "Alliance",
      });
    }
  }

  /**
   * Open an ＜Evade＞ decision for a single permanent: ask the controller whether
   * to suspend it to prevent deletion. Public so both the combat (battle-loss) path
   * and the effect-deletion path (effects/primitives.ts `deletePermanent`) share the
   * same prompt/decision-window machinery rather than each auto-applying the keyword.
   */
  runEvadeDecision(seat: Seat, permanentId: string): Promise<boolean> {
    this.mirrorWindow("evade", seat, { permanentId });
    this.hooks.emit({ kind: "evadePrompt", permanentId });
    return new Promise<boolean>((resolve) => {
      this.evadeDecision = { permanentId, seat, resolve };
    });
  }

  /**
   * Open a ＜Barrier＞ decision for a single permanent: ask the controller whether
   * to trash top security to prevent deletion. Public for the same reason as
   * {@link runEvadeDecision}.
   */
  runBarrierDecision(seat: Seat, permanentId: string): Promise<boolean> {
    this.mirrorWindow("barrier", seat, { permanentId });
    this.hooks.emit({ kind: "barrierPrompt", permanentId });
    return new Promise<boolean>((resolve) => {
      this.barrierDecision = { permanentId, seat, resolve };
    });
  }

  /**
   * Open the §11-3 Counter Timing window and return a Promise for the caller to
   * await the defending seat's response — or `undefined` when
   * `hooks.counterEligible` reports nothing activatable, so the caller can skip
   * awaiting altogether (no round trip AND no extra microtask tick; see the call
   * site's comment). As with blocking, `counterWindowOpened` promises that a real
   * response is pending and is emitted only when at least one effect is eligible.
   */
  private runCounterWindow(attackerSeat: Seat, attacker: Permanent): Promise<void> | undefined {
    const defendingSeat = this.access.opponentOf(attackerSeat);
    const eligibleCounters = this.hooks.counterEligible?.(defendingSeat) ?? [];

    if (eligibleCounters.length === 0) {
      return undefined;
    }

    this.mirrorWindow("counter", defendingSeat, {
      attackerPermanentId: attacker.permanentId,
      eligibleCounters,
    });
    this.hooks.emit({
      kind: "counterWindowOpened",
      attackerPermanentId: attacker.permanentId,
      defendingSeat,
      eligibleCounters,
    });

    return new Promise<void>((resolve) => {
      this.counterWindow = { attackerPermanentId: attacker.permanentId, defendingSeat, resolve };
    });
  }

  /**
   * Suspend a permanent as part of combat and open the "when this Digimon suspends" window.
   *
   * Combat suspension bypasses the `fx.suspend` primitive (it must not be gated by a
   * "can't be suspended by effects" restriction — KB BT19-101 Q3185), which left the
   * `whenSuspended` bus silent for the most common way a Digimon suspends: attacking. A
   * generic "when any Digimon suspend" watcher must see it. KB BT17-089 puts the boundary
   * exactly here: "suspending from an attack declaration is due to the rules", so it is a
   * real suspension but NOT an effect-driven one — `whenEffectSuspends` stays unfired.
   *
   * ＜Alliance＞ and ＜Evade＞ suspend as a keyword-effect cost rather than by the rules. Alliance
   * explicitly carries its effect attribution through the dedicated call site, while Evade's
   * battle-only path remains a combat transition without an effect producer.
   */
  private suspendInCombat(permanent: Permanent): boolean {
    if (permanent.isSuspended) return false;
    this.access.suspend(permanent);
    return true;
  }

  /**
   * Open the `whenSuspended` window for a permanent {@link suspendInCombat} just suspended.
   *
   * Split from the suspension itself because awaiting a watcher yields control: firing
   * inline would let an armed effect run BETWEEN a keyword's cost and its benefit — ＜Alliance＞
   * suspends the ally and only then adds its DP, and those two are one atomic effect (§16-24).
   * Each call site fires once its own step is complete.
   */
  private async fireSuspended(
    permanent: Permanent,
    didSuspend: boolean,
    cause?: Pick<TriggerInfo, "effectSuspendSeat" | "byEffectCardId" | "byEffectKeyword">,
  ): Promise<void> {
    if (!didSuspend) return;
    const trigger = {
      subjectPermanentId: permanent.permanentId,
      suspendedPermanentId: permanent.permanentId,
      ...cause,
    };
    const fireTappedWindow = () => this.hooks.fireTiming(EffectTiming.OnTappedAnyone, trigger);
    if (this.hooks.withPendingSuspensionSubTriggers !== undefined) {
      await this.hooks.withPendingSuspensionSubTriggers(trigger, fireTappedWindow);
      return;
    }
    await fireTappedWindow();
    await this.hooks.fireSubTrigger?.("whenSuspended", trigger);
  }

  private async switchDefenderToBlocker(attacker: Permanent, blocker: Permanent): Promise<void> {
    const blockerSuspended = this.suspendInCombat(blocker);
    this.hooks.emit({ kind: "blocked", blockerPermanentId: blocker.permanentId });
    await this.hooks.fireBlockTiming({
      attackerPermanentId: attacker.permanentId,
      blockerPermanentId: blocker.permanentId,
      blockerSuspended,
    });
  }

  /**
   * Attacker vs. defender Digimon: compare currentDP and delete the loser(s).
   * Source IBattle.CompareStats/Battle (documented behavior): winner > loser
   * deletes the loser; an equal-DP tie deletes both. The pure decision lives in
   * resolve.ts; here we apply it to authoritative state and narrate.
   */
  async resolveBattle(
    attacker: Permanent,
    defender: Permanent,
    opts?: { comparison?: "digivolutionCards" },
  ): Promise<void> {
    // Direct battles never check security here. They can record Piercing for the
    // same attacking Digimon; another Digimon's battle cannot (EX11-074 Q5957-Q5959).
    await this.resolveDigimonBattle(attacker, defender, { comparison: opts?.comparison });
  }

  private async resolveDigimonBattle(
    attacker: Permanent,
    defender: Permanent,
    battle: DigimonBattleKind,
  ): Promise<void> {
    const battleScopeId = this.hooks.beginBattleScope?.();
    this.battles.push({ attacker, defender });
    try {
      await this.hooks.recomputeBattleEffects?.();
      await this.resolveDigimonBattleResult(attacker, defender, battle);
      if (this.access.game.gameOver) {
        if (battleScopeId !== undefined) this.hooks.endBattleScope?.(battleScopeId);
        return;
      }
      await this.hooks.sweepEndOfBattle?.(battleScopeId);
    } catch (error) {
      if (battleScopeId !== undefined) this.hooks.endBattleScope?.(battleScopeId);
      throw error;
    } finally {
      this.settlementDepth++;
      this.battles.pop();
      try {
        if (!this.access.game.gameOver) {
          await this.hooks.recomputeBattleEffects?.();
        }
      } finally {
        this.settlementDepth--;
      }
    }
  }

  /**
   * A "can't be deleted in battle" grant spares the loser, and so does a general "can't be
   * deleted" (Q3044). A battle has no controlling effect, so opponent-scoped and effect-only
   * entries do not apply.
   */
  private sparedFromBattleDeletion(permanentId: string): boolean {
    const continuous = this.hooks.continuous;
    if (continuous === undefined) return false;
    return (
      continuous.hasRestriction(permanentId, "beDeletedInBattle") ||
      continuous.hasRestriction(permanentId, "beDeleted", undefined, { byOpponentEffect: false, byEffect: false })
    );
  }

  private async resolveBattleDeletionPreventions(
    finalDeletedIds: string[],
    isAttackBattle: boolean,
  ): Promise<string[] | undefined> {
    const consult = this.hooks.consultLeavePrevention;
    if (this.hooks.keywordReactionsInLeavePrevention !== true || consult === undefined) {
      return this.resolveBattleDeletionPreventionsInline(finalDeletedIds, isAttackBattle);
    }
    const prevented = await consult(finalDeletedIds, { keywordPreventions: { interruptsEffect: isAttackBattle } });
    if (this.access.game.gameOver) {
      return undefined;
    }
    return finalDeletedIds.filter((id) => !prevented.has(id));
  }

  private async resolveBattleDeletionPreventionsInline(
    finalDeletedIds: string[],
    isAttackBattle: boolean,
  ): Promise<string[] | undefined> {
    // ＜Evade＞ (§16-35): when this Digimon would be deleted by battle, you may
    // suspend it to prevent that deletion. Only usable when unsuspended (the
    // suspension IS the cost). Prompt the controller for each eligible permanent.
    const evadedIds = new Set<string>();
    const evadeSuspended: Permanent[] = [];
    for (const permanentId of finalDeletedIds) {
      if (!this.hasKeyword(permanentId, "Evade")) continue;
      const perm = this.access.permanentById(permanentId);
      if (perm === undefined || !canPaySuspendCost(perm, this.hooks.continuous)) continue;
      const accepted = await this.runEvadeDecision(perm.controllerSeat, permanentId);
      if (this.access.game.gameOver) {
        return undefined;
      }
      if (accepted) {
        // Cost then prevention, with no yield between them; watchers run once the whole
        // ＜Evade＞ resolution is settled.
        if (canPaySuspendCost(perm, this.hooks.continuous) && this.suspendInCombat(perm)) {
          evadeSuspended.push(perm);
          evadedIds.add(permanentId);
        }
      }
    }
    for (const perm of evadeSuspended) await this.fireSuspended(perm, true);
    const resolvedDeletedIds = finalDeletedIds.filter((id) => !evadedIds.has(id));

    // ＜Barrier＞ (§16-25): when this Digimon would be deleted in battle, by
    // trashing the top card of your security stack, prevent that deletion. Each
    // separate battle deletion can trigger it; there is no once-per-turn limit.
    const barrieredIds = new Set<string>();
    for (const permanentId of resolvedDeletedIds) {
      if (!this.hasKeyword(permanentId, "Barrier")) continue;
      const perm = this.access.permanentById(permanentId);
      if (perm === undefined) continue;
      if (this.access.securityCount(perm.controllerSeat) === 0) continue;
      const accepted = await this.runBarrierDecision(perm.controllerSeat, permanentId);
      if (this.access.game.gameOver) {
        return undefined;
      }
      if (accepted) {
        if (this.hooks.trashTopSecurityForBarrier !== undefined) {
          await this.hooks.trashTopSecurityForBarrier(perm.controllerSeat, isAttackBattle);
        } else {
          this.access.flipTopSecurityToTrash(perm.controllerSeat);
        }
        barrieredIds.add(permanentId);
      }
    }
    const postBarrierDeletedIds = resolvedDeletedIds.filter((id) => !barrieredIds.has(id));
    // Q4262: Barrier does not cancel same-event prevention or instead siblings. The shared
    // consult still offers the instead reactions (Q6250) and lets eligible prevention
    // candidates such as P-146 (Q4261/Q4262) resolve independently.
    if (barrieredIds.size > 0) {
      await this.hooks.consultLeavePrevention?.([...barrieredIds]);
    }

    // ＜Armor Purge＞ (§16-19): by trashing this Digimon's own top card (promoting the
    // digivolution card beneath it to the new top), prevent this Digimon's deletion. Requires
    // >= 1 digivolution card to promote.
    const armorPurgedIds = new Set<string>();
    for (const permanentId of postBarrierDeletedIds) {
      if (!this.hasKeyword(permanentId, "Armor Purge")) continue;
      const perm = this.access.permanentById(permanentId);
      if (perm === undefined || perm.topCard === undefined || perm.stack.length === 0) continue;
      const chosenInstanceId = await this.hooks.selectOptionalInstance?.(
        perm.controllerSeat,
        [perm.topCard.instanceId],
        "＜Armor Purge＞: trash this Digimon's top card to prevent its deletion?",
        this.permanentSource(perm),
        DecisionSelectionGoal.PROTECT.value,
      );
      if (chosenInstanceId === undefined) continue;
      // Emitted before the purge: it promotes the digivolution card underneath, so reading the
      // top card afterwards would name the card that replaced the holder, not the holder itself.
      this.emitDeletionPrevented("Armor Purge", perm);
      await this.hooks.armorPurge?.(permanentId);
      armorPurgedIds.add(permanentId);
    }
    const postArmorPurgeDeletedIds = postBarrierDeletedIds.filter((id) => !armorPurgedIds.has(id));

    // ＜Fragment (N)＞ (§16-37): by choosing and trashing N of ITS OWN digivolution cards,
    // prevent this Digimon's deletion. All-or-nothing: fewer than N chosen is a decline.
    const fragmentSavedIds = new Set<string>();
    for (const permanentId of postArmorPurgeDeletedIds) {
      if (!this.hasKeyword(permanentId, "Fragment")) continue;
      const perm = this.access.permanentById(permanentId);
      if (perm === undefined || perm.topCard === undefined) continue;
      const n = fragmentCountOf(perm.topCard.cardId, this.hooks.continuous?.grantedKeywords?.(permanentId));
      if (n === undefined || n === 0 || perm.stack.length < n) continue;
      const chosenIds = await this.hooks.selectOptionalInstances?.(
        perm.controllerSeat,
        perm.stack.map((card) => card.instanceId),
        n,
        `＜Fragment (${n})＞: trash ${n} of this Digimon's digivolution cards to prevent its deletion?`,
        this.permanentSource(perm),
        DecisionSelectionGoal.PROTECT.value,
      );
      if (chosenIds === undefined || chosenIds.length < n) continue;
      // ＜Fragment＞ is a keyword effect, so "when effects trash" watchers must see this trash.
      await this.hooks.trashDigivolutionCards?.(permanentId, chosenIds, {
        byEffectSeat: perm.controllerSeat,
        byEffectCardId: perm.topCard.cardId,
      });
      this.emitDeletionPrevented("Fragment", perm);
      fragmentSavedIds.add(permanentId);
    }
    const postFragmentDeletedIds = postArmorPurgeDeletedIds.filter((id) => !fragmentSavedIds.has(id));

    // ＜Scapegoat＞ (§16-32): by deleting 1 of the controller's OTHER Digimon, prevent this
    // Digimon's deletion. A battle death is never "by one of your [own] effects" (§16-32-1),
    // so — unlike the effect-deletion path in primitives.ts — no cause check is needed here.
    const scapegoatSavedIds = new Set<string>();
    for (const permanentId of postFragmentDeletedIds) {
      if (!this.hasKeyword(permanentId, "Scapegoat")) continue;
      const perm = this.access.permanentById(permanentId);
      if (perm === undefined) continue;
      const candidates = this.access
        .battleAreaPermanents(perm.controllerSeat)
        .filter(
          (p) =>
            p.permanentId !== permanentId &&
            p.topCard !== undefined &&
            this.access.isBattleAreaDigimon(p, this.hooks.continuous),
        );
      if (candidates.length === 0) continue;
      const chosenInstanceId = await this.hooks.selectOptionalInstance?.(
        perm.controllerSeat,
        candidates.map((p) => p.topCard!.instanceId),
        "＜Scapegoat＞: delete 1 of your other Digimon to prevent this deletion?",
        this.permanentSource(perm),
        DecisionSelectionGoal.PROTECT.value,
      );
      if (chosenInstanceId === undefined) continue;
      const sacrifice = candidates.find((p) => p.topCard?.instanceId === chosenInstanceId);
      if (sacrifice === undefined) continue;
      const sacrificeStackIds = sacrifice.stack.map((c) => c.instanceId);
      const sacrificeFaceDownSourceInstanceIds = [...sacrifice.stack, ...sacrifice.linked]
        .filter((card) => !card.faceUp)
        .map((card) => card.instanceId);
      const sacrificeHostInstanceId = sacrifice.topCard!.instanceId;
      const sacrificeHasFortitude = sacrificeStackIds.length > 0 && this.hasKeyword(sacrifice.permanentId, "Fortitude");
      const sacrificeMoved = this.access.deletePermanent(sacrifice.permanentId);
      this.hooks.dropPermanentSubscriptions?.(sacrifice.permanentId);
      if (sacrificeMoved.length > 0) {
        await this.hooks.fireTiming(EffectTiming.OnDestroyedAnyone, {
          deletedPermanentId: sacrifice.permanentId,
          deletedPermanentIds: [sacrifice.permanentId],
          deletedControllerSeat: sacrifice.controllerSeat,
          deletedPermanentSnapshots: sacrifice.topCard
            ? [
                {
                  permanentId: sacrifice.permanentId,
                  controllerSeat: sacrifice.controllerSeat,
                  topCardId: sacrifice.topCard.cardId,
                  faceDownSourceInstanceIds: sacrificeFaceDownSourceInstanceIds,
                },
              ]
            : [],
          deletedInstanceIds: sacrificeMoved,
          deletedWasStackInstanceIds: sacrificeStackIds,
          fortitudeInstanceIds: sacrificeHasFortitude ? [sacrificeHostInstanceId] : [],
          deletedHostInstanceByInstanceId: getCardDefinition(sacrifice.topCard!.cardId)?.isToken
            ? {}
            : Object.fromEntries(sacrificeMoved.map((instanceId) => [instanceId, sacrificeHostInstanceId])),
          removalCause: "byEffect",
        });
      }
      this.emitDeletionPrevented("Scapegoat", perm, sacrifice.permanentId, sacrifice.topCard?.cardId);
      scapegoatSavedIds.add(permanentId);
    }
    const postScapegoatDeletedIds = postFragmentDeletedIds.filter((id) => !scapegoatSavedIds.has(id));

    const cardPreventedIds = (await this.hooks.consultLeavePrevention?.(postScapegoatDeletedIds)) ?? new Set<string>();
    const postCardPreventionDeletedIds = postScapegoatDeletedIds.filter((id) => !cardPreventedIds.has(id));
    return postCardPreventionDeletedIds;
  }

  private async resolveDigimonBattleResult(
    attacker: Permanent,
    defender: Permanent,
    { isAttackBattle = false, comparison }: DigimonBattleKind,
  ): Promise<void> {
    const outcome = resolvePermanentBattle({
      attackerPermanentId: attacker.permanentId,
      attackerDP: attacker.currentDP,
      defenderPermanentId: defender.permanentId,
      defenderDP: defender.currentDP,
      // ＜Iceclad＞ (§16-35): compare digivolution-card counts instead of DP.
      attackerHasIceclad: comparison === "digivolutionCards" || this.hasKeyword(attacker.permanentId, "IceClad"),
      defenderHasIceclad: this.hasKeyword(defender.permanentId, "IceClad"),
      attackerDigivolutionCount: attacker.stack.length,
      defenderDigivolutionCount: defender.stack.length,
      attackerSparedFromDeletion: this.sparedFromBattleDeletion(attacker.permanentId),
      defenderSparedFromDeletion: this.sparedFromBattleDeletion(defender.permanentId),
    });

    // The blow precedes the "would be deleted" questions. Final deletions are published
    // later, so they cannot tell the client which surviving protected card took that blow.
    this.hooks.emit({
      kind: "battleCompared",
      attackerPermanentId: attacker.permanentId,
      defenderPermanentId: defender.permanentId,
      loserPermanentIds: [...outcome.deletedPermanentIds],
      ...(isAttackBattle
        ? {}
        : {
            effectBattle: {
              attackerSeat: attacker.controllerSeat,
              attackerCardId: attacker.topCard.cardId,
              ...(attacker.topCard.artId ? { attackerArtId: attacker.topCard.artId } : {}),
              defenderCardId: defender.topCard.cardId,
              ...(defender.topCard.artId ? { defenderArtId: defender.topCard.artId } : {}),
            },
          }),
    });

    // Capture the winner now, but publish only after every "would be deleted/leave" replacement
    // has resolved (Q7022). The win is based on the comparison, not successful deletion (Q7023).
    const winningPermanentId =
      outcome.comparison === "attackerWins"
        ? attacker.permanentId
        : outcome.comparison === "defenderWins"
          ? defender.permanentId
          : undefined;
    const winningSeat =
      outcome.comparison === "attackerWins"
        ? attacker.controllerSeat
        : outcome.comparison === "defenderWins"
          ? defender.controllerSeat
          : undefined;
    const fireBattleWon = async (_options?: { deferIntoDeletionWindow?: boolean }): Promise<void> => {
      if (winningPermanentId === undefined) return;
      await this.hooks.fireSubTrigger?.("whenBattleWon", {
        attackerPermanentId: attacker.permanentId,
        defenderPermanentId: defender.permanentId,
        subjectPermanentId: winningPermanentId,
      });
    };

    const finalDeletedIds = [...outcome.deletedPermanentIds];
    const postCardPreventionDeletedIds = await this.resolveBattleDeletionPreventions(finalDeletedIds, isAttackBattle);
    if (postCardPreventionDeletedIds === undefined) {
      return;
    }

    const resolveBattleWon =
      winningPermanentId === undefined
        ? fireBattleWon
        : (this.hooks.prepareFrozenSubTrigger?.("whenBattleWon", {
            attackerPermanentId: attacker.permanentId,
            defenderPermanentId: defender.permanentId,
            subjectPermanentId: winningPermanentId,
          }) ?? fireBattleWon);
    const deletionReactions: (() => Promise<void>)[] = [];
    const prepareDeletionReaction = (event: SubTriggerEventName, payload: TriggerInfo): void => {
      deletionReactions.push(
        this.hooks.prepareFrozenSubTrigger?.(event, payload) ??
          (async () => {
            await this.hooks.fireSubTrigger?.(event, payload);
          }),
      );
    };

    // CR 16-13: all prevention settles before the holder can be deleted in battle.
    // Retaliation belongs to the subsequent On Deletion window, not this battle's
    // simultaneous deletion set. Its target is later deleted by an effect.
    const retaliationTargetsByInstanceId: Record<string, string> = {};
    const retaliationCountsByInstanceId: Record<string, number> = {};
    for (const [holder, opponent] of [
      [attacker, defender],
      [defender, attacker],
    ] as const) {
      if (
        postCardPreventionDeletedIds.includes(holder.permanentId) &&
        !postCardPreventionDeletedIds.includes(opponent.permanentId) &&
        holder.topCard !== undefined &&
        this.hasKeyword(holder.permanentId, "Retaliation")
      ) {
        retaliationTargetsByInstanceId[holder.topCard.instanceId] = opponent.permanentId;
        retaliationCountsByInstanceId[holder.topCard.instanceId] = Math.max(
          1,
          this.hooks.continuous
            ?.grantedKeywords?.(holder.permanentId)
            .filter((grant) => grant.keyword === "Retaliation").length ?? 0,
        );
      }
    }

    // ＜Fortitude＞ (§16-27): a Digimon with digivolution cards AND this effect, when deleted,
    // is replayed for free (mandatory — no decision). Captured pre-deletion so "had
    // digivolution cards" reads the live stack.
    const fortitudeReplayInstanceIds = new Map<string, string>();
    for (const permanentId of postCardPreventionDeletedIds) {
      if (!this.hasKeyword(permanentId, "Fortitude")) continue;
      const perm = this.access.permanentById(permanentId);
      if (perm === undefined || perm.topCard === undefined || perm.stack.length === 0) continue;
      fortitudeReplayInstanceIds.set(permanentId, perm.topCard.instanceId);
    }

    // ＜Ascension＞ (§16-43): the controller may place the deleted card at the top of their
    // security stack instead of leaving it in trash (optional trigger-type reaction, no cost —
    // captured pre-deletion for the same reason as Fortitude).
    const ascensionCandidates = new Map<string, { seat: Seat; cardId: string }>();
    for (const permanentId of postCardPreventionDeletedIds) {
      if (!this.hasKeyword(permanentId, "Ascension")) continue;
      const perm = this.access.permanentById(permanentId);
      if (perm === undefined || perm.topCard === undefined) continue;
      ascensionCandidates.set(perm.topCard.instanceId, { seat: perm.controllerSeat, cardId: perm.topCard.cardId });
    }

    // Match deletion watchers while losers are live, but defer their bodies until
    // after removal and the Piercing snapshot. This preserves event-time traits and
    // source counts without allowing a reaction to change battle-trigger eligibility.
    const deletedPermanentSnapshots = postCardPreventionDeletedIds.flatMap((permanentId) => {
      const permanent = this.access.permanentById(permanentId);
      return permanent?.topCard === undefined
        ? []
        : [
            {
              permanentId,
              controllerSeat: permanent.controllerSeat,
              topCardId: permanent.topCard.cardId,
              inheritedHostIsDigimon: inheritedDigimonHost({
                definition: getCardDefinition(permanent.topCard.cardId)!,
                effectiveKinds: this.effectiveKindsOf(permanent),
                inBattleArea: !permanent.inBreeding,
              }),
              stackInstanceIds: permanent.stack.map((card) => card.instanceId),
              faceDownSourceInstanceIds: [...permanent.stack, ...permanent.linked]
                .filter((card) => !card.faceUp)
                .map((card) => card.instanceId),
            },
          ];
    });

    // A Digimon still "deletes an opponent's Digimon in battle" when both combatants are
    // deleted by the same battle result. Match these watchers while the event subject and the
    // reacting inherited host are still live, then activate them after the simultaneous batch
    // has left play. A watcher on a separate surviving host remains eligible; the frozen bus
    // drops a watcher whose own host was part of the batch.
    const prepareBattleDeleteReaction = (
      subject: Permanent,
      victim: Permanent,
    ): ((options?: { deferIntoDeletionWindow?: boolean }) => Promise<void>) | undefined => {
      if (!postCardPreventionDeletedIds.includes(victim.permanentId)) return undefined;
      const payload: TriggerInfo = {
        subjectPermanentId: subject.permanentId,
        attackerPermanentId: subject.permanentId,
        deletedPermanentId: victim.permanentId,
        deletedPermanentIds: postCardPreventionDeletedIds,
        deletedPermanentSnapshots,
        deletedControllerSeat: victim.controllerSeat,
        ...(victim.topCard?.cardId === undefined ? {} : { deletedTopCardId: victim.topCard.cardId }),
        deletedInstanceIds,
        deletedWasStackInstanceIds,
        removalCause: "byBattle",
      };
      return (
        this.hooks.prepareFrozenSubTrigger?.("whenDeletesInBattle", payload) ??
        (async () => {
          await this.hooks.fireSubTrigger?.("whenDeletesInBattle", payload);
        })
      );
    };
    for (const permanentId of postCardPreventionDeletedIds) {
      if (this.access.permanentById(permanentId)?.topCard === undefined) continue;
      prepareDeletionReaction("onDeletionOf", {
        deletedPermanentId: permanentId,
        deletedPermanentIds: postCardPreventionDeletedIds,
        deletedPermanentSnapshots,
        deletedControllerSeat: this.access.permanentById(permanentId)?.controllerSeat,
        deletedTopCardId: this.access.permanentById(permanentId)?.topCard?.cardId,
        deletedDigivolutionCardCount: this.access.permanentById(permanentId)?.stack.length,
        removalCause: "byBattle",
      });
      // whenLeavesPlay is the delete∪bounce superset; fire it here too so a watcher reacts to
      // a battle deletion, matching the effect-path primitive (otherwise a card works when
      // deleted by an effect but silently not when deleted in combat).
      prepareDeletionReaction("whenLeavesPlay", {
        deletedPermanentId: permanentId,
        deletedControllerSeat: this.access.permanentById(permanentId)?.controllerSeat,
        deletedTopCardId: this.access.permanentById(permanentId)?.topCard?.cardId,
        deletedDigivolutionCardCount: this.access.permanentById(permanentId)?.stack.length,
        removalCause: "byBattle",
      });
    }

    const attackerTopCardId = attacker.topCard?.cardId;
    const defenderTopCardId = defender.topCard?.cardId;
    const deleted: string[] = [];
    const deletedInstanceIds: string[] = [];
    const deletedWasStackInstanceIds: string[] = [];
    const deletedWasLinkedInstanceIds: string[] = [];
    const deletedLinkHostInstanceByLinkedInstanceId: Record<string, string> = {};
    const deletedHostInstanceByInstanceId: Record<string, string> = {};
    const battleOpponentPermanentIdByInstanceId: Record<string, string> = {};
    const deletedEffectiveColorsByInstanceId: Record<string, CardColor[]> = {};
    // Material Save relocates cards before the battle deletion is finalized. Resolve it for
    // every loser first so the grant snapshot below describes the cards that will really leave.
    for (const permanentId of postCardPreventionDeletedIds) {
      if (this.hasKeyword(permanentId, "MaterialSave")) {
        await this.hooks.materialSave?.(permanentId);
      }
    }
    const attackerBattleDeleteReaction = prepareBattleDeleteReaction(attacker, defender);
    const defenderBattleDeleteReaction = prepareBattleDeleteReaction(defender, attacker);
    // Capture custom-grant eligibility while every battle loser is still live. Material Save
    // has now run, so this set reflects the cards that will actually leave play.
    const departingInstanceIds = postCardPreventionDeletedIds.flatMap((permanentId) => {
      const permanent = this.access.permanentById(permanentId);
      return permanent === undefined
        ? []
        : [
            ...(permanent.topCard === undefined ? [] : [permanent.topCard.instanceId]),
            ...permanent.stack.map((card) => card.instanceId),
            ...permanent.linked.map((card) => card.instanceId),
          ];
    });
    const customEffectGrantsSnapshot = this.hooks.snapshotCustomEffectGrants?.(departingInstanceIds);
    const stackEffectConferralsSnapshot = this.hooks.snapshotStackEffectConferrals?.();
    const tokenDeletionCandidates = postCardPreventionDeletedIds.flatMap((permanentId) => {
      const top = this.access.permanentById(permanentId)?.topCard;
      return top !== undefined && getCardDefinition(top.cardId)?.isToken === true ? [top] : [];
    });
    // Deletion returns Digi-Egg cards face-down to eggDeck, which is hidden from the normal
    // timing candidate pool. Keep those physical instances transiently available so an
    // inherited [On Deletion] effect can resolve after a battle deletion.
    const digiEggDeletionCandidates = postCardPreventionDeletedIds.flatMap((permanentId) => {
      const permanent = this.access.permanentById(permanentId);
      if (permanent === undefined) return [];
      return [
        ...permanent.stack,
        ...(permanent.topCard === undefined ? [] : [permanent.topCard]),
        ...permanent.linked,
      ].filter((card) => getCardDefinition(card.cardId)?.kinds.includes(CardKind.DigiEgg) === true);
    });
    for (const permanentId of postCardPreventionDeletedIds) {
      const stackIds = this.access.permanentById(permanentId)?.stack.map((c) => c.instanceId) ?? [];
      const linkedIds = this.access.permanentById(permanentId)?.linked.map((c) => c.instanceId) ?? [];
      const hostInstanceId = this.access.permanentById(permanentId)?.topCard?.instanceId;
      const effectiveColors = this.hooks.effectiveColorsOf?.(permanentId) ?? [];
      const moved = this.access.deletePermanent(permanentId, { byBattle: true });
      const battleOpponentId = permanentId === attacker.permanentId ? defender.permanentId : attacker.permanentId;
      for (const instanceId of moved) battleOpponentPermanentIdByInstanceId[instanceId] = battleOpponentId;
      for (const instanceId of moved) deletedEffectiveColorsByInstanceId[instanceId] = effectiveColors;
      deletedInstanceIds.push(...moved);
      deletedWasStackInstanceIds.push(...stackIds);
      deletedWasLinkedInstanceIds.push(...linkedIds);
      if (hostInstanceId !== undefined) {
        if (!tokenDeletionCandidates.some((card) => card.instanceId === hostInstanceId)) {
          for (const instanceId of moved) deletedHostInstanceByInstanceId[instanceId] = hostInstanceId;
        }
        for (const linkedInstanceId of linkedIds) {
          deletedLinkHostInstanceByLinkedInstanceId[linkedInstanceId] = hostInstanceId;
        }
      }
      // Drop the leaving permanent's modifier/continuous/subTrigger ledgers as it leaves the
      // field; combat deletes through raw state access and so routes its own teardown.
      this.hooks.dropPermanentSubscriptions?.(permanentId);
      deleted.push(permanentId);
    }

    // The deletion itself can grant conditional Piercing (EX8-023 Q3883). Read after
    // passive recomputation, but before any captured win/deletion reaction can grant
    // it too late or remove it through Fortitude (EX8-045 Q3931).
    await this.hooks.refreshContinuousEffects?.();
    const piercingTriggered = this.hooks.hasPierce?.(attacker.permanentId) === true;
    for (const resolveReaction of deletionReactions) await resolveReaction();

    // ＜Ascension＞ reaction: only for cards that actually left the field (in deletedInstanceIds).
    for (const [instanceId, { seat, cardId }] of this.hooks.resolveDeletionReactions ? [] : ascensionCandidates) {
      if (!deletedInstanceIds.includes(instanceId)) continue;
      const chosenInstanceId = await this.hooks.selectOptionalInstance?.(
        seat,
        [instanceId],
        "＜Ascension＞: place this card at the top of your security stack?",
        { sourceCardId: cardId, sourceInstanceId: instanceId },
      );
      if (chosenInstanceId === undefined) continue;
      await this.hooks.ascendToSecurity?.(instanceId);
    }

    // Battle deletion (is-deleted): the losers have left the field, so fire OnDestroyedAnyone
    // over the deleted set, mirroring documented behavior stacking the window after the
    // battle outcome is fixed. A single fire lets resolveTiming batch a both-combatants tie and
    // order the triggers turn-player-first; the trashed cards become [On Deletion] candidates.
    if (winningSeat !== undefined) {
      // Q7463: the battle-winner watcher and the loser’s On Deletion effects are
      // simultaneous activations. Capture the watcher before the deletion window and
      // let that window order it with printed On Deletion effects. If no permanent was
      // actually deleted (for example, a replacement prevented it), activate it alone.
      if (deleted.length > 0) {
        await resolveBattleWon(
          this.currentAttack === undefined || isAttackBattle ? { deferIntoDeletionWindow: true } : undefined,
        );
      } else if (this.hooks.resolveAvertedBattleReactions !== undefined) {
        await this.hooks.resolveAvertedBattleReactions(resolveBattleWon);
      } else {
        await resolveBattleWon();
      }
    } else if (deleted.length === 0) {
      await this.hooks.resolveAvertedBattleReactions?.();
    }
    // Battle winners and deletion watchers trigger together. Queue both families before
    // opening the deletion window so turn-player priority applies across the two buses.
    if (deleted.length > 0) {
      await attackerBattleDeleteReaction?.({ deferIntoDeletionWindow: true });
      await defenderBattleDeleteReaction?.({ deferIntoDeletionWindow: true });
      const deletingPermanentId = deleted.includes(attacker.permanentId)
        ? deleted.includes(defender.permanentId)
          ? undefined
          : defender.permanentId
        : deleted.includes(defender.permanentId)
          ? attacker.permanentId
          : undefined;
      const deletionTrigger = {
        deletedPermanentId: deleted[0],
        deletedPermanentIds: deleted,
        deletedControllerSeat: deletedPermanentSnapshots.find(({ permanentId }) => permanentId === deleted[0])
          ?.controllerSeat,
        deletedPermanentSnapshots,
        // Printed top card of the first deleted permanent, captured before it left play, so
        // an [On Deletion] condition about "this Digimon" can still read its host.
        deletedTopCardId: deletedPermanentSnapshots.find(({ permanentId }) => permanentId === deleted[0])?.topCardId,
        deletedInstanceIds,
        deletedWasStackInstanceIds,
        deletedWasLinkedInstanceIds,
        deletedLinkHostInstanceByLinkedInstanceId,
        deletedHostInstanceByInstanceId,
        ...(customEffectGrantsSnapshot === undefined ? {} : { customEffectGrantsSnapshot }),
        ...(stackEffectConferralsSnapshot === undefined ? {} : { stackEffectConferralsSnapshot }),
        fortitudeInstanceIds: [...fortitudeReplayInstanceIds.values()].filter((instanceId) =>
          deletedInstanceIds.includes(instanceId),
        ),
        deletedEffectiveColorsByInstanceId,
        battleOpponentPermanentIdByInstanceId,
        retaliationTargetsByInstanceId,
        retaliationCountsByInstanceId,
        ...(deletingPermanentId === undefined ? {} : { deletingPermanentId }),
        removalCause: "byBattle" as const,
      };
      if (this.hooks.resolveDeletionReactions) {
        await this.hooks.resolveDeletionReactions(
          deletionTrigger,
          [...ascensionCandidates].flatMap(([instanceId, { seat }]) =>
            deletedInstanceIds.includes(instanceId) ? [{ instanceId, seat }] : [],
          ),
          [...tokenDeletionCandidates, ...digiEggDeletionCandidates],
        );
      } else {
        await this.hooks.fireTiming(EffectTiming.OnDestroyedAnyone, deletionTrigger);
      }
    }
    // SubTrigger bus (System B): "when this Digimon deletes [an opponent's Digimon] in
    // battle" watchers — DISTINCT from `onDeletionOf` (which fires for the DELETED card via
    // the deletePermanent seam). This fires for the battle WINNER that deleted an opponent:
    // the attacker, when the defender was deleted and the attacker survived (not a both-die
    // tie). The winner is the event subject (it is still on the field).
    const attackerSurvived = this.access.permanentById(attacker.permanentId) !== undefined;
    const defenderDeleted = deleted.includes(defender.permanentId);
    if (attackerSurvived && defenderDeleted) {
      if (piercingTriggered && this.currentAttack?.attackerPermanentId === attacker.permanentId) {
        this.currentAttack.piercingTriggered = true;
      }
      // System A: fire the top-level WhenBattleDeleteOpponent timing for the surviving attacker.
      // The trigger carries both the attacker (who fires the effect) and the deleted defender.
      if (!this.hooks.resolveDeletionReactions)
        await this.hooks.fireTiming(EffectTiming.OnBattleDeleteOpponent, {
          attackerPermanentId: attacker.permanentId,
          deletedPermanentId: defender.permanentId,
          ...(defenderTopCardId !== undefined ? { deletedTopCardId: defenderTopCardId } : {}),
          deletedInstanceIds,
          deletedWasStackInstanceIds,
        });
    }
    if (deleted.length === 0) await attackerBattleDeleteReaction?.();

    // A defending Digimon can also be the surviving battle winner and delete the attacker.
    // Effects such as BT5-062 say "when this Digimon deletes an opponent's Digimon in battle"
    // without requiring it to be attacking, so publish the same winner reaction for the
    // defender. Piercing is intentionally not processed here because no defender attack exists.
    const defenderSurvived = this.access.permanentById(defender.permanentId) !== undefined;
    const attackerDeleted = deleted.includes(attacker.permanentId);
    if (defenderSurvived && attackerDeleted) {
      if (!this.hooks.resolveDeletionReactions)
        await this.hooks.fireTiming(EffectTiming.OnBattleDeleteOpponent, {
          attackerPermanentId: defender.permanentId,
          deletedPermanentId: attacker.permanentId,
          ...(attackerTopCardId !== undefined ? { deletedTopCardId: attackerTopCardId } : {}),
          deletedInstanceIds,
          deletedWasStackInstanceIds,
        });
    }
    if (deleted.length === 0) await defenderBattleDeleteReaction?.();

    // Comprehensive Rules §14-2-5: "If an effect is triggered by the end of the battle
    // timing when a battle ends, that effect is to be resolved." This is a distinct window
    // from OnDestroyedAnyone (the battle's own destruction trigger, §14-2-4) and from
    // OnBattleDeleteOpponent (fired ONLY for a surviving attacker that deleted the
    // defender, above): the end-of-battle timing fires for every Digimon-vs-Digimon battle
    // regardless of outcome — win, loss, or tie — so a card's own "[end of battle]"-filed
    // clause (e.g. BT11-059's unsuspend-on-delete-in-battle) gets its real window even
    // though it also independently gates on having won.
    await this.hooks.fireTiming(EffectTiming.OnEndBattle, {
      attackerPermanentId: attacker.permanentId,
      defenderPermanentId: defender.permanentId,
      target: { kind: "permanent", permanentId: defender.permanentId },
      deletedPermanentId: deleted[0],
      deletedInstanceIds,
      deletedWasStackInstanceIds,
    });

    // Hold the completion payload until resolveAttack reaches its outer cleanup boundary.
    // Consumers use combatResolved as the end-of-attack seam, so publishing here would let
    // a second attack race the remaining OnEndAttack timing and controller cleanup.
    // Only the attack's own battle completes it: an effect battle during the attack (EX13-076)
    // must not be published as that attack's result when the attack's battle never happens.
    if (isAttackBattle)
      this.completedCombat = {
        seat: attacker.controllerSeat,
        attackerPermanentId: attacker.permanentId,
        deletedPermanentIds: deleted,
      };
  }

  /**
   * Reset the attack flags (AttackProcess.Cleanup, cs:486-512). Effects scoped to
   * "until end of attack" are expired by the effect-duration subsystem; this only
   * tears down the controller's own combat state.
   */
  private async cleanup(): Promise<void> {
    this.openWindow = undefined;
    this.allianceDecision = undefined;
    this.evadeDecision = undefined;
    this.barrierDecision = undefined;
    this.counterWindow = undefined;
    // An attack that ended without its window being answered (the attacker left play, an
    // effect ended the attack) leaves no *Resolved event behind, so the mirror is dropped here.
    this.access.game.combatWindow = undefined;
    this.counterActivationsThisAttack = 0;
    this.resolving = false;
    this.currentAttack = undefined;
    this.endRequested = false;
    this.withdrawDeferredEndOfAttack?.();
    this.withdrawDeferredEndOfAttack = undefined;
    this.pendingEndOfAttackTrigger = undefined;
    // Expire UntilEndAttack/UntilEndBattle modifiers and refresh the continuous tier.
    // An ordering effect resumes after resolveAttack returns. Keep its rule checks
    // behind the rebuild so they never read a partially cleared continuous ledger.
    if (!this.access.game.gameOver) await this.hooks.sweepEndOfAttack?.();
  }
}

function isCombatControllerState(value: unknown): value is CombatControllerState {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const state = value as CombatControllerState;
  return (
    Number.isSafeInteger(state.attackSequence) &&
    state.attackSequence >= 0 &&
    state.attackedThisTurn instanceof Set &&
    [...state.attackedThisTurn].every((id) => typeof id === "string")
  );
}
