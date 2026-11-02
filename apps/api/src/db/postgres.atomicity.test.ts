import { buildTournamentRules } from "#api/tournaments/rules/buildTournamentRules";
import { swapTournamentPairings } from "#api/tournaments/pairing/swapTournamentPairings";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AccountStore } from "../accounts/AccountStore.js";
import { FeedbackStore } from "../bugs/FeedbackStore.js";
import { fetchReplayFromDb } from "../replays/inputs/tools/fetch.js";
import { REPLAY_FORMAT, type ReplayRecord } from "../replays/inputs/types.js";
import { RED_DECK } from "../engine/testDecks.js";
import { appendTournamentEvent, readTournamentEvents } from "../tournaments/audit/index.js";
import { inProcessTournamentLock, ParticipantStore } from "../tournaments/participants/index.js";
import { DeadlineQueue } from "../tournaments/scheduler/index.js";

import { SeriesStore } from "../tournaments/series/index.js";
import { SwissProgram } from "../tournaments/swiss/index.js";
import { migrations } from "./migrations/index.js";
import { runMigrations, type Migration } from "./migrator.js";

/**
 * The transaction lane, against a real Postgres.
 *
 * **Why this file exists.** Every other database test in the tree runs on pg-mem, which does not
 * implement ROLLBACK: it applies the statements of a rolled-back transaction anyway. So the suite's
 * atomicity claims are asserted on the VERB — "the module issued ROLLBACK" — and never on the
 * outcome, because asserting the surviving rows there would pin the fake's bug rather than the
 * module's behaviour (see the comments in `SwissProgram.test.ts`, which say exactly this). That is
 * the right call for a test that must run everywhere, and it leaves one thing unverified: whether a
 * rolled-back command actually leaves the database as it found it. This file verifies that, and
 * nothing else — it is deliberately a handful of scenarios, not a second copy of the suite.
 *
 * **How to run it.** It is its own lane, excluded from the default `pnpm test` by
 * `vitest.config.ts` unless `POSTGRES_TESTS=1`, so a machine with no database does not collect it
 * at all rather than reporting five permanently pending tests:
 *
 * ```bash
 * docker run --rm -d -p 55432:5432 -e POSTGRES_PASSWORD=aegis --name aegis-pg postgres:16
 * POSTGRES_TEST_URL=postgres://postgres:aegis@127.0.0.1:55432/postgres \
 *   pnpm --filter @aegis/api test:postgres
 * docker rm -f aegis-pg
 * ```
 *
 * Any reachable Postgres works: point `POSTGRES_TEST_URL` (or `DATABASE_URL`) at it. Opting in
 * without a connection string is an error, not a skip, so the lane cannot pass by doing nothing.
 * There is no CI job wired to it yet.
 *
 * **Why plain `pg` and not testcontainers.** The value of this lane is real Postgres transaction
 * semantics, not container lifecycle management. `pg` is already a runtime dependency; testcontainers
 * would add a dev dependency and a Docker client to replace the one `docker run` line above, and
 * would still refuse to run where Docker is unavailable. Adding a dependency to arrive at the same
 * skip is not worth it.
 *
 * Each run works inside its own schema and drops it afterwards, so the lane is safe to point at a
 * scratch database and leaves nothing behind.
 */

const ENABLED = process.env.POSTGRES_TESTS === "1";
const CONNECTION = process.env.POSTGRES_TEST_URL ?? process.env.DATABASE_URL;
const SCHEMA = `aegis_test_${randomUUID().replace(/-/g, "")}`;

/** A pool pinned to this run's own schema, so nothing it creates can collide or persist. */
function isolatedPool(): Pool {
  return new Pool({ connectionString: CONNECTION, options: `-c search_path=${SCHEMA}` });
}

if (ENABLED && !CONNECTION) {
  throw new Error("POSTGRES_TESTS=1 needs POSTGRES_TEST_URL (or DATABASE_URL) to point at a Postgres");
}

