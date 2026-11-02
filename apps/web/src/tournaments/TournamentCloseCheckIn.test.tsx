// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n";
import type { ApiError } from "@/tournaments/client";
import { TournamentCloseCheckIn } from "@/tournaments/TournamentCloseCheckIn";

afterEach(() => cleanup());

function renderCloseCheckIn(checkedIn: number) {
  render(
    <I18nProvider>
      <TournamentCloseCheckIn
        id="t-1"
        structure="single_elimination"
        allowBots={false}
        checkedIn={checkedIn}
        waiting={2}
        onClosed={vi.fn<() => void>()}
        onError={vi.fn<(error: ApiError) => void>()}
      />
    </I18nProvider>,
  );
}

describe("closing check-in", () => {
  it("disables closing check-in while a lone player would cancel the event", () => {
    renderCloseCheckIn(1);
    expect(screen.getByText("1 checked in · 2 still waiting")).toBeTruthy();
    const button = screen.getByRole("button", { name: "Close check-in" });
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(button.getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByText(/At least one more player needs to check in/)).toBeTruthy();
  });

  it("explains that the event starts and no-shows are dropped", () => {
    renderCloseCheckIn(4);
    fireEvent.click(screen.getByRole("button", { name: "Close check-in" }));
    expect(screen.getByText("The tournament starts right away and the field is locked.")).toBeTruthy();
    expect(screen.getByText("Players who have not checked in are dropped as no-shows.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close check-in and start" })).toBeTruthy();
  });
});
