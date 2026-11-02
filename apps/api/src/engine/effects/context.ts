import type { RuntimeObjectRegistry } from "#api/engine/snapshot/RuntimeObjectRegistry";
import type { RuntimeCallbackRegistry } from "#api/engine/snapshot/RuntimeCallbackRegistry";
import { EngineRuntimeObjectKind } from "#api/engine/snapshot/context/EngineRuntimeObjectKind";
import { isTimingActivationDisabled } from "./timingActivation.js";
import { createTimingLockedEffect } from "#api/engine/effects/timingLock/createTimingLockedEffect";
import { preparedCardLocation } from "#api/engine/effects/preparedCardLocation";
import {
  CardKind,
  EffectTiming,
  requireCardDefinition,
  type CardDefinition,
  type CardInstance,
  type DisableTiming,
  type GameState,
  type Permanent,
  type PlayerState,
  type Seat,
  type Keyword,
} from "@aegis/shared";
import { createCardSource, type CardStateLookup } from "../cards/CardSource.js";
import { getEffectModule } from "./registry.js";
import type { CardSource } from "./CardSource.js";
import type { Effect } from "./Effect.js";
import {
  collectTriggeredEffects,
  collectConferredEffects,
  collectGrantedCustomEffects,
  collectProjectedOnDeletionEffects,
  type CollectedEffect,
} from "./collect.js";
import { grantedTokenEffectsForTiming } from "./interpreter.js";
import { UseTracker, canTrigger } from "./kernel.js";
import { onDeletion } from "./builders.js";
import { linkMax } from "./mindLink.js";
import { findPermanentInState } from "../state/access.js";
import { fieldRevision } from "#api/engine/state/fieldRevision";
import { effectiveKinds, effectiveNames, effectiveTraits, type ContinuousEffectLedger } from "./continuous.js";
import type { DecisionApi, EffectContext, GameAccess, Primitives, TriggerInfo } from "./EffectContext.js";
import { playEffectInstances } from "./interpreter/actions/effectPlayAssembly.js";

/**
 * The live-state lookup a CardSource needs (engine/cards/CardSource.ts), bound to
 * an authoritative GameState. Resolves where a card instance currently sits (its
 * permanent, whether that permanent is in a battle area) and whose turn it is.
 *
 * This is the seam the read-only card-data-model depends on instead of reaching
 * into GameState directly (card-module contract): the framework owns it.
 */
export function createCardStateLookup(state: GameState): CardStateLookup {
  const holders = new Map<string, { permanent: Permanent; breedingSlot: boolean }>();
  const indexedContainers: unknown[] = [];
  let indexedRevision = -1;
  const containersUnchanged = (): boolean => {
    let position = 0;
    for (const p of state.players) {
      if (indexedContainers[position++] !== p) return false;
      if (indexedContainers[position++] !== p.battleArea) return false;
      if (indexedContainers[position++] !== p.breeding) return false;
    }
    return position === indexedContainers.length;
  };
  const holdersByInstance = (): Map<string, { permanent: Permanent; breedingSlot: boolean }> => {
    if (indexedRevision === fieldRevision.value && containersUnchanged()) return holders;
    holders.clear();
    indexedContainers.length = 0;
    const hold = (permanent: Permanent, breedingSlot: boolean): void => {
      const entry = { permanent, breedingSlot };
      const claim = (instanceId: string): void => {
        if (!holders.has(instanceId)) holders.set(instanceId, entry);
      };
      if (permanent.topCard !== undefined) claim(permanent.topCard.instanceId);
      for (const card of permanent.stack) claim(card.instanceId);
      for (const card of permanent.linked) claim(card.instanceId);
    };
    for (const p of state.players) {
      indexedContainers.push(p, p.battleArea, p.breeding);
      for (const permanent of p.battleArea) hold(permanent, false);
      if (p.breeding !== undefined) hold(p.breeding, true);
    }
    indexedRevision = fieldRevision.value;
    return holders;
  };
  const findUncachedPermanent = (
    instanceId: string,
  ): { permanent: Permanent; inBattleArea: boolean; inBreedingArea: boolean } | undefined => {
    const holder = holdersByInstance().get(instanceId);
    if (holder === undefined) return undefined;
    const { permanent, breedingSlot } = holder;
    if (breedingSlot) return { permanent, inBattleArea: false, inBreedingArea: true };
    // A permanent can be flagged inBreeding while listed in battleArea (a moved-back
    // permanent); treat it as breeding-area, not battle-area, to match source.
    return { permanent, inBattleArea: !permanent.inBreeding, inBreedingArea: permanent.inBreeding };
  };

  const findPermanent = (instanceId: string) => {
    if (preparedCardLocation.state !== state) {
      return findUncachedPermanent(instanceId);
    }
    if (preparedCardLocation.instanceId === instanceId) {
      return preparedCardLocation.location;
    }
    const location = findUncachedPermanent(instanceId);
    preparedCardLocation.instanceId = instanceId;
    preparedCardLocation.location = location;
    return location;
  };

  const isInTrash = (instanceId: string): boolean =>
    state.players.some((p) => p.trash.some((c) => c.instanceId === instanceId));

  const isInHand = (instanceId: string): boolean =>
    state.players.some((p) => p.hand.some((c) => c.instanceId === instanceId));

  const isInSecurity = (instanceId: string): boolean =>
    state.players.some((p) => p.security.some((c) => c.instanceId === instanceId && c.faceUp));

  return {
    permanentOf: (instanceId: string): Permanent | undefined => findPermanent(instanceId)?.permanent,
    isOnBattleArea: (instanceId: string): boolean => findPermanent(instanceId)?.inBattleArea ?? false,
    isOnBreedingArea: (instanceId: string): boolean => findPermanent(instanceId)?.inBreedingArea ?? false,
    isInTrash,
    isInHand,
    isInSecurity,
    isSeatsTurn: (seat: Seat): boolean => state.turnSeat === seat,
  };
}

