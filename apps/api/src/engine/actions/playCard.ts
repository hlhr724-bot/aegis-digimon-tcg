import { ArraySchema } from "@colyseus/schema";
import {
  CardInstance,
  Permanent,
  Phase,
  Zone,
  EffectTiming,
  CardKind,
  type CardDefinition,
  type GameState,
  type PlayerState,
  type Seat,
  getCompiledCard,
} from "@aegis/shared";
import { definitionOf, dpOf } from "../cards/cardData.js";
import {
  extractCardAt,
  insertCard,
  placePermanent as appendPermanent,
  setResolvingOption,
  setTopCard,
} from "../state/access.js";
import type { DigivolveCostTriggers } from "./digivolve.js";

/** The narrowed intent this action handles (mirrors the @aegis/shared Intent variant). */
export interface PlayCardIntent {
  type: "playCard";
  instanceId: string;
  /** Optional target battle-area slot index (approximated; see hasEmptyBattleSlot). */
  targetSlot?: number;
  /**
   * Present when this play is a DigiXros declaration (place named materials under the card for a
   * per-material cost reduction). The GameEngine routes these to the DigiXros subsystem; the plain
   * play-card action ignores the field. See `actions/digiXros.ts` and the @aegis/shared DigiXrosPlan.
   */
  digiXros?: {
    materialInstanceIds: string[];
    expanderPermanentIds?: string[];
    underTamerHostPermanentId?: string;
  };
  /**
   * Present when this play is an Assembly declaration (place the exact named/traited TRASH-card
   * count under the card for a flat cost reduction, §7-3). The GameEngine routes these to the
   * Assembly subsystem; the plain play-card action ignores the field. See `actions/assembly.ts`
   * and the @aegis/shared AssemblyPlan.
   */
  assembly?: { materialInstanceIds: string[] };
  /**
   * Option-use declaration. DUAL cards default to Option use through this intent;
   * an explicit Digimon play is rejected because DUAL cards cannot be played (CR 7-1-1).
   * Their Digimon side is available through the separate digivolve intent.
   */
  useAs?: "digimon" | "option";
}

/** Stable rejection reasons (same vocabulary as the sibling `digivolve` action). */
export type PlayCardRejection =
  | "not-your-turn"
  | "wrong-phase"
  | "decision-pending"
  | "game-over"
  | "no-such-player"
  | "card-not-in-zone"
  | "not-playable-kind" // DigiEgg, or a card with no playable kind
  | "no-empty-slot" // invalid target-slot hint (permanents only)
  | "play-prohibited" // a seat-level "can't play <X>" prohibition forbids this play (RestrictPlay)
  | "color-requirement-unmet" // the card's printed color requirement is unmet and not waived (WaiveColorRequirement)
  | "insufficient-memory";

/** How the played card resolves once it leaves the hand. */
export type PlayMode = "permanent" | "option";

/** Result of validating a play-card intent without mutating anything. */
export type PlayCardCheck =
  | { ok: false; reason: PlayCardRejection }
  | {
      ok: true;
      /** The hand instance being played, and its hand index. */
      instance: CardInstance;
      instanceIndex: number;
      /** Static definition of the played card. */
      definition: CardDefinition;
      /** Whether the card becomes a permanent or resolves as an option. */
      mode: PlayMode;
      /** Memory to pay (>= 0; -1 "no cost" already normalized to 0). */
      cost: number;
    };

/** Events this action narrates (subset of @aegis/shared ServerEvent). */
export type PlayCardEvent =
  | {
      kind: "cardPlayed";
      seat: Seat;
      cardId: string;
      instanceId?: string;
      fromZone?: string;
      artId?: string;
      permanentId?: string;
    }
  | { kind: "memoryChanged"; from: number; to: number; reason: string }
  | { kind: "cardsMoved"; instanceIds: string[]; from: string; to: string; optionUsed?: true };

/**
 * Injected side-effect dependencies. Each is owned by a sibling subsystem; the
 * defaults (`defaultPlayCardDeps`) keep play-card runnable and unit-testable in
 * isolation, and a real GameEngine passes its own (the canonical memory gauge, the
 * effect stack, the event emitter, the permanent-id allocator). This is the seam
 * that keeps package boundaries clean (ARCHITECTURE.md section 3).
 */
