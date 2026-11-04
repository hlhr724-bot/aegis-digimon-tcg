import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CommunityDeckSummary } from "@aegis/shared";
import type { MatchupJob } from "@aegis/shared/deckSimulation/MatchupJob";
import { matchupDeckKey } from "@aegis/shared/deckSimulation/matchupDeckKey";
import type { SavedMatchupResult } from "@aegis/shared/deckSimulation/SavedMatchupResult";
import { I18nProvider } from "@/i18n/I18nProvider";
import { DeckMatchup } from "@/screens/deckSimulation/DeckMatchup";

const MAIN_DECK = [
  ...Array<string>(4).fill("BT1-009"),
  ...Array<string>(4).fill("BT1-010"),
  ...Array<string>(4).fill("BT1-085"),
  ...Array<string>(2).fill("BT1-090"),
  ...Array<string>(36).fill("BT1-084"),
];

const finishedJob: MatchupJob = {
  id: "00000000-0000-4000-8000-000000000000",
  status: "completed",
  requestedGames: 20,
  completedGames: 20,
  wins: 12,
  losses: 7,
  draws: 1,
  invalidGames: 0,
  score: 0.625,
  interval: [0.41, 0.8],
  opponents: [
    {
      name: "",
      requestedGames: 20,
      completedGames: 20,
      wins: 12,
      losses: 7,
      draws: 1,
      invalidGames: 0,
      score: 0.625,
      interval: [0.41, 0.8],
    },
  ],
  samples: [{ index: 0, opponentIndex: 0, wentFirst: true, result: "win", reason: "security", turns: 9 }],
  createdAt: "2026-11-02T00:00:00.000Z",
  expiresAt: "2026-11-02T00:15:00.000Z",
};

function communityDeck(id: string, name: string, likeCount: number): CommunityDeckSummary {
  return {
    id,
    name,
    author: { id: `author-${id}`, displayName: `Author ${name}` },
    colors: ["Red"],
    coverCardId: "BT1-009",
    likeCount,
    copyCount: 0,
    likedByMe: false,
    hasGuide: false,
    legal: true,
    publishedAt: 0,
    updatedAt: 0,
  };
}

type FetchMock = ReturnType<typeof vi.fn<(path: string, init?: RequestInit) => Promise<Response>>>;

