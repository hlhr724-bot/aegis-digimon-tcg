import type { CardDefinition, Permanent, Seat, ZoneRef } from "@aegis/shared";
import type { EffectContext } from "./effectContext.js";
import type { RemovalCause } from "./triggers.js";

/** Events a replacement effect can intercept. */
export type ReplacementEventName =
  | "wouldLeavePlay"
  | "wouldBeDeleted"
  | "wouldBePlayed"
  | "wouldDigivolve"
  /**
   * A digivolution-card trash is about to select which cards to take from one or more host
   * permanents (BT10-084 Tactimon; KB Q2002-Q2008). Consulted BEFORE the specific instance ids
   * are chosen — see `ReplacementInstallRedirect`.
   */
  | "wouldTrashDigivolutionCard";

/** Fields common to every mode of a replacement install. */
export interface ReplacementInstallBase {
  event: ReplacementEventName;
  sourcePermanentId?: string;
  /** Anchor for a replacement sourced from a loose card in hand/trash. */
  sourceInstanceId?: string;
  /** Stable compiled effect/action identity; never derived from display prose. */
  activationIdentity?: string;
  /** Stable per-turn budget key for a persistent `[Once Per Turn]` replacement. */
  oncePerTurnKey?: string;
  /**
   * Gate on the removal cause. The consult passes the actual cause, the seat whose effect
   * drove the removal, and whether the removal is a bounce/move (vs a deletion); return false
   * to skip firing for this cause. The `isBounce` flag lets an "except deletion" prevention
   * (EX6-044) allow a deletion through while still voiding a move.
   */
  causeAllows?: (
    cause: RemovalCause,
    resolvingSeat: Seat | undefined,
    isBounce: boolean,
    destination?: ZoneRef,
  ) => boolean;
  /** Skip this replacement for the player-action material relocation in DigiXros. */
  exceptDigiXros?: boolean;
  expiresOnTurnEndOf?: Seat;
  description: string;
}

/** "reduceCost": returns a cost delta at the matching cost-computation seam; no prevention gate. */
export interface ReplacementInstallReduceCost extends ReplacementInstallBase {
  mode: "reduceCost";
  /** Reinstallation of a resident clause, rather than a newly earned triggered grant. */
  residentReduction?: boolean;
  amount?: number;
  amountForInto?: (def: CardDefinition) => number;
  /**
   * For mode "reduceCost" + event "wouldDigivolve": restrict the reduction to when the
   * digivolution target (the "into" card) matches this definition predicate. Absent => applies
   * to all digivolutions from the source permanent. Mirrors `ReplacementAction.into`.
   */
  intoMatches?: (def: CardDefinition) => boolean;
  /**
   * Optional target predicate when the source permanent anchors a controller-wide reducer.
   * `baseAsDigimon` is the Digimon a Tamer digivolves as (KB Q1157), when it does.
   */
  appliesTo?: (target: Permanent, originZone?: ZoneRef, baseAsDigimon?: CardDefinition) => boolean;
  /**
   * For ＜Digisorption＞ redirect (BT3-056): when true, the reduction's suspend cost is paid by
   * the OPPONENT (opponent's Digimon are suspended), not the controller's. Set from
   * `ReplacementAction.digisorptionRedirect`. Absent => standard behavior.
   */
  digisorptionRedirect?: boolean;
  controllerSeat?: Seat;
  /** Live context retained by one-shot reducers whose source is no longer a permanent. */
  activationContext?: EffectContext;
  activate?: (
    ctx: EffectContext,
    target: Permanent,
    into: CardDefinition,
    evolvingInstanceId?: string,
    materials?: readonly Permanent[],
    baseAsDigimon?: CardDefinition,
  ) => Promise<boolean | number>;
  consumeOnActivate?: boolean;
}

/** Gain memory after the anchored material successfully participates in a DNA digivolution. */
export interface ReplacementInstallDnaMemory extends ReplacementInstallBase {
  mode: "gainMemoryOnDna";
  amount: number;
  intoMatches?: (def: CardDefinition) => boolean;
}

/**
 * "instead": consulted by `leavePrevention.ts` alongside "prevent" when a permanent would
 * leave/be deleted. Unlike "prevent", an "instead" reaction does NOT stop the removal — it
 * substitutes/attaches a side effect ("you may play 1 [X] from your hand") for the event
 * without gating whether the removal itself happens (Comprehensive Rules §16-36 ＜Decode＞:
 * "would leave the battle area ... you may play 1 specified Digimon card ... without paying
 * the cost" — the leave still occurs). `apply` is REQUIRED — an "instead" entry with no
 * `apply` used to typecheck and then be silently dropped by the consult (which only ran
 * "prevent" entries), so the reaction never ran. Making the field mandatory here turns that
 * class of bug into a compile error instead of a runtime no-op (mirrors `ReplacementInstallPrevent`).
 */