describe.skipIf(!ENABLED)("transaction atomicity against a real Postgres", () => {
  let admin: Pool;

  beforeAll(async () => {
    admin = new Pool({ connectionString: CONNECTION });
    await admin.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
  });

  afterAll(async () => {
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await admin.end();
  });

  it("rolls back tournament completion when granting trophies fails and grants once on retry", async () => {
    const pool = isolatedPool();
    const accounts = new AccountStore(pool);
    const participants = new ParticipantStore(accounts);
    const series = new SeriesStore(accounts);
    const swiss = new SwissProgram(accounts, series);
    try {
      const { tournamentId } = await startEvent(accounts, participants, swiss, 4);
      await pool.query("UPDATE tournament_phases SET planned_rounds=1 WHERE tournament_id=$1", [tournamentId]);
      for (const match of await series.scoreViews(tournamentId)) {
        await series.overrideResolution({
          tournamentId,
          matchId: match.matchId,
          mode: "decide",
          outcome: { officialResult: "participant0" },
          reason: "Complete the final round",
          winsRequired: 2,
          seriesDurationMs: null,
          commandId: randomUUID(),
        });
      }
      const roundId = await roundIdOf(pool, tournamentId, 1);
      await pool.query(
        "CREATE FUNCTION reject_trophy_grant() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'trophy storage unavailable'; END $$",
      );
      await pool.query(
        "CREATE TRIGGER reject_trophy_grant BEFORE INSERT ON player_trophies FOR EACH ROW EXECUTE FUNCTION reject_trophy_grant()",
      );
      await expect(swiss.closeRoundIfComplete(roundId)).rejects.toThrow("trophy storage unavailable");
      expect((await accounts.tournament(tournamentId))?.status).toBe("in_progress");
      expect((await pool.query("SELECT status FROM tournament_rounds WHERE id=$1", [roundId])).rows[0].status).toBe(
        "published",
      );
      expect(
        (await pool.query("SELECT * FROM tournament_trophy_grants WHERE tournament_id=$1", [tournamentId])).rows,
      ).toEqual([]);
      expect(
        (
          await pool.query("SELECT * FROM tournament_events WHERE tournament_id=$1 AND command='tournament_finished'", [
            tournamentId,
          ])
        ).rows,
      ).toEqual([]);
      await pool.query("DROP TRIGGER reject_trophy_grant ON player_trophies");
      const finished = await swiss.closeRoundIfComplete(roundId);
      expect(finished.ok && finished.value.kind).toBe("tournament_finished");
      expect(
        (await pool.query("SELECT * FROM player_trophies WHERE tournament_id=$1", [tournamentId])).rows,
      ).toHaveLength(4);
      await swiss.closeRoundIfComplete(roundId);
      expect(
        (await pool.query("SELECT * FROM player_trophies WHERE tournament_id=$1", [tournamentId])).rows,
      ).toHaveLength(4);
    } finally {
      await accounts.close();
    }
  });

  it("rolls back pairing changes when audit persistence fails and serializes duplicate swaps", async () => {
    const pool = isolatedPool();
    const accounts = new AccountStore(pool);
    const participants = new ParticipantStore(accounts);
    const series = new SeriesStore(accounts);
    const swiss = new SwissProgram(accounts, series);
    try {
      const { tournamentId } = await startEvent(accounts, participants, swiss, 4);
      const tournament = (await accounts.tournament(tournamentId))!;
      const readPairings = async () =>
        (
          await pool.query<{
            id: string;
            player0_account_id: string;
            player0_participant_id: string;
          }>(
            "SELECT id,player0_account_id,player0_participant_id FROM tournament_matches WHERE tournament_id=$1 ORDER BY id",
            [tournamentId],
          )
        ).rows;
      const before = await readPairings();
      expect(before).toHaveLength(2);
      const input = {
        accounts,
        tournamentId,
        actorAccountId: tournament.createdBy!,
        firstMatchId: before[0]!.id,
        secondMatchId: before[1]!.id,
        firstSeat: 0 as const,
        secondSeat: 0 as const,
        reason: "Correct community pairings",
        commandId: randomUUID(),
      };
      await pool.query(`CREATE FUNCTION reject_pairing_audit() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'pairing audit unavailable'; END $$`);
      await pool.query(`CREATE TRIGGER reject_pairing_audit BEFORE INSERT ON tournament_events
        FOR EACH ROW WHEN (NEW.command='swap_pairings') EXECUTE FUNCTION reject_pairing_audit()`);
      await expect(swapTournamentPairings(input)).rejects.toThrow("pairing audit unavailable");
      expect(await readPairings()).toEqual(before);
      await pool.query("DROP TRIGGER reject_pairing_audit ON tournament_events");
      const results = await Promise.all([swapTournamentPairings(input), swapTournamentPairings(input)]);
      expect(results.every((result) => result.ok)).toBe(true);
      expect(results.filter((result) => result.ok && result.replayed)).toHaveLength(1);
      const after = await readPairings();
      expect(after[0]?.player0_account_id).toBe(before[1]?.player0_account_id);
      expect(after[1]?.player0_account_id).toBe(before[0]?.player0_account_id);
      expect(after[0]?.player0_participant_id).toBe(before[1]?.player0_participant_id);
      expect(
        (await readTournamentEvents(pool, tournamentId)).filter((event) => event.command === "swap_pairings"),
      ).toHaveLength(1);
    } finally {
      await accounts.close();
    }
  });

  it("leaves the database untouched when a migration fails", async () => {
    const pool = isolatedPool();
    try {
      await runMigrations(pool, migrations);
      const broken: Migration = {
        id: "999-deliberately-broken",
        up: async (db) => {
          await db.query("CREATE TABLE half_applied (id uuid PRIMARY KEY)");
          await db.query("SELECT * FROM a_table_that_does_not_exist");
        },
      };
      await expect(runMigrations(pool, [...migrations, broken])).rejects.toThrow(/999-deliberately-broken/);

      // Both halves of the guarantee: the table the migration got as far as creating is gone, and
      // the migration is not recorded, so the next boot retries it rather than skipping it for ever.
      const survived = await pool.query(
        "SELECT 1 FROM information_schema.tables WHERE table_schema=$1 AND table_name='half_applied'",
        [SCHEMA],
      );
      expect(survived.rowCount).toBe(0);
      const recorded = await pool.query("SELECT 1 FROM schema_migrations WHERE id=$1", ["999-deliberately-broken"]);
      expect(recorded.rowCount).toBe(0);
      // ...and the migrations that DID apply are still applied.
      expect(await runMigrations(pool, migrations)).toEqual([]);
    } finally {
      await pool.end();
    }
  });

  it("leaves the round open when a swiss close cannot publish its successor", async () => {
    const pool = isolatedPool();
    const accounts = new AccountStore(pool);
    const participants = new ParticipantStore(accounts);
    const series = new SeriesStore(accounts);
    const swiss = new SwissProgram(accounts, series);
    try {
      const event = await startEvent(accounts, participants, swiss, 4);

      // Resolve every confrontation of round 1, then empty the field so round 2 cannot be paired.
      for (const view of await series.scoreViews(event.tournamentId)) {
        if (!view.participant0Id || !view.participant1Id) continue;
        await series.overrideResolution({
          tournamentId: event.tournamentId,
          matchId: view.matchId,
          mode: "decide",
          outcome: { officialResult: "participant0" },
          reason: "settled for the fixture",
          winsRequired: 2,
          seriesDurationMs: null,
          commandId: randomUUID(),
        });
      }
      for (const accountId of event.accountIds)
        await participants.drop({ tournamentId: event.tournamentId, accountId });

      const roundId = await roundIdOf(pool, event.tournamentId, 1);
      const closed = await swiss.closeRoundIfComplete(roundId);
      expect(closed.ok).toBe(false);

      // THE claim pg-mem cannot check: the close ledgered the round and marked it closed before
      // pairing failed, and none of that may have survived — otherwise the round is closed with no
      // successor and every retry reports `already_closed`, stranding the event for ever.
      const round = await pool.query<{ status: string; closed_at: string | null }>(
        "SELECT status, closed_at FROM tournament_rounds WHERE id=$1",
        [roundId],
      );
      expect(round.rows[0]?.status).toBe("published");
      expect(round.rows[0]?.closed_at).toBeNull();
      expect(await swiss.ledger(event.tournamentId)).toHaveLength(0);
    } finally {
      await accounts.close();
    }
  });

  it("allocates audit sequences without a gap under concurrent writers", async () => {
    const pool = isolatedPool();
    const accounts = new AccountStore(pool);
    const participants = new ParticipantStore(accounts);
    const series = new SeriesStore(accounts);
    const swiss = new SwissProgram(accounts, series);
    try {
      const event = await startEvent(accounts, participants, swiss, 4);
      const before = (await readTournamentEvents(pool, event.tournamentId)).length;

      // The scenario the old MAX(sequence)+1 retry could not survive: several writers appending to
      // one tournament at once, each inside its own transaction. Under the retry a loser hit 23505,
      // which aborts its transaction on real Postgres and makes the re-read impossible; under the
      // allocator lock they simply queue.
      const appends = Array.from({ length: 12 }, (_unused, index) =>
        withTransaction(pool, (client) =>
          appendTournamentEvent(client, {
            tournamentId: event.tournamentId,
            actorKind: "system",
            actorId: "system",
            command: "bot_fill",
            commandId: `concurrent-${index}`,
            reason: "concurrent allocator probe",
            reasonCode: "probe",
          }),
        ),
      );
      const results = await Promise.all(appends);
      expect(results.every((result) => result.kind === "appended")).toBe(true);

      const trail = await readTournamentEvents(pool, event.tournamentId);
      expect(trail).toHaveLength(before + 12);
      // Gapless and unique: the whole point of the allocator.
      expect(trail.map((entry) => entry.sequence)).toEqual(trail.map((_entry, index) => index + 1));
      expect(new Set(trail.map((entry) => entry.sequence)).size).toBe(trail.length);
    } finally {
      await accounts.close();
    }
  });

  it("hands two concurrent workers disjoint deadline rows", async () => {
    // The other half pg-mem cannot see. It PARSES `FOR UPDATE SKIP LOCKED` and then ignores it —
    // no row locks, no skipping — so under the fake the claim is an ordinary SELECT and two workers
    // would both be handed the same rows without anything failing. Exactly-once across processes
    // rests on the real clause, and this is the only place it is exercised.
    //
    // Each queue gets its OWN in-process lock, because sharing one would serialise the two claims in
    // memory and prove nothing about the database.
    const pool = isolatedPool();
    const accounts = new AccountStore(pool);
    const participants = new ParticipantStore(accounts);
    const series = new SeriesStore(accounts);
    const swiss = new SwissProgram(accounts, series);
    try {
      const event = await startEvent(accounts, participants, swiss, 4);
      const now = Date.now();
      const queues = [
        new DeadlineQueue(accounts, inProcessTournamentLock()),
        new DeadlineQueue(accounts, inProcessTournamentLock()),
      ];
      const subjects = Array.from({ length: 8 }, () => randomUUID());
      for (const subjectId of subjects)
        await queues[0]!.enqueue({
          kind: "join_game_loss",
          tournamentId: event.tournamentId,
          subjectId,
          dueAt: now - 1_000,
          now,
        });

      const [first, second] = await Promise.all([
        queues[0]!.claimDue(now, "worker-a", 8),
        queues[1]!.claimDue(now, "worker-b", 8),
      ]);

      const claimed = [...first!, ...second!].map((row) => row.id);
      // Disjoint, and between them they took every due row: nothing was handed out twice and
      // nothing was lost to the skip.
      expect(new Set(claimed).size).toBe(claimed.length);
      expect(new Set(claimed).size).toBe(subjects.length);
      // Each row is leased to exactly one of the two workers, and to nobody else.
      const leases = (
        await pool.query<{ leased_by: string | null }>(
          "SELECT leased_by FROM tournament_deadlines WHERE tournament_id=$1",
          [event.tournamentId],
        )
      ).rows.map((row) => row.leased_by);
      expect(leases.every((leasedBy) => leasedBy === "worker-a" || leasedBy === "worker-b")).toBe(true);
    } finally {
      await accounts.close();
    }
  });

  it("writes no audit event when the decision it describes rolls back", async () => {
    const pool = isolatedPool();
    const accounts = new AccountStore(pool);
    const participants = new ParticipantStore(accounts);
    const series = new SeriesStore(accounts);
    const swiss = new SwissProgram(accounts, series);
    try {
      const event = await startEvent(accounts, participants, swiss, 4);
      const match = (await series.scoreViews(event.tournamentId)).find(
        (view) => view.participant0Id && view.participant1Id,
      )!;
      // Publishing round 1 audits itself, so the trail is not empty before the ruling below;
      // what must not change is its contents.
      const trailBefore = await readTournamentEvents(pool, event.tournamentId);

      // The audit row and the change it describes share one transaction, so a failure in either
      // must take both down. A trail that can outlive the decision it records is worse than none.
      await expect(
        series.overrideResolution({
          tournamentId: event.tournamentId,
          matchId: match.matchId,
          mode: "decide",
          outcome: { officialResult: "participant0" },
          reason: "a ruling whose ledger write fails",
          winsRequired: 2,
          seriesDurationMs: null,
          commandId: randomUUID(),
          audit: async () => {
            throw new Error("ledger unavailable");
          },
        }),
      ).rejects.toThrow(/ledger unavailable/);

      expect((await series.seriesForMatch(match.matchId))?.status ?? "no series").not.toBe("resolved");
      expect(await readTournamentEvents(pool, event.tournamentId)).toEqual(trailBefore);
    } finally {
      await accounts.close();
    }
  });
});

