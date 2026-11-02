import {
  CardKind,
  effectiveExactNames,
  baseGrantedDigivolveFor,
  nameIncludesToken,
  type BaseGrantedDigivolve,
  type CardDefinition,
  type DigivolutionRequirement,
  type CardColor,
  type CardInstance,
  type ZoneRef,
  type GameState,
  type Permanent,
  type Seat,
} from "@aegis/shared";
import type { DecisionManager } from "../decisions/index.js";
import type { GameStateAccess } from "../state/access.js";
import {
  cardHasTrait,
  definitionOf,
  isDigimon,
  isTamer,
  lookupDefinition,
  matchingAlternateDigivolutionRequirement,
  matchingEvoCost,
} from "../cards/cardData.js";
import { effectiveDigivolutionBase } from "../effects/continuous/effective.js";
import { matchNameOrTrait } from "../effects/interpreter.js";
import { digisorptionAmountFor, isDigisorptionRedirector } from "../cards/digisorptionDigivolve.js";
import type { ContinuousEffectLedger } from "../effects/continuous.js";
import type { CardSource } from "../effects/CardSource.js";
import type { DecisionApi, EffectContext, Primitives, TriggerInfo } from "../effects/EffectContext.js";
import type { UseTracker } from "../effects/kernel.js";
import type { PooledRuleDeletion } from "./ruleDeletions.js";
import type { PlayMode } from "../actions/index.js";
import { alternatePlacementCards } from "../actions/digivolve.js";
import { looseZoneOfInstance } from "../effects/verbs/looseInstances.js";

/** The use-ledger key a ＜Digisorption＞ redirector spends once per turn. */
const DIGISORPTION_REDIRECT_KEY = "digisorption-redirect";

/** What the digivolution support paths read, ask and mutate. */
export interface DigivolveSupportDeps {
  readonly state: GameState;
  readonly access: GameStateAccess;
  readonly continuous: ContinuousEffectLedger;
  readonly tracker: UseTracker;
  readonly decisions: DecisionManager;
  readonly decisionApi: DecisionApi;
  readonly primitives: Primitives;
  /** Attack-time Arts Digivolve offers this seat already declined, per instance. */
  readonly declinedAttackArts: Set<string>;
  readonly cardSourceOf: (instance: CardInstance) => CardSource;
  readonly buildEffectContext: (source: CardSource, trigger: TriggerInfo) => EffectContext;
  readonly effectiveColorsOf: (permanent: Permanent) => CardColor[];
  readonly collectRuleProcessMovements: () => Promise<PooledRuleDeletion[]>;
  readonly flushRuleTriggerPool: (pool: readonly PooledRuleDeletion[]) => Promise<void>;
  readonly recomputeContinuousEffects: () => Promise<void>;
}

/**
 * The digivolution paths that are not the digivolve verb itself: placement costs, Burst
 * Digivolve's tamer candidates, base-granted routes, ＜Digisorption＞ payment, the printed
 * colour requirement and Arts Digivolve. The verb and its validation stay in actions/.
 */
export class DigivolveSupport {
  constructor(private readonly deps: DigivolveSupportDeps) {}

  /** The loose cards that can pay an alternate requirement's `placementCost` (BT7-112). */
  placementCostCards(seat: Seat, requirement: DigivolutionRequirement): CardInstance[] {
    return alternatePlacementCards(this.deps.state, seat, requirement);
  }

  /**
   * The controller's battle-area Tamer permanents matching a Burst Digivolve requirement's
   * `burstDigivolve.returnTamerNamesExact` (§8-3-3-2).
   */
  burstDigivolveTamerCandidates(seat: Seat, requirement: DigivolutionRequirement): Permanent[] {
    const names = requirement.burstDigivolve?.returnTamerNamesExact ?? [];
    if (names.length === 0) return [];
    const player = this.deps.state.players[seat];
    if (player === undefined) return [];
    return player.battleArea.filter((perm) => {
      if (perm.topCard === undefined) return false;
      const def = lookupDefinition(perm.topCard.cardId);
      return (
        def !== undefined &&
        def.kinds.includes(CardKind.Tamer) &&
        effectiveExactNames(def).some((name) => names.some((wanted) => wanted.toLowerCase() === name.toLowerCase()))
      );
    });
  }

