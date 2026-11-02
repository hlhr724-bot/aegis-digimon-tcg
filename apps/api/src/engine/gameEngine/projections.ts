import type { AttackRedirection } from "@aegis/shared/schema/AttackRedirection";
import { getNegamonPlayCandidates } from "#api/engine/gameEngine/getNegamonPlayCandidates";
import { digivolveValidatorByState } from "#api/engine/gameEngine/digivolveValidatorByState";
import {
  CardKind,
  dnaDigivolutionRequirementsFor,
  digivolutionRequirementsFor,
  EffectDuration,
  EffectTiming,
  Phase,
  AppFusionRoute,
  DigivolveRoute,
  DnaDigivolveRoute,
} from "@aegis/shared";
import { hasSummoningSickness } from "../combat/legality.js";
import { effectiveKinds } from "../effects/continuous.js";
import { resolveKeywords } from "../combat/keywords.js";
import { lookupDefinition } from "../cards/cardData.js";
import { linkEligible } from "../effects/mindLink.js";
import { canActivate } from "../effects/kernel.js";
import { createCardStateLookup, gatherTriggeredEffects } from "../effects/context.js";
import { FieldCardRole } from "#api/engine/gameEngine/oncePerTurnUsage/FieldCardRole";
import { hasUsedOncePerTurnEffect } from "#api/engine/gameEngine/oncePerTurnUsage/hasUsedOncePerTurnEffect";
import { getEffectModule } from "../effects/registry.js";
import { grantForcesAttackAtStartOfMainPhase } from "../effects/interpreter.js";
import { ACTIVATE_TIMING } from "../actions/activateEffect.js";
import {
  validateAttack,
  validateDigivolve,
  validateDnaDigivolve,
  validateLinkCard,
  validatePlayCard,
} from "../actions/index.js";
import { NO_DIGIVOLVE_TARGETS, NO_LINK_TARGETS, NO_PROJECTED_COST, playableFromHand } from "./intentGating.js";
import {
  clearAttackProjection,
  replaceAppFusionRoutesIfChanged,
  replaceDnaDigivolveRoutesIfChanged,
  replaceDigivolveRoutesIfChanged,
  replaceIfChanged,
} from "./schemaSync.js";
import { securityAttackGrantSum } from "./securityAttackGrantSum.js";
import { securityStrikeCount } from "./securityStrike.js";
import type { CardInstance, GameState, Permanent, Seat } from "@aegis/shared";
import type { GameStateAccess } from "../state/access.js";
import type { MemoryGauge } from "../MemoryGauge.js";
import type { UseTracker } from "../effects/kernel.js";
import type { ContinuousEffectLedger } from "../effects/continuous.js";
import type { ModifierLedger } from "../effects/primitives.js";
import type { SubTriggerRegistry } from "../effects/subtriggers.js";
import type { CollectedEffect } from "../effects/collect.js";
import type { EffectContext, TriggerInfo } from "../effects/EffectContext.js";
import type { EffectEnvironment } from "../effects/index.js";
import type { CardSource } from "../effects/CardSource.js";
import type { AttackDeps, DigivolveDeps, DnaDigivolveDeps, LinkCardDeps, PlayCardDeps } from "../actions/index.js";
import type { AppFusionValidation } from "./types.js";
import type { PendingBlitzAttack } from "./blitz.js";

/**
 * What the projection pass reads and calls. The affordance projections re-run every
 * validator the intent handlers use, so the engine's deps builders are passed as
 * factories rather than duplicated here.
 */
export interface ProjectionDeps {
  readonly omitHandAffordances?: boolean;
  readonly attackRedirectTargetIds: (attacker: Permanent, targetPermanentId?: string) => AttackRedirection;
  readonly state: GameState;
  readonly access: GameStateAccess;
  readonly continuous: ContinuousEffectLedger;
  readonly modifiers: ModifierLedger;
  readonly subTriggers: SubTriggerRegistry;
  readonly memory: MemoryGauge;
  readonly tracker: UseTracker;
  /** Continuous DP deltas as of the last pass, kept across recomputes. */
  readonly continuousDpSeedState: Map<string, number>;
  readonly pendingBlitzAttack: () => PendingBlitzAttack | undefined;
  /** Whether this turn's Main phase has closed while end-of-turn timings still run in Phase.Main. */
  readonly hasMainPhaseEnded: () => boolean;
  readonly deferHandAffordances: boolean;
  readonly effectEnvironment: (trigger: TriggerInfo) => EffectEnvironment;
  readonly buildEffectContext: (source: CardSource, trigger: TriggerInfo) => EffectContext;
  readonly isNewlyPlayedRushAttacker: (permanentId: string) => boolean;
  readonly listCandidateInstances: () => CardInstance[];
  readonly validateAppFusion: (
    seat: Seat,
    intent: { type: "appFusion"; permanentId: string; instanceId: string; linkedInstanceId: string },
  ) => AppFusionValidation;
  readonly attackDeps: () => AttackDeps;
  readonly digivolveDeps: () => DigivolveDeps;
  readonly dnaDigivolveDeps: () => DnaDigivolveDeps;
  readonly playCardDeps: () => PlayCardDeps;
  readonly linkCardDeps: () => LinkCardDeps;
}

/**
 * Everything the clients see DERIVED from the board: the per-permanent keyword,
 * restriction and summoning-sickness projections, the attack/link target sets and the
 * hand affordances. Nothing here decides a rule — each projection re-asks the same
 * validator the matching intent would, so a lit affordance and an accepted intent can
 * never disagree.
 */
function shouldProjectSummoningSickness(permanent: Permanent, continuous: ContinuousEffectLedger): boolean {
  if (permanent.topCard === undefined) {
    return false;
  }
  const printedKinds = lookupDefinition(permanent.topCard.cardId)?.kinds ?? [];
  return (
    printedKinds.includes(CardKind.Tamer) ||
    effectiveKinds(continuous, permanent.permanentId, printedKinds).includes(CardKind.Digimon)
  );
}

