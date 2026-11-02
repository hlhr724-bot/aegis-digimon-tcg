import type { TournamentBanlistCard } from "@aegis/shared/tournaments/index";
import { GameMode } from "@aegis/shared/manual/GameMode";
import { serializeScenarioFixture } from "../../engine/scenario/serialize.js";
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";
import type { DeckFormat, Intent, Seat } from "@aegis/shared";
import type { ScenarioFixture } from "../../engine/scenario/types.js";
import { REPLAY_LINE_NAMES } from "#api/replays/inputs/replayLineNames";
import {
  REPLAY_FORMAT,
  type ReplayDeck,
  type ReplayDeckRules,
  type ReplayInput,
  type ReplayRecord,
  type ReplaySeat,
  type ReplaySite,
} from "./types.js";

/** The room's JSONL log segments (`localLogWriter.ts`). */
const SEGMENT = /^api-.*\.jsonl$/;

/**
 * The fields each intent type defines (`packages/shared/src/protocol/intents.ts`). The room builds an
 * intent by spreading the client's payload, so a client can add fields the engine never reads; a
 * replay outlives the logs, so it keeps only these. Typed against `Intent` so a renamed or removed
 * field fails to compile; a NEW field must be added here or replays will drop it (the round-trip
 * tests then diverge).
 */
const INTENT_FIELDS: { [T in Intent["type"]]: readonly Exclude<keyof Extract<Intent, { type: T }>, "type">[] } = {
  manual: ["requestId", "revision", "command"],
  ready: [],
  mulligan: ["keep"],
  playCard: ["instanceId", "useAs", "targetSlot", "digiXros", "assembly"],
  appFusion: ["permanentId", "instanceId", "linkedInstanceId"],
  digivolve: [
    "permanentId",
    "instanceId",
    "useAlternateCost",
    "appFusionLinkedInstanceId",
    "alternateRequirementIndex",
    "useBlastDigivolve",
    "appFusionLinkInstanceId",
  ],
  hatchEgg: [],
  moveFromBreeding: ["permanentId"],
  activateEffect: ["sourceInstanceId", "effectKey"],
  linkCard: ["instanceId", "targetPermanentId"],
  dnaDigivolve: ["materialPermanentIds", "instanceId", "useBlastDigivolve"],
  endPhase: [],
  attack: ["attackerPermanentId", "target", "vortex"],
  declareBlock: ["blockerPermanentId"],
  declineBlock: [],
  respondCounter: ["sourceInstanceId", "effectKey"],
  respondAlliance: ["allyPermanentId"],
  respondEvade: ["permanentId", "accept"],
  respondBarrier: ["permanentId", "accept"],
  respondDecision: ["decisionId", "response"],
  surrender: [],
};

/** Keep only the fields the intent's type defines; an unknown type keeps only its `type`. */
export function sanitizeIntent(intent: { type: string } & Record<string, unknown>): Intent {
  const fields: readonly string[] = Object.hasOwn(INTENT_FIELDS, intent.type)
    ? INTENT_FIELDS[intent.type as Intent["type"]]
    : [];
  const kept: Record<string, unknown> = { type: intent.type };
  for (const field of fields) if (intent[field] !== undefined) kept[field] = structuredClone(intent[field]);
  return kept as Intent;
}

/** Thrown when the logs of a match cannot be turned into a complete replay. */
export class ReplayExtractionError extends Error {
  override name = "ReplayExtractionError";
}

/** A log line the extractor uses, reduced to its name, ordinal and payload. */
interface Entry {
  name: string;
  replaySeq: number;
  payload: Record<string, unknown>;
  /** Position in the input, which breaks ties and orders lines that lack an ordinal. */
  position: number;
}

const SITES = new Set<string>([
  "beforeTurn",
  "bothReady",
  "batchClose",
  "decisionRequest",
  "matchStarted",
  "afterIntent",
]);
const ROOM_INPUT_KINDS = new Set([
  "startMatch",
  "startDevScenario",
  "startScenarioFixture",
  "disconnect",
  "reconnect",
  "clearReady",
  "expireRankedRound",
  "expireMatchTimer",
  "expireMulliganWindow",
  "expireCombatWindow",
]);

/**
 * Build the replay of one match from JSONL log lines (any order of segments; any amount of other
 * matches' lines). Malformed and truncated lines are skipped, as `tools/match-logs.mjs` does.
 *
 * Throws {@link ReplayExtractionError} when the match has no `replay.header` (no seed), or when
 * either seat was never given a deck.
 */
export function extractReplay(lines: Iterable<string>, matchId: string): ReplayRecord {
  const entries: Entry[] = [];
  let position = 0;
  for (const line of lines) {
    const entry = parseEntry(line, matchId, position++);
    if (entry) entries.push(entry);
  }
  return buildRecord(entries, matchId);
}

/** {@link extractReplay} over every `api-*.jsonl` segment in `dir`. */
export interface ExtractFromLogDirOptions {
  /** Stops reading as soon as it aborts; the promise then rejects with the abort reason. */
  signal?: AbortSignal;
  /** Skips segments last written before this time (ms since epoch), e.g. the 12h log retention. */
  modifiedAfter?: number;
}

