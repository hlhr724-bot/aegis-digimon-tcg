import { randomInt, randomUUID } from "node:crypto";
import { isBetaOnlyCard } from "@aegis/shared/cards/cardPool";
import type { DeckFormat } from "@aegis/shared/deckFormat";
import type { CommunityRandomResult } from "@aegis/shared/decks/CommunityRandomResult";
import {
  CardColor,
  COMMUNITY_PAGE_SIZE,
  deckLegality,
  getCardDefinition,
  type CommunityDeck,
  type CommunityDeckPage,
  type CommunityDeckSummary,
  type CommunityLikeResult,
  type CommunityModeration,
  type CommunityModerationInput,
  type CommunityPeriod,
  type CommunityPublicationStatus,
  type CommunityPublication,
  type CommunityPublishError,
  type CommunityReportReason,
  type CommunityReviewError,
  type CommunitySort,
} from "@aegis/shared";
import type { PoolClient } from "pg";
import type { AccountStore } from "../accounts/AccountStore.js";
import { reviewDeckName } from "./deckNameModeration.js";

const SHOWN_COLORS = 3;
const DAY_MS = 86_400_000;
const PERIOD_MS: Record<Exclude<CommunityPeriod, "all">, number> = { week: 7 * DAY_MS, month: 30 * DAY_MS };

export type CommunityDeckQuery = {
  sort: CommunitySort;
  period: CommunityPeriod;
  colors: string[];
  search: string;
  page: number;
  viewerId?: string;
};

export type PublishResult =
  | { ok: true; publication: CommunityPublication }
  | { ok: false; error: CommunityPublishError };

/** Why a like was refused, or the new state. Authors cannot like their own deck. */
export type LikeResult = { ok: true; like: CommunityLikeResult } | { ok: false; error: "deck_not_found" | "own_deck" };

export type ReviewResult = { ok: true; publication: CommunityPublication } | { ok: false; error: CommunityReviewError };

export type DeckStatus = CommunityPublicationStatus | "unpublished";

/** What a report names, or why it was refused. Authors cannot report their own deck. */
export type ReportTarget =
  | { ok: true; deck: { id: string; name: string; authorName: string } }
  | { ok: false; error: "deck_not_found" | "own_deck" };

type UpdateGuideParams = { accountId: string; publicDeckId: string; guide: string | null };

type RequestReviewParams = { accountId: string; sourceDeckId: string; note: string | null };

type ModerationRow = {
  hidden_reason: CommunityReportReason | null;
  hidden_note: string | null;
  hidden_at: string | null;
  review_requested_at: string | null;
  review_note: string | null;
};

type SnapshotParams = { client: PoolClient; accountId: string; sourceDeckId: string; at: number };

type SnapshotResult =
  | { ok: true; name: string; values: unknown[] }
  | { ok: false; error: "deck_not_found" | "deck_not_legal" | "name_not_allowed" };

type PublicDeckRow = ModerationRow & {
  guide: string | null;
  has_guide: boolean;
  id: string;
  account_id: string;
  display_name: string;
  name: string;
  colors: string[];
  main_deck: string[];
  egg_deck: string[];
  main_deck_arts: string[];
  egg_deck_arts: string[];
  cover_card_id: string | null;
  like_count: number;
  copy_count: number;
  published_at: string;
  updated_at: string;
  status: CommunityPublicationStatus;
};

const MODERATION_COLUMNS = "p.hidden_reason,p.hidden_note,p.hidden_at,p.review_requested_at,p.review_note";

const PUBLIC_DECK_COLUMNS = `p.id,p.account_id,a.display_name,p.name,p.colors,p.main_deck,p.egg_deck,p.main_deck_arts,p.egg_deck_arts,p.cover_card_id,p.like_count,p.copy_count,p.published_at,p.updated_at,p.status,p.guide,(p.guide IS NOT NULL) AS has_guide,${MODERATION_COLUMNS}`;

/**
 * Public decks: publishing, browsing, likes and copies. Shares the AccountStore's pool and
 * migration run rather than opening its own.
 *
 * A published deck is a frozen copy of a saved deck. Publishing reads the saved deck from the
 * database, never from the request, so what goes public is exactly what the owner saved.
 */
export class CommunityDeckStore {
  constructor(private readonly accounts: AccountStore) {}

