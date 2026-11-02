import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_REPLAY_BYTES, type ReplayDownloadMessage, type ReplayLibraryPage } from "@aegis/shared";
import { AccountStore } from "../accounts/AccountStore.js";
import { createMemoryPool } from "../db/memoryPool.fixture.js";
import { ReplayLibrary, UNSAVED_RETENTION_MS } from "./ReplayLibrary.js";
import { installReplayRoutes } from "./routes.js";

const FILE_ID = "1AbCdEfGhIjKlMnOp_-";

function message(id = randomUUID(), viewerSeat: 0 | 1 = 0): Extract<ReplayDownloadMessage, { kind: "ready" }> {
  return {
    kind: "ready",
    data: Buffer.from("server-authoritative gzip bytes").toString("base64"),
    viewerSeat,
    summary: {
      id,
      players: ["Agumon", "Gabumon"],
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
  for (const server of servers.splice(0)) await new Promise<void>((resolve) => server.close(() => resolve()));
  for (const accounts of accountsToClose.splice(0)) await accounts.close();
});
async function setup(drive: ConstructorParameters<typeof ReplayLibrary>[1] = {}) {
  const accounts = new AccountStore(createMemoryPool());
  accountsToClose.push(accounts);
  const owner = await accounts.accountForIdentity("email", `${randomUUID()}@test.invalid`, "Replay Player");
  const other = await accounts.accountForIdentity("email", `${randomUUID()}@test.invalid`, "Other Player");
  const library = new ReplayLibrary(accounts, drive);
  return { accounts, owner, other, library };
}
async function serve(accounts: AccountStore, library: ReplayLibrary) {
  const app = express();
  app.use(express.json());
  installReplayRoutes({ app, library, session: (req) => accounts.session(req.headers.cookie?.split("=")[1]) });
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
async function savedReplay(library: ReplayLibrary, accountId: string, fileId = FILE_ID) {
  const id = await library.record(accountId, message());
  return (await library.attachDrive(accountId, id, fileId))!;
}

describe("server-trusted replay index", () => {
  it("records one unsaved row per account, match and seat and keeps it out of the library", async () => {
    const { accounts, owner, library } = await setup();
    const file = message();
    const id = await library.record(owner.id, file);
    expect(await library.record(owner.id, file)).toBe(id);
    expect(await library.record(owner.id, { ...file, viewerSeat: 1 })).not.toBe(id);
    const rows = await accounts.pool.query("SELECT * FROM account_replays WHERE account_id=$1", [owner.id]);
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows[0]).toMatchObject({ drive_file_id: null, saved_at: null, visibility: "private" });
    expect(Number(rows.rows[0].byte_size)).toBe(Buffer.from(file.data, "base64").length);
    expect((await library.list(owner.id)).replays).toEqual([]);
  });

  it("attaches a Drive file idempotently and only for the owner", async () => {
    const { owner, other, library } = await setup();
    const file = message();
    const id = await library.record(owner.id, file);
    expect(await library.attachDrive(other.id, id, FILE_ID)).toBeUndefined();
    const first = await library.attachDrive(owner.id, id, FILE_ID);
    expect(first).toMatchObject({ id, matchId: file.summary.id, driveFileId: FILE_ID, visibility: "private" });
    expect(first!.summary).toEqual(file.summary);
    await library.setVisibility(owner.id, id, "public");
    const again = await library.attachDrive(owner.id, id, FILE_ID);
    expect(again).toEqual({ ...first, visibility: "public" });
    const replaced = await library.attachDrive(owner.id, id, "2ZyXwVuTsRqPoNmLk_-");
    expect(replaced).toMatchObject({ driveFileId: "2ZyXwVuTsRqPoNmLk_-", savedAt: first!.savedAt });
    expect(replaced!.visibility).toBe("private");
    expect((await library.list(owner.id)).replays).toHaveLength(1);
  });

  it("pages saved replays newest first with a stable keyset cursor", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { owner, other, library } = await setup();
    const ids: string[] = [];
    for (let index = 0; index < 7; index++) {
      // Four replays share one timestamp, so the id breaks the tie.
      vi.setSystemTime(1_000 + Math.min(index, 3));
      ids.push((await savedReplay(library, owner.id)).id);
    }
    await savedReplay(library, other.id);
    await library.record(owner.id, message());
    const expected = [...ids.slice(3).sort().reverse(), ...ids.slice(0, 3).reverse()];
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page: ReplayLibraryPage = await library.list(owner.id, { cursor, limit: 2 });
      seen.push(...page.replays.map((replay) => replay.id));
      cursor = page.nextCursor;
      pages++;
    } while (cursor);
    expect(pages).toBe(4);
    expect(seen).toEqual(expected);
    expect((await library.list(owner.id)).replays).toHaveLength(7);
    expect((await library.list(owner.id, { limit: 500 })).replays).toHaveLength(7);
    expect((await library.list(owner.id, { limit: 0 })).replays).toHaveLength(1);
    await expect(library.list(owner.id, { cursor: "not-a-cursor" })).rejects.toMatchObject({
      code: "invalid_cursor",
    });
  });

  it("deletes only the caller's index entry", async () => {
    const { owner, other, library } = await setup();
    const replay = await savedReplay(library, owner.id);
    expect(await library.remove(other.id, replay.id)).toBe(false);
    expect(await library.remove(owner.id, replay.id)).toBe(true);
    expect((await library.list(owner.id)).replays).toEqual([]);
    expect(await library.remove(owner.id, replay.id)).toBe(false);
  });

  it("removes unsaved entries after seven days and never saved ones", async () => {
    const { accounts, owner, library } = await setup();
    const kept = await savedReplay(library, owner.id);
    await library.record(owner.id, message());
    expect(await library.cleanup(Date.now() + UNSAVED_RETENTION_MS - 60_000)).toBe(0);
    expect(await library.cleanup(Date.now() + UNSAVED_RETENTION_MS + 60_000)).toBe(1);
    const rows = await accounts.pool.query("SELECT id FROM account_replays");
    expect(rows.rows.map((row) => row.id)).toEqual([kept.id]);
  });

  it("joins saved replays to the profile's matches", async () => {
    const { owner, other, library } = await setup();
    const replay = await savedReplay(library, owner.id);
    await savedReplay(library, other.id);
    const unsaved = message();
    await library.record(owner.id, unsaved);
    expect(await library.forMatches(owner.id, [replay.matchId, unsaved.summary.id, "missing"])).toEqual([replay]);
    expect(await library.forMatches(owner.id, [])).toEqual([]);
  });
});

