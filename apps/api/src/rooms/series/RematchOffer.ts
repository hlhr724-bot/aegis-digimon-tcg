import { getOfferedRematchModes } from "@aegis/shared/protocol/getOfferedRematchModes";
import { getRematchMode } from "@aegis/shared/protocol/getRematchMode";
import { getRematchModeEntry } from "@aegis/shared/protocol/getRematchModeEntry";
import type { RematchMode } from "@aegis/shared/protocol/RematchMode";
import { RematchStatus } from "@aegis/shared/protocol/RematchStatus";
import type { SeriesClientMessage } from "@aegis/shared/protocol/series";
import type { GameState } from "@aegis/shared/schema/GameState";
import type { Seat } from "@aegis/shared/schema/enums";
import { turnOrderChooser, type GameResult } from "#api/rooms/series/seriesRules";
import type { RematchOpening } from "#api/rooms/series/CasualSeries";

type RematchOfferParams = {
  readState: () => GameState;
  startSeries: (opening: RematchOpening) => boolean;
  afterSeries: boolean;
};

type OpenParams = {
  result: GameResult;
  departed: boolean;
};

export class RematchOffer {
  private firstSeat: Seat = 0;
  private result: GameResult | undefined;

  constructor(private readonly params: RematchOfferParams) {}

  noteFirstSeat(seat: Seat): void {
    this.firstSeat = seat;
  }

  open({ result, departed }: OpenParams): void {
    this.result = result;
    const endReason = this.readSeries().endReason;
    const forfeited = endReason === "forfeit" || endReason === "aborted";
    this.setStatus(departed || forfeited ? RematchStatus.CLOSED.value : RematchStatus.OPEN.value);
  }

  close(): void {
    const status = this.readSeries().rematchStatus;
    if (status === RematchStatus.OPEN.value || status === RematchStatus.OFFERED.value) {
      this.setStatus(RematchStatus.CLOSED.value);
    }
  }

  handleMessage(seat: Seat, payload: unknown): void {
    const message = payload as Partial<SeriesClientMessage> | undefined;
    if (message?.action === "offerRematch") {
      this.offer(seat, getRematchMode({ mode: message.mode }));
      return;
    }
    if (message?.action === "answerRematch" && typeof message.accept === "boolean") {
      this.answer(seat, message.accept);
    }
  }

  private offer(seat: Seat, mode: RematchMode): void {
    if (!getOfferedRematchModes({ afterSeries: this.params.afterSeries }).includes(mode)) {
      return;
    }
    const series = this.readSeries();
    const answersOpponent = series.rematchStatus === RematchStatus.OFFERED.value && series.rematchOfferSeat !== seat;
    if (answersOpponent && series.rematchMode === mode) {
      this.accept();
      return;
    }
    if (series.rematchStatus !== RematchStatus.OPEN.value && !answersOpponent) {
      return;
    }
    series.rematchOfferSeat = seat;
    series.rematchMode = mode;
    this.setStatus(RematchStatus.OFFERED.value);
  }

  private answer(seat: Seat, accept: boolean): void {
    const series = this.readSeries();
    if (series.rematchStatus !== RematchStatus.OFFERED.value || series.rematchOfferSeat === seat) {
      return;
    }
    if (accept) {
      this.accept();
      return;
    }
    this.setStatus(RematchStatus.DECLINED.value);
  }

  private accept(): void {
    if (this.result === undefined) {
      return;
    }
    this.setStatus(RematchStatus.ACCEPTED.value);
    const mode = getRematchModeEntry({ mode: this.readSeries().rematchMode });
    const opened = this.params.startSeries({
      chooser: turnOrderChooser(this.result, this.firstSeat),
      results: mode.countsFinishedGame ? [this.result] : [],
      mode: mode.value,
    });
    if (!opened) {
      this.setStatus(RematchStatus.CLOSED.value);
    }
  }

  private setStatus(status: RematchStatus): void {
    this.readSeries().rematchStatus = status;
  }

  private readSeries(): GameState["series"] {
    return this.params.readState().series;
  }
}
