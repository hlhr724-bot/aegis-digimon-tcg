import {
  appFusionCostFor,
  CardKind,
  EffectTiming,
  Phase,
  Zone,
  type CardColor,
  type CardInstance,
  type CardDefinition,
  type DigivolutionRequirement,
  type DigivolveMechanic,
  type EvoCost,
  type GameState,
  type Permanent,
  type Seat,
  type ServerEvent,
  type ZoneRef,
  nameIncludesToken,
} from "@aegis/shared";
import {
  cardHasTrait,
  definitionOf,
  dpOf,
  isDigimon,
  isTamer,
  lookupDefinition,
  matchingAlternateDigivolutionRequirement,
  matchingEvoCost,
  matchingEvoCostIgnoringColor,
  tamerBaseTreatment,
} from "../cards/cardData.js";
import {
  findOwnedPermanent,
  findInHand,
  playerAt,
  pushDigivolution,
  moveLinkOntoStack,
  takeFromHand,
  zoneOfInstance,
} from "./digivolveState.js";

/**
 * The `digivolve` verb (subsystem: digivolve).
 *
 * Stack a higher-level Digimon from hand onto an existing permanent that meets an
 * EvoCost (color + level), pay the digivolve cost, draw 1, carry the base
 * permanent's suspended state onto the new top, and fire the When Digivolving
 * timing through the effect stack. Manages the digivolution-card stack that grants
 * inherited (ESS) effects.
 *
 *  - EvoCost match + legality: documented behavior (`EvoCosts`, `CanEvolve`,
 *    `CanPlayCardTargetFrame`); the printed color+level test at documented behavior ~596-604.
 *  - Placement + draw + suspended carry: documented behavior (the play/evolve path:
 *    `AddCardSource`, `oldIsTapped_playCard`/`IsSuspended`, the post-evolve
 *    `DigivolveCount_ThisTurn++` then `new rule implementation(owner, 1).Draw()`).
 *  - Max payable memory: documented behavior `MaxMemoryCost`.
 *  - When Digivolving timing: documented behavior.
 *
 * Server-authoritative and platform-independent: no presentation and transport.
 * The functions below are pure with respect to their inputs — `validateDigivolve`
 * mutates nothing; `applyDigivolve` mutates only the passed schema instances and
 * delegates side effects (draw, effect-stack firing, event emission) to injected
 * dependencies so this module neither duplicates nor pre-empts the memory-gauge,
 * effect-primitives, or effect-stack-resolution subsystems.
 */

/** The narrowed intent this action handles (mirrors @aegis/shared Intent variant). */
export interface DigivolveIntent {
  type: "digivolve";
  permanentId: string;
  instanceId: string;
  /** When true AND both the printed EvoCost AND an alternate digivolution requirement
   * match, use the alternate requirement's cost instead of the printed one. When only
   * one path matches, that path is always used regardless of this flag. */
  useAlternateCost?: boolean;
  /** @deprecated Use `appFusionLinkInstanceId`. Retained for existing clients and recorded replays. */
  appFusionLinkedInstanceId?: string;
  /** Explicit server-validated alternate path. Indexes `digivolutionRequirementsFor(cardId)`. */
  alternateRequirementIndex?: number;
  /** Explicitly activate the card's ＜Blast Digivolve＞ cost waiver. Omitted for normal evolution. */
  useBlastDigivolve?: boolean;
  /** Explicit App Fusion material; must be linked to this battle-area Digimon. */
  appFusionLinkInstanceId?: string;
}

/** Stable rejection reasons (subset of the API-CONTRACT intent-validation vocabulary). */
export type DigivolveRejection =
  | "not-your-turn"
  | "wrong-phase"
  | "decision-pending"
  | "game-over"
  | "no-such-player"
  | "card-not-in-zone"
  | "no-such-permanent"
  | "not-controller"
  | "not-a-digimon"
  | "invalid-evolution"
  | "insufficient-memory";

/**
 * Which digivolution mechanic the validated path represents, for the client's cut-in tier.
 * Read off the same booleans `applyDigivolve` pays the cost from, so the announcement and the
 * payment can never describe different mechanics.
 *
 * Exported so the ordering is a unit-testable contract rather than an unobservable
 * branch inside the apply path.
 *
 * Ordered most specific first. ＜Burst Digivolve＞ outranks a ＜Blast Digivolve＞ waiver because
 * a burst is the grander beat and the waiver may accompany it; `usedBaseGranted` outranks the
 * generic alternate because a base-granted path bypasses the alternate handling entirely.
 * Armor and X-Antibody are NOT distinguishable here: the card compiler collapses every
 * "digivolve from [ExactCard]" path into the same gateless alternate requirement, so they
 * report `alternate` rather than a guess.
 */
export function digivolveMechanicOf(check: Extract<DigivolveCheck, { ok: true }>): DigivolveMechanic {
  if (check.appFusionLink !== undefined) return "appFusion";
  if (check.usedAlternate && check.altRequirement?.burstDigivolve) return "burst";
  if (check.blastWaived) return "blast";
  if (check.usedBaseGranted) return "baseGranted";
  if (check.usedAlternate) return "alternate";
  return "normal";
}

/** Result of validating a digivolve intent without mutating anything. */
export type DigivolveCheck =
  | { ok: false; reason: DigivolveRejection }
  | {
      ok: true;
      /** The permanent being digivolved. */
      permanent: Permanent;
      /** The hand instance becoming the new top, and its hand index. */
      evolving: CardInstance;
      evolvingIndex: number;
      /** The chosen linked material when declaring the App Fusion procedure. */
      appFusionLink?: CardInstance;
      /** Static definition of the evolving card. */
      definition: CardDefinition;
      /** The EvoCost entry satisfied by the base permanent's top card (printed color+level path). */
      evoCost?: EvoCost;
      /** The alternate digivolution requirement satisfied (trait/name/text-gated path).
       * Present even when evoCost also matched, so callers can detect the multi-path case. */
      altRequirement?: DigivolutionRequirement;
      /** True when the cost path actually used is the alternate requirement (not the printed
       * EvoCost) — drives the alternate placement-cost payment in applyDigivolve. */
      usedAlternate: boolean;
      /** True when the path used is a base-granted digivolve (ST7-03/BT6-060) — bypasses the
       * printed color+level requirement and the alternate placement/Digisorption handling. */
      usedBaseGranted: boolean;
      /** True when the evolving card's ＜Blast Digivolve＞/＜Blast DNA Digivolve＞ keyword waives
       * the memory cost (§16-26-1/§16-31-1) — skips every other cost modifier in applyDigivolve. */
      blastWaived: boolean;
      /** Memory to pay = the chosen path's cost. */
      cost: number;
      /** Printed/unmodified memory cost for the chosen path. */
      printedCost: number;
      /** The Digimon a Tamer base digivolves as, when it digivolves as if it is one (KB Q1157). */
      baseAsDigimon: CardDefinition | undefined;
    };

