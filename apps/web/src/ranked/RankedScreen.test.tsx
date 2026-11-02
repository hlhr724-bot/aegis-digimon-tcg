import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { I18nProvider } from "@/i18n";
import { RankedScreen } from "@/ranked/RankedScreen";

const standing = {
  accountId: "one",
  displayName: "Player One",
  position: 1,
  rating: 1210,
  peakRating: 1210,
  tier: "gold",
  region: "south_america",
  wins: 8,
  losses: 2,
  draws: 0,
  games: 10,
  winrate: 0.8,
  provisional: false,
};
const season = {
  id: 1,
  startsAt: Date.UTC(2026, 9, 12),
  endsAt: Date.UTC(2026, 11, 7),
  finalized: false,
  formats: ["standard"],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mockApi(seasonList = [season]) {
  const fetcher = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
    async (url: string, init?: RequestInit) => {
      let body: unknown = {};
      if (url.includes("/ranked/seasons")) {
        body = seasonList;
      }
      if (url.includes("/ranked/leaderboard")) {
        body = { season, entries: [standing], mine: standing, total: 1, page: 1 };
      }
      if (url.includes("/ranked/players/")) {
        body = [
          {
            id: "deck-snapshot",
            name: "Greymon deck",
            archetype: "Greymon",
            matches: 12,
            wins: 8,
            losses: 3,
            draws: 1,
            winrate: 8 / 12,
            lastPlayedAt: 1791763200000,
            publicDeckId: null,
            list: null,
            history: [
              {
                matchId: "played-game",
                opponentName: "Player Two",
                result: "win",
                finishedAt: 1791763200000,
                ratingChange: 16,
              },
            ],
          },
        ];
      }
      if (url.includes("/ranked/meta")) {
        body = [
          { archetype: "Greymon", games: 40, players: 12, wins: 24, winrate: 0.6 },
          { archetype: "unknown", games: 20, players: 8, wins: 6, winrate: null },
        ];
      }
      if (url.includes("/ranked/matchups")) {
        body = [
          {
            archetype: "Greymon",
            opponentArchetype: "Garurumon",
            games: 12,
            players: 4,
            wins: 8,
            losses: 4,
            draws: 0,
            winrate: null,
          },
        ];
      }
      if (url.includes("/ranked/reports") && !url.includes("/admin/") && init?.method !== "POST") {
        body = {
          seasonId: 1,
          limit: 5,
          used: 1,
          reportable: [
            {
              pairId: "00000000-0000-4000-8000-000000000001",
              seasonId: 1,
              format: "BT10",
              opponentName: "Player Two",
              finishedAt: Date.UTC(2026, 9, 20),
              reportDeadline: Date.UTC(2026, 9, 21),
              remainingReports: 4,
            },
          ],
          reports: [],
        };
      }
      if (url.includes("/account/admin/ranked/reports") && init?.method !== "POST") {
        body = [
          {
            id: "00000000-0000-4000-8000-000000000009",
            pairId: "00000000-0000-4000-8000-000000000008",
            matchId: "00000000-0000-4000-8000-000000000007",
            seasonId: 1,
            format: "BT10",
            reporterName: "Player Three",
            opponentName: "Player Four",
            turn: 6,
            description: "Blocker ignored",
            createdAt: Date.UTC(2026, 9, 20),
            finishedAt: Date.UTC(2026, 9, 20),
            hasReplay: true,
          },
        ];
      }
      if (url.includes("/ranked/rewards") && init?.method !== "POST") {
        body = {
          items: [{ seasonId: 1, tier: "gold", equipped: false, grantedAt: 1 }],
          discordEnabled: false,
          discordOptIn: false,
          discordStatus: null,
        };
      }
      return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  );
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
function showScreen(canJudge = false) {
  return render(
    <I18nProvider>
      <RankedScreen signedIn canJudge={canJudge} onPlay={() => {}} />
    </I18nProvider>,
  );
}

it("uses the signed-in player's avatar in the season card and reward previews", async () => {
  mockApi();
  render(
    <I18nProvider>
      <RankedScreen
        signedIn
        player={{
          name: "Current Player",
          color: "Blue",
          shards: 0,
          avatarUrl: "https://example.test/current-player.png",
        }}
        onPlay={() => undefined}
      />
    </I18nProvider>,
  );
  const mine = await screen.findByRole("region", { name: "Your season" });
  await waitFor(() =>
    expect(mine.querySelector("img")?.getAttribute("src")).toBe("https://example.test/current-player.png"),
  );
  fireEvent.click(screen.getByRole("button", { name: /^Rewards$/ }));
  const rewards = await screen.findByRole("region", { name: "Rewards" });
  expect(rewards.querySelectorAll('img[src="https://example.test/current-player.png"]').length).toBeGreaterThanOrEqual(
    5,
  );
});

describe("ranked season screen", () => {
  it("previews the immediately following season when the API returns seasons newest first", async () => {
    const duration = season.endsAt - season.startsAt;
    mockApi([
      { ...season, id: 3, startsAt: season.endsAt + duration, endsAt: season.endsAt + 2 * duration, formats: ["BT10"] },
      { ...season, id: 2, startsAt: season.endsAt, endsAt: season.endsAt + duration, formats: ["BT5"] },
      season,
    ]);
    showScreen();
    expect(await screen.findByText("BT5")).toBeTruthy();
    const preview = screen.getByText("Next season").closest("section")!;
    expect(within(preview).queryByText("BT10")).toBeNull();
  });

  it("keeps future formats unannounced instead of inventing next season rules", async () => {
    mockApi();
    showScreen();
    expect(await screen.findByText("Formats to be announced")).toBeTruthy();
    expect(screen.queryByText("EX Alternative")).toBeNull();
    fireEvent.click(screen.getByText("View format rules"));
    expect(screen.getByText(/Your saved deck must be legal/)).toBeTruthy();
  });
  it("shows win share separately from win rate and keeps unidentified samples visible", async () => {
    const fetcher = mockApi();
    showScreen();
    await screen.findByRole("button", { name: "Player One" });
    fireEvent.click(screen.getByRole("button", { name: "Meta" }));
    expect(await screen.findByRole("img", { name: "Winning decks" })).toBeTruthy();
    expect(screen.getAllByText("80%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("60%").length).toBeGreaterThan(0);
    expect(screen.getByText("Insufficient sample")).toBeTruthy();
    expect(screen.getAllByText("Unidentified").length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("Region"), { target: { value: "europe" } });
    await waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith(expect.stringMatching(/ranked\/meta\?.*region=europe/), expect.anything()),
    );
  });
  it("opens player deck results and history without exposing an unpublished list", async () => {
    const showModal = vi.fn<(this: HTMLDialogElement) => void>(function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    });
    const close = vi.fn<(this: HTMLDialogElement) => void>(function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    });
    Object.defineProperties(HTMLDialogElement.prototype, {
      showModal: { configurable: true, value: showModal },
      close: { configurable: true, value: close },
    });
    mockApi();
    showScreen();
    fireEvent.click(await screen.findByRole("button", { name: "Player One" }));
    expect(screen.getByRole("dialog", { name: "Player One" })).toBeTruthy();
    expect(await screen.findByText("Greymon deck")).toBeTruthy();
    expect(screen.queryByText("Private")).toBeNull();
    expect(screen.getByText("The card list has not been published.")).toBeTruthy();
    expect(screen.queryByText("View list")).toBeNull();
    fireEvent.click(screen.getByText("Match history"));
    expect(screen.getByText("Player Two")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close player details" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(showModal).toHaveBeenCalled();
    Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
    Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
  });

  it("shows player records and only offers the curated Standard format for season one", async () => {
    const fetcher = mockApi();
    showScreen();
    expect((await screen.findAllByText("Player One")).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/80%/).length).toBeGreaterThan(0);
    const format = screen.getByLabelText("Format") as HTMLSelectElement;
    expect(Array.from(format.options, (option) => option.value)).toEqual(["standard"]);
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining("format=standard"), expect.anything());
  });
  it("hides winrate for insufficient samples and filters local match sources", async () => {
    mockApi();
    showScreen();
    fireEvent.click(screen.getByRole("button", { name: "Matchups" }));
    expect(await screen.findByText("Insufficient sample")).toBeTruthy();
    expect(screen.getByText("Greymon")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Match source"), { target: { value: "tournament" } });
  });
  it("equips a reward through the authenticated API", async () => {
    const fetcher = mockApi();
    showScreen();
    fireEvent.click(screen.getByRole("button", { name: "Rewards" }));
    fireEvent.click(await screen.findByRole("button", { name: "Equip" }));
    await waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith(
        expect.stringContaining("/ranked/rewards/equip"),
        expect.objectContaining({ method: "POST", body: '{"seasonId":1}', credentials: "include" }),
      ),
    );
  });
  it("files a bug report for a recent ranked loss with the turn and a description", async () => {
    const fetcher = mockApi();
    showScreen();
    fireEvent.click(screen.getByRole("button", { name: "Reports" }));
    expect(await screen.findByText("1 of 5 reports used this season")).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: "Report a bug" }));
    const submit = screen.getByRole("button", { name: "Send report" });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Turn number"), { target: { value: "7" } });
    fireEvent.change(screen.getByLabelText("What happened?"), { target: { value: "  Blocker ignored  " } });
    fireEvent.click(submit);
    await waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith(
        expect.stringContaining("/ranked/reports"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            pairId: "00000000-0000-4000-8000-000000000001",
            turn: 7,
            description: "Blocker ignored",
          }),
        }),
      ),
    );
    expect(await screen.findByText(/Report sent/)).toBeTruthy();
  });
  it("shows the review queue only to admins and sends their ruling", async () => {
    const fetcher = mockApi();
    showScreen(true);
    fireEvent.click(screen.getByRole("button", { name: "Reports" }));
    expect(await screen.findByText("Player Three lost to Player Four · Season 1 · BT10")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Download replay" }).getAttribute("href")).toContain(
      "/account/admin/ranked/reports/00000000-0000-4000-8000-000000000009/replay",
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm and void game" }));
    await waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith(
        expect.stringContaining("/account/admin/ranked/reports/00000000-0000-4000-8000-000000000009/ruling"),
        expect.objectContaining({ method: "POST", body: '{"ruling":"confirmed"}' }),
      ),
    );
  });
  it("hides the review queue from players", async () => {
    const fetcher = mockApi();
    showScreen();
    fireEvent.click(screen.getByRole("button", { name: "Reports" }));
    expect(await screen.findByText("Games you can report")).toBeTruthy();
    expect(screen.queryByText("Pending reports")).toBeNull();
    expect(fetcher.mock.calls.some(([url]) => String(url).includes("/admin/"))).toBe(false);
  });
});
