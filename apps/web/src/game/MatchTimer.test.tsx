// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { GameState, PendingDecision } from "@aegis/shared";
import { I18nProvider } from "../i18n";
import { DecisionMatchTimer, MatchTimer, formatMatchTime } from "./MatchTimer";

afterEach(cleanup);
function budgets(testId: string) {
  return Array.from(screen.getByTestId(testId).querySelectorAll(".match-timer__value"), (value) => value.textContent);
}
describe("match timer readouts", () => {
  it("shows the decision budget beside the match bank from the first decision after mulligan", () => {
    const state = new GameState();
    state.matchTimer = true;
    state.timerActiveSeat = 0;
    state.inactivitySeat = 0;
    state.inactivityRemainingSeconds = 90;
    render(
      <I18nProvider>
        <MatchTimer state={state} seat={0} />
      </I18nProvider>,
    );
    expect(budgets("viewer-match-timer")).toEqual(["90", "300"]);
    expect(screen.getByText("Decision")).toBeTruthy();
    expect(screen.getByText("Match")).toBeTruthy();
    expect(screen.queryByText("Play or lose")).toBeNull();
  });
  it("keeps both banks visible while ownership changes, pauses and the game ends", () => {
    const state = new GameState();
    state.matchTimer = true;
    const view = () => (
      <I18nProvider>
        <MatchTimer state={state} seat={0} />
        <MatchTimer state={state} seat={1} opponent />
      </I18nProvider>
    );
    const { rerender } = render(view());
    for (const seat of [0, 1, -1]) {
      state.timerActiveSeat = seat;
      rerender(view());
      expect(screen.getAllByRole("timer")).toHaveLength(2);
      expect(document.querySelectorAll("[data-active=true]")).toHaveLength(seat === -1 ? 0 : 1);
      if (seat === -1)
        expect(
          screen.getAllByRole("timer").every((clock) => clock.getAttribute("aria-label")?.endsWith("Paused")),
        ).toBe(true);
    }
    state.gameOver = true;
    rerender(view());
    expect(screen.getAllByRole("timer")).toHaveLength(2);
    expect(screen.queryByText("Your action")).toBeNull();
    expect(screen.getAllByText("300")).toHaveLength(2);
  });
  it("keeps both clocks above the viewer's decision sheet only", () => {
    const state = new GameState();
    state.matchTimer = true;
    const decision = new PendingDecision();
    decision.seat = 0;
    state.pendingDecision = decision;
    const view = () => (
      <I18nProvider>
        <DecisionMatchTimer state={state} seat={0} />
      </I18nProvider>
    );
    const { rerender } = render(view());
    expect(document.body.querySelector(".game-decision-clocks")?.querySelectorAll("[role=timer]")).toHaveLength(2);
    decision.seat = 1;
    rerender(view());
    expect(screen.queryByRole("timer")).toBeNull();
    state.pendingDecision = undefined;
    rerender(view());
    expect(screen.queryByRole("timer")).toBeNull();
  });
  it("shows the deciding seat's mulligan window instead of its match clock during the mulligan", () => {
    const state = new GameState();
    state.matchTimer = true;
    state.timerRemaining0 = 300;
    state.timerRemaining1 = 300;
    state.mulliganTimerRemaining0 = 21;
    state.inactivitySeat = 0;
    state.inactivityRemainingSeconds = 90;
    state.timerActiveSeat = 0;
    const decision = new PendingDecision();
    decision.seat = 0;
    decision.kind = "mulligan";
    state.pendingDecision = decision;
    const view = () => (
      <I18nProvider>
        <MatchTimer state={state} seat={0} />
        <MatchTimer state={state} seat={1} opponent />
      </I18nProvider>
    );
    const { rerender } = render(view());
    const viewer = screen.getByTestId("viewer-match-timer");
    expect(viewer.getAttribute("data-clock")).toBe("mulligan");
    expect(viewer.textContent).toContain("Mulligan");
    expect(viewer.textContent).toContain("21");
    expect(viewer.textContent).not.toContain("90");
    expect(viewer.getAttribute("aria-label")).toMatch(/^Your time \(Mulligan\): 00:21\./);
    expect(screen.getByTestId("opponent-match-timer").getAttribute("data-clock")).toBe("match");
    expect(screen.getByTestId("opponent-match-timer").textContent).toContain("300");

    state.pendingDecision = undefined;
    rerender(view());
    expect(screen.getByTestId("viewer-match-timer").getAttribute("data-clock")).toBe("match");
    expect(screen.getByTestId("viewer-match-timer").textContent).toContain("300");
    expect(budgets("viewer-match-timer")).toEqual(["90", "300"]);
  });
  it("warns only for the active seat while keeping both decision and match time visible", () => {
    const state = new GameState();
    state.matchTimer = true;
    state.timerActiveSeat = 0;
    state.inactivitySeat = 0;
    state.inactivityRemainingSeconds = 30;
    const view = () => (
      <I18nProvider>
        <MatchTimer state={state} seat={0} />
        <MatchTimer state={state} seat={1} opponent />
      </I18nProvider>
    );
    const { rerender } = render(view());
    expect(screen.getByTestId("viewer-match-timer").textContent).toContain("Play or lose");
    expect(budgets("viewer-match-timer")).toEqual(["30", "300"]);
    expect(screen.getByTestId("viewer-match-timer").getAttribute("aria-label")).toContain("lose for inactivity");
    expect(screen.getByTestId("opponent-match-timer").textContent).not.toContain("Play or lose");
    state.inactivityRemainingSeconds = 90;
    rerender(view());
    expect(screen.queryByText("Play or lose")).toBeNull();
    expect(screen.getAllByText("300")).toHaveLength(2);
    expect(budgets("viewer-match-timer")).toEqual(["90", "300"]);
    state.timerActiveSeat = -1;
    state.inactivityRemainingSeconds = 20;
    rerender(view());
    expect(screen.queryByText("Play or lose")).toBeNull();
    expect(budgets("viewer-match-timer")).toEqual(["20", "300"]);
    expect(screen.getByTestId("viewer-match-timer").getAttribute("data-active")).toBeNull();
    state.gameOver = true;
    rerender(view());
    expect(budgets("viewer-match-timer")).toEqual(["300"]);
  });
  it("prints minute boundaries and clamps expired clocks", () => {
    expect([300, 60, 59, 0, -1].map(formatMatchTime)).toEqual(["05:00", "01:00", "00:59", "00:00", "00:00"]);
  });
  it("hides disabled clocks and shows the live owner's low-time warning", () => {
    const state = new GameState();
    const { rerender } = render(
      <I18nProvider>
        <MatchTimer state={state} seat={1} />
      </I18nProvider>,
    );
    expect(screen.queryByRole("timer")).toBeNull();
    state.matchTimer = true;
    state.timerRemaining1 = 20;
    state.timerActiveSeat = 1;
    rerender(
      <I18nProvider>
        <MatchTimer state={state} seat={1} />
      </I18nProvider>,
    );
    expect(screen.getByRole("timer").getAttribute("aria-label")).toContain("00:20");
    expect(screen.getByRole("timer").getAttribute("data-low")).toBe("true");
    expect(screen.getByRole("timer").getAttribute("data-active")).toBe("true");
    expect(screen.getByText("20")).toBeTruthy();
    expect(screen.queryByText("Your action")).toBeNull();
  });
});
