import { describe, expect, it } from "vitest";
import { RematchMode } from "@aegis/shared/protocol/RematchMode";
import { RematchStatus } from "@aegis/shared/protocol/RematchStatus";
import { SeriesState } from "@aegis/shared/schema/GameState";
import { getRematchView } from "@/game/getRematchView";

function buildSeries(fields: Partial<SeriesState>): SeriesState {
  return Object.assign(new SeriesState(), fields);
}

describe("getRematchView", () => {
  it("shows nothing where a rematch is not offered", () => {
    expect(getRematchView({ series: buildSeries({}), viewerSeat: 0 })).toBeUndefined();
  });

  it("reports which series the offer starts", () => {
    const finish = buildSeries({
      rematchStatus: RematchStatus.OFFERED.value,
      rematchMode: RematchMode.FINISH_SERIES.value,
    });
    expect(getRematchView({ series: finish, viewerSeat: 0 })?.mode).toBe(RematchMode.FINISH_SERIES.value);
    const unset = buildSeries({ rematchStatus: RematchStatus.OPEN.value });
    expect(getRematchView({ series: unset, viewerSeat: 0 })?.mode).toBe(RematchMode.NEW_SERIES.value);
  });

  it("tells the offering seat from the answering seat", () => {
    const series = buildSeries({ rematchStatus: RematchStatus.OFFERED.value, rematchOfferSeat: 1 });
    expect(getRematchView({ series, viewerSeat: 1 })?.stage).toBe("offeredByYou");
    expect(getRematchView({ series, viewerSeat: 0 })?.stage).toBe("offeredToYou");
  });

  it("hands the turn-order choice of an accepted rematch to the series view", () => {
    const series = buildSeries({
      rematchStatus: RematchStatus.ACCEPTED.value,
      bestOf: 3,
      gameNumber: 0,
      phase: "choosing",
      chooserSeat: 0,
    });
    expect(getRematchView({ series, viewerSeat: 0 })).toMatchObject({
      stage: "accepted",
      series: { bestOf: 3, viewerChooses: true, pips: ["pending", "pending", "pending"] },
    });
  });

  it("closes an accepted rematch whose series ended before its first game", () => {
    const series = buildSeries({
      rematchStatus: RematchStatus.ACCEPTED.value,
      bestOf: 3,
      phase: "over",
      endReason: "forfeit",
    });
    expect(getRematchView({ series, viewerSeat: 0 })).toEqual({
      stage: "closed",
      mode: RematchMode.NEW_SERIES.value,
      modes: [RematchMode.NEW_SERIES.value],
      series: undefined,
    });
  });

  it("offers both series after a single game and only a new one after a best-of-three", () => {
    const single = buildSeries({ rematchStatus: RematchStatus.OPEN.value });
    expect(getRematchView({ series: single, viewerSeat: 0 })?.modes).toEqual([
      RematchMode.FINISH_SERIES.value,
      RematchMode.NEW_SERIES.value,
    ]);
    const finished = buildSeries({ rematchStatus: RematchStatus.OPEN.value, bestOf: 3, phase: "over" });
    expect(getRematchView({ series: finished, viewerSeat: 0 })?.modes).toEqual([RematchMode.NEW_SERIES.value]);
  });

  it("shows each seat its own deck readiness and only whether the opponent switched", () => {
    const series = buildSeries({
      rematchStatus: RematchStatus.ACCEPTED.value,
      bestOf: 3,
      gameNumber: 0,
      phase: "deckSelection",
      deckReady0: true,
      deckChanged0: true,
    });
    expect(getRematchView({ series, viewerSeat: 1 })?.series).toMatchObject({
      stage: "deckSelection",
      viewerDeckReady: false,
      opponentDeckReady: true,
      opponentDeckChanged: true,
    });
  });
});
