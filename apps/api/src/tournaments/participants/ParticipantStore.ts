import type { TournamentRoundStartMode } from "@aegis/shared/tournaments/TournamentRoundStartMode";
import { appendTournamentEvent } from "#api/tournaments/audit/TournamentEventLog";
import type { TournamentOwnDeck } from "@aegis/shared/tournaments/TournamentOwnDeck";
import { hasAccountCapability } from "@aegis/shared/account/hasAccountCapability";
import { isAccountRole } from "@aegis/shared/account/isAccountRole";
import type { BotStyle } from "@aegis/shared/bot/BotStyle";
import { isBotStyle } from "@aegis/shared/bot/isBotStyle";
import type { DeckFormat } from "@aegis/shared/deckFormat";
import { verifyTournamentPassword } from "#api/tournaments/access/verifyTournamentPassword";
import { createHash, randomUUID } from "node:crypto";
import type { ParticipantKind, ParticipantView, RegistrationStatus, TournamentBanlistCard } from "@aegis/shared";
import type { PoolClient } from "pg";
import type { AccountStore, Deck } from "../../accounts/AccountStore.js";
import type { Queryable } from "../../db/migrator.js";
import { type DeckViolation, validateCompetitiveDeck } from "./deckLegality.js";

type OwnDeckParams = { tournamentId: string; accountId: string };
type ChangeDeckParams = OwnDeckParams & { savedDeckId: string; now?: number };
type SetRoundStartModeParams = OwnDeckParams & { mode: TournamentRoundStartMode };

export type ParticipantDeckSnapshot = {
  deckId: string | null;
  name: string;
  mainDeck: string[];
  eggDeck: string[];
  mainDeckArts?: string[];
  eggDeckArts?: string[];
  revision: number;
};

export type ParticipantRecord = {
  id: string;
  tournamentId: string;
  kind: ParticipantKind;
  accountId: string | null;
  displayName: string;
  status: RegistrationStatus;
  seed: number | null;
  savedDeckId: string | null;
  deckSnapshot: ParticipantDeckSnapshot | null;
  deckVersion: string | null;
  createdAt: number;
  checkedInAt: number | null;
  droppedAt: number | null;
  botStyle: BotStyle | null;
};

export type TournamentWindows = {
  registrationClosesAt: number | null;
  checkInOpensAt: number | null;
  checkInClosesAt: number | null;
};

export type ParticipantFailure =
  | "tournament_not_found"
  | "registration_closed"
  | "tournament_full"
  | "already_registered"
  | "disqualified"
  | "deck_not_found"
  | "deck_illegal"
  | "not_registered"
  | "check_in_not_open"
  | "check_in_closed"
  | "already_checked_in"
  | "already_dropped"
  | "incorrect_password";

export type ParticipantResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: ParticipantFailure; violations?: DeckViolation[] };

// Statuses that occupy a slot. A dropped or disqualified entrant frees their seat, which is what
// lets a waiting player take it before the field is locked.
const OCCUPYING_STATUSES = ["registered", "checked_in", "active"] as const;

// Which tournament statuses each phase accepts. The stored value may be either the legacy set
// ('registration' | 'in_progress' | 'finished') or the wider TournamentStatus the program moved
// to, so both spellings are listed rather than assumed. Anything not named here — a running,
// finished, cancelled or still-draft event — is refused.
const REGISTRATION_STATUSES = new Set(["registration"]);
const CHECK_IN_STATUSES = new Set(["registration", "check_in"]);
// Statuses that come strictly before check-in, so "not open yet" rather than "too late".
const PRE_CHECK_IN_STATUSES = new Set(["draft"]);

/**
 * `alreadyApplied` distinguishes "this call cancelled it" from "it was already cancelled". Both are
 * successes — the command is idempotent — but only the first has a change to audit, and a caller
 * that cannot tell them apart either writes a trail entry for nothing or, worse, treats a success
 * with no event as a bug. See {@link ParticipantStore.cancelTournament}.
 */
const CANCELLED = (reason: string, alreadyApplied = false) =>
  ({ status: "cancelled", reason, alreadyApplied }) as const;

/** A schedule whose parts contradict each other; see {@link ParticipantStore.windowOrderError}. */
export class WindowOrderError extends Error {}

export type ReleaseTournamentLock = () => void;
export type AcquireTournamentLock = (tournamentId: string) => Promise<ReleaseTournamentLock>;

