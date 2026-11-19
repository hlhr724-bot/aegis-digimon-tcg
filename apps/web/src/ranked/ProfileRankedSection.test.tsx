// @vitest-environment jsdom
import type { RankedLeaderboard, RankedStanding } from "@aegis/shared/ranked/RankedContracts";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/I18nProvider";
import { ProfileRankedSection } from "@/ranked/ProfileRankedSection";

const STANDING: RankedStanding = {
  accountId: "account-1",
  displayName: "Vinicius",
  position: 7,
  rating: 1540,
  peakRating: 1602,
  tier: "gold",
  region: null,
  wins: 21,
  losses: 9,
  draws: 1,
  games: 31,
  winrate: 0.7,
  provisional: false,
};

function stubLeaderboard(mine: RankedStanding | null, status = 200) {
  const board: RankedLeaderboard = {
    season: { id: 2, startsAt: 0, endsAt: 1, finalized: false, formats: ["standard"] },
    entries: [],
    mine,
    page: 1,
    total: 0,
  };
  const fetcher = vi.fn<typeof fetch>(
    async () =>
      new Response(JSON.stringify(status === 200 ? board : { error: "ranked_unavailable" }), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

function renderSection() {
  render(
    <I18nProvider>
      <ProfileRankedSection />
    </I18nProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("shows the player's current season figures with a link to the ranked page", async () => {
  const fetcher = stubLeaderboard(STANDING);
  renderSection();

  const section = await screen.findByRole("region", { name: "Ranked season" });
  expect(fetcher).toHaveBeenCalledWith(expect.stringContaining("/ranked/leaderboard"), expect.anything());
  expect(section.textContent).toContain("Gold");
  expect(section.textContent).toContain("1,540");
  expect(section.textContent).toContain("#7");
  expect(section.textContent).toContain("21 / 9 / 1");
  expect(section.textContent).toContain("70%");
  expect(section.textContent).toContain("1,602");
  expect(screen.getByRole("link", { name: "View ranked details" }).getAttribute("href")).toBe("/ranked");
});

it("shows an empty state with the ranked link instead of zeros before the first ranked game", async () => {
  stubLeaderboard(null);
  renderSection();

  expect(await screen.findByText("Not yet ranked this season")).toBeTruthy();
  expect(screen.getByRole("link", { name: "View ranked details" })).toBeTruthy();
  expect(screen.queryByText("Rating")).toBeNull();
});

it("hides the section when ranked play is unavailable", async () => {
  const fetcher = stubLeaderboard(null, 404);
  renderSection();

  await waitFor(() => expect(fetcher).toHaveBeenCalled());
  expect(screen.queryByRole("region", { name: "Ranked season" })).toBeNull();
});
