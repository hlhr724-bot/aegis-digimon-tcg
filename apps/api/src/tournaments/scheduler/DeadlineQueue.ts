import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { AccountStore } from "../../accounts/AccountStore.js";
import { type AcquireTournamentLock, inProcessTournamentLock } from "../participants/index.js";

/**
 * Which command a due row runs.
 *
 * The attendance ladder is two kinds rather than one rung that reschedules itself, because each
 * rung has to re-read presence before it acts. Splitting them makes "a player who turns up between
 * rungs cancels the remainder" a property of the queue — the match-loss row is only ever enqueued
 * by the game-loss rung deciding it is still warranted — instead of a condition somebody must
 * remember to re-check inside a loop.
 *
 * There is deliberately no row for the manual's warning. A warning is issued to a player who DID
 * turn up, late but inside the grace; it describes an arrival, not an instant, so nothing has to
 * wake up to notice it. The game-loss rung records whether the absentee had arrived late-but-in-
 * grace, which is the audit trail the warning was for.
 */
export type DeadlineKind = "join_game_loss" | "join_match_loss" | "series_deadline";

export type DeadlineRecord = {
  id: string;
  kind: DeadlineKind;
  tournamentId: string;
  /** The match id for the attendance ladder, the series id for the shared-clock timeout. */
  subjectId: string;
  dueAt: number;
  leaseExpiresAt: number | null;
  leasedBy: string | null;
  executedAt: number | null;
  result: string | null;
};

export type EnqueueDeadline = {
  kind: DeadlineKind;
  tournamentId: string;
  subjectId: string;
  dueAt: number;
  now: number;
};

/** How long a claimed row stays this worker's, before any other worker may retry it. */
export const DEADLINE_LEASE_MS = 30_000;

/**
 * How many due rows one pass claims.
 *
 * Sized against the lease, not against throughput: a pass leases its whole batch up front, so the
 * batch must finish well inside {@link DEADLINE_LEASE_MS} or the tail of it becomes claimable by
 * another worker while this one is still running it. Each command is a handful of small
 * transactions — milliseconds — so twenty is orders of magnitude inside a thirty-second lease, and
 * a backlog is drained by successive passes rather than by one long one. The lease is also renewed
 * per row, so the exposure is one command's duration rather than the batch's.
 *
 * Overrunning anyway is survivable rather than corrupting: the other worker re-runs an idempotent
 * command and only one of them records the execution.
 */
export const DEADLINE_BATCH_SIZE = 20;

const COLUMNS = "id, kind, tournament_id, subject_id, due_at, lease_expires_at, leased_by, executed_at, result";

/** The queue has one claim path, so its in-process lock has one key. */
const CLAIM_LOCK_KEY = "tournament_deadlines";

type Queryable = Pick<PoolClient, "query">;

type DeadlineRow = {
  id: string;
  kind: DeadlineKind;
  tournament_id: string;
  subject_id: string;
  due_at: string | number;
  lease_expires_at: string | number | null;
  leased_by: string | null;
  executed_at: string | number | null;
  result: string | null;
};

/**
 * Adds one deadline to the queue, on a caller-supplied client so it can commit with whatever
 * created the thing being scheduled.
 *
 * Idempotent through `UNIQUE (kind, subject_id)`: enqueueing the same rung for the same subject
 * twice inserts once. That is what lets workers race the same ladder step across overlapping
 * fixed-slot instances without producing two copies of the rung that follows it.
 *
 * Returns whether this call was the one that inserted, which is only interesting to a caller that
 * wants to log the difference.
 */