/**
 * Serializes the mutations that contend for one tournament's capacity, so two requests handled by
 * the same process cannot both read "one slot left" before either writes.
 *
 * This is the in-process half of the guarantee. The cross-process half is the `FOR UPDATE` the
 * transactions take on the tournament row, which is what keeps two API containers honest against
 * one database. Both are needed: the row lock alone is what production relies on, and the seam is
 * what a test can actually observe, since pg-mem has no row locks at all.
 */
export function inProcessTournamentLock(): AcquireTournamentLock {
  const tails = new Map<string, Promise<void>>();
  return async (tournamentId) => {
    const previous = tails.get(tournamentId) ?? Promise.resolve();
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chain = previous.then(() => held);
    tails.set(tournamentId, chain);
    await previous;
    return () => {
      release();
      if (tails.get(tournamentId) === chain) tails.delete(tournamentId);
    };
  };
}

/**
 * Participants, check-in and the frozen competitive deck.
 *
 * The record a tournament is judged by is `deck_snapshot`: a copy of the saved deck's contents
 * taken when check-in closes. Editing the saved deck afterwards is a normal thing for a player to
 * do between events and must never reach back into a tournament already under way, so nothing
 * after the freeze reads `saved_decks` again.
 *
 * Shares the AccountStore's pool and migration run rather than opening its own.
 */
export class ParticipantStore {
  constructor(
    private readonly accounts: AccountStore,
    private readonly acquireLock: AcquireTournamentLock = inProcessTournamentLock(),
  ) {}

  /** The shared connection pool, so a lifecycle caller can append its audit row without a second one. */
  get pool() {
    return this.accounts.pool;
  }

  async participants(tournamentId: string): Promise<ParticipantRecord[]> {
    await this.accounts.ensureReady();
    const result = await this.accounts.pool.query<ParticipantRow>(
      `SELECT ${COLUMNS} FROM tournament_participants WHERE tournament_id=$1 ORDER BY created_at, id`,
      [tournamentId],
    );
    return result.rows.map(toParticipant);
  }

  async setRoundStartMode(input: SetRoundStartModeParams): Promise<boolean> {
    return this.mutate(input.tournamentId, async (client) => {
      const row = (
        await client.query<{ status: string; round_start_mode: TournamentRoundStartMode }>(
          "SELECT status, round_start_mode FROM tournaments WHERE id=$1 FOR UPDATE",
          [input.tournamentId],
        )
      ).rows[0];
      if (!row || row.status === "finished" || row.status === "cancelled") {
        return false;
      }
      if (row.round_start_mode === input.mode) {
        return true;
      }
      await client.query("UPDATE tournaments SET round_start_mode=$1 WHERE id=$2", [input.mode, input.tournamentId]);
      await appendTournamentEvent(client, {
        tournamentId: input.tournamentId,
        actorKind: "organizer",
        actorId: input.accountId,
        command: "round_start_mode_changed",
        commandId: randomUUID(),
        reason: "Organizer changed the round start mode",
        reasonCode: "round_start_mode_changed",
        subjectKind: "tournament",
        subjectId: input.tournamentId,
        before: { mode: row.round_start_mode },
        after: { mode: input.mode },
        now: Date.now(),
      });
      return true;
    });
  }

  async getOwnDeck({ tournamentId, accountId }: OwnDeckParams): Promise<TournamentOwnDeck | null> {
    await this.accounts.ensureReady();
    const row = (
      await this.accounts.pool.query<{
        saved_deck_id: string | null;
        deck_snapshot: ParticipantDeckSnapshot | string | null;
        status: string;
        participant_status: string;
        check_in_closes_at: string | null;
        name: string | null;
        main_deck: string[] | null;
        egg_deck: string[] | null;
        revision: number | null;
      }>(
        `SELECT p.saved_deck_id,p.deck_snapshot,p.status participant_status,t.status,t.check_in_closes_at,d.name,d.main_deck,d.egg_deck,d.revision
        FROM tournament_participants p JOIN tournaments t ON t.id=p.tournament_id
        LEFT JOIN saved_decks d ON d.account_id=p.account_id AND d.id=p.saved_deck_id
        WHERE p.tournament_id=$1 AND p.account_id=$2`,
        [tournamentId, accountId],
      )
    ).rows[0];
    if (!row) {
      return null;
    }
    const snapshot =
      typeof row.deck_snapshot === "string"
        ? (JSON.parse(row.deck_snapshot) as ParticipantDeckSnapshot)
        : row.deck_snapshot;
    if (snapshot) {
      return {
        savedDeckId: row.saved_deck_id,
        locked: true,
        name: snapshot.name,
        mainDeck: snapshot.mainDeck,
        eggDeck: snapshot.eggDeck,
        revision: snapshot.revision,
      };
    }
    const locked =
      !CHECK_IN_STATUSES.has(row.status) ||
      (row.participant_status !== "registered" && row.participant_status !== "checked_in") ||
      (row.check_in_closes_at !== null && Date.now() > Number(row.check_in_closes_at));
    if (!row.name || !row.main_deck || !row.egg_deck || row.revision === null) {
      return {
        savedDeckId: row.saved_deck_id,
        available: false,
        locked,
        name: "",
        mainDeck: [],
        eggDeck: [],
        revision: 0,
      };
    }
    return {
      savedDeckId: row.saved_deck_id,
      locked,
      name: row.name,
      mainDeck: row.main_deck,
      eggDeck: row.egg_deck,
      revision: row.revision,
    };
  }