function carriesHandAffordance(instance: CardInstance): boolean {
  return (
    instance.playableFromHand ||
    instance.projectedPlayCost !== NO_PROJECTED_COST ||
    instance.digivolveTargetPermanentIds.length > 0 ||
    instance.appFusionRoutes.length > 0 ||
    instance.digivolveRoutes.length > 0 ||
    instance.dnaDigivolveRoutes.length > 0
  );
}

export class BoardProjection {
  private projectedRouteInstances: Set<CardInstance> | undefined;
  private handAffordancesStale = false;
  private projectedLinkInstances: Set<CardInstance> | undefined;
  private projectedActivatableInstances: Set<CardInstance> | undefined;
  private projectedActivatablePermanents: Set<Permanent> | undefined;
  private oncePerTurnUsedInstances = new Set<CardInstance>();

  constructor(private readonly deps: ProjectionDeps) {
    digivolveValidatorByState.set(deps.state, (seat, intent) =>
      validateDigivolve(deps.state, seat, intent, deps.digivolveDeps()),
    );
  }

  /**
   * A Digimon that just lost "isn't affected by effects" is affected again by an effect it was
   * given while immune (KB Q5328). The DP ledger suppresses such a modifier live but keeps the
   * stored `currentDP` until something recomputes it, so recompute each recipient here.
   */
  recomputeExpiredAffectationRecipients(): void {
    for (const permanentId of this.deps.continuous.takeExpiredAffectationRecipients()) {
      this.deps.modifiers.recomputeDP(this.deps.state, permanentId);
    }
  }

  /** Capture continuous DP deltas without including one-shot duration modifiers. */
  continuousDpSeeds(): Map<string, number> {
    const seeds = new Map<string, number>();
    const liveIds = new Set<string>();
    for (const player of this.deps.state.players) {
      const permanents = player.breeding === undefined ? player.battleArea : [...player.battleArea, player.breeding];
      for (const permanent of permanents) {
        liveIds.add(permanent.permanentId);
        const seed = this.deps.continuousDpSeedState.get(permanent.permanentId);
        if (seed !== undefined && seed !== 0) seeds.set(permanent.permanentId, seed);
      }
    }
    for (const permanentId of this.deps.continuousDpSeedState.keys()) {
      if (!liveIds.has(permanentId)) this.deps.continuousDpSeedState.delete(permanentId);
    }
    return seeds;
  }

  updateContinuousDpSeeds(): void {
    const liveIds = new Set<string>();
    for (const player of this.deps.state.players) {
      const permanents = player.breeding === undefined ? player.battleArea : [...player.battleArea, player.breeding];
      for (const permanent of permanents) {
        const permanentId = permanent.permanentId;
        liveIds.add(permanentId);
        if (!this.deps.modifiers.hasContinuousDp(permanentId)) {
          this.deps.continuousDpSeedState.delete(permanentId);
          continue;
        }
        const contribution = this.deps.modifiers.continuousDpSeed(this.deps.state, permanentId);
        if (contribution === 0) this.deps.continuousDpSeedState.delete(permanentId);
        else this.deps.continuousDpSeedState.set(permanentId, contribution);
      }
    }
    for (const permanentId of this.deps.continuousDpSeedState.keys()) {
      if (!liveIds.has(permanentId)) this.deps.continuousDpSeedState.delete(permanentId);
    }
  }

  /**
   * The number of security cards an attack by `permanentId` checks. Single reader for both
   * the live security-check loop (`strikeFor`) and the {@link syncRestrictions}
   * projection, so the inspector value cannot drift from the rule.
   */
  securityStrikeFor(permanentId: string): number {
    // When SA-sign inversion is active on the attacker, each existing ＜Security Attack -N＞
    // grant becomes ＜Security Attack +N＞ per-instance before summing (two ＜SA -1＞ → two
    // ＜SA +1＞ = +2 to the strike, NOT ＜SA +2＞ recomputed). Positive grants keep their sign.
    const invert = this.deps.continuous.securityAttackInverted(permanentId);
    const saGrants = this.deps.continuous.grantedKeywords(permanentId).filter((g) => g.keyword === "SecurityAttack");
    return securityStrikeCount(saGrants, invert);
  }

  /**
   * Publish the blanket restrictions imposed on each permanent, plus its resolved
   * ＜Security Attack＞ count. Both seats and every phase, like {@link syncSummoningSickness}
   * and unlike {@link syncAttackTargets}: these are board-state facts about the permanent
   * itself, not "can this attack be declared right now", so the client can pulse a freeze
   * the moment a restriction lands, wear a standing debuff badge for as long as one holds,
   * and show a truthful strike count in the inspector.
   */
  syncFieldEffects(): void {
    for (const player of this.deps.state.players) {
      const effects = [
        ...this.deps.modifiers.fieldEffectViews(player.seat),
        ...this.deps.continuous.fieldEffectViews(player.seat),
      ];
      const json = JSON.stringify(effects);
      if (player.fieldEffectsJson !== json) player.fieldEffectsJson = json;
    }
  }

  syncRestrictions(): void {
    for (const player of this.deps.state.players) {
      for (const perm of player.battleArea) this.projectRestrictions(perm);
      // A permanent in the raising area can neither attack nor block by the rules of the
      // area itself, so those two have nothing to add there; the unsuspend and [When
      // Digivolving] locks do apply in the raising area, and {@link projectRestrictions}
      // publishes every one of them from the same ledger the rules read.
      if (player.breeding) this.projectRestrictions(player.breeding);
    }
  }