/**
 * Injected side-effect dependencies. Each is owned by a sibling subsystem; the
 * defaults below keep digivolve runnable and unit-testable in isolation, and a
 * real GameEngine passes its own (the canonical memory gauge, the draw primitive,
 * the effect stack, the event emitter). This is the seam that keeps the package
 * boundaries clean (ARCHITECTURE.md section 3).
 */
export interface DigivolveDeps {
  grantedBaseExactNames?(state: GameState, permanent: Permanent): readonly string[];
  /**
   * Max memory the active seat may spend right now (source Player.MaxMemoryCost).
   * Returns how far the gauge can still travel toward the opponent's side.
   */
  maxAffordable(state: GameState, seat: Seat): number;
  /** Spend `cost` memory for `seat` (source cost payment; moves the shared gauge). */
  payMemory(state: GameState, seat: Seat, cost: number): void;
  adjustedDigivolveCost?(
    state: GameState,
    target: Permanent,
    base: number,
    into?: CardDefinition,
    opts?: { consumeOnce?: boolean; costDelta?: number },
  ): number;
  /** A matching would-digivolve interruption resolves before final affordability is checked. */
  deferAffordabilityForWouldDigivolve?(state: GameState, seat: Seat, target: Permanent, into: CardDefinition): boolean;
  /** Resolve effects on the in-hand card that pay a cost to reduce this digivolution. */
  prepareDigivolveCost?(
    state: GameState,
    seat: Seat,
    target: Permanent,
    evolving: CardInstance,
    into: CardDefinition,
  ): Promise<void>;
  /** Potential optional reduction, used only to avoid rejecting an otherwise-affordable digivolve. */
  potentialInteractiveDigivolveReduction?(
    state: GameState,
    seat: Seat,
    target: Permanent,
    into: CardDefinition,
    baseAsDigimon?: CardDefinition,
  ): number;
  /** Prompt for and pay optional costs immediately before paying this digivolve's memory cost. */
  activateInteractiveDigivolveReduction?(
    state: GameState,
    seat: Seat,
    target: Permanent,
    into: CardDefinition,
    evolvingInstanceId: string,
    baseAsDigimon?: CardDefinition,
  ): Promise<number>;
  /**
   * Whether the evolving instance's color requirement is currently waived
   * (WaiveColorRequirement). Optional: when absent no waiver applies. When true, the EvoCost
   * is matched on level alone (the base's color is ignored) — the minimal observable consumer
   * of the color-waiver store at the digivolve site (CONTEXT.md LOCKED Q3). The engine binds
   * this to `continuous.hasColorWaiver(instance.instanceId)`.
   */
  colorWaived?(state: GameState, instance: CardInstance): boolean;
  /**
   * The base permanent's complete EFFECTIVE color set for the EvoCost color test: printed
   * colors or the colors an original-color rewrite imposed (EX13-031 "white"), plus any
   * "also treated as <color>" grant (KB BT3-040 Q1075). Optional: when absent
   * only the printed colors gate the EvoCost. The engine binds this to
   * `effectiveColorsOf(permanent)`.
   */
  derivedBaseColors?(state: GameState, permanent: Permanent): readonly CardColor[];
  effectiveBaseDefinition?(state: GameState, permanent: Permanent): CardDefinition;
  /** Effective kinds before evolution, including effects that treat a Tamer as a Digimon. */
  effectiveBaseKinds?(state: GameState, permanent: Permanent): readonly CardKind[];
  /**
   * Whether `evolving` is an ALLOWED digivolve target for the base `permanent` under every active
   * positive "can only digivolve into [X]" constraint (EX10-035 digivolveExceptInto). Optional:
   * when absent no constraint applies (the base rule). Returns false to reject the digivolve. The
   * engine binds this to `continuous.digivolveIntoAllowed(permanent, definitionOf(evolving))`.
   */
  digivolveIntoAllowed?(state: GameState, permanent: Permanent, evolving: CardInstance): boolean;
  digivolveBaseRestricted?(state: GameState, permanent: Permanent, evolving: CardInstance): boolean;
  /**
   * Whether a "Digimon can't digivolve" rule stops the Tamer `permanent` digivolving as if it is
   * the Digimon `asDigimon` (KB Q1157).
   */
  digivolveLockedAsDigimon?(state: GameState, permanent: Permanent, asDigimon: CardDefinition): boolean;
  /**
   * Whether an alternate requirement's non-memory `placementCost` can currently be paid
   * (>= count matching cards across its `from` zones for `seat`). Consulted in validation
   * ONLY when the chosen path is an alternate requirement carrying a `placementCost`. Absent
   * => treated as payable (no placement gate; keeps the digivolve unit tests minimal). The
   * engine binds this to a generic counter over hand/trash. (BT7-112.)
   */
  alternatePlacementPayable?(state: GameState, seat: Seat, requirement: DigivolutionRequirement): boolean;
  /**
   * Pay an alternate requirement's `placementCost`: return `count` matching cards from its
   * `from` zones to the BOTTOM of the deck. `evolving` is the card being digivolved (still in
   * hand at payment time) — it is never placement material, and gives interactive
   * implementations their prompt context (KB BT7-112 Q1691: the player chooses which cards to
   * place and their order). Returns true when paid. Consulted in apply ONLY for an alternate
   * path carrying a `placementCost`. Absent => treated as paid.
   */
  payAlternatePlacement?(
    state: GameState,
    seat: Seat,
    requirement: DigivolutionRequirement,
    evolving: CardInstance,
  ): Promise<boolean>;
  /**
   * Whether a Burst Digivolve requirement's `burstDigivolve` Tamer-return cost can currently be
   * paid (a battle-area permanent named in `returnTamerNamesExact` controlled by `seat` exists).
   * Consulted in validation ONLY when the chosen path carries `burstDigivolve` (§8-3-3-2). Absent
   * => treated as payable.
   */
  burstDigivolveTamerPayable?(state: GameState, seat: Seat, requirement: DigivolutionRequirement): boolean;
  /**
   * Pay a Burst Digivolve requirement's Tamer-return cost (§8-3-3-2): return the matching
   * battle-area Tamer permanent the controller picks to hand BEFORE the digivolve cost is paid.
   * Returns true when paid. Consulted in apply ONLY for a path carrying `burstDigivolve`.
   * Absent => treated as paid.
   */
  payBurstDigivolveTamer?(
    state: GameState,
    seat: Seat,
    requirement: DigivolutionRequirement,
    evolving: CardInstance,
  ): Promise<boolean>;
  /**
   * A base-GRANTED digivolution path for digivolving `evolving` onto `base`: the reverse of the
   * normal model, sourced from a static effect on the BASE permanent that lets a specific card in
   * hand digivolve onto it for a fixed cost, ignoring the printed color/level requirement (ST7-03
   * "[Gallantmon] onto this Guilmon", BT6-060 "[Three Musketeers] Digimon onto this"). Returns the
   * granted cost when the base offers a path whose target predicate matches `evolving` AND whose
   * activation condition currently holds; undefined otherwise. The engine binds this to the
   * BASE_GRANTED_DIGIVOLVE table + a live condition/battle-area check. Absent => no such path.
   */
  baseGrantedDigivolve?(
    state: GameState,
    seat: Seat,
    base: Permanent,
    evolving: CardDefinition,
    sourceZone?: ZoneRef,
  ): { cost: number } | undefined;
  /**
   * Whether `evolving`'s printed keyword waives this digivolve's memory cost entirely
   * (＜Blast Digivolve＞/＜Blast DNA Digivolve＞, Comprehensive Rules §16-26-1/§16-31-1: "digivolve
   * ... without paying the cost" — the printed digivolution requirement (EvoCost/altRequirement
   * match) still applies, only the memory payment is waived). Optional: when absent no waiver
   * applies. The engine binds this to `hasBlastDigivolveKeyword(instance.cardId)`.
   */
  costWaived?(state: GameState, instance: CardInstance): boolean;
  /** Whether the defending seat currently owns the open Counter Timing window for Blast Digivolve. */
  blastWindowAllowed?(state: GameState, seat: Seat): boolean;
  /**
   * The POTENTIAL ＜Digisorption -N＞ cost reduction available when digivolving into `intoCardId`
   * (Comprehensive Rules §16-10): N when the card has ＜Digisorption＞ AND a Digimon is currently
   * suspendable to pay it (the controller's own Digimon, or — while an eligible redirector like
   * BT3-056 is on the controller's battle area — an opponent's Digimon), else 0. Used by the
   * affordability gate so a digivolve that is legal ONLY with the reduction is not rejected.
   * Pure read — does NOT prompt or suspend. Absent => no ＜Digisorption＞ path (base rule).
   */
  digisorptionReduction?(state: GameState, seat: Seat, intoCardId: string): number;
  /**
   * Interactively pay a ＜Digisorption＞ suspend for the digivolve into `intoCardId`: prompt the
   * controller, and on accept suspend 1 eligible Digimon (their own, or an opponent's via the
   * BT3-056 redirect), firing the suspend's `whenSuspended` window. Returns the cost reduction
   * actually obtained (N when a suspend was paid, 0 when declined or none available). Run in
   * apply, BEFORE the evolving card is stacked and before the memory cost is paid (the
   * digivolution is declared but not complete). Absent => no reduction (base rule).
   */
  payDigisorption?(state: GameState, seat: Seat, into: CardInstance, target: Permanent): Promise<number>;
  /**
   * Resolve mandatory "when this Digimon would digivolve" bodies after declaration and
   * before any digivolution cost is paid (BT8-024, KB Q1714). The target is still the
   * pre-digivolution permanent, so self-anchored reactions can inspect their printed source.
   */
  fireWouldDigivolve?(state: GameState, seat: Seat, permanent: Permanent, into: CardDefinition): Promise<void>;
  /**
   * Hold the watchers triggered while the declared digivolution is paid for (interrupt, placement
   * and ＜Digisorption＞ costs). They activate once it completes, in one batch with its
   * [When Digivolving] effects (KB Q3999), or right after an attempt that fails.
   */
  holdCostTriggers?(): DigivolveCostTriggers;
  /** Draw `n` cards for `seat` (source rule implementation(owner, n).Draw()). */
  draw(state: GameState, seat: Seat, n: number): Promise<CardInstance[]>;
  /** Reapply duration-scoped DP modifiers after the evolving top changes its printed base DP. */
  recomputeDP?(state: GameState, permanentId: string): void;
  /** Move duration-scoped effects granted to the Digimon onto its new top card. */
  reanchorGrantedEffects?(priorTopInstanceId: string, newTopInstanceId: string): void;
  /**
   * Fire the When Digivolving timing for the just-digivolved permanent through the
   * effect stack (subsystem: effect-stack-resolution). Async because resolution may
   * await player decisions (ARCHITECTURE.md section 5).
   */
  fireWhenDigivolving(
    state: GameState,
    seat: Seat,
    permanent: Permanent,
    previousLevel?: number,
    baseWasDigimon?: boolean,
    isDnaDigivolve?: boolean,
  ): Promise<void>;
  /** Optional narration hook (server -> client event log). */
  emit?: (event: DigivolveEvent) => void;
}

