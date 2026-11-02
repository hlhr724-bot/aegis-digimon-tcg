import type { Express } from "express";
import { matchMaker } from "colyseus";
import { deckFormat } from "@aegis/shared/deckFormat";
import { matchBestOf } from "@aegis/shared/matchFormat";
import { MatchQueue } from "@aegis/shared/matchmaking/MatchQueue";
import {
  MATCH_QUEUE_COUNTS_PATH,
  type MatchQueueCount,
  type MatchQueueCounts,
} from "@aegis/shared/matchmaking/MatchQueueCounts";
import type { MatchQueueSelection } from "@aegis/shared/matchmaking/MatchQueueSelection";
import { MATCH_QUEUE_WAITING_LIMIT } from "@aegis/shared/matchmaking/MatchQueueWaitingPlayer";
import { getMatchQueueKey } from "@aegis/shared/matchmaking/getMatchQueueKey";
import { ROOM_TYPE, ROOM_TYPE_BETA, ROOM_TYPE_MANUAL, ROOM_TYPE_UNLIMITED } from "@aegis/shared/protocol/messages";
import type { RankedSearcherCount } from "#api/ranked/countRankedSearchers";

type Params = {
  app: Express;
  countRankedSearchers?: () => Promise<RankedSearcherCount[]>;
  now?: () => number;
};

type WaitingRoomListing = {
  name: string;
  locked?: boolean;
  private?: boolean;
  clients?: number;
  createdAt?: Date | string | number;
  metadata?: {
    format?: unknown;
    unlimited?: unknown;
    matchTimer?: unknown;
    bestOf?: unknown;
    allowRollback?: unknown;
  };
};

type WaitingSince = MatchQueueSelection & {
  waitingSince: number;
};

type MatchQueueSnapshot = {
  buckets: MatchQueueCount[];
  waiting: WaitingSince[];
};

const MATCH_QUEUE_COUNTS_CACHE_MILLISECONDS = 5_000;

const QUEUE_BY_ROOM_TYPE = new Map<string, MatchQueue>([
  [ROOM_TYPE, MatchQueue.CASUAL.value],
  [ROOM_TYPE_UNLIMITED, MatchQueue.UNLIMITED.value],
  [ROOM_TYPE_BETA, MatchQueue.BETA.value],
  [ROOM_TYPE_MANUAL, MatchQueue.MANUAL.value],
]);

function isWaitingForOpponent(listing: WaitingRoomListing): boolean {
  return listing.locked !== true && listing.private !== true && listing.clients === 1;
}

function getWaitingRoomSelection({ metadata = {} }: WaitingRoomListing, queue: MatchQueue): MatchQueueSelection {
  return {
    queue,
    format: deckFormat(metadata.format, metadata.unlimited === true),
    matchTimer: metadata.matchTimer === true,
    bestOf: matchBestOf(metadata.bestOf),
    allowRollback: metadata.allowRollback === true,
  };
}

function getCreatedAt({ createdAt }: WaitingRoomListing): number | undefined {
  if (createdAt === undefined) {
    return undefined;
  }
  const time = new Date(createdAt).getTime();
  return Number.isFinite(time) ? time : undefined;
}

function getRankedBucket({ format, searching }: RankedSearcherCount): MatchQueueCount {
  return {
    queue: MatchQueue.RANKED.value,
    format,
    matchTimer: true,
    bestOf: 1,
    allowRollback: false,
    searching,
  };
}

async function countRankedBuckets(countRankedSearchers: Params["countRankedSearchers"]): Promise<MatchQueueCount[]> {
  if (!countRankedSearchers) {
    return [];
  }
  try {
    return (await countRankedSearchers()).filter(({ searching }) => searching > 0).map(getRankedBucket);
  } catch {
    return [];
  }
}

async function readMatchQueues(countRankedSearchers: Params["countRankedSearchers"]): Promise<MatchQueueSnapshot> {
  const [listings, rankedBuckets] = await Promise.all([
    matchMaker.query({}) as Promise<WaitingRoomListing[]>,
    countRankedBuckets(countRankedSearchers),
  ]);
  const buckets = new Map<string, MatchQueueCount>();
  const waiting: WaitingSince[] = [];
  for (const listing of listings) {
    const queue = QUEUE_BY_ROOM_TYPE.get(listing.name);
    if (!queue || !isWaitingForOpponent(listing)) {
      continue;
    }
    const selection = getWaitingRoomSelection(listing, queue);
    const key = getMatchQueueKey(selection);
    const existing = buckets.get(key);
    buckets.set(key, { ...selection, searching: (existing?.searching ?? 0) + 1 });
    const waitingSince = getCreatedAt(listing);
    if (waitingSince !== undefined) {
      waiting.push({ ...selection, waitingSince });
    }
  }
  waiting.sort((first, second) => first.waitingSince - second.waitingSince);
  return { buckets: [...buckets.values(), ...rankedBuckets], waiting: waiting.slice(0, MATCH_QUEUE_WAITING_LIMIT) };
}

function toMatchQueueCounts({ buckets, waiting }: MatchQueueSnapshot, now: number): MatchQueueCounts {
  return {
    buckets,
    waiting: waiting.map(({ waitingSince, ...selection }) => ({
      ...selection,
      waitingSeconds: Math.max(0, Math.floor((now - waitingSince) / 1_000)),
    })),
  };
}

export function installMatchQueueRoutes({ app, countRankedSearchers, now = Date.now }: Params): void {
  let cached: { expiresAt: number; snapshot: Promise<MatchQueueSnapshot> } | undefined;
  function getSnapshot(): Promise<MatchQueueSnapshot> {
    if (cached && cached.expiresAt > now()) {
      return cached.snapshot;
    }
    const snapshot = readMatchQueues(countRankedSearchers);
    cached = { expiresAt: now() + MATCH_QUEUE_COUNTS_CACHE_MILLISECONDS, snapshot };
    snapshot.catch(() => {
      if (cached?.snapshot === snapshot) {
        cached = undefined;
      }
    });
    return snapshot;
  }
  app.get(MATCH_QUEUE_COUNTS_PATH, async (_req, res) => {
    try {
      res.json(toMatchQueueCounts(await getSnapshot(), now()));
    } catch {
      res.status(503).json({ error: "Queue counts are unavailable" });
    }
  });
}