  projectRestrictions(perm: Permanent): void {
    replaceIfChanged(perm.grantedEffectTexts, this.deps.subTriggers.grantedEffectTextsFor(perm.permanentId));
    perm.attacksAtStartOfMainPhase = this.deps.subTriggers
      .subscriptionsFor("startOfYourMainPhase", perm.permanentId)
      .some(({ publicBadge, publicBadgeGrantingSeat, publicBadgeSourceKinds }) => {
        if (publicBadge !== "attackAtStartOfMainPhase") return false;
        if (publicBadgeGrantingSeat === undefined || publicBadgeGrantingSeat === perm.controllerSeat) return true;
        if (
          this.deps.continuous.hasRestriction(perm.permanentId, "beAffected", undefined, {
            byOpponentEffect: true,
          })
        ) {
          return false;
        }
        return !(publicBadgeSourceKinds ?? []).some((kind) =>
          this.deps.continuous.hasRestriction(perm.permanentId, "beAffected", kind, {
            byOpponentEffect: true,
          }),
        );
      });
    const forcedAttackGrants = this.deps.continuous
      .listCustomEffectGrants()
      .filter(
        (grant) =>
          grant.instanceId === perm.topCard?.instanceId &&
          grant.isActive?.() !== false &&
          grantForcesAttackAtStartOfMainPhase(grant.token),
      )
      .map(({ token, sourceCardId }) => ({ clause: token, ...(sourceCardId ? { sourceCardId } : {}) }));
    if (forcedAttackGrants.length > 0) perm.attacksAtStartOfMainPhase = true;
    const forcedAttackGrantsJson = forcedAttackGrants.length > 0 ? JSON.stringify(forcedAttackGrants) : "";
    if (perm.forcedAttackGrantsJson !== forcedAttackGrantsJson) perm.forcedAttackGrantsJson = forcedAttackGrantsJson;
    const heldDpEffects = this.deps.modifiers.heldDpEffectViews(this.deps.state, perm);
    const heldDpEffectsJson = heldDpEffects.length > 0 ? JSON.stringify(heldDpEffects) : "";
    if (perm.heldDpEffectsJson !== heldDpEffectsJson) perm.heldDpEffectsJson = heldDpEffectsJson;
    perm.immuneToOpponentDigimonEffects = this.deps.continuous.hasRestriction(
      perm.permanentId,
      "beAffected",
      "Digimon",
      {
        byOpponentEffect: true,
      },
    );
    perm.immuneToOpponentOptionEffects = this.deps.continuous.hasRestriction(perm.permanentId, "beAffected", "Option", {
      byOpponentEffect: true,
    });
    perm.immuneToOpponentTamerEffects = this.deps.continuous.hasRestriction(perm.permanentId, "beAffected", "Tamer", {
      byOpponentEffect: true,
    });
    perm.protectedFromDpReduction = this.deps.continuous.hasRestriction(perm.permanentId, "dpImmune", undefined, {
      byOpponentEffect: true,
    });
    perm.protectedFromDeDigivolve = this.deps.continuous.hasRestriction(
      perm.permanentId,
      "cantBeDeDigivolved",
      undefined,
      {
        byOpponentEffect: true,
      },
    );
    perm.protectedFromEffectDeletion = this.deps.continuous.hasRestriction(perm.permanentId, "beDeleted", undefined, {
      byOpponentEffect: true,
    });
    perm.protectedFromBattleDeletion =
      this.deps.continuous.hasRestriction(perm.permanentId, "beDeletedInBattle") ||
      this.deps.continuous.hasRestriction(perm.permanentId, "beDeleted", undefined, {
        byOpponentEffect: false,
        byEffect: false,
      });
    perm.protectedFromEffectReturn = this.deps.continuous.hasRestriction(perm.permanentId, "beReturned", undefined, {
      byOpponentEffect: true,
    });
    perm.protectedFromStackTrash = this.deps.continuous.stackTrashLocked(perm.permanentId);
    perm.protectedFromStackReturn = this.deps.continuous.hasRestriction(perm.permanentId, "stackReturn", undefined, {
      byOpponentEffect: true,
    });
    perm.cannotAttack = this.deps.continuous.hasRestriction(perm.permanentId, "attack");
    perm.cannotBlock = this.deps.continuous.hasRestriction(perm.permanentId, "block");
    perm.cannotSuspend = this.deps.continuous.hasRestriction(perm.permanentId, "suspend");
    perm.cannotDigivolve = this.deps.continuous.hasRestriction(perm.permanentId, "digivolve");
    perm.cannotUnsuspend = this.deps.continuous.hasRestriction(perm.permanentId, "unsuspend");
    perm.cannotActivateWhenDigivolving = this.deps.continuous.hasRestriction(
      perm.permanentId,
      "cannotActivateWhenDigivolving",
    );
    perm.securityAttack = this.securityStrikeFor(perm.permanentId);
    perm.securityAttackModifier = securityAttackGrantSum(
      this.deps.continuous.grantedKeywords(perm.permanentId).filter((grant) => grant.keyword === "SecurityAttack"),
      this.deps.continuous.securityAttackInverted(perm.permanentId),
    );
  }

  /**
   * BT23-024 suspend-restriction-with-superlative-exception. For each ARMED source (its [All
   * Turns] link trigger fired `ArmSuspendRestriction` this turn), restrict every OPPONENT
   * battle-area Digimon from suspending EXCEPT the recomputed highest-play-cost one. The exempt
   * set tracks the live board: a newly-played higher-cost Digimon becomes exempt and the prior
   * top loses its exemption (Q5250/Q5251); removing the top re-exempts the next (Q5252); if no
   * opponent Digimon has a play cost, NONE is exempt and all are restricted (Q6025/Q6026). The
   * recorded restrictions are CONTINUOUS, so the recompute's `clearContinuous` drops the prior
   * pass's set before this re-derives it — no accumulation (CR-01). The consume-site is
   * combat/legality.canAttackerDeclare (a "can't suspend" Digimon can't declare a tapping attack).
   */
  applySuspendRestrictionRecompute(): void {
    for (const player of this.deps.state.players) {
      for (const armer of player.battleArea) {
        if (!this.deps.continuous.hasSuspendRestrictionSource(armer.permanentId)) continue;
        const opponentSeat = this.deps.access.opponentOf(armer.controllerSeat);
        const opponentDigimon = this.deps.access
          .player(opponentSeat)
          .battleArea.filter((p) => this.deps.access.isBattleAreaDigimon(p));
        const exemptIds = this.highestPlayCostExemptions(opponentDigimon);
        for (const target of opponentDigimon) {
          if (exemptIds.has(target.permanentId)) continue;
          this.deps.continuous.addRestriction(target.permanentId, "suspend", EffectDuration.UntilOpponentTurnEnd, {
            continuous: true,
          });
        }
      }
    }
  }

