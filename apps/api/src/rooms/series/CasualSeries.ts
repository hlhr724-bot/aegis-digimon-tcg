import { randomBytes, randomUUID } from "node:crypto";
import type { Delayed } from "colyseus";
import { getRematchModeEntry } from "@aegis/shared/protocol/getRematchModeEntry";
import type { RematchMode } from "@aegis/shared/protocol/RematchMode";
import type { SeriesDeckChoice } from "@aegis/shared/protocol/series";
import type { SeriesState } from "@aegis/shared/schema/GameState";
import {
  SERIES_DECK_SELECTION_SECONDS,
  SERIES_NEXT_GAME_JOIN_SECONDS,
  SERIES_TURN_ORDER_SECONDS,
  type GameState,
  type MatchBestOf,
  type Seat,
  type SeriesClientMessage,
  type SeriesEndReason,
  type SeriesSeatMessage,
} from "@aegis/shared";
import { seriesDirectory, type SeriesRecord, type SeriesSeat } from "./SeriesDirectory.js";
import { seriesVerdict, turnOrderChooser, winsOf, type GameResult, type SeriesVerdict } from "./seriesRules.js";

/** What the room passes to `matchMaker.createRoom` for the series' next game. */
export interface SeriesContinuationOptions {
  seriesId: string;
  seriesNonce: string;
}

/** The room as the series sees it. Kept narrow so the room's own rules stay out of here. */
export interface SeriesRoomPort {
  readonly state: GameState;
  readonly roomName: string;
  setTimeout(run: () => void, ms: number): Delayed;
  setInterval(run: () => void, ms: number): Delayed;
  /** What seat `seat` played this game with, minus the token the series mints for it. */
  seatSnapshot(seat: Seat): Omit<SeriesSeat, "token"> | undefined;
  resolveDeckChoice(choice: unknown): SeriesSeatDeck | undefined;
  sendToSeat(seat: Seat, message: SeriesSeatMessage): void;
  createNextRoom(options: SeriesContinuationOptions): Promise<string>;
  logError(...data: unknown[]): void;
}

export interface SeriesSettings {
  bestOf: MatchBestOf;
  allowRollback?: boolean;
  matchTimer: boolean;
  timerStartSeconds: number;
  unlimited?: boolean;
  format?: import("@aegis/shared").DeckFormat;
  roomCode?: string;
}

export type SeriesSeatDeck = Pick<SeriesSeat, "deck" | "deckId" | "deckName" | "community">;

export interface RematchOpening {
  chooser: Seat;
  results: GameResult[];
  mode: RematchMode;
}

const OTHER = (seat: Seat) => (1 - seat) as Seat;

/**
 * One game's share of a casual best-of-three, owned by that game's room.
 *
 * The room still runs exactly one game. This object scores it, runs the loser's turn-order
 * choice, opens the next room, and decides when a departure forfeits the whole series. Everything
 * the players see is mirrored into `state.series`; the record in the {@link seriesDirectory} is
 * how the next room, possibly on another process, picks the series up.
 */
export class CasualSeries {
  private choiceTimeout: Delayed | undefined;
  private choiceTicker: Delayed | undefined;
  private arrivalTimeout: Delayed | undefined;
  private readonly arrived = new Set<Seat>();
  /** Who went first in this room's game; the seed decides it in game 1. */
  private firstSeat: Seat | undefined;
  private continued = false;

  private constructor(
    private readonly port: SeriesRoomPort,
    private record: SeriesRecord | undefined,
    private readonly id: string,
    private readonly settings: SeriesSettings,
    private readonly results: GameResult[],
  ) {
    const series = port.state.series;
    series.bestOf = settings.bestOf;
    series.gameNumber = results.length + 1;
    series.results.push(...results);
    series.wins0 = winsOf(results, 0);
    series.wins1 = winsOf(results, 1);
  }

  /** Game 1. Nothing is stored until the game ends, because only then are both seats known. */
  static begin(port: SeriesRoomPort, settings: SeriesSettings): CasualSeries {
    return new CasualSeries(port, undefined, randomUUID(), settings, []);
  }