export interface PlayCardDeps {
  /**
   * Max memory the active seat may spend right now (source Player.MaxMemoryCost):
   * how far the gauge can still travel toward the opponent's side for this seat.
   */
  maxAffordable(state: GameState, seat: Seat): number;
  /** Spend `cost` memory for `seat` (source cost payment; moves the shared gauge). */
  payMemory(state: GameState, seat: Seat, cost: number): void;
  /**
   * Apply any active continuous play-cost modifiers (rule implementation play/use forms,
   * recorded by the static-continuous-effects layer) to the printed `base` cost for
   * `seat` playing `definition`, returning the cost actually paid. Optional: when
   * absent the printed cost is used unchanged. The engine binds this to the
   * ModifierLedger's `playCostFor`.
   */
  adjustedPlayCost?(state: GameState, seat: Seat, definition: CardDefinition, base: number): number;
  /**
   * Whether a seat-level play prohibition (RestrictPlay: "your opponent can't play <X>")
   * forbids `seat` from playing `definition` right now. Optional: when absent no play is
   * prohibited. The engine binds this to the continuous ledger's `isPlayBlocked` for the
   * playing seat (a manual play is the playing seat's own action — KB EX7-014 Q4673).
   */
  playProhibited?(state: GameState, seat: Seat, definition: CardDefinition): boolean;
  /**
   * Whether `seat` satisfies `definition`'s printed color requirement to play `instance`
   * right now, OR that requirement is currently waived (WaiveColorRequirement). Optional:
   * when absent the play is treated as color-legal (the default standalone behaviour).
   *
   * This is the MINIMAL color-legality gate (CONTEXT.md LOCKED Q3): it exists so the
   * WaiveColorRequirement effect has an observable consumer — the engine binds this to a
   * predicate that checks the printed color requirement and short-circuits to legal when
   * `continuous.hasColorWaiver(instance.instanceId)` is true. It is deliberately NOT the
   * full static/continuous color subsystem (Phase 4): no color is derived from effects.
   */
  colorRequirementMet?(
    state: GameState,
    seat: Seat,
    instance: CardInstance,
    definition: CardDefinition,
    mode: PlayMode,
  ): boolean;
  /** Allocate a permanentId unique within the match. */
  nextPermanentId(): string;
  /** Recompute derived DP after a new permanent enters, including player-wide modifiers. */
  recomputeDP?(permanentId: string): void;
  /**
   * Fire a timing window for one source instance through the effect stack
   * (registry -> collect -> ordered resolve). play-card fires On Play for a newly
   * placed permanent and the option activation for an Option card. Async because
   * resolution may await player decisions (ARCHITECTURE.md section 5). Supplied by
   * the engine so this module stays decoupled from effect-stack internals
   * (subsystems: effect-framework, effect-stack-resolution).
   */
  fireTiming(state: GameState, seat: Seat, timing: EffectTiming, sourceInstanceId: string): Promise<void>;
  /** Optional lightweight seam retained for standalone callers; production fireTiming owns the
   * complete manual-play entry window and publishes `whenPlayed` exactly once. */
  fireSubTrigger?(event: "whenPlayed", payload: { subjectPermanentId: string; playedPlayCost?: number }): Promise<void>;
  /** Defer rule processing until an Option has completed its trash/Arts/Delay routing. */
  beginOptionResolution?(): void;
  /** Mark the Option's [Main] body finished, before its Arts Digivolve or trash routing. */
  finishOptionMain?(): void;
  /** Release the Option-resolution deferral and run the pending rule-process fixpoint. */
  finishOptionResolution?(): Promise<void>;
  /** Capture listeners at use; activate the captured group after Main and post-use routing. */
  prepareOptionUsed?(usedInstanceId: string, usedOptionCost?: number): () => Promise<void>;
  /** Legacy standalone seam for callers without trigger snapshots. */
  fireOptionUsed?(usedInstanceId: string, usedOptionCost?: number): Promise<void>;
  /**
   * Project the Option's rules-relevant use cost before payment and its [Main] effect resolve.
   * This is separate from the paid play cost: intrinsic card-level reductions affect this value,
   * while payment-only reductions do not. Optional and only consulted for Option plays.
   */
  optionUseCost?(state: GameState, seat: Seat, instance: CardInstance, passiveCost: number): number;
  /**
   * Pay-time interactive cost FINALIZATION (the BeforePayCost hook). After the synchronous
   * `validatePlayCard` produced the passive-modifier cost for the immediate IntentResult, the
   * async apply path calls this BEFORE spending memory: it fires the in-hand card's
   * `BeforePayCost` window (where a `ReducePlayCost` action may run an OPTIONAL server-side
   * payment — trash a card / sacrifice a Digimon — and earn a cost delta), then returns the
   * FINAL cost to pay, floored at 0 (EX9-043 / BT25-076). The reduction is computed
   * server-side; the client never supplies the delta (T-08-26 / T-08-27). Optional: when absent
   * the passive `baseCost` is paid unchanged (the standalone default, no interactive hook). The
   * engine binds this to a fire of `EffectTiming.BeforePayCost` for the played instance that reads
   * `ctx.playCostDelta`.
   */
  finalizePlayCost?(
    state: GameState,
    seat: Seat,
    instance: CardInstance,
    definition: CardDefinition,
    baseCost: number,
    mode: PlayMode,
  ): Promise<number>;
  /**
   * SYNCHRONOUS predicate: does `instance` have any `BeforePayCost` effect (i.e. is the pay-time
   * interactive cost-reduction hook relevant for this play)? The overwhelming majority of cards do
   * NOT, so this lets `applyPlayCard` skip the async `finalizePlayCost` await entirely for them —
   * preserving the established same-microtask placement that callers (and existing tests) rely on.
   * Only the rare BeforePayCost card (EX9-043 / BT25-076) takes the async finalization path.
   * Optional: when absent, `finalizePlayCost` is consulted for every play (the standalone default).
   */
  hasBeforePayCost?(instance: CardInstance): boolean;
  holdCostTriggers?(): DigivolveCostTriggers;
  /** Read-only lower bound after pay-time reducers; undefined means not projectable. */
  minimumDeferredPlayCost?(instance: CardInstance, baseCost: number): number | undefined;
  /**
   * After the played card becomes a permanent (mode "permanent"), place under it any cards a
   * cross-permanent play-cost reducer committed during BeforePayCost (BT10-093 places purple Digimon
   * pulled from under the player's Tamers as the played card's digivolution cards). Runs BEFORE On
   * Play so those cards are part of the stack the [On Play] effect sees. Optional / no-op by default.
   */
  placePendingDigivolution?(playedInstanceId: string, permanentId: string): Promise<void>;
  /**
   * CR §4-19 Arts Digivolve: a rule on DUAL cards, not a per-card effect. After a DUAL
   * card's Option side finishes resolving, instead of the pending trash, one of the
   * controller's permanents on the field MAY digivolve into it without paying the cost
   * (§4-19-2: overwrite processing that REPLACES the trash step). Consulted only for
   * `isDualCard` cards resolved via the Option branch, while the instance still sits in
   * the resolving-option slot. Returns true when a permanent accepted the digivolve (the
   * instance is consumed and must NOT also be trashed); false when declined, timed out,
   * or no eligible target exists — the caller falls through to the normal trash.
   * Optional: when absent, an Option-side DUAL card always trashes (the prior behavior).
   */
  artsDigivolve?(state: GameState, seat: Seat, instance: CardInstance, definition: CardDefinition): Promise<boolean>;
  /** Optional narration hook (server -> client event log). */
  emit?: (event: PlayCardEvent) => void;
}