  /**
   * The set of permanents EXEMPT from the BT23-024 suspend restriction: those tied for the highest
   * play cost in `pool`. Permanents with no play cost never qualify (Q6025/Q6026 — when NONE has a
   * cost the set is empty and all are restricted). On a tie the KB exempts EACH highest-cost
   * Digimon (Q5249 "either can be suspended"), so the whole tied group is returned.
   */
  highestPlayCostExemptions(pool: readonly Permanent[]): Set<string> {
    let best = Number.NEGATIVE_INFINITY;
    const costs = new Map<string, number>();
    for (const p of pool) {
      if (p.topCard === undefined) continue;
      const cost = lookupDefinition(p.topCard.cardId)?.playCost;
      // Negative play costs are sentinels for tokens / cards with no printed play cost;
      // they must not become the highest-cost exemption when every candidate is uncosted.
      if (cost === undefined || cost < 0) continue;
      costs.set(p.permanentId, cost);
      if (cost > best) best = cost;
    }
    const exempt = new Set<string>();
    if (best === Number.NEGATIVE_INFINITY) return exempt; // no opponent Digimon has a play cost
    for (const [id, cost] of costs) if (cost === best) exempt.add(id);
    return exempt;
  }

  /**
   * Recompute which [Main] activated abilities are currently usable for the turn
   * player's battle-area/breeding permanents, hand cards and trash cards. The server projects the result
   * onto each source so the client can render affordances without embedding rules
   * logic. Hand is private state; loose-card projections are cleared before every
   * pass so an ability cannot leak after the card changes zones.
   */
  syncActivatableEffects(): void {
    if (this.projectedActivatableInstances === undefined || this.projectedActivatablePermanents === undefined) {
      for (const instance of this.deps.listCandidateInstances()) {
        instance.activatableEffectsJson = "";
      }
      for (const player of this.deps.state.players) {
        for (const permanent of player.battleArea) permanent.activatableEffectsJson = "";
        if (player.breeding) player.breeding.activatableEffectsJson = "";
      }
    } else {
      for (const instance of this.projectedActivatableInstances) {
        instance.activatableEffectsJson = "";
      }
      for (const permanent of this.projectedActivatablePermanents) permanent.activatableEffectsJson = "";
    }
    const projectedInstances = this.projectedActivatableInstances ?? new Set<CardInstance>();
    const projectedPermanents = this.projectedActivatablePermanents ?? new Set<Permanent>();
    projectedInstances.clear();
    projectedPermanents.clear();
    this.projectedActivatableInstances = projectedInstances;
    this.projectedActivatablePermanents = projectedPermanents;
    if (this.deps.state.phase !== Phase.Main || this.deps.hasMainPhaseEnded()) return;

    const turnPlayer = this.deps.state.players[this.deps.state.turnSeat];
    if (!turnPlayer) return;

    const hasEffectGrants =
      this.deps.continuous.listStackEffectConferrals().length > 0 ||
      this.deps.continuous.listCustomEffectGrants().length > 0;
    const activatablePermanents = [...turnPlayer.battleArea];
    if (turnPlayer.breeding !== undefined) activatablePermanents.push(turnPlayer.breeding);
    for (const perm of activatablePermanents) {
      const entries: { instanceId: string; effectKey: string; description: string }[] = [];
      const candidates = [perm.topCard, ...perm.stack, ...perm.linked].filter(Boolean);
      for (const { source, effect } of this.activatableEffectsFor(candidates, hasEffectGrants)) {
        entries.push({
          instanceId: source.instanceId,
          effectKey: effect.effectKey,
          description: effect.description,
        });
      }
      perm.activatableEffectsJson = entries.length ? JSON.stringify(entries) : "";
      if (entries.length > 0) projectedPermanents.add(perm);
    }

    for (const instance of turnPlayer.hand) {
      const entries: { instanceId: string; effectKey: string; description: string }[] = [];
      for (const { source, effect } of this.activatableEffectsFor([instance], hasEffectGrants)) {
        entries.push({
          instanceId: source.instanceId,
          effectKey: effect.effectKey,
          description: effect.description,
        });
      }
      instance.activatableEffectsJson = entries.length ? JSON.stringify(entries) : "";
      if (entries.length > 0) projectedInstances.add(instance);
    }

    // `[Trash][Main]` abilities are activated from their card's actual trash-zone
    // instance (Q5653), just as hand-resident Main abilities are projected from hand.
    // `canTrigger` keeps ordinary Main effects out because only effects registered with
    // `isFromTrash` accept a source whose current zone is trash.
    for (const instance of turnPlayer.trash) {
      const entries: { instanceId: string; effectKey: string; description: string }[] = [];
      for (const { source, effect } of this.activatableEffectsFor([instance], hasEffectGrants)) {
        entries.push({
          instanceId: source.instanceId,
          effectKey: effect.effectKey,
          description: effect.description,
        });
      }
      instance.activatableEffectsJson = entries.length ? JSON.stringify(entries) : "";
      if (entries.length > 0) projectedInstances.add(instance);
    }
  }