/**
 * Concrete plumbing that binds the effect-framework runtime context to the
 * authoritative GameState. The `EffectContext` interface (EffectContext.ts) is the
 * contract card modules are written against (card-module contract); this is
 * its implementation seam.
 *
 * What lives here (this subsystem, effect-framework):
 *   - `createGameAccess`: a complete, read-only GameAccess over GameState.
 *   - `createEffectContext`: assembles an EffectContext from its parts.
 *
 * What is supplied by OTHER subsystems and injected in:
 *   - `Primitives` (fx) -> effect-primitives subsystem.
 *   - `DecisionApi` (ask) -> effect-stack-resolution subsystem.
 * Until those land, `unimplementedPrimitives` / `unimplementedDecisions` give a
 * context whose verbs throw a clear error, so an un-implemented primitive fails loudly
 * inside a card's resolve() instead of silently doing nothing.
 */

/**
 * Read-only access to authoritative state for effect guards and bodies. Pure: it
 * only reads `state`; it never mutates. Mutation is the job of Primitives (fx).
 */
export function createGameAccess(
  state: GameState,
  linkMaxDelta?: (permanentId: string) => number,
  linkCostReduction?: (recipientId: string, cardTraits: readonly string[]) => number,
  hasKeyword?: (permanentId: string, keyword: string) => boolean,
  digivolvedThisTurn?: (seat: Seat) => boolean,
  isTimingEffectDisabled?: (permanentId: string, timing: "whenDigivolving" | "whenAttacking" | "onPlay") => boolean,
  effectiveColors?: (permanent: Permanent) => import("@aegis/shared").CardColor[],
  colorRequirementWaived?: (instanceId: string) => boolean,
  colorRequirementAlternatives?: (instanceId: string) => import("@aegis/shared").CardColor[],
  canDeclareAttack?: (permanent: Permanent) => boolean,
  effectiveTraitsResolver?: (permanentId: string, printedTraits: readonly string[]) => string[],
  effectiveKindsResolver?: (
    permanentId: string,
    printedKinds: readonly import("@aegis/shared").CardKind[],
  ) => import("@aegis/shared").CardKind[],
  baseGrantedDigivolve?: (
    seat: Seat,
    base: Permanent,
    evolving: CardDefinition,
    sourceZone?: import("@aegis/shared").ZoneRef,
  ) => { cost: number } | undefined,
  effectiveDP?: (permanentId: string) => number,
  linkCostReductionGrant?: (
    recipientId: string,
    cardTraits: readonly string[],
  ) => { amount: number; controllerSeat?: Seat; optional?: boolean; oncePerTurnKey?: string } | undefined,
  effectiveNamesResolver?: (permanent: Permanent, printedName: string) => string[],
  battleOpponentOf?: (permanentId: string) => Permanent | undefined,
): GameAccess {
  const player = (seat: Seat): PlayerState => {
    const p = state.players[seat];
    if (p === undefined) throw new Error(`No player seated at ${seat}`);
    return p;
  };

  const permanentById = (permanentId: string): Permanent | undefined => findPermanentInState(state, permanentId);

  return {
    state,
    player,
    opponentOf: (seat: Seat): Seat => (seat === 0 ? 1 : 0),
    permanentById,
    battleOpponentOf,
    definitionOf: (card: CardInstance): CardDefinition => requireCardDefinition(card.cardId),
    // Base 1 + Σ active <Link +N>. When no ledger resolver is supplied (guard-only
    linkMax: (permanent: Permanent): number => linkMax(permanent, { linkMaxDelta: linkMaxDelta ?? (() => 0) }),
    // Recipient-scoped link-cost reduction. When no ledger
    // resolver is supplied (guard-only contexts) the reduction is 0, leaving the base link cost.
    linkCostReduction: (recipientId: string, cardTraits: readonly string[]): number =>
      (linkCostReduction ?? (() => 0))(recipientId, cardTraits),
    linkCostReductionGrant,
    hasKeyword: (permanentId: string, keyword: string): boolean => (hasKeyword ?? (() => false))(permanentId, keyword),
    canDeclareAttack,
    digivolvedThisTurn: (seat: Seat): boolean => (digivolvedThisTurn ?? (() => false))(seat),
    isTimingEffectDisabled: (permanentId, timing): boolean =>
      (isTimingEffectDisabled ?? (() => false))(permanentId, timing),
    effectiveColors: (permanent): import("@aegis/shared").CardColor[] =>
      (effectiveColors ?? ((p) => (p.topCard === undefined ? [] : requireCardDefinition(p.topCard.cardId).colors)))(
        permanent,
      ),
    effectiveTraits: (permanentId): string[] => {
      const permanent = permanentById(permanentId);
      const definition = permanent?.topCard === undefined ? undefined : requireCardDefinition(permanent.topCard.cardId);
      const printed =
        definition === undefined
          ? []
          : [...(definition.forms ?? []), ...(definition.attributes ?? []), ...(definition.types ?? [])];
      return (effectiveTraitsResolver ?? ((_id, traits) => [...traits]))(permanentId, printed);
    },
    effectiveKinds: (permanentId): import("@aegis/shared").CardKind[] => {
      const permanent = permanentById(permanentId);
      const printed = permanent?.topCard === undefined ? [] : requireCardDefinition(permanent.topCard.cardId).kinds;
      return (effectiveKindsResolver ?? ((_id, kinds) => [...kinds]))(permanentId, printed);
    },
    effectiveNames: (permanent): string[] => {
      const printedName =
        permanent.topCard === undefined ? "" : (requireCardDefinition(permanent.topCard.cardId).nameEn ?? "");
      return (effectiveNamesResolver ?? ((_permanent, name) => (name === "" ? [] : [name.toLowerCase()])))(
        permanent,
        printedName,
      );
    },
    effectiveDP,
    colorRequirementWaived: (instanceId): boolean => (colorRequirementWaived ?? (() => false))(instanceId),
    optionColorRequirementMet: (seat, instanceId, definition): boolean => {
      if ((colorRequirementWaived ?? (() => false))(instanceId)) return true;
      const alsoColors = (colorRequirementAlternatives ?? (() => []))(instanceId);
      const required = definition.optionColorRequirements ?? definition.colors ?? [];
      if (required.length === 0) return true;
      const available = new Set<import("@aegis/shared").CardColor>();
      const sources = [...player(seat).battleArea, player(seat).breeding];
      for (const permanent of sources) {
        if (permanent?.topCard === undefined) continue;
        const sourceDefinition = requireCardDefinition(permanent.topCard.cardId);
        const isHatchedDigiEgg = permanent.inBreeding === true && sourceDefinition.kinds.includes(CardKind.DigiEgg);
        if (
          !sourceDefinition.kinds.includes(CardKind.Digimon) &&
          !sourceDefinition.kinds.includes(CardKind.Tamer) &&
          !isHatchedDigiEgg
        ) {
          continue;
        }
        const colors = (effectiveColors ?? ((p) => requireCardDefinition(p.topCard.cardId).colors))(permanent);
        for (const color of colors) available.add(color);
      }
      // "X ALSO meets this card's colour requirements" (LM Memory Boost family).
      if (alsoColors.some((color) => available.has(color))) return true;
      return required.every((color) => available.has(color));
    },
    baseGrantedDigivolve,
  };
}

