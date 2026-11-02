import { beforeEach, describe, expect, it } from "vitest";
import { TournamentCircuitCadence } from "@aegis/shared/tournaments/circuits/TournamentCircuitCadence";
import type { CreateTournamentCircuitInput } from "@aegis/shared/tournaments/circuits/TournamentCircuitContracts";
import { DEFAULT_CIRCUIT_SETTINGS } from "@aegis/shared/tournaments/circuits/DEFAULT_CIRCUIT_SETTINGS";
import type { TournamentResultExportParticipant } from "@aegis/shared/tournaments/TournamentResultExport";
import { AccountStore } from "#api/accounts/AccountStore";
import { TrophyStore } from "#api/achievements/TrophyStore";
import { createMemoryPool } from "#api/db/memoryPool.fixture";
import { finalizeTournamentCircuits } from "#api/tournaments/circuits/finalizeTournamentCircuits";
import { recordCircuitPoints } from "#api/tournaments/circuits/recordCircuitPoints";
import { scheduleCircuitTournaments } from "#api/tournaments/circuits/scheduleCircuitTournaments";
import { TournamentCircuitStore } from "#api/tournaments/circuits/TournamentCircuitStore";
import { validateCreateTournamentCircuit } from "#api/tournaments/circuits/validateCreateTournamentCircuit";
import { BotSeatingStore } from "#api/tournaments/bots/BotSeatingStore";
import { EliminationStore } from "#api/tournaments/elimination/EliminationStore";
import { startDueTournaments } from "#api/tournaments/lifecycle/startDueTournaments";
import { ParticipantStore } from "#api/tournaments/participants/ParticipantStore";
import { SeriesStore } from "#api/tournaments/series/SeriesStore";
import { SwissProgram } from "#api/tournaments/swiss/SwissProgram";

const MONDAY_NOON = Date.parse("2026-11-02T12:00:00Z");
const FIRST_WEDNESDAY = Date.parse("2026-11-04T18:00:00Z");
const PERIOD_END = Date.parse("2026-11-09T00:00:00Z");
const HOUR = 3_600_000;

let accounts: AccountStore;
let circuits: TournamentCircuitStore;
let adminId: string;

function circuitInput(overrides: Partial<CreateTournamentCircuitInput> = {}): CreateTournamentCircuitInput {
  return {
    name: "Weekly Cup",
    startsAt: MONDAY_NOON,
    endsAt: PERIOD_END,
    timeZone: "UTC",
    schedule: {
      cadence: TournamentCircuitCadence.WEEKLY.value,
      slots: [{ weekday: 3, localTime: "18:00" }],
    },
    leadTimeMs: DEFAULT_CIRCUIT_SETTINGS.leadTimeMs,
    checkInWindowMs: DEFAULT_CIRCUIT_SETTINGS.checkInWindowMs,
    pointsTable: [...DEFAULT_CIRCUIT_SETTINGS.pointsTable],
    participationPoints: DEFAULT_CIRCUIT_SETTINGS.participationPoints,
    template: {
      structure: "swiss",
      topCut: false,
      bestOf: 1,
      maxPlayers: 16,
      allowBots: false,
      banlist: { mode: "none" },
      block: "BT10",
    },
    ...overrides,
  };
}

async function createCircuit(overrides: Partial<CreateTournamentCircuitInput> = {}) {
  const validated = validateCreateTournamentCircuit(circuitInput(overrides), MONDAY_NOON);
  if (!validated.ok) {
    throw new Error(JSON.stringify(validated.errors));
  }
  return circuits.create({
    createdBy: adminId,
    circuit: validated.value,
    now: MONDAY_NOON,
  });
}

async function finishWithResults(
  circuitId: string,
  results: { accountId: string; placement: number | null; games?: number }[],
): Promise<string> {
  const tournament = await accounts.createTournament(adminId, {
    name: "Manual event",
    block: "BT10",
    startsAt: MONDAY_NOON + HOUR,
    maxPlayers: 16,
    circuitId,
  });
  await accounts.pool.query("UPDATE tournaments SET status='finished' WHERE id=$1", [tournament.id]);
  const participants: TournamentResultExportParticipant[] = results.map((result, index) => ({
    participantId: `participant-${index}`,
    displayName: `Player ${index}`,
    accountId: result.accountId,
    kind: "human",
    placement: result.placement,
    wins: result.games ?? 1,
    losses: 0,
    draws: 0,
    byes: 0,
    dropped: false,
    disqualified: false,
    decklist: null,
  }));
  await accounts.pool.query(
    "INSERT INTO tournament_result_exports (tournament_id, schema_version, payload, created_at) VALUES ($1,1,$2,$3)",
    [tournament.id, JSON.stringify({ schemaVersion: 1, participants, matches: [] }), MONDAY_NOON],
  );
  return tournament.id;
}

