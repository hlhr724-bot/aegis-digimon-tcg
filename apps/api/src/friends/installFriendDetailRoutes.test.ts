import { createServer, type Server } from "node:http";
import express from "express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AccountStore, type Account } from "#api/accounts/AccountStore";
import { createMemoryPool } from "#api/db/memoryPool.fixture";
import { FriendStore } from "#api/friends/FriendStore";
import { ReplayLibrary } from "#api/replays/ReplayLibrary";
import { installFriendDetailRoutes } from "#api/friends/installFriendDetailRoutes";

let accounts: AccountStore;
let owner: Account;
let friend: Account;
let stranger: Account;
let server: Server;
let base: string;

beforeEach(async () => {
  accounts = new AccountStore(createMemoryPool());
  owner = await accounts.accountForIdentity("email", "owner@test.invalid", "Owner");
  friend = await accounts.accountForIdentity("email", "friend@test.invalid", "Friend");
  stranger = await accounts.accountForIdentity("email", "stranger@test.invalid", "Stranger");
  const friends = new FriendStore(accounts);
  await friends.request({ accountId: friend.id, displayName: owner.displayName });
  await friends.accept({ accountId: owner.id, otherId: friend.id });
  const app = express();
  installFriendDetailRoutes({
    app,
    accounts,
    replays: new ReplayLibrary(accounts),
    session: async (req) => {
      const account = [owner, friend, stranger].find((entry) => entry.id === req.headers["x-test-account"]);
      return account ? { id: "session", account, expiresAt: Date.now() + 60_000 } : undefined;
    },
  });
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await accounts.close();
});

describe("friend profile privacy", () => {
  it("requires a session and a current friendship", async () => {
    expect((await fetch(`${base}/friends/${owner.id}/detail`)).status).toBe(401);
    expect(
      (await fetch(`${base}/friends/${owner.id}/detail`, { headers: { "x-test-account": stranger.id } })).status,
    ).toBe(404);
    expect(
      (await fetch(`${base}/friends/${owner.id}/replays`, { headers: { "x-test-account": stranger.id } })).status,
    ).toBe(404);
  });
  it("returns stats only after explicit server-stored consent and hides them again on revocation", async () => {
    async function detail() {
      return (await fetch(`${base}/friends/${owner.id}/detail`, { headers: { "x-test-account": friend.id } })).json();
    }
    expect(await detail()).toMatchObject({ friend: { accountId: owner.id }, stats: null });
    await accounts.updatePreferences(owner.id, { shareProfileStats: true });
    expect(await detail()).toMatchObject({ stats: { matches: 0, wins: 0, losses: 0 } });
    await accounts.updatePreferences(owner.id, { shareProfileStats: false });
    await accounts.updatePreferences(owner.id, { profileStats: true, darkMode: true });
    expect(await detail()).toMatchObject({ stats: null });
  });
});