describe("replay routes", () => {
  it("requires a session and validates ids and Drive file ids", async () => {
    const { accounts, owner, other, library } = await setup();
    const id = await library.record(owner.id, message());
    const ownerSession = (await accounts.issueSession(owner)).id;
    const otherSession = (await accounts.issueSession(other)).id;
    const call = await serve(accounts, library);
    for (const [path, method] of [
      ["/account/replays", "GET"],
      [`/account/replays/${id}/drive`, "PUT"],
      [`/account/replays/${id}/visibility`, "PUT"],
      [`/account/replays/${id}`, "DELETE"],
    ] as const)
      expect((await call(path, { method })).status).toBe(401);
    const attach = (session: string, fileId: unknown, target = id) =>
      call(`/account/replays/${target}/drive`, { method: "PUT", session, body: JSON.stringify({ fileId }) });
    for (const invalid of ["short", "a/b/c/d/e/f/g", "x".repeat(201), 42, undefined])
      expect((await attach(ownerSession, invalid)).status).toBe(400);
    expect((await attach(ownerSession, FILE_ID, "not-a-uuid")).status).toBe(404);
    expect((await attach(otherSession, FILE_ID)).status).toBe(404);
    const first = await attach(ownerSession, FILE_ID);
    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toContain("no-store");
    const saved = await first.json();
    expect(await (await attach(ownerSession, FILE_ID)).json()).toEqual(saved);
    const list = await call("/account/replays", { session: ownerSession });
    expect(await list.json()).toEqual({ replays: [saved], sharing: false, friendsSharing: true });
    expect((await call("/account/replays?cursor=%%", { session: ownerSession })).status).toBe(400);
    expect(await (await call("/account/replays", { session: otherSession })).json()).toEqual({
      replays: [],
      sharing: false,
      friendsSharing: true,
    });
    expect((await call(`/account/replays/${id}`, { method: "DELETE", session: otherSession })).status).toBe(404);
    expect((await call(`/account/replays/${id}`, { method: "DELETE", session: ownerSession })).status).toBe(200);
    expect((await call(`/account/replays/${id}`, { method: "DELETE", session: ownerSession })).status).toBe(404);
  });

  it("follows nextCursor through the HTTP API", async () => {
    const { accounts, owner, library } = await setup();
    for (let index = 0; index < 5; index++) await savedReplay(library, owner.id);
    const session = (await accounts.issueSession(owner)).id;
    const call = await serve(accounts, library);
    const first = (await (await call("/account/replays?limit=3", { session })).json()) as ReplayLibraryPage;
    expect(first.replays).toHaveLength(3);
    const second = (await (
      await call(`/account/replays?limit=3&cursor=${encodeURIComponent(first.nextCursor!)}`, { session })
    ).json()) as ReplayLibraryPage;
    expect(second.replays).toHaveLength(2);
    expect(second.nextCursor).toBeUndefined();
    expect(new Set([...first.replays, ...second.replays].map((replay) => replay.id)).size).toBe(5);
  });
});