export interface DigivolveCostTriggers {
  /** Stop holding; watchers triggered from now on activate as usual. */
  stopHolding(): void;
  /** Activate the held watchers once, folded into `window`'s own triggers when one is given. */
  activate(window?: () => Promise<void>): Promise<void>;
}

/** Events this action narrates (subset of @aegis/shared ServerEvent). */
export type DigivolveEvent = Extract<ServerEvent, { kind: "digivolved" | "memoryChanged" | "cardsMoved" }>;

/** What applyDigivolve produced (for the caller / tests / event log). */
export interface DigivolveOutcome {
  permanentId: string;
  newTopCardId: string;
  /** The card pushed under the new top (the immediate digivolution source). */
  priorTopInstanceId: string;
  cost: number;
  drawnInstanceIds: string[];
  /** Suspended state carried from base to the new top. */
  carriedSuspended: boolean;
}

/**
 * The loose cards (hand/trash, per the requirement's `from` zones) that satisfy an alternate
 * requirement's `placementCost` predicate: a card whose kind is in `kinds` OR that carries a
 * trait in `traits` (BT7-112: Tamer cards OR [Hybrid]-trait cards). Hand is enumerated before
 * trash so the deterministic server pick is stable.
 */
export function alternatePlacementCards(
  state: GameState,
  seat: Seat,
  requirement: DigivolutionRequirement,
): CardInstance[] {
  const spec = requirement.placementCost;
  const player = playerAt(state, seat);
  if (spec === undefined || player === undefined) return [];
  const wantedKinds = (spec.kinds ?? []).map((kind) => CardKind[kind]);
  const matches = (cardId: string): boolean => {
    const definition = lookupDefinition(cardId);
    if (definition === undefined) return false;
    return (
      wantedKinds.some((kind) => definition.kinds.includes(kind)) ||
      (spec.traits ?? []).some((trait) => cardHasTrait(definition, trait))
    );
  };
  const cards: CardInstance[] = [];
  for (const zone of spec.from) {
    for (const card of zone === "hand" ? player.hand : player.trash) if (matches(card.cardId)) cards.push(card);
  }
  return cards;
}

