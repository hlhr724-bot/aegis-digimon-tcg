import type { TournamentBanlistCard } from "@aegis/shared/tournaments/index";
import type {
  CardDefinition,
  CardInstance,
  DecisionRequest,
  Intent,
  Permanent,
  RejectReason,
  Seat,
  ServerEvent,
} from "@aegis/shared";

/**
 * Hooks the engine uses to talk back to the room (and thus to clients) without
 * importing Colyseus transport concerns. Supplied by AegisRoom.onCreate.
 */
export interface GameEngineHooks {
  omitHandAffordances?: boolean;
  seed: number;
  randomKey?: string;
  beforeTurn?: (turn: number) => Promise<void> | void;
  /** Who goes first, when the room already knows (a later game of a series). Otherwise the seed decides. */
  firstSeat?: Seat;
  requestDecision: (seat: Seat, req: DecisionRequest) => void;
  emit: (event: ServerEvent) => void;
  /** Fires once, the first time both seats have sent `ready` (see {@link GameEngine.intentRouterDeps}). */
  onBothReady?: () => void;
  /** Notifies in-process actors only after an asynchronous action has fully settled. */
  onActionSettled?: (seat: Seat, intentType: Intent["type"]) => void;
  deferHandAffordances?: boolean;
}

/**
 * The subset of a client's join payload {@link GameEngine.seatPlayer} needs to seat a
 * player: a display name and a decklist. Engine-owned so the rules engine does not import
 * the transport-layer join type — the room's full join payload (`AegisJoinOptions`, which
 * additionally carries a private-room code the engine never needs) extends this instead.
 */
export interface SeatJoinOptions {
  banlistCards?: readonly TournamentBanlistCard[];
  displayName: string;
  /** The joiner's Digimon World portrait, shown beside their name. Unknown ids are dropped. */
  avatarId?: string;
  deck: { mainDeck: string[]; eggDeck: string[]; mainDeckArts?: string[]; eggDeckArts?: string[] }; // arrays of card ids
  /**
   * Opts this seat's deck into beta battle mode, the only mode where a card from an
   * announced-but-unreleased product (`isBetaOnlyCard`) is legal. Both seats must set
   * the same value — {@link AegisRoom} enforces that before either seat is staged.
   */
  betaBattleMode?: boolean;
  unlimited?: boolean;
  format?: import("@aegis/shared").DeckFormat;
}

export type AppFusionValidation =
  | { ok: false; reason: RejectReason }
  | {
      ok: true;
      source: Permanent;
      result: CardInstance;
      resultDefinition: CardDefinition;
      linked: CardInstance;
      printedCost: number;
      projectedCost: number;
    };