  async changeDeck(input: ChangeDeckParams): Promise<ParticipantResult<ParticipantRecord>> {
    const now = input.now ?? Date.now();
    return this.mutate(input.tournamentId, async (client) => {
      const tournament = (
        await client.query<TournamentRow & { check_in_closes_at: string | null }>(
          "SELECT id, status, format, check_in_closes_at FROM tournaments WHERE id=$1 FOR UPDATE",
          [input.tournamentId],
        )
      ).rows[0];
      if (!tournament) {
        return { ok: false, reason: "tournament_not_found" } as const;
      }
      if (
        !CHECK_IN_STATUSES.has(tournament.status) ||
        (tournament.check_in_closes_at !== null && now > Number(tournament.check_in_closes_at))
      ) {
        return { ok: false, reason: "check_in_closed" } as const;
      }
      const participant = await this.lockParticipant(client, input.tournamentId, input.accountId);
      if (participant?.deckSnapshot) {
        return { ok: false, reason: "check_in_closed" } as const;
      }
      if (!participant || (participant.status !== "registered" && participant.status !== "checked_in")) {
        return { ok: false, reason: "not_registered" } as const;
      }
      const deck = await this.savedDeck(client, input.accountId, input.savedDeckId);
      if (!deck) {
        return { ok: false, reason: "deck_not_found" } as const;
      }
      const legality = validateCompetitiveDeck(
        deck,
        await this.readBanlist(client, input.tournamentId),
        tournament.format,
      );
      if (!legality.legal) {
        return { ok: false, reason: "deck_illegal", violations: legality.violations } as const;
      }
      await client.query("UPDATE tournament_participants SET saved_deck_id=$1 WHERE id=$2", [
        input.savedDeckId,
        participant.id,
      ]);
      return { ok: true, value: (await this.readParticipant(client, participant.id))! } as const;
    });
  }

  async participantViews(tournamentId: string): Promise<ParticipantView[]> {
    return (await this.participants(tournamentId)).map(toParticipantView);
  }

  async windows(tournamentId: string): Promise<TournamentWindows | undefined> {
    await this.accounts.ensureReady();
    const row = (
      await this.accounts.pool.query<WindowRow>(
        "SELECT registration_closes_at, check_in_opens_at, check_in_closes_at FROM tournaments WHERE id=$1",
        [tournamentId],
      )
    ).rows[0];
    return row && toWindows(row);
  }

  static windowOrderError(windows: TournamentWindows): string | undefined {
    const { checkInOpensAt, checkInClosesAt } = windows;
    if (checkInOpensAt !== null && checkInClosesAt !== null && checkInOpensAt > checkInClosesAt)
      return "check_in_window_inverted";
    return undefined;
  }

  async setWindows(tournamentId: string, windows: Partial<TournamentWindows>): Promise<boolean> {
    await this.accounts.ensureReady();
    const current = await this.windows(tournamentId);
    if (!current) return false;
    const next = { ...current, ...windows };
    const orderError = ParticipantStore.windowOrderError(next);
    if (orderError) throw new WindowOrderError(orderError);
    const updated = await this.accounts.pool.query(
      "UPDATE tournaments SET registration_closes_at=$1, check_in_opens_at=$2, check_in_closes_at=$3 WHERE id=$4",
      [next.registrationClosesAt, next.checkInOpensAt, next.checkInClosesAt, tournamentId],
    );
    return updated.rowCount === 1;
  }

  /**
   * The banlist the tournament froze at creation. The column is owned by a parallel slice, so a
   * database that has not got it yet must read as "no restrictions" rather than failing
   * registration — but only for that one reason. Every other failure propagates: a connection
   * blip must not quietly run a competitive event with the banlist switched off.
   *
   * Absence is decided by asking the catalog first, not by letting the query fail, because inside
   * a transaction a failed statement poisons everything after it.
   */
  async banlistCards(tournamentId: string): Promise<TournamentBanlistCard[]> {
    await this.accounts.ensureReady();
    return this.readBanlist(this.accounts.pool, tournamentId);
  }

