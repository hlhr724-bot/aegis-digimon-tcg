import { ROOM_TYPE_MANUAL, ROOM_TYPE_MANUAL_PRIVATE } from "@aegis/shared/protocol/messages";
import type { Express } from "express";
import { matchMaker } from "colyseus";
import { ROOM_TYPE, ROOM_TYPE_UNLIMITED, ROOM_TYPE_BETA, ROOM_TYPE_PRIVATE } from "@aegis/shared";
import {
  LIVE_MATCH_MAX_PAGE_SIZE,
  LIVE_MATCH_PAGE_SIZE,
  LIVE_MATCH_SPECTATOR_LIMIT,
  type LiveMatch,
  type LiveMatchPage,
} from "@aegis/shared/protocol/LiveMatch";
import { sortLiveMatches } from "@aegis/shared/protocol/sortLiveMatches";
import { roomCodeDirectory, type AegisRoom } from "./AegisRoom.js";

const LIVE_MATCH_ROOM_TYPES = new Set<string>([ROOM_TYPE, ROOM_TYPE_UNLIMITED, ROOM_TYPE_BETA, ROOM_TYPE_MANUAL]);
const LIVE_MATCH_CACHE_MILLISECONDS = 5_000;
const LIVE_MATCH_MAX_OFFSET = 10_000;

async function queryLiveMatches(): Promise<LiveMatch[]> {
  const listings = await matchMaker.query({});
  return sortLiveMatches(
    listings
      .filter((listing) => LIVE_MATCH_ROOM_TYPES.has(listing.name))
      .map((listing) => (listing.metadata as { live?: LiveMatch } | undefined)?.live)
      .filter((live): live is LiveMatch => live !== undefined && live.spectators < LIVE_MATCH_SPECTATOR_LIMIT),
  );
}

function cachedLiveMatches(now: () => number): () => Promise<LiveMatch[]> {
  let cached: { expiresAt: number; matches: Promise<LiveMatch[]> } | undefined;
  return () => {
    if (cached && cached.expiresAt > now()) return cached.matches;
    const matches = queryLiveMatches();
    cached = { expiresAt: now() + LIVE_MATCH_CACHE_MILLISECONDS, matches };
    matches.catch(() => {
      if (cached?.matches === matches) cached = undefined;
    });
    return matches;
  };
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number): number | undefined {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^\d{1,6}$/.test(value)) return undefined;
  const parsed = Number(value);
  return parsed >= minimum && parsed <= maximum ? parsed : undefined;
}

/** Code-only observer reservations; active matches remain locked to player matchmaking. */
export function installSpectatorRoutes(app: Express, { now = Date.now }: { now?: () => number } = {}): void {
  const liveMatches = cachedLiveMatches(now);
  app.get("/spectate/live", async (req, res) => {
    const offset = boundedInteger(req.query.offset, 0, 0, LIVE_MATCH_MAX_OFFSET);
    const limit = boundedInteger(req.query.limit, LIVE_MATCH_PAGE_SIZE, 1, LIVE_MATCH_MAX_PAGE_SIZE);
    if (offset === undefined || limit === undefined) {
      res
        .status(400)
        .json({ error: `offset must be 0-${LIVE_MATCH_MAX_OFFSET} and limit 1-${LIVE_MATCH_MAX_PAGE_SIZE}` });
      return;
    }
    try {
      const matches = await liveMatches();
      const page: LiveMatchPage = { matches: matches.slice(offset, offset + limit), total: matches.length };
      res.json(page);
    } catch {
      res.status(503).json({ error: "Live matches are unavailable" });
    }
  });

  app.post("/spectate/join", async (req, res) => {
    const { roomCode, displayName, authTicket } = req.body ?? {};
    if (typeof roomCode !== "string" || !/^[A-Z2-9]{6}$/i.test(roomCode)) {
      res.status(400).json({ error: "A six-character roomCode is required" });
      return;
    }
    const code = roomCode.toUpperCase();
    const roomId = await roomCodeDirectory().resolve(code);
    const [listing] = roomId ? await matchMaker.query({ roomId }) : [];
    if (
      !listing ||
      !new Set<string>([
        ROOM_TYPE,
        ROOM_TYPE_UNLIMITED,
        ROOM_TYPE_BETA,
        ROOM_TYPE_PRIVATE,
        ROOM_TYPE_MANUAL,
        ROOM_TYPE_MANUAL_PRIVATE,
      ]).has(listing.name)
    ) {
      res.status(404).json({ error: "Match is not available to spectators" });
      return;
    }
    try {
      const info = await matchMaker.remoteRoomCall<AegisRoom, "spectatorInfo">(listing.roomId, "spectatorInfo", [code]);
      if (!info) {
        res.status(404).json({ error: "Match is not available to spectators" });
        return;
      }
      // reserveSeatFor intentionally bypasses the matchmaking lock. onAuth and onJoin
      // still verify role, code, match lifecycle and observer capacity on the owning process.
      const reservation = await matchMaker.reserveSeatFor(listing, {
        spectator: true,
        ...(typeof authTicket === "string" ? { authTicket } : {}),
        roomCode: code,
        // Only shown in chat, and the room cleans it up before anyone sees it.
        displayName: typeof displayName === "string" ? displayName.slice(0, 200) : "",
        deck: { mainDeck: [], eggDeck: [] },
      });
      res.json(reservation);
    } catch {
      res.status(409).json({ error: "Match is no longer available; refresh and try again" });
    }
  });
}