  /**
   * The record behind a create request for a later game. Checked before the room builds anything,
   * so a forged or stale request leaves nothing behind; `undefined` refuses it.
   */
  static async loadContinuation(
    roomName: string,
    options: Partial<SeriesContinuationOptions>,
  ): Promise<SeriesRecord | undefined> {
    if (typeof options.seriesId !== "string" || typeof options.seriesNonce !== "string") return undefined;
    const record = await seriesDirectory().load(options.seriesId);
    if (!record || record.nonce !== options.seriesNonce || record.roomName !== roomName) return undefined;
    return record;
  }

  static rematch(port: SeriesRoomPort, settings: SeriesSettings, opening: RematchOpening): CasualSeries {
    resetSeriesState(port.state.series);
    const series = new CasualSeries(port, undefined, randomUUID(), settings, opening.results);
    port.state.series.gameNumber = opening.results.length;
    if (getRematchModeEntry({ mode: opening.mode }).allowsDeckChange) {
      series.beginDeckSelection();
    } else {
      series.beginChoosing(opening.chooser);
    }
    return series;
  }

  /** A later game, opened by the previous game's room from a record {@link loadContinuation} accepted. */
  static continueFrom(port: SeriesRoomPort, record: SeriesRecord): CasualSeries {
    const series = new CasualSeries(port, record, record.id, record, [...record.results]);
    series.continued = true;
    series.firstSeat = record.firstSeat;
    series.armArrivalDeadline();
    return series;
  }

  /** Set only in a later game: the room seats a joiner by token instead of by arrival order. */
  get continuation(): SeriesRecord | undefined {
    return this.continued ? this.record : undefined;
  }

  get fixedFirstSeat(): Seat | undefined {
    return this.continuation ? this.firstSeat : undefined;
  }

  get over(): boolean {
    return this.port.state.series.phase === "over";
  }

  /** Whether a seat leaving now is the planned hop to the next game rather than a departure. */
  get hopping(): boolean {
    return this.port.state.series.phase === "starting" || this.over;
  }

  seatForToken(token: unknown): Seat | undefined {
    const seats = this.continuation?.seats;
    if (!seats || typeof token !== "string") return undefined;
    const seat = seats.findIndex((entry) => entry.token === token);
    return seat === -1 ? undefined : (seat as Seat);
  }

  noteFirstSeat(seat: Seat): void {
    this.firstSeat = seat;
  }

  /** A continuation seat is in its room; once both are, nobody forfeits by absence. */
  noteArrival(seat: Seat): void {
    this.arrived.add(seat);
    if (this.arrived.size === 2) {
      this.arrivalTimeout?.clear();
      this.arrivalTimeout = undefined;
    }
  }

  /** Re-sends the seat's token to a client that reconnected between games. */
  resendSeat(seat: Seat): void {
    const token = this.record?.seats[seat].token;
    if (token && !this.over) this.port.sendToSeat(seat, { kind: "seat", seriesId: this.id, seatToken: token });
  }

  /**
   * Scores the game that just ended. Synchronous, so the room knows whether the series is over
   * before it decides what to reveal; the store and the next room follow asynchronously.
   */
  recordGame(result: GameResult, departedSeat: Seat | undefined): void {
    if (this.over) return;
    this.results.push(result);
    const series = this.port.state.series;
    series.results.push(result);
    series.wins0 = winsOf(this.results, 0);
    series.wins1 = winsOf(this.results, 1);
    if (departedSeat !== undefined) {
      this.finish({ kind: "won", winnerSeat: OTHER(departedSeat) }, "forfeit");
      return;
    }
    const verdict = seriesVerdict(this.settings.bestOf, this.results);
    if (verdict.kind !== "continue") {
      this.finish(verdict, verdict.kind === "draw" ? "draw" : "won");
      return;
    }
    this.beginChoosing(turnOrderChooser(result, this.firstSeat ?? 0));
  }