  private async readBanlist(db: Queryable, tournamentId: string): Promise<TournamentBanlistCard[]> {
    if (!(await hasBanlistColumn(db))) return [];
    try {
      const row = (
        await db.query<{ banlist_cards: TournamentBanlistCard[] | string | null }>(
          "SELECT banlist_cards FROM tournaments WHERE id=$1",
          [tournamentId],
        )
      ).rows[0];
      const cards = typeof row?.banlist_cards === "string" ? JSON.parse(row.banlist_cards) : row?.banlist_cards;
      return cards ?? [];
    } catch (error) {
      // Only the column vanishing between the catalog probe and the read is tolerable here.
      if (!isUndefinedColumn(error)) throw error;
      return [];
    }
  }

  async isOrganizer(tournamentId: string, accountId: string): Promise<boolean> {
    await this.accounts.ensureReady();
    const row = (
      await this.accounts.pool.query<{ created_by: string }>("SELECT created_by FROM tournaments WHERE id=$1", [
        tournamentId,
      ])
    ).rows[0];
    return row?.created_by === accountId;
  }

  async canArbitrate(tournamentId: string, accountId: string): Promise<boolean> {
    if (await this.isOrganizer(tournamentId, accountId)) {
      return true;
    }
    const row = (
      await this.accounts.pool.query<{ roles: string[] }>(
        "SELECT a.roles FROM accounts a JOIN tournaments t ON t.id=$1 WHERE a.id=$2",
        [tournamentId, accountId],
      )
    ).rows[0];
    return (
      row !== undefined && hasAccountCapability({ roles: row.roles.filter(isAccountRole), capability: "canJudge" })
    );
  }

  async register(input: {
    tournamentId: string;
    accountId: string;
    savedDeckId: string;
    password?: unknown;
    now?: number;
  }): Promise<ParticipantResult<ParticipantRecord>> {
    const now = input.now ?? Date.now();
    return this.mutate(input.tournamentId, async (client) => {
      const tournament = (
        await client.query<TournamentRow>(
          "SELECT id, status, max_players, registration_closes_at, password_hash, format FROM tournaments WHERE id=$1 FOR UPDATE",
          [input.tournamentId],
        )
      ).rows[0];
      if (!tournament) return { ok: false, reason: "tournament_not_found" } as const;
      // Status and window are two independent ways for registration to be over. The status is the
      // one that always exists: a tournament whose field is already frozen has moved on whether or
      // not anybody set a closing time.
      if (!REGISTRATION_STATUSES.has(tournament.status)) return { ok: false, reason: "registration_closed" } as const;
      if (tournament.registration_closes_at !== null && now > Number(tournament.registration_closes_at))
        return { ok: false, reason: "registration_closed" } as const;

      if (!(await verifyTournamentPassword({ password: input.password, passwordHash: tournament.password_hash }))) {
        return { ok: false, reason: "incorrect_password" } as const;
      }
      const existing = await this.lockParticipant(client, input.tournamentId, input.accountId);
      // A disqualification is a ruling, not a withdrawal: re-entering under the same account would
      // undo it, so it is refused even while registration is open.
      if (existing?.status === "disqualified") return { ok: false, reason: "disqualified" } as const;
      if (existing && existing.status !== "dropped") return { ok: false, reason: "already_registered" } as const;

      const deck = await this.savedDeck(client, input.accountId, input.savedDeckId);
      if (!deck) return { ok: false, reason: "deck_not_found" } as const;
      const legality = validateCompetitiveDeck(
        deck,
        await this.readBanlist(client, input.tournamentId),
        tournament.format,
      );
      if (!legality.legal) return { ok: false, reason: "deck_illegal", violations: legality.violations } as const;

      if ((await this.occupiedSlots(client, input.tournamentId)) >= Number(tournament.max_players))
        return { ok: false, reason: "tournament_full" } as const;

      const displayName = await this.displayName(client, input.accountId);
      const id = existing?.id ?? randomUUID();
      if (existing)
        await client.query(
          "UPDATE tournament_participants SET status='registered', saved_deck_id=$1, dropped_at=NULL, checked_in_at=NULL, created_at=$2 WHERE id=$3",
          [input.savedDeckId, now, id],
        );
      else
        await client.query(
          `INSERT INTO tournament_participants
             (id, tournament_id, kind, account_id, display_name, status, saved_deck_id, created_at)
           VALUES ($1,$2,'human',$3,$4,'registered',$5,$6)`,
          [id, input.tournamentId, input.accountId, displayName, input.savedDeckId, now],
        );
      return { ok: true, value: (await this.readParticipant(client, id))! } as const;
    });
  }