async function player(name: string): Promise<string> {
  return (await accounts.accountForIdentity("email", name, name)).id;
}

beforeEach(async () => {
  accounts = new AccountStore(createMemoryPool());
  circuits = new TournamentCircuitStore(accounts);
  adminId = (await accounts.accountForIdentity("email", "admin", "Admin")).id;
});

describe("circuit scheduling", () => {
  it("creates each occurrence once, only inside the lead time, with check-in windows", async () => {
    const circuit = await createCircuit();
    expect(circuit.nextOccurrenceAt).toBe(FIRST_WEDNESDAY);

    expect(await scheduleCircuitTournaments({ accounts, now: MONDAY_NOON })).toBe(0);
    const inLeadTime = FIRST_WEDNESDAY - 47 * HOUR;
    expect(await scheduleCircuitTournaments({ accounts, now: inLeadTime })).toBe(1);
    expect(await scheduleCircuitTournaments({ accounts, now: inLeadTime + HOUR })).toBe(0);

    const { rows } = await accounts.pool.query(
      "SELECT name, category, auto_start, starts_at, check_in_opens_at, check_in_closes_at, registration_closes_at FROM tournaments WHERE circuit_id=$1",
      [circuit.id],
    );
    const checkInOpensAt = FIRST_WEDNESDAY - DEFAULT_CIRCUIT_SETTINGS.checkInWindowMs;
    const normalized = rows.map((row) => ({
      ...row,
      starts_at: Number(row.starts_at),
      check_in_opens_at: Number(row.check_in_opens_at),
      check_in_closes_at: Number(row.check_in_closes_at),
      registration_closes_at: Number(row.registration_closes_at),
    }));
    expect(normalized).toEqual([
      {
        name: "Weekly Cup #1",
        category: "official",
        auto_start: true,
        starts_at: FIRST_WEDNESDAY,
        check_in_opens_at: checkInOpensAt,
        check_in_closes_at: FIRST_WEDNESDAY,
        registration_closes_at: FIRST_WEDNESDAY,
      },
    ]);
  });

  it("cancels an auto-started Swiss event whose confirmed field is below the minimum", async () => {
    const circuit = await createCircuit();
    await scheduleCircuitTournaments({ accounts, now: FIRST_WEDNESDAY - HOUR });
    const series = new SeriesStore(accounts);
    const lifecycle = {
      accounts,
      participants: new ParticipantStore(accounts),
      bots: new BotSeatingStore(accounts),
      elimination: new EliminationStore(accounts),
      swiss: new SwissProgram(accounts, series),
    };
    expect(await startDueTournaments({ ...lifecycle, now: FIRST_WEDNESDAY - 1 })).toBe(0);
    expect(await startDueTournaments({ ...lifecycle, now: FIRST_WEDNESDAY })).toBe(0);

    const view = await circuits.view(circuit.id, FIRST_WEDNESDAY);
    expect(view?.tournaments.map((event) => event.status)).toEqual(["cancelled"]);
  });

  it("stops scheduling once the circuit is cancelled", async () => {
    const circuit = await createCircuit();
    expect(await circuits.cancel(circuit.id)).toEqual({
      kind: "cancelled",
      openTournamentIds: [],
    });
    expect(
      await scheduleCircuitTournaments({
        accounts,
        now: FIRST_WEDNESDAY - HOUR,
      }),
    ).toBe(0);
    expect(await circuits.cancel(circuit.id)).toEqual({ kind: "closed" });
  });
});