  /**
   * Collect currently usable [Main] effects for these physical cards, including
   * own effects conferred from a buried digivolution card onto its host.
   */
  activatableEffectsFor(
    instances: readonly CardInstance[],
    hasEffectGrants = this.deps.continuous.listStackEffectConferrals().length > 0 ||
      this.deps.continuous.listCustomEffectGrants().length > 0,
  ): CollectedEffect[] {
    if (
      !hasEffectGrants &&
      instances.every((instance) => {
        const module = getEffectModule(instance.cardId);
        return module === undefined || module.hasTiming?.(ACTIVATE_TIMING) === false;
      })
    )
      return [];
    // The ＜Blast Digivolve＞ marker shares the [Main] timing bucket but is only usable
    // through the digivolve verb during the opponent's counter window.
    return gatherTriggeredEffects(this.deps.effectEnvironment({}), ACTIVATE_TIMING, instances).filter(
      (collected) =>
        collected.effect.irTrigger !== "Counter" &&
        canActivate(collected.effect, this.activationContext(collected), this.deps.tracker),
    );
  }

  syncOncePerTurnUsage(): void {
    const used = new Set<CardInstance>();
    const lookup = createCardStateLookup(this.deps.state);
    for (const player of this.deps.state.players) {
      const permanents = player.breeding ? [...player.battleArea, player.breeding] : player.battleArea;
      for (const permanent of permanents) {
        const placements = [
          ...(permanent.topCard ? [{ instance: permanent.topCard, role: FieldCardRole.TOP }] : []),
          ...permanent.stack.map((instance) => ({ instance, role: FieldCardRole.DIGIVOLUTION })),
          ...permanent.linked.map((instance) => ({ instance, role: FieldCardRole.LINKED })),
        ];
        for (const { instance, role } of placements) {
          if (instance.faceUp && hasUsedOncePerTurnEffect({ instance, role, tracker: this.deps.tracker, lookup })) {
            used.add(instance);
          }
        }
      }
    }
    for (const instance of this.oncePerTurnUsedInstances) {
      if (!used.has(instance)) instance.oncePerTurnUsed = false;
    }
    for (const instance of used) {
      if (!instance.oncePerTurnUsed) instance.oncePerTurnUsed = true;
    }
    this.oncePerTurnUsedInstances = used;
  }

  async syncNegamonPlayEffects(): Promise<void> {
    for (const instance of this.deps.listCandidateInstances()) {
      instance.negamonPlayEffectKey = "";
    }
    if (this.deps.state.phase !== Phase.Main || this.deps.hasMainPhaseEnded()) {
      return;
    }
    const player = this.deps.state.players[this.deps.state.turnSeat];
    const breedingCard = player?.breeding?.topCard;
    if (!player || breedingCard?.cardId !== "EX9-005") {
      return;
    }
    const effect = this.activatableEffectsFor([breedingCard]).find(
      (candidate) => candidate.effect.irTrigger === "Main",
    );
    if (!effect) {
      return;
    }
    const candidates = await getNegamonPlayCandidates(this.activationContext(effect));
    for (const instance of player.hand) {
      if (candidates.has(instance.instanceId)) {
        instance.negamonPlayEffectKey = effect.effect.effectKey;
      }
    }
  }

  /** Build a direct-activation context while retaining stack-conferral provenance. */
  activationContext(collected: CollectedEffect): EffectContext {
    return {
      ...this.deps.buildEffectContext(collected.source, {}),
      activeTiming: collected.effect.irTrigger ?? EffectTiming[ACTIVATE_TIMING],
      activeEffectText: collected.effect.description,
      activeEffectKey: collected.effect.effectKey,
      ...(collected.conferredToPermanentId === undefined
        ? {}
        : { conferredToPermanentId: collected.conferredToPermanentId }),
      ...(collected.conferralGranterInstanceId === undefined
        ? {}
        : { conferralGranterInstanceId: collected.conferralGranterInstanceId }),
    };
  }

  /**
   * Re-derive each permanent's resolved keyword list (printed icons ∪ continuous grants)
   * into the synchronized `Permanent.keywords` field so the client can drive keyword-gated
   * affordances (e.g. a ＜Vortex＞ attack) without embedding rules logic. Both seats'
   * battle areas plus breeding are projected (keywords are public information). Run after
   * the continuous-recompute pass has re-derived the grant store, so grants are reflected.
   */
  syncKeywords(): void {
    for (const player of this.deps.state.players) {
      for (const perm of player.battleArea) this.projectKeywords(perm);
      if (player.breeding) this.projectKeywords(player.breeding);
    }
  }

  projectKeywords(perm: Permanent): void {
    const resolved = resolveKeywords(perm, this.deps.continuous);
    const granted = new Set(this.deps.continuous.grantedKeywords(perm.permanentId).map(({ keyword }) => keyword));
    // Temporary Piercing grants live in the battle modifier ledger because
    // combat consumes them directly. Publish that active state too; otherwise
    // the client either hides a real grant or has to guess from card prose.
    if (this.deps.modifiers.hasPierce(perm.permanentId)) {
      if (!resolved.includes("Piercing")) resolved.push("Piercing");
      granted.add("Piercing");
    }
    replaceIfChanged(perm.keywords, resolved);
    replaceIfChanged(perm.grantedKeywords, [...granted]);
    replaceIfChanged(perm.digiXrosNames, this.deps.continuous.grantedDigiXrosNames(perm.permanentId));
    this.projectOriginalCardInfo(perm);
  }

  /**
   * Publish the active original-card-information override (KB Q2080-Q2084), so the client can
   * show a transformed position for what it now counts as instead of only the printed card.
   * Read straight off the same ledger entry `effectiveNames`/`effectiveColors` consult, so the
   * board can never disagree with the rules. `baseDP` remains the printed calculation
   * baseline, so the active DP rewrite is projected separately.
   */
  projectOriginalCardInfo(perm: Permanent): void {
    const override = this.deps.continuous.originalCardInfoOverride(perm.permanentId);
    perm.originalNameOverride = override?.name ?? "";
    replaceIfChanged(perm.originalColorsOverride, override?.colors ?? []);
    perm.originalDPOverride = this.deps.modifiers.baseDpOverrideOf(perm) ?? 0;
  }