  handleMessage(seat: Seat, payload: unknown, gameStarted: boolean): void {
    const message = payload as Partial<SeriesClientMessage> | undefined;
    if (message?.action === "chooseTurnOrder") {
      if (typeof message.goFirst === "boolean") this.chooseTurnOrder(seat, message.goFirst);
      return;
    }
    if (message?.action === "chooseSeriesDeck") {
      this.chooseDeck(seat, message.deck);
      return;
    }
    if (message?.action === "leave") this.departed(seat, gameStarted);
  }

  /**
   * A seat is gone for good: it left on purpose, or its reconnection grace ran out. Between games,
   * and before a later game has started, that forfeits the series. During a game the room's own
   * concession already ended the game, and {@link recordGame} forfeits the series from there.
   */
  departed(seat: Seat, gameStarted: boolean): void {
    if (this.over) return;
    const betweenGames =
      this.port.state.series.phase === "choosing" || this.port.state.series.phase === "deckSelection";
    const beforeLaterGame = this.continuation !== undefined && !gameStarted;
    if (betweenGames || beforeLaterGame) this.finish({ kind: "won", winnerSeat: OTHER(seat) }, "forfeit");
  }

  dispose(): void {
    this.clearChoice();
    this.arrivalTimeout?.clear();
  }

  private beginDeckSelection(): void {
    if (!this.ensureRecord()) {
      this.finish({ kind: "draw" }, "aborted");
      return;
    }
    const series = this.port.state.series;
    series.phase = "deckSelection";
    this.startCountdown(SERIES_DECK_SELECTION_SECONDS, () => this.startNextGame(undefined));
  }

  private chooseDeck(seat: Seat, choice: SeriesDeckChoice | undefined): void {
    const series = this.port.state.series;
    if (series.phase !== "deckSelection" || !this.record || isDeckReady(series, seat)) {
      return;
    }
    if (choice !== undefined) {
      const deck = this.port.resolveDeckChoice(choice);
      if (!deck) {
        return;
      }
      const current = this.record.seats[seat];
      const seats: [SeriesSeat, SeriesSeat] = [...this.record.seats];
      seats[seat] = { ...current, ...deck };
      this.record = { ...this.record, seats };
      markDeckChanged(series, seat, !isSameDeck(current.deck, deck.deck));
    }
    markDeckReady(series, seat);
    if (isDeckReady(series, 0) && isDeckReady(series, 1)) {
      this.startNextGame(undefined);
    }
  }

  private beginChoosing(chooser: Seat): void {
    if (!this.ensureRecord()) {
      this.finish({ kind: "draw" }, "aborted");
      return;
    }
    const series = this.port.state.series;
    series.phase = "choosing";
    series.chooserSeat = chooser;
    this.startCountdown(SERIES_TURN_ORDER_SECONDS, () => this.chooseTurnOrder(chooser, true));
  }

  private startCountdown(seconds: number, expire: () => void): void {
    const series = this.port.state.series;
    series.choiceSecondsLeft = seconds;
    this.choiceTicker = this.port.setInterval(() => {
      if (series.choiceSecondsLeft > 0) series.choiceSecondsLeft -= 1;
    }, 1000);
    this.choiceTimeout = this.port.setTimeout(expire, seconds * 1000);
    for (const seat of [0, 1] as Seat[]) this.resendSeat(seat);
  }

  private chooseTurnOrder(seat: Seat, goFirst: boolean): void {
    const series = this.port.state.series;
    if (series.phase !== "choosing" || series.chooserSeat !== seat) {
      return;
    }
    this.startNextGame(goFirst ? seat : OTHER(seat));
  }

  private startNextGame(firstSeat: Seat | undefined): void {
    if (!this.record) {
      return;
    }
    this.clearChoice();
    const series = this.port.state.series;
    series.phase = "starting";
    series.chooserSeat = -1;
    series.choiceSecondsLeft = 0;
    series.nextFirstSeat = firstSeat ?? -1;
    this.record = { ...this.record, results: [...this.results], firstSeat, nonce: randomUUID() };
    void this.openNextRoom(this.record);
  }

