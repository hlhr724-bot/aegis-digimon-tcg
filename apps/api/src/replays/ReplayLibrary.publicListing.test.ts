import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReplayDownloadMessage } from "@aegis/shared";
import type { DeckFormat } from "@aegis/shared/deckFormat";
import type { PublicReplayPage } from "@aegis/shared/replays/PublicReplay";
import { AccountStore } from "#api/accounts/AccountStore";
import { createMemoryPool } from "#api/db/memoryPool.fixture";
import { ReplayLibrary, type ReplayIndexContext } from "#api/replays/ReplayLibrary";
import { installReplayRoutes } from "#api/replays/routes";

const FILE_ID = "1AbCdEfGhIjKlMnOp_-";

type ReadyMessage = Extract<ReplayDownloadMessage, { kind: "ready" }>;

type PublishParams = {
  library: ReplayLibrary;
  ownerId: string;
  context?: ReplayIndexContext;
  viewerSeat?: ReadyMessage["viewerSeat"];
};

function buildMessage(viewerSeat: ReadyMessage["viewerSeat"] = 0): ReadyMessage {
  return {
    kind: "ready",
    data: Buffer.from("server-authoritative gzip bytes").toString("base64"),
    viewerSeat,
    summary: {
      id: randomUUID(),
      players: ["Agumon", "Gabumon"],
      deckIcons: ["BT1-010", null],
      mode: "casual",
      startedAt: 1,
      finishedAt: 2,
      winnerSeat: 0,
      frameCount: 2,
    },
  };
}

const accountsToClose: AccountStore[] = [];
const servers: Server[] = [];
afterEach(async () => {
  vi.useRealTimers();
  for (const server of servers.splice(0)) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  for (const accounts of accountsToClose.splice(0)) {
    await accounts.close();
  }
});

async function setup(apiKey: string | undefined = "server-key") {
  const accounts = new AccountStore(createMemoryPool());
  accountsToClose.push(accounts);
  const owner = await accounts.accountForIdentity("email", `${randomUUID()}@test.invalid`, "Replay Owner");
  const opponent = await accounts.accountForIdentity("email", `${randomUUID()}@test.invalid`, "Opponent");
  const viewer = await accounts.accountForIdentity("email", `${randomUUID()}@test.invalid`, "Viewer");
  const library = new ReplayLibrary(accounts, { apiKey });
  return { accounts, owner, opponent, viewer, library };
}

async function saveReplay({ library, ownerId, context, viewerSeat = 0 }: PublishParams): Promise<string> {
  const id = await library.record(ownerId, buildMessage(viewerSeat), context);
  await library.attachDrive(ownerId, id, FILE_ID);
  return id;
}

async function publishReplay(params: PublishParams): Promise<string> {
  const id = await saveReplay(params);
  await params.library.setVisibility(params.ownerId, id, "public");
  return id;
}

function buildContext(playerAccountIds: ReplayIndexContext["playerAccountIds"], format: DeckFormat = "standard") {
  return { format, playerAccountIds };
}

async function listIds(library: ReplayLibrary, viewerId?: string): Promise<string[]> {
  return (await library.listPublic({ viewerId })).replays.map((replay) => replay.id);
}

async function serve(accounts: AccountStore, library: ReplayLibrary) {
  const app = express();
  app.use(express.json());
  installReplayRoutes({ app, library, session: (req) => accounts.session(req.headers.cookie?.split("=")[1]) });
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return (path: string, session?: string) =>
    fetch(base + path, session ? { headers: { Cookie: `aegis_session=${session}` } } : {});
}