describe("circuit points and finalization", () => {
  it("adds placement points across events, freezes the leaderboard, and grants trophies once", async () => {
    const circuit = await createCircuit();
    const ana = await player("Ana");
    const bia = await player("Bia");
    const noShow = await player("NoShow");
    await finishWithResults(circuit.id, [
      { accountId: ana, placement: 1 },
      { accountId: bia, placement: 2 },
      { accountId: noShow, placement: null, games: 0 },
    ]);
    await finishWithResults(circuit.id, [
      { accountId: bia, placement: 1 },
      { accountId: ana, placement: 3 },
    ]);
    const pending = await accounts.createTournament(adminId, {
      name: "Still running",
      block: "BT10",
      startsAt: MONDAY_NOON + HOUR,
      maxPlayers: 8,
      circuitId: circuit.id,
    });

    expect(await recordCircuitPoints({ accounts, now: MONDAY_NOON })).toBe(4);
    expect(await recordCircuitPoints({ accounts, now: MONDAY_NOON })).toBe(0);

    const live = await circuits.leaderboard({
      circuitId: circuit.id,
      page: 1,
      accountId: ana,
    });
    expect(
      live?.entries.map(({ displayName, points, events, position }) => [displayName, points, events, position]),
    ).toEqual([
      ["Bia", 45, 2, 1],
      ["Ana", 39, 2, 2],
    ]);
    expect(live?.mine?.position).toBe(2);
    expect(live?.final).toBe(false);

    expect(await finalizeTournamentCircuits({ accounts, now: PERIOD_END })).toBe(0);
    await accounts.pool.query("UPDATE tournaments SET status='cancelled' WHERE id=$1", [pending.id]);
    expect(await finalizeTournamentCircuits({ accounts, now: PERIOD_END - 1 })).toBe(0);
    expect(await finalizeTournamentCircuits({ accounts, now: PERIOD_END })).toBe(1);
    expect(await finalizeTournamentCircuits({ accounts, now: PERIOD_END })).toBe(0);

    const final = await circuits.leaderboard({
      circuitId: circuit.id,
      page: 1,
    });
    expect(final?.final).toBe(true);
    expect(final?.total).toBe(2);

    const trophies = new TrophyStore(accounts);
    expect((await trophies.getTrophies(bia)).items).toEqual([
      {
        award: "circuit_champion",
        tier: "rainbow",
        source: {
          kind: "tournament_circuit",
          circuitId: circuit.id,
          name: "Weekly Cup",
        },
        awardedAt: PERIOD_END,
      },
    ]);
    expect((await trophies.getTrophies(ana)).items.map((trophy) => trophy.award)).toEqual(["circuit_top_four"]);
  });
});

describe("validateCreateTournamentCircuit", () => {
  it("rejects slots, scoring and windows that cannot run", () => {
    const result = validateCreateTournamentCircuit(
      circuitInput({
        timeZone: "Mars/Olympus",
        schedule: {
          cadence: TournamentCircuitCadence.WEEKLY.value,
          slots: [
            { weekday: 7, localTime: "25:00" },
            { weekday: 7, localTime: "25:00" },
          ],
        },
        pointsTable: [
          { maxPlacement: 4, points: 10 },
          { maxPlacement: 2, points: 20 },
        ],
        checkInWindowMs: DEFAULT_CIRCUIT_SETTINGS.leadTimeMs,
      }),
      MONDAY_NOON,
    );
    expect(result.ok ? [] : result.errors.map((error) => error.code)).toEqual([
      "time_zone_invalid",
      "slots_invalid",
      "check_in_window_invalid",
      "points_table_invalid",
    ]);
  });

  it("accepts month days 1 to 31 and rejects days outside the month", () => {
    const monthly = (monthDay: number) =>
      validateCreateTournamentCircuit(
        circuitInput({
          endsAt: Date.parse("2027-01-01T00:00:00Z"),
          schedule: {
            cadence: TournamentCircuitCadence.MONTHLY.value,
            slots: [{ monthDay, localTime: "18:00" }],
          },
        }),
        MONDAY_NOON,
      );
    expect(monthly(1).ok).toBe(true);
    expect(monthly(31).ok).toBe(true);
    for (const monthDay of [0, 32, 1.5]) {
      const result = monthly(monthDay);
      expect(result.ok ? [] : result.errors.map((error) => error.code)).toEqual(["slots_invalid"]);
    }
  });

  it("reports template errors under the template field", () => {
    const result = validateCreateTournamentCircuit(
      circuitInput({ template: { ...circuitInput().template, maxPlayers: 1 } }),
      MONDAY_NOON,
    );
    expect(result.ok ? [] : result.errors.map((error) => error.field)).toEqual(["template.maxPlayers"]);
  });

  it("rejects a period with no slot inside it", () => {
    const result = validateCreateTournamentCircuit(circuitInput({ endsAt: FIRST_WEDNESDAY - HOUR }), MONDAY_NOON);
    expect(result.ok ? [] : result.errors.map((error) => error.code)).toEqual(["no_occurrences"]);
  });
});
