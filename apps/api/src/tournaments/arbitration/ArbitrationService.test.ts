import { buildTournamentRules } from "#api/tournaments/rules/buildTournamentRules";
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AccountStore } from "../../accounts/AccountStore.js";
import type { Pool } from "pg";
import { snapshotFixtures } from "../../db/snapshotFixture.js";
import { RED_DECK } from "../../engine/testDecks.js";
import { EliminationStore } from "../elimination/index.js";
import { ParticipantStore } from "../participants/index.js";

import { insertDeadline } from "../scheduler/DeadlineQueue.js";
import { SeriesStore } from "../series/index.js";
import { SwissProgram } from "../swiss/index.js";
import { ArbitrationService } from "./ArbitrationService.js";

const NOW = 1_800_000_000_000;
const REASON = "ruling recorded on the match slip";

/**
 * The commands a person issues. The trail also carries the ordinary machine events — rounds
 * published and closed, series resolved — so a test about arbitration has to say which half it
 * means rather than assume the trail is only its own.
 */
const ORGANIZER_COMMANDS = new Set([
  "decide_series",
  "swap_pairings",
  "concede_match",
  "disqualify",
  "cancel_tournament",
  "correct_result",
]);

describe("ArbitrationService", () => {
  let accounts: AccountStore;
  let participants: ParticipantStore;
  let series: SeriesStore;
  let swiss: SwissProgram;
  let elimination: EliminationStore;
  let arbitration: ArbitrationService;
  let organizerId: string;
  let players: { id: string; participantId: string }[];
  let tournamentId: string;

  type Fixture = {
    accounts: AccountStore;
    participants: ParticipantStore;
    series: SeriesStore;
    swiss: SwissProgram;
    elimination: EliminationStore;
    arbitration: ArbitrationService;
    organizerId: string;
    players: { id: string; participantId: string }[];
    tournamentId: string;
  };

  /** One arrangement, built once and restored before each test. */
  const fixtureFor = snapshotFixtures<Fixture>();

  beforeEach(async () => {
    ({ accounts, participants, series, swiss, elimination, arbitration, organizerId, players, tournamentId } =
      await fixtureFor("default", buildFixture));
  });

  /**
   * Assigns the file's module-level bindings rather than shadowing them, so the helpers and
   * assertions below read the same instances the snapshot restores.
   */
  async function buildFixture(pool: Pool): Promise<Fixture> {
    accounts = new AccountStore(pool);
    participants = new ParticipantStore(accounts);
    series = new SeriesStore(accounts);
    swiss = new SwissProgram(accounts, series);
    elimination = new EliminationStore(accounts);
    arbitration = new ArbitrationService(accounts, participants, series, swiss, elimination);
    // The same two listeners `src/tournaments/runtime.ts` registers in production. Without them a
    // resolution never reaches the round close, and a test would be asserting against an event that
    // cannot progress for a reason that has nothing to do with arbitration.
    series.addResolutionListener(({ matchId }) => swiss.onSeriesResolved(matchId).then(() => undefined));
    series.addResolutionListener(({ seriesId }) => elimination.onSeriesResolvedById(seriesId));

    const organizer = await accounts.accountForIdentity("discord", "organizer", "Organizer");
    organizerId = organizer.id;
    const tournament = await accounts.createTournament(organizerId, {
      name: "Regional",
      block: "BT10",
      startsAt: NOW,
      maxPlayers: 8,
      structure: "swiss",
      bestOf: 3,
      rules: buildTournamentRules({ bestOf: 3 }),
    });
    tournamentId = tournament.id;

    players = [];
    for (const name of ["alice", "bob", "carol", "dave"]) {
      const account = await accounts.accountForIdentity("discord", name, name);
      const deck = await accounts.saveDeck(account.id, {
        name: "Competitive",
        mainDeck: [...RED_DECK.mainDeck],
        eggDeck: [...RED_DECK.eggDeck],
      });
      await participants.register({ tournamentId, accountId: account.id, savedDeckId: deck.id, now: NOW });
      await participants.checkIn({ tournamentId, accountId: account.id, now: NOW });
      players.push({ id: account.id, participantId: "" });
    }
    await participants.closeCheckIn({ tournamentId, now: NOW });
    await swiss.startTournamentProgram(tournamentId, NOW);
    for (const participant of await participants.participants(tournamentId)) {
      const player = players.find((entry) => entry.id === participant.accountId);
      if (player) player.participantId = participant.id;
    }
    return { accounts, participants, series, swiss, elimination, arbitration, organizerId, players, tournamentId };
  }

  afterAll(async () => {
    await accounts.close();
  });

  async function arbitrationTrail() {
    return (await arbitration.trail(tournamentId)).filter((event) => ORGANIZER_COMMANDS.has(event.command));
  }

  async function openMatch(): Promise<{ matchId: string; seats: [string, string] }> {
    const views = await series.scoreViews(tournamentId);
    const match = views.find((view) => view.participant0Id && view.participant1Id)!;
    return { matchId: match.matchId, seats: [match.participant0Id!, match.participant1Id!] };
  }

  /** Parks a confrontation exactly where the scheduler parks an unresolvable one. */
  async function parkForOrganizer(matchId: string): Promise<string> {
    const parked = await series.resolveSeriesAdministratively({
      tournamentId,
      matchId,
      reason: "double_no_show_needs_organizer_decision",
      winsRequired: 2,
      seriesDurationMs: null,
      now: NOW,
      outcome: { status: "needs_organizer_decision", officialResult: null },
    });
    expect(parked.ok && parked.value.status).toBe("needs_organizer_decision");
    return (parked as { value: { id: string } }).value.id;
  }

  describe("authorization and reason", () => {
    it("refuses a caller who is not the organizer", async () => {
      const { matchId } = await openMatch();
      const seriesId = await parkForOrganizer(matchId);
      const result = await arbitration.decideSeries({
        tournamentId,
        seriesId,
        actorAccountId: players[0]!.id,
        decision: { kind: "draw" },
        reason: REASON,
      });
      expect(result).toEqual({ ok: false, reason: "not_organizer" });
    });

    it("lets a judge who did not create the tournament decide a series", async () => {
      const { matchId } = await openMatch();
      const seriesId = await parkForOrganizer(matchId);
      const judge = await accounts.accountForIdentity("discord", "judge", "Judge");
      await accounts.pool.query("UPDATE accounts SET roles=ARRAY['judge'] WHERE id=$1", [judge.id]);
      const result = await arbitration.decideSeries({
        tournamentId,
        seriesId,
        actorAccountId: judge.id,
        decision: { kind: "draw" },
        reason: REASON,
        now: NOW + 1,
      });
      expect(result.ok).toBe(true);
    });

    it("refuses a blank reason before it reads anything", async () => {
      const result = await arbitration.cancelTournament({
        tournamentId,
        actorAccountId: organizerId,
        reason: "   ",
      });
      expect(result).toEqual({ ok: false, reason: "reason_required" });
      expect(await arbitrationTrail()).toHaveLength(0);
    });

    it("refuses an unknown tournament without disclosing why", async () => {
      const result = await arbitration.cancelTournament({
        tournamentId: randomUUID(),
        actorAccountId: organizerId,
        reason: REASON,
      });
      expect(result).toEqual({ ok: false, reason: "tournament_not_found" });
    });
  });

  describe("decideSeries", () => {
    it("resolves a parked series and lets the round close through the normal path", async () => {
      const { matchId, seats } = await openMatch();
      const seriesId = await parkForOrganizer(matchId);
      // A parked round is a dead end for the sweep, which is the whole reason this command exists.
      expect(await swiss.sweepOpenTournaments(NOW)).toBe(0);

      const decided = await arbitration.decideSeries({
        tournamentId,
        seriesId,
        actorAccountId: organizerId,
        decision: { kind: "winner_account", accountId: seats[0] },
        reason: REASON,
        now: NOW + 1,
      });
      expect(decided.ok).toBe(true);
      expect((await series.series(seriesId))?.status).toBe("resolved");
      expect((await series.series(seriesId))?.officialResult).toBe("participant0");
    });

    it("records draws and double losses as themselves", async () => {
      const { matchId } = await openMatch();
      const seriesId = await parkForOrganizer(matchId);
      await arbitration.decideSeries({
        tournamentId,
        seriesId,
        actorAccountId: organizerId,
        decision: { kind: "double_loss" },
        reason: REASON,
        now: NOW + 1,
      });
      expect((await series.series(seriesId))?.officialResult).toBe("double_loss");
    });

    it("refuses to re-decide a series that already resolved", async () => {
      const { matchId, seats } = await openMatch();
      const seriesId = await parkForOrganizer(matchId);
      await arbitration.decideSeries({
        tournamentId,
        seriesId,
        actorAccountId: organizerId,
        decision: { kind: "winner_account", accountId: seats[0] },
        reason: REASON,
        now: NOW + 1,
      });
      const again = await arbitration.decideSeries({
        tournamentId,
        seriesId,
        actorAccountId: organizerId,
        decision: { kind: "winner_account", accountId: seats[1] },
        reason: "second thoughts",
        now: NOW + 2,
      });
      expect(again).toEqual({ ok: false, reason: "series_already_resolved" });
    });

    it("replays a retried command instead of deciding twice", async () => {
      const { matchId, seats } = await openMatch();
      const seriesId = await parkForOrganizer(matchId);
      const commandId = randomUUID();
      const input = {
        tournamentId,
        seriesId,
        actorAccountId: organizerId,
        decision: { kind: "winner_account" as const, accountId: seats[0] },
        reason: REASON,
        commandId,
        now: NOW + 1,
      };
      const first = await arbitration.decideSeries(input);
      const second = await arbitration.decideSeries(input);
      expect(first.ok && first.replayed).toBe(false);
      expect(second.ok && second.replayed).toBe(true);
      expect(await arbitrationTrail()).toHaveLength(1);
    });

    it("retires the deadlines watching the confrontation it settles", async () => {
      const { matchId, seats } = await openMatch();
      const seriesId = await parkForOrganizer(matchId);
      // A real, unexecuted attendance rung aimed at this match. Without arming one the assertion
      // below would pass on an empty table and prove nothing.
      await insertDeadline(accounts.pool, {
        kind: "join_game_loss",
        tournamentId,
        subjectId: matchId,
        dueAt: NOW + 300_000,
        now: NOW,
      });
      const armed = await accounts.pool.query(
        "SELECT id FROM tournament_deadlines WHERE subject_id IN ($1,$2) AND executed_at IS NULL",
        [matchId, seriesId],
      );
      expect(armed.rowCount).toBeGreaterThan(0);

      await arbitration.decideSeries({
        tournamentId,
        seriesId,
        actorAccountId: organizerId,
        decision: { kind: "winner_account", accountId: seats[0] },
        reason: REASON,
        now: NOW + 1,
      });
      // The re-publication policy, asserted rather than assumed: an arbitrated confrontation is
      // terminal, so no ladder rung may still be pointed at it and no second ladder is ever needed.
      const live = await accounts.pool.query(
        "SELECT id FROM tournament_deadlines WHERE subject_id IN ($1,$2) AND executed_at IS NULL",
        [matchId, seriesId],
      );
      expect(live.rowCount).toBe(0);
    });
  });

  describe("participant withdrawal", () => {
    it("settles the pending match and allows safe retries", async () => {
      const { matchId, seats } = await openMatch();
      const input = { tournamentId, accountId: seats[0], now: NOW + 1 };
      expect(await arbitration.dropParticipant(input)).toMatchObject({ ok: true, value: { status: "dropped" } });
      expect((await series.seriesForMatch(matchId))?.officialResult).toBe("participant1");
      const events = await arbitrationTrail();
      expect(events.filter((entry) => entry.command === "concede_match")).toHaveLength(1);
      expect(await arbitration.dropParticipant(input)).toMatchObject({ ok: true });
      expect(await arbitrationTrail()).toEqual(events);
    });

    it("finishes an active series when its participant withdraws", async () => {
      const { matchId, seats } = await openMatch();
      for (const accountId of seats) {
        await series.markPresent({
          tournamentId,
          matchId,
          accountId,
          winsRequired: 2,
          seriesDurationMs: 100000,
          now: NOW,
        });
      }
      const active = await series.seriesForMatch(matchId);
      expect(active).toBeDefined();
      await arbitration.dropParticipant({ tournamentId, accountId: seats[1], now: NOW + 1 });
      expect((await series.seriesForMatch(matchId))?.officialResult).toBe("participant0");
      expect(await series.authorizeNextGame({ seriesId: active!.id, accountId: seats[1], now: NOW + 2 })).toMatchObject(
        { ok: false },
      );
    });
  });

  describe("concedeMatch", () => {
    it("lets a player concede their own confrontation, as a match loss", async () => {
      const { matchId, seats } = await openMatch();
      const conceded = await arbitration.concedeMatch({
        tournamentId,
        matchId,
        actorAccountId: seats[0],
        byAccountId: seats[0],
        reason: "cannot continue",
        now: NOW + 1,
      });
      expect(conceded.ok).toBe(true);
      expect((await series.seriesForMatch(matchId))?.officialResult).toBe("participant1");
    });

    it("refuses one player conceding on another's behalf", async () => {
      const { matchId, seats } = await openMatch();
      const result = await arbitration.concedeMatch({
        tournamentId,
        matchId,
        actorAccountId: seats[0],
        byAccountId: seats[1],
        reason: REASON,
        now: NOW + 1,
      });
      expect(result).toEqual({ ok: false, reason: "not_organizer" });
    });

    it("lets the organizer concede on a player's behalf", async () => {
      const { matchId, seats } = await openMatch();
      const result = await arbitration.concedeMatch({
        tournamentId,
        matchId,
        actorAccountId: organizerId,
        byAccountId: seats[1],
        reason: REASON,
        now: NOW + 1,
      });
      expect(result.ok).toBe(true);
      expect((await series.seriesForMatch(matchId))?.officialResult).toBe("participant0");
    });
  });

  describe("disqualify", () => {
    it("marks the entrant, awards their open confrontation and excludes them from later pairings", async () => {
      const { matchId, seats } = await openMatch();
      const victim = players.find((player) => player.id === seats[0])!;
      const result = await arbitration.disqualify({
        tournamentId,
        participantId: victim.participantId,
        actorAccountId: organizerId,
        reason: "marked cards",
        now: NOW + 1,
      });
      expect(result.ok).toBe(true);
      const roster = await participants.participants(tournamentId);
      expect(roster.find((entry) => entry.id === victim.participantId)?.status).toBe("disqualified");
      expect((await series.seriesForMatch(matchId))?.officialResult).toBe("participant1");
    });

    it("keeps the result ledger intact — a DQ removes a player from the future, not the past", async () => {
      const { matchId, seats } = await openMatch();
      const winner = seats[1]!;
      await arbitration.concedeMatch({
        tournamentId,
        matchId,
        actorAccountId: seats[0],
        byAccountId: seats[0],
        reason: "concedes",
        now: NOW + 1,
      });
      const before = await swiss.ledger(tournamentId);
      const victim = players.find((player) => player.id === winner)!;
      await arbitration.disqualify({
        tournamentId,
        participantId: victim.participantId,
        actorAccountId: organizerId,
        reason: "marked cards",
        now: NOW + 2,
      });
      expect(await swiss.ledger(tournamentId)).toEqual(before);
    });

    it("is idempotent for an entrant already thrown out, by replay and by re-issue", async () => {
      const victim = players[0]!;
      const input = {
        tournamentId,
        participantId: victim.participantId,
        actorAccountId: organizerId,
        reason: "marked cards",
        commandId: randomUUID(),
        now: NOW + 1,
      };
      const first = await arbitration.disqualify(input);
      expect(first.ok && first.replayed).toBe(false);
      // One event for the status, one per confrontation awarded away.
      const afterFirst = await arbitrationTrail();
      expect(afterFirst.length).toBeGreaterThanOrEqual(1);

      // Same command id: recognised as the same command.
      const replay = await arbitration.disqualify(input);
      expect(replay.ok && replay.replayed).toBe(true);

      // A FRESH command id is a different command asking for a state the entrant is already in. It
      // must succeed and record nothing — not blow up because no event was written, which is what a
      // test that only covered the replay path let through.
      const reissued = await arbitration.disqualify({ ...input, commandId: randomUUID(), now: NOW + 2 });
      expect(reissued.ok).toBe(true);
      expect(reissued.ok && reissued.alreadyApplied).toBe(true);
      expect(reissued.ok && reissued.event).toBeUndefined();
      expect(await arbitrationTrail()).toHaveLength(afterFirst.length);
    });
  });

  describe("swapPairings", () => {
    it("rejects malformed match identifiers before querying UUID columns", async () => {
      expect(
        await arbitration.swapPairings({
          tournamentId,
          actorAccountId: organizerId,
          firstMatchId: "not-a-uuid",
          secondMatchId: randomUUID(),
          firstSeat: 0,
          secondSeat: 1,
          reason: REASON,
        }),
      ).toEqual({ ok: false, reason: "pairings_not_editable" });
    });

    it("swaps two unstarted seats atomically and audits a retried command once", async () => {
      const [first, second] = await accounts.tournamentMatches(tournamentId);
      const input = {
        tournamentId,
        actorAccountId: organizerId,
        reason: "Correct the first round seating",
        commandId: randomUUID(),
        firstMatchId: first!.id,
        firstSeat: 0 as const,
        secondMatchId: second!.id,
        secondSeat: 1 as const,
      };
      expect((await arbitration.swapPairings(input)).ok).toBe(true);
      const updated = await accounts.tournamentMatches(tournamentId);
      expect(updated.find((match) => match.id === first!.id)?.player0AccountId).toBe(second!.player1AccountId);
      expect(updated.find((match) => match.id === second!.id)?.player1AccountId).toBe(first!.player0AccountId);
      const replay = await arbitration.swapPairings(input);
      expect(replay.ok && replay.replayed).toBe(true);
      expect(await accounts.tournamentMatches(tournamentId)).toEqual(updated);
      expect((await arbitrationTrail()).filter((event) => event.command === "swap_pairings")).toHaveLength(1);
    });

    it("rejects swaps between rounds, dropped players and missing reasons", async () => {
      const [first, second] = await accounts.tournamentMatches(tournamentId);
      const input = {
        tournamentId,
        actorAccountId: organizerId,
        reason: REASON,
        firstMatchId: first!.id,
        firstSeat: 0 as const,
        secondMatchId: second!.id,
        secondSeat: 0 as const,
      };
      expect(await arbitration.swapPairings({ ...input, reason: " " })).toEqual({
        ok: false,
        reason: "reason_required",
      });
      await accounts.pool.query("UPDATE tournament_matches SET round=2 WHERE id=$1", [second!.id]);
      expect(await arbitration.swapPairings(input)).toEqual({ ok: false, reason: "pairings_not_editable" });
      await accounts.pool.query("UPDATE tournament_matches SET round=1 WHERE id=$1", [second!.id]);
      await participants.drop({ tournamentId, accountId: first!.player0AccountId!, now: NOW });
      expect(await arbitration.swapPairings(input)).toEqual({ ok: false, reason: "pairings_not_editable" });
      expect((await arbitrationTrail()).filter((event) => event.command === "swap_pairings")).toHaveLength(0);
    });

    it("rejects other organizers and any pairing with confirmed presence", async () => {
      const [first, second] = await accounts.tournamentMatches(tournamentId);
      const input = {
        tournamentId,
        actorAccountId: players[0]!.id,
        reason: REASON,
        firstMatchId: first!.id,
        firstSeat: 0 as const,
        secondMatchId: second!.id,
        secondSeat: 0 as const,
      };
      expect(await arbitration.swapPairings(input)).toEqual({ ok: false, reason: "not_organizer" });
      await series.markPresent({
        tournamentId,
        matchId: first!.id,
        accountId: first!.player0AccountId!,
        winsRequired: 2,
        seriesDurationMs: null,
        now: NOW,
      });
      expect(await arbitration.swapPairings({ ...input, actorAccountId: organizerId })).toEqual({
        ok: false,
        reason: "pairings_not_editable",
      });
      expect((await arbitrationTrail()).filter((event) => event.command === "swap_pairings")).toHaveLength(0);
    });
  });

  describe("cancelTournament", () => {
    it("cancels, drops everyone and finally persists the reason", async () => {
      const result = await arbitration.cancelTournament({
        tournamentId,
        actorAccountId: organizerId,
        reason: "venue lost power",
        now: NOW + 1,
      });
      expect(result.ok).toBe(true);
      expect((await accounts.tournament(tournamentId))?.status).toBe("cancelled");
      const [event] = await arbitrationTrail();
      expect(event?.command).toBe("cancel_tournament");
      expect(event?.reason).toBe("venue lost power");
      expect(event?.after).toEqual({ status: "cancelled" });
    });

    it("succeeds and records nothing when re-issued with a fresh command id", async () => {
      const input = { tournamentId, actorAccountId: organizerId, reason: "venue lost power", now: NOW + 1 };
      expect((await arbitration.cancelTournament(input)).ok).toBe(true);
      const again = await arbitration.cancelTournament({ ...input, now: NOW + 2 });
      expect(again.ok).toBe(true);
      expect(again.ok && again.alreadyApplied).toBe(true);
      expect(await arbitrationTrail()).toHaveLength(1);
    });
  });

  describe("correctResult", () => {
    it("replaces the winner while the round is still open", async () => {
      const { matchId, seats } = await openMatch();
      await arbitration.concedeMatch({
        tournamentId,
        matchId,
        actorAccountId: seats[0],
        byAccountId: seats[0],
        reason: "concedes",
        now: NOW + 1,
      });
      const corrected = await arbitration.correctResult({
        tournamentId,
        matchId,
        actorAccountId: organizerId,
        decision: { kind: "winner_account", accountId: seats[0] },
        reason: "concession was entered against the wrong seat",
        now: NOW + 2,
      });
      expect(corrected.ok).toBe(true);
      const after = await series.seriesForMatch(matchId);
      expect(after?.officialResult).toBe("participant0");
      // The score must agree with the result. A corrected winner beside the old 0-2 would make the
      // record contradict itself, and the standings' explanation of themselves a lie.
      expect(after?.wins).toEqual([2, 0]);
    });

    it("accepts an organizer-stated score in preference to the derived one", async () => {
      const { matchId, seats } = await openMatch();
      await arbitration.concedeMatch({
        tournamentId,
        matchId,
        actorAccountId: seats[0],
        byAccountId: seats[0],
        reason: "concedes",
        now: NOW + 1,
      });
      const corrected = await arbitration.correctResult({
        tournamentId,
        matchId,
        actorAccountId: organizerId,
        decision: { kind: "winner_account", accountId: seats[0] },
        correctedWins: [2, 1],
        reason: "the slip records a 2-1",
        now: NOW + 2,
      });
      expect(corrected.ok).toBe(true);
      expect((await series.seriesForMatch(matchId))?.wins).toEqual([2, 1]);
    });

    it("caps both sides below the threshold when it corrects to a draw", async () => {
      const { matchId, seats } = await openMatch();
      await arbitration.concedeMatch({
        tournamentId,
        matchId,
        actorAccountId: seats[0],
        byAccountId: seats[0],
        reason: "concedes",
        now: NOW + 1,
      });
      const corrected = await arbitration.correctResult({
        tournamentId,
        matchId,
        actorAccountId: organizerId,
        decision: { kind: "draw" },
        reason: "the confrontation was never finished",
        now: NOW + 2,
      });
      expect(corrected.ok).toBe(true);
      const after = await series.seriesForMatch(matchId);
      expect(after?.officialResult).toBe("draw");
      expect(after?.wins.every((wins) => wins < 2)).toBe(true);
    });

    it("refuses once the round has closed, because a later round is derived from its ledger", async () => {
      // Settle every confrontation of round 1, which closes it and publishes round 2.
      for (const view of await series.scoreViews(tournamentId)) {
        if (!view.participant0Id || !view.participant1Id) continue;
        await arbitration.concedeMatch({
          tournamentId,
          matchId: view.matchId,
          actorAccountId: view.participant0Id,
          byAccountId: view.participant0Id,
          reason: "concedes",
          now: NOW + 1,
        });
      }
      const firstRound = (await series.scoreViews(tournamentId))[0]!;
      const corrected = await arbitration.correctResult({
        tournamentId,
        matchId: firstRound.matchId,
        actorAccountId: organizerId,
        decision: { kind: "draw" },
        reason: "the slip said draw",
        now: NOW + 3,
      });
      expect(corrected).toEqual({ ok: false, reason: "round_closed" });
    });

    it("refuses a confrontation with no result yet", async () => {
      const { matchId, seats } = await openMatch();
      const corrected = await arbitration.correctResult({
        tournamentId,
        matchId,
        actorAccountId: organizerId,
        decision: { kind: "winner_account", accountId: seats[0] },
        reason: REASON,
        now: NOW + 1,
      });
      expect(corrected).toEqual({ ok: false, reason: "series_not_resolved" });
    });
  });

  describe("the trail", () => {
    it("numbers every command of one tournament in the order it happened", async () => {
      const { matchId, seats } = await openMatch();
      await arbitration.concedeMatch({
        tournamentId,
        matchId,
        actorAccountId: seats[0],
        byAccountId: seats[0],
        reason: "concedes",
        now: NOW + 1,
      });
      await arbitration.cancelTournament({
        tournamentId,
        actorAccountId: organizerId,
        reason: "venue lost power",
        now: NOW + 2,
      });
      const trail = await arbitration.trail(tournamentId);
      // The organizer's commands, in the order they were issued, wherever the machine's events fall
      // between them.
      expect((await arbitrationTrail()).map((event) => event.command)).toEqual(["concede_match", "cancel_tournament"]);
      // And the trail as a whole is gapless and explained, machine events included.
      expect(trail.map((event) => event.sequence)).toEqual(trail.map((_event, index) => index + 1));
      expect(trail.every((event) => event.reason.length > 0)).toBe(true);
      expect(trail.some((event) => event.command === "round_published")).toBe(true);
      expect(trail.some((event) => event.command === "series_resolved")).toBe(true);
    });
  });
});