function controlsRequiredPermanents(
  state: GameState,
  seat: Seat,
  gate: NonNullable<DigivolutionRequirement["controllerControls"]>,
): boolean {
  const matching = (playerAt(state, seat)?.battleArea ?? []).filter((permanent) => {
    const definition = definitionOf(permanent.topCard);
    if (gate.kind && gate.kind.length > 0 && !gate.kind.some((kind) => definition.kinds.includes(kind as CardKind))) {
      return false;
    }
    if (gate.namesExact && gate.namesExact.length > 0 && !gate.namesExact.includes(definition.nameEn)) {
      return false;
    }
    if (gate.names && gate.names.length > 0 && !gate.names.some((name) => nameIncludesToken(definition.nameEn, name))) {
      return false;
    }
    if (gate.traits && gate.traits.length > 0 && !gate.traits.some((trait) => cardHasTrait(definition, trait))) {
      return false;
    }
    return true;
  }).length;
  return matching >= (gate.min ?? 1);
}

/**
 * Evaluate the live gates attached to an alternate digivolution requirement. Every
 * digivolution through the path must pass them, whether a player declares it or an effect
 * performs it (KB BT2-111 Q1043, BT7-112 Q1686, BT14-101 Q2484).
 */
export function alternateRequirementAvailable(
  state: GameState,
  seat: Seat,
  permanent: Permanent,
  requirement: DigivolutionRequirement,
): boolean {
  if (requirement.battleAreaOnly === true && permanent.inBreeding) return false;
  if (
    requirement.controllerTrashCountMin !== undefined &&
    (playerAt(state, seat)?.trash.length ?? 0) < requirement.controllerTrashCountMin
  ) {
    return false;
  }
  if (
    requirement.placementCost !== undefined &&
    alternatePlacementCards(state, seat, requirement).length < requirement.placementCost.count
  ) {
    return false;
  }
  if (
    requirement.controllerControls !== undefined &&
    !controlsRequiredPermanents(state, seat, requirement.controllerControls)
  ) {
    return false;
  }
  const opponentDigimonDpMin = requirement.opponentDigimonDpMin;
  if (opponentDigimonDpMin !== undefined) {
    const opponentSeat = seat === 0 ? 1 : 0;
    const opponent = playerAt(state, opponentSeat);
    if (
      opponent === undefined ||
      !opponent.battleArea.some((candidate) => {
        const top = candidate.topCard;
        return top !== undefined && isDigimon(definitionOf(top.cardId)) && candidate.currentDP >= opponentDigimonDpMin;
      })
    ) {
      return false;
    }
  }
  if (requirement.minNameStackNames !== undefined) {
    const requiredNames = requirement.minNameStackNames;
    const matching = permanent.stack.filter((card) => {
      const name = definitionOf(card.cardId).nameEn;
      return requiredNames.some((required) =>
        requirement.minNameStackMatch === "contains" ? nameIncludesToken(name, required) : name === required,
      );
    }).length;
    if (matching < (requirement.minNameStackCount ?? 1)) return false;
  }
  if (requirement.minTraitStackCount !== undefined) {
    const wantedTraits = requirement.minTraitStackTraits ?? [];
    const matching = permanent.stack.filter((card) =>
      wantedTraits.some((trait) => cardHasTrait(definitionOf(card.cardId), trait)),
    ).length;
    if (matching < requirement.minTraitStackCount) return false;
  }
  if (requirement.requiredDigivolutionCardCount !== undefined) {
    const { trait, min } = requirement.requiredDigivolutionCardCount;
    const matching = permanent.stack.filter((card) => cardHasTrait(definitionOf(card.cardId), trait)).length;
    if (matching < min) return false;
  }
  const condition = requirement.whileCondition;
  if (condition === undefined) return true;
  if (condition.kind !== "zoneCount" || condition.value === undefined) return false;
  const targetSeat = condition.seat === "opponent" ? (seat === 0 ? 1 : 0) : seat;
  const player = playerAt(state, targetSeat);
  if (player === undefined) return false;
  const count =
    condition.zone === "trash"
      ? player.trash.length
      : condition.zone === "hand"
        ? player.hand.length
        : condition.zone === "security"
          ? player.security.length
          : 0;
  if (condition.op === "gte") return count >= condition.value;
  if (condition.op === "lte") return count <= condition.value;
  return count === condition.value;
}

/**
 * Validate a digivolve intent against current authoritative state. Pure: mutates
 * nothing. Checks run in the API-CONTRACT order (seat/turn/phase -> open-decision
 * -> legality), rejecting with a stable reason on the first failure.
 *
 * `requireMainPhase` defaults to true (digivolve is a Main-phase verb). The
 * target permanent may be in the battle area or the breeding area; both are
 * legal digivolve targets during the Main phase.
 */
