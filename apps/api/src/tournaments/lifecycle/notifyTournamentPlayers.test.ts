import { beforeEach, describe, expect, it } from "vitest";
import { AccountStore } from "#api/accounts/AccountStore";
import { createMemoryPool } from "#api/db/memoryPool.fixture";
import { RED_DECK } from "#api/engine/testDecks";
import { BotSeatingStore } from "#api/tournaments/bots/BotSeatingStore";
import { EliminationStore } from "#api/tournaments/elimination/EliminationStore";
import { notifyTournamentPlayers } from "#api/tournaments/lifecycle/notifyTournamentPlayers";
import { openEliminationEvent } from "#api/tournaments/lifecycle/openEliminationEvent";
import { ParticipantStore } from "#api/tournaments/participants/ParticipantStore";
import { buildTournamentRules } from "#api/tournaments/rules/buildTournamentRules";

const NOW = Date.parse("2026-11-06T09:00:00Z");

let accounts: AccountStore;
let participants: ParticipantStore;
let bots: BotSeatingStore;
let elimination: EliminationStore;
let tournamentId: string;
let players: string[];
let outsiderId: string;

async function enter(name: string): Promise<string> {
  const account = await accounts.accountForIdentity("discord", name, name);
  await accounts.saveDeck(account.id, {
    id: "deck",
    name: "Deck",
    mainDeck: [...RED_DECK.mainDeck],
    eggDeck: [...RED_DECK.eggDeck],
  });
  const registered = await participants.register({ tournamentId, accountId: account.id, savedDeckId: "deck" });
  if (!registered.ok) {
    throw new Error(registered.reason);
  }
  const checked = await participants.checkIn({ tournamentId, accountId: account.id });
  if (!checked.ok) {
    throw new Error(checked.reason);
  }
  return account.id;
}

async function notificationsOf(accountId: string): Promise<{ kind: string; payload: Record<string, unknown> }[]> {
  const { rows } = await accounts.pool.query<{ kind: string; payload: Record<string, unknown> }>(
    "SELECT kind, payload FROM notifications WHERE account_id=$1 ORDER BY kind",
    [accountId],
  );
  return rows.map((row) => ({ kind: row.kind, payload: row.payload }));
}

beforeEach(async () => {
  accounts = new AccountStore(createMemoryPool());
  participants = new ParticipantStore(accounts);
  bots = new BotSeatingStore(accounts);
  elimination = new EliminationStore(accounts);
  const organizerId = (await accounts.accountForIdentity("discord", "organizer", "Organizer")).id;
  outsiderId = (await accounts.accountForIdentity("discord", "outsider", "Outsider")).id;
  tournamentId = (
    await accounts.createTournament(organizerId, {
      name: "Lightning Cup",
      block: "BT10",
      startsAt: 1,
      maxPlayers: 4,
      rules: buildTournamentRules({ bestOf: 1 }),
    })
  ).id;
  players = [];
  for (const name of ["a", "b", "c", "d"]) {
    players.push(await enter(name));
  }
});

describe("telling players their tournament started and their match is ready", () => {
  it("stays silent while the tournament is still open for check-in", async () => {
    expect(await notifyTournamentPlayers({ accounts, now: NOW })).toBe(0);
  });

  it("tells every seated player once that the tournament started and their match is ready", async () => {
    await openEliminationEvent({ tournamentId, participants, bots, elimination, now: NOW });

    expect(await notifyTournamentPlayers({ accounts, now: NOW + 5_000 })).toBe(8);
    for (const accountId of players) {
      expect(await notificationsOf(accountId)).toEqual([
        { kind: "tournament_match_ready", payload: { tournamentId, tournamentName: "Lightning Cup", round: 1 } },
        { kind: "tournament_started", payload: { tournamentId, tournamentName: "Lightning Cup" } },
      ]);
    }
    expect(await notificationsOf(outsiderId)).toEqual([]);
  });

  it("does not repeat a notification on later sweeps or after the player reads it", async () => {
    await openEliminationEvent({ tournamentId, participants, bots, elimination, now: NOW });
    await notifyTournamentPlayers({ accounts, now: NOW + 5_000 });
    await accounts.pool.query("UPDATE notifications SET read_at=$1 WHERE account_id=$2", [NOW + 6_000, players[0]]);

    expect(await notifyTournamentPlayers({ accounts, now: NOW + 10_000 })).toBe(0);
    expect(await notificationsOf(players[0]!)).toHaveLength(2);
  });

  it("does not announce a match whose join deadline already passed", async () => {
    await openEliminationEvent({ tournamentId, participants, bots, elimination, now: NOW });
    await accounts.pool.query("UPDATE tournament_matches SET join_deadline_at=$1 WHERE tournament_id=$2", [
      NOW + 1_000,
      tournamentId,
    ]);

    expect(await notifyTournamentPlayers({ accounts, now: NOW + 5_000 })).toBe(4);
    expect(await notificationsOf(players[0]!)).toEqual([
      { kind: "tournament_started", payload: { tournamentId, tournamentName: "Lightning Cup" } },
    ]);
  });
});