  async checkIn(input: {
    tournamentId: string;
    accountId: string;
    now?: number;
  }): Promise<ParticipantResult<ParticipantRecord>> {
    const now = input.now ?? Date.now();
    return this.mutate(input.tournamentId, async (client) => {
      const tournament = (
        await client.query<TournamentRow>(
          "SELECT id, status, max_players, check_in_opens_at, check_in_closes_at FROM tournaments WHERE id=$1 FOR UPDATE",
          [input.tournamentId],
        )
      ).rows[0];
      if (!tournament) return { ok: false, reason: "tournament_not_found" } as const;
      if (!CHECK_IN_STATUSES.has(tournament.status))
        return {
          ok: false,
          reason: PRE_CHECK_IN_STATUSES.has(tournament.status) ? "check_in_not_open" : "check_in_closed",
        } as const;
      if (tournament.check_in_opens_at !== null && now < Number(tournament.check_in_opens_at))
        return { ok: false, reason: "check_in_not_open" } as const;
      if (tournament.check_in_closes_at !== null && now > Number(tournament.check_in_closes_at))
        return { ok: false, reason: "check_in_closed" } as const;

      const existing = await this.lockParticipant(client, input.tournamentId, input.accountId);
      if (!existing) return { ok: false, reason: "not_registered" } as const;
      if (existing.status === "dropped" || existing.status === "disqualified")
        return { ok: false, reason: "already_dropped" } as const;
      if (existing.status !== "registered") return { ok: false, reason: "already_checked_in" } as const;

      await client.query("UPDATE tournament_participants SET status='checked_in', checked_in_at=$1 WHERE id=$2", [
        now,
        existing.id,
      ]);
      return { ok: true, value: (await this.readParticipant(client, existing.id))! } as const;
    });
  }

  async drop(input: {
    tournamentId: string;
    accountId: string;
    now?: number;
  }): Promise<ParticipantResult<ParticipantRecord>> {
    const now = input.now ?? Date.now();
    return this.mutate(input.tournamentId, async (client) => {
      const existing = await this.lockParticipant(client, input.tournamentId, input.accountId);
      if (!existing) return { ok: false, reason: "not_registered" } as const;
      if (existing.status === "dropped" || existing.status === "disqualified")
        return { ok: false, reason: "already_dropped" } as const;
      await client.query("UPDATE tournament_participants SET status='dropped', dropped_at=$1 WHERE id=$2", [
        now,
        existing.id,
      ]);
      return { ok: true, value: (await this.readParticipant(client, existing.id))! } as const;
    });
  }

  /**
   * Locks the field: everyone who checked in becomes `active` with their deck copied into
   * `deck_snapshot`, and everyone who did not becomes `dropped` as a no-show. A deck that has been
   * edited into an illegal state since registration is snapshotted anyway and the entrant is
   * `disqualified` — the record of what they actually brought is the evidence for that call, so it
   * is kept rather than discarded.
   *
   * Everything happens inside one transaction that opens by locking the tournament row: the
   * participant list, each entrant's saved deck and the banlist are all read under that lock, and
   * every write restates the status it expected to find. Reading any of it beforehand would let a
   * drop or a registration landing on another container in the gap either be undone — a dropped
   * player resurrected as `active` — or be missed, leaving a `registered` ghost in a field that is
   * supposed to be closed.
   */
  async closeCheckIn(input: { tournamentId: string; now?: number }): Promise<ParticipantResult<ParticipantRecord[]>> {
    const now = input.now ?? Date.now();
    return this.mutate(input.tournamentId, async (client) => {
      const tournament = (
        await client.query<TournamentRow>(
          "SELECT id, status, check_in_opens_at, check_in_closes_at, format FROM tournaments WHERE id=$1 FOR UPDATE",
          [input.tournamentId],
        )
      ).rows[0];
      if (!tournament) return { ok: false, reason: "tournament_not_found" } as const;
      if (!CHECK_IN_STATUSES.has(tournament.status)) return { ok: false, reason: "check_in_closed" } as const;
      if (tournament.check_in_opens_at !== null && now < Number(tournament.check_in_opens_at))
        return { ok: false, reason: "check_in_not_open" } as const;

      const banlist = await this.readBanlist(client, input.tournamentId);
      const pending = (
        await client.query<ParticipantRow>(
          `SELECT ${COLUMNS} FROM tournament_participants
           WHERE tournament_id=$1 AND status IN ('registered','checked_in')
           ORDER BY created_at, id FOR UPDATE`,
          [input.tournamentId],
        )
      ).rows.map(toParticipant);

      const frozen: ParticipantRecord[] = [];
      for (const participant of pending) {
        const updated =
          participant.status === "registered"
            ? await this.dropNoShow(client, participant, now)
            : await this.freezeDeck(client, participant, banlist, now, tournament.format);
        if (updated) frozen.push(updated);
      }
      return { ok: true, value: frozen } as const;
    });
  }