  private async openNextRoom(record: SeriesRecord): Promise<void> {
    try {
      await seriesDirectory().save(record);
      const roomId = await this.port.createNextRoom({ seriesId: record.id, seriesNonce: record.nonce });
      if (!this.over) this.port.state.series.nextRoomId = roomId;
    } catch (error) {
      this.port.logError("[CasualSeries] could not open the next game", error);
      this.finish({ kind: "draw" }, "aborted");
    }
  }

  private armArrivalDeadline(): void {
    this.arrivalTimeout = this.port.setTimeout(() => {
      this.arrivalTimeout = undefined;
      const absent = ([0, 1] as Seat[]).filter((seat) => !this.arrived.has(seat));
      if (absent.length === 1) this.finish({ kind: "won", winnerSeat: OTHER(absent[0]!) }, "forfeit");
      else if (absent.length === 2) this.finish({ kind: "draw" }, "aborted");
    }, SERIES_NEXT_GAME_JOIN_SECONDS * 1000);
  }

  /** Game 1's seats, captured when it ends: the tokens are minted once and kept for the series. */
  private ensureRecord(): SeriesRecord | undefined {
    if (this.record) return this.record;
    const seats = ([0, 1] as Seat[]).map((seat) => this.port.seatSnapshot(seat));
    if (!seats[0] || !seats[1]) return undefined;
    const token = () => randomBytes(24).toString("base64url");
    this.record = {
      id: this.id,
      nonce: "",
      roomName: this.port.roomName,
      bestOf: this.settings.bestOf,
      allowRollback: this.settings.allowRollback === true,
      matchTimer: this.settings.matchTimer,
      timerStartSeconds: this.settings.timerStartSeconds,
      unlimited: this.settings.unlimited === true,
      format: this.settings.format,
      ...(this.settings.roomCode ? { roomCode: this.settings.roomCode } : {}),
      results: [...this.results],
      seats: [
        { ...seats[0], token: token() },
        { ...seats[1], token: token() },
      ],
    };
    return this.record;
  }

  private finish(verdict: Exclude<SeriesVerdict, { kind: "continue" }>, reason: SeriesEndReason): void {
    this.clearChoice();
    this.arrivalTimeout?.clear();
    this.arrivalTimeout = undefined;
    const series = this.port.state.series;
    series.phase = "over";
    series.chooserSeat = -1;
    series.choiceSecondsLeft = 0;
    series.winnerSeat = verdict.kind === "won" ? verdict.winnerSeat : -1;
    series.endReason = reason;
    if (this.record)
      void seriesDirectory()
        .remove(this.id)
        .catch((error: unknown) => this.port.logError("[CasualSeries] could not forget a finished series", error));
  }

  private clearChoice(): void {
    this.choiceTimeout?.clear();
    this.choiceTicker?.clear();
    this.choiceTimeout = undefined;
    this.choiceTicker = undefined;
  }
}

function resetSeriesState(series: SeriesState): void {
  series.results.clear();
  series.wins0 = 0;
  series.wins1 = 0;
  series.chooserSeat = -1;
  series.choiceSecondsLeft = 0;
  series.nextFirstSeat = -1;
  series.nextRoomId = "";
  series.winnerSeat = -1;
  series.endReason = "";
  series.deckReady0 = false;
  series.deckReady1 = false;
  series.deckChanged0 = false;
  series.deckChanged1 = false;
}

function isDeckReady(series: SeriesState, seat: Seat): boolean {
  return seat === 0 ? series.deckReady0 : series.deckReady1;
}

function markDeckReady(series: SeriesState, seat: Seat): void {
  if (seat === 0) {
    series.deckReady0 = true;
  } else {
    series.deckReady1 = true;
  }
}

function markDeckChanged(series: SeriesState, seat: Seat, changed: boolean): void {
  if (seat === 0) {
    series.deckChanged0 = changed;
  } else {
    series.deckChanged1 = changed;
  }
}

function isSameDeck(current: SeriesSeat["deck"], next: SeriesSeat["deck"]): boolean {
  const sorted = (cards: string[]) => [...cards].sort().join(",");
  return sorted(current.mainDeck) === sorted(next.mainDeck) && sorted(current.eggDeck) === sorted(next.eggDeck);
}
