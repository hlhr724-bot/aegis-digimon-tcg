import type { ReplayViewerSeat } from "@aegis/shared/replays/ReplayViewerSeat";
import type { ReplaySummary } from "@aegis/shared";
import type { ReadyReplay } from "./files";

/** A finished match's replay kept in this browser, whether or not it also reached Google Drive. */
export interface LocalReplay {
  /** `matchId:viewerSeat`: one copy per seat, like the Drive files. */
  key: string;
  matchId: string;
  viewerSeat: ReplayViewerSeat;
  /** The account library entry, for a signed-in player. */
  indexId?: string;
  summary: ReplaySummary;
  /** The gzip file as base64, exactly as the server sent it. */
  data: string;
  savedAt: number;
  /** Set once the same file is in the player's Google Drive. */
  driveFileId?: string;
}

/** Matches the account's kept history, so every listed match can still have its replay. */
export const LOCAL_REPLAY_LIMIT = 100;

const DATABASE = "aegis-replays";
const STORE = "replays";

export class LocalReplayUnavailable extends Error {}

let database: Promise<IDBDatabase> | undefined;
const listeners = new Set<() => void>();

function open(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new LocalReplayUnavailable());
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE, { keyPath: "key" });
      store.createIndex("matchId", "matchId");
      store.createIndex("indexId", "indexId");
      store.createIndex("savedAt", "savedAt");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new LocalReplayUnavailable(request.error?.message));
    request.onblocked = () => reject(new LocalReplayUnavailable("blocked"));
  }).catch((error: unknown) => {
    database = undefined;
    throw error;
  });
  return database;
}

function settle<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new LocalReplayUnavailable("aborted"));
  });
}

function notify() {
  for (const listener of listeners) listener();
}

export function localReplayKey(replay: Pick<ReadyReplay, "summary" | "viewerSeat">): string {
  return `${replay.summary.id}:${replay.viewerSeat}`;
}

/** Keeps the replay, then drops the oldest copies past the limit. Saving the same match again keeps its Drive link. */
export async function saveLocalReplay(replay: ReadyReplay): Promise<LocalReplay> {
  const db = await open();
  const key = localReplayKey(replay);
  const existing = await settle<LocalReplay | undefined>(db.transaction(STORE).objectStore(STORE).get(key));
  const entry: LocalReplay = {
    key,
    matchId: replay.summary.id,
    viewerSeat: replay.viewerSeat,
    ...((replay.indexId ?? existing?.indexId) ? { indexId: replay.indexId ?? existing?.indexId } : {}),
    summary: replay.summary,
    data: replay.data,
    savedAt: existing?.savedAt ?? Date.now(),
    ...(existing?.driveFileId ? { driveFileId: existing.driveFileId } : {}),
  };
  const transaction = db.transaction(STORE, "readwrite");
  const store = transaction.objectStore(STORE);
  store.put(entry);
  // Requests queue inside the success callback, while the transaction is certainly still active.
  const keys = store.index("savedAt").getAllKeys();
  keys.onsuccess = () => {
    // Oldest first; the entry just written is the newest or keeps its place.
    for (const stale of keys.result.slice(0, Math.max(0, keys.result.length - LOCAL_REPLAY_LIMIT))) store.delete(stale);
  };
  await done(transaction);
  notify();
  return entry;
}

export async function markLocalReplaySynced(replay: ReadyReplay, driveFileId: string): Promise<void> {
  const db = await open();
  const transaction = db.transaction(STORE, "readwrite");
  const store = transaction.objectStore(STORE);
  const request = store.get(localReplayKey(replay)) as IDBRequest<LocalReplay | undefined>;
  request.onsuccess = () => {
    const entry = request.result;
    if (entry) store.put({ ...entry, driveFileId, ...(replay.indexId ? { indexId: replay.indexId } : {}) });
  };
  await done(transaction);
  notify();
}

const keeping = new Map<string, Promise<LocalReplay>>();

/** Saves once per match and seat for this page; every caller shares the same result. */
export function keepLocalReplay(replay: ReadyReplay): Promise<LocalReplay> {
  const key = localReplayKey(replay);
  let pending = keeping.get(key);
  if (!pending) {
    pending = saveLocalReplay(replay);
    keeping.set(key, pending);
    pending.catch(() => keeping.delete(key));
  }
  return pending;
}

/** Finds a copy by match id or by the account library id, the two ids a replay link can carry. */
export async function findLocalReplay(id: string): Promise<LocalReplay | undefined> {
  const db = await open().catch(() => undefined);
  if (!db) return undefined;
  const store = db.transaction(STORE).objectStore(STORE);
  return (
    (await settle<LocalReplay | undefined>(store.index("matchId").get(id))) ??
    (await settle<LocalReplay | undefined>(store.index("indexId").get(id)))
  );
}

/** Every copy on this device, keyed by match id. */
export async function localReplaysByMatch(): Promise<Map<string, LocalReplay>> {
  const db = await open().catch(() => undefined);
  if (!db) return new Map();
  const entries = await settle<LocalReplay[]>(db.transaction(STORE).objectStore(STORE).getAll());
  return new Map(entries.map((entry) => [entry.matchId, entry]));
}

/** Copies on this device that never reached Google Drive, oldest first. */
export async function unsyncedLocalReplays(): Promise<LocalReplay[]> {
  const db = await open();
  const entries = await settle<LocalReplay[]>(db.transaction(STORE).objectStore(STORE).index("savedAt").getAll());
  return entries.filter((entry) => !entry.driveFileId);
}

export function localReplayFile(entry: LocalReplay): ReadyReplay {
  return {
    kind: "ready",
    summary: entry.summary,
    viewerSeat: entry.viewerSeat,
    data: entry.data,
    ...(entry.indexId ? { indexId: entry.indexId } : {}),
  };
}

export function subscribeLocalReplays(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