/**
 * Streams every `api-*.jsonl` segment in `dir`, keeps only the lines that name the match, and builds
 * the record from them. Memory is bounded by that one match's own lines. Segment names do not sort
 * chronologically, so order comes from each line's `replaySeq`, not from the files.
 */
export async function extractReplayFromLogDir(
  dir: string,
  matchId: string,
  options: ExtractFromLogDirOptions = {},
): Promise<ReplayRecord> {
  const { signal, modifiedAfter = 0 } = options;
  const names = (await readdir(dir)).filter((name) => SEGMENT.test(name)).sort();
  const lines: string[] = [];
  for (const name of names) {
    signal?.throwIfAborted();
    const path = join(dir, name);
    const info = await stat(path).catch(() => undefined); // pruned since the listing
    if (!info?.isFile() || info.mtimeMs < modifiedAfter) continue;
    const input = createReadStream(path, signal ? { signal } : {});
    const reader = createInterface({ input, crlfDelay: Infinity });
    try {
      for await (const line of reader) {
        if (signal?.aborted) break;
        if (line.includes(matchId)) lines.push(line);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException | undefined)?.code !== "ENOENT") throw error; // pruned mid-read
    } finally {
      reader.close();
      input.destroy();
    }
  }
  signal?.throwIfAborted();
  if (lines.length === 0) throw new ReplayExtractionError(`No log lines for match ${matchId}`);
  return extractReplay(lines, matchId);
}

function parseEntry(line: string, matchId: string, position: number): Entry | undefined {
  // Cheap prefilter: most lines belong to other matches or are not replay lines at all.
  if (!line.includes(matchId)) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return undefined; // an interrupted final write
  }
  if (!isObject(parsed) || parsed.matchId !== matchId || !Array.isArray(parsed.data)) return undefined;
  const [name, payload] = parsed.data as unknown[];
  if (typeof name !== "string" || !REPLAY_LINE_NAMES.has(name) || !isObject(payload)) return undefined;
  const replaySeq = payload.replaySeq;
  // Lines written before the replay format existed carry no ordinal and cannot be ordered safely.
  if (typeof replaySeq !== "number") return undefined;
  return { name, replaySeq, payload, position };
}

function buildRecord(entries: Entry[], matchId: string): ReplayRecord {
  entries.sort((a, b) => a.replaySeq - b.replaySeq || a.position - b.position);
  const header = entries.find((entry) => entry.name === "replay.header")?.payload;
  if (!header || typeof header.seed !== "number")
    throw new ReplayExtractionError(
      `No replay.header with a seed for match ${matchId}: the match predates replay recording, or its logs were pruned.`,
    );

  const results = new Map<number, Record<string, unknown>>();
  const failures = new Set<number>();
  for (const entry of entries) {
    if (entry.name === "intent.result") results.set(entry.replaySeq, entry.payload);
    else if (entry.name === "intent.failed") failures.add(entry.replaySeq);
  }

  const inputs: ReplayInput[] = [];
  const seats: (ReplaySeat | undefined)[] = [undefined, undefined];
  let started = false;
  let versionOffset = 0;
  for (const { name, payload, replaySeq } of entries) {
    if (name === "replay.rollback") {
      if (
        Number.isInteger(payload.index) &&
        typeof payload.index === "number" &&
        payload.index >= 0 &&
        payload.index <= inputs.length &&
        typeof payload.versionOffset === "number"
      ) {
        inputs.length = payload.index;
        versionOffset = payload.versionOffset;
      }
      continue;
    }
    const placed = {
      stateVersion: typeof payload.stateVersion === "number" ? payload.stateVersion - versionOffset : 0,
      ...(typeof payload.engineEvents === "number" ? { engineEvents: payload.engineEvents } : {}),
    };
    if (name === "replay.seat") {
      const seat = seatOf(payload.seat);
      const deck = deckOf(payload.deck);
      if (seat === undefined || deck === undefined) continue;
      const bot = payload.bot === true ? ({ bot: true } as const) : {};
      inputs.push({ kind: "seat", seat, deck, deckRules: deckRulesOf(payload.deckRules), ...bot, ...placed });
      // A seat re-filled after the match started cannot happen; before it, the last occupant plays.
      if (!started) seats[seat] = { deck, ...bot };
    } else if (name === "intent.received") {
      const seat = seatOf(payload.seat);
      const intent = payload.intent;
      if (seat === undefined || !isObject(intent) || typeof intent.type !== "string") continue;
      const result = results.get(replaySeq)?.result;
      const outcome = isObject(result)
        ? {
            ok: result.ok === true,
            ...(result.ok !== true && typeof result.reason === "string" ? { reason: result.reason } : {}),
          }
        : failures.has(replaySeq)
          ? { threw: true as const }
          : {};
      inputs.push({
        kind: "intent",
        seat,
        intent: sanitizeIntent(intent as { type: string } & Record<string, unknown>),
        ...outcome,
        ...placed,
      });
    } else if (name === "replay.input") {
      const site =
        typeof payload.site === "string" && SITES.has(payload.site) ? (payload.site as ReplaySite) : undefined;
      const input = roomInputOf(payload, { ...placed, ...(site ? { site } : {}) });
      if (!input) continue;
      if (input.kind === "startMatch" || input.kind === "startDevScenario" || input.kind === "startScenarioFixture")
        started = true;
      inputs.push(input);
    }
  }

  const missing = ([0, 1] as const).filter((seat) => seats[seat] === undefined);
  if (missing.length > 0)
    throw new ReplayExtractionError(
      `No deck recorded for seat ${missing.join(" and ")} of match ${matchId} (no replay.seat line).`,
    );

  const firstSeat = seatOf(header.firstSeat);
  return {
    format: REPLAY_FORMAT,
    matchId,
    ...(typeof header.serverRevision === "string" && header.serverRevision
      ? { serverRevision: header.serverRevision }
      : {}),
    seed: header.seed,
    ...(typeof header.randomKey === "string" ? { randomKey: header.randomKey } : {}),
    ...(firstSeat !== undefined ? { firstSeat } : {}),
    rules: {
      ...(header.gameMode === GameMode.MANUAL.value ? { gameMode: GameMode.MANUAL.value } : {}),
      deckFormat: (typeof header.deckFormat === "string" ? header.deckFormat : "standard") as DeckFormat,
      unlimited: header.unlimited === true,
      betaBattle: header.betaBattle === true,
      ...(typeof header.devScenario === "string" ? { devScenario: header.devScenario as string } : {}),
    },
    seats: [seats[0]!, seats[1]!],
    inputs,
  };
}