/** Assemble the runtime EffectContext handed to canTrigger/canActivate/resolve. */
export function createEffectContext(parts: {
  source: CardSource;
  trigger: TriggerInfo;
  game: GameAccess;
  fx: Primitives;
  ask: DecisionApi;
  usage?: UseTracker;
  activeTiming?: string;
  activeEffectText?: string;
  activeEffectKey?: string;
  conferredToPermanentId?: string;
  conferralGranterInstanceId?: string;
  discardedStackSourceProof?: import("./EffectContext.js").DiscardedStackSourceProof;
}): EffectContext {
  const context: EffectContext = {
    source: parts.source,
    sourcePermanentIdAtCreation: parts.source.permanent?.()?.permanentId,
    trigger: parts.trigger,
    game: parts.game,
    fx: parts.fx,
    ask: parts.ask,
    usage: parts.usage,
    activeTiming: parts.activeTiming,
    activeEffectText: parts.activeEffectText,
    activeEffectKey: parts.activeEffectKey,
    conferredToPermanentId: parts.conferredToPermanentId,
    conferralGranterInstanceId: parts.conferralGranterInstanceId,
    discardedStackSourceProof: parts.discardedStackSourceProof,
  };
  parts.game.runtimeObjects?.track({ value: context, key: EngineRuntimeObjectKind.EFFECT_CONTEXT.value });
  return context;
}

const refuse = (subsystem: string, verb: string): never => {
  throw new Error(
    `${subsystem} not implemented: ${verb}. This verb is owned by the ${subsystem} subsystem (see historical migration ledger).`,
  );
};

