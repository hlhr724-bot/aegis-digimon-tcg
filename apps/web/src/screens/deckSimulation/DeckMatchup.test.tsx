import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MatchupJob } from "@aegis/shared/deckSimulation/MatchupJob";
import { I18nProvider } from "@/i18n/I18nProvider";
import { DeckMatchup } from "@/screens/deckSimulation/DeckMatchup";

const FULL_DECK = { "BT1-009": 4, "BT1-010": 4, "BT1-085": 4, "BT1-090": 2, "BT1-084": 36 };

const finishedJob: MatchupJob = {
  id: "00000000-0000-4000-8000-000000000000",
  status: "completed",
  opponentName: "Red Aggro",
  requestedGames: 20,
  completedGames: 20,
  wins: 12,
  losses: 7,
  draws: 1,
  invalidGames: 0,
  score: 0.625,
  interval: [0.41, 0.8],
  samples: [{ index: 0, wentFirst: true, result: "win", reason: "security", turns: 9 }],
  createdAt: "2026-11-02T00:00:00.000Z",
  expiresAt: "2026-11-02T00:15:00.000Z",
};

function renderMatchup(main: Record<string, number>) {
  return render(
    <I18nProvider>
      <DeckMatchup main={main} egg={{}} format="standard" />
    </I18nProvider>,
  );
}

describe("DeckMatchup", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("keeps the run button off until the main deck is complete", () => {
    renderMatchup({ "BT1-009": 4 });
    expect((screen.getByRole("button", { name: "Run matchup" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("sends the edited deck and shows the win rate, its range and the sample games", async () => {
    const fetch = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>(
      async () => new Response(JSON.stringify(finishedJob), { status: 202 }),
    );
    vi.stubGlobal("fetch", fetch);
    renderMatchup(FULL_DECK);
    fireEvent.click(screen.getByRole("button", { name: "Run matchup" }));
    expect(await screen.findByText("Win rate 63%")).toBeTruthy();
    expect(screen.getByText("95% range 41% to 80%")).toBeTruthy();
    expect(screen.getByText("12 wins, 7 losses, 1 draws")).toBeTruthy();
    expect(screen.getByText("Game 1: win in 9 turns, Going first")).toBeTruthy();
    const [path, init] = fetch.mock.calls[0]!;
    expect(path).toMatch(/\/account\/deck-simulations\/matchups$/);
    const body = JSON.parse(String(init?.body));
    expect(body.opponent).toEqual({ mirror: true });
    expect(body.games).toBe(20);
    expect(body.deck.mainDeck).toHaveLength(50);
  });

  it("explains a conflict with a matchup that is still running", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<() => Promise<Response>>(
        async () => new Response(JSON.stringify({ error: "job_in_progress" }), { status: 409 }),
      ),
    );
    renderMatchup(FULL_DECK);
    fireEvent.click(screen.getByRole("button", { name: "Run matchup" }));
    expect(await screen.findByText("Your other matchup is still running.")).toBeTruthy();
  });
});