  async publish(accountId: string, sourceDeckId: string): Promise<PublishResult> {
    return this.transaction(async (client) => {
      const snapshot = await savedDeckSnapshot({ client, accountId, sourceDeckId, at: Date.now() });
      if (!snapshot.ok) return snapshot;
      const { values } = snapshot;
      const existing = (
        await client.query<{ id: string; like_count: number; status: string }>(
          "SELECT id,like_count,status FROM public_decks WHERE account_id=$1 AND source_deck_id=$2 FOR UPDATE",
          [accountId, sourceDeckId],
        )
      ).rows[0];
      if (existing?.status === "hidden") return { ok: false, error: "deck_hidden" };
      const id = existing?.id ?? randomUUID();
      if (existing)
        await client.query(
          "UPDATE public_decks SET name=$1,colors=$2,main_deck=$3,egg_deck=$4,main_deck_arts=$5,egg_deck_arts=$6,cover_card_id=$7,updated_at=$8,status='public' WHERE id=$9",
          [...values, id],
        );
      else
        await client.query(
          "INSERT INTO public_decks (name,colors,main_deck,egg_deck,main_deck_arts,egg_deck_arts,cover_card_id,updated_at,published_at,id,account_id,source_deck_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,$10,$11)",
          [...values, id, accountId, sourceDeckId],
        );
      return {
        ok: true,
        publication: {
          id,
          sourceDeckId,
          name: snapshot.name,
          likeCount: existing?.like_count ?? 0,
          outdated: false,
          status: "public",
        },
      };
    });
  }

  async requestReview({ accountId, sourceDeckId, note }: RequestReviewParams): Promise<ReviewResult> {
    return this.transaction(async (client) => {
      const existing = (
        await client.query<ModerationRow & { id: string; like_count: number; status: DeckStatus }>(
          `SELECT p.id,p.like_count,p.status,${MODERATION_COLUMNS} FROM public_decks p WHERE p.account_id=$1 AND p.source_deck_id=$2 FOR UPDATE`,
          [accountId, sourceDeckId],
        )
      ).rows[0];
      if (!existing) return { ok: false, error: "deck_not_found" };
      if (existing.status !== "hidden") return { ok: false, error: "deck_not_hidden" };
      if (existing.review_requested_at !== null) return { ok: false, error: "review_pending" };
      const now = Date.now();
      const snapshot = await savedDeckSnapshot({ client, accountId, sourceDeckId, at: now });
      if (!snapshot.ok) return snapshot;
      await client.query(
        "UPDATE public_decks SET name=$1,colors=$2,main_deck=$3,egg_deck=$4,main_deck_arts=$5,egg_deck_arts=$6,cover_card_id=$7,updated_at=$8,review_requested_at=$8,review_note=$9 WHERE id=$10",
        [...snapshot.values, note, existing.id],
      );
      return {
        ok: true,
        publication: {
          id: existing.id,
          sourceDeckId,
          name: snapshot.name,
          likeCount: existing.like_count,
          outdated: false,
          status: "hidden",
          moderation: toModeration({ ...existing, review_requested_at: String(now), review_note: note }),
        },
      };
    });
  }

  /** Hides the deck from everyone. Its likes stay, so publishing it again restores them. */
  async unpublish(accountId: string, sourceDeckId: string): Promise<boolean> {
    await this.accounts.ensureReady();
    const result = await this.accounts.pool.query(
      "UPDATE public_decks SET status='unpublished' WHERE account_id=$1 AND source_deck_id=$2 AND status='public'",
      [accountId, sourceDeckId],
    );
    return result.rowCount === 1;
  }

  async publications(accountId: string): Promise<CommunityPublication[]> {
    await this.accounts.ensureReady();
    const rows = (
      await this.accounts.pool.query<
        ModerationRow & {
          id: string;
          source_deck_id: string;
          name: string;
          like_count: number;
          updated_at: string;
          saved_updated_at: string | null;
          status: CommunityPublicationStatus;
        }
      >(
        `SELECT p.id,p.source_deck_id,p.name,p.like_count,p.updated_at,p.status,${MODERATION_COLUMNS},s.updated_at saved_updated_at FROM public_decks p LEFT JOIN saved_decks s ON s.account_id=p.account_id AND s.id=p.source_deck_id WHERE p.account_id=$1 AND p.status IN ('public','hidden')`,
        [accountId],
      )
    ).rows;
    return rows.map((row) => ({
      id: row.id,
      sourceDeckId: row.source_deck_id,
      name: row.name,
      likeCount: row.like_count,
      outdated: row.saved_updated_at !== null && Number(row.saved_updated_at) > Number(row.updated_at),
      status: row.status,
      ...(row.status === "hidden" ? { moderation: toModeration(row) } : {}),
    }));
  }