/** What applyPlayCard produced (for the caller / tests / event log). */
export interface PlayCardOutcome {
  cardId: string;
  instanceId: string;
  mode: PlayMode;
  cost: number;
  /** Set when a permanent was created (mode === "permanent"). */
  permanentId?: string;
}

/** The enter-field timing fired for a newly played permanent. */
export const ON_PLAY_TIMING = EffectTiming.OnPlay;
/** The activation timing fired for a played Option card. */
export const ON_USE_OPTION_TIMING = EffectTiming.OnUseOption;

/**
 * Validate a play-card intent against current authoritative state. Pure: mutates
 * nothing. Checks run in the API-CONTRACT order (game/decision gates ->
 * seat/turn/phase -> legality), rejecting with a stable reason on the first failure.
 */
export function validatePlayCard(
  state: GameState,
  seat: Seat,
  intent: PlayCardIntent,
  deps: Pick<
    PlayCardDeps,
    | "maxAffordable"
    | "adjustedPlayCost"
    | "playProhibited"
    | "colorRequirementMet"
    | "hasBeforePayCost"
    | "minimumDeferredPlayCost"
  >,
): PlayCardCheck {
  // 1. Game-state gates, then seat / turn / phase. Play is a Main-phase, turn-player
  //    verb (PlayCardAction is enqueued only during the active player's Main phase).
  if (state.gameOver) return { ok: false, reason: "game-over" };
  if (state.pendingDecision !== undefined) return { ok: false, reason: "decision-pending" };
  if (state.turnSeat !== seat) return { ok: false, reason: "not-your-turn" };
  if (state.phase !== Phase.Main) return { ok: false, reason: "wrong-phase" };

  const player = state.players[seat];
  if (player === undefined) return { ok: false, reason: "no-such-player" };

  // 2. The card must be in this seat's hand.
  const found = findInHand(player, intent.instanceId);
  if (found === undefined) return { ok: false, reason: "card-not-in-zone" };

  // 3. Kind legality + play mode. Digimon/Tamer become permanents; Options resolve
  //    then trash. DigiEggs are hatched, never played from hand by this verb.
  const definition = definitionOf(found.instance.cardId);
  const mode = playModeOf(definition.kinds, intent.useAs);
  if (mode === undefined) return { ok: false, reason: "not-playable-kind" };

  // 4. Aegis models the battle area as an unbounded ordered collection. A supplied
  // targetSlot is only a client hint, but a malformed negative/fractional index is rejected.
  if (mode === "permanent" && !isValidTargetSlot(intent.targetSlot)) {
    return { ok: false, reason: "no-empty-slot" };
  }

  // 4b. Seat-level play prohibition (RestrictPlay: "your opponent can't play <X>"). A manual
  //     play is the playing seat's OWN action, so the prohibition on that seat applies (the
  //     prohibition does not block the source player's effects, only this seat's own plays).
  if (deps.playProhibited?.(state, seat, definition)) {
    return { ok: false, reason: "play-prohibited" };
  }

  // 4c. Color-requirement legality (MINIMAL gate, CONTEXT.md LOCKED Q3): the card's printed
  //     color requirement must be met, UNLESS WaiveColorRequirement has waived this instance.
  //     The hook short-circuits to legal on an active waiver — that is the observable
  //     consumer for the color-waiver store. Absent (standalone runs), no color gate applies.
  //     The mode lets the caller distinguish permanent play from Option use, including
  //     DUAL cards, while preserving continuous color-waiver handling.
  if (deps.colorRequirementMet && !deps.colorRequirementMet(state, seat, found.instance, definition, mode)) {
    return { ok: false, reason: "color-requirement-unmet" };
  }

  // 5. Affordability: the play cost (after any continuous cost modifiers) must be
  //    payable (documented behavior MaxMemoryCost >= cost).
  const printed = normalizeCost(definition.playCost);
  const cost = deps.adjustedPlayCost ? Math.max(0, deps.adjustedPlayCost(state, seat, definition, printed)) : printed;
  // A self/cross-card reducer may only be finalized at BeforePayCost because its
  // condition, scaling, or optional payment is evaluated against the live board.
  // Let that narrow class enter the async finalization path; applyPlayCard performs
  // the authoritative affordability check again against the resulting final cost.
  const affordable = deps.maxAffordable(state, seat);
  if (affordable < cost) {
    const minimum = deps.minimumDeferredPlayCost?.(found.instance, cost);
    if (deps.hasBeforePayCost?.(found.instance) !== true || (minimum !== undefined && minimum > affordable)) {
      return { ok: false, reason: "insufficient-memory" };
    }
  }

  return { ok: true, instance: found.instance, instanceIndex: found.index, definition, mode, cost };
}

