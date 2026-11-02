import { createServer, type Server } from "node:http";
import express from "express";
import { installReplayRoutes } from "#api/replays/routes";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GameState } from "@aegis/shared/schema/GameState";
import { PlayerState } from "@aegis/shared/schema/PlayerState";
import { AccountStore, type Account } from "#api/accounts/AccountStore";
import { createMemoryPool } from "#api/db/memoryPool.fixture";
import { ReplayLibrary } from "#api/replays/ReplayLibrary";
import { ReplayRecording } from "#api/replays/recording";
import { replayDownload } from "#api/replays/download";
import { FriendStore } from "#api/friends/FriendStore";
import { BlockStore } from "#api/blocks/BlockStore";

let httpServer: Server | undefined;
let accounts: AccountStore;
let owner: Account;
let friend: Account;
let stranger: Account;
let library: ReplayLibrary;

beforeEach(async () => {
  accounts = new AccountStore(createMemoryPool());
  owner = await accounts.accountForIdentity("email", "owner@test.invalid", "Replay Owner");
  friend = await accounts.accountForIdentity("email", "friend@test.invalid", "Replay Friend");
  stranger = await accounts.accountForIdentity("email", "stranger@test.invalid", "Stranger");
  library = new ReplayLibrary(accounts);
  const friends = new FriendStore(accounts);
  await friends.request({ accountId: owner.id, displayName: friend.displayName });
  await friends.accept({ accountId: friend.id, otherId: owner.id });
});
afterEach(async () => {
  if (httpServer) {
    await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
    httpServer = undefined;
  }
  await accounts.close();
});

async function saveReplay() {
  const state = new GameState();
  state.players.push(
    Object.assign(new PlayerState(), { seat: 0, displayName: owner.displayName }),
    Object.assign(new PlayerState(), { seat: 1, displayName: friend.displayName }),
  );
  state.gameOver = true;
  state.winnerSeat = 0;
  const recording = new ReplayRecording(100);
  recording.capture(state, [], 200);
  const message = await replayDownload(recording.participantFile("casual", 0)!, 0);
  if (message.kind !== "ready") {
    throw new Error("Expected a completed replay");
  }
  const id = await library.record(owner.id, message);
  await library.attachDrive(owner.id, id, "privateDriveReplayFile");
  return { id, archive: Buffer.from(message.data, "base64"), matchId: message.summary.id };
}