function stubFetch(
  respond: (path: string) => Response,
  communityDecks: CommunityDeckSummary[] = [],
  saved?: SavedMatchupResult,
): FetchMock {
  const fetch = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>(async (path) => {
    if (String(path).includes("/community/decks")) {
      return new Response(JSON.stringify({ decks: communityDecks, hasMore: false }), { status: 200 });
    }
    if (String(path).includes("/latest-matchup")) {
      return saved === undefined ? new Response("", { status: 404 }) : new Response(JSON.stringify(saved));
    }
    return respond(String(path));
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function startBody(fetch: FetchMock) {
  const call = fetch.mock.calls.find(([path]) => String(path).endsWith("/account/deck-simulations/matchups"))!;
  return JSON.parse(String(call[1]?.body));
}

function renderMatchup() {
  return render(
    <I18nProvider>
      <DeckMatchup
        deckId="deck-1"
        mainDeck={MAIN_DECK}
        eggDeck={[]}
        format="standard"
        art={{ coverCardId: "BT1-009", color: "Red" }}
      />
    </I18nProvider>,
  );
}

describe("DeckMatchup", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("plays the mirror match and explains the win rate, its range and the sample games", async () => {
    const fetch = stubFetch(() => new Response(JSON.stringify(finishedJob), { status: 202 }));
    renderMatchup();
    fireEvent.click(screen.getByRole("button", { name: "Mirror" }));
    fireEvent.click(screen.getByRole("button", { name: "Start test" }));
    expect(await screen.findByRole("group", { name: "Win rate 63%" })).toBeTruthy();
    expect(screen.getByText("Too close to call")).toBeTruthy();
    expect(screen.getByText("12 wins, 7 losses, 1 draws")).toBeTruthy();
    expect(screen.getByText(/probably between 41% and 80%\. The range crosses 50%/)).toBeTruthy();
    const sample = within(screen.getByRole("list", { name: "Watch sample games" })).getByRole("listitem");
    expect(within(sample).getByText("win")).toBeTruthy();
    expect(within(sample).getByText("9 turns · Going first")).toBeTruthy();
    const body = startBody(fetch);
    expect(body.opponent).toEqual({ mirror: true });
    expect(body.games).toBe(20);
    expect(body.deck.mainDeck).toHaveLength(50);
    expect(body.deckId).toBe("deck-1");
  });

  it("shows the last saved result for the deck when the page opens", async () => {
    const fetch = stubFetch(() => new Response("", { status: 500 }), [], {
      deckKey: matchupDeckKey({ mainDeck: MAIN_DECK, eggDeck: [] }),
      savedAt: "2026-11-03T12:00:00.000Z",
      job: { ...finishedJob, samples: [] },
    });
    renderMatchup();
    expect(await screen.findByRole("heading", { name: /Last saved result/ })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Win rate 63%" })).toBeTruthy();
    expect(screen.queryByText(/Your deck changed since this test/)).toBeNull();
    expect(screen.getByRole("button", { name: "Run again" })).toBeTruthy();
    expect(fetch.mock.calls.some(([path]) => String(path).endsWith("/decks/deck-1/latest-matchup"))).toBe(true);
  });

  it("warns that a saved result is outdated when the deck changed after the test", async () => {
    stubFetch(() => new Response("", { status: 500 }), [], {
      deckKey: "an older list",
      savedAt: "2026-11-03T12:00:00.000Z",
      job: { ...finishedJob, samples: [] },
    });
    renderMatchup();
    expect(await screen.findByText(/Your deck changed since this test/)).toBeTruthy();
  });

  it("starts on community decks, sends the picked decks and ranks each matchup with a verdict", async () => {
    const tally = (name: string, score: number, communityDeckId: string) => ({
      name,
      communityDeckId,
      requestedGames: 4,
      completedGames: 4,
      wins: score * 4,
      losses: 4 - score * 4,
      draws: 0,
      invalidGames: 0,
      score,
      interval: [Math.max(0, score - 0.3), Math.min(1, score + 0.3)] as const,
    });
    const easyId = "22222222-2222-4222-8222-222222222222";
    const communityJob: MatchupJob = {
      ...finishedJob,
      requestedGames: 12,
      completedGames: 12,
      opponents: [
        tally("Middle", 0.5, "11111111-1111-4111-8111-111111111111"),
        tally("Easy", 1, easyId),
        tally("Hard", 0, "33333333-3333-4333-8333-333333333333"),
      ],
      samples: [],
    };
    const fetch = stubFetch(
      () => new Response(JSON.stringify(communityJob), { status: 202 }),
      [communityDeck(easyId, "Easy", 9)],
    );
    renderMatchup();
    expect(screen.getByText("Pick up to 5 decks. Pick none to face the 5 most liked.")).toBeTruthy();
    const tile = await screen.findByRole("button", { name: "Easy by Author Easy" });
    fireEvent.click(tile);
    expect(tile.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("1 of 5 picked")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Start test" }));
    const list = await screen.findByRole("region", { name: "Against each deck" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows.map((row) => row.querySelector(".deck-matchup__opponent-name")?.textContent)).toEqual([
      "Easy",
      "Middle",
      "Hard",
    ]);
    expect(within(rows[0]!).getByText("Favored")).toBeTruthy();
    expect(within(rows[1]!).getByText("Close")).toBeTruthy();
    expect(within(rows[2]!).getByText("Behind")).toBeTruthy();
    const body = startBody(fetch);
    expect(body.opponent).toEqual({ community: { deckIds: [easyId] } });
    expect(body.games).toBe(4);
  });

  it("keeps checking the job on the API process that started it", async () => {
    const owner = "api/red/p2";
    const running: MatchupJob = {
      ...finishedJob,
      status: "running",
      owner,
      completedGames: 0,
      score: null,
      interval: null,
    };
    const fetch = stubFetch((path) =>
      path.endsWith("/account/deck-simulations/matchups")
        ? new Response(JSON.stringify(running), { status: 202 })
        : new Response(JSON.stringify({ ...finishedJob, owner }), { status: 200 }),
    );
    renderMatchup();
    fireEvent.click(screen.getByRole("button", { name: "Mirror" }));
    fireEvent.click(screen.getByRole("button", { name: "Start test" }));
    expect(await screen.findByRole("group", { name: "Win rate 63%" }, { timeout: 4000 })).toBeTruthy();
    const polls = fetch.mock.calls.map(([path]) => String(path)).filter((path) => path.includes(finishedJob.id));
    expect(polls.length).toBeGreaterThan(0);
    expect(polls.every((path) => path.endsWith(`/${owner}/account/deck-simulations/matchups/${finishedJob.id}`))).toBe(
      true,
    );
  });

  it("names the deck-building problem when the server refuses the deck", async () => {
    stubFetch(() => new Response(JSON.stringify({ error: "invalid_deck" }), { status: 400 }));
    renderMatchup();
    fireEvent.click(screen.getByRole("button", { name: "Start test" }));
    expect(
      await screen.findByText("Your deck breaks a deck-building rule. Open it in the editor to fix it."),
    ).toBeTruthy();
  });

  it("asks the server for the sample replay and explains when it has expired", async () => {
    const fetch = stubFetch((path) =>
      path.includes("/replays/")
        ? new Response("", { status: 404 })
        : new Response(JSON.stringify(finishedJob), { status: 202 }),
    );
    renderMatchup();
    fireEvent.click(screen.getByRole("button", { name: "Mirror" }));
    fireEvent.click(screen.getByRole("button", { name: "Start test" }));
    fireEvent.click(await screen.findByRole("button", { name: "Watch game 1 turn by turn" }));
    expect(
      await screen.findByText("This sample game is no longer available. Run the matchup again to watch it."),
    ).toBeTruthy();
    expect(fetch.mock.calls.some(([path]) => String(path).endsWith(`/matchups/${finishedJob.id}/replays/0`))).toBe(
      true,
    );
  });

  it("explains a conflict with a matchup that is still running", async () => {
    stubFetch(() => new Response(JSON.stringify({ error: "job_in_progress" }), { status: 409 }));
    renderMatchup();
    fireEvent.click(screen.getByRole("button", { name: "Start test" }));
    expect(await screen.findByText("Your other matchup is still running.")).toBeTruthy();
  });
});