export function validateDigivolve(
  state: GameState,
  seat: Seat,
  intent: DigivolveIntent,
  deps: Pick<
    DigivolveDeps,
    | "maxAffordable"
    | "adjustedDigivolveCost"
    | "deferAffordabilityForWouldDigivolve"
    | "colorWaived"
    | "derivedBaseColors"
    | "effectiveBaseDefinition"
    | "digivolveIntoAllowed"
    | "digivolveBaseRestricted"
    | "digivolveLockedAsDigimon"
    | "effectiveBaseKinds"
    | "alternatePlacementPayable"
    | "burstDigivolveTamerPayable"
    | "digisorptionReduction"
    | "potentialInteractiveDigivolveReduction"
    | "grantedBaseExactNames"
    | "baseGrantedDigivolve"
    | "costWaived"
    | "blastWindowAllowed"
  >,
  options: { deferAffordability?: boolean } = {},
): DigivolveCheck {
  // 1. Game state gates.
  if (state.gameOver) return { ok: false, reason: "game-over" };
  if (state.pendingDecision !== undefined) return { ok: false, reason: "decision-pending" };
  const blastRequested = intent.useBlastDigivolve === true;
  if (blastRequested) {
    if (deps.blastWindowAllowed?.(state, seat) !== true) return { ok: false, reason: "wrong-phase" };
  } else {
    if (state.turnSeat !== seat) return { ok: false, reason: "not-your-turn" };
    if (state.phase !== Phase.Main) return { ok: false, reason: "wrong-phase" };
  }

  const player = playerAt(state, seat);
  if (player === undefined) return { ok: false, reason: "no-such-player" };

  // 2. The evolving card must be in this seat's hand.
  const found = findInHand(player, intent.instanceId);
  if (found === undefined) {
    // Distinguish "owned but elsewhere" from "unknown" for a clearer reason.
    const zone = zoneOfInstance(player, intent.instanceId);
    void zone; // both collapse to card-not-in-zone; kept for future granularity
    return { ok: false, reason: "card-not-in-zone" };
  }

  // 3. The target permanent must be owned by this seat (battle area or breeding area).
  const permanent = findOwnedPermanent(player, intent.permanentId);
  if (permanent === undefined) return { ok: false, reason: "no-such-permanent" };
  if (permanent.controllerSeat !== seat) return { ok: false, reason: "not-controller" };

  //     BT13-008) cannot be digivolved onto, even when a requirement and the cost would match.
  if (deps.digivolveBaseRestricted?.(state, permanent, found.instance) === true) {
    return { ok: false, reason: "invalid-evolution" };
  }

  const definition = definitionOf(found.instance.cardId);
  // Only a Digimon card can digivolve onto a permanent (source CanSelectCardCondition: cardSource.IsDigimon).
  if (!isDigimon(definition)) return { ok: false, reason: "not-a-digimon" };

  // 4. EvoCost legality: the base permanent's top card must satisfy a printed
  //    color+level requirement of the evolving card (documented behavior CanEvolve). When the
  //    evolving card's color requirement is waived (WaiveColorRequirement, LOCKED Q3) the
  //    color is dropped and the entry is matched on level alone — the observable consumer
  //    of the color-waiver store at the digivolve site.
  //    trait/name/text-gated paths that bypass the color test entirely. Both paths are
  //    checked independently — a card like BT24-009 can satisfy BOTH a printed EvoCost
  //    AND an alternate requirement on the same base. The intent's `useAlternateCost`
  //    flag picks which path to use when both match; when only one matches it is always
  //    used regardless of the flag.
  const baseDef = deps.effectiveBaseDefinition?.(state, permanent) ?? definitionOf(permanent.topCard.cardId);
  const appFusionLinkInstanceId = intent.appFusionLinkInstanceId ?? intent.appFusionLinkedInstanceId;
  const appFusionRequested = appFusionLinkInstanceId !== undefined;
  const appFusionLink = appFusionRequested
    ? permanent.linked.find((card) => card.instanceId === appFusionLinkInstanceId)
    : undefined;
  const appFusionCost =
    appFusionLink === undefined
      ? undefined
      : appFusionCostFor(definition.cardId, {
          topNames: [baseDef.nameEn, ...(deps.grantedBaseExactNames?.(state, permanent) ?? [])],
          linkedNames: [definitionOf(appFusionLink.cardId).nameEn],
        });
  // An explicit fusion declaration must never fall back to a normal evolution.
  if (
    appFusionRequested &&
    (permanent.inBreeding ||
      !isDigimon(baseDef) ||
      appFusionCost === undefined ||
      intent.useAlternateCost === true ||
      intent.alternateRequirementIndex !== undefined ||
      blastRequested)
  ) {
    return { ok: false, reason: "invalid-evolution" };
  }
  // The base permanent's EFFECTIVE colors gate the EvoCost color test: an original-color
  // rewrite replaces the printed colors and an "also treated as <color>" grant adds to them
  // (KB BT3-040 Q1075). The waiver path drops the color test entirely.
  const derivedBaseColors = deps.derivedBaseColors?.(state, permanent);
  const evoCost = appFusionRequested
    ? undefined
    : deps.colorWaived?.(state, found.instance)
      ? matchingEvoCostIgnoringColor(definition, baseDef)
      : matchingEvoCost(definition, baseDef, derivedBaseColors);
  const matchedAlternateRequirement = matchingAlternateDigivolutionRequirement(definition, baseDef, {
    grantedBaseExactNames: deps.grantedBaseExactNames?.(state, permanent),
    ...(intent.alternateRequirementIndex === undefined ? {} : { requirementIndex: intent.alternateRequirementIndex }),
    isBlastDigivolve: intent.useBlastDigivolve === true,
  });
  const altRequirement =
    !appFusionRequested &&
    matchedAlternateRequirement !== undefined &&
    alternateRequirementAvailable(state, seat, permanent, matchedAlternateRequirement)
      ? matchedAlternateRequirement
      : undefined;
  // An explicit path is a declaration, not a preference. Never silently fall back to a
  // printed/other alternate route when the requested index is absent or fails its live gates.
  if (intent.alternateRequirementIndex !== undefined && altRequirement === undefined) {
    return { ok: false, reason: "invalid-evolution" };
  }
  // Base-GRANTED path (ST7-03/BT6-060): a static on the BASE permanent lets this specific card
  // digivolve onto it for a fixed cost, ignoring the printed color/level requirement. An
  // independent third path — legal even when neither the EvoCost nor an alternate requirement match.
  const baseGranted = appFusionRequested
    ? undefined
    : deps.baseGrantedDigivolve?.(state, seat, permanent, definition, "hand");

  if (
    evoCost === undefined &&
    altRequirement === undefined &&
    baseGranted === undefined &&
    appFusionCost === undefined
  ) {
    return { ok: false, reason: "invalid-evolution" };
  }

  // 4b. Positive digivolve-target constraint (EX10-035 "can only digivolve into [Apocalymon]",
  //     digivolveExceptInto): when an active constraint on the base permanent rejects this evolving
  //     card, the digivolve is illegal even though a requirement matched.
  if (deps.digivolveIntoAllowed?.(state, permanent, found.instance) === false) {
    return { ok: false, reason: "invalid-evolution" };
  }

  // 5. Affordability: pick the cost path. When both match, `useAlternateCost` selects the
  //    alternate requirement; otherwise the printed EvoCost is used. When only one path
  //    matches, that path is always used regardless of the flag.
  const useAlt =
    (intent.useAlternateCost === true || intent.alternateRequirementIndex !== undefined) &&
    altRequirement !== undefined;
  // The path actually used is the alternate requirement when it is the only match, or when
  // both match and the intent selected it.
  const usedAlternate = !appFusionRequested && altRequirement !== undefined && (evoCost === undefined || useAlt);
  // The base-granted path is used only when it is the sole match (no printed EvoCost or alternate
  // requirement applies) — those normal paths take precedence when present.
  const usedBaseGranted =
    !appFusionRequested && evoCost === undefined && altRequirement === undefined && baseGranted !== undefined;
  // KB Q1157/Q2724: a Tamer digivolving "as if it is a level N Digimon" is a Digimon that
  // digivolves, so a Digimon can't-digivolve rule blocks that route. A named Tamer requirement
  // on such a card stays legal under the rule, but then the Tamer digivolves as a Tamer.
  let baseAsDigimon: CardDefinition | undefined;
  const baseIsTamer =
    isTamer(baseDef) && !(deps.effectiveBaseKinds?.(state, permanent) ?? baseDef.kinds).includes(CardKind.Digimon);
  if (usedAlternate && baseIsTamer) {
    const treatment = tamerBaseTreatment(definition.cardId, altRequirement!);
    if (treatment.kind !== "asTamer") {
      const asDigimon = {
        ...baseDef,
        kinds: [CardKind.Digimon],
        level: treatment.level,
        colors: [...(derivedBaseColors ?? baseDef.colors)],
      };
      const locked = deps.digivolveLockedAsDigimon?.(state, permanent, asDigimon) === true;
      if (locked && treatment.kind === "asDigimon") return { ok: false, reason: "invalid-evolution" };
      if (!locked) baseAsDigimon = asDigimon;
    }
  }
  // One of evoCost / altRequirement / baseGranted is guaranteed defined (we rejected the
  // all-undefined case above). `useAlt` only activates when altRequirement is non-null.
  const printed: number = (() => {
    if (appFusionCost !== undefined) return appFusionCost;
    if (useAlt) return altRequirement!.cost;
    if (evoCost) return evoCost.memoryCost;
    if (altRequirement) return altRequirement.cost; // only alternate matched
    return baseGranted!.cost; // only base-granted matched
  })();

  // 4c. Alternate non-memory placement cost (BT7-112): when the used path is an alternate
  //     requirement carrying a `placementCost`, the digivolve is legal only when that cost
  //     digivolution availability on the same count (hand+trash >= 10).
  if (usedAlternate && altRequirement!.placementCost) {
    if (deps.alternatePlacementPayable?.(state, seat, altRequirement!) === false) {
      return { ok: false, reason: "invalid-evolution" };
    }
  }
  // 4c-2. Burst Digivolve's non-memory Tamer-return cost (§8-3-3-2): legal only when a
  //       battle-area Tamer matching `burstDigivolve.returnTamerNamesExact` is available.
  if (usedAlternate && altRequirement!.burstDigivolve) {
    if (deps.burstDigivolveTamerPayable?.(state, seat, altRequirement!) === false) {
      return { ok: false, reason: "invalid-evolution" };
    }
  }
  // ＜Blast Digivolve＞/＜Blast DNA Digivolve＞ (§16-26-1/§16-31-1): "digivolve ... without paying
  // the cost" — the printed digivolution requirement checked above still gates legality, but the
  // memory cost is waived entirely (not merely reduced), skipping every other cost modifier.
  const blastWaived = intent.useBlastDigivolve === true && deps.costWaived?.(state, found.instance) === true;
  if (intent.useBlastDigivolve === true && !blastWaived) {
    return { ok: false, reason: "invalid-evolution" };
  }
  // `definition` is the card being digivolved INTO — passed so a "when digivolving into
  // this card" cost effect (BT7-040 / BT11-059) can match only this digivolve.
  const cost = blastWaived
    ? 0
    : deps.adjustedDigivolveCost
      ? Math.max(0, deps.adjustedDigivolveCost(state, permanent, printed, definition))
      : printed;
  // ＜Digisorption -N＞ (Comprehensive Rules §16-10): the controller MAY suspend a Digimon to
  // reduce this digivolution's cost by N. The reduction is only realized in apply (interactive),
  // but the affordability gate must account for it so a digivolve that is legal ONLY with the
  // reduction is not rejected here. The potential reduction is 0 when no Digimon is suspendable.
  const potentialDigisorption =
    usedAlternate || usedBaseGranted || blastWaived
      ? 0
      : (deps.digisorptionReduction?.(state, seat, definition.cardId) ?? 0);
  const potentialInteractive = permanent.inBreeding
    ? 0
    : (deps.potentialInteractiveDigivolveReduction?.(state, seat, permanent, definition, baseAsDigimon) ?? 0);
  const minCost = Math.max(0, cost - potentialDigisorption - potentialInteractive);
  const hasPreCostInterrupt =
    options.deferAffordability === true &&
    deps.deferAffordabilityForWouldDigivolve?.(state, seat, permanent, definition) === true;
  if (!hasPreCostInterrupt && deps.maxAffordable(state, seat) < minCost) {
    return { ok: false, reason: "insufficient-memory" };
  }

  return {
    ok: true,
    permanent,
    evolving: found.instance,
    evolvingIndex: found.index,
    definition,
    ...(appFusionLink === undefined ? {} : { appFusionLink }),
    evoCost: evoCost ?? undefined,
    altRequirement: altRequirement ?? undefined,
    usedAlternate,
    usedBaseGranted,
    blastWaived,
    cost,
    printedCost: printed,
    baseAsDigimon,
  };
}