/**
 * Apply a play-card. Validates first (so it is safe to call directly), then mutates
 * authoritative state in the source order:
 *
 *   1. pay the memory cost (moves the shared gauge),
 *   2. remove the played card from hand,
 *   3a. (permanent) create a new battle-area Permanent (top card, DP from the
 *       definition, unsuspended, not in breeding), emit cardPlayed + cardsMoved,
 *       then fire On Play through the effect stack; or
 *   3b. (option) fire the option activation through the effect stack, then move the
 *       card to trash, emitting cardPlayed + cardsMoved.
 *
 * Steps that touch sibling subsystems (memory, effect stack) are delegated to
 * injected deps. Returns a structured outcome, or a rejection if validation fails.
 * Async because the effect-stack firing can await player decisions.
 */
export async function applyPlayCard(
  state: GameState,
  seat: Seat,
  intent: PlayCardIntent,
  deps: PlayCardDeps,
): Promise<{ ok: false; reason: PlayCardRejection } | { ok: true; outcome: PlayCardOutcome }> {
  const check = validatePlayCard(state, seat, intent, deps);
  if (!check.ok) return check;

  const { instanceIndex, definition, mode, cost: passiveCost } = check;
  const player = state.players[seat]!;

  // (0) Pay-time interactive cost FINALIZATION (BeforePayCost hook). The card is STILL in hand
  //     hook fires the in-hand card's BeforePayCost window, where a ReducePlayCost action may run
  //     an OPTIONAL server-side payment and earn a delta, then returns the FINAL cost to pay
  //     (floored at 0). Absent (standalone default) => the passive cost stands. The reduction is
  //     computed server-side; the client never supplies the delta (T-08-26). The just-played
  //     instance must still be the hand card we validated, so resolve it WITHOUT removing it.
  const handInstance = player.hand[instanceIndex];
  if (handInstance === undefined) {
    // Unreachable after validation; treated as a card-not-in-zone race.
    return { ok: false, reason: "card-not-in-zone" };
  }
  // Take the async pay-time finalization path ONLY when this card has a BeforePayCost effect (the
  // rare EX9-043 / BT25-076 case). For every other card, the cost is the passive cost computed
  // synchronously above, and placement stays in the same microtask (no behavioral/timing change).
  const needsFinalize =
    deps.finalizePlayCost !== undefined && (deps.hasBeforePayCost === undefined || deps.hasBeforePayCost(handInstance));
  const optionUseCost =
    mode === "option" && deps.optionUseCost !== undefined
      ? Math.max(0, deps.optionUseCost(state, seat, handInstance, passiveCost))
      : passiveCost;
  const costTriggers = needsFinalize ? deps.holdCostTriggers?.() : undefined;
  try {
    const cost = needsFinalize
      ? Math.max(0, await deps.finalizePlayCost!(state, seat, handInstance, definition, passiveCost, mode))
      : passiveCost;
    costTriggers?.stopHolding();
    return await playWithFinalCost(state, seat, deps, check, handInstance, optionUseCost, cost, costTriggers);
  } finally {
    costTriggers?.stopHolding();
    await costTriggers?.activate();
  }
}

