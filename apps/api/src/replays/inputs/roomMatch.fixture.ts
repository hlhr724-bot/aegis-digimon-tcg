import { ClientState, CloseCode, type Client } from "colyseus";
import type { GameState, Intent, ReplayFrame } from "@aegis/shared";
import { vi } from "vitest";
import { AegisRoom } from "../../rooms/AegisRoom.js";
import { BotPlayer } from "../../bot/BotPlayer.js";
import { addLogSink } from "../../logger.js";
import { BLUE_DECK, RED_DECK, type Decklist } from "../../engine/testDecks.js";
import type { GameEngine } from "../../engine/GameEngine.js";
// Card effects must be registered, or a recorded match plays without them.
import "../../cards/index.js";

/**
 * Plays a real {@link AegisRoom} match and keeps every log line the room wrote.
 *
 * Seat 0 is a person: a fake Colyseus client that joins through `onJoin`, sends `ready` and every
 * later intent through the room's own client path (`handleIntent`), chats, and can drop and come
 * back through `onLeave`. A {@link BotPlayer} decides its moves. Seat 1 is the room's own bot,
 * seated by `addBot`. Time is faked, so the bots' think delays and the room's timeouts (the
 * combat-window answer timeout included) elapse instantly but in their real order.
 *
 * With `clock: "real"` nothing is faked: the room is initialised the way Colyseus' matchmaker
 * creates one (`room.__init()` before `onCreate`, `MatchMaker.mjs` `handleCreateRoom`), so the
 * room's own `patchRate` interval calls `broadcastPatch()` every 50 ms, which ticks the room
 * clock at whatever async boundary it lands on, exactly as in production. The bots still think
 * for seconds per action then; a test that uses the real clock shortens their pacing itself.
 */

export const HUMAN_NAME = "Replay Person";
export const HUMAN_SESSION = "session-replay-person";
export const CHAT_TEXT = "hello from the replay chat";

export interface RoomMatchOptions {
  seed: number;
  humanDeck?: Decklist;
  botDeck?: Decklist;
  turnLimit?: number;
  /** Leave the first combat prompt seat 0 is asked unanswered, so the room's timeout closes it. */
  ignoreFirstCombatPrompt?: boolean;
  /** Drop seat 0's connection at this turn and reconnect it a few seconds later. */
  dropAtTurn?: number;
  /** Seat 0 leaves for good (a consented leave) at this turn. */
  leaveAtTurn?: number;
  /** "fake" (the default) drives fake timers by hand; "real" runs on Node's timers (see above). */
  clock?: "fake" | "real";
  /** Replaces the room's combat-window answer timeout, so a real clock can reach it. */
  combatWindowTimeoutSeconds?: number;
  /** How long a dropped seat stays away before it reconnects. Defaults to 3 s. */
  reconnectAfterMs?: number;
  /** Real clock only: fail if the match has not ended after this much wall time. */
  wallTimeoutMs?: number;
}

export interface RecordedRoomMatch {
  lines: string[];
  matchId: string;
  /** {@link comparableState} of the room's state once the match ended and the engine went idle. */
  finalState: unknown;
  turnCount: number;
  gameOver: boolean;
  /** The frames of the room's own player replay recording (`ReplayRecording`), empty if it made none. */
  recordingFrames: ReplayFrame[];
}

const COMBAT_ANSWERS = new Set<Intent["type"]>([
  "declareBlock",
  "declineBlock",
  "respondCounter",
  "respondAlliance",
  "respondEvade",
  "respondBarrier",
]);

function macrotask(): Promise<void> {
  return new Promise<void>((resolve) => setImmediate(resolve));
}

function fakeClient(sessionId: string, joined = false): Client {
  const client = { sessionId, send: vi.fn<() => void>(), view: undefined };
  // A JOINED client, with sinks for its frames, has its view encoded by every real patch.
  if (joined)
    Object.assign(client, { state: ClientState.JOINED, raw: vi.fn<() => void>(), enqueueRaw: vi.fn<() => void>() });
  return client as unknown as Client;
}

function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

type RoomInternals = {
  engine: GameEngine;
  bots: (BotPlayer | undefined)[];
  handleIntent(client: Client, intent: Intent): void;
  handleChat(client: Client, payload: unknown): void;
  COMBAT_WINDOW_TIMEOUT_SECONDS: number;
  // `frames` is private on `ReplayRecording`; read structurally so `recording.ts` stays as it is.
  replayRecording?: { frames: ReplayFrame[] };
};

/**
 * What Colyseus' matchmaker does to a room before `onCreate` (`@colyseus/core` `Room.mjs` `__init`):
 * arm the `patchRate` interval and start the clock.
 */
function initLikeMatchmaker(room: AegisRoom): void {
  (Reflect.get(room, "__init") as () => void).call(room);
}

/** Colyseus' own dispose: `onDispose`, then the patch interval, auto-dispose timeout and clock are cleared. */
function disposeLikeColyseus(room: AegisRoom): void {
  (Reflect.get(room, "_events") as { emit(event: "dispose"): void }).emit("dispose");
}

