import type { Seat } from "@aegis/shared";

/** A card in a zone: a bare card id, or the same plus an alias to address it by later. */
export type CardSpec =
  | string
  | {
      card: string;
      as?: string;
      faceUp?: boolean;
      ownerSeat?: Seat;
      artId?: string;
      fromDeck?: { seat: Seat; index: number; egg?: boolean };
    };

/** A permanent on the battle area or in breeding. */
export interface PermanentSpec {
  card: string;
  /** Alias for `perm(alias)`. Aliases are unique per Board Spec. */
  as?: string;
  /** Base and current DP. Defaults to the card definition's printed DP. */
  dp?: number;
  suspended?: boolean;
  /** Opt in to summoning sickness / the ＜Delay＞ gate. Established by default. */
  enteredThisTurn?: boolean;
  /** Digivolution cards, bottom-most first. */
  under?: CardSpec[];
  /** Linked cards (Link mechanic). */
  linked?: CardSpec[];
  /**
   * §17-1-3-2-2 marker. Defaults to `true` for a pure-Option card seeded onto the battle
   * area, because that is the only way such a permanent can legally exist; set it to
   * `false` to seed the illegal state the rule sweep exists to clean up.
   */
  placedByEffect?: boolean;
  top?: CardSpec;
  currentDP?: number;
  enterFieldTurnCount?: number;
  inBreeding?: boolean;
}

export interface SeatSpec {
  hand?: CardSpec[];
  deck?: CardSpec[];
  eggDeck?: CardSpec[];
  trash?: CardSpec[];
  delayZone?: CardSpec[];
  /** Explicit cards, or a count of anonymous face-down cards. `[0]` is the top of the stack. */
  security?: CardSpec[] | number;
  battleArea?: (PermanentSpec | string)[];
  breeding?: PermanentSpec | string;
}

/** Both seats' starting zones. Seat 0 is the turn player unless a test says otherwise. */
export type BoardSpec = { 0?: SeatSpec; 1?: SeatSpec };

/** A board immediately before the real turn loop's Unsuspend/Draw/Breeding phases. */
export interface ScenarioFixture {
  name?: string;
  board: BoardSpec;
  memory: number;
  turnSeat: Seat;
  turnCount: number;
  isFirstPlayersFirstTurn: boolean;
  /** Explicit opt-in for regression boards testing an invalid initial gauge. */
  allowOutOfRangeMemory?: boolean;
  effects?: { permanent: string; kind: "suspendLock" | "holyProtection" }[];
  presentation?: { timed?: boolean; opponent?: ScenarioOpponent; holdBotAfterTurn?: number };
}

export interface ScenarioReferences {
  instanceId(alias: string): string;
  permanentId(alias: string): string;
}

/** Optional deterministic opponent control; every action is an ordinary public intent. */
export interface ScenarioOpponent {
  endBreeding?: boolean;
  fallbackMain?: "end" | "evaluate";
  main?: (
    | { kind: "attack" }
    | { kind: "play"; card: string; useAs?: "option"; whenOpponentCard?: string }
    | { kind: "digivolve"; card: string; base: string; alternate?: boolean }
  )[];
  blockerCard?: string;
  decisions?: {
    sourceCard: string;
    kind: "chooseTargets" | "selectCards" | "chooseOption" | "optional" | "orderTriggers";
    timing?: string;
    promptIncludes?: string;
    target?: string;
    choice?: string;
    choiceStartsWith?: string;
    accept?: boolean;
  }[];
}