/**
 * Apply a digivolve. Validates first (so it is safe to call directly), then mutates
 * authoritative state in the source order:
 *
 *   1. capture the base permanent's suspended state (documented behavior
 *      `oldIsTapped_playCard = permanent.IsSuspended`),
 *   2. remove the evolving card from hand and stack it onto the permanent — the
 *      prior top slides under the new top (`AddCardSource`),
 *   3. recompute base/current DP from the new top card's definition,
 *   4. carry the suspended state onto the new top (documented behavior restore
 *      `permanent.IsSuspended = permanent.oldIsTapped_playCard`),
 *   5. pay the digivolve cost (moves the shared memory gauge),
 *   6. draw 1 (`DigivolveCount_ThisTurn++` then rule implementation(owner, 1)),
 *   7. fire When Digivolving through the effect stack.
 *
 * Steps 5-7 are delegated to injected deps. Returns a structured outcome, or a
 * rejection if validation fails. Async because step 7 can await player decisions.
 */
export async function applyDigivolve(
  state: GameState,
  seat: Seat,
  intent: DigivolveIntent,
  deps: DigivolveDeps,
): Promise<{ ok: false; reason: DigivolveRejection } | { ok: true; outcome: DigivolveOutcome }> {
  const check = validateDigivolve(state, seat, intent, deps, { deferAffordability: true });
  if (!check.ok) return check;
  const costTriggers = deps.holdCostTriggers?.();
  try {
    return await digivolveDeclared(state, seat, intent, deps, check, costTriggers);
  } finally {
    costTriggers?.stopHolding();
    await costTriggers?.activate();
  }
}

