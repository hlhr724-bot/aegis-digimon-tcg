import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import type { ReplayDownloadMessage } from "@aegis/shared";
import { ReplayMarkerEmoji } from "@aegis/shared/replays/annotations/ReplayMarkerEmoji";
import { MAX_REPLAY_MARKERS_PER_MATCH } from "@aegis/shared/replays/annotations/replayAnnotationLimits";
import { AccountStore } from "#api/accounts/AccountStore";
import { createMemoryPool } from "#api/db/memoryPool.fixture";
import { ANNOTATION_GRACE_MS } from "#api/replays/annotations/ReplayAnnotationStore";
import { installReplayAnnotationRoutes } from "#api/replays/annotations/installReplayAnnotationRoutes";
import { ReplayLibrary } from "#api/replays/ReplayLibrary";

const FILE_ID = "1AbCdEfGhIjKlMnOp_-";
const accountsToClose: AccountStore[] = [];
const servers: Server[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  for (const accounts of accountsToClose.splice(0)) {
    await accounts.close();
  }
});

function buildMessage(matchId: string): Extract<ReplayDownloadMessage, { kind: "ready" }> {
  return {
    kind: "ready",
    data: Buffer.from("gzip bytes").toString("base64"),
    viewerSeat: 0,
    summary: {
      id: matchId,
      players: ["Agumon", "Gabumon"],
      mode: "casual",
      startedAt: 1,
      finishedAt: 2,
      winnerSeat: 0,
      frameCount: 2,
    },
  };
}

async function setup() {
  const accounts = new AccountStore(createMemoryPool());
  accountsToClose.push(accounts);
  const owner = await accounts.accountForIdentity("email", `${randomUUID()}@test.invalid`, "Owner");
  const viewer = await accounts.accountForIdentity("email", `${randomUUID()}@test.invalid`, "Viewer");
  const library = new ReplayLibrary(accounts, { apiKey: "test-key" });
  const matchId = randomUUID();
  const replayId = await library.record(owner.id, buildMessage(matchId));
  return { accounts, owner, viewer, library, matchId, replayId, store: library.annotations };
}

async function serve(accounts: AccountStore, library: ReplayLibrary) {
  const app = express();
  app.use(express.json());
  installReplayAnnotationRoutes({
    app,
    store: library.annotations,
    session: (req) => accounts.session(req.headers.cookie?.split("=")[1]),
  });
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return (path: string, init: RequestInit & { session?: string } = {}) =>
    fetch(base + path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init.session ? { Cookie: `aegis_session=${init.session}` } : {}),
      },
    });
}

describe("replay markers", () => {
  it("lets a participant mark a moment and keeps markers private to their author", async () => {
    const { owner, viewer, matchId, store } = await setup();
    const added = await store.addMarker({
      authorId: owner.id,
      matchId,
      frameIndex: 12,
      turn: 3,
      emoji: ReplayMarkerEmoji.MISTAKE.value,
    });
    expect(added).toMatchObject({ kind: "added", marker: { matchId, frameIndex: 12, turn: 3, emoji: "❌" } });
    expect((await store.list({ viewerId: owner.id, matchId })).markers).toHaveLength(1);
    expect(await store.list({ viewerId: viewer.id, matchId })).toEqual({ markers: [], canAnnotate: false });
    expect(await store.list({ viewerId: undefined, matchId })).toEqual({ markers: [], canAnnotate: false });
  });

  it("lets a viewer annotate a replay only while it is shared with them", async () => {
    const { owner, viewer, library, matchId, replayId, store } = await setup();
    expect(await store.canAnnotate({ accountId: owner.id, matchId })).toBe(true);
    expect(await store.canAnnotate({ accountId: viewer.id, matchId })).toBe(false);
    await library.attachDrive(owner.id, replayId, FILE_ID);
    await library.setVisibility(owner.id, replayId, "public");
    expect(await store.canAnnotate({ accountId: viewer.id, matchId })).toBe(true);
    await library.setVisibility(owner.id, replayId, "private");
    expect(await store.canAnnotate({ accountId: viewer.id, matchId })).toBe(false);
  });

  it("caps markers per author and match", async () => {
    const { owner, matchId, store } = await setup();
    for (let index = 0; index < MAX_REPLAY_MARKERS_PER_MATCH; index++) {
      await store.addMarker({ authorId: owner.id, matchId, frameIndex: index, turn: 1, emoji: "⭐" });
    }
    expect(await store.addMarker({ authorId: owner.id, matchId, frameIndex: 0, turn: 1, emoji: "⭐" })).toEqual({
      kind: "limit_reached",
    });
  });

  it("removes markers of matches without any indexed replay after the grace period", async () => {
    const { accounts, owner, matchId, store } = await setup();
    const orphan = randomUUID();
    await store.addMarker({ authorId: owner.id, matchId, frameIndex: 1, turn: 1, emoji: "⭐", now: 1 });
    await store.addMarker({ authorId: owner.id, matchId: orphan, frameIndex: 1, turn: 1, emoji: "⭐", now: 1 });
    expect(await store.cleanup(ANNOTATION_GRACE_MS)).toBe(0);
    expect(await store.cleanup(ANNOTATION_GRACE_MS + 2)).toBe(1);
    const left = await accounts.pool.query<{ match_id: string }>("SELECT match_id FROM replay_markers");
    expect(left.rows.map((row) => row.match_id)).toEqual([matchId]);
  });
});

describe("replay marker routes", () => {
  it("validates input, authorizes the author and deletes only their own markers", async () => {
    const { accounts, owner, viewer, library, matchId } = await setup();
    const call = await serve(accounts, library);
    const ownerSession = (await accounts.issueSession(owner)).id;
    const viewerSession = (await accounts.issueSession(viewer)).id;
    const post = (session: string | undefined, body: unknown, target = matchId) =>
      call(`/replay-annotations/${target}/markers`, { method: "POST", session, body: JSON.stringify(body) });
    const valid = { frameIndex: 4, turn: 2, emoji: ReplayMarkerEmoji.KEY_MOMENT.value };

    expect((await post(undefined, valid)).status).toBe(401);
    expect((await post(ownerSession, valid, "not-a-match")).status).toBe(404);
    for (const invalid of [
      { ...valid, frameIndex: -1 },
      { ...valid, frameIndex: 5000 },
      { ...valid, frameIndex: 1.5 },
      { ...valid, turn: "2" },
      { ...valid, emoji: "🤡" },
      { ...valid, emoji: "⭐⭐" },
    ]) {
      expect((await post(ownerSession, invalid)).status).toBe(400);
    }
    expect((await post(viewerSession, valid)).status).toBe(403);
    const created = await post(ownerSession, valid);
    expect(created.status).toBe(201);
    const marker = await created.json();
    expect(marker).toMatchObject({ matchId, frameIndex: 4, turn: 2, emoji: "⭐" });

    const anonymous = await call(`/replay-annotations/${matchId}`);
    expect(await anonymous.json()).toEqual({ markers: [], canAnnotate: false });
    const own = await call(`/replay-annotations/${matchId}`, { session: ownerSession });
    expect(own.headers.get("cache-control")).toContain("no-store");
    expect(await own.json()).toEqual({ markers: [marker], canAnnotate: true });

    const remove = (session: string) =>
      call(`/replay-annotations/${matchId}/markers/${marker.id}`, { method: "DELETE", session });
    expect((await remove(viewerSession)).status).toBe(404);
    expect((await remove(ownerSession)).status).toBe(200);
    expect((await remove(ownerSession)).status).toBe(404);
  });
});