/**
 * A Primitives whose every verb throws. Used for guard evaluation and tests that
 * need a complete EffectContext without a live engine; a card that reaches an
 * un-implemented verb fails loudly. Production always injects the real
 * `createPrimitives(engine)` from `engine/effects/primitives.ts`.
 */
export function unimplementedPrimitives(): Primitives {
  return {
    draw: () => refuse("effect-primitives", "draw"),
    gainMemory: () => refuse("effect-primitives", "gainMemory"),
    gainMemoryForSeat: () => refuse("effect-primitives", "gainMemoryForSeat"),
    restrictMemoryGain: () => refuse("static-continuous-effects", "restrictMemoryGain"),
    restrictCostReduction: () => refuse("static-continuous-effects", "restrictCostReduction"),
    restrictUnsuspendedDigivolve: () => refuse("static-continuous-effects", "restrictUnsuspendedDigivolve"),
    restrictPlay: () => refuse("static-continuous-effects", "restrictPlay"),
    disableSecurityEffect: () => refuse("static-continuous-effects", "disableSecurityEffect"),
    disableSecurityEffectsForSeat: () => refuse("static-continuous-effects", "disableSecurityEffectsForSeat"),
    disableTimingEffect: () => refuse("static-continuous-effects", "disableTimingEffect"),
    disableTimingEffectsForPlayer: () => refuse("static-continuous-effects", "disableTimingEffectsForPlayer"),
    declareWinner: () => refuse("effect-primitives", "declareWinner"),
    setMemory: () => refuse("effect-primitives", "setMemory"),
    modifyDP: () => refuse("effect-primitives", "modifyDP"),
    modifyPlayerDP: () => refuse("effect-primitives", "modifyPlayerDP"),
    setBaseDP: () => refuse("static-continuous-effects", "setBaseDP"),
    playFromHand: () => refuse("effect-primitives", "playFromHand"),
    playFromSecurity: () => refuse("effect-primitives", "playFromSecurity"),
    playInstances: () => refuse("effect-primitives", "playInstances"),
    placeOptionAsPermanent: () => refuse("effect-primitives", "placeOptionAsPermanent"),
    digivolveFromInstance: () => refuse("effect-primitives", "digivolveFromInstance"),
    dnaDigivolveInto: () => refuse("effect-primitives", "dnaDigivolveInto"),
    appFuseInto: () => refuse("effect-primitives", "appFuseInto"),
    deDigivolve: () => refuse("effect-primitives", "deDigivolve"),
    placeUnder: () => refuse("effect-primitives", "placeUnder"),
    placePlayMaterialsUnder: () => refuse("effect-primitives", "placePlayMaterialsUnder"),
    placeOwnTopAtStackBottom: () => refuse("effect-primitives", "placeOwnTopAtStackBottom"),
    relocatePermanent: () => refuse("effect-primitives", "relocatePermanent"),
    movePermanentZone: () => refuse("effect-primitives", "movePermanentZone"),
    hatch: () => refuse("effect-primitives", "hatch"),
    placeUnderFromDeck: () => refuse("effect-primitives", "placeUnderFromDeck"),
    placeEggAndPermanentsUnder: () => refuse("effect-primitives", "placeEggAndPermanentsUnder"),
    placeUnderFromEggDeck: () => refuse("effect-primitives", "placeUnderFromEggDeck"),
    placeAsTopFromEggDeck: () => refuse("effect-primitives", "placeAsTopFromEggDeck"),
    link: () => refuse("effect-primitives", "link"),
    trash: () => refuse("effect-primitives", "trash"),
    trashDigivolutionCards: () => refuse("effect-primitives", "trashDigivolutionCards"),
    trashDigivolutionCardsAtomic: () => refuse("effect-primitives", "trashDigivolutionCardsAtomic"),
    redirectDigivolutionTrashHosts: () => refuse("effect-primitives", "redirectDigivolutionTrashHosts"),
    armorPurge: () => refuse("effect-primitives", "armorPurge"),
    ascendToSecurity: () => refuse("effect-primitives", "ascendToSecurity"),
    materialSave: () => refuse("effect-primitives", "materialSave"),
    fireOptionUsed: () => refuse("effect-primitives", "fireOptionUsed"),
    fireOnDiscardLibrary: () => refuse("effect-primitives", "fireOnDiscardLibrary"),
    fireWhenTrashedFromDeck: () => refuse("effect-primitives", "fireWhenTrashedFromDeck"),
    useOptionFromHand: () => refuse("effect-primitives", "useOptionFromHand"),
    resolveCardEffect: () => refuse("effect-primitives", "resolveCardEffect"),
    trashFromSecurity: () => refuse("effect-primitives", "trashFromSecurity"),
    trashTopSecurityOfPlayerWithMostSecurity: () =>
      refuse("effect-primitives", "trashTopSecurityOfPlayerWithMostSecurity"),
    deletePermanent: () => refuse("effect-primitives", "deletePermanent"),
    trashPermanentByRule: () => refuse("effect-primitives", "trashPermanentByRule"),
    suspend: () => refuse("effect-primitives", "suspend"),
    unsuspend: () => refuse("effect-primitives", "unsuspend"),
    returnToHand: () => refuse("effect-primitives", "returnToHand"),
    returnToDeck: () => refuse("effect-primitives", "returnToDeck"),
    returnStackTopsToDeck: () => refuse("effect-primitives", "returnStackTopsToDeck"),
    trashStackTops: () => refuse("effect-primitives", "trashStackTops"),
    reveal: () => refuse("effect-primitives", "reveal"),
    searchDeck: () => refuse("effect-primitives", "searchDeck"),
    addSecurity: () => refuse("effect-primitives", "addSecurity"),
    grantPierce: () => refuse("effect-primitives", "grantPierce"),
    changeEvoCost: () => refuse("effect-primitives", "changeEvoCost"),
    changePlayCost: () => refuse("static-continuous-effects", "changePlayCost"),
    restrict: () => refuse("static-continuous-effects", "restrict"),
    restrictAttackTarget: () => refuse("static-continuous-effects", "restrictAttackTarget"),
    grantNameTrait: () => refuse("static-continuous-effects", "grantNameTrait"),
    setOriginalCardInfo: () => refuse("static-continuous-effects", "setOriginalCardInfo"),
    grantKeyword: () => refuse("static-continuous-effects", "grantKeyword"),
    grantDnaLevel: () => refuse("static-continuous-effects", "grantDnaLevel"),
    grantPlayerKeyword: () => refuse("static-continuous-effects", "grantPlayerKeyword"),
    grantedKeywords: () => [],
    grantLinkMax: () => refuse("static-continuous-effects", "grantLinkMax"),
    grantLinkCostReduction: () => refuse("static-continuous-effects", "grantLinkCostReduction"),
    cannotIgnoreDigivolution: () => refuse("static-continuous-effects", "cannotIgnoreDigivolution"),
    addColorGrant: () => refuse("static-continuous-effects", "addColorGrant"),
    waiveColorRequirement: () => refuse("static-continuous-effects", "waiveColorRequirement"),
    conferStackEffects: () => refuse("static-continuous-effects", "conferStackEffects"),
    projectOnDeletionAtEndOfAttack: () => refuse("static-continuous-effects", "projectOnDeletionAtEndOfAttack"),
    shuffleSecurity: () => refuse("effect-primitives", "shuffleSecurity"),
    revealCard: () => refuse("effect-primitives", "revealCard"),
    securityToHand: () => refuse("effect-primitives", "securityToHand"),
    recoverToSecurity: () => refuse("effect-primitives", "recoverToSecurity"),
    flipTopSecurity: () => refuse("effect-primitives", "flipTopSecurity"),
    flipSecurityFaceUp: () => refuse("effect-primitives", "flipSecurityFaceUp"),
    forceAttack: () => refuse("attack-and-block", "forceAttack"),
    redirectAttack: () => refuse("attack-and-block", "redirectAttack"),
    grantCanAttackUnsuspended: () => refuse("attack-and-block", "grantCanAttackUnsuspended"),
    endAttack: () => refuse("attack-and-block", "endAttack"),
    subscribeSubTrigger: () => refuse("delayed-and-rule-effects", "subscribeSubTrigger"),
    subscribeReplacement: () => refuse("delayed-and-rule-effects", "subscribeReplacement"),
    playToken: () => refuse("effect-primitives", "playToken"),
    modifySecurityDp: () => refuse("effect-primitives", "modifySecurityDp"),
  };
}

