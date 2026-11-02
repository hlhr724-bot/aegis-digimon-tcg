import { createMemoryDatabase } from "#api/db/createMemoryDatabase";
import { describe, expect, it, vi } from "vitest";
import { AccountStore } from "./AccountStore.js";
import {
  MANUAL_REFRESH_COOLDOWN_MS,
  type DiscordAvatarSource,
  DiscordRateLimitError,
  backfillDiscordAvatars,
  refreshDiscordAvatarNow,
} from "./discordAvatars.js";

function createStore(): AccountStore {
  return new AccountStore(new (createMemoryDatabase().adapters.createPg().Pool)() as never);
}
const noDelay = async () => undefined;

describe("Discord avatars", () => {
  it("refreshes on request, then waits out the per-account cooldown", async () => {
    const store = createStore();
    const account = await store.accountForIdentity("discord", "7", "Tamer", "https://cdn.discordapp.com/old.png");
    const source = vi.fn<DiscordAvatarSource>(async () => "https://cdn.discordapp.com/new.png");

    expect(await refreshDiscordAvatarNow(store, source, account.id)).toEqual({ status: "cooldown" });
    expect(source).not.toHaveBeenCalled();

    const later = Date.now() + MANUAL_REFRESH_COOLDOWN_MS + 1;
    expect(await refreshDiscordAvatarNow(store, source, account.id, later)).toEqual({
      status: "refreshed",
      avatarUrl: "https://cdn.discordapp.com/new.png",
    });
    expect(source).toHaveBeenCalledWith("7");
    expect(await refreshDiscordAvatarNow(store, source, account.id, later)).toEqual({ status: "cooldown" });
    expect(source).toHaveBeenCalledTimes(1);
    await store.close();
  });

  it("rejects accounts without a Discord login", async () => {
    const store = createStore();
    const account = await store.accountForIdentity("email", "a@example.com", "Mail");
    const source = vi.fn<DiscordAvatarSource>(async () => null);
    expect(await refreshDiscordAvatarNow(store, source, account.id)).toEqual({ status: "not_discord" });
    expect(source).not.toHaveBeenCalled();
    await store.close();
  });

  it("keeps the old avatar and frees the cooldown when Discord fails", async () => {
    const store = createStore();
    const account = await store.accountForIdentity("discord", "8", "Tamer", "https://cdn.discordapp.com/old.png");
    const later = Date.now() + MANUAL_REFRESH_COOLDOWN_MS + 1;
    const failing = vi
      .fn<DiscordAvatarSource>()
      .mockRejectedValueOnce(new DiscordRateLimitError(1000))
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValue("https://cdn.discordapp.com/new.png");
    expect(await refreshDiscordAvatarNow(store, failing, account.id, later)).toEqual({ status: "rate_limited" });
    expect(await refreshDiscordAvatarNow(store, failing, account.id, later)).toEqual({ status: "failed" });
    expect(await refreshDiscordAvatarNow(store, failing, account.id, later)).toMatchObject({ status: "refreshed" });
    await store.close();
  });

  it("backfills unchecked Discord accounts and skips email accounts", async () => {
    const store = createStore();
    const pool = (store as unknown as { pool: { query: (sql: string) => Promise<unknown> } }).pool;
    const legacy = await store.accountForIdentity("discord", "9", "Legacy");
    await store.accountForIdentity("email", "a@example.com", "Mail");
    await pool.query("UPDATE accounts SET avatar_checked_at=NULL");
    const source = vi.fn<DiscordAvatarSource>(async (id: string) => `https://cdn.discordapp.com/${id}.png`);

    expect(await backfillDiscordAvatars(store, source, noDelay)).toBe(1);
    expect(source).toHaveBeenCalledWith("9");
    expect(await backfillDiscordAvatars(store, source, noDelay)).toBe(0);
    const session = await store.session((await store.issueSession(legacy)).id);
    expect(session?.account.avatarUrl).toBe("https://cdn.discordapp.com/9.png");
    await store.close();
  });

  it("skips a failed account and keeps backfilling the rest", async () => {
    const store = createStore();
    const pool = (store as unknown as { pool: { query: (sql: string) => Promise<unknown> } }).pool;
    await store.accountForIdentity("discord", "20", "A");
    await store.accountForIdentity("discord", "21", "B");
    await pool.query("UPDATE accounts SET avatar_checked_at=NULL");
    const source = vi.fn<DiscordAvatarSource>(async (id) => {
      if (id === "20") throw new Error("timeout");
      return `https://cdn.discordapp.com/${id}.png`;
    });
    expect(await backfillDiscordAvatars(store, source, noDelay)).toBe(1);
    expect(source).toHaveBeenCalledTimes(2);
    await store.close();
  });

  it("waits out a rate limit and retries the same account", async () => {
    const store = createStore();
    const pool = (store as unknown as { pool: { query: (sql: string) => Promise<unknown> } }).pool;
    await store.accountForIdentity("discord", "30", "A");
    await pool.query("UPDATE accounts SET avatar_checked_at=NULL");
    const source = vi
      .fn<DiscordAvatarSource>()
      .mockRejectedValueOnce(new DiscordRateLimitError(2000))
      .mockResolvedValue("https://cdn.discordapp.com/30.png");
    const delay = vi.fn<(ms: number) => Promise<void>>(async () => undefined);
    expect(await backfillDiscordAvatars(store, source, delay)).toBe(1);
    expect(delay).toHaveBeenCalledWith(2000);
    await store.close();
  });

  it("releases unprocessed claims when the rate limit persists", async () => {
    const store = createStore();
    const pool = (store as unknown as { pool: { query: (sql: string) => Promise<unknown> } }).pool;
    await store.accountForIdentity("discord", "10", "A");
    await store.accountForIdentity("discord", "11", "B");
    await pool.query("UPDATE accounts SET avatar_checked_at=NULL");
    const rateLimited = vi.fn<DiscordAvatarSource>(async () => {
      throw new DiscordRateLimitError(1000);
    });
    expect(await backfillDiscordAvatars(store, rateLimited, noDelay)).toBe(0);

    const source = vi.fn<DiscordAvatarSource>(async (id: string) => `https://cdn.discordapp.com/${id}.png`);
    expect(await backfillDiscordAvatars(store, source, noDelay)).toBe(2);
    await store.close();
  });
});