export async function insertDeadline(db: Queryable, input: EnqueueDeadline): Promise<boolean> {
  const inserted = await db.query(
    `INSERT INTO tournament_deadlines (id, kind, tournament_id, subject_id, due_at, created_at)
     VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
    [randomUUID(), input.kind, input.tournamentId, input.subjectId, input.dueAt, input.now],
  );
  return inserted.rowCount === 1;
}

/**
 * The persisted deadline queue: enqueue, lease, record.
 *
 * Separate from the scheduler that runs the commands so that `SeriesStore` can enqueue a series
 * clock inside the transaction that creates the series without importing the command layer that
 * imports `SeriesStore` back.
 *
 * Shares the AccountStore's pool and migration run rather than opening its own.
 */
export class DeadlineQueue {
  constructor(
    private readonly accounts: AccountStore,
    private readonly acquireLock: AcquireTournamentLock = inProcessTournamentLock(),
  ) {}

  async enqueue(input: EnqueueDeadline): Promise<boolean> {
    await this.accounts.ensureReady();
    return insertDeadline(this.accounts.pool, input);
  }

  /**
   * Takes a short lease on the due rows nobody else is working, and returns them.
   *
   * `FOR UPDATE SKIP LOCKED` is the cross-process half: two API containers scanning the same
   * queue take disjoint sets rather than blocking on each other or handing both the same row.
   * `lease_expires_at <= now` is the recovery half: a worker that died between claiming and
   * executing leaves rows that become claimable again the moment its lease lapses.
   *
   * The claim runs in its own transaction, deliberately not the command's: a command may take
   * minutes' worth of locks inside `SeriesStore`, and holding the queue rows for that long would
   * serialise every other worker behind it. The lease, not the row lock, is what excludes them.
   *
   * `acquireLock` is the in-process half of the same guarantee, exactly as in `ParticipantStore`:
   * two schedulers sharing one queue instance cannot interleave their claim transactions. It is
   * also the only half a test can observe, because pg-mem PARSES `FOR UPDATE SKIP LOCKED` and then
   * ignores it — it has neither row locks nor skipping, so under pg-mem the statement is an
   * ordinary SELECT. Production relies on the real clause; this seam is what makes the claim
   * deterministic in a test, and exactly-once across genuinely separate processes rests on the
   * lease plus the commands' own idempotency, not on this lock.
   */
  async claimDue(now: number, leasedBy: string, limit = DEADLINE_BATCH_SIZE): Promise<DeadlineRecord[]> {
    // Interpolated rather than bound because a LIMIT is a plan constant, not a value; it is
    // floored to an integer here so nothing but a number can reach the statement.
    const batch = Math.max(1, Math.floor(limit));
    const release = await this.acquireLock(CLAIM_LOCK_KEY);
    try {
      return await this.claimTransaction(now, leasedBy, batch);
    } finally {
      release();
    }
  }

  private async claimTransaction(now: number, leasedBy: string, batch: number): Promise<DeadlineRecord[]> {
    return this.transaction(async (client) => {
      const due = await client.query<{ id: string }>(
        `SELECT id FROM tournament_deadlines
          WHERE executed_at IS NULL AND due_at <= $1 AND (lease_expires_at IS NULL OR lease_expires_at <= $1)
          ORDER BY due_at, id
          LIMIT ${batch}
          FOR UPDATE SKIP LOCKED`,
        [now],
      );
      const claimed: DeadlineRecord[] = [];
      for (const { id } of due.rows) {
        const taken = await client.query<DeadlineRow>(
          `UPDATE tournament_deadlines SET leased_by=$1, lease_expires_at=$2
            WHERE id=$3 AND executed_at IS NULL
            RETURNING ${COLUMNS}`,
          [leasedBy, now + DEADLINE_LEASE_MS, id],
        );
        const row = taken.rows[0];
        if (row) claimed.push(toDeadline(row));
      }
      return claimed;
    });
  }

  /**
   * Records the outcome, and reports whether THIS worker was the one that recorded it.
   *
   * `executed_at IS NULL` is the last line of exactly-once accounting: if two workers ran the same
   * command anyway — pg-mem has no row locks, and a lapsed lease legitimately allows it — only one
   * of them counts it as executed. The commands themselves are idempotent, so the second one
   * changed nothing; this is what stops it being REPORTED as work done.
   */
  async markExecuted(id: string, now: number, result: string): Promise<boolean> {
    await this.accounts.ensureReady();
    const recorded = await this.accounts.pool.query(
      "UPDATE tournament_deadlines SET executed_at=$1, result=$2, lease_expires_at=NULL WHERE id=$3 AND executed_at IS NULL",
      [now, result, id],
    );
    return recorded.rowCount === 1;
  }

  /**
   * Hands a claimed row back unexecuted, for an outcome that is not yet knowable.
   *
   * A row released this way is due again immediately. That is the point: a command that stopped
   * because the state moved under it — a player arriving mid-transaction, a clock extended by
   * overtime — must not be retired with an answer it did not actually give. Retiring it would
   * silently drop a penalty; releasing it costs one more pass.
   */
  async releaseLease(id: string): Promise<void> {
    await this.accounts.ensureReady();
    await this.accounts.pool.query(
      "UPDATE tournament_deadlines SET lease_expires_at=NULL, leased_by=NULL WHERE id=$1 AND executed_at IS NULL",
      [id],
    );
  }

  async postpone(id: string, dueAt: number): Promise<void> {
    await this.accounts.ensureReady();
    await this.accounts.pool.query(
      "UPDATE tournament_deadlines SET due_at=$1, lease_expires_at=NULL, leased_by=NULL WHERE id=$2 AND executed_at IS NULL",
      [dueAt, id],
    );
  }

  /** Extends this worker's hold before it starts a command, so the lease covers one command. */
  async renewLease(id: string, now: number, leasedBy: string): Promise<void> {
    await this.accounts.ensureReady();
    await this.accounts.pool.query(
      "UPDATE tournament_deadlines SET lease_expires_at=$1 WHERE id=$2 AND leased_by=$3 AND executed_at IS NULL",
      [now + DEADLINE_LEASE_MS, id, leasedBy],
    );
  }

  async find(kind: DeadlineKind, subjectId: string): Promise<DeadlineRecord | undefined> {
    await this.accounts.ensureReady();
    const row = (
      await this.accounts.pool.query<DeadlineRow>(
        `SELECT ${COLUMNS} FROM tournament_deadlines WHERE kind=$1 AND subject_id=$2`,
        [kind, subjectId],
      )
    ).rows[0];
    return row && toDeadline(row);
  }

  async pending(now: number): Promise<DeadlineRecord[]> {
    await this.accounts.ensureReady();
    const rows = await this.accounts.pool.query<DeadlineRow>(
      `SELECT ${COLUMNS} FROM tournament_deadlines WHERE executed_at IS NULL AND due_at <= $1 ORDER BY due_at, id`,
      [now],
    );
    return rows.rows.map(toDeadline);
  }

  /** Test seam for a worker that claimed a row and then died: force its lease to lapse. */
  async expireLease(id: string, at: number): Promise<void> {
    await this.accounts.ensureReady();
    await this.accounts.pool.query("UPDATE tournament_deadlines SET lease_expires_at=$1 WHERE id=$2", [at, id]);
  }

  private async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    await this.accounts.ensureReady();
    const client = await this.accounts.pool.connect();
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
}

/**
 * Retires every unexecuted deadline still pointed at a subject, because the thing they were
 * watching is over.
 *
 * Called when a confrontation is decided, on a caller-supplied client so it commits with the
 * decision. Without it a resolved series leaves its own clock and the remaining attendance rung
 * queued: both would later fire, find nothing to do, and log — the match-loss rung after a
 * best-of-one game loss, the shared clock after a 2-0. Neither could corrupt anything, since every
 * command re-checks, but a queue that retires its own obsolete work is the difference between a
 * log line that means something and one that never does.
 */
export async function retireDeadlines(
  db: Queryable,
  subjectIds: readonly string[],
  at: number,
  result: string,
  exceptId?: string,
): Promise<void> {
  // The row that CAUSED the decision is never retired by it. It is mid-execution and about to
  // record its own outcome — "match loss applied", "resolved on the clock" — and letting the
  // decision overwrite that with "cancelled" would erase the only audit trail of why the
  // confrontation ended, and make the worker report the work as never done.
  for (const subjectId of subjectIds)
    await db.query(
      // `id` is a uuid column, so the exception parameter is cast to uuid on BOTH sides of the
      // guard: casting it to text made Postgres compare uuid <> text and reject the statement
      // (pg-mem accepts the untyped comparison, which is why only the real-Postgres lane sees it).
      `UPDATE tournament_deadlines SET executed_at=$1, result=$2, lease_expires_at=NULL
        WHERE subject_id=$3 AND executed_at IS NULL AND ($4::uuid IS NULL OR id <> $4::uuid)`,
      [at, result, subjectId, exceptId ?? null],
    );
}

/**
 * A UUID derived from a deadline row and a purpose, so a command that inserts a row can insert
 * exactly the same row twice.
 *
 * This is what makes an administrative game loss safe to execute twice: the synthetic game it
 * records carries a primary key computed from the deadline that ordered it, so the second attempt
 * collides instead of adding a second win to the score.
 */
export function derivedUuid(seed: string, purpose: string): string {
  const digest = createHash("sha256").update(`${purpose}:${seed}`).digest("hex");
  const version = `4${digest.slice(13, 16)}`;
  const variant = `${((Number.parseInt(digest[16] ?? "0", 16) & 0x3) | 0x8).toString(16)}${digest.slice(17, 20)}`;
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-${version}-${variant}-${digest.slice(20, 32)}`;
}

function toDeadline(row: DeadlineRow): DeadlineRecord {
  return {
    id: row.id,
    kind: row.kind,
    tournamentId: row.tournament_id,
    subjectId: row.subject_id,
    dueAt: Number(row.due_at),
    leaseExpiresAt: row.lease_expires_at === null ? null : Number(row.lease_expires_at),
    leasedBy: row.leased_by,
    executedAt: row.executed_at === null ? null : Number(row.executed_at),
    result: row.result,
  };
}