/**
 * A DecisionApi whose every call throws. Used for guard evaluation and tests that
 * need a complete EffectContext without a live decision manager. Production always
 * injects the real `createDecisionApi` from `engine/decisions/decisionApi.ts`.
 */
export function unimplementedDecisions(): DecisionApi {
  return {
    optional: () => refuse("effect-stack-resolution", "ask.optional"),
    chooseTargets: () => refuse("effect-stack-resolution", "ask.chooseTargets"),
    selectCards: () => refuse("effect-stack-resolution", "ask.selectCards"),
    selectPermanents: () => refuse("effect-stack-resolution", "ask.selectPermanents"),
    chooseOption: () => refuse("effect-stack-resolution", "ask.chooseOption"),
  };
}

/**
 * Everything the framework needs to evaluate effects against a live match: the
 * authoritative state plus the verbs/decision API the resolver will inject (from
 * the effect-primitives and effect-stack-resolution subsystems).
 */
export interface EffectEnvironment {
  runtimeObjects?: RuntimeObjectRegistry;
  runtimeCallbacks?: RuntimeCallbackRegistry;
  state: GameState;
  fx: Primitives;
  /** Resolve effect verbs from the collected source's controller/owner context. */
  fxForSource?: (source: CardSource) => Primitives;
  ask: DecisionApi;
  /** Per-turn use ledger for maxPerTurn accounting (engine-owned, reset each turn). */
  tracker: UseTracker;
  /** Continuous rules including stack-effect conferrals. */
  continuous: ContinuousEffectLedger;
  hasKeyword?: (permanentId: string, keyword: string) => boolean;
  battleOpponentOf?: (permanentId: string) => Permanent | undefined;
  baseGrantedDigivolve?: GameAccess["baseGrantedDigivolve"];
  digivolvedThisTurn?: (seat: Seat) => boolean;
  effectiveColors?: (permanent: Permanent) => import("@aegis/shared").CardColor[];
  colorRequirementWaived?: (instanceId: string) => boolean;
  colorRequirementAlternatives?: (instanceId: string) => import("@aegis/shared").CardColor[];
  /** Shared ordinary-attack legality used by attack costs before they are offered. */
  canDeclareAttack?: (permanent: Permanent) => boolean;
  /** Trigger payload for the active timing window. */
  triggerInfo?: TriggerInfo;
}

