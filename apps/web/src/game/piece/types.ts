import type { ProjectedDigivolveRoute, ProjectedDnaDigivolveRoute } from "../digivolveModel";

export type DropAttrs = Record<string, string>;

export interface HandEntry {
  artId?: string;
  instanceId: string;
  cardId: string;
  activatableEffectsJson: string;
  negamonPlayEffectKey?: string;
  /** Server projection: this card can be played right now. */
  playableFromHand: boolean;
  /** Server projection: memory this play would cost with active reducers applied; -1 if not projected. */
  projectedPlayCost: number;
  /** Server projection: play cost reduction effects are prohibited. */
  playCostReductionBlocked?: boolean;
  /** Server projection: own permanents this card may digivolve onto right now. */
  digivolveTargetPermanentIds: readonly string[];
  /** Server projection: own battle-area Digimon this card may be linked to right now. */
  linkTargetPermanentIds: readonly string[];
  /** Server-projected digivolution prices, one per (base x cost path); the board never
   * derives a cost locally when the server published one. */
  digivolveRoutes?: readonly ProjectedDigivolveRoute[];
  /** Server-projected legal DNA material combinations and their final costs. */
  dnaDigivolveRoutes?: readonly ProjectedDnaDigivolveRoute[];
  /** Server-projected App Fusion routes; the board never derives legality locally. */
  appFusionRoutes?: readonly {
    hostPermanentId: string;
    linkedInstanceId: string;
    projectedCost: number;
  }[];
}

/**
 * A board-mode `selectCards` decision answered out of this hand. While it is set
 * the hand stops being a play surface: cards are picked in place, in order, and
 * dragging is off so a pick cannot become an accidental play.
 */
export interface HandSelection {
  selectableInstanceIds: readonly string[];
  /** Picked instance ids, in the order they were chosen — the badge is the position. */
  pickedInstanceIds: readonly string[];
  onToggle: (instanceId: string) => void;
  onInspect?: (instanceId: string) => void;
}

export interface ScrollOverflow {
  start: boolean;
  end: boolean;
}

export interface ArrowPoint {
  x: number;
  y: number;
}