  private async dropNoShow(
    client: PoolClient,
    participant: ParticipantRecord,
    now: number,
  ): Promise<ParticipantRecord | undefined> {
    const updated = await client.query(
      "UPDATE tournament_participants SET status='dropped', dropped_at=$1 WHERE id=$2 AND status='registered'",
      [now, participant.id],
    );
    return updated.rowCount === 1 ? this.readParticipant(client, participant.id) : undefined;
  }

  private async freezeDeck(
    client: PoolClient,
    participant: ParticipantRecord,
    banlist: readonly TournamentBanlistCard[],
    now: number,
    format: DeckFormat,
  ): Promise<ParticipantRecord | undefined> {
    const deck = participant.accountId
      ? await this.savedDeck(client, participant.accountId, participant.savedDeckId)
      : undefined;
    if (!deck) {
      const updated = await client.query(
        "UPDATE tournament_participants SET status='disqualified', dropped_at=$1 WHERE id=$2 AND status='checked_in'",
        [now, participant.id],
      );
      return updated.rowCount === 1 ? this.readParticipant(client, participant.id) : undefined;
    }
    const snapshot: ParticipantDeckSnapshot = {
      deckId: deck.id,
      name: deck.name,
      mainDeck: [...deck.mainDeck],
      eggDeck: [...deck.eggDeck],
      mainDeckArts: deck.mainDeckArts?.slice(),
      eggDeckArts: deck.eggDeckArts?.slice(),
      revision: deck.revision,
    };
    const legal = validateCompetitiveDeck(snapshot, banlist, format).legal;
    const updated = await client.query(
      `UPDATE tournament_participants
         SET status=$1, deck_snapshot=$2, deck_version=$3, dropped_at=$4
       WHERE id=$5 AND status='checked_in'`,
      [
        legal ? "active" : "disqualified",
        JSON.stringify(snapshot),
        deckVersion(snapshot),
        legal ? null : now,
        participant.id,
      ],
    );
    return updated.rowCount === 1 ? this.readParticipant(client, participant.id) : undefined;
  }

  /**
   * Ends a tournament that will not run, and records WHY in the audit trail.
   *
   * A cancelled event has to be a state anybody can read, not the absence of one: `status` is what
   * `register`, `checkIn` and `closeCheckIn` all gate on, and none of them lists `cancelled`, so
   * writing it here is what makes every one of those paths refuse afterwards. Leaving the
   * tournament in `registration` instead would let the next request re-enter it and, worse, let a
   * later close bot-fill an event that was cancelled precisely because it had too few people.
   *
   * Idempotent and one-way: an event already cancelled reports success and changes nothing, and one
   * already `finished` is never dragged backwards.
   */
  async cancelTournament(input: {
    tournamentId: string;
    reason: string;
    now?: number;
    /**
     * Writes the audit row, inside this transaction. Passed by the arbitration layer, which owns the
     * ledger; the doc-comment above has always promised a trail and, until that layer existed,
     * `reason` was only echoed back to the caller and persisted nowhere.
     */
    audit?: (client: PoolClient, before: { status: string }) => Promise<void>;
  }): Promise<ParticipantResult<{ status: "cancelled"; reason: string; alreadyApplied: boolean }>> {
    const now = input.now ?? Date.now();
    return this.mutate(input.tournamentId, async (client) => {
      const tournament = (
        await client.query<{ id: string; status: string }>(
          "SELECT id, status FROM tournaments WHERE id=$1 FOR UPDATE",
          [input.tournamentId],
        )
      ).rows[0];
      if (!tournament) return { ok: false, reason: "tournament_not_found" } as const;
      if (tournament.status === "cancelled") return { ok: true, value: CANCELLED(input.reason, true) } as const;
      if (tournament.status === "finished") return { ok: false, reason: "check_in_closed" } as const;
      await client.query("UPDATE tournaments SET status='cancelled' WHERE id=$1 AND status<>'finished'", [
        input.tournamentId,
      ]);
      // Nobody who registered is left holding a slot in an event that will not happen.
      await client.query(
        "UPDATE tournament_participants SET status='dropped', dropped_at=$1 WHERE tournament_id=$2 AND status IN ('registered','checked_in','active')",
        [now, input.tournamentId],
      );
      await input.audit?.(client, { status: tournament.status });
      return { ok: true, value: CANCELLED(input.reason) } as const;
    });
  }

