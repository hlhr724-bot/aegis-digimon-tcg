// @vitest-environment jsdom
import { AccountRole } from "@aegis/shared/account/AccountRole";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  TournamentCircuitLeaderboard,
  TournamentCircuitView,
} from "@aegis/shared/tournaments/circuits/TournamentCircuitContracts";
import { I18nProvider } from "@/i18n";
import type { TournamentRoute } from "@/routes";
import { resetServerClock } from "@/tournaments/serverClock";
import { TournamentsScreen } from "@/tournaments/TournamentsScreen";

const CIRCUIT: TournamentCircuitView = {
  id: "circuit-1",
  name: "Weekend Circuit",
  description: "Every Saturday",
  status: "active",
  startsAt: Date.parse("2026-11-01T03:00:00Z"),
  endsAt: Date.parse("2026-11-29T03:00:00Z"),
  timeZone: "America/Sao_Paulo",
  schedule: { cadence: "weekly", slots: [{ weekday: 6, localTime: "18:00" }] },
  leadTimeMs: 48 * 3_600_000,
  checkInWindowMs: 15 * 60_000,
  pointsTable: [
    { maxPlacement: 1, points: 25 },
    { maxPlacement: 4, points: 12 },
  ],
  participationPoints: 1,
  createdBy: "admin-1",
  finalizedAt: null,
  nextOccurrenceAt: Date.parse("2026-11-07T21:00:00Z"),
  scoringLocked: true,
  template: {
    structure: "swiss",
    topCut: false,
    bestOf: 1,
    maxPlayers: 32,
    allowBots: false,
    banlist: { mode: "none" },
  },
  tournaments: [
    {
      tournamentId: "t-1",
      name: "Weekend Circuit #1",
      startsAt: Date.parse("2026-11-07T21:00:00Z"),
      status: "finished",
    },
  ],
  upcoming: [Date.parse("2026-11-14T21:00:00Z")],
};

const LEADERBOARD: TournamentCircuitLeaderboard = {
  circuitId: "circuit-1",
  final: false,
  entries: [
    {
      position: 1,
      accountId: "a",
      displayName: "Ana",
      points: 26,
      events: 1,
      bestPlacement: 1,
    },
    {
      position: 2,
      accountId: "b",
      displayName: "Bia",
      points: 13,
      events: 1,
      bestPlacement: 3,
    },
  ],
  mine: {
    position: 2,
    accountId: "b",
    displayName: "Bia",
    points: 13,
    events: 1,
    bestPlacement: 3,
  },
  page: 1,
  total: 2,
};

type Route = { status?: number; body: unknown };

