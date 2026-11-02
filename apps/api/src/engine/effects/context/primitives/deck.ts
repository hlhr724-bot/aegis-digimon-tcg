import type { CardDefinition, CardInstance, EffectDuration, Seat } from "@aegis/shared";
import type { EvoCostMatch } from "../../modifiers.js";
import type { EffectContext } from "../effectContext.js";

/**
 * Deck and security-stack reads, plus the cost adjustments a card module applies
 * to what it is about to play or digivolve into.
 */
export interface DeckPrimitives {
  reveal(seat: Seat, n: number, sourceCardId?: string): Promise<CardInstance[]>;
  searchDeck(
    seat: Seat,
    filter: (def: CardDefinition) => boolean,
    opts?: { min?: number; max?: number },
  ): Promise<CardInstance[]>;
  addSecurity(
    seat: Seat,
    instanceIds: string[],
    opts?: { toTop?: boolean; faceUp?: boolean; detachPermanentTop?: boolean },
  ): Promise<void>;
  /** Resolution-source stack used by ownership, source-kind, and deletion-provenance checks. */
  enterEffectResolution?(seat: Seat, sourceKinds?: string[], sourcePermanentId?: string): void;
  leaveEffectResolution?(): void;
  /** The card kinds the innermost resolving effect counts as; undefined outside any resolution. */
  resolvingEffectSourceKinds?(): readonly string[] | undefined;
  /** Emits `effectTriggered`; the returned closer emits `effectResolved`. */
  announceEffect?(
    ctx: EffectContext,
    effect: {
      effectKey: string;
      description: string;
      timing: string;
      effectTextPart?: string;
      isInherited?: boolean;
      beforeRemoval?: boolean;
    },
  ): () => void;
  /** Emits `effectOptionChosen` for the printed bullet of the modal option about to resolve. */
  announceEffectOption?(ctx: EffectContext, clause: string): void;
  announceEffectClauseAdvanced?(ctx: EffectContext, clause: string): void;
  restrictSecurityAddsFromEffect?(blockedEffectSeat: Seat, granterSeat: Seat, duration: EffectDuration): void;
  grantPierce(permanentId: string, duration: EffectDuration, opts?: { continuous?: boolean }): void;
  /**
   * Record a continuous digivolve-cost modification. `filter` is evaluated against the
   * BASE permanent being digivolved plus (when known at cost-query time) the DEFINITION
   * of the card being digivolved INTO (`m.into`). A "when digivolving INTO this card"
   * effect checks `m.into` to scope to its own digivolve; a base-keyed reduction ignores
   * it. `setFixed` makes `delta` an absolute cost (SET, computed before additive deltas).
   * `once` consumes the adjustment only when a matching digivolve is actually applied.
   */
  changeEvoCost(
    filter: (m: EvoCostMatch) => boolean,
    delta: number,
    opts?: {
      setFixed?: boolean;
      once?: boolean;
      continuous?: boolean;
      onConsume?: (match: EvoCostMatch) => void;
      intrinsicCardId?: string;
      intrinsicEffectKey?: object;
    },
  ): void;
  /**
   * Record a continuous play/use-cost modification ("reduce the play cost of your
   * Digimon by N", "increase the cost of your opponent's next Digimon by N"). The
   * play-card / option-use cost calculation consults the recorded adjustments when
   * computing what a card costs. `filter` decides which card definitions (and whose)
   * the adjustment applies to; `setFixed` makes `delta` an absolute cost. Mirrors the
   */
  changePlayCost(
    filter: (facts: { def: CardDefinition; controllerSeat: Seat; permanentId?: string }) => boolean,
    delta: number,
    opts?: { setFixed?: boolean; continuous?: boolean; intrinsicCardId?: string; intrinsicEffectKey?: object },
  ): void;
}