  /**
   * Throws one entrant out of the event.
   *
   * The status is what enforces it everywhere else, which is why this is a one-line write and not a
   * subsystem: `register` refuses a `disqualified` account by name (see {@link register}), the Swiss
   * roster only reads entrants who are `active`, and the bracket's `activeParticipants` does the
   * same. A disqualification therefore excludes the player from every future pairing without any
   * pairing code learning the word.
   *
   * What it deliberately does NOT do is touch the result ledger. Rows already written are the record
   * of confrontations that really happened, and their opponents' tiebreakers depend on them; a DQ
   * removes a player from the future, never from the past. Resolving their open confrontation is the
   * arbitration layer's job, because only it knows what the opponent should be awarded.
   *
   * Idempotent: an entrant already disqualified is returned unchanged.
   */
  async disqualify(input: {
    tournamentId: string;
    participantId: string;
    now?: number;
    audit?: (client: PoolClient, before: ParticipantRecord, after: ParticipantRecord) => Promise<void>;
  }): Promise<ParticipantResult<{ participant: ParticipantRecord; alreadyApplied: boolean }>> {
    const now = input.now ?? Date.now();
    return this.mutate(input.tournamentId, async (client) => {
      const row = (
        await client.query<ParticipantRow>(
          `SELECT ${COLUMNS} FROM tournament_participants WHERE id=$1 AND tournament_id=$2 FOR UPDATE`,
          [input.participantId, input.tournamentId],
        )
      ).rows[0];
      if (!row) return { ok: false, reason: "not_registered" } as const;
      const before = toParticipant(row);
      if (before.status === "disqualified")
        return { ok: true, value: { participant: before, alreadyApplied: true } } as const;
      await client.query("UPDATE tournament_participants SET status='disqualified', dropped_at=$1 WHERE id=$2", [
        now,
        input.participantId,
      ]);
      const after = (await this.readParticipant(client, input.participantId))!;
      await input.audit?.(client, before, after);
      return { ok: true, value: { participant: after, alreadyApplied: false } } as const;
    });
  }

  /** One tournament's mutations, serialized in this process and in one database transaction. */
  private async mutate<T>(tournamentId: string, work: (client: PoolClient) => Promise<T>): Promise<T> {
    return this.withLock(tournamentId, () => this.transaction(work));
  }