  async list(query: CommunityDeckQuery): Promise<CommunityDeckPage> {
    await this.accounts.ensureReady();
    const params: unknown[] = [];
    const param = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };
    const filters = ["p.status='public'"];
    for (const color of query.colors) filters.push(`p.colors @> ${param(JSON.stringify([color]))}::jsonb`);
    const search = query.search.trim().toLowerCase();
    if (search) {
      const pattern = param(`%${escapeLike(search)}%`);
      filters.push(`(lower(p.name) LIKE ${pattern} OR lower(a.display_name) LIKE ${pattern})`);
    }
    const periodLikes =
      query.sort === "top" && query.period !== "all"
        ? `LEFT JOIN (SELECT public_deck_id, COUNT(*) recent_likes FROM public_deck_likes WHERE created_at >= ${param(Date.now() - PERIOD_MS[query.period])} GROUP BY public_deck_id) recent ON recent.public_deck_id=p.id`
        : "";
    const order =
      query.sort === "new"
        ? "p.published_at DESC, p.id"
        : periodLikes
          ? "COALESCE(recent.recent_likes, 0) DESC, p.like_count DESC, p.published_at DESC, p.id"
          : "p.like_count DESC, p.published_at DESC, p.id";
    // One extra row tells whether another page exists without a COUNT.
    const limit = param(COMMUNITY_PAGE_SIZE + 1);
    const offset = param(Math.max(0, query.page) * COMMUNITY_PAGE_SIZE);
    const rows = (
      await this.accounts.pool.query<PublicDeckRow>(
        `SELECT ${PUBLIC_DECK_COLUMNS} FROM public_decks p JOIN accounts a ON a.id=p.account_id ${periodLikes} WHERE ${filters.join(" AND ")} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`,
        params,
      )
    ).rows;
    const page = rows.slice(0, COMMUNITY_PAGE_SIZE);
    const liked = await this.likedAmong(
      query.viewerId,
      page.map((row) => row.id),
    );
    return { decks: page.map((row) => toSummary(row, liked.has(row.id))), hasMore: rows.length > COMMUNITY_PAGE_SIZE };
  }

  /** `includeHidden` is for moderators, who open a reported deck after it has been hidden. */
  async deck(id: string, viewerId?: string, includeHidden = false): Promise<CommunityDeck | undefined> {
    if (!isUuid(id)) return undefined;
    await this.accounts.ensureReady();
    const statuses = includeHidden ? "('public','hidden')" : "('public')";
    const row = (
      await this.accounts.pool.query<PublicDeckRow>(
        `SELECT ${PUBLIC_DECK_COLUMNS} FROM public_decks p JOIN accounts a ON a.id=p.account_id WHERE p.id=$1 AND p.status IN ${statuses}`,
        [id],
      )
    ).rows[0];
    if (!row) return undefined;
    const liked = await this.likedAmong(viewerId, [row.id]);
    return {
      ...toSummary(row, liked.has(row.id)),
      status: row.status,
      guide: row.guide,
      mainDeck: row.main_deck,
      eggDeck: row.egg_deck,
      mainDeckArts: row.main_deck_arts,
      eggDeckArts: row.egg_deck_arts,
      ...(row.status === "hidden" ? { moderation: toModeration(row) } : {}),
    };
  }

  async randomDeck({
    format,
    betaAllowed,
  }: {
    format: DeckFormat;
    betaAllowed: boolean;
  }): Promise<CommunityRandomResult> {
    return this.transaction(async (client) => {
      await client.query("SET LOCAL transaction_isolation = 'repeatable read'");
      await client.query("SET LOCAL statement_timeout = '5s'");
      let cursor: string | null = null;
      let selected: PublicDeckRow | undefined;
      let eligibleCount = 0;
      const deadline = performance.now() + 10_000;
      for (;;) {
        if (performance.now() > deadline) throw new Error("Community deck selection timed out");
        const rows: PublicDeckRow[] = (
          await client.query<PublicDeckRow>(
            `SELECT ${PUBLIC_DECK_COLUMNS} FROM public_decks p JOIN accounts a ON a.id=p.account_id WHERE p.status='public' AND ($1::uuid IS NULL OR p.id > $1::uuid) ORDER BY p.id LIMIT 128`,
            [cursor],
          )
        ).rows;
        for (const row of rows) {
          const deck = { mainDeck: row.main_deck, eggDeck: row.egg_deck };
          if (!deckLegality(deck, { format }).legal) continue;
          if (
            !betaAllowed &&
            [...deck.mainDeck, ...deck.eggDeck].some((id) => {
              const card = getCardDefinition(id);
              return card !== undefined && isBetaOnlyCard(card);
            })
          )
            continue;
          eligibleCount += 1;
          if (randomInt(eligibleCount) === 0) selected = row;
        }
        if (rows.length < 128) break;
        cursor = rows.at(-1)!.id;
      }
      return {
        eligibleCount,
        deck: selected
          ? {
              ...toSummary(selected, false),
              status: selected.status,
              guide: selected.guide,
              mainDeck: selected.main_deck,
              eggDeck: selected.egg_deck,
              mainDeckArts: selected.main_deck_arts,
              eggDeckArts: selected.egg_deck_arts,
            }
          : null,
      };
    });
  }

  async updateGuide({ accountId, publicDeckId, guide }: UpdateGuideParams): Promise<boolean> {
    if (!isUuid(publicDeckId)) {
      return false;
    }
    await this.accounts.ensureReady();
    const result = await this.accounts.pool.query(
      "UPDATE public_decks SET guide=$3 WHERE id=$2 AND account_id=$1 AND status='public'",
      [accountId, publicDeckId, guide],
    );
    return result.rowCount === 1;
  }

  async like(accountId: string, id: string): Promise<LikeResult> {
    return this.setLike(accountId, id, true);
  }

  async unlike(accountId: string, id: string): Promise<LikeResult> {
    return this.setLike(accountId, id, false);
  }

  async reportTarget(accountId: string, id: string): Promise<ReportTarget> {
    if (!isUuid(id)) return { ok: false, error: "deck_not_found" };
    await this.accounts.ensureReady();
    const row = (
      await this.accounts.pool.query<{ account_id: string; name: string; display_name: string }>(
        "SELECT p.account_id,p.name,a.display_name FROM public_decks p JOIN accounts a ON a.id=p.account_id WHERE p.id=$1 AND p.status='public'",
        [id],
      )
    ).rows[0];
    if (!row) return { ok: false, error: "deck_not_found" };
    if (row.account_id === accountId) return { ok: false, error: "own_deck" };
    return { ok: true, deck: { id, name: row.name, authorName: row.display_name } };
  }

  /**
   * `hide` covers an unpublished deck too, so its owner cannot bring it back by publishing again.
   * Undefined when no such deck exists.
   */
  async moderate(id: string, input: CommunityModerationInput, at = Date.now()): Promise<DeckStatus | undefined> {
    if (!isUuid(id)) return undefined;
    await this.accounts.ensureReady();
    const query = (sql: string, params: unknown[]) =>
      this.accounts.pool.query<{ status: DeckStatus }>(`${sql} RETURNING status`, [id, ...params]);
    const result =
      input.action === "hide"
        ? await query(
            "UPDATE public_decks SET status='hidden',hidden_reason=$2,hidden_note=$3,hidden_at=$4,review_requested_at=NULL,review_note=NULL WHERE id=$1",
            [input.reason, input.note ?? null, at],
          )
        : input.action === "restore"
          ? await query(
              "UPDATE public_decks SET status=CASE WHEN status='hidden' THEN 'public' ELSE status END,hidden_reason=NULL,hidden_note=NULL,hidden_at=NULL,review_requested_at=NULL,review_note=NULL WHERE id=$1",
              [],
            )
          : await query(
              "UPDATE public_decks SET hidden_note=COALESCE($2,hidden_note),review_requested_at=NULL,review_note=NULL WHERE id=$1 AND status='hidden'",
              [input.note ?? null],
            );
    return result.rows[0]?.status;
  }

  /** Counts one copy per account, so copying the same deck again does not inflate it. */
  async recordCopy(accountId: string, id: string): Promise<boolean> {
    if (!isUuid(id)) return false;
    return this.transaction(async (client) => {
      const deck = (await client.query("SELECT 1 FROM public_decks WHERE id=$1 AND status='public' FOR UPDATE", [id]))
        .rows[0];
      if (!deck) return false;
      const inserted = await client.query(
        "INSERT INTO public_deck_copies (public_deck_id,account_id,created_at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
        [id, accountId, Date.now()],
      );
      if (inserted.rowCount === 1)
        await client.query("UPDATE public_decks SET copy_count=copy_count+1 WHERE id=$1", [id]);
      return true;
    });
  }

  private async setLike(accountId: string, id: string, liked: boolean): Promise<LikeResult> {
    if (!isUuid(id)) return { ok: false, error: "deck_not_found" };
    return this.transaction(async (client) => {
      const deck = (
        await client.query<{ account_id: string; like_count: number }>(
          "SELECT account_id,like_count FROM public_decks WHERE id=$1 AND status='public' FOR UPDATE",
          [id],
        )
      ).rows[0];
      if (!deck) return { ok: false, error: "deck_not_found" };
      if (deck.account_id === accountId) return { ok: false, error: "own_deck" };
      const changed = liked
        ? await client.query(
            "INSERT INTO public_deck_likes (public_deck_id,account_id,created_at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
            [id, accountId, Date.now()],
          )
        : await client.query("DELETE FROM public_deck_likes WHERE public_deck_id=$1 AND account_id=$2", [
            id,
            accountId,
          ]);
      const likeCount = deck.like_count + (changed.rowCount === 1 ? (liked ? 1 : -1) : 0);
      if (likeCount !== deck.like_count)
        await client.query("UPDATE public_decks SET like_count=$1 WHERE id=$2", [likeCount, id]);
      return { ok: true, like: { liked, likeCount } };
    });
  }

  private async likedAmong(viewerId: string | undefined, ids: readonly string[]): Promise<Set<string>> {
    if (!viewerId || ids.length === 0) return new Set();
    const placeholders = ids.map((_, index) => `$${index + 2}`).join(",");
    const rows = (
      await this.accounts.pool.query<{ public_deck_id: string }>(
        `SELECT public_deck_id FROM public_deck_likes WHERE account_id=$1 AND public_deck_id IN (${placeholders})`,
        [viewerId, ...ids],
      )
    ).rows;
    return new Set(rows.map((row) => row.public_deck_id));
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
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

function toSummary(row: PublicDeckRow, likedByMe: boolean): CommunityDeckSummary {
  return {
    id: row.id,
    name: row.name,
    author: { id: row.account_id, displayName: row.display_name },
    colors: row.colors,
    coverCardId: row.cover_card_id,
    likeCount: row.like_count,
    copyCount: row.copy_count,
    likedByMe,
    hasGuide: row.has_guide,
    // The banlist moves after a deck goes public, so legality is judged on every read.
    legal: deckLegality({ mainDeck: row.main_deck, eggDeck: row.egg_deck }).legal,
    publishedAt: Number(row.published_at),
    updatedAt: Number(row.updated_at),
  };
}

/** The same pick the famous presets make: the last Digimon in the list, usually its top level. */
async function savedDeckSnapshot({ client, accountId, sourceDeckId, at }: SnapshotParams): Promise<SnapshotResult> {
  const saved = (
    await client.query<{
      name: string;
      main_deck: string[];
      egg_deck: string[];
      main_deck_arts: string[] | null;
      egg_deck_arts: string[] | null;
      cover_card_id: string | null;
    }>(
      "SELECT name,main_deck,egg_deck,main_deck_arts,egg_deck_arts,cover_card_id FROM saved_decks WHERE account_id=$1 AND id=$2",
      [accountId, sourceDeckId],
    )
  ).rows[0];
  if (!saved) return { ok: false, error: "deck_not_found" };
  if (!deckLegality({ mainDeck: saved.main_deck, eggDeck: saved.egg_deck }).legal)
    return { ok: false, error: "deck_not_legal" };
  const review = reviewDeckName(saved.name);
  if (!review.allowed) return { ok: false, error: "name_not_allowed" };
  return {
    ok: true,
    name: review.name,
    values: [
      review.name,
      JSON.stringify(deckColors(saved.main_deck)),
      JSON.stringify(saved.main_deck),
      JSON.stringify(saved.egg_deck),
      JSON.stringify(saved.main_deck_arts ?? saved.main_deck),
      JSON.stringify(saved.egg_deck_arts ?? saved.egg_deck),
      saved.cover_card_id ?? fallbackCover(saved.main_deck),
      at,
    ],
  };
}

function toModeration(row: ModerationRow): CommunityModeration {
  return {
    reason: row.hidden_reason,
    note: row.hidden_note,
    hiddenAt: row.hidden_at === null ? null : Number(row.hidden_at),
    reviewRequestedAt: row.review_requested_at === null ? null : Number(row.review_requested_at),
    reviewNote: row.review_note,
  };
}

function fallbackCover(mainDeck: readonly string[]): string | null {
  return [...mainDeck].reverse().find((cardId) => getCardDefinition(cardId)?.level !== undefined) ?? null;
}

function deckColors(mainDeck: readonly string[]): string[] {
  const counts = new Map<string, number>();
  for (const cardId of mainDeck)
    for (const color of getCardDefinition(cardId)?.colors ?? [])
      if (color !== CardColor.None) counts.set(color, (counts.get(color) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, SHOWN_COLORS)
    .map(([color]) => color);
}

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
