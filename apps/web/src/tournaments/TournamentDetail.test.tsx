import { TournamentRegisteredDeck } from "@/tournaments/TournamentRegisteredDeck";
import { TournamentRuntimeControls } from "@/tournaments/TournamentRuntimeControls";
// @vitest-environment jsdom
import { TournamentMatchHistory } from "@/tournaments/TournamentMatchHistory";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TournamentPairingControls } from "@/tournaments/TournamentPairingControls";
import { TournamentMatchActions } from "@/tournaments/TournamentMatchActions";
import { I18nProvider } from "../i18n";
import { resetServerClock } from "./serverClock";
import { TournamentDetail } from "./TournamentDetail";
import type { TournamentDetail as TournamentDetailPayload } from "./types";
import { TournamentTab } from "@/tournaments/TournamentTab";
import { loadDictionary } from "@/i18n/loadDictionary";
import { loadCardTranslations } from "@/i18n/loadCardTranslations";
import { translator } from "@/i18n/translator";

const RULES_FOR_FORMAT = {
  match: { winsRequired: 2, swissDurationMs: null, topCutDurationMs: null, finalDurationMs: null, overtimeMs: 0 },
  attendance: { joinGraceMs: 0, gameLossAtMs: null, matchLossAtMs: 0 },
  timeout: { swiss: "draw", elimination: "extra_turns_then_state_tiebreak" },
  standings: { winPoints: 3, drawPoints: 1, lossPoints: 0, byePoints: 3, tiebreakers: [] as string[] },
} satisfies NonNullable<TournamentDetailPayload["rules"]>;

const DETAIL: TournamentDetailPayload = {
  id: "t-1",
  name: "Regional qualifier",
  status: "check_in",
  structure: "swiss",
  topCutEnabled: true,
  topCutSize: null,
  bestOf: 3,
  allowBots: false,
  startsAt: Date.parse("2026-08-13T18:00:00.000Z"),
  maxPlayers: 32,
  registeredCount: 2,
  banlistPolicy: { mode: "current" },
  block: "BT10",
  createdBy: "acc-organizer",
  winnerAccountId: null,
  rules: null,
  banlistCards: [
    { cardId: "BT2-047", status: "restricted", allowedCopies: 1 },
    { cardId: "BT5-109", status: "banned", allowedCopies: 0 },
    { cardId: "EX2-007", status: "banned_pair", allowedCopies: 4, pairPartnerIds: ["BT7-072"] },
  ],
  matches: [],
  participants: [
    { id: "p-1", accountId: "acc-player", kind: "human", displayName: "Tamer One", status: "checked_in", seed: 1 },
    { id: "p-2", kind: "bot", displayName: "Bot Two", status: "registered", seed: null },
  ],
};

function mockDetail(
  payload: Partial<TournamentDetailPayload> = {},
  extra: Record<string, { status?: number; body: unknown }> = {},
) {
  const routes: Record<string, { status?: number; body: unknown }> = {
    "GET /tournaments/t-1": { body: { ...DETAIL, ...payload } },
    ...extra,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const key = `${init?.method ?? "GET"} ${new URL(String(input)).pathname}`;
      const route = routes[key] ?? { status: 404, body: { error: "tournament_not_found" } };
      return new Response(JSON.stringify(route.body), {
        status: route.status ?? 200,
        headers: { "Content-Type": "application/json", Date: new Date().toUTCString() },
      });
    }),
  );
}

const COMPLETE_DECK = Array.from({ length: 50 }, () => "ST1-01");

function renderDetail(accountId?: string, accountDisplayName?: string, accountIsAdmin = false, tab?: TournamentTab) {
  return render(
    <I18nProvider>
      <TournamentDetail
        id="t-1"
        tab={tab}
        onTabChange={() => undefined}
        accountId={accountId}
        accountDisplayName={accountDisplayName}
        accountIsAdmin={accountIsAdmin}
        decks={[{ id: "deck-1", name: "Red aggro", mainDeck: COMPLETE_DECK, eggDeck: [], color: "Red", blurb: "" }]}
        onBack={() => undefined}
      />
    </I18nProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetServerClock();
});