  /**
   * Pay Burst Digivolve's Tamer-return cost (§8-3-3-2) for digivolving into `into`. The
   * controller picks which qualifying Tamer goes back to hand when more than one qualifies
   * (feedback #19); the pick matters because the Tamer's digivolution cards are trashed and its
   * suspended state is lost. Payment is mandatory once the path is declared, so an empty
   * response (decision timeout) falls back to the first candidate.
   */
  async payBurstDigivolveTamer(seat: Seat, requirement: DigivolutionRequirement, into: CardInstance): Promise<boolean> {
    const candidates = this.burstDigivolveTamerCandidates(seat, requirement);
    if (candidates.length === 0) return false;
    let target = candidates[0]!;
    if (candidates.length > 1) {
      const ctx = this.deps.buildEffectContext(this.deps.cardSourceOf(into), {});
      ctx.activeTiming = "Static";
      ctx.activeTargetFate = "returnToHand";
      const chosen = await this.deps.decisionApi.chooseTargets(ctx, {
        candidates: candidates.map((permanent) => permanent.topCard.instanceId),
        min: 1,
        max: 1,
      });
      target = candidates.find((permanent) => permanent.topCard.instanceId === chosen[0]) ?? target;
    }
    const moved = await this.deps.primitives.returnToHand([target.topCard.instanceId]);
    return moved.length > 0;
  }

  /**
   * The cost of a base-granted digivolve path (ST7-03/BT6-060) for digivolving `evolving` onto
   * `base`, or undefined when none applies. The grant lives as a static on the base permanent's
   * `IsExistOnBattleArea`; its own-turn/all-turn gate also applies during Counter) and matches when the
   * evolving card satisfies the grant's target predicate AND the activation condition holds.
   */
  matchBaseGrantedDigivolve(
    seat: Seat,
    base: Permanent,
    evolving: CardDefinition,
    sourceZone?: ZoneRef,
  ): { cost: number } | undefined {
    if (base.inBreeding || base.controllerSeat !== seat) return undefined;
    if (this.deps.continuous.cannotIgnoreDigivolution(seat)) return undefined;
    const grants = baseGrantedDigivolveFor(base.topCard.cardId);
    if (grants === undefined) return undefined;
    for (const grant of grants) {
      if (grant.sourceZones !== undefined && !grant.sourceZones.some((zone) => zone === sourceZone)) continue;
      if (this.deps.state.turnSeat !== seat && grant.allTurns !== true) continue;
      if (!baseGrantTargetMatches(grant.target, evolving)) continue;
      if (grant.condition !== undefined && !this.baseGrantConditionHolds(seat, grant.condition)) continue;
      return { cost: grant.cost };
    }
    return undefined;
  }

