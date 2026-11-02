// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { LiveMatch } from "@aegis/shared/protocol/LiveMatch";
import { I18nProvider } from "../i18n";
import { LiveMatchList } from "./LiveMatchList";

afterEach(cleanup);

const NOW = 1_000_000_000;

function match(index: number): LiveMatch {
  return {
    spectatorCode: `CODE${index}`.padEnd(6, "X"),
    players: [`Player${index}`, `Rival${index}`],
    format: "standard",
    startedAt: NOW - 12 * 60_000,
    spectators: index,
  };
}

function renderList(
  matches: LiveMatch[],
  { total = matches.length, onWatch = vi.fn<(code: string) => void>(), onShowMore = vi.fn<() => void>() } = {},
) {
  render(
    <I18nProvider>
      <LiveMatchList matches={matches} total={total} now={NOW} onWatch={onWatch} onShowMore={onShowMore} />
    </I18nProvider>,
  );
  return { onWatch, onShowMore };
}

it("shows both players, elapsed time and spectators, and watches by the listed code", () => {
  const { onWatch } = renderList([match(3)]);
  const row = screen.getByRole("listitem");
  expect(within(row).getByText("Player3")).toBeTruthy();
  expect(within(row).getByText("Rival3")).toBeTruthy();
  expect(within(row).getByText("12 min")).toBeTruthy();
  expect(within(row).getByLabelText("3 watching")).toBeTruthy();
  fireEvent.click(within(row).getByRole("button", { name: "Watch Player3 vs Rival3" }));
  expect(onWatch).toHaveBeenCalledWith(match(3).spectatorCode);
});

it("offers the next page with the count of matches not loaded yet", () => {
  const { onShowMore } = renderList([1, 2, 3].map(match), { total: 7 });
  expect(screen.getAllByRole("listitem")).toHaveLength(3);
  fireEvent.click(screen.getByRole("button", { name: "Show more (4)" }));
  expect(onShowMore).toHaveBeenCalledTimes(1);
});

it("hides the next page control once every match is loaded", () => {
  renderList([1, 2].map(match), { total: 2 });
  expect(screen.queryByRole("button", { name: /Show more/ })).toBeNull();
});

it("explains the empty list", () => {
  renderList([]);
  expect(screen.getByText("No live matches right now.")).toBeTruthy();
  expect(screen.queryByRole("list")).toBeNull();
});

it("labels hidden identities by seat without changing the watch target", () => {
  const { onWatch } = renderList([{ ...match(1), players: ["", "Sora"] }]);
  fireEvent.click(screen.getByRole("button", { name: "Watch Player 1 vs Sora" }));
  expect(onWatch).toHaveBeenCalledWith(match(1).spectatorCode);
});