  /**
   * Publish which permanents entered the field this turn without ＜Rush＞, i.e. which ones
   * cannot declare an ordinary attack yet (Comprehensive Rules §16-1). Both seats and every
   * phase, unlike {@link syncAttackTargets}: the client draws the summoning-sickness ring
   * from this flag and must not re-derive the rule from `enterFieldTurnCount`.
   */
  syncSummoningSickness(): void {
    for (const player of this.deps.state.players) {
      for (const perm of player.battleArea) {
        perm.summoningSick =
          shouldProjectSummoningSickness(perm, this.deps.continuous) &&
          hasSummoningSickness(perm, this.deps.state.turnCount, this.deps.continuous);
      }
      // A permanent in the raising area cannot attack at all, so summoning sickness has
      // nothing to say about it.
      if (player.breeding) player.breeding.summoningSick = false;
    }
  }

  /**
   * Publish the exact attack targets accepted by the server's combat legality seam.
   * This keeps click, drag and highlighting clients correct for unsuspended-target
   * grants and target-specific restrictions without duplicating card rules in React.
   */
  syncAttackTargets(): void {
    for (const player of this.deps.state.players) {
      for (const perm of player.battleArea) {
        clearAttackProjection(perm);
        perm.attackRedirectTargets = {};
      }
      if (player.breeding) clearAttackProjection(player.breeding);
    }

    const seat = this.deps.state.turnSeat;
    const player = this.deps.state.players[seat];
    const opponent = this.deps.state.players[this.deps.access.opponentOf(seat)];
    if (!player || !opponent) return;
    const pendingBlitz = this.deps.pendingBlitzAttack();
    if (pendingBlitz !== undefined) {
      publishPendingBlitzTargets(this.deps.state, pendingBlitz);
      return;
    }
    const deps = this.deps.attackDeps();
    for (const attacker of player.battleArea) {
      // Once memory has crossed, only a Rush attacker whose play crossed it is actionable.
      if (this.deps.memory.hasCrossedToOpponent() && !this.deps.isNewlyPlayedRushAttacker(attacker.permanentId))
        continue;
      attacker.canAttackPlayer =
        validateAttack(deps, seat, {
          attackerPermanentId: attacker.permanentId,
          target: { kind: "player" },
        }) === null;
      if (attacker.canAttackPlayer) {
        attacker.attackRedirectTargets.player = this.deps.attackRedirectTargetIds(attacker);
      }
      for (const defender of opponent.battleArea) {
        const legal =
          validateAttack(deps, seat, {
            attackerPermanentId: attacker.permanentId,
            target: { kind: "permanent", permanentId: defender.permanentId },
          }) === null;
        if (legal) {
          attacker.attackablePermanentIds.push(defender.permanentId);
          attacker.attackRedirectTargets[defender.permanentId] = this.deps.attackRedirectTargetIds(
            attacker,
            defender.permanentId,
          );
        }
      }
      // The ＜Vortex＞ declaration is a separate legality question (§16-33 / §16-33-1),
      // so it gets its own pass — but only for a Digimon that actually has the keyword,
      // which is the overwhelming majority-case skip.
      if (!attacker.keywords.includes("Vortex")) continue;
      attacker.canVortexAttackPlayer =
        validateAttack(deps, seat, {
          attackerPermanentId: attacker.permanentId,
          target: { kind: "player" },
          vortex: true,
        }) === null;
      for (const defender of opponent.battleArea) {
        const legal =
          validateAttack(deps, seat, {
            attackerPermanentId: attacker.permanentId,
            target: { kind: "permanent", permanentId: defender.permanentId },
            vortex: true,
          }) === null;
        if (legal) attacker.vortexAttackablePermanentIds.push(defender.permanentId);
      }
    }
  }

  /** Re-publish the projections that only an open Main phase can light. */
  syncMainPhaseAffordances(): void {
    this.syncActivatableEffects();
    this.syncHandAffordances();
    this.syncLinkTargets();
  }

  /**
   * Publish, per card in the turn player's hand, whether it can be played right now and
   * which of that player's permanents it can legally digivolve onto — the play-side
   * counterpart to {@link syncAttackTargets}. Hand is private state (`@view`-tagged), so
   * only its owner receives these fields; every other card's projection is cleared each
   * pass so an affordance cannot survive a zone change.
   *
   * A card whose only affordable route is a material declaration (DigiXros / Assembly)
   * cannot be validated without the materials the player has not chosen yet, so an
   * `insufficient-memory` rejection is not treated as unplayable for those cards: the
   * cost reduction is applied from the declaration. Every other rejection still hides it.
   */
  syncHandAffordances(): void {
    if (this.deps.omitHandAffordances === true) {
      return;
    }
    if (this.deps.deferHandAffordances) {
      this.handAffordancesStale = true;
      return;
    }
    this.projectHandAffordances();
  }

  flushHandAffordances(): void {
    if (!this.handAffordancesStale) return;
    this.handAffordancesStale = false;
    this.projectHandAffordances();
  }

  refreshHandAffordances(): void {
    if (this.deps.omitHandAffordances === true) return;
    this.handAffordancesStale = false;
    this.projectHandAffordances();
  }