function roomInputOf(
  payload: Record<string, unknown>,
  placed: { stateVersion: number; engineEvents?: number; site?: ReplaySite },
): ReplayInput | undefined {
  const kind = payload.kind;
  if (typeof kind !== "string" || !ROOM_INPUT_KINDS.has(kind)) return undefined;
  const seat = seatOf(payload.seat);
  switch (kind) {
    case "startMatch":
    case "expireCombatWindow":
      return { kind, ...placed };
    case "startScenarioFixture": {
      try {
        return { kind, fixture: serializeScenarioFixture(payload.fixture as ScenarioFixture), ...placed };
      } catch {
        return undefined;
      }
    }
    case "startDevScenario":
      return typeof payload.scenario === "string"
        ? { kind, scenario: payload.scenario as string, ...placed }
        : undefined;
    case "expireRankedRound":
      return { kind, ...placed };
    case "disconnect":
      return seat === undefined ? undefined : { kind, seat, final: payload.final === true, ...placed };
    case "reconnect":
    case "clearReady":
    case "expireMatchTimer":
    case "expireMulliganWindow":
      return seat === undefined ? undefined : { kind, seat, ...placed };
    default:
      return undefined;
  }
}

function seatOf(value: unknown): Seat | undefined {
  return value === 0 || value === 1 ? value : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? [...value] : undefined;
}

/** Only the card lists: a client's deck payload can carry names and ids the replay has no use for. */
function deckOf(value: unknown): ReplayDeck | undefined {
  if (!isObject(value)) return undefined;
  const mainDeck = stringArray(value.mainDeck);
  const eggDeck = stringArray(value.eggDeck);
  if (!mainDeck || !eggDeck) return undefined;
  const mainDeckArts = stringArray(value.mainDeckArts);
  const eggDeckArts = stringArray(value.eggDeckArts);
  return { mainDeck, eggDeck, ...(mainDeckArts ? { mainDeckArts } : {}), ...(eggDeckArts ? { eggDeckArts } : {}) };
}

function deckRulesOf(value: unknown): ReplayDeckRules {
  if (!isObject(value)) return {};
  return {
    ...(typeof value.betaBattleMode === "boolean" ? { betaBattleMode: value.betaBattleMode } : {}),
    ...(typeof value.unlimited === "boolean" ? { unlimited: value.unlimited } : {}),
    ...(typeof value.format === "string" ? { format: value.format as DeckFormat } : {}),
    ...(Array.isArray(value.banlistCards) ? { banlistCards: value.banlistCards.map(parseBanlistCard) } : {}),
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseBanlistCard(value: unknown): TournamentBanlistCard {
  if (
    !isObject(value) ||
    typeof value.cardId !== "string" ||
    typeof value.allowedCopies !== "number" ||
    !Number.isInteger(value.allowedCopies) ||
    value.allowedCopies < 0 ||
    (value.status !== "banned" && value.status !== "restricted" && value.status !== "banned_pair")
  ) {
    throw new Error("Invalid frozen tournament banlist in replay");
  }
  const pairPartnerIds = value.pairPartnerIds === undefined ? undefined : stringArray(value.pairPartnerIds);
  if (value.pairPartnerIds !== undefined && !pairPartnerIds) {
    throw new Error("Invalid frozen tournament banned pair in replay");
  }
  return {
    cardId: value.cardId,
    allowedCopies: value.allowedCopies,
    status: value.status,
    ...(pairPartnerIds ? { pairPartnerIds } : {}),
  };
}