export interface ReplacementInstallInstead extends ReplacementInstallBase {
  mode: "instead";
  apply: (ctx: EffectContext) => Promise<void | boolean>;
  activationDeferred?: boolean;
  /**
   * For ＜Digisorption＞ redirect (BT3-056): when true, the Replacement's suspend cost
   * is paid by the OPPONENT (opponent's Digimon are suspended), not the controller's.
   * Set from `ReplacementAction.digisorptionRedirect`. Absent => standard behavior.
   */
  digisorptionRedirect?: boolean;
  /** Does this apply to `leavingPermanentId`? (self-reaction => only its own source; a filtered
   * reaction => any matching permanent, e.g. BT20-091 "any of your Digimon with [Royal Knight]".) */
  appliesTo?: (ctx: EffectContext, leavingPermanentId: string) => boolean;
  /** Predicate for a pending `wouldBePlayed` target, which has no live permanent id yet. */
  appliesToPending?: (ctx: EffectContext, target: Permanent) => boolean;
  /** Stable per-turn key gating this reaction to once per turn (BT20-091 "[Once Per Turn]"). */
  oncePerTurnKey?: string;
}

/**
 * "prevent": the engine's leave-prevention consult (`leavePrevention.ts`) runs `preventCheck`
 * when a permanent would leave/be deleted. `preventCheck` is REQUIRED by this type — a
 * `mode: "prevent"` entry with no `preventCheck` used to typecheck and then be silently
 * filtered out by the consult (`r.preventCheck !== undefined`), so the reaction never ran.
 * Making the field mandatory here turns that class of bug into a compile error instead of a
 * runtime no-op.
 */
export interface ReplacementInstallPrevent extends ReplacementInstallBase {
  mode: "prevent";
  /** Does this guard `leavingPermanentId`? (self-reaction => only its own source.) */
  protects?: (ctx: EffectContext, leavingPermanentId: string) => boolean;
  /** Prompt + pay the cost; true => the removal is prevented. */
  preventCheck: (ctx: EffectContext, leavingPermanentId: string) => Promise<boolean>;
  /** One activation prevents ALL matching permanents. */
  affectsAll?: boolean;
  /** Stable per-turn key gating this prevention to a printed once-per-turn limit. */
  oncePerTurnKey?: string;
}

/**
 * "redirect": consulted BEFORE a digivolution-card trash chooses which cards to take (KB
 * BT10-084 Q2002-Q2008), not after — swapping only the HOST permanent so the caller's own
 * top/bottom/choose/amount selection logic re-runs unmodified against the new host's stack.
 * That is what keeps the redirect faithful to the original action's count and selection kind
 * (Q2003's "trash all" still trashes ALL of the new host's cards; Q2004's "trash as many as
 * possible" falls out of the caller re-clamping its count to the new host's stack length,
 * with no special-casing needed here). `redirectTo` is REQUIRED — a "redirect" entry with no
 * `redirectTo` used to typecheck and then be silently dropped by the consult, so the reaction
 * would never fire. Making the field mandatory turns that class of bug into a compile error
 * instead of a runtime no-op (mirrors `ReplacementInstallPrevent`/`ReplacementInstallInstead`).
 */
export interface ReplacementInstallRedirect extends ReplacementInstallBase {
  mode: "redirect";
  /**
   * Is every one of `originalHostPermanentIds` eligible for this reaction (their controller,
   * the timing gate, "not this card's own stack")? The consult only offers the redirect when
   * ALL hosts in one trash operation qualify — a mixed-ownership target set (which no known
   * card produces) is left unredirected rather than guessed at. Absent => never applies
   * (defensive; real installs always set this).
   */
  appliesTo?: (ctx: EffectContext, originalHostPermanentId: string) => boolean;
  /**
   * Prompt the controller ("you may trash this Digimon's digivolution cards instead"); returns
   * the alternate host permanentId to redirect the WHOLE trash operation to, or undefined when
   * declined.
   */
  redirectTo: (ctx: EffectContext, originalHostPermanentIds: string[]) => Promise<string | undefined>;
}

/** Args for installing a replacement effect via the primitives. */
export type ReplacementInstall =
  | ReplacementInstallReduceCost
  | ReplacementInstallDnaMemory
  | ReplacementInstallInstead
  | ReplacementInstallPrevent
  | ReplacementInstallRedirect;