async function digivolveDeclared(
  state: GameState,
  seat: Seat,
  intent: DigivolveIntent,
  deps: DigivolveDeps,
  check: Extract<DigivolveCheck, { ok: true }>,
  costTriggers: DigivolveCostTriggers | undefined,
): Promise<{ ok: false; reason: DigivolveRejection } | { ok: true; outcome: DigivolveOutcome }> {
  const { permanent, definition } = check;
  await deps.prepareDigivolveCost?.(state, seat, permanent, check.evolving, definition);
  // A ＜Blast Digivolve＞ waiver skips every other cost modifier (including consumeOnce-marked
  // continuous ones, which must NOT be spent on a digivolve that already pays nothing).
  const baseCost = check.blastWaived
    ? 0
    : deps.adjustedDigivolveCost
      ? Math.max(0, deps.adjustedDigivolveCost(state, permanent, check.printedCost, definition, { consumeOnce: true }))
      : check.cost;
  const interactiveReduction =
    check.blastWaived || permanent.inBreeding
      ? 0
      : ((await deps.activateInteractiveDigivolveReduction?.(
          state,
          seat,
          permanent,
          definition,
          check.evolving.instanceId,
          check.baseAsDigimon,
        )) ?? 0);
  const cost = Math.max(0, baseCost - interactiveReduction);
  const player = playerAt(state, seat)!;

  // Printed pre-digivolution reactions happen after a legal declaration but before every
  // payment step. They do not reopen legality or allow the declaration to be cancelled.
  await deps.fireWouldDigivolve?.(state, seat, permanent, definition);

  // Q3350: an interactive would-digivolve cost may delete the declared target itself. The
  // target object captured above is then detached from the authoritative board; cancel before
  // any placement, payment, draw, or When Digivolving processing. The evolving card is still in
  // hand at this point, so cancellation naturally leaves it there and the deletion stands.
  if (findOwnedPermanent(player, permanent.permanentId) !== permanent) {
    return { ok: false, reason: "invalid-evolution" };
  }

  // Q3348: the interruption above may grant a temporary effect before an inherited cost
  // increase makes the attempt unaffordable. Reject before touching hand/stack/memory so the
  // attempted card remains in hand while the granted turn-scoped effect remains visible.
  if (deps.maxAffordable(state, seat) < cost) return { ok: false, reason: "insufficient-memory" };

  // (0) Pay an alternate requirement's non-memory placement cost FIRST (BT7-112: return 10
  //     [Hybrid]/Tamer cards from hand+trash to the deck bottom). Done before the evolving
  //     card is taken from hand and may reindex the hand, so the evolving card is re-found by
  //     instanceId afterwards. The evolving card (a Digimon) is never placement material.
  if (check.usedAlternate && check.altRequirement?.placementCost) {
    const inHand = findInHand(player, intent.instanceId);
    if (inHand === undefined) return { ok: false, reason: "card-not-in-zone" };
    const paid = await deps.payAlternatePlacement?.(state, seat, check.altRequirement, inHand.instance);
    if (paid === false) return { ok: false, reason: "invalid-evolution" };
  }

  // (0b) Pay Burst Digivolve's non-memory Tamer-return cost (§8-3-3-2: the specified Tamer
  //      is returned from the battle area to hand BEFORE the digivolve cost is paid). The
  //      returned Tamer is a SEPARATE permanent from the evolving card (still in hand), so
  //      this never reindexes `player.hand` for the evolving-card lookup below.
  if (check.usedAlternate && check.altRequirement?.burstDigivolve) {
    const inHand = findInHand(player, intent.instanceId);
    if (inHand === undefined) return { ok: false, reason: "card-not-in-zone" };
    const paid = await deps.payBurstDigivolveTamer?.(state, seat, check.altRequirement, inHand.instance);
    if (paid === false) return { ok: false, reason: "invalid-evolution" };
  }

  // (0c) ＜Digisorption -N＞ resolves after the digivolution is declared but before it is
  //      complete. Pay its suspend cost while the evolving card is still in hand so inherited
  //      effects from the would-be stack are not active yet (BT10-048 Q1974). Doing this before
  //      the carried-state snapshot also preserves suspension when the base itself pays the cost.
  //      The alternate-requirement path does not offer Digisorption.
  const offersDigisorption =
    !check.usedAlternate &&
    !check.blastWaived &&
    deps.payDigisorption !== undefined &&
    (deps.digisorptionReduction?.(state, seat, definition.cardId) ?? 0) > 0;
  const digisorptionReduction = offersDigisorption
    ? await deps.payDigisorption!(state, seat, check.evolving, permanent)
    : 0;

  costTriggers?.stopHolding();

  // (1) Capture suspended state of the base before any mutation.
  const carriedSuspended = permanent.isSuspended;
  const previousDefinition = definitionOf(permanent.topCard);
  const previousLevel = previousDefinition?.level;
  const baseWasDigimon =
    check.baseAsDigimon !== undefined ||
    (deps.effectiveBaseKinds?.(state, permanent) ?? previousDefinition?.kinds ?? []).includes(CardKind.Digimon);

  // (2) Take the evolving card out of hand and stack it on. The prior top becomes
  //     the immediate digivolution source beneath the new top. Re-find by instanceId in case
  //     the placement-cost payment above reindexed the hand.
  const refound = findInHand(player, intent.instanceId);
  if (
    check.appFusionLink !== undefined &&
    !permanent.linked.some((card) => card.instanceId === check.appFusionLink!.instanceId)
  ) {
    return { ok: false, reason: "invalid-evolution" };
  }
  if (refound === undefined) return { ok: false, reason: "card-not-in-zone" };
  const finalCost = Math.max(0, cost - digisorptionReduction);
  const payCost = () => {
    if (finalCost <= 0) return;
    const memoryBefore = state.memory;
    deps.payMemory(state, seat, finalCost);
    deps.emit?.({ kind: "memoryChanged", from: memoryBefore, to: state.memory, reason: "digivolve" });
  };
  // CR 8-4-3-2 pays before either App Fusion material becomes a source.
  if (check.appFusionLink !== undefined) payCost();
  const evolving = refound !== undefined ? takeFromHand(player, refound.index) : undefined;
  if (evolving === undefined) {
    // Should be unreachable after validation; treated as a card-not-in-zone race.
    return { ok: false, reason: "card-not-in-zone" };
  }
  const priorTop = pushDigivolution(permanent, evolving);
  if (check.appFusionLink !== undefined) moveLinkOntoStack(permanent, check.appFusionLink.instanceId);
  deps.reanchorGrantedEffects?.(priorTop.instanceId, evolving.instanceId);
  // A manually declared digivolution replaces the current top's entry provenance; an
  // effect-driven digivolution uses the separate primitive seam and marks it afterward.
  permanent.enteredByEffect = false;
  deps.emit?.({
    kind: "cardsMoved",
    instanceIds: [evolving.instanceId],
    from: Zone.Hand,
    to: permanent.inBreeding ? Zone.Breeding : Zone.BattleArea,
  });
  // §8-3-2-1 pending processing (§18-1): a Burst Digivolve marks the permanent so the engine's
  // real OnEndTurn firing point trashes the card now stacked under its top — but only when this
  // turn's marker is still current (§8-3-2-2/3 are re-checked dynamically at that later point,
  // not here).
  if (check.usedAlternate && check.altRequirement?.burstDigivolve) {
    permanent.burstDigivolvePendingTrash = true;
  }

  // (3) Recompute DP from the new top's printed DP, preserving every duration-scoped
  //     modifier already attached to this Digimon. Effects target the permanent, not its
  //     current top card, so an earlier "this Digimon gets +N DP" survives a subsequent
  //     digivolution until its printed duration expires.
  const newBaseDP = dpOf(definition);
  permanent.baseDP = newBaseDP;
  permanent.currentDP = newBaseDP;
  deps.recomputeDP?.(state, permanent.permanentId);

  // (4) Carry suspended state onto the new top (a Digimon keeps suspended/unsuspended
  //     state across digivolution; rulebook + documented behavior restore).
  permanent.isSuspended = carriedSuspended;

  deps.emit?.({
    kind: "digivolved",
    seat,
    permanentId: permanent.permanentId,
    cardId: evolving.cardId,
    ...(evolving.artId ? { artId: evolving.artId } : {}),
    mechanic: digivolveMechanicOf(check),
    inBreeding: permanent.inBreeding,
  });

  // (4b) Apply the Digisorption reduction paid at (0c) to the memory cost. Declining the
  //      immediate effect produced 0, so the full cost is paid here.
  // (5) Pay the digivolve cost (shared memory gauge moves toward the opponent).
  if (check.appFusionLink === undefined) payCost();

  // (6) Draw 1 on digivolve.
  const drawn = await deps.draw(state, seat, 1);
  if (drawn.length > 0) {
    deps.emit?.({
      kind: "cardsMoved",
      instanceIds: drawn.map((c) => c.instanceId),
      from: Zone.Deck,
      to: Zone.Hand,
      seat,
      drawReason: "digivolution",
    });
  }

  // (7) Fire When Digivolving (and the inherited-stack ESS markers) through the
  //     effect stack. Anything optional pauses for a decision inside resolution.
  const fireWhenDigivolving = () => deps.fireWhenDigivolving(state, seat, permanent, previousLevel, baseWasDigimon);
  await (costTriggers === undefined ? fireWhenDigivolving() : costTriggers.activate(fireWhenDigivolving));

  return {
    ok: true,
    outcome: {
      permanentId: permanent.permanentId,
      newTopCardId: evolving.cardId,
      priorTopInstanceId: priorTop.instanceId,
      cost: finalCost,
      drawnInstanceIds: drawn.map((c) => c.instanceId),
      carriedSuspended,
    },
  };
}

