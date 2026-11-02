import type { DeckFormat } from "@aegis/shared/deckFormat";
import { randomUUID } from "node:crypto";
import type { TournamentBanlistCard } from "@aegis/shared";
import type { PoolClient } from "pg";
import type { AccountStore } from "../../accounts/AccountStore.js";
import { metaDecksForBlock, type MetaDeck } from "../../bot/metaDecks/index.js";
import { validateCompetitiveDeck } from "../participants/index.js";
import { type AcquireTournamentLock, inProcessTournamentLock } from "../participants/index.js";
import type { ParticipantRecord } from "../participants/index.js";
import { type BotFillPlan, planBotFill } from "./botFill.js";

export type BotSeatingOutcome =
  | { kind: "seated"; targetSize: number; participantIds: string[] }
  | { kind: "skipped"; reason: "bots_not_allowed" | "field_already_full" | "no_legal_bot_deck" }
  | { kind: "cancel"; reason: "below_minimum" }
  | { kind: "unavailable"; reason: "tournament_not_found" };

/**
 * Seats the bots that complete a short field, once and only at the close of check-in.
 *
 * "Once" is the hard part, and it is enforced by looking for bot participants before planning any:
 * a tournament that already has one is left exactly as it is. That makes the whole operation safe
 * to retry after a partial failure and safe for two API containers to attempt at the same time,
 * because the plan is derived under the tournament's row lock.
 *
 * A seated bot is an ordinary participant row in every respect the rest of the system cares about:
 * `status='active'` and a `deck_snapshot` copied in place, exactly like a human's frozen deck. Room
 * seating therefore reads one column for every participant and has no bot-shaped branch at all.
 * `bot_profile` and `bot_deck_version` are the provenance of that snapshot, not a second source of
 * truth for it.
 *
 * Shares the AccountStore's pool and migration run rather than opening a second one.
 */
export class BotSeatingStore {
  constructor(
    private readonly accounts: AccountStore,
    private readonly acquireLock: AcquireTournamentLock = inProcessTournamentLock(),
    /** Seam: where the legal, versioned bot decks come from. Tests substitute a fixed list. */
    private readonly decksForBlock: (block: string) => readonly MetaDeck[] = defaultDecksForBlock,
    private readonly drawStyle: () => number = Math.random,
  ) {}

  /**
   * Completes the field at check-in close, if the tournament's published policy allows it.
   *
   * Call this AFTER `ParticipantStore.closeCheckIn`, which is what turns confirmed entrants into
   * `active` participants with frozen decks. The count this plans against is that set — people who
   * showed up — never the registration list, so a no-show is a bye rather than a reason to seat a
   * machine in their place.
   */
  async fillAtClose(input: { tournamentId: string; now?: number }): Promise<BotSeatingOutcome> {
    const now = input.now ?? Date.now();
    return this.mutate(input.tournamentId, async (client) => {
      const tournament = (
        await client.query<{
          id: string;
          block: string;
          format: DeckFormat;
          max_players: string | number;
          allow_bots: boolean;
          random_bot_styles: boolean;
          banlist_cards: TournamentBanlistCard[] | string | null;
        }>(
          "SELECT id, block, format, max_players, allow_bots, random_bot_styles, banlist_cards FROM tournaments WHERE id=$1 FOR UPDATE",
          [input.tournamentId],
        )
      ).rows[0];
      if (!tournament) return { kind: "unavailable", reason: "tournament_not_found" } as const;

      const seated = await this.existingBots(client, input.tournamentId);
      if (seated.length > 0)
        return {
          kind: "seated",
          targetSize: await this.activeCount(client, input.tournamentId),
          participantIds: seated,
        } as const;

      // Vetted against the tournament's OWN frozen banlist, not against today's.
      //
      // The shipped lists are trimmed to the banlist in force when they were authored, which is not
      // the list this event froze at creation: an event frozen at an earlier date may still allow a
      // card since restricted, and — the case that actually matters — an event frozen later bans
      // cards a shipped list still runs at four. Seating a bot on a deck the event's own rules
      // forbid would put an illegal list in a field where every human deck was checked against
      // exactly this snapshot.
      //
      // Illegal decks are dropped from the candidate pool rather than repaired, so the fill simply
      // picks the next legal deck for the block. If none of the block's decks survive, `planBotFill`
      // reports `no_legal_bot_deck` and the field stays short — which is the documented fallback,
      // and better than a machine playing a banned card.
      const decks = legalUnder(
        this.decksForBlock(tournament.block),
        parseBanlist(tournament.banlist_cards),
        tournament.format,
      );
      const plan = planBotFill({
        allowBots: tournament.allow_bots === true,
        confirmedHumans: await this.activeHumanCount(client, input.tournamentId),
        maxPlayers: Number(tournament.max_players),
        decks,
        seed: input.tournamentId,
        randomStyles: tournament.random_bot_styles === true,
        drawStyle: this.drawStyle,
      });
      return this.apply(client, input.tournamentId, plan, decks, now);
    });
  }