describe("friends-only replay archives", () => {
  it("allows current friends and the owner while denying strangers and anonymous access", async () => {
    const { id, archive } = await saveReplay();
    expect(await library.setVisibility(owner.id, id, "friends")).toBeUndefined();
    expect(await library.friendFiles.save({ accountId: owner.id, replayId: id, archive })).toBe(true);
    expect(await library.accessible(owner.id, id)).toMatchObject({ owned: true, visibility: "friends" });
    expect(await library.accessible(friend.id, id)).toMatchObject({ owned: false, visibility: "friends" });
    expect(await library.accessible(stranger.id, id)).toBeUndefined();
    expect(await library.accessible(undefined, id)).toBeUndefined();
    expect(await library.listForFriend({ accountId: friend.id, friendId: owner.id })).toHaveLength(1);
    expect(await library.listForFriend({ accountId: stranger.id, friendId: owner.id })).toEqual([]);
    expect(await library.friendFiles.read(id)).toEqual(archive);
  });

  it("revokes access on blocking and removes the server copy when sharing becomes private", async () => {
    const { id, archive } = await saveReplay();
    await library.friendFiles.save({ accountId: owner.id, replayId: id, archive });
    await new BlockStore(accounts).block({ accountId: friend.id, otherId: owner.id });
    expect(await library.accessible(friend.id, id)).toBeUndefined();
    expect(await library.accessible(owner.id, id)).toBeDefined();
    await library.setVisibility(owner.id, id, "private");
    expect(await library.friendFiles.read(id)).toBeUndefined();
  });

  it("checks archive ownership and identity before storing bytes", async () => {
    const { id, archive } = await saveReplay();
    expect(await library.friendFiles.save({ accountId: friend.id, replayId: id, archive })).toBe(false);
    expect(
      await library.friendFiles.save({ accountId: owner.id, replayId: id, archive: Buffer.from("not a replay") }),
    ).toBe(false);
    const wrongMatch = gzipSync(
      JSON.stringify({ format: "aegis-replay", version: 1, id: "other-match", viewerSeat: 0 }),
    );
    expect(await library.friendFiles.save({ accountId: owner.id, replayId: id, archive: wrongMatch })).toBe(false);
    expect(await library.friendFiles.read(id)).toBeUndefined();
  });

  it("preserves the public replay behavior and keeps private entries out of friend lists", async () => {
    const { id } = await saveReplay();
    expect(await library.listForFriend({ accountId: friend.id, friendId: owner.id })).toEqual([]);
    await library.setVisibility(owner.id, id, "public");
    expect(await library.accessible(undefined, id)).toMatchObject({ visibility: "public" });
    expect(await library.listForFriend({ accountId: friend.id, friendId: owner.id })).toHaveLength(1);
  });

  it("cascades the protected copy when an owner deletes the replay index", async () => {
    const { id, archive } = await saveReplay();
    await library.friendFiles.save({ accountId: owner.id, replayId: id, archive });
    await library.remove(owner.id, id);
    expect(await library.friendFiles.read(id)).toBeUndefined();
  });
  it("streams the protected archive only through an authorized friends-only route", async () => {
    const { id, archive } = await saveReplay();
    const app = express();
    app.use(express.json());
    installReplayRoutes({
      app,
      library,
      session: async (req) => {
        const account = [owner, friend, stranger].find((actor) => actor.id === req.headers["x-test-account"]);
        return account ? { id: "session", account, expiresAt: Date.now() + 60_000 } : undefined;
      },
    });
    httpServer = createServer(app);
    await new Promise<void>((resolve) => httpServer!.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${(httpServer.address() as { port: number }).port}`;
    const path = `/account/replays/${id}/friends-file`;
    expect(
      (
        await fetch(base + path, {
          method: "PUT",
          headers: { "Content-Type": "application/octet-stream" },
          body: archive,
        })
      ).status,
    ).toBe(401);
    const upload = await fetch(base + path, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream", "x-test-account": owner.id },
      body: archive,
    });
    expect(upload.status).toBe(200);
    expect(await upload.json()).toMatchObject({ visibility: "friends" });
    expect((await fetch(`${base}/replays/${id}/file`)).status).toBe(404);
    expect((await fetch(`${base}/replays/${id}/file`, { headers: { "x-test-account": stranger.id } })).status).toBe(
      404,
    );
    const allowed = await fetch(`${base}/replays/${id}/file`, { headers: { "x-test-account": friend.id } });
    expect(allowed.status).toBe(200);
    expect(Buffer.from(await allowed.arrayBuffer())).toEqual(archive);
    await new BlockStore(accounts).block({ accountId: owner.id, otherId: friend.id });
    expect((await fetch(`${base}/replays/${id}/file`, { headers: { "x-test-account": friend.id } })).status).toBe(404);
  });

  it("rejects an archive that would exceed the account's storage limit", async () => {
    for (let index = 0; index < 4; index++) {
      const saved = await saveReplay();
      await accounts.pool.query(
        "INSERT INTO friend_replay_files (replay_id,account_id,archive,byte_size,created_at) VALUES ($1,$2,decode($3,'base64'),$4,1)",
        [saved.id, owner.id, saved.archive.toString("base64"), 32 * 1024 * 1024],
      );
    }
    const next = await saveReplay();
    expect(await library.friendFiles.save({ accountId: owner.id, replayId: next.id, archive: next.archive })).toBe(
      false,
    );
    expect(await library.accessible(owner.id, next.id)).toMatchObject({ visibility: "private" });
  });
});