function mockApi(routes: Record<string, Route>) {
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async (input, init) => {
    const key = `${init?.method ?? "GET"} ${new URL(String(input)).pathname}`;
    const route = routes[key] ?? { status: 404, body: { error: "not_found" } };
    return new Response(JSON.stringify(route.body), {
      status: route.status ?? 200,
      headers: {
        "Content-Type": "application/json",
        Date: new Date().toUTCString(),
      },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderScreen(view: TournamentRoute, onViewChange: (view: TournamentRoute) => void = () => undefined) {
  return render(
    <I18nProvider>
      <TournamentsScreen decks={[]} view={view} onViewChange={onViewChange} />
    </I18nProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetServerClock();
});

describe("circuit screens", () => {
  it("lists active circuits in the catalog and opens one", async () => {
    mockApi({
      "GET /tournaments": { body: [] },
      "GET /tournament-circuits": {
        body: {
          items: [CIRCUIT, { ...CIRCUIT, id: "old", status: "finished" }],
        },
      },
      "GET /auth/me": {
        body: { id: "acc-1", displayName: "Tamer", isAdmin: false, roles: [] },
      },
    });
    const onViewChange = vi.fn<(view: TournamentRoute) => void>();
    renderScreen({ kind: "catalog" }, onViewChange);
    fireEvent.click(await screen.findByRole("tab", { name: "Circuits" }));
    const card = await screen.findByRole("button", { name: /Weekend Circuit/ });
    expect(screen.getAllByRole("button", { name: /Weekend Circuit/ })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "New circuit" })).toBeNull();
    fireEvent.click(card);
    expect(onViewChange).toHaveBeenCalledWith({
      kind: "circuit",
      id: "circuit-1",
    });
  });

  it.each([AccountRole.ADMIN.value, AccountRole.ORGANIZER.value])(
    "shows circuit creation in an empty catalog for %s",
    async (role) => {
      mockApi({
        "GET /tournaments": { body: [] },
        "GET /tournament-circuits": { body: { items: [] } },
        "GET /auth/me": {
          body: { id: "creator-1", displayName: "Creator", isAdmin: role === AccountRole.ADMIN.value, roles: [role] },
        },
      });
      const onViewChange = vi.fn<(view: TournamentRoute) => void>();
      renderScreen({ kind: "catalog" }, onViewChange);
      fireEvent.click(await screen.findByRole("tab", { name: "Circuits" }));
      fireEvent.click(await screen.findByRole("button", { name: "New circuit" }));
      expect(onViewChange).toHaveBeenCalledWith({ kind: "createCircuit" });
    },
  );

  it("shows the schedule, events and leaderboard with the viewer's row highlighted", async () => {
    mockApi({
      "GET /tournament-circuits/circuit-1": { body: CIRCUIT },
      "GET /tournament-circuits/circuit-1/leaderboard": { body: LEADERBOARD },
      "GET /auth/me": { body: { id: "b", displayName: "Bia", isAdmin: false, roles: [] } },
    });
    const onViewChange = vi.fn<(view: TournamentRoute) => void>();
    renderScreen({ kind: "circuit", id: "circuit-1" }, onViewChange);
    await screen.findByRole("heading", { name: "Weekend Circuit" });
    const table = await screen.findByRole("table");
    const rows = within(table).getAllByRole("row");
    expect(rows.map((row) => row.textContent)).toEqual(["#PlayerPointsEventsBest finish", "1Ana261#1", "2Bia131#3"]);
    expect(rows[2]?.className).toBe("is-mine");
    expect(screen.getByText("America/Sao_Paulo", { exact: false })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancel circuit" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Weekend Circuit #1/ }));
    expect(onViewChange).toHaveBeenCalledWith({ kind: "detail", id: "t-1" });
  });

  it("lets an admin cancel a circuit after confirming", async () => {
    const fetchMock = mockApi({
      "GET /tournament-circuits/circuit-1": { body: CIRCUIT },
      "GET /tournament-circuits/circuit-1/leaderboard": {
        body: { ...LEADERBOARD, mine: null },
      },
      "POST /tournament-circuits/circuit-1/cancel": {
        body: { ...CIRCUIT, status: "cancelled", upcoming: [] },
      },
      "GET /auth/me": {
        body: { id: "admin-1", displayName: "Admin", isAdmin: true, roles: ["admin"] },
      },
    });
    renderScreen({ kind: "circuit", id: "circuit-1" });
    fireEvent.click(await screen.findByRole("button", { name: "Cancel circuit" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, cancel it" }));
    await screen.findByText("Cancelled");
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true);
  });

  it("sends the admin's circuit and shows server validation reasons", async () => {
    const fetchMock = mockApi({
      "POST /tournament-circuits": {
        status: 400,
        body: {
          error: "invalid_tournament_circuit",
          reasons: [{ code: "no_occurrences", field: "schedule.slots" }],
        },
      },
      "GET /auth/me": {
        body: { id: "admin-1", displayName: "Admin", isAdmin: true, roles: ["admin"] },
      },
    });
    renderScreen({ kind: "createCircuit" });
    fireEvent.change(await screen.findByLabelText("Name"), {
      target: { value: "Weekend Circuit" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create circuit" }));
    await screen.findByText("No slot falls inside the period.");
    const [, init] = fetchMock.mock.calls.find(([, request]) => request?.method === "POST") ?? [];
    expect(JSON.parse(String(init?.body))).toMatchObject({
      name: "Weekend Circuit",
      schedule: { cadence: "weekly", slots: [{ weekday: 6, localTime: "18:00" }] },
      leadTimeMs: 48 * 3_600_000,
      checkInWindowMs: 15 * 60_000,
      participationPoints: 1,
      template: {
        structure: "swiss",
        bestOf: 1,
        maxPlayers: 32,
      },
    });
  });

  it.each([AccountRole.ADMIN.value, AccountRole.ORGANIZER.value])(
    "lets %s create a circuit with monthly slots",
    async (role) => {
      const fetchMock = mockApi({
        "POST /tournament-circuits": { status: 201, body: CIRCUIT },
        "GET /auth/me": {
          body: { id: "creator-1", displayName: "Creator", isAdmin: role === AccountRole.ADMIN.value, roles: [role] },
        },
      });
      renderScreen({ kind: "createCircuit" });
      fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Monthly Cup" } });
      fireEvent.change(screen.getByLabelText("Repeats"), { target: { value: "monthly" } });
      expect(screen.getByText("Days 29 to 31 move to the last day of shorter months.")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Add slot" }));
      fireEvent.change(screen.getAllByLabelText("Day of the month")[1]!, { target: { value: "31" } });
      fireEvent.click(screen.getByRole("button", { name: "Create circuit" }));
      await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true));
      const [, init] = fetchMock.mock.calls.find(([, request]) => request?.method === "POST") ?? [];
      expect(JSON.parse(String(init?.body))).toMatchObject({
        name: "Monthly Cup",
        schedule: {
          cadence: "monthly",
          slots: [
            { monthDay: 1, localTime: "18:00" },
            { monthDay: 31, localTime: "18:00" },
          ],
        },
      });
    },
  );

  it("shows a monthly circuit's days in its schedule", async () => {
    mockApi({
      "GET /tournament-circuits/circuit-1": {
        body: { ...CIRCUIT, schedule: { cadence: "monthly", slots: [{ monthDay: 15, localTime: "18:00" }] } },
      },
      "GET /tournament-circuits/circuit-1/leaderboard": { body: LEADERBOARD },
    });
    renderScreen({ kind: "circuit", id: "circuit-1" });
    expect(await screen.findByText("Day 15 of each month, 18:00")).toBeTruthy();
    expect(screen.getByText("Every month")).toBeTruthy();
    expect(screen.getByText("America/Sao_Paulo")).toBeTruthy();
  });

  it.each([{ roles: [] }, { roles: [AccountRole.JUDGE.value] }])(
    "rejects the creation form without organizer permission for roles $roles",
    async ({ roles }) => {
      mockApi({
        "GET /auth/me": {
          body: { id: "acc-1", displayName: "Tamer", isAdmin: false, roles },
        },
      });
      renderScreen({ kind: "createCircuit" });
      await waitFor(() =>
        expect(screen.getByText("Only Aegis admins and organizers can create circuits.")).toBeTruthy(),
      );
    },
  );
});