describe("public replay sharing through Drive", () => {
  const archive = Buffer.concat([Buffer.from([0x1f, 0x8b]), Buffer.from("public gzip archive")]);
  function driveFetch(response: () => Response) {
    return vi.fn<typeof fetch>(async () => response());
  }

  it("lets only the owner change visibility and reports sharing as enabled", async () => {
    const drive = driveFetch(() => new Response(archive));
    const { accounts, owner, other, library } = await setup({ apiKey: "server-key", fetch: drive });
    const replay = await savedReplay(library, owner.id);
    const unsaved = await library.record(owner.id, message());
    const ownerSession = (await accounts.issueSession(owner)).id;
    const otherSession = (await accounts.issueSession(other)).id;
    const call = await serve(accounts, library);
    const update = (session: string, visibility: string, id = replay.id) =>
      call(`/account/replays/${id}/visibility`, { method: "PUT", session, body: JSON.stringify({ visibility }) });
    expect((await update(otherSession, "public")).status).toBe(404);
    expect((await update(ownerSession, "invalid")).status).toBe(400);
    expect((await update(ownerSession, "public", unsaved)).status).toBe(404);
    expect((await call(`/replays/${replay.id}`)).status).toBe(404);
    expect((await call(`/replays/${replay.id}/file`)).status).toBe(404);
    expect(drive).not.toHaveBeenCalled();
    expect(await (await call(`/replays/${replay.id}`, { session: ownerSession })).json()).toMatchObject({
      id: replay.id,
      owned: true,
    });
    expect((await update(ownerSession, "public")).status).toBe(200);
    expect(await (await call("/account/replays", { session: ownerSession })).json()).toMatchObject({ sharing: true });
    expect(await (await call(`/replays/${replay.id}`, { session: otherSession })).json()).toMatchObject({
      id: replay.id,
      owned: false,
      visibility: "public",
    });
    const file = await call(`/replays/${replay.id}/file`);
    expect(file.status).toBe(200);
    expect(Buffer.from(await file.arrayBuffer())).toEqual(archive);
    expect(file.headers.get("cache-control")).toBe("private, no-store");
    expect(file.headers.get("x-content-type-options")).toBe("nosniff");
    expect(file.headers.get("content-disposition")).toContain("attachment");
    expect(drive.mock.calls[0]![0]).toBe(
      `https://www.googleapis.com/drive/v3/files/${FILE_ID}?alt=media&key=server-key`,
    );
    expect((await update(ownerSession, "private")).status).toBe(200);
    expect((await call(`/replays/${replay.id}`)).status).toBe(404);
    expect((await call(`/replays/${replay.id}/file`)).status).toBe(404);
  });

  it("maps Drive failures, oversized files and a missing key", async () => {
    let next = () => new Response(archive);
    const drive = vi.fn<typeof fetch>(async () => next());
    const { accounts, owner, library } = await setup({ apiKey: "server-key", fetch: drive });
    const replay = await savedReplay(library, owner.id);
    await library.setVisibility(owner.id, replay.id, "public");
    const call = await serve(accounts, library);
    const file = () => call(`/replays/${replay.id}/file`);
    next = () => new Response("missing", { status: 404 });
    expect((await file()).status).toBe(404);
    next = () => new Response("forbidden", { status: 403 });
    expect((await file()).status).toBe(404);
    next = () => new Response("unavailable", { status: 500 });
    expect((await file()).status).toBe(502);
    next = () => new Response("<html>not a replay</html>");
    expect(await (await file()).json()).toEqual({ error: "drive_unavailable" });
    next = () => new Response(archive, { headers: { "Content-Length": String(MAX_REPLAY_BYTES + 1) } });
    expect(await (await file()).json()).toEqual({ error: "too_large" });
    next = () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(MAX_REPLAY_BYTES));
            controller.enqueue(new Uint8Array(1));
            controller.close();
          },
        }),
      );
    expect((await file()).status).toBe(502);

    const keyless = new ReplayLibrary(accounts, { fetch: drive });
    const calls = drive.mock.calls.length;
    const disabled = await serve(accounts, keyless);
    const response = await disabled(`/replays/${replay.id}/file`);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "sharing_disabled" });
    expect(drive.mock.calls.length).toBe(calls);
    const session = (await accounts.issueSession(owner)).id;
    const publish = await disabled(`/account/replays/${replay.id}/visibility`, {
      method: "PUT",
      session,
      body: JSON.stringify({ visibility: "public" }),
    });
    expect(publish.status).toBe(503);
  });

  it("refuses a file whose replay turned private during the Drive download", async () => {
    let library!: ReplayLibrary;
    let owner!: { id: string };
    let replayId = "";
    const drive = vi.fn<typeof fetch>(async () => {
      await library.setVisibility(owner.id, replayId, "private");
      return new Response(archive);
    });
    ({ library, owner } = await setup({ apiKey: "server-key", fetch: drive }));
    replayId = (await savedReplay(library, owner.id)).id;
    await library.setVisibility(owner.id, replayId, "public");
    expect(await library.publicFile(replayId)).toBeUndefined();
    expect(drive).toHaveBeenCalledOnce();
  });
});