/**
 * The full instance -> CardSource -> EffectContext -> collection chain, ready for
 * the engine. Given the match environment, a firing `timing`, and the candidate
 * card instances that could contribute at that timing, return the effects that
 * actually TRIGGER (kernel canTrigger applied), each paired with its source.
 *
 * This is the single entry point the effect-stack-resolution subsystem builds its
 * ordered, interruptible resolution loop on top of (it then orders the result,
 * prompts for optionals, and awaits resolve). It mutates nothing itself.
 */
export function gatherTriggeredEffects(
  env: EffectEnvironment,
  timing: EffectTiming,
  candidateInstances: readonly CardInstance[],
  grantSnapshot?: {
    stackEffectConferrals: readonly {
      targetPermanentId: string;
      stackInstanceId: string;
      trigger?: string;
      excludeInherited?: boolean;
      excludeKeywords?: Keyword[];
      inheritedOnly?: boolean;
      granterInstanceId?: string;
    }[];
    customEffectGrants: readonly { grantId?: number; instanceId: string; token: string; isActive?: () => boolean }[];
    onDeletionAtEndOfAttackProjections: readonly string[];
  },
): CollectedEffect[] {
  if (candidateInstances.length === 0) return [];
  // Live zones and deletion snapshots can name the same physical card. Collect
  // each source once; separately granted copies are materialized below.
  const candidateIds = new Set<string>();
  const uniqueCandidates = candidateInstances.filter(({ instanceId }) => {
    if (candidateIds.has(instanceId)) return false;
    candidateIds.add(instanceId);
    return true;
  });
  const stackEffectConferrals = grantSnapshot?.stackEffectConferrals ?? env.continuous.listStackEffectConferrals();
  const customEffectGrants = grantSnapshot?.customEffectGrants ?? env.continuous.listCustomEffectGrants();
  const keywordDeletionReaction =
    timing === EffectTiming.OnDestroyedAnyone &&
    ((env.triggerInfo?.fortitudeInstanceIds?.length ?? 0) > 0 ||
      (env.triggerInfo?.retaliationTargetsByInstanceId !== undefined &&
        Object.keys(env.triggerInfo.retaliationTargetsByInstanceId).length > 0));
  const projectedDeletionReaction =
    timing === EffectTiming.OnEndAttack && env.continuous.listOnDeletionAtEndOfAttackProjections().length > 0;
  // With no grants or keyword-created reactions, only printed effects can enter this
  // window. Compiled modules know their timings without constructing a CardSource;
  // handwritten modules remain eligible because they may decide from the live source.
  const plainWindow =
    !keywordDeletionReaction &&
    !projectedDeletionReaction &&
    stackEffectConferrals.length === 0 &&
    customEffectGrants.length === 0;
  const printedCandidates = plainWindow
    ? uniqueCandidates.filter((instance) => {
        const module = getEffectModule(instance.cardId);
        return module !== undefined && module.hasTiming?.(timing) !== false;
      })
    : uniqueCandidates;
  if (printedCandidates.length === 0) return [];
  const game = createGameAccess(
    env.state,
    (id) => env.continuous.linkMaxDelta(id),
    (id, traits) => env.continuous.linkCostReduction(id, traits),
    env.hasKeyword,
    env.digivolvedThisTurn,
    (permanentId, disabledTiming) => isTimingActivationDisabled(env.continuous, permanentId, disabledTiming),
    env.effectiveColors,
    env.colorRequirementWaived,
    env.colorRequirementAlternatives,
    env.canDeclareAttack,
    (permanentId, printedTraits) => effectiveTraits(env.continuous, permanentId, printedTraits),
    (permanentId, printedKinds) => {
      const permanent = findPermanentInState(env.state, permanentId);
      return effectiveKinds(
        env.continuous,
        permanentId,
        permanent?.topCard === undefined ? printedKinds : requireCardDefinition(permanent.topCard.cardId).kinds,
      );
    },
    env.baseGrantedDigivolve,
    undefined,
    (id, traits) => env.continuous.linkCostReductionGrant(id, traits),
    (permanent, printedName) => effectiveNames(env.continuous, permanent, printedName),
    env.battleOpponentOf,
  );
  game.runtimeObjects = env.runtimeObjects;
  game.runtimeCallbacks = env.runtimeCallbacks;
  const lookup = createCardStateLookup(env.state);
  lookup.runtimeObjects = env.runtimeObjects;

  const sources: CardSource[] = printedCandidates.map((instance) => createCardSource(instance, lookup));

  const makeContext = (
    source: CardSource,
    effect: Effect,
    conferredToPermanentId?: string,
    conferralGranterInstanceId?: string,
  ): EffectContext =>
    createEffectContext({
      source,
      trigger: env.triggerInfo ?? {},
      game,
      fx: env.fxForSource?.(source) ?? env.fx,
      ask: env.ask,
      usage: env.tracker,
      // The PRINTED window ("[Main]", "[When Attacking]") the decision is attributed to, which
      // is the effect's IR trigger; the engine timing name is the fallback for hand-written
      // effects that carry none.
      activeTiming: effect.irTrigger ?? EffectTiming[timing],
      activeEffectText: effect.description,
      conferredToPermanentId,
      conferralGranterInstanceId,
    });

  let base = collectTriggeredEffects(timing, sources, (s, e) => makeContext(s, e), env.tracker);
  if (plainWindow) return applyTimingEffectDisable(env, timing, base);
  // Keyword grants disappear when the holder leaves the field. Combat carries
  // the event-time identity after every prevention so the mandatory reaction
  // can share the normal On Deletion ordering and effect-deletion semantics.
  if (timing === EffectTiming.OnDestroyedAnyone && env.triggerInfo?.removalCause === "byBattle") {
    // Offered ahead of the card's printed [On Deletion] effects: the controller still orders the
    // set, but a default order that resolves a same-card ＜Save＞ first moves the card out of the
    // trash and retires the pending ＜Retaliation＞ with it (CR 15-4-4-3; BT14-059).
    const retaliations: typeof base = [];
    for (const source of sources) {
      const target = env.triggerInfo.retaliationTargetsByInstanceId?.[source.instanceId];
      if (target === undefined || !env.triggerInfo.deletedInstanceIds?.includes(source.instanceId)) continue;
      const count = env.triggerInfo.retaliationCountsByInstanceId?.[source.instanceId] ?? 1;
      for (let index = 0; index < count; index++) {
        const effect = onDeletion({
          source,
          effectKey: index === 0 ? "keyword/retaliation" : `keyword/retaliation/${index}`,
          description: "＜Retaliation＞: delete the Digimon this Digimon battled.",
          when: (ctx) => ctx.source.definition.isToken === true || ctx.source.isInTrash?.() === true,
          resolve: async (ctx) => {
            await ctx.fx.deletePermanent([target], "byEffect");
          },
        });
        if (canTrigger(effect, makeContext(source, effect), env.tracker)) retaliations.push({ source, effect, timing });
      }
    }
    base = [...retaliations, ...base];
  }

  // Fortitude is a mandatory triggered effect, not a post-window replay. Its event-time
  // snapshot retains granted keywords and stack eligibility after the holder leaves play.
  if (timing === EffectTiming.OnDestroyedAnyone) {
    for (const source of sources) {
      if (!env.triggerInfo?.fortitudeInstanceIds?.includes(source.instanceId)) continue;
      const effect = onDeletion({
        source,
        effectKey: "keyword/fortitude",
        description: "＜Fortitude＞: play this card without paying the cost.",
        when: (ctx) => ctx.source.isInTrash?.() === true,
        resolve: async (ctx) => {
          await playEffectInstances(ctx, [source], { payCost: false });
        },
      });
      if (canTrigger(effect, makeContext(source, effect), env.tracker)) base.push({ source, effect, timing });
    }
  }

  const instanceById = (id: string): CardSource | undefined => {
    for (const inst of uniqueCandidates) {
      if (inst.instanceId === id) return createCardSource(inst, lookup);
    }
    return undefined;
  };

  // The permanents represented by this window's candidate instances. A conferral's SOURCE card
  // (＜Succession＞'s Lv.6 [Chronomon], BT16-014's Goldramon) sits BURIED in its host's
  // digivolution stack, and a narrowly-scoped window passes only one instance as a candidate:
  // `fireTimingForInstance`, the effect-driven play/digivolve seam, passes just the entering card.
  // `instanceById` then could not find the buried source and every conferred effect was dropped
  // from that window — Chronomon: Destroy Mode digivolving in by effect (BT26-085's replacement
  // digivolve) never gained Chronomon: Holy Mode's [When Digivolving], while its [When Attacking]
  // did work, because combat fires through the permanent-scoped seam instead.
  const candidatePermanentIds = new Set<string>();
  for (const source of sources) {
    const permanentId = source.permanent()?.permanentId;
    if (permanentId !== undefined) candidatePermanentIds.add(permanentId);
  }
  // Scoping stays with the window: the extra lookup reaches only the stacks of permanents this
  // window already has candidates for, so a board-wide window behaves exactly as before while a
  // single-permanent window gains that permanent's own conferrals and nothing else.
  const conferralSourceById = (id: string): CardSource | undefined => {
    const direct = instanceById(id);
    if (direct !== undefined) return direct;
    for (const permanentId of candidatePermanentIds) {
      const card = findPermanentInState(env.state, permanentId)?.stack.find((entry) => entry.instanceId === id);
      if (card !== undefined) return createCardSource(card, lookup);
    }
    return undefined;
  };

  const conferred = collectConferredEffects(
    timing,
    stackEffectConferrals,
    conferralSourceById,
    (s, e, permanentId, granterInstanceId) => makeContext(s, e, permanentId, granterInstanceId),
    env.tracker,
  );

  // Named custom effect grants (GrantStatic grant:"effects" with tokens — RB1-030's granted
  // "[On Deletion] Delete the lowest-level opponent Digimon"). Compile each grant's token to the
  // engine Effects it contributes at this timing, anchored on the GRANTED card's instance (found
  // among the candidate instances — battle area AND trash, so a granted [On Deletion] is collected
  // from trash on the grantee's own deletion, exactly like a printed one), and collect those that
  // trigger. Resolution then runs through the same stack at the same window (OnDestroyedAnyone).
  const granted = collectGrantedCustomEffects(
    timing,
    customEffectGrants,
    instanceById,
    (token, source) => grantedTokenEffectsForTiming(token, timing, source),
    (source, effect) => makeContext(source, effect),
    env.tracker,
  );

  // [On Deletion] effects re-timed to the end of the projecting Digimon's OWN attack (BT16-015).
  // Read from the LIVE ledger and intersected with the window's opening snapshot: the snapshot
  // keeps a projection acquired mid-window from retroactively triggering (BT10-011 Q1940, the
  // same rule the grant snapshot above serves), while the live read is what makes a projection
  // REMOVED mid-window stop offering its copies (§15-4-4-5; BT16-015 Q2615).
  const projected = ((): CollectedEffect[] => {
    if (timing !== EffectTiming.OnEndAttack) return [];
    const attackerPermanentId = env.triggerInfo?.attackerPermanentId;
    if (attackerPermanentId === undefined) return [];
    const live = env.continuous.listOnDeletionAtEndOfAttackProjections();
    const isLive = live.some((projection) => projection.permanentId === attackerPermanentId);
    const inSnapshot =
      grantSnapshot === undefined || grantSnapshot.onDeletionAtEndOfAttackProjections.includes(attackerPermanentId);
    if (!isLive || !inSnapshot) return [];
    return collectProjectedOnDeletionEffects(
      [attackerPermanentId],
      (permanentId) => {
        const permanent = findPermanentInState(env.state, permanentId);
        if (permanent === undefined) return [];
        // Top card + digivolution cards: the two positions a Digimon's own and inherited
        // [On Deletion] effects live in. `canActivate`'s placement guard sorts out which of
        // each card's effects apply from the position it currently occupies.
        return [permanent.topCard, ...permanent.stack].flatMap((card) => {
          const source = card === undefined ? undefined : instanceById(card.instanceId);
          return source === undefined ? [] : [source];
        });
      },
      (s, e) => makeContext(s, e),
      env.tracker,
    );
  })();

  return applyTimingEffectDisable(env, timing, [...base, ...conferred, ...granted, ...projected]);
}

/**
 * The maskable timing windows, mapping each engine EffectTiming to its DisableTiming mask.
 * Timings absent here are never suppressed by a DisableTimingEffect (the lookup returns
 * undefined and the consume site is a no-op). OnUseAttack is the engine home of the
 * [When Attacking] trigger; OnPlay of [On Play]; WhenDigivolving of [When Digivolving].
 */
const TIMING_DISABLE_MASK: Partial<Record<EffectTiming, DisableTiming>> = {
  [EffectTiming.WhenDigivolving]: "whenDigivolving",
  [EffectTiming.OnUseAttack]: "whenAttacking",
  [EffectTiming.OnPlay]: "onPlay",
};

function applyTimingEffectDisable(
  env: EffectEnvironment,
  timing: EffectTiming,
  collected: CollectedEffect[],
): CollectedEffect[] {
  const mask = TIMING_DISABLE_MASK[timing];
  if (mask === undefined) {
    return collected;
  }
  return collected.map((collectedEffect) => ({
    ...collectedEffect,
    effect: createTimingLockedEffect({
      payload: { effect: collectedEffect.effect, source: collectedEffect.source, mask },
      continuous: env.continuous,
      runtimeObjects: env.runtimeObjects,
    }),
  }));
}