async function playWithFinalCost(
  state: GameState,
  seat: Seat,
  deps: PlayCardDeps,
  check: Extract<PlayCardCheck, { ok: true }>,
  handInstance: CardInstance,
  optionUseCost: number,
  cost: number,
  costTriggers: DigivolveCostTriggers | undefined,
): Promise<{ ok: false; reason: PlayCardRejection } | { ok: true; outcome: PlayCardOutcome }> {
  const { definition, mode } = check;
  const player = state.players[seat]!;

  // (0b) Re-check affordability against the FINALIZED cost. The synchronous IntentResult was
  //      validated on the passive cost; a pay-time reduction can only LOWER the cost, but the
  //      board may have changed during the interactive payment, so re-assert affordability before
  //      spending (defensive — a reduction never makes an affordable play unaffordable).
  if (deps.maxAffordable(state, seat) < cost) {
    return { ok: false, reason: "insufficient-memory" };
  }

  // (1) Pay the (possibly reduced) memory cost (shared memory gauge moves toward the opponent).
  if (cost > 0) {
    const memoryBefore = state.memory;
    deps.payMemory(state, seat, cost);
    deps.emit?.({ kind: "memoryChanged", from: memoryBefore, to: state.memory, reason: "playCard" });
  }

  // (2) Remove the played card from hand. Re-locate by instanceId: the BeforePayCost payment may
  //     have mutated the hand (a trashed-from-hand cost shifts indices), so the validated index is
  //     stale — find the card we are playing by its stable id.
  const playIndex = player.hand.findIndex((c) => c.instanceId === handInstance.instanceId);
  if (playIndex < 0) {
    return { ok: false, reason: "card-not-in-zone" };
  }
  const instance = takeFromHand(player, playIndex);
  if (instance === undefined) {
    // Unreachable after the findIndex above; treated as a card-not-in-zone race.
    return { ok: false, reason: "card-not-in-zone" };
  }
  instance.faceUp = true;

  if (mode === "permanent") {
    // (3a) Place as a new battle-area permanent and fire On Play.
    const permanent = placePermanent(deps, player, instance, definition);
    permanent.enterFieldTurnCount = state.turnCount;
    deps.emit?.({
      kind: "cardPlayed",
      instanceId: instance.instanceId,
      fromZone: "hand",
      seat,
      cardId: instance.cardId,
      ...(instance.artId ? { artId: instance.artId } : {}),
      permanentId: permanent.permanentId,
    });
    deps.emit?.({
      kind: "cardsMoved",
      instanceIds: [instance.instanceId],
      from: Zone.Hand,
      to: Zone.BattleArea,
    });

    // Place any digivolution cards a cross-permanent reducer (BT10-093) committed for this play,
    // before On Play sees the stack.
    await deps.placePendingDigivolution?.(instance.instanceId, permanent.permanentId);

    // `fireTiming` owns the complete manual-play entry window, including the canonical
    // `whenPlayed` bus after On Play resolves. Publishing that bus here as well would make one
    // hand play one event twice (the second pass is especially visible to once-per-turn
    // watchers after an optional decline).
    const fireOnPlay = () => deps.fireTiming(state, seat, ON_PLAY_TIMING, instance.instanceId);
    await (costTriggers === undefined ? fireOnPlay() : costTriggers.activate(fireOnPlay));

    return {
      ok: true,
      outcome: {
        cardId: instance.cardId,
        instanceId: instance.instanceId,
        mode,
        cost,
        permanentId: permanent.permanentId,
      },
    };
  }

  // (3b) Option: never becomes a permanent. Resolve its effect, then route it:
  //      ＜Delay＞ keyword → face-down in delay zone (KB §16-17); otherwise → trash.
  deps.emit?.({
    kind: "cardPlayed",
    instanceId: instance.instanceId,
    fromZone: "hand",
    seat,
    cardId: instance.cardId,
    ...(instance.artId ? { artId: instance.artId } : {}),
  });

  // §9-1-4: a used Option is treated as being in NO area for the whole window from
  // activation of its 1st [Main] effect until it resolves — it must NOT be visible in
  // trash (or any zone) yet. `player.resolvingOption` is a dedicated non-zone slot that
  // GameEngine.listCandidateInstances() folds in, so fireTiming can still resolve the
  // effect against its own source. try/finally guarantees the slot is cleared and the
  // card lands in trash even if the effect throws — a stranded instance would otherwise
  // sit outside every zone permanently.
  setResolvingOption(player, instance);
  const activateOptionUsed = deps.prepareOptionUsed?.(instance.instanceId, optionUseCost);
  const resolveOption = async () => {
    deps.beginOptionResolution?.();
    let routedToTrash = false;
    try {
      try {
        await deps.fireTiming(state, seat, ON_USE_OPTION_TIMING, instance.instanceId);
      } finally {
        deps.finishOptionMain?.();
        // CR §4-19 Arts Digivolve: a rule on DUAL cards, not a per-card effect. It OVERWRITES
        // the trash step below (§4-19-2), so it must be offered BEFORE that step, while the
        // instance still sits in resolvingOption. A DUAL card resolved via its Option side may
        // have one of the controller's permanents digivolve into it for free instead of
        // trashing; `artsDigivolve` claims resolvingOption itself (the same removeLooseInstance
        // path BT18-100's self-placement uses) when a permanent accepts.
        if (player.resolvingOption === instance && definition.isDualCard) {
          await deps.artsDigivolve?.(state, seat, instance, definition);
        }
        // §9-1-5's exception: the effect (or Arts Digivolve, above) may have already placed the
        // card in a real area itself (e.g. PlaceInBattleAreaSelf turning it into an option
        // permanent, BT18-100) via `removeLooseInstance`, which claims resolvingOption and
        // clears it when that happens. Only route it to trash here when nothing claimed it.
        if (player.resolvingOption === instance) {
          setResolvingOption(player, undefined);
          insertCard(player, Zone.Trash, instance);
          routedToTrash = true;
        }
      }
      if (routedToTrash) {
        deps.emit?.({
          kind: "cardsMoved",
          instanceIds: [instance.instanceId],
          from: Zone.Hand,
          to: Zone.Trash,
          optionUsed: true,
        });
      }

      // ＜Delay＞ keyword — move from trash to delay zone per Comprehensive Rules §16-17. Scoped
      // to a PURE delay Option: EVERY non-security [Main] clause carries ＜Delay＞ (the Memory
      // Boost family — a single ＜Delay＞ [Main] clause IS the whole card, so it never resolves an
      // on-play body and instead rests face-down in the delay zone). An "option permanent" card
      // (BT18-100: a plain on-play [Main] body that places itself in the battle area, PLUS a
      // SEPARATE ＜Delay＞-keyworded [Main] clause that becomes a later activated ability once it
      // is a real permanent — card-module contract's isOptionPlayBody family) must NOT be swept into
      // the delay zone just because one of its OTHER clauses happens to carry the keyword; only
      // the on-play body's own placement should route it. Checking "some" instead of "every" here
      // previously misrouted that shape straight to the delay zone, skipping its on-play body.
      const compiled = getCompiledCard(instance.cardId);
      const mainClauses = (compiled?.effects ?? []).filter((eff) => eff.trigger === "Main" && !eff.isSecurity);
      const hasDelay =
        mainClauses.length > 0 && mainClauses.every((eff) => (eff.keywords ?? []).some((kw) => kw.keyword === "Delay"));
      if (hasDelay) {
        const trashIdx = player.trash.findIndex((c) => c.instanceId === instance.instanceId);
        if (trashIdx >= 0) {
          extractCardAt(player, Zone.Trash, trashIdx);
          instance.faceUp = false;
          insertCard(player, Zone.Delay, instance);
          deps.emit?.({
            kind: "cardsMoved",
            instanceIds: [instance.instanceId],
            from: Zone.Trash,
            to: Zone.Delay,
          });
        }
      }
      await activateOptionUsed?.();
    } finally {
      await deps.finishOptionResolution?.();
    }
  };
  await (costTriggers === undefined ? resolveOption() : costTriggers.activate(resolveOption));

  // Q6432: "when you use an Option" reactions activate only after the used Option's
  // [Main] effect has finished and the card has completed its post-use routing.  Firing
  // from inside the resolvingOption window made watchers observe a card in no area and
  // allowed their effects to resolve before the Option reached trash/delay/battle.
  // Carry the rules-relevant use cost: continuous/card-level modifiers have
  // already produced `passiveCost`, while BeforePayCost changes only payment.
  // This distinction implements BT10-032 Q1956/Q1957.
  if (activateOptionUsed === undefined) await deps.fireOptionUsed?.(instance.instanceId, optionUseCost);

  return {
    ok: true,
    outcome: {
      cardId: instance.cardId,
      instanceId: instance.instanceId,
      mode,
      cost,
    },
  };
}