describe("public replay listing", () => {
  it("lists only replays the owner made public and drops them when the owner changes visibility", async () => {
    const { owner, opponent, library } = await setup();
    const context = buildContext([owner.id, opponent.id]);
    const privateId = await saveReplay({ library, ownerId: owner.id, context });
    const publicId = await publishReplay({ library, ownerId: owner.id, context });
    await library.record(owner.id, buildMessage(), context);
    expect(await listIds(library)).toEqual([publicId]);
    const [listed] = (await library.listPublic()).replays;
    expect(listed).toMatchObject({
      id: publicId,
      viewerSeat: 0,
      format: "standard",
      summary: { players: ["Agumon", "Gabumon"], deckIcons: ["BT1-010", null] },
    });
    expect(listed).not.toHaveProperty("driveFileId");
    await library.setVisibility(owner.id, publicId, "private");
    expect(await listIds(library)).toEqual([]);
    await library.setVisibility(owner.id, publicId, "public");
    expect(await listIds(library)).toEqual([publicId]);
    await library.attachDrive(owner.id, publicId, "2ReplacedDriveFile_-");
    expect(await listIds(library)).toEqual([]);
    expect(await listIds(library)).not.toContain(privateId);
  });

  it("keeps friends-only replays out of the list", async () => {
    const { accounts, owner, opponent, library } = await setup();
    const id = await publishReplay({ library, ownerId: owner.id, context: buildContext([owner.id, opponent.id]) });
    await accounts.pool.query("UPDATE account_replays SET visibility='friends' WHERE id=$1", [id]);
    expect(await listIds(library)).toEqual([]);
  });

  it("does not list replays shared publicly before their players were recorded", async () => {
    const { owner, library } = await setup();
    await publishReplay({ library, ownerId: owner.id });
    expect(await listIds(library)).toEqual([]);
  });

  it("skips replays whose other player hides their identity or no longer has an account", async () => {
    const { accounts, owner, opponent, library } = await setup();
    const shown = await publishReplay({ library, ownerId: owner.id, context: buildContext([owner.id, null]) });
    const hidden = await publishReplay({ library, ownerId: owner.id, context: buildContext([owner.id, opponent.id]) });
    await publishReplay({ library, ownerId: owner.id, context: buildContext([owner.id, randomUUID()]) });
    expect(await listIds(library)).toContain(hidden);
    await accounts.updatePreferences(opponent.id, { hideIdentityFromSpectators: true });
    expect(await listIds(library)).toEqual([shown]);
    await accounts.updatePreferences(opponent.id, { hideIdentityFromSpectators: false });
    expect(await listIds(library)).toEqual(expect.arrayContaining([shown, hidden]));
  });

  it("applies identity privacy to both players of a spectator replay but not to the owner's own seat", async () => {
    const { accounts, owner, opponent, viewer, library } = await setup();
    const spectated = await publishReplay({
      library,
      ownerId: viewer.id,
      viewerSeat: -1,
      context: buildContext([owner.id, opponent.id]),
    });
    const ownSeat = await publishReplay({ library, ownerId: owner.id, context: buildContext([owner.id, null]) });
    await accounts.updatePreferences(owner.id, { hideIdentityFromSpectators: true });
    expect(await listIds(library)).toEqual([ownSeat]);
    await accounts.updatePreferences(owner.id, { hideIdentityFromSpectators: false });
    expect(await listIds(library)).toEqual(expect.arrayContaining([spectated, ownSeat]));
  });

  it("hides an owner's replays from viewers on either side of a block", async () => {
    const { accounts, owner, opponent, viewer, library } = await setup();
    const id = await publishReplay({ library, ownerId: owner.id, context: buildContext([owner.id, opponent.id]) });
    await accounts.pool.query("INSERT INTO account_blocks (blocker_id,blocked_id,created_at) VALUES ($1,$2,1)", [
      owner.id,
      viewer.id,
    ]);
    expect(await listIds(library, viewer.id)).toEqual([]);
    expect(await listIds(library, opponent.id)).toEqual([id]);
    expect(await listIds(library)).toEqual([id]);
    await accounts.pool.query("DELETE FROM account_blocks");
    await accounts.pool.query("INSERT INTO account_blocks (blocker_id,blocked_id,created_at) VALUES ($1,$2,1)", [
      viewer.id,
      owner.id,
    ]);
    expect(await listIds(library, viewer.id)).toEqual([]);
  });

  it("pages newest first with a stable cursor and filters by format", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { owner, opponent, library } = await setup();
    const ids: string[] = [];
    for (let index = 0; index < 5; index++) {
      vi.setSystemTime(1_000 + Math.min(index, 2));
      ids.push(
        await publishReplay({
          library,
          ownerId: owner.id,
          context: buildContext([owner.id, opponent.id], index % 2 === 0 ? "standard" : "BT15"),
        }),
      );
    }
    const expected = [...ids.slice(2).sort().reverse(), ...ids.slice(0, 2).reverse()];
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page: PublicReplayPage = await library.listPublic({ cursor, limit: 2 });
      seen.push(...page.replays.map((replay) => replay.id));
      cursor = page.nextCursor;
      pages++;
    } while (cursor);
    expect(pages).toBe(3);
    expect(seen).toEqual(expected);
    const filtered = await library.listPublic({ format: "BT15" });
    expect(filtered.replays.map((replay) => replay.id).sort()).toEqual([ids[1], ids[3]].sort());
    expect(filtered.replays.every((replay) => replay.format === "BT15")).toBe(true);
    expect((await library.listPublic({ limit: 500 })).replays).toHaveLength(5);
    await expect(library.listPublic({ cursor: "not-a-cursor" })).rejects.toMatchObject({ code: "invalid_cursor" });
  });

  it("lists nothing while the server cannot serve public replays", async () => {
    const { owner, opponent, library } = await setup(undefined);
    const id = await library.record(owner.id, buildMessage(), buildContext([owner.id, opponent.id]));
    await library.attachDrive(owner.id, id, FILE_ID);
    expect(await library.listPublic()).toEqual({ replays: [] });
  });

  it("serves the list without a session, validates the query and keeps responses uncached", async () => {
    const { accounts, owner, opponent, viewer, library } = await setup();
    const id = await publishReplay({ library, ownerId: owner.id, context: buildContext([owner.id, opponent.id]) });
    const call = await serve(accounts, library);
    const anonymous = await call("/replays/public");
    expect(anonymous.status).toBe(200);
    expect(anonymous.headers.get("cache-control")).toBe("private, no-store");
    expect(((await anonymous.json()) as PublicReplayPage).replays.map((replay) => replay.id)).toEqual([id]);
    expect((await call("/replays/public?format=nonsense")).status).toBe(400);
    expect((await call("/replays/public?cursor=not-a-cursor")).status).toBe(400);
    const filtered = (await (await call("/replays/public?format=BT15")).json()) as PublicReplayPage;
    expect(filtered.replays).toEqual([]);
    await accounts.pool.query("INSERT INTO account_blocks (blocker_id,blocked_id,created_at) VALUES ($1,$2,1)", [
      owner.id,
      viewer.id,
    ]);
    const session = (await accounts.issueSession(viewer)).id;
    const blocked = (await (await call("/replays/public", session)).json()) as PublicReplayPage;
    expect(blocked.replays).toEqual([]);
  });
});