async function startEvent(
  accounts: AccountStore,
  participants: ParticipantStore,
  swiss: SwissProgram,
  size: number,
): Promise<{ tournamentId: string; accountIds: string[] }> {
  const organizer = await accounts.accountForIdentity("discord", `organizer-${randomUUID()}`, "Organizer");
  const tournament = await accounts.createTournament(organizer.id, {
    name: "Atomicity",
    block: "BT10",
    startsAt: Date.now(),
    maxPlayers: size,
    structure: "swiss",
    bestOf: 3,
    rules: buildTournamentRules({ bestOf: 3 }),
  });
  const accountIds: string[] = [];
  for (let index = 0; index < size; index += 1) {
    const account = await accounts.accountForIdentity("discord", `player-${randomUUID()}`, `Player ${index}`);
    const deck = await accounts.saveDeck(account.id, {
      name: "Competitive",
      mainDeck: [...RED_DECK.mainDeck],
      eggDeck: [...RED_DECK.eggDeck],
    });
    await participants.register({ tournamentId: tournament.id, accountId: account.id, savedDeckId: deck.id });
    await participants.checkIn({ tournamentId: tournament.id, accountId: account.id });
    accountIds.push(account.id);
  }
  await participants.closeCheckIn({ tournamentId: tournament.id });
  const started = await swiss.startTournamentProgram(tournament.id);
  if (!started.ok) throw new Error(`could not start the fixture event: ${started.reason}`);
  return { tournamentId: tournament.id, accountIds };
}