  private async withLock<T>(tournamentId: string, work: () => Promise<T>): Promise<T> {
    const release = await this.acquireLock(tournamentId);
    try {
      return await work();
    } finally {
      release();
    }
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

  private async lockParticipant(
    client: PoolClient,
    tournamentId: string,
    accountId: string,
  ): Promise<ParticipantRecord | undefined> {
    const row = (
      await client.query<ParticipantRow>(
        `SELECT ${COLUMNS} FROM tournament_participants WHERE tournament_id=$1 AND account_id=$2 FOR UPDATE`,
        [tournamentId, accountId],
      )
    ).rows[0];
    return row && toParticipant(row);
  }

  private async readParticipant(client: PoolClient, id: string): Promise<ParticipantRecord | undefined> {
    const row = (await client.query<ParticipantRow>(`SELECT ${COLUMNS} FROM tournament_participants WHERE id=$1`, [id]))
      .rows[0];
    return row && toParticipant(row);
  }

  private async occupiedSlots(client: PoolClient, tournamentId: string): Promise<number> {
    const row = (
      await client.query<{ count: string }>(
        `SELECT COUNT(*) count FROM tournament_participants
         WHERE tournament_id=$1 AND status IN (${OCCUPYING_STATUSES.map((_, index) => `$${index + 2}`).join(",")})`,
        [tournamentId, ...OCCUPYING_STATUSES],
      )
    ).rows[0];
    return Number(row?.count ?? 0);
  }

  /**
   * Reads one saved deck through the caller's client, so a freeze can see it under the same lock
   * and transaction as the participant row it is about to write.
   */
  private async savedDeck(
    client: PoolClient,
    accountId: string,
    savedDeckId: string | null,
  ): Promise<Deck | undefined> {
    if (!savedDeckId) return undefined;
    const row = (
      await client.query<{
        id: string;
        name: string;
        main_deck: string[];
        egg_deck: string[];
        main_deck_arts: string[];
        egg_deck_arts: string[];
        revision: number;
        updated_at: string | number;
      }>(
        "SELECT id, name, main_deck, egg_deck, main_deck_arts, egg_deck_arts, revision, updated_at FROM saved_decks WHERE account_id=$1 AND id=$2",
        [accountId, savedDeckId],
      )
    ).rows[0];
    return (
      row && {
        id: row.id,
        name: row.name,
        mainDeck: row.main_deck,
        eggDeck: row.egg_deck,
        mainDeckArts: row.main_deck_arts,
        eggDeckArts: row.egg_deck_arts,
        revision: Number(row.revision),
        updatedAt: Number(row.updated_at),
      }
    );
  }

  private async displayName(client: PoolClient, accountId: string): Promise<string> {
    const row = (
      await client.query<{ display_name: string }>("SELECT display_name FROM accounts WHERE id=$1", [accountId])
    ).rows[0];
    return row?.display_name ?? "Player";
  }
}

/**
 * A short, stable identity for the frozen deck: the saved-deck revision plus a hash of the exact
 * card lists. The revision says which edit of the deck this was; the hash says what was actually
 * in it, so two participants who registered the same 55 cards share a hash but not a revision, and
 * a deck edited and edited back has one revision per edit but the same hash throughout.
 */
function deckVersion(snapshot: ParticipantDeckSnapshot): string {
  const digest = createHash("sha256")
    .update(JSON.stringify([[...snapshot.mainDeck].sort(), [...snapshot.eggDeck].sort()]))
    .digest("hex");
  return `r${snapshot.revision}-${digest.slice(0, 16)}`;
}

const COLUMNS =
  "id, tournament_id, kind, account_id, display_name, seed, status, saved_deck_id, deck_snapshot, deck_version, created_at, checked_in_at, dropped_at, bot_profile";

/**
 * Whether `tournaments.banlist_cards` exists yet. Asked of the catalog rather than discovered by a
 * failing SELECT, so the answer is safe to obtain inside a transaction. Deliberately not cached:
 * the column arrives by migration, which can land while this process is running.
 */
async function hasBanlistColumn(db: Queryable): Promise<boolean> {
  const found = await db.query(
    "SELECT 1 FROM information_schema.columns WHERE table_name='tournaments' AND column_name='banlist_cards'",
  );
  return (found.rowCount ?? 0) > 0;
}

/** SQLSTATE 42703, `undefined_column`. */
function isUndefinedColumn(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "42703"
  );
}

type ParticipantRow = {
  id: string;
  tournament_id: string;
  kind: ParticipantKind;
  account_id: string | null;
  display_name: string;
  seed: number | null;
  status: RegistrationStatus;
  saved_deck_id: string | null;
  deck_snapshot: ParticipantDeckSnapshot | string | null;
  deck_version: string | null;
  created_at: string | number;
  checked_in_at: string | number | null;
  dropped_at: string | number | null;
  bot_profile?: string | null;
};

type TournamentRow = {
  format: DeckFormat;
  password_hash: string | null;
  id: string;
  status: string;
  max_players: string | number;
  registration_closes_at: string | number | null;
  check_in_opens_at: string | number | null;
  check_in_closes_at: string | number | null;
};

type WindowRow = Pick<TournamentRow, "registration_closes_at" | "check_in_opens_at" | "check_in_closes_at">;

function toParticipant(row: ParticipantRow): ParticipantRecord {
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    kind: row.kind,
    accountId: row.account_id,
    displayName: row.display_name,
    status: row.status,
    seed: row.seed === null ? null : Number(row.seed),
    savedDeckId: row.saved_deck_id,
    deckSnapshot: typeof row.deck_snapshot === "string" ? JSON.parse(row.deck_snapshot) : row.deck_snapshot,
    deckVersion: row.deck_version,
    createdAt: Number(row.created_at),
    checkedInAt: row.checked_in_at === null ? null : Number(row.checked_in_at),
    droppedAt: row.dropped_at === null ? null : Number(row.dropped_at),
    botStyle: isBotStyle(row.bot_profile) ? row.bot_profile : null,
  };
}

function toParticipantView(participant: ParticipantRecord): ParticipantView {
  return {
    id: participant.id,
    kind: participant.kind,
    displayName: participant.displayName,
    status: participant.status,
    seed: participant.seed,
    // Null for bots. Lets the client join the account-keyed match rows to a participant.
    accountId: participant.accountId,
    botStyle: participant.botStyle,
  };
}

function toWindows(row: WindowRow): TournamentWindows {
  return {
    registrationClosesAt: row.registration_closes_at === null ? null : Number(row.registration_closes_at),
    checkInOpensAt: row.check_in_opens_at === null ? null : Number(row.check_in_opens_at),
    checkInClosesAt: row.check_in_closes_at === null ? null : Number(row.check_in_closes_at),
  };
}