  /** The bots already seated in this tournament, oldest first. */
  async bots(tournamentId: string): Promise<ParticipantRecord[]> {
    await this.accounts.ensureReady();
    const ids = await this.existingBots(this.accounts.pool, tournamentId);
    if (ids.length === 0) return [];
    const rows = (
      await this.accounts.pool.query<{
        id: string;
        display_name: string;
        bot_profile: string | null;
        bot_deck_version: string | null;
        deck_snapshot: unknown;
      }>(
        "SELECT id, display_name, bot_profile, bot_deck_version, deck_snapshot FROM tournament_participants WHERE tournament_id=$1 AND kind='bot' ORDER BY created_at, id",
        [tournamentId],
      )
    ).rows;
    return rows.map(
      (row) =>
        ({
          id: row.id,
          tournamentId,
          kind: "bot",
          accountId: null,
          displayName: row.display_name,
          status: "active",
          seed: null,
          savedDeckId: null,
          deckSnapshot: typeof row.deck_snapshot === "string" ? JSON.parse(row.deck_snapshot) : row.deck_snapshot,
          deckVersion: row.bot_deck_version,
          createdAt: 0,
          checkedInAt: null,
          droppedAt: null,
        }) as ParticipantRecord,
    );
  }

  private async apply(
    client: PoolClient,
    tournamentId: string,
    plan: BotFillPlan,
    decks: readonly MetaDeck[],
    now: number,
  ): Promise<BotSeatingOutcome> {
    if (plan.kind === "cancel") return { kind: "cancel", reason: plan.reason };
    if (plan.kind === "none") return { kind: "skipped", reason: plan.reason };

    const byVersion = new Map(decks.map((deck) => [deck.deckVersion, deck]));
    const participantIds: string[] = [];
    for (const bot of plan.bots) {
      const deck = byVersion.get(bot.deckVersion);
      if (!deck) continue;
      const id = randomUUID();
      await client.query(
        `INSERT INTO tournament_participants
           (id, tournament_id, kind, account_id, display_name, status, deck_snapshot, deck_version, created_at, bot_profile, bot_deck_version)
         VALUES ($1,$2,'bot',NULL,$3,'active',$4,$5,$6,$7,$8)`,
        [
          id,
          tournamentId,
          bot.displayName,
          JSON.stringify(snapshotOf(deck)),
          deck.deckVersion,
          now + bot.index,
          bot.profile,
          deck.deckVersion,
        ],
      );
      participantIds.push(id);
    }
    return { kind: "seated", targetSize: plan.targetSize, participantIds };
  }

  private async existingBots(db: Pick<PoolClient, "query">, tournamentId: string): Promise<string[]> {
    return (
      await db.query<{ id: string }>(
        "SELECT id FROM tournament_participants WHERE tournament_id=$1 AND kind='bot' ORDER BY created_at, id",
        [tournamentId],
      )
    ).rows.map((row) => row.id);
  }

  private async activeHumanCount(client: PoolClient, tournamentId: string): Promise<number> {
    return this.count(client, tournamentId, "AND kind='human'");
  }

  private async activeCount(client: PoolClient, tournamentId: string): Promise<number> {
    return this.count(client, tournamentId, "");
  }

  private async count(client: PoolClient, tournamentId: string, extra: string): Promise<number> {
    const row = (
      await client.query<{ count: string }>(
        `SELECT COUNT(*) count FROM tournament_participants WHERE tournament_id=$1 AND status='active' ${extra}`,
        [tournamentId],
      )
    ).rows[0];
    return Number(row?.count ?? 0);
  }

  private async mutate<T>(tournamentId: string, work: (client: PoolClient) => Promise<T>): Promise<T> {
    const release = await this.acquireLock(tournamentId);
    try {
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
    } finally {
      release();
    }
  }
}

/**
 * The decks a bot may bring, for a tournament's block.
 *
 * `metaDecksForBlock` already falls back to the newest covered block for an unrecognised label, but
 * it returns an EMPTY list for a real product older than the oldest covered block ("ST1", "ST2",
 * "ST3", "P"). The documented fallback for that case is the newest covered block, requested with
 * the empty label; if even that is empty — a card pool trimmed below every shipped deck — no bot is
 * seated at all, because a bot with no legal deck is worse than a short field.
 */
function defaultDecksForBlock(block: string): readonly MetaDeck[] {
  const forBlock = metaDecksForBlock(block);
  return forBlock.length > 0 ? forBlock : metaDecksForBlock("");
}

/** The shipped decks this tournament's frozen banlist actually permits, in their shipped order. */
function legalUnder(
  decks: readonly MetaDeck[],
  banlistCards: readonly TournamentBanlistCard[],
  format: DeckFormat,
): readonly MetaDeck[] {
  return decks.filter((deck) => validateCompetitiveDeck(deck.decklist, banlistCards, format).legal);
}

function parseBanlist(value: TournamentBanlistCard[] | string | null): readonly TournamentBanlistCard[] {
  if (value === null) return [];
  return (typeof value === "string" ? (JSON.parse(value) as TournamentBanlistCard[]) : value) ?? [];
}

/**
 * The bot's frozen deck, COPIED out of the shipped list.
 *
 * `defineMetaDeck` deep-freezes every shipped deck and hands every caller the same instance, so the
 * arrays must be copied before they travel anywhere that might sort or splice them in place.
 */
function snapshotOf(deck: MetaDeck) {
  return {
    deckId: deck.deckId,
    name: deck.name,
    mainDeck: [...deck.decklist.mainDeck],
    eggDeck: [...deck.decklist.eggDeck],
    revision: 1,
  };
}