/** One unit of work in its own transaction, so the concurrency probe above is really concurrent. */
async function withTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function roundIdOf(pool: Pool, tournamentId: string, number: number): Promise<string> {
  const row = (
    await pool.query<{ id: string }>(
      `SELECT r.id FROM tournament_rounds r
         JOIN tournament_phases p ON p.id = r.phase_id
        WHERE p.tournament_id=$1 AND r.number=$2`,
      [tournamentId, number],
    )
  ).rows[0];
  if (!row) throw new Error(`round ${number} was never published`);
  return row.id;
}

describe.skipIf(!ENABLED)("feedback report replays against a real Postgres", () => {
  const schema = `${SCHEMA}_replays`;
  let admin: Pool;
  const DAY = 24 * 60 * 60 * 1000;
  const record: ReplayRecord = {
    format: REPLAY_FORMAT,
    matchId: "00000000-0000-4000-8000-000000000001",
    seed: 4242,
    rules: { deckFormat: "standard", unlimited: false, betaBattle: false },
    seats: [
      { deck: { mainDeck: ["BT1-009"], eggDeck: ["BT1-001"] } },
      { deck: { mainDeck: ["BT1-010"], eggDeck: ["BT1-002"] }, bot: true },
    ],
    inputs: [
      { kind: "intent", seat: 0, intent: { type: "ready" }, ok: true, stateVersion: 0, engineEvents: 0 },
      { kind: "startMatch", stateVersion: 0, engineEvents: 0 },
    ],
  };

  beforeAll(async () => {
    admin = new Pool({ connectionString: CONNECTION });
    await admin.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
  });

  afterAll(async () => {
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  });

  it("stores, lists, serves, expires and cascades replays, and the CLI reads the same rows", async () => {
    const pool = new Pool({ connectionString: CONNECTION, options: `-c search_path=${schema}` });
    let now = 1_000 * DAY;
    const feedback = new FeedbackStore(new AccountStore(pool), { replayRetentionMs: 30 * DAY, now: () => now });
    try {
      const report = { kind: "bug" as const, summary: "s", description: "d", cardIds: [] };
      const withReplay = await feedback.save(report, undefined, false);
      const without = await feedback.save(report, undefined, false);
      await feedback.saveReplay(withReplay, record);

      // jsonb round-trips the record exactly, and the LEFT JOIN marks only the report that has one.
      expect(await feedback.replay(withReplay)).toEqual(record);
      const listed = (await feedback.list()).items;
      expect(listed.find((item) => item.id === withReplay)).toMatchObject({ hasReplay: true, replayInputs: 2 });
      expect(listed.find((item) => item.id === without)).toMatchObject({ hasReplay: false, replayInputs: null });
      expect((await fetchReplayFromDb(pool, withReplay, now - 30 * DAY)).record).toEqual(record);

      // Past the window: the CLI treats it as gone even before a prune, and listing prunes it.
      now += 31 * DAY;
      await expect(fetchReplayFromDb(pool, withReplay, now - 30 * DAY)).rejects.toThrow(/No replay/);
      expect((await feedback.list()).items.find((item) => item.id === withReplay)).toMatchObject({ hasReplay: false });
      expect((await pool.query("SELECT 1 FROM feedback_report_replays")).rowCount).toBe(0);

      // A replay goes with its report.
      await feedback.saveReplay(without, record);
      await pool.query("DELETE FROM feedback_reports WHERE id=$1", [without]);
      expect((await pool.query("SELECT 1 FROM feedback_report_replays")).rowCount).toBe(0);
    } finally {
      await pool.end();
    }
  });
});