  private projectHandAffordances(): void {
    const seat = this.deps.state.turnSeat;
    const turnPlayer =
      this.deps.state.phase === Phase.Main && !this.deps.state.gameOver && !this.deps.hasMainPhaseEnded()
        ? this.deps.state.players[seat]
        : undefined;
    const active =
      turnPlayer === undefined || turnPlayer.hand.length === 0
        ? undefined
        : {
            player: turnPlayer,
            playDeps: this.deps.playCardDeps(),
            digivolveDeps: this.deps.digivolveDeps(),
            dnaDigivolveDeps: this.deps.dnaDigivolveDeps(),
            bases: [...turnPlayer.battleArea, ...(turnPlayer.breeding ? [turnPlayer.breeding] : [])],
          };

    // Routes are private hand affordances and must not survive a zone change. Clear only
    // physical instances outside the active turn player's hand; current hand routes are compared
    // in place below, avoiding schema churn on an unchanged recompute.
    // The first pass clears routes restored with the state. Later passes only need to visit
    // cards whose routes this projection published, even if they moved out of hand.
    const activeHand = active === undefined ? undefined : new Set<CardInstance>(active.player.hand);
    const clearOutsideActiveHand = (instance: CardInstance): void => {
      if (!carriesHandAffordance(instance)) return;
      if (activeHand?.has(instance)) return;
      instance.playableFromHand = false;
      instance.projectedPlayCost = NO_PROJECTED_COST;
      replaceIfChanged(instance.digivolveTargetPermanentIds, NO_DIGIVOLVE_TARGETS);
      replaceAppFusionRoutesIfChanged(instance.appFusionRoutes, []);
      replaceDigivolveRoutesIfChanged(instance.digivolveRoutes, []);
      replaceDnaDigivolveRoutesIfChanged(instance.dnaDigivolveRoutes, []);
    };
    const clearPermanent = (permanent: Permanent): void => {
      for (const instance of permanent.stack) clearOutsideActiveHand(instance);
      for (const instance of permanent.linked) clearOutsideActiveHand(instance);
      clearOutsideActiveHand(permanent.topCard);
    };
    if (this.projectedRouteInstances === undefined) {
      for (const player of this.deps.state.players) {
        for (const zone of [player.deck, player.eggDeck, player.security, player.trash, player.delayZone]) {
          for (const instance of zone) clearOutsideActiveHand(instance);
        }
        if (player.resolvingOption !== undefined) clearOutsideActiveHand(player.resolvingOption);
        for (const permanent of player.battleArea) clearPermanent(permanent);
        if (player.breeding) clearPermanent(player.breeding);
      }
    } else {
      for (const instance of this.projectedRouteInstances) clearOutsideActiveHand(instance);
    }

    // One pass that writes each card's final affordance, rather than clearing every hand and
    // refilling the turn player's: an ArraySchema splice is a wire-level change even when the
    // contents come back identical, and this projection runs on every continuous recompute.
    const projectedRouteInstances = this.projectedRouteInstances ?? new Set<CardInstance>();
    projectedRouteInstances.clear();
    for (const player of this.deps.state.players) {
      for (const instance of player.hand) {
        projectedRouteInstances.add(instance);
        instance.playCostReductionBlocked = this.deps.continuous.blocksCostReduction(player.seat, "play");
        const definition =
          active !== undefined && player === active.player ? lookupDefinition(instance.cardId) : undefined;
        if (active === undefined || definition === undefined) {
          instance.playableFromHand = false;
          instance.projectedPlayCost = NO_PROJECTED_COST;
          replaceIfChanged(instance.digivolveTargetPermanentIds, NO_DIGIVOLVE_TARGETS);
          replaceDigivolveRoutesIfChanged(instance.digivolveRoutes, []);
          replaceDnaDigivolveRoutesIfChanged(instance.dnaDigivolveRoutes, []);
          replaceAppFusionRoutesIfChanged(instance.appFusionRoutes, []);
          continue;
        }

        // A DigiEgg is never played from hand, so it skips the validation entirely.
        const playCheck = definition.kinds.includes(CardKind.DigiEgg)
          ? undefined
          : validatePlayCard(
              this.deps.state,
              seat,
              { type: "playCard", instanceId: instance.instanceId },
              active.playDeps,
            );
        instance.playableFromHand =
          playCheck !== undefined && playableFromHand(playCheck, instance.cardId, instance.playCostReductionBlocked);
        // Only the success branch carries a cost. A card that reads as playable through the
        // material-route escape hatch was rejected for memory, so it has no figure to publish.
        instance.projectedPlayCost = playCheck?.ok === true ? playCheck.cost : NO_PROJECTED_COST;

        if (!definition.kinds.includes(CardKind.Digimon)) {
          replaceIfChanged(instance.digivolveTargetPermanentIds, NO_DIGIVOLVE_TARGETS);
          replaceDigivolveRoutesIfChanged(instance.digivolveRoutes, []);
          replaceDnaDigivolveRoutesIfChanged(instance.dnaDigivolveRoutes, []);
          replaceAppFusionRoutesIfChanged(instance.appFusionRoutes, []);
          continue;
        }
        const targets: string[] = [];
        const digivolveRoutes: DigivolveRoute[] = [];
        const dnaDigivolveRoutes: DnaDigivolveRoute[] = [];
        // Every alternate path the card PRINTS, priced one index at a time. The default path
        // (-1) cannot stand in for them: when a printed EvoCost also matches the server takes
        // the printed one, and a card may print several alternates at different costs.
        const alternateIndices = (digivolutionRequirementsFor(instance.cardId) ?? []).map((_, index) => index);
        const priceRoute = (permanentId: string, alternateRequirementIndex: number, projectedCost: number): void => {
          const route = new DigivolveRoute();
          route.permanentId = permanentId;
          route.alternateRequirementIndex = alternateRequirementIndex;
          route.projectedCost = projectedCost;
          digivolveRoutes.push(route);
        };
        const appFusionRoutes: AppFusionRoute[] = [];

        const battleArea = [...active.player.battleArea];
        const materialCounts = new Set(
          dnaDigivolutionRequirementsFor(instance.cardId)
            .map(({ materials }) => materials.length)
            .filter((count) => count >= 2),
        );
        const chooseMaterials = (requiredCount: number, start: number, chosen: Permanent[]): void => {
          if (chosen.length === requiredCount) {
            const materialPermanentIds = chosen.map(({ permanentId }) => permanentId);
            const check = validateDnaDigivolve(
              this.deps.state,
              seat,
              { type: "dnaDigivolve", materialPermanentIds, instanceId: instance.instanceId },
              active.dnaDigivolveDeps,
            );
            if (check.ok) {
              const route = new DnaDigivolveRoute();
              route.materialPermanentIdsJson = JSON.stringify(materialPermanentIds);
              route.projectedCost = check.cost;
              dnaDigivolveRoutes.push(route);
            }
            return;
          }
          for (let index = start; index < battleArea.length; index += 1) {
            chooseMaterials(requiredCount, index + 1, [...chosen, battleArea[index]!]);
          }
        };
        for (const materialCount of materialCounts) {
          chooseMaterials(materialCount, 0, []);
        }

        for (const base of active.bases) {
          const check = validateDigivolve(
            this.deps.state,
            seat,
            { type: "digivolve", permanentId: base.permanentId, instanceId: instance.instanceId },
            active.digivolveDeps,
          );
          if (check.ok) {
            targets.push(base.permanentId);
            // -1 = the path an intent that names none takes: the printed EvoCost when it
            // matches, else the sole alternate/base-granted path.
            priceRoute(base.permanentId, -1, check.cost);
            for (const alternateRequirementIndex of alternateIndices) {
              const alternateCheck = validateDigivolve(
                this.deps.state,
                seat,
                {
                  type: "digivolve",
                  permanentId: base.permanentId,
                  instanceId: instance.instanceId,
                  alternateRequirementIndex,
                },
                active.digivolveDeps,
              );
              if (alternateCheck.ok) priceRoute(base.permanentId, alternateRequirementIndex, alternateCheck.cost);
            }
          }
          if (base.controllerSeat === seat) {
            for (const linked of base.linked) {
              const fusionCheck = this.deps.validateAppFusion(seat, {
                type: "appFusion",
                permanentId: base.permanentId,
                instanceId: instance.instanceId,
                linkedInstanceId: linked.instanceId,
              });
              if (!fusionCheck.ok) continue;
              const route = new AppFusionRoute();
              route.hostPermanentId = base.permanentId;
              route.linkedInstanceId = linked.instanceId;
              route.projectedCost = fusionCheck.projectedCost;
              appFusionRoutes.push(route);
            }
          }
        }
        replaceIfChanged(instance.digivolveTargetPermanentIds, targets);
        replaceDigivolveRoutesIfChanged(instance.digivolveRoutes, digivolveRoutes);
        replaceDnaDigivolveRoutesIfChanged(instance.dnaDigivolveRoutes, dnaDigivolveRoutes);
        replaceAppFusionRoutesIfChanged(instance.appFusionRoutes, appFusionRoutes);
      }
    }
    this.projectedRouteInstances = projectedRouteInstances;
  }