/**
 * Default, source-faithful memory implementation play-card can run against in
 * isolation (and a sensible fallback). The canonical owner of memory math is the
 * `memory-gauge` subsystem (MemoryGauge.ts); a real GameEngine passes that in. The
 * convention matches the Aegis schema: the shared gauge is positive-favors-turnSeat,
 * clamped [-10, 10], and the active seat spends by moving the gauge toward the
 * opponent's side. Identical math to the sibling digivolve action's defaults so the
 * two verbs cannot diverge on cost.
 *
 * A real GameEngine injects MemoryGauge.maxCostFor / .pay; this default is only
 * for standalone runs and tests.
 */
export const defaultPlayCardDeps: Pick<PlayCardDeps, "maxAffordable" | "payMemory"> = {
  maxAffordable(state: GameState, seat: Seat): number {
    // Remaining distance the seat can push the gauge toward its opponent's extreme.
    return seat === state.turnSeat ? state.memory + MEMORY_MAX : MEMORY_MAX - state.memory;
  },
  payMemory(state: GameState, seat: Seat, cost: number): void {
    const delta = seat === state.turnSeat ? -cost : cost;
    state.memory = Math.max(MEMORY_MIN, Math.min(MEMORY_MAX, state.memory + delta));
  },
};

const MEMORY_MAX = 10;
const MEMORY_MIN = -10;

