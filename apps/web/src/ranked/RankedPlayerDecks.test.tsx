import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "@/i18n/I18nProvider";
import { RankedPlayerDecks } from "@/ranked/RankedPlayerDecks";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("shows a published historical list and expands the complete match history", async () => {
  const fetcher = vi.fn<typeof fetch>(
    async () =>
      new Response(
        JSON.stringify([
          {
            id: "composition",
            name: "Published Greymon",
            archetype: "Greymon",
            matches: 12,
            wins: 12,
            losses: 0,
            draws: 0,
            winrate: 1,
            lastPlayedAt: 1000,
            publicDeckId: "publication",
            list: { mainDeck: ["BT1-010", "BT1-010"], eggDeck: ["BT1-001"] },
            history: Array.from({ length: 12 }, (_, index) => ({
              matchId: `match-${index}`,
              opponentName: `Opponent ${index + 1}`,
              result: "win",
              finishedAt: 1000 - index,
              ratingChange: 16,
            })),
          },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
  );
  vi.stubGlobal("fetch", fetcher);
  render(
    <I18nProvider>
      <RankedPlayerDecks accountId="player" seasonId={2} format="BT10" />
    </I18nProvider>,
  );
  expect(await screen.findByText("Published Greymon")).toBeTruthy();
  expect(fetcher).toHaveBeenCalledWith(
    expect.stringContaining("/ranked/players/player/decks?season=2&format=BT10"),
    expect.anything(),
  );
  fireEvent.click(screen.getByText("View list"));
  expect(screen.getByText("Main deck · 2")).toBeTruthy();
  expect(screen.getByText("Digi-Egg deck · 1")).toBeTruthy();
  expect(screen.getByText(/2 ×/)).toBeTruthy();
  fireEvent.click(screen.getByText("Match history"));
  expect(screen.queryByText("Opponent 12")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Show more" }));
  expect(screen.getByText("Opponent 12")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  expect(screen.queryByText("Private")).toBeNull();
});