  /**
   * Publish, on every card the turn player could declare a link with (hand cards and
   * battle-area top cards, §6-5-1-4), the battle-area Digimon that `validateLinkCard`
   * accepts as its recipient right now. Cleared on every other instance so a card that
   * changed zones never keeps a stale affordance.
   */
  syncLinkTargets(): void {
    const seat = this.deps.state.turnSeat;
    const turnPlayer =
      this.deps.state.phase === Phase.Main && !this.deps.hasMainPhaseEnded()
        ? this.deps.state.players[seat]
        : undefined;
    const deps = turnPlayer === undefined ? undefined : this.deps.linkCardDeps();
    const sources = new Set<CardInstance>();
    if (turnPlayer !== undefined) {
      for (const instance of turnPlayer.hand) sources.add(instance);
      for (const permanent of turnPlayer.battleArea) sources.add(permanent.topCard);
    }
    if (this.projectedLinkInstances === undefined) {
      // Clear routes carried by a restored state before this projection has tracked them.
      for (const player of this.deps.state.players) {
        const loose = [
          ...player.hand,
          ...player.deck,
          ...player.eggDeck,
          ...player.security,
          ...player.trash,
          ...player.delayZone,
          ...(player.resolvingOption !== undefined ? [player.resolvingOption] : []),
        ];
        for (const permanent of [...player.battleArea, ...(player.breeding ? [player.breeding] : [])]) {
          loose.push(permanent.topCard, ...permanent.stack, ...permanent.linked);
        }
        for (const instance of loose) {
          if (!sources.has(instance)) replaceIfChanged(instance.linkTargetPermanentIds, NO_LINK_TARGETS);
        }
      }
    } else {
      // A previously eligible source may now live in any zone; only instances that
      // actually carried a published target need clearing after the first pass.
      for (const instance of this.projectedLinkInstances) {
        if (!sources.has(instance)) replaceIfChanged(instance.linkTargetPermanentIds, NO_LINK_TARGETS);
      }
    }
    const projectedLinkInstances = this.projectedLinkInstances ?? new Set<CardInstance>();
    projectedLinkInstances.clear();
    this.projectedLinkInstances = projectedLinkInstances;
    if (turnPlayer === undefined || deps === undefined) return;
    for (const instance of sources) {
      const targets: string[] = [];
      const definition = lookupDefinition(instance.cardId);
      if (definition !== undefined && linkEligible(definition)) {
        for (const recipient of turnPlayer.battleArea) {
          const check = validateLinkCard(
            this.deps.state,
            seat,
            { type: "linkCard", instanceId: instance.instanceId, targetPermanentId: recipient.permanentId },
            deps,
          );
          if (check.ok) targets.push(recipient.permanentId);
        }
      }
      replaceIfChanged(instance.linkTargetPermanentIds, targets);
      if (instance.linkTargetPermanentIds.length > 0) projectedLinkInstances.add(instance);
    }
  }
}

/** An activated ＜Blitz＞ is the only attack its resolving effect accepts, in any phase. */
function publishPendingBlitzTargets(state: GameState, pending: PendingBlitzAttack): void {
  const attacker = state.players[pending.seat]?.battleArea.find(
    (permanent) => permanent.permanentId === pending.attackerPermanentId,
  );
  if (attacker === undefined) return;
  attacker.canAttackPlayer = pending.targetIds.includes("player");
  attacker.attackablePermanentIds.push(...pending.targetIds.filter((targetId) => targetId !== "player"));
}