  /** Evaluate a base-granted path's activation condition against live state. */
  baseGrantConditionHolds(seat: Seat, condition: NonNullable<BaseGrantedDigivolve["condition"]>): boolean {
    if (condition.kind === "anyOf") {
      return condition.conditions.some((nested) => this.baseGrantConditionHolds(seat, nested));
    }
    if (condition.kind === "securityAtMost") {
      return this.deps.access.player(seat).security.length <= condition.count;
    }
    if (condition.kind === "opponentHasDigimonLevelAtLeast") {
      const opponentSeat = this.deps.access.opponentOf(seat);
      return this.deps.access.player(opponentSeat).battleArea.some((perm) => {
        if (!this.deps.access.isBattleAreaDigimon(perm)) return false;
        const level = lookupDefinition(perm.topCard.cardId)?.level;
        return level !== undefined && level >= condition.level;
      });
    }
    if (condition.kind === "opponentHasDigimonDpAtLeast") {
      const opponentSeat = this.deps.access.opponentOf(seat);
      return this.deps.access
        .player(opponentSeat)
        .battleArea.some((perm) => this.deps.access.isBattleAreaDigimon(perm) && perm.currentDP >= condition.dp);
    }
    if (condition.kind === "tamerColorCountAtLeast") {
      const colors = new Set<string>();
      for (const perm of this.deps.access.player(seat).battleArea) {
        const definition = perm.topCard === undefined ? undefined : lookupDefinition(perm.topCard.cardId);
        if (definition === undefined || !isTamer(definition)) continue;
        for (const color of definition.colors) colors.add(color);
      }
      return colors.size >= condition.count;
    }
    if (condition.kind === "distinctNamedTamersWithTrait") {
      // "N or more [trait] Tamers with different names": same-named Tamers collapse to one.
      const names = new Set<string>();
      for (const perm of this.deps.access.player(seat).battleArea) {
        const definition = perm.topCard === undefined ? undefined : lookupDefinition(perm.topCard.cardId);
        if (definition === undefined || !isTamer(definition) || !cardHasTrait(definition, condition.trait)) continue;
        names.add(definition.nameEn);
      }
      return names.size >= condition.count;
    }
    if (condition.kind === "tamerHasExactName") {
      return this.deps.access.player(seat).battleArea.some((perm) => {
        const definition = perm.topCard === undefined ? undefined : lookupDefinition(perm.topCard.cardId);
        return definition !== undefined && isTamer(definition) && definition.nameEn === condition.name;
      });
    }
    const textCondition = condition as unknown as { kind: string; text?: string };
    if (textCondition.kind === "tamerHasText" && textCondition.text !== undefined) {
      return this.deps.access.player(seat).battleArea.some((perm) => {
        if (perm.topCard === undefined) return false;
        const definition = lookupDefinition(perm.topCard.cardId);
        return (
          definition !== undefined &&
          isTamer(definition) &&
          matchNameOrTrait(definition, { tokens: [textCondition.text!], match: "text" })
        );
      });
    }
    return false;
  }

  /**
   * An UNUSED printed or conferred ＜Digisorption＞ redirect ability on `seat`'s battle area this turn, or
   * undefined. The redirect's [Your Turn][Once Per Turn] gate requires the
   * redirector to be a battle-area Digimon on its controller's turn and within its per-turn limit.
   * KB Q4703: a card cannot redirect its OWN digivolve-into suspend, so the redirector must be a
   * SEPARATE permanent already in play (the card being digivolved into is still in hand here).
   */
  digisorptionRedirector(
    seat: Seat,
    excludeInstanceId?: string,
  ): { sourceInstanceId: string; effectKey: string } | undefined {
    if (this.deps.state.turnSeat !== seat) return undefined;
    for (const permanent of this.deps.access.player(seat).battleArea) {
      if (!this.deps.access.isBattleAreaDigimon(permanent) || permanent.topCard.instanceId === excludeInstanceId)
        continue;
      const nativeKey = DIGISORPTION_REDIRECT_KEY;
      if (
        isDigisorptionRedirector(permanent.topCard.cardId) &&
        this.deps.tracker.count(permanent.topCard.instanceId, nativeKey) < 1
      ) {
        return { sourceInstanceId: permanent.topCard.instanceId, effectKey: nativeKey };
      }
      // A copied persistent ability belongs to the live host, but its once-per-turn
      // identity retains both the physical lender and the source of the conferral.
      for (const conferral of this.deps.continuous.listStackEffectConferrals()) {
        if (
          conferral.targetPermanentId !== permanent.permanentId ||
          conferral.inheritedOnly === true ||
          (conferral.trigger !== undefined && conferral.trigger !== "YourTurn")
        )
          continue;
        const lender = permanent.stack.find((card) => card.instanceId === conferral.stackInstanceId);
        if (
          lender === undefined ||
          !lender.faceUp ||
          lender.instanceId === excludeInstanceId ||
          !isDigisorptionRedirector(lender.cardId)
        )
          continue;
        const effectKey = `${nativeKey}/conferral/${conferral.granterInstanceId ?? permanent.topCard.instanceId}`;
        if (this.deps.tracker.count(lender.instanceId, effectKey) < 1) {
          return { sourceInstanceId: lender.instanceId, effectKey };
        }
      }
    }
    return undefined;
  }