// --- pure helpers (play-card-scoped; nothing here mutates other zones) ---

/**
 * Which play mode a card uses, or undefined when it cannot be played from hand by
 * this verb. A Digimon or Tamer is played as a permanent; a (non-permanent) Option
 * resolves then trashes. A DigiEgg is never played from hand. A DUAL card (kinds
 * include BOTH a permanent kind and Option) can only be used as an Option here;
 * its Digimon side can digivolve but cannot be played (CR 7-1-1).
 */
function playModeOf(kinds: readonly CardKind[], useAs?: "digimon" | "option"): PlayMode | undefined {
  const hasPermanent = kinds.includes(CardKind.Digimon) || kinds.includes(CardKind.Tamer);
  const hasOption = kinds.includes(CardKind.Option);
  if (hasOption) return useAs === "digimon" ? undefined : "option";
  if (hasPermanent) return "permanent";
  return undefined;
}

/** -1 sentinel (no play cost) is paid as 0 (source HasPlayCost). */
function normalizeCost(playCost: number): number {
  return playCost < 0 ? 0 : playCost;
}

/**
 * Locate a card instance in a seat's hand and report its index, or undefined when it
 * is not there (the `playCard` intent in API-CONTRACT carries a hand instanceId).
 */
function findInHand(player: PlayerState, instanceId: string): { instance: CardInstance; index: number } | undefined {
  const index = player.hand.findIndex((c) => c.instanceId === instanceId);
  if (index < 0) return undefined;
  const instance = player.hand[index];
  if (instance === undefined) return undefined;
  return { instance, index };
}

