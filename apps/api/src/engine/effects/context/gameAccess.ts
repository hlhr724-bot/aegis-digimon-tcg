import type { RuntimeObjectRegistry } from "#api/engine/snapshot/RuntimeObjectRegistry";
import type { RuntimeCallbackRegistry } from "#api/engine/snapshot/RuntimeCallbackRegistry";
import type { CardDefinition, CardInstance, GameState, Permanent, PlayerState, Seat, ZoneRef } from "@aegis/shared";

/** Read-only access to authoritative state for guards and effect bodies. */
export interface GameAccess {
  runtimeCallbacks?: RuntimeCallbackRegistry;
  runtimeObjects?: RuntimeObjectRegistry;
  readonly state: GameState;
  player(seat: Seat): PlayerState;
  opponentOf(seat: Seat): Seat;
  permanentById(permanentId: string): Permanent | undefined;
  /** The other participant of the active field-Digimon battle; absent outside that battle. */
  battleOpponentOf?(permanentId: string): Permanent | undefined;
  /**
   * Only `cardId` is read, so a bare `{ cardId }` — a loose-card candidate, a recorded trigger
   * subject — is a legal argument without materializing a whole {@link CardInstance}.
   */
  definitionOf(card: Pick<CardInstance, "cardId">): CardDefinition;
  /**
   * A permanent's EFFECTIVE link limit: base 1 plus every
   * active `<Link +N>` grant. Server-authoritative; `runLink` reads it to cap link cards.
   * Optional so lightweight test GameAccess literals need not supply it (callers fall back
   * to the base limit when absent); the live engine always provides it via createGameAccess.
   */
  linkMax?(permanent: Permanent): number;
  /**
   * The link-cost reduction that applies when a card carrying `cardTraits` would link to
   * `recipientId`. Returns the
   * LARGEST single matching grant — reductions do NOT stack on one declaration (KB BT25-089
   * Q6423). Optional for lightweight test literals (callers fall back to 0 when absent); the
   * live engine always supplies it via createGameAccess from the continuous ledger.
   */
  linkCostReduction?(recipientId: string, cardTraits: readonly string[]): number;
  linkCostReductionGrant?(
    recipientId: string,
    cardTraits: readonly string[],
  ):
    | {
        amount: number;
        controllerSeat?: Seat;
        optional?: boolean;
        oncePerTurnKey?: string;
      }
    | undefined;
  /**
   * A permanent's EFFECTIVE card kinds (static def.kinds ∪ continuous KindGrants).
   * A Tamer granted Digimon kind via grantKind is a Digimon for type-check gates
   * (HARD-01). Optional so lightweight test GameAccess literals fall back to static
   * kinds; the live engine always provides it via createGameAccess.
   */
  effectiveKinds?(
    permanentId: string,
    printedKinds?: readonly import("@aegis/shared").CardKind[],
  ): import("@aegis/shared").CardKind[];
  /** A permanent's printed traits plus active runtime trait grants. */
  effectiveTraits?(permanentId: string): string[];
  /** A permanent's printed kinds plus active runtime kind grants. */
  effectiveKinds?(
    permanentId: string,
    printedKinds?: readonly import("@aegis/shared").CardKind[],
  ): import("@aegis/shared").CardKind[];
  /** A permanent's effective name set, including dynamic aliases from its digivolution stack. */
  effectiveNames?(permanent: Permanent): string[];
  /** Effective printed-plus-granted colors used by Option color requirements. */
  effectiveColors?(permanent: Permanent): import("@aegis/shared").CardColor[];
  /** Current DP including active continuous modifiers during effect recomputation. */
  effectiveDP?(permanentId: string): number;
  /** Whether a loose card currently ignores its printed color requirement. */
  colorRequirementWaived?(instanceId: string): boolean;
  /** Whether an Option can currently be used under its ordinary color requirement. */
  optionColorRequirementMet?(seat: Seat, instanceId: string, definition: CardDefinition): boolean;
  /** Server-authoritative live keyword/mechanic lookup for the source permanent. */
  hasKeyword?(permanentId: string, keyword: string): boolean;
  /** Whether the permanent can currently declare an ordinary (tapping) attack. */
  canDeclareAttack?(permanent: Permanent): boolean;
  /** Whether `seat` completed a digivolution since the current turn began. */
  digivolvedThisTurn?(seat: Seat): boolean;
  /** A live battle-area base-granted evolution path, usable by effect-driven digivolution. */
  baseGrantedDigivolve?(
    seat: Seat,
    base: Permanent,
    evolving: CardDefinition,
    sourceZone?: ZoneRef,
  ): { cost: number } | undefined;
  /** Whether the permanent is currently prevented from activating this timing. */
  isTimingEffectDisabled?(permanentId: string, timing: "whenDigivolving" | "whenAttacking" | "onPlay"): boolean;
}