describe("tournament detail", () => {
  it("keeps the Discord channel link available after the tournament finishes", async () => {
    const discordUrl = "https://discord.com/channels/1525646227608178798/1564793178366673027";
    mockDetail({ status: "finished", discordUrl });
    renderDetail();
    const link = await screen.findByRole("link", { name: "Open tournament on Discord" });
    expect(link.getAttribute("href")).toBe(discordUrl);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("does not offer a Discord link before a channel exists", async () => {
    mockDetail({ discordUrl: null });
    renderDetail();
    await screen.findByText("Regional qualifier");
    expect(screen.queryByRole("link", { name: "Open tournament on Discord" })).toBeNull();
  });

  it("blocks participation and offers the sign-in call to action when signed out", async () => {
    mockDetail({}, { "GET /auth/me": { body: null } });
    renderDetail(undefined);

    // The sign-in block from Settings, inline: the player can act, not just read a refusal.
    expect(await screen.findByRole("button", { name: /Sign in with Discord/ })).toBeTruthy();
    // No participation action is offered without an account.
    expect(screen.queryByRole("button", { name: "Sign up" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Check in" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Drop out" })).toBeNull();
  });

  it("hides dropping for an account without a tournament registration", async () => {
    mockDetail();
    renderDetail("acc-spectator");

    await screen.findByRole("heading", { name: "Your entry" });
    expect(screen.queryByRole("button", { name: "Drop out" })).toBeNull();
  });

  it("renders the frozen banlist with card names, status and allowed copies", async () => {
    mockDetail();
    renderDetail("acc-player", undefined, false, TournamentTab.RULES.value);

    const banlist = (await screen.findByRole("heading", { name: "Banned cards in this event" })).closest(
      ".aegis-panel",
    ) as HTMLElement;
    // Names, not bare ids: resolved through the shared card data.
    expect(within(banlist).getByText("Argomon")).toBeTruthy();
    expect(within(banlist).getByText("Mega Digimon Fusion!")).toBeTruthy();
    expect(within(banlist).getByText("Restricted")).toBeTruthy();
    expect(within(banlist).getByText("Banned")).toBeTruthy();
    expect(within(banlist).getByText("Banned pair")).toBeTruthy();
    expect(within(banlist).getByText("1 copies allowed")).toBeTruthy();
    expect(within(banlist).getByText("0 copies allowed")).toBeTruthy();
    // The pair partner is named too, so a player is not left holding a card id.
    expect(within(banlist).getByText("Cannot share a deck with Eyesmon")).toBeTruthy();
    // The id stays visible alongside the name for deck-list cross-checking.
    expect(within(banlist).getByText("BT2-047")).toBeTruthy();
  });

  it("says there are no restrictions when the policy is unrestricted", async () => {
    mockDetail({ banlistPolicy: { mode: "none" }, banlistCards: [] });
    renderDetail("acc-player", undefined, false, TournamentTab.RULES.value);
    expect(await screen.findByText("No restrictions here: bring any legal deck.")).toBeTruthy();
  });

  it("lists participants with their status and marks bots", async () => {
    mockDetail();
    renderDetail("acc-player", undefined, false, TournamentTab.PLAYERS.value);
    const participants = (await screen.findByRole("heading", { name: "Players" })).closest(
      ".aegis-panel",
    ) as HTMLElement;
    expect(within(participants).getByText("Tamer One")).toBeTruthy();
    expect(within(participants).getByText("Checked in")).toBeTruthy();
    expect(within(participants).getByText("Bot")).toBeTruthy();
    expect(within(participants).getByText("Signed up")).toBeTruthy();
  });

  it("shows the standings empty state until the server sends standings", async () => {
    mockDetail();
    renderDetail("acc-player", undefined, false, TournamentTab.BRACKET.value);
    expect(await screen.findByText("Standings show up after the first round is scored.")).toBeTruthy();
  });

  it("renders standings when a later slice starts sending them", async () => {
    mockDetail({
      standings: [
        {
          participantId: "p-1",
          rank: 1,
          points: 9,
          matchWinRate: 1,
          opponentMatchWinRate: 0.5,
          wins: 3,
          losses: 0,
          draws: 0,
          byes: 0,
        },
      ],
    });
    renderDetail("acc-player", undefined, false, TournamentTab.BRACKET.value);
    const standings = (await screen.findByRole("heading", { name: "Standings" })).closest(
      ".aegis-panel",
    ) as HTMLElement;
    const row = within(standings).getByRole("row", { name: /Tamer One/ });
    expect(within(row).getByText("9")).toBeTruthy();
    expect(within(row).getByText("3-0-0")).toBeTruthy();
    expect(within(row).getByText("100.0%")).toBeTruthy();
    expect(within(row).getByText("50.0%")).toBeTruthy();
    expect(within(standings).getByRole("columnheader", { name: "OMW%" })).toBeTruthy();
  });

  it("lists only players who are still in the event", async () => {
    mockDetail({
      participants: [
        ...DETAIL.participants,
        { id: "p-3", accountId: "acc-gone", kind: "human", displayName: "Gone Tamer", status: "dropped", seed: null },
      ],
    });
    renderDetail("acc-player", undefined, false, TournamentTab.PLAYERS.value);
    const participants = (await screen.findByRole("heading", { name: "Players" })).closest(
      ".aegis-panel",
    ) as HTMLElement;
    expect(within(participants).getByText("Tamer One")).toBeTruthy();
    expect(within(participants).queryByText("Gone Tamer")).toBeNull();
    expect(within(participants).queryByText("Dropped out")).toBeNull();
  });

  it("adds the actual start of each round to the schedule", async () => {
    mockDetail({
      status: "running",
      phases: [
        {
          id: "phase-swiss",
          kind: "swiss",
          status: "running",
          plannedRounds: 3,
          rounds: [
            { number: 1, status: "published", publishedAt: Date.parse("2026-08-13T18:07:00.000Z"), matches: [] },
          ],
        },
      ],
    });
    renderDetail("acc-player");
    const schedule = (await screen.findByRole("heading", { name: "Schedule" })).closest(".aegis-panel") as HTMLElement;
    expect(within(schedule).getByText("Round 1 started")).toBeTruthy();
  });

  it("says a finished Swiss event had no Top Cut when the field was too small", async () => {
    mockDetail({ status: "finished", topCutSize: 0, winnerDisplayName: "Tamer One" });
    renderDetail("acc-player");
    expect(await screen.findByText("Swiss · No Top Cut (too few players)")).toBeTruthy();
    expect(screen.getByText("Winner: Tamer One")).toBeTruthy();
  });

  it("says the round count and Top Cut are set when check-in closes", async () => {
    mockDetail();
    renderDetail("acc-player");
    const format = (await screen.findByRole("heading", { name: "Format" })).closest(".aegis-panel") as HTMLElement;
    expect(within(format).getAllByText("Set when check-in closes")).toHaveLength(2);
    expect(screen.getAllByText("Swiss + Top Cut").length).toBeGreaterThan(0);
  });

  it("states the frozen round count and Top Cut size once check-in closes", async () => {
    mockDetail({
      status: "running",
      registeredCount: 20,
      topCutSize: 4,
      phases: [{ id: "phase-swiss", kind: "swiss", status: "running", plannedRounds: 5, rounds: [] }],
    });
    renderDetail("acc-player");
    const format = (await screen.findByRole("heading", { name: "Format" })).closest(".aegis-panel") as HTMLElement;
    expect(within(format).getByText("5 rounds")).toBeTruthy();
    expect(within(format).getByText("Top 4")).toBeTruthy();
    expect(screen.getAllByText("Swiss + Top 4").length).toBeGreaterThan(0);
  });

  it("says no Top Cut applies when 8 or fewer players checked in", async () => {
    mockDetail({ status: "running", topCutSize: 0 });
    renderDetail("acc-player");
    const format = (await screen.findByRole("heading", { name: "Format" })).closest(".aegis-panel") as HTMLElement;
    expect(within(format).getByText("None (8 or fewer players)")).toBeTruthy();
  });

  it("explains the Top Cut size table in its help tip", async () => {
    mockDetail();
    renderDetail("acc-player");
    fireEvent.click(await screen.findByRole("button", { name: "What does Top Cut mean?" }));
    expect(await screen.findByText("Up to 8 players: no cut")).toBeTruthy();
    expect(screen.getByText("17–32 players: top 4")).toBeTruthy();
    expect(screen.getByText("33–128 players: top 8")).toBeTruthy();
    expect(screen.getByText("Over 512 players: top 32")).toBeTruthy();
  });

  it("explains every format setting with a help tip", async () => {
    mockDetail({ allowBots: true });
    renderDetail("acc-player");
    await screen.findByRole("heading", { name: "Format" });
    for (const setting of [
      "Structure",
      "Swiss rounds",
      "Top Cut",
      "Card pool",
      "Match length",
      "Banned cards",
      "Bots",
    ]) {
      expect(screen.getByRole("button", { name: `What does ${setting} mean?` })).toBeTruthy();
    }
    fireEvent.click(screen.getByRole("button", { name: "What does Match length mean?" }));
    expect(
      await screen.findByText("Each match is up to 3 games. The first player to win 2 takes the match."),
    ).toBeTruthy();
  });

  it("explains a round robin event with the organizer's Top Cut and tiebreaker order", async () => {
    mockDetail({
      structure: "round_robin",
      rules: {
        ...RULES_FOR_FORMAT,
        standings: { ...RULES_FOR_FORMAT.standings, tiebreakers: ["match_wins", "head_to_head", "judge_random_draw"] },
        program: { rounds: null, topCutSize: 4 },
      },
    });
    renderDetail("acc-player");
    const format = (await screen.findByRole("heading", { name: "Format" })).closest(".aegis-panel") as HTMLElement;
    expect(within(format).getByText("Round robin")).toBeTruthy();
    expect(within(format).getByText("Top 4 (set by organizer)")).toBeTruthy();
    expect(within(format).getByText("Match wins")).toBeTruthy();
    expect(within(format).getByText("Head-to-head")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "What does Tiebreakers mean?" }));
    expect(await screen.findByText("If you beat the other tied players, you rank above them.")).toBeTruthy();
  });

  it("shows standings columns in the event's tiebreaker order", async () => {
    mockDetail({
      status: "running",
      rules: {
        ...RULES_FOR_FORMAT,
        standings: {
          ...RULES_FOR_FORMAT.standings,
          tiebreakers: ["game_win_rate", "game_difference", "judge_random_draw"],
        },
      },
      standings: [
        {
          participantId: "p-1",
          rank: 1,
          points: 3,
          wins: 1,
          losses: 0,
          draws: 0,
          byes: 0,
          matchWinRate: 1,
          opponentMatchWinRate: 0.33,
          gameWinRate: 2 / 3,
          gameDifference: 1,
        },
      ],
    });
    renderDetail("acc-player", undefined, false, TournamentTab.BRACKET.value);
    const standings = (await screen.findByRole("heading", { name: "Standings" })).closest(
      ".aegis-panel",
    ) as HTMLElement;
    expect(
      within(standings)
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent),
    ).toEqual(["Rank", "Player", "Points", "W-L-D", "GW%", "Game diff."]);
    expect(within(standings).getByText("66.7%")).toBeTruthy();
    expect(
      within(standings).getByText(
        "Ties on points are broken in this order: Game win rate (GW%) → Game difference. A random draw settles any tie left.",
      ),
    ).toBeTruthy();
  });

  it("shows the event's points and the last opponent's rank in the standings", async () => {
    mockDetail({
      status: "running",
      rules: {
        ...RULES_FOR_FORMAT,
        standings: {
          ...RULES_FOR_FORMAT.standings,
          winPoints: 2,
          drawPoints: 1,
          lossPoints: 0,
          byePoints: 2,
          tiebreakers: ["last_opponent_rank", "judge_random_draw"],
        },
      },
      standings: [
        {
          participantId: "p-1",
          rank: 1,
          points: 2,
          wins: 1,
          losses: 0,
          draws: 0,
          byes: 0,
          matchWinRate: 1,
          opponentMatchWinRate: 0.33,
          lastOpponentRank: 3,
        },
      ],
    });
    renderDetail("acc-player", undefined, false, TournamentTab.BRACKET.value);
    const standings = (await screen.findByRole("heading", { name: "Standings" })).closest(
      ".aegis-panel",
    ) as HTMLElement;
    expect(within(standings).getByRole("columnheader", { name: "Last opp." })).toBeTruthy();
    expect(within(standings).getByText("#3")).toBeTruthy();
  });

  it("states the event's points per win, draw and loss in the Format panel", async () => {
    mockDetail({
      rules: {
        ...RULES_FOR_FORMAT,
        standings: { ...RULES_FOR_FORMAT.standings, winPoints: 2, drawPoints: 1, lossPoints: 0, byePoints: 2 },
      },
    });
    renderDetail("acc-player");
    const format = (await screen.findByRole("heading", { name: "Format" })).closest(".aegis-panel") as HTMLElement;
    expect(within(format).getByText("Win 2 · Draw 1 · Loss 0")).toBeTruthy();
  });

  it("shows the official badge to players without endorsement controls", async () => {
    mockDetail({ category: "official" });
    renderDetail("acc-player");
    expect(await screen.findByText("Official Aegis")).toBeTruthy();
    expect(screen.queryByRole("switch", { name: /Official Aegis/ })).toBeNull();
  });

  it("lets platform administrators endorse an existing event", async () => {
    mockDetail(
      { category: "community" },
      {
        "POST /tournaments/t-1/category": { body: { category: "official" } },
      },
    );
    renderDetail("acc-admin", undefined, true, TournamentTab.ORGANIZE.value);
    fireEvent.click(await screen.findByRole("switch", { name: /Official Aegis/ }));
    await waitFor(() => {
      const request = vi
        .mocked(fetch)
        .mock.calls.find(
          ([url, init]) => new URL(String(url)).pathname === "/tournaments/t-1/category" && init?.method === "POST",
        );
      expect(JSON.parse(String(request?.[1]?.body))).toEqual({ category: "official" });
    });
  });

  it("shows organizer controls only to the creator", async () => {
    mockDetail();
    const player = renderDetail("acc-player", undefined, false, TournamentTab.ORGANIZE.value);
    await screen.findByRole("heading", { name: "Your entry" });
    expect(screen.queryByRole("link", { name: "Organize" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Organizer controls" })).toBeNull();
    player.unmount();

    renderDetail("acc-organizer", undefined, false, TournamentTab.ORGANIZE.value);
    expect(await screen.findByRole("heading", { name: "Organizer controls" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close check-in" })).toBeTruthy();
  });

  it("shows only the delete control to an admin who is not the creator", async () => {
    mockDetail();
    renderDetail("acc-admin", undefined, true, TournamentTab.ORGANIZE.value);

    expect(await screen.findByRole("heading", { name: "Admin controls" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete tournament" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Close check-in" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save schedule" })).toBeNull();
  });

  it("sends the event password with registration and explains a refusal", async () => {
    mockDetail(
      { status: "registration", participants: [], passwordProtected: true },
      { "POST /tournaments/t-1/participants": { status: 409, body: { error: "incorrect_password" } } },
    );
    renderDetail("acc-player");
    fireEvent.click(await screen.findByRole("button", { name: "Sign up" }));
    fireEvent.change(await screen.findByLabelText("Event password"), { target: { value: "community-secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm sign-up" }));
    expect(await screen.findByText("The event password is incorrect.")).toBeTruthy();
    expect(screen.getByLabelText("Event password")).toBeTruthy();
    const request = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(request?.[1]?.body))).toMatchObject({ password: "community-secret" });
  });

  it("renders a participant failure code when registration is refused", async () => {
    mockDetail(
      { status: "registration", participants: [] },
      { "POST /tournaments/t-1/participants": { status: 409, body: { error: "tournament_full" } } },
    );
    renderDetail("acc-player");
    fireEvent.click(await screen.findByRole("button", { name: "Sign up" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm sign-up" }));
    await waitFor(() => expect(screen.getByText("This event is full.")).toBeTruthy());
  });

  it("offers only the entry actions the published state supports", async () => {
    // check_in with the player already checked in: nothing to register, nothing to check into.
    mockDetail({
      status: "check_in",
      participants: [
        { id: "p-1", accountId: "acc-player", kind: "human", displayName: "Tamer One", status: "checked_in", seed: 1 },
      ],
    });
    const checkedIn = renderDetail("acc-player", "Tamer One");
    await screen.findByRole("heading", { name: "Your entry" });
    expect(screen.queryByRole("button", { name: "Sign up" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Check in" })).toBeNull();
    expect(screen.getByRole("button", { name: "Drop out" })).toBeTruthy();
    expect(screen.getByText("Your entry: Checked in")).toBeTruthy();
    checkedIn.unmount();

    // A finished event offers nothing at all, and says so.
    mockDetail({ status: "finished", participants: [] });
    renderDetail("acc-player", "Tamer One");
    await screen.findByRole("heading", { name: "Your entry" });
    expect(screen.queryByRole("button", { name: "Sign up" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Check in" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Drop out" })).toBeNull();
    expect(screen.getByText(/Nothing to do here right now/)).toBeTruthy();
  });

  it("never offers check-in to a signed-in player who is not signed up", async () => {
    mockDetail({
      status: "check_in",
      participants: [
        { id: "p-1", kind: "human", displayName: "Twin", status: "registered", seed: null },
        { id: "p-2", kind: "human", displayName: "Twin", status: "registered", seed: null },
      ],
    });
    const checkIn = renderDetail("acc-player", "Twin");
    await screen.findByRole("heading", { name: "Your entry" });
    expect(screen.queryByRole("button", { name: "Check in" })).toBeNull();
    expect(screen.queryByText("Signed up · Check-in is open")).toBeNull();
    expect(screen.queryByRole("button", { name: "Drop out" })).toBeNull();
    checkIn.unmount();

    mockDetail({ status: "registration", participants: [] });
    renderDetail("acc-player", "Twin");
    expect(await screen.findByRole("button", { name: "Sign up" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Check in" })).toBeNull();
  });

  it("walks a protected sign-up through password, deck and review before registering", async () => {
    mockDetail(
      { status: "registration", participants: [], passwordProtected: true },
      { "POST /tournaments/t-1/participants": { status: 201, body: {} } },
    );
    render(
      <I18nProvider>
        <TournamentDetail
          id="t-1"
          onTabChange={() => undefined}
          accountId="acc-player"
          decks={[
            {
              id: "deck-half",
              name: "Half list",
              mainDeck: COMPLETE_DECK.slice(40),
              eggDeck: [],
              color: "Blue",
              blurb: "",
            },
            { id: "deck-1", name: "Red aggro", mainDeck: COMPLETE_DECK, eggDeck: [], color: "Red", blurb: "" },
          ]}
          onBack={() => undefined}
        />
      </I18nProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Sign up" }));
    expect(screen.getByRole("heading", { name: "Enter the event password" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue" }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText("Event password"), { target: { value: "community-secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByRole("heading", { name: "Choose your deck" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Half list/ }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("Your main deck has 10 cards. It needs exactly 50.")).toBeTruthy();
    expect((screen.getByRole("radio", { name: /Red aggro/ }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByRole("heading", { name: "Review and confirm" })).toBeTruthy();
    expect(screen.getByText("Red aggro")).toBeTruthy();
    expect(screen.getAllByText("Regional qualifier").length).toBeGreaterThan(1);
    fireEvent.click(screen.getByRole("button", { name: "Confirm sign-up" }));

    await waitFor(() => expect(screen.queryByRole("button", { name: "Confirm sign-up" })).toBeNull());
    const request = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({ savedDeckId: "deck-1", password: "community-secret" });
  });

  it("asks a player without saved decks to build one before signing up", async () => {
    mockDetail({ status: "registration", participants: [] });
    const onDecks = vi.fn<() => void>();
    render(
      <I18nProvider>
        <TournamentDetail
          id="t-1"
          onTabChange={() => undefined}
          accountId="acc-player"
          decks={[]}
          onDecks={onDecks}
          onBack={() => undefined}
        />
      </I18nProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Sign up" }));
    expect(screen.getByText("No saved decks")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Build a deck" }));
    expect(onDecks).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("button", { name: "Sign up" })).toBeTruthy();
  });

  it("lets a signed-up player check in and drop out after confirming", async () => {
    mockDetail(
      {
        status: "check_in",
        participants: [
          {
            id: "p-1",
            accountId: "acc-player",
            kind: "human",
            displayName: "Tamer One",
            status: "registered",
            seed: 1,
          },
        ],
      },
      {
        "POST /tournaments/t-1/check-in": { body: {} },
        "POST /tournaments/t-1/drop": { body: {} },
      },
    );
    renderDetail("acc-player", "Tamer One");

    fireEvent.click(await screen.findByRole("button", { name: "Check in" }));
    await waitFor(() =>
      expect(
        vi
          .mocked(fetch)
          .mock.calls.some(
            ([input, init]) => init?.method === "POST" && String(input).endsWith("/tournaments/t-1/check-in"),
          ),
      ).toBe(true),
    );

    fireEvent.click(screen.getByRole("button", { name: "Drop out" }));
    expect(screen.getByText("Drop out of Regional qualifier?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Yes, drop out" }));
    await waitFor(() =>
      expect(
        vi
          .mocked(fetch)
          .mock.calls.some(
            ([input, init]) => init?.method === "POST" && String(input).endsWith("/tournaments/t-1/drop"),
          ),
      ).toBe(true),
    );
  });

  it("translates deck-legality violations instead of printing raw kinds", async () => {
    mockDetail(
      { status: "registration", participants: [] },
      {
        "POST /tournaments/t-1/participants": {
          status: 409,
          body: {
            error: "deck_illegal",
            violations: [
              { kind: "main_deck_size", size: 48, required: 50 },
              { kind: "over_copy_limit", cardId: "BT2-047", copies: 3, allowed: 1 },
            ],
          },
        },
      },
    );
    renderDetail("acc-player", "Tamer One");
    fireEvent.click(await screen.findByRole("button", { name: "Sign up" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm sign-up" }));
    await waitFor(() => expect(screen.getByText("Your main deck has 48 cards. It needs exactly 50.")).toBeTruthy());
    expect(screen.getByRole("heading", { name: "Choose your deck" })).toBeTruthy();
    expect(screen.getByText("Argomon: you have 3 copies, but only 1 are allowed.")).toBeTruthy();
  });

  it("uses Chinese names in the banlist, banned pairs and deck violation messages", async () => {
    await loadDictionary("zh-CN");
    await loadCardTranslations("zh-CN");
    const t = translator("zh-CN");
    localStorage.setItem("aegis:locale", "zh-CN");
    try {
      mockDetail(
        {
          status: "registration",
          participants: [],
          banlistCards: [{ cardId: "ST18-05", status: "banned_pair", allowedCopies: 4, pairPartnerIds: ["ST15-16"] }],
        },
        {
          "POST /tournaments/t-1/participants": {
            status: 409,
            body: {
              error: "deck_illegal",
              violations: [{ kind: "over_copy_limit", cardId: "ST18-05", copies: 5, allowed: 4 }],
            },
          },
        },
      );
      const rules = renderDetail("acc-player", "Tamer One", false, TournamentTab.RULES.value);
      expect(await screen.findByText("五彩兽", { selector: ".tournaments-banlist__name" })).toBeTruthy();
      expect(screen.getByText(t("tournaments.detail.pairWith", { cards: "劲力三叉爪" }))).toBeTruthy();
      rules.unmount();
      renderDetail("acc-player", "Tamer One");
      await screen.findByRole("button", { name: t("tournaments.detail.register") });
      fireEvent.click(screen.getByRole("button", { name: t("tournaments.detail.register") }));
      fireEvent.click(screen.getByRole("button", { name: t("overlay.continue") }));
      fireEvent.click(screen.getByRole("button", { name: t("tournaments.signup.confirm") }));
      expect(
        await screen.findByText(t("tournaments.violation.overCopyLimit", { card: "五彩兽", copies: 5, allowed: 4 })),
      ).toBeTruthy();
      expect(screen.queryByText(/Muchomon|Trident Arm/)).toBeNull();
    } finally {
      localStorage.setItem("aegis:locale", "en");
    }
  });

  it("renders the my-match skeleton without inventing series data", async () => {
    mockDetail();
    renderDetail("acc-player");
    const panel = (await screen.findByRole("heading", { name: "My match" })).closest(".aegis-panel") as HTMLElement;
    expect(within(panel).getByText("You do not have a match here yet.")).toBeTruthy();
  });

  it("marks presence, score and join deadline as pending when the payload carries no series", async () => {
    mockDetail({
      matches: [
        {
          id: "m-1",
          round: 2,
          position: 0,
          player0AccountId: "acc-player",
          player1AccountId: "acc-rival",
          winnerAccountId: null,
          status: "pending",
        },
      ],
    });
    renderDetail("acc-player");
    const panel = (await screen.findByRole("heading", { name: "My match" })).closest(".aegis-panel") as HTMLElement;
    expect(within(panel).getByText("Round 2 · Table 1")).toBeTruthy();
    expect(within(panel).getByText("acc-rival")).toBeTruthy();
    expect(within(panel).getByText("Not reported yet")).toBeTruthy();
    expect(within(panel).getByText("Not started, first to 2 wins")).toBeTruthy();
    expect(within(panel).getByText("No deadline")).toBeTruthy();
  });

  it("links every section tab to its own address and hides the organizer tab from players", async () => {
    mockDetail();
    renderDetail("acc-player");
    const tabs = within(await screen.findByRole("navigation", { name: "Event sections" }));
    expect(tabs.getByRole("link", { name: "Overview" }).getAttribute("aria-current")).toBe("page");
    expect(tabs.getByRole("link", { name: "Rounds" }).getAttribute("href")).toBe("/tournaments/t-1/bracket");
    expect(tabs.getByRole("link", { name: "Players" }).getAttribute("href")).toBe("/tournaments/t-1/players");
    expect(tabs.queryByRole("link", { name: "Organize" })).toBeNull();
  });

  it("draws a single-elimination bracket on the overview with the player's own match marked", async () => {
    mockDetail({
      structure: "single_elimination",
      status: "running",
      participants: [
        { id: "p-1", accountId: "acc-player", kind: "human", displayName: "Tamer One", status: "active", seed: 1 },
        { id: "p-2", kind: "bot", displayName: "Bot Two", status: "active", seed: null },
      ],
      phases: [
        {
          id: "phase-1",
          kind: "single_elimination",
          status: "running",
          plannedRounds: 1,
          rounds: [
            {
              number: 1,
              status: "published",
              publishedAt: null,
              matches: [
                {
                  matchId: "m-1",
                  seriesId: null,
                  status: "scheduled",
                  participantIds: ["p-1", "p-2"],
                  winnerSeat: null,
                  participant0Id: "acc-player",
                  participant1Id: null,
                  wins0: 0,
                  wins1: 0,
                  currentGameIndex: null,
                  joinDeadlineAt: null,
                  seriesDeadlineAt: 1,
                  winnerParticipantId: null,
                  pairingReason: null,
                },
              ],
            },
          ],
        },
      ],
    });
    renderDetail("acc-player");
    const bracket = (await screen.findByRole("heading", { name: "Bracket" })).closest(".aegis-panel") as HTMLElement;
    const final = within(bracket).getByRole("heading", { name: "Final" }).parentElement!;
    const [match] = [...final.querySelectorAll("li")];
    expect(match!.getAttribute("data-mine")).toBe("true");
    expect(match!.textContent).toContain("Tamer One");
    expect(match!.textContent).toContain("Bot Two");
    expect(within(bracket).getByText("Champion")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Standings" })).toBeNull();
  });
});

describe("tournament match entry", () => {
  it("confirms presence before entering the authorized next game", async () => {
    const ticket = {
      tournamentId: "t-1",
      matchId: "m-1",
      seriesId: "s-1",
      gameId: "g-1",
      token: "seat-token",
      expiresAt: Date.now() + 60_000,
    };
    mockDetail(
      {},
      {
        "POST /tournaments/t-1/matches/m-1/present": { body: {} },
        "POST /series/s-1/authorize-game": { body: ticket },
      },
    );
    const onJoinGame = vi.fn<() => void>();
    const onChanged = vi.fn<() => void>();
    const view = render(
      <I18nProvider>
        <TournamentMatchActions
          tournamentId="t-1"
          matchId="m-1"
          seriesId={null}
          presentAt={null}
          onJoinGame={onJoinGame}
          onChanged={onChanged}
        />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Ready" }));
    expect(await screen.findByText("Waiting for the opponent to confirm presence.")).toBeTruthy();
    expect(onChanged).toHaveBeenCalledOnce();
    expect(onJoinGame).not.toHaveBeenCalled();
    view.rerender(
      <I18nProvider>
        <TournamentMatchActions
          tournamentId="t-1"
          matchId="m-1"
          seriesId="s-1"
          presentAt={null}
          onJoinGame={onJoinGame}
          onChanged={onChanged}
        />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Enter game" }));
    await waitFor(() => expect(onJoinGame).toHaveBeenCalledWith(ticket));
  });
});

describe("tournament presence", () => {
  it("keeps a confirmed presence after the panel remounts", () => {
    render(
      <I18nProvider>
        <TournamentMatchActions
          tournamentId="t-1"
          matchId="m-1"
          seriesId={null}
          presentAt={Date.parse("2026-08-13T18:08:00.000Z")}
          onJoinGame={() => undefined}
        />
      </I18nProvider>,
    );
    expect(screen.getByRole("button", { name: "Ready" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("Waiting for the opponent to confirm presence.")).toBeTruthy();
  });

  it("prints when each player confirmed presence in the match list", () => {
    render(
      <I18nProvider>
        <TournamentMatchHistory
          detail={{
            participants: DETAIL.participants,
            matches: [
              {
                id: "m-1",
                round: 1,
                position: 0,
                player0AccountId: "acc-player",
                player1AccountId: null,
                winnerAccountId: null,
                status: "pending",
              },
            ],
            series: [
              {
                matchId: "m-1",
                seriesId: null,
                status: "awaiting_players",
                participantIds: ["p-1", "p-2"],
                participant0Id: "acc-player",
                participant1Id: null,
                wins0: 0,
                wins1: 0,
                currentGameIndex: null,
                joinDeadlineAt: null,
                seriesDeadlineAt: null,
                presentAt: [Date.parse("2026-08-13T18:08:00.000Z"), null],
                winnerParticipantId: null,
              },
            ],
          }}
        />
      </I18nProvider>,
    );
    expect(screen.getByText(/^Ready: Tamer One: .+ · Bot Two: not yet$/)).toBeTruthy();
  });
});

describe("organizer pairing controls", () => {
  it("sends selected seats and retains the command id when retrying a failed request", async () => {
    mockDetail(
      {},
      { "POST /tournaments/t-1/arbitration/pairings/swap": { status: 500, body: { error: "temporary_failure" } } },
    );
    const matches: TournamentDetailPayload["matches"] = [
      {
        id: "m-1",
        round: 1,
        position: 0,
        player0AccountId: "a",
        player1AccountId: "b",
        winnerAccountId: null,
        status: "pending",
      },
      {
        id: "m-2",
        round: 1,
        position: 1,
        player0AccountId: "c",
        player1AccountId: "d",
        winnerAccountId: null,
        status: "pending",
      },
    ];
    const onChanged = vi.fn<() => void>();
    render(
      <I18nProvider>
        <TournamentPairingControls detail={{ ...DETAIL, matches }} onChanged={onChanged} />
      </I18nProvider>,
    );
    fireEvent.change(screen.getByLabelText("First player"), { target: { value: "m-1:0" } });
    fireEvent.change(screen.getByLabelText("Second player"), { target: { value: "m-2:1" } });
    fireEvent.change(screen.getByLabelText("Reason for the change"), { target: { value: "Correct seating" } });
    fireEvent.click(screen.getByRole("button", { name: "Swap players" }));
    await screen.findByText(/temporary_failure/);
    fireEvent.click(screen.getByRole("button", { name: "Swap players" }));
    await waitFor(() =>
      expect(vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(2),
    );
    const bodies = vi
      .mocked(fetch)
      .mock.calls.filter(([, init]) => init?.method === "POST")
      .map(([, init]) => JSON.parse(String(init?.body)));
    expect(bodies[0]).toMatchObject({
      firstMatchId: "m-1",
      firstSeat: 0,
      secondMatchId: "m-2",
      secondSeat: 1,
      reason: "Correct seating",
    });
    expect(bodies[0].commandId).toBeTruthy();
    expect(bodies[1]).toEqual(bodies[0]);
    expect(onChanged).not.toHaveBeenCalled();
  });
});

it("shows the players, final score and authoritative winner, including bot seats", () => {
  render(
    <I18nProvider>
      <TournamentMatchHistory
        detail={{
          participants: [
            { id: "human", accountId: "account", displayName: "Alice", kind: "human", status: "active", seed: null },
            { id: "bot", accountId: null, displayName: "Community Bot", kind: "bot", status: "active", seed: null },
          ],
          matches: [
            {
              id: "match",
              round: 2,
              position: 0,
              player0AccountId: "account",
              player1AccountId: null,
              winnerAccountId: null,
              status: "finished",
            },
          ],
          series: [
            {
              matchId: "match",
              seriesId: "series",
              status: "resolved",
              participantIds: ["human", "bot"],
              winnerSeat: 1,
              participant0Id: "account",
              participant1Id: null,
              wins0: 1,
              wins1: 2,
              currentGameIndex: null,
              joinDeadlineAt: null,
              seriesDeadlineAt: null,
              winnerParticipantId: null,
            },
          ],
        }}
      />
    </I18nProvider>,
  );
  expect(screen.getByText("Alice · Community Bot")).toBeTruthy();
  expect(screen.getByText("1 - 2")).toBeTruthy();
  expect(screen.getByText("Winner: Community Bot")).toBeTruthy();
  expect(screen.getByText("Round 2, table 1")).toBeTruthy();
});

it("refuses an HTML authorization response instead of joining a casual game", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response("<html>site</html>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        }),
    ),
  );
  const onJoinGame = vi.fn<() => void>();
  render(
    <I18nProvider>
      <TournamentMatchActions
        tournamentId="t-1"
        matchId="m-1"
        seriesId="s-1"
        presentAt={null}
        onJoinGame={onJoinGame}
      />
    </I18nProvider>,
  );
  fireEvent.click(screen.getByRole("button"));
  await screen.findByRole("alert");
  expect(onJoinGame).not.toHaveBeenCalled();
});

it("shows the frozen registered deck without replacement controls", async () => {
  render(
    <I18nProvider>
      <TournamentRegisteredDeck
        tournamentId="t-1"
        deck={{ savedDeckId: "registered", locked: true, name: "Frozen list", mainDeck: [], eggDeck: [], revision: 1 }}
        decks={[]}
        canChange={false}
        onChanged={vi.fn<() => void>()}
        onDecks={vi.fn<() => void>()}
      />
    </I18nProvider>,
  );
  expect(screen.getByText("Frozen list")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Change deck" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "View registered list" }));
  expect(await screen.findByRole("dialog")).toBeTruthy();
});

it("lets the organizer release manual rounds and cancel with a reason", async () => {
  mockDetail(
    {},
    {
      "POST /tournaments/t-1/next-round": { body: { started: true } },
      "POST /tournaments/t-1/arbitration/cancel": { body: { result: { status: "cancelled" } } },
    },
  );
  const onChanged = vi.fn<() => void>();
  render(
    <I18nProvider>
      <TournamentRuntimeControls
        detail={{ ...DETAIL, status: "running", roundStartMode: "manual" }}
        onChanged={onChanged}
      />
    </I18nProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Start next round" }));
  await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "Cancel tournament" }));
  const confirm = screen.getByRole("button", { name: "Confirm cancellation" });
  expect(confirm.hasAttribute("disabled")).toBe(true);
  fireEvent.change(screen.getByLabelText("Reason for cancellation"), { target: { value: "Judge intervention" } });
  fireEvent.click(confirm);
  await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(2));
  expect(
    vi
      .mocked(fetch)
      .mock.calls.some(
        ([input, init]) =>
          String(input).endsWith("/arbitration/cancel") &&
          JSON.parse(String(init?.body)).reason === "Judge intervention",
      ),
  ).toBe(true);
});

it("accepts HTTP 204 after deleting an unstarted event", async () => {
  const onBack = vi.fn<() => void>();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        return new Response(null, { status: 204 });
      }
      return new Response(JSON.stringify(DETAIL), { status: 200, headers: { "Content-Type": "application/json" } });
    }),
  );
  render(
    <I18nProvider>
      <TournamentDetail
        id="t-1"
        accountId="acc-organizer"
        tab={TournamentTab.ORGANIZE.value}
        decks={[]}
        onBack={onBack}
      />
    </I18nProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Delete tournament" }));
  fireEvent.click(screen.getByRole("button", { name: "Yes, delete it" }));
  await waitFor(() => expect(onBack).toHaveBeenCalledOnce());
});

it("lets an entrant replace a registered deck that was deleted from the library", async () => {
  mockDetail({}, { "POST /tournaments/t-1/own-deck": { body: {} } });
  const onChanged = vi.fn<() => void>();
  render(
    <I18nProvider>
      <TournamentRegisteredDeck
        tournamentId="t-1"
        deck={{
          savedDeckId: "deleted",
          available: false,
          locked: false,
          name: "",
          mainDeck: [],
          eggDeck: [],
          revision: 0,
        }}
        decks={[
          {
            id: "replacement",
            name: "New list",
            mainDeck: Array.from({ length: 50 }, () => "BT1-010"),
            eggDeck: [],
            color: "Red",
            blurb: "",
          },
        ]}
        canChange
        onChanged={onChanged}
        onDecks={vi.fn<() => void>()}
      />
    </I18nProvider>,
  );
  expect(screen.getByRole("button", { name: "View registered list" }).hasAttribute("disabled")).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Change deck" }));
  fireEvent.click(screen.getByRole("radio", { name: /New list/ }));
  fireEvent.click(screen.getByRole("button", { name: "Save registered deck" }));
  await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
});

it("lists legal decks before incomplete ones when changing the registered deck", () => {
  render(
    <I18nProvider>
      <TournamentRegisteredDeck
        tournamentId="t-1"
        deck={{ savedDeckId: "current", locked: false, name: "Current", mainDeck: [], eggDeck: [], revision: 1 }}
        decks={[
          { id: "draft", name: "Draft list", mainDeck: [], eggDeck: [], color: "Red", blurb: "" },
          {
            id: "ready",
            name: "Ready list",
            mainDeck: Array.from({ length: 50 }, () => "BT1-010"),
            eggDeck: [],
            color: "Blue",
            blurb: "",
          },
        ]}
        canChange
        onChanged={vi.fn<() => void>()}
        onDecks={vi.fn<() => void>()}
      />
    </I18nProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Change deck" }));
  const names = screen.getAllByRole("radio").map((radio) => radio.closest("label")?.querySelector("b")?.textContent);
  expect(names).toEqual(["Ready list", "Draft list"]);
});