export async function recordRoomMatch(options: RoomMatchOptions): Promise<RecordedRoomMatch> {
  const lines: string[] = [];
  const stopCapture = addLogSink((line) => lines.push(line));
  const realClock = options.clock === "real";
  // On the fake clock, timers and clocks are fake; `setImmediate` and the microtask queue stay real. Every fake timer
  // is fired on its own, after a real macrotask turn has drained all pending promise work, as in
  // Node. (`advanceTimersByTimeAsync` can fire a timer while a deep promise chain is still
  // resolving, which no real timer can do, and would record inputs at impossible moments.)
  if (!realClock)
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date", "performance"],
    });
  const room = new AegisRoom();
  const internals = room as unknown as RoomInternals;
  try {
    if (options.combatWindowTimeoutSeconds !== undefined)
      internals.COMBAT_WINDOW_TIMEOUT_SECONDS = options.combatWindowTimeoutSeconds;
    room.lock = vi.fn<() => Promise<void>>(async () => {});
    room.unlock = vi.fn<() => Promise<void>>(async () => {});
    room.setMatchmaking = vi.fn<() => Promise<void>>(async () => {});
    room.broadcast = vi.fn<() => boolean>(() => true) as AegisRoom["broadcast"];
    if (realClock) initLikeMatchmaker(room);
    room.onCreate({ botRoom: true, seed: options.seed });

    const human = fakeClient(HUMAN_SESSION, realClock);
    room.clients.push(human);
    room.onJoin(human, {
      displayName: HUMAN_NAME,
      deck: options.humanDeck ?? RED_DECK,
      botDeck: options.botDeck ?? BLUE_DECK,
    });
    internals.handleIntent(human, { type: "ready" });
    internals.handleChat(human, { kind: "text", text: CHAT_TEXT });

    let ignored = !options.ignoreFirstCombatPrompt;
    internals.bots[0] = new BotPlayer(
      0,
      room.state,
      (intent) => {
        if (!ignored && COMBAT_ANSWERS.has(intent.type) && room.state.combatWindow?.seat === 0) {
          ignored = true;
          return;
        }
        internals.handleIntent(human, intent);
      },
      { seed: options.seed },
    );
    if (!room.addBot()) throw new Error("the room refused the bot");

    const turnLimit = options.turnLimit ?? 40;
    let dropped = options.dropAtTurn === undefined;
    let left = options.leaveAtTurn === undefined;
    const departures: Promise<void>[] = [];
    let unsettledDepartures = 0;
    const depart = (departure: Promise<void>) => {
      unsettledDepartures += 1;
      departures.push(departure.finally(() => (unsettledDepartures -= 1)));
    };
    const reconnectAfterMs = options.reconnectAfterMs ?? 3_000;
    const deadline = Date.now() + (options.wallTimeoutMs ?? 50_000);
    const advance = async () => {
      if (realClock) {
        if (Date.now() > deadline) throw new Error(`the real-clock match did not end in time (seed ${options.seed})`);
        // Only watch; the room's patch interval and the bots' timers move the match.
        await sleep(10);
        return;
      }
      await macrotask();
      if (vi.getTimerCount() > 0) vi.advanceTimersToNextTimer();
      else vi.advanceTimersByTime(1_000);
      room.clock.tick();
    };
    for (let step = 0; step < 100_000 && !room.state.gameOver && room.state.turnCount <= turnLimit; step++) {
      if (!dropped && room.state.turnCount >= options.dropAtTurn!) {
        dropped = true;
        room.allowReconnection = vi.fn<() => Promise<Client>>(
          () =>
            new Promise<Client>((resolve) =>
              setTimeout(() => resolve(fakeClient(HUMAN_SESSION, realClock)), reconnectAfterMs),
            ),
        ) as unknown as AegisRoom["allowReconnection"];
        depart(room.onLeave(human, CloseCode.ABNORMAL_CLOSURE));
      }
      if (!left && room.state.turnCount >= options.leaveAtTurn!) {
        left = true;
        depart(room.onLeave(human, CloseCode.CONSENTED));
      }
      await advance();
    }
    // A reconnection still pending (its grace timer) settles on fake time like everything else.
    for (let step = 0; step < 1_000; step++) {
      if (unsettledDepartures === 0) break;
      await advance();
    }
    await Promise.all(departures);
    for (const bot of internals.bots) bot?.dispose();
    // Let whatever the last input started finish, as the replay will before comparing.
    await macrotask();
    internals.engine.syncCounts();
    internals.engine.projection.syncHandAffordances();
    internals.engine.flushHandAffordances();
    return {
      lines,
      matchId: room.state.matchLogId,
      finalState: comparableState(room.state),
      turnCount: room.state.turnCount,
      gameOver: room.state.gameOver,
      recordingFrames: structuredClone(internals.replayRecording?.frames ?? []),
    };
  } finally {
    if (realClock) disposeLikeColyseus(room);
    else {
      room.onDispose();
      room.clock.stop();
    }
    stopCapture();
    vi.useRealTimers();
  }
}

/**
 * The engine-owned part of a state, for comparing a replay with the room it reproduces. What the
 * room alone writes (identities, codes, the match clock, the series) is left out; `stateVersion`
 * stays, because the replay reproduces the room's batch bookkeeping.
 */
export function comparableState(state: GameState): unknown {
  const json = structuredClone(state.toJSON()) as Record<string, unknown>;
  for (const key of [
    "matchLogId",
    "matchId",
    "roomCode",
    "spectatorCode",
    "matchTimer",
    "timerStartSeconds",
    "timerRefillSeconds",
    "timerRemaining0",
    "timerRemaining1",
    "timerActiveSeat",
    "mulliganTimerRemaining0",
    "mulliganTimerRemaining1",
    "series",
  ])
    delete json[key];
  for (const player of (json.players as Record<string, unknown>[] | undefined) ?? []) {
    delete player.sessionId;
    delete player.displayName;
    delete player.avatarId;
    delete player.botPersonaId;
  }
  return json;
}