/**
 * Minimal interface digivolve needs from the shared memory gauge — the faithful
 * `Player.MaxMemoryCost` query and the cost payment. The canonical implementation
 * is the `memory-gauge` subsystem (MemoryGauge.ts: `maxCostFor` / `pay`), which
 * uses the documented turn-relative convention. Adapting it here (rather than
 * re-deriving the math) means digivolve cannot drift from the gauge's model.
 */
export interface MemoryPort {
  maxCostFor(seat: Seat): number;
  pay(seat: Seat, cost: number): void;
}

/**
 * Build the memory portion of DigivolveDeps from anything satisfying MemoryPort
 * (in practice a MemoryGauge instance). Keeps digivolve decoupled from the gauge's
 * concrete class while delegating all memory math to its single owner.
 */
export function memoryDepsFromGauge(gauge: MemoryPort): Pick<DigivolveDeps, "maxAffordable" | "payMemory"> {
  return {
    maxAffordable: (_state, seat) => gauge.maxCostFor(seat),
    payMemory: (_state, seat, cost) => gauge.pay(seat, cost),
  };
}

/** Convenience: a card id is a Digimon (for callers building decision candidate lists). */
export function isDigivolveCandidate(cardId: string): boolean {
  const def = definitionOf(cardId);
  return def.kinds.includes(CardKind.Digimon);
}

/** The When Digivolving timing window this action fires (re-exported for callers). */
export const DIGIVOLVE_TIMING = EffectTiming.WhenDigivolving;