/**
 * Remove and return the hand instance at `index`. Splicing keeps the ArraySchema
 * indices consistent for Colyseus delta sync.
 */
function takeFromHand(player: PlayerState, index: number): CardInstance | undefined {
  return extractCardAt(player, Zone.Hand, index);
}

/**
 * Create a new battle-area Permanent for a freshly played Digimon/Tamer and append
 * it to the controller's battle area. DP is seeded from the definition for Digimon
 * (0 for Tamers; continuous DP modifiers are a separate advanced subsystem). The
 * card enters unsuspended and not in breeding (rule implementation isTapped=false,
 * isBreedingArea=false).
 */
function placePermanent(
  deps: PlayCardDeps,
  player: PlayerState,
  instance: CardInstance,
  definition: CardDefinition,
): Permanent {
  const permanent = new Permanent();
  permanent.permanentId = deps.nextPermanentId();
  permanent.controllerSeat = player.seat;
  setTopCard(permanent, instance);
  permanent.stack = new ArraySchema<CardInstance>();
  permanent.linked = new ArraySchema<CardInstance>();
  const dp = definition.kinds.includes(CardKind.Digimon) ? dpOf(definition) : 0;
  permanent.baseDP = dp;
  permanent.currentDP = dp;
  permanent.isSuspended = false;
  permanent.inBreeding = false;
  appendPermanent(player, permanent);
  deps.recomputeDP?.(permanent.permanentId);
  return permanent;
}

function isValidTargetSlot(targetSlot?: number): boolean {
  return targetSlot === undefined || (Number.isSafeInteger(targetSlot) && targetSlot >= 0);
}