  /**
   * The permanents that may be suspended to pay a ＜Digisorption＞ cost for `seat`: the controller's
   * own unsuspended battle-area Digimon, plus — when an eligible redirector is in play — the
   * opponent's unsuspended battle-area Digimon (documented behavior `CanTapWhenAbsorbEvolution` + the BT3-056
   * redirect's `PermanentCondition`).
   */
  digisorptionSuspendCandidates(seat: Seat, excludeRedirectorInstanceId?: string): Permanent[] {
    const canSuspend = (permanent: Permanent): boolean =>
      this.deps.access.isBattleAreaDigimon(permanent) &&
      !permanent.isSuspended &&
      !this.deps.continuous.hasRestriction(permanent.permanentId, "beSuspended");
    const own = this.deps.access.player(seat).battleArea.filter(canSuspend);
    if (this.digisorptionRedirector(seat, excludeRedirectorInstanceId) === undefined) return own;
    const opponentSeat = this.deps.access.opponentOf(seat);
    const opponent = this.deps.access.player(opponentSeat).battleArea.filter(canSuspend);
    return [...own, ...opponent];
  }

  /**
   * Interactively pay a ＜Digisorption＞ suspend for digivolving into `into` (Comprehensive Rules
   * §16-10): prompt the controller; on accept, suspend 1 chosen eligible Digimon (their own, or —
   * via the BT3-056 redirect — an opponent's, consuming the redirect's once-per-turn use), firing
   * the suspend's `whenSuspended` window. Returns the cost reduction obtained (the ＜Digisorption＞
   * amount when paid, else 0).
   */
  async payDigisorption(seat: Seat, into: CardInstance, evolvingPermanent: Permanent): Promise<number> {
    const amount = digisorptionAmountFor(into.cardId);
    if (amount === undefined) return 0;
    // Payment happens while the evolving card is still in hand. Exclude that exact instance
    // defensively as well: KB BT3-056 Q4703 says the Ceresmon being digivolved into cannot
    // grant its own redirect, while a different, pre-existing Ceresmon still can.
    const candidates = this.digisorptionSuspendCandidates(seat, into.instanceId);
    if (candidates.length === 0) return 0;

    const ctx = this.deps.buildEffectContext(this.deps.cardSourceOf(into), {});
    ctx.activeTiming = "Static";
    const fullEffectText = ctx.source.definition.effectText?.trim();
    ctx.activeEffectText =
      fullEffectText?.match(/^.*?(?=\[(?:When|On|Your|All|Opponent|Main|Security|Start|End)\b)/s)?.[0]?.trim() ||
      fullEffectText;
    const accept = await this.deps.decisionApi.optional(
      ctx,
      `＜Digisorption -${amount}＞: suspend 1 Digimon to reduce the digivolution cost by ${amount}?`,
    );
    if (!accept) return 0;

    const byInstanceId = new Map<string, Permanent>();
    for (const p of candidates) {
      if (p.topCard === undefined) continue;
      // Digisorption is paid before stacking, but the declared evolution has already revealed
      // the card being digivolved into. Preserve that visible identity for the evolving target
      // while mapping the decision back to the still-live base permanent that gets suspended.
      byInstanceId.set(p.permanentId === evolvingPermanent.permanentId ? into.instanceId : p.topCard.instanceId, p);
    }
    const chosen = await this.deps.decisionApi.chooseTargets(ctx, {
      candidates: [...byInstanceId.keys()],
      min: 1,
      max: 1,
    });
    const target = chosen.length >= 1 ? byInstanceId.get(chosen[0]!) : undefined;
    if (target === undefined) return 0;

    const redirector = target.controllerSeat !== seat ? this.digisorptionRedirector(seat, into.instanceId) : undefined;
    if (target.controllerSeat !== seat && redirector === undefined) return 0;
    // Commit usage only after an actual transition, before its triggered reactions.
    // A prohibited or stale payment grants neither the discount nor a spent redirect.
    const suspended = await this.deps.primitives.suspend([target.permanentId], {
      byEffectSeat: seat,
      deferTriggers: true,
    });
    if (!suspended.includes(target.permanentId)) return 0;
    if (redirector !== undefined) this.deps.tracker.register(redirector.sourceInstanceId, redirector.effectKey);
    await this.deps.primitives.fireSuspensionTriggers?.(suspended, { byEffectSeat: seat });

    return amount;
  }

  async resolveArtsDigivolve(
    seat: Seat,
    instance: CardInstance,
    definition: CardDefinition,
    duringAttack = false,
  ): Promise<boolean> {
    if (!duringAttack && this.deps.declinedAttackArts.delete(instance.instanceId)) return false;
    const result = await this.performArtsDigivolve(seat, instance, definition);
    if (duringAttack && !result) this.deps.declinedAttackArts.add(instance.instanceId);
    return result;
  }

  private meetsArtsDigivolutionRequirement(
    definition: CardDefinition,
    base: Permanent,
    sourceZone: ZoneRef | undefined,
  ): boolean {
    const baseDefinition = effectiveDigivolutionBase(this.deps.continuous, base, definitionOf(base.topCard.cardId));
    return (
      matchingEvoCost(definition, baseDefinition) !== undefined ||
      matchingAlternateDigivolutionRequirement(definition, baseDefinition, {
        grantedBaseExactNames: this.deps.continuous.grantedExactNames(base.permanentId),
        ...(sourceZone === undefined ? {} : { sourceZone }),
      }) !== undefined
    );
  }

  async performArtsDigivolve(seat: Seat, instance: CardInstance, definition: CardDefinition): Promise<boolean> {
    const sourceZone = looseZoneOfInstance(this.deps.state, instance.instanceId);
    // CR §4-20-1 offers "one of your cards on the field", and the field includes the
    // breeding area (§3-4-6). Effect-granted digivolution routes can't reference a card
    // in the breeding area (§3-4-7-8), so only printed requirements qualify there.
    const breeding = this.deps.state.players[seat]?.breeding;
    const fieldPermanents = [
      ...this.deps.access.battleAreaPermanents(seat),
      ...(breeding === undefined ? [] : [breeding]),
    ];
    const eligible = fieldPermanents.filter(
      (p) =>
        p.topCard !== undefined &&
        (this.meetsArtsDigivolutionRequirement(definition, p, sourceZone) ||
          (!p.inBreeding && this.matchBaseGrantedDigivolve(seat, p, definition, sourceZone) !== undefined)),
    );
    if (eligible.length === 0) return false;

    const response = await this.deps.decisions.request({
      seat,
      kind: "selectCards",
      promptText: `＜Arts Digivolve＞: digivolve one of your Digimon into [${definition.nameEn}] (${definition.cardId}) instead of trashing it?`,
      // The DUAL card being digivolved into is the prompt's subject, so the client shows its art.
      sourceCardId: definition.cardId,
      sourceInstanceId: instance.instanceId,
      options: { candidateInstanceIds: eligible.map((p) => p.topCard!.instanceId), min: 0, max: 1 },
    });
    if (response.kind !== "selectCards" || response.instanceIds.length === 0) return false;
    const chosenInstanceId = response.instanceIds[0];
    const target = eligible.find((p) => p.topCard?.instanceId === chosenInstanceId);
    if (target === undefined) return false;

    let artsRulePool: PooledRuleDeletion[] = [];
    const result = await this.deps.primitives.digivolveFromInstance(target.permanentId, instance.instanceId, {
      payCost: false,
      byEffect: false,
      beforeWhenDigivolving: async () => {
        await this.deps.recomputeContinuousEffects();
        artsRulePool = await this.deps.collectRuleProcessMovements();
      },
    });
    if (result !== undefined && !this.deps.state.gameOver) await this.deps.flushRuleTriggerPool(artsRulePool);
    return result !== undefined;
  }

  /**
   * The printed-color-requirement predicate behind the play-card color gate (§4-21-2: "To
   * meet color requirements, you must have a Digimon or Tamer on your field that's the same
   * color as the Option card you want to use.").
   *
   * The requirement is `optionColorRequirements` where a card carries it — the 6 DUAL cards
   * where the Option side's colors differ from `colors` (the card's own, Digimon-side,
   * printed colors) — and otherwise `definition.colors` itself, but ONLY when this play
   * resolves as an Option (`mode === "option"`): §4-21-1 scopes color requirements to
   * "using an Option card", so a DUAL card played on its Digimon/Tamer side, or any
   * Digimon/Tamer/DigiEgg play, is never gated by this fallback. §4-21-3: a multicolor
   * requirement needs EVERY listed color represented, not just one — `every`, not `some`.
   * §4-21-4: a multicolor Digimon/Tamer can satisfy more than one required color at once,
   * handled by unioning `effectiveColorsOf` below rather than requiring distinct sources.
   * §4-21-5 ("...don't have to be met when activating its effects without using it") holds
   * by construction: this predicate is reachable only from `validatePlayCard`'s "use" path,
   * never from effect activation.
   *
   * The requirement is met when EVERY required color is among the seat's available colors —
   * the union of the colors of the top cards of that seat's battle-area permanents and its
   * breeding slot (a real, already present data source; no new continuous/static color
   * derivation, which is Phase 4). Used also to give WaiveColorRequirement an observable
   * consumer; the waiver short-circuit is applied by the caller before this runs.
   */
  printedColorRequirementMet(
    seat: Seat,
    definition: CardDefinition,
    mode: PlayMode,
    alsoColors: readonly CardColor[] = [],
  ): boolean {
    const required = mode === "option" ? (definition.optionColorRequirements ?? definition.colors ?? []) : [];
    if (required.length === 0) return true;
    const player = this.deps.state.players[seat];
    if (player === undefined) return false;
    const available = new Set<CardColor>();
    const sources: (Permanent | undefined)[] = [...player.battleArea, player.breeding];
    for (const perm of sources) {
      if (perm?.topCard === undefined) continue;
      // §4-21-2 and Memory Boost Q4149/Q4151/Q4153/Q4155/Q4157/Q4159:
      // only a Digimon or Tamer can satisfy an Option's color requirement. A hatched
      // Digi-Egg is treated as a Digimon while it is on the field (Q2684), so its color
      // counts in either field area even though its printed CardKind remains DigiEgg.
      // An Option placed in the battle area for ＜Delay＞ keeps its color but is not a
      // color source.
      const sourceDefinition = definitionOf(perm.topCard);
      const isFieldDigiEgg = perm.topCard.faceUp !== false && sourceDefinition.kinds.includes(CardKind.DigiEgg);
      if (!isDigimon(sourceDefinition) && !isTamer(sourceDefinition) && !isFieldDigiEgg) {
        continue;
      }
      // The available-color set is the EFFECTIVE color of each board permanent — its printed
      // colors UNIONED with every continuously-derived "also treated as <color>" grant
      // (static-continuous-effects subsystem, LOCKED Q4). This closes the Phase-2-Q3 deferral:
      // a permanent that is continuously treated as another color contributes that color here.
      for (const color of this.deps.effectiveColorsOf(perm)) available.add(color);
    }
    // "X ALSO meets this card's colour requirements" (LM Memory Boost family, Q4063/Q4064):
    // one extra colour on the field satisfies the printed requirement in full.
    if (alsoColors.some((color) => available.has(color))) return true;
    return required.every((color) => available.has(color));
  }
}

/** Whether the evolving card satisfies a base-granted path's target predicate (exact name OR
 * name-substring OR trait). */
function baseGrantTargetMatches(target: BaseGrantedDigivolve["target"], evolving: CardDefinition): boolean {
  if (target.namesExact && target.namesExact.some((n) => evolving.nameEn === n)) return true;
  if (target.names && target.names.some((n) => nameIncludesToken(evolving.nameEn, n))) return true;
  if (target.traits && target.traits.some((t) => cardHasTrait(evolving, t))) return true;
  return false;
}
