/**
 * Turn order is server truth, not a guess: `matchStarted.firstSeat` names the
 * player who takes turn 1, and the mulligan window opens before any turn has
 * passed. `undefined` simply omits the accent line rather than picking a side.
 */
export type TurnOrder = "first" | "second";

/** Per-trigger chrome the board supplies for the chooser: where it fires from, and its clause in one line. */
export interface TriggerDetail {
  sourceLabel?: string;
  hostCardId?: string;
  summary?: string;
}

export interface StackCard {
  cardId: string;
  artId?: string;
  faceDown?: boolean;
  oncePerTurnUsed?: true;
  role: "top" | "stack" | "linked";
}

/** A selectable DigiXros material entry. */
export interface DigiXrosCandidate {
  artId?: string;
  instanceId: string;
  cardId: string;
  zone: "hand" | "battle" | "trash" | "underTamer";
  digiXrosNames?: readonly string[];
  canSubstitute?: boolean;
}

export interface DigiXrosEligibleExpander {
  permanentId: string;
  cardId: string;
  underTamerMax: number;
  trashMax: number;
}

/** A selectable Assembly material entry: always a card in the player's own trash (§7-3-1). */
export interface AssemblyCandidate {
  artId?: string;
  instanceId: string;
  cardId: string;
}
