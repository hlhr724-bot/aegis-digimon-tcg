// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import { resetServerClock } from "./serverClock";
import { TournamentsScreen } from "./TournamentsScreen";
import type { TournamentListing } from "./types";

const LIGHTNING: TournamentListing = {
  id: "t-lightning",
  name: "Friday lightning",
  status: "registration",
  structure: "single_elimination",
  topCutEnabled: false,
  topCutSize: null,
  bestOf: 1,
  allowBots: true,
  startsAt: Date.parse("2026-08-13T18:00:00.000Z"),
  maxPlayers: 8,
  registeredCount: 3,
  banlistPolicy: { mode: "none" },
  block: "BT10",
  createdBy: "acc-1",
  winnerAccountId: null,
};

const REGIONAL: TournamentListing = {
  ...LIGHTNING,
  id: "t-regional",
  name: "Regional qualifier",
  structure: "swiss",
  topCutEnabled: true,
  topCutSize: 8,
  bestOf: 3,
  allowBots: false,
  maxPlayers: 64,
  registeredCount: 40,
  banlistPolicy: { mode: "as_of_set", setId: "BT10" },
};

type Route = { status?: number; body: unknown };

function mockApi(routes: Record<string, Route>): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async (input, init) => {
    const url = String(input);
    const key = `${init?.method ?? "GET"} ${new URL(url).pathname}`;
    const route = routes[key] ?? { status: 404, body: { error: "tournament_not_found" } };
    return new Response(JSON.stringify(route.body), {
      status: route.status ?? 200,
      headers: { "Content-Type": "application/json", Date: new Date().toUTCString() },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock as unknown as ReturnType<typeof vi.fn>;
}

function renderScreen() {
  return render(
    <I18nProvider>
      <TournamentsScreen
        decks={[{ id: "deck-1", name: "Red aggro", mainDeck: [], eggDeck: [], color: "Red", blurb: "" }]}
      />
    </I18nProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetServerClock();
});

describe("tournament catalog", () => {
  it("filters the agenda by search text and format", async () => {
    mockApi({
      "GET /tournaments": {
        body: [
          { ...LIGHTNING, description: "Casual community event" },
          { ...REGIONAL, format: "BT10" },
        ],
      },
      "GET /auth/me": { body: { id: "acc-1", displayName: "Tamer", isAdmin: false, roles: [] } },
    });
    renderScreen();
    await screen.findByRole("heading", { name: "Friday lightning" });
    fireEvent.change(screen.getByRole("searchbox", { name: "Search tournaments" }), { target: { value: "community" } });
    expect(screen.queryByRole("heading", { name: "Regional qualifier" })).toBeNull();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "missing tournament" } });
    expect(screen.getByText("No matching events")).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Filter by format"), { target: { value: "BT10" } });
    expect(screen.queryByRole("heading", { name: "Friday lightning" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Regional qualifier" })).toBeTruthy();
  });

  it("groups official events before community events and hides empty groups", async () => {
    mockApi({
      "GET /tournaments": {
        body: [
          { ...LIGHTNING, category: "community" },
          { ...REGIONAL, category: "official", format: "BT10" },
        ],
      },
      "GET /auth/me": { body: { id: "acc-1", displayName: "Tamer", isAdmin: false, roles: [] } },
    });
    renderScreen();
    await screen.findByRole("heading", { name: "Friday lightning" });
    const official = screen.getByRole("region", { name: "Official events" });
    const community = screen.getByRole("region", { name: "Community events" });
    expect(official.compareDocumentPosition(community) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(official).getByRole("heading", { name: "Regional qualifier" })).toBeTruthy();
    expect(within(official).getByText("Events: 1")).toBeTruthy();
    expect(within(community).getByRole("heading", { name: "Friday lightning" })).toBeTruthy();
    expect(within(community).queryByRole("heading", { name: "Regional qualifier" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Filter by format"), { target: { value: "BT10" } });
    expect(screen.queryByRole("region", { name: "Community events" })).toBeNull();
    expect(screen.getByRole("region", { name: "Official events" })).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "missing tournament" } });
    expect(screen.queryByRole("region", { name: "Official events" })).toBeNull();
    expect(screen.getByText("No matching events")).toBeTruthy();
  });

  it("explains each event category from an accessible help button", async () => {
    mockApi({
      "GET /tournaments": {
        body: [
          { ...LIGHTNING, category: "community" },
          { ...REGIONAL, category: "official" },
        ],
      },
      "GET /auth/me": { body: { id: "acc-1", displayName: "Tamer", isAdmin: false, roles: [] } },
    });
    renderScreen();
    await screen.findByRole("heading", { name: "Friday lightning" });
    const officialHelp = screen.getByRole("button", { name: "What are official tournaments?" });
    expect(screen.queryByText(/Only administrators can create an official event/)).toBeNull();
    fireEvent.click(officialHelp);
    expect(await screen.findByText(/Only administrators can create an official event/)).toBeTruthy();
    expect(officialHelp.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByText(/Only administrators can create an official event/)).toBeNull());
    const communityHelp = screen.getByRole("button", { name: "What are community tournaments?" });
    fireEvent.focus(communityHelp);
    expect(await screen.findByText(/Anyone signed in can host one/)).toBeTruthy();
    fireEvent.keyDown(communityHelp, { key: "Escape" });
    await waitFor(() => expect(screen.queryByText(/Anyone signed in can host one/)).toBeNull());
  });

  it("separates upcoming events, personal events and history", async () => {
    mockApi({
      "GET /tournaments": {
        body: [
          LIGHTNING,
          { ...REGIONAL, createdBy: "other" },
          { ...LIGHTNING, id: "past", name: "Past cup", status: "finished" },
        ],
      },
      "GET /auth/me": { body: { id: "acc-1", displayName: "Tamer", isAdmin: false, roles: [] } },
    });
    renderScreen();
    await screen.findByRole("heading", { name: "Friday lightning" });
    expect(screen.queryByRole("heading", { name: "Past cup" })).toBeNull();
    fireEvent.click(await screen.findByRole("tab", { name: "My tournaments 1" }));
    expect(screen.getByRole("heading", { name: "Friday lightning" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Regional qualifier" })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Explore" }));
    fireEvent.click(screen.getByRole("button", { name: "Past events" }));
    expect(screen.getByRole("heading", { name: "Past cup" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Friday lightning" })).toBeNull();
  });

  it("performs the advertised check-in and refreshes the next step", async () => {
    const entry = { ...LIGHTNING, myEntry: { status: "registered", checkInOpensAt: null, checkInClosesAt: null } };
    const routes: Record<string, Route> = {
      "GET /tournaments": { body: [entry] },
      "GET /auth/me": { body: { id: "acc-1", displayName: "Tamer", isAdmin: false, roles: [] } },
      "POST /tournaments/t-lightning/check-in": { body: { status: "checked_in" } },
    };
    const fetchMock = mockApi(routes);
    renderScreen();
    const button = await screen.findByRole("button", { name: "Check in" });
    routes["GET /tournaments"] = { body: [{ ...entry, myEntry: { ...entry.myEntry, status: "checked_in" } }] };
    fireEvent.click(button);
    await screen.findByText("Check-in confirmed · Waiting for the start");
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) => String(input).includes("/t-lightning/check-in") && (init as RequestInit)?.method === "POST",
      ),
    ).toBe(true);
    expect(screen.queryByRole("button", { name: "Check in" })).toBeNull();
  });

  beforeEach(() => {
    mockApi({
      "GET /tournaments": { body: [LIGHTNING, REGIONAL] },
      "GET /auth/me": { body: { id: "acc-1", displayName: "Tamer", avatarUrl: null, isAdmin: true, roles: ["admin"] } },
    });
  });

  it("renders each event's status, slots, structure, format and badges", async () => {
    renderScreen();

    const lightning = (await screen.findByRole("heading", { name: "Friday lightning" })).closest("li") as HTMLElement;
    expect(within(lightning).getByText("Sign-ups open")).toBeTruthy();
    expect(within(lightning).getByText("3 of 8 players")).toBeTruthy();
    expect(within(lightning).getByText("Single elimination")).toBeTruthy();
    expect(within(lightning).getByText("Best of 1")).toBeTruthy();
    expect(within(lightning).getByText("Bots allowed")).toBeTruthy();
    expect(within(lightning).getByText("No restrictions")).toBeTruthy();
    expect(within(lightning).queryByText("Top Cut")).toBeNull();

    const regional = screen.getByRole("heading", { name: "Regional qualifier" }).closest("li") as HTMLElement;
    expect(within(regional).getByText("Swiss")).toBeTruthy();
    expect(within(regional).getByText("Top Cut")).toBeTruthy();
    expect(within(regional).getByText("Banned cards as of BT10")).toBeTruthy();
    expect(within(regional).queryByText("Bots allowed")).toBeNull();
  });

  it("reads registeredCount, not the deprecated registrations alias", async () => {
    cleanup();
    mockApi({
      // The server still sends both; a card built on the alias would show 99.
      "GET /tournaments": { body: [{ ...LIGHTNING, registrations: 99 }] },
      "GET /auth/me": { body: null },
    });
    renderScreen();
    expect(await screen.findByText("3 of 8 players")).toBeTruthy();
    expect(screen.queryByText("99 of 8 players")).toBeNull();
  });

  it("offers tournament creation to an authenticated community organizer", async () => {
    cleanup();
    mockApi({
      "GET /tournaments": { body: [] },
      "GET /auth/me": { body: { id: "acc-2", displayName: "Player", avatarUrl: null, isAdmin: false, roles: [] } },
    });
    renderScreen();
    await screen.findByText("No events here yet. Be the first to create one.");
    expect((await screen.findAllByRole("button", { name: "Create tournament" })).length).toBeGreaterThan(0);
  });
});

describe("tournament categories in the catalog", () => {
  it("shows endorsement separately from the ruleset", async () => {
    mockApi({
      "GET /tournaments": {
        body: [
          { ...LIGHTNING, category: "official" },
          { ...REGIONAL, category: "community" },
        ],
      },
      "GET /auth/me": { body: null },
    });
    renderScreen();
    const official = (await screen.findByRole("heading", { name: LIGHTNING.name })).closest("article")!;
    const community = screen.getByRole("heading", { name: REGIONAL.name }).closest("article")!;
    expect(within(official).getByText("Official Aegis")).toBeTruthy();
    expect(within(community).getByText("Community")).toBeTruthy();
  });
});

describe("tournament creation form", () => {
  beforeEach(() => {
    mockApi({
      "GET /tournaments": { body: [] },
      "GET /auth/me": { body: { id: "acc-1", displayName: "Tamer", avatarUrl: null, isAdmin: true, roles: ["admin"] } },
    });
  });

  async function openForm() {
    renderScreen();
    fireEvent.click(await screen.findByRole("button", { name: "Create tournament" }));
    return await screen.findByRole("heading", { name: "New tournament" });
  }

  it("lets administrators choose official endorsement independently of rules", async () => {
    await openForm();
    const toggle = screen.getByRole("switch", { name: /Official Aegis/ }) as HTMLButtonElement;
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(toggle);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Official cup" } });
    fireEvent.click(screen.getByRole("button", { name: "Create tournament" }));
    await waitFor(() => {
      const request = vi
        .mocked(fetch)
        .mock.calls.find(([url, init]) => new URL(String(url)).pathname === "/tournaments" && init?.method === "POST");
      const body = JSON.parse(String(request?.[1]?.body));
      expect(body).toMatchObject({ category: "official" });
      expect(body).not.toHaveProperty("rulesetPreset");
    });
  });

  it("lets official organizers create official events", async () => {
    mockApi({
      "GET /tournaments": { body: [] },
      "GET /auth/me": { body: { id: "host", displayName: "Host", isAdmin: false, roles: ["organizer"] } },
    });
    await openForm();
    fireEvent.click(screen.getByRole("switch", { name: /Official Aegis/ }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Store championship" } });
    fireEvent.click(screen.getByRole("button", { name: "Create tournament" }));
    await waitFor(() => {
      const request = vi
        .mocked(fetch)
        .mock.calls.find(([url, init]) => new URL(String(url)).pathname === "/tournaments" && init?.method === "POST");
      expect(JSON.parse(String(request?.[1]?.body))).toMatchObject({ category: "official" });
    });
  });

  it("limits ordinary users to community events", async () => {
    mockApi({
      "GET /tournaments": { body: [] },
      "GET /auth/me": { body: { id: "player", displayName: "Player", isAdmin: false, roles: [] } },
    });
    await openForm();
    expect(screen.queryByRole("switch", { name: /Official Aegis/ })).toBeNull();
    expect(screen.getByText("Your tournament will be listed as a community event.")).toBeTruthy();
  });

  it("shows the Top Cut switch only for a Swiss structure", async () => {
    await openForm();
    expect(screen.queryByRole("switch", { name: /Top Cut/ })).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: /Swiss/ }));
    expect(screen.getByRole("switch", { name: /Top Cut/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("radio", { name: /Single elimination/ }));
    expect(screen.queryByRole("switch", { name: /Top Cut/ })).toBeNull();
  });

  it("uses the default rules without offering a ruleset selector", async () => {
    await openForm();
    expect(screen.queryByLabelText("Ruleset")).toBeNull();
    const banlist = screen.getByLabelText("Banned cards") as HTMLSelectElement;
    const unrestricted = within(banlist).getByRole("option", { name: "No restrictions" }) as HTMLOptionElement;
    expect(unrestricted.disabled).toBe(false);
    expect(banlist.value).toBe("none");
  });

  it("previews the resolved banlist with card names and allowed copies", async () => {
    await openForm();
    fireEvent.change(screen.getByLabelText("Banned cards"), { target: { value: "as_of_set" } });
    fireEvent.change(screen.getByLabelText("Set"), { target: { value: "BT10" } });

    const preview = screen.getByRole("region", { name: "Banned cards preview" });
    // BT10 released 2022-10-14; the 2022-08-01 restriction of Tommy Himi is in force by then.
    expect(within(preview).getByText("Tommy Himi")).toBeTruthy();
    expect(within(preview).getAllByText("Restricted").length).toBeGreaterThan(0);
    expect(within(preview).getAllByText("1 copies allowed").length).toBeGreaterThan(0);
    // ...while a 2023 restriction is not.
    expect(within(preview).queryByText("Blossomon")).toBeNull();
  });

  it("submits the chosen banlist mode and set, which is what the server freezes", async () => {
    const fetchMock = mockApi({
      "GET /tournaments": { body: [] },
      "GET /auth/me": { body: { id: "acc-1", displayName: "Tamer", avatarUrl: null, isAdmin: true, roles: ["admin"] } },
      "POST /tournaments": { status: 201, body: { ...LIGHTNING, banlistCards: [] } },
    });
    await openForm();
    fireEvent.change(screen.getByLabelText("Banned cards"), { target: { value: "as_of_set" } });
    fireEvent.change(screen.getByLabelText("Set"), { target: { value: "BT10" } });
    fireEvent.change(screen.getByLabelText("Description (optional)"), { target: { value: "Weekly community event" } });
    fireEvent.click(screen.getByRole("switch", { name: /Customize timers/ }));
    fireEvent.change(screen.getByLabelText("Swiss round (minutes)"), { target: { value: "30" } });
    fireEvent.change(screen.getByLabelText("Overtime (minutes)"), { target: { value: "10" } });

    fireEvent.click(screen.getByRole("button", { name: "Create tournament" }));

    const postedBody = async () => {
      const call = fetchMock.mock.calls.find(
        (args: unknown[]) => (args[1] as RequestInit | undefined)?.method === "POST",
      );
      return call === undefined ? undefined : JSON.parse(String((call[1] as RequestInit).body));
    };
    await waitFor(async () => expect(await postedBody()).toBeDefined());
    expect((await postedBody()).banlist).toEqual({ mode: "as_of_set", setId: "BT10" });
    expect((await postedBody()).description).toBe("Weekly community event");
    expect((await postedBody()).clocks).toEqual({
      roundMinutes: 30,
      eliminationMinutes: 55,
      finalMinutes: null,
      overtimeMinutes: 10,
    });
  });

  it("shows Swiss round and cut estimates, labelled as pending check-in close", async () => {
    await openForm();
    fireEvent.click(screen.getByRole("radio", { name: /Swiss/ }));
    fireEvent.change(screen.getByLabelText("Maximum players"), { target: { value: "16" } });

    const estimates = screen.getByRole("region", { name: "Estimates" });
    expect(within(estimates).getByText("About 4 Swiss rounds")).toBeTruthy();
    expect(within(estimates).getByText("No Top Cut")).toBeTruthy();

    fireEvent.click(screen.getByRole("switch", { name: /Top Cut/ }));
    expect(within(estimates).getByText("Roughly a Top 2 cut")).toBeTruthy();
    expect(within(estimates).getByText(/locked in when check-in closes/)).toBeTruthy();
  });

  it("renders the server's validation reason codes inline", async () => {
    mockApi({
      "GET /tournaments": { body: [] },
      "GET /auth/me": { body: { id: "acc-1", displayName: "Tamer", avatarUrl: null, isAdmin: true, roles: ["admin"] } },
      "POST /tournaments": {
        status: 400,
        body: {
          error: "invalid tournament",
          reasons: [
            { code: "name_too_short", field: "name" },
            { code: "starts_at_in_past", field: "startsAt" },
          ],
        },
      },
    });
    await openForm();
    fireEvent.click(screen.getByRole("button", { name: "Create tournament" }));

    await waitFor(() => expect(screen.getAllByText("That name is too short.").length).toBeGreaterThan(0));
    expect(screen.getAllByText("That start time has already passed. Pick a later one.").length).toBeGreaterThan(0);
  });

  it("renders an unknown reason code verbatim instead of a blank message", async () => {
    mockApi({
      "GET /tournaments": { body: [] },
      "GET /auth/me": { body: { id: "acc-1", displayName: "Tamer", avatarUrl: null, isAdmin: true, roles: ["admin"] } },
      "POST /tournaments": {
        status: 400,
        body: { error: "invalid tournament", reasons: [{ code: "future_code_we_do_not_know", field: "name" }] },
      },
    });
    await openForm();
    fireEvent.click(screen.getByRole("button", { name: "Create tournament" }));
    await waitFor(() => expect(screen.getAllByText(/future_code_we_do_not_know/).length).toBeGreaterThan(0));
  });
});

describe("app navigation", () => {
  it("opens the tournaments area from the client shell", async () => {
    mockApi({
      "GET /tournaments": { body: [] },
      "GET /auth/me": { body: { id: "acc-1", displayName: "Tamer", avatarUrl: null, isAdmin: true, roles: ["admin"] } },
      "GET /account/decks": { body: [] },
    });
    const { AegisClient } = await import("../App");
    render(
      <I18nProvider>
        <AegisClient
          player={{ name: "Tamer", color: "Blue", shards: 0 }}
          setPlayer={() => undefined}
          decks={[]}
          activeDeckId=""
          setActiveDeckId={() => undefined}
          saveDeck={() => undefined}
          deleteDeck={() => undefined}
          dark={false}
          setDark={() => undefined}
          initialScreen="tournaments"
        />
      </I18nProvider>,
    );
    await waitFor(() => expect(document.getElementById("aegis-main")).toBeTruthy());
    expect(await screen.findByRole("heading", { name: "Tournaments", level: 1 })).toBeTruthy();
    expect((await screen.findAllByRole("button", { name: "Create tournament" })).length).toBeGreaterThan(0);
  }, 20_000);
});
