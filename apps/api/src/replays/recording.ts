import type { ReplayDecks } from "@aegis/shared/replays/ReplayDeck";
import { buildSpectatorReplayFile } from "#api/replays/buildSpectatorReplayFile";
import { randomUUID } from "node:crypto";
import { constants, zstdCompressSync, zstdDecompressSync } from "node:zlib";
import { copyWithoutSharedBacking } from "#api/replays/copyWithoutSharedBacking";
import {
  REPLAY_FORMAT_VERSION,
  MAX_REPLAY_BYTES,
  type CardInstance,
  type GameState,
  type MatchReplay,
  type ReplayFrame,
  type ReplaySummary,
  type Seat,
  type SequencedServerEvent,
} from "@aegis/shared";

// Leave room for the file envelope and metadata in the expanded import budget.
const MAX_RECORDING_BYTES = MAX_REPLAY_BYTES - 64 * 1024;
const MAX_FRAMES = 5000;
const FRAME_COMPRESSION = { params: { [constants.ZSTD_c_compressionLevel]: 1 } };

/** Deck order and facedown identities never belong in a replay, even after a game. */
export function recordingState(state: GameState): GameState {
  const copy = state.toJSON() as unknown as GameState;
  copy.roomCode = "";
  copy.spectatorCode = "";
  copy.pendingDecision = undefined;
  copy.combatWindow = undefined;
  copy.series.nextRoomId = "";
  for (const player of copy.players) {
    player.sessionId = `replay-seat-${player.seat}`;
    player.manualInspectionJson = "[]";
    player.deck = [] as never;
    player.eggDeck = [] as never;
    player.security = [] as never;
    for (const card of player.securityView) {
      if (!card.faceUp) {
        card.cardId = "";
        card.artId = "";
      }
    }
    const redact = (card: CardInstance) => {
      if (!card.faceUp) {
        card.cardId = "";
        card.artId = "";
        card.activatableEffectsJson = "";
        card.trashOriginCardId = "";
        card.digivolveRoutes = [] as never;
        card.dnaDigivolveRoutes = [] as never;
        card.appFusionRoutes = [] as never;
      }
    };
    if (player.resolvingOption) redact(player.resolvingOption);
    for (const card of player.trash) redact(card);
    for (const card of player.delayZone) redact(card);
    for (const permanent of [...player.battleArea, ...(player.breeding ? [player.breeding] : [])]) {
      redact(permanent.topCard);
      for (const card of permanent.stack) redact(card);
      for (const card of permanent.linked) redact(card);
    }
  }
  return copy;
}

/** Only shared, broadcast events enter here. Resyncs and rejections are excluded by the room. */
export function recordingEvents(events: readonly SequencedServerEvent[]): SequencedServerEvent[] {
  return events
    .filter((event) => event.kind !== "finalReveal")
    .map((event) => structuredClone(event.kind === "counterWindowOpened" ? { ...event, eligibleCounters: [] } : event));
}

export interface ParticipantReplayFile {
  summary: ReplaySummary;
  json: string;
}

type SpectatorFileParams = {
  mode: ReplaySummary["mode"];
  hiddenIdentities: readonly boolean[];
  decks?: ReplayDecks;
  finishedAt?: number;
};

export class ReplayRecording {
  readonly id = randomUUID();
  private compressedFrames: Uint8Array[] = [];
  private previousFrame?: Buffer;
  private lastAtMs = 0;
  private bytes = 0;
  private overflow = false;
  private ending?: { players: [string, string]; winnerSeat: number };

  constructor(readonly startedAt = Date.now()) {}

  /** Captures at the closed rules batch, after mutations, with no dependency on patch ticks. */
  capture(state: GameState, events: readonly SequencedServerEvent[], now = Date.now()): void {
    if (this.overflow || this.ending) return;
    const atMs = Math.max(this.lastAtMs, now - this.startedAt);
    const recorded = recordingState(state);
    const frame = Buffer.from(JSON.stringify({ atMs, state: recorded, events: recordingEvents(events) }));
    this.bytes += frame.length;
    if (this.bytes > MAX_RECORDING_BYTES || this.compressedFrames.length >= MAX_FRAMES) {
      this.compressedFrames = [];
      this.previousFrame = undefined;
      this.overflow = true;
      return;
    }
    this.compressedFrames.push(
      copyWithoutSharedBacking(
        zstdCompressSync(
          frame,
          this.previousFrame ? { ...FRAME_COMPRESSION, dictionary: this.previousFrame } : FRAME_COMPRESSION,
        ),
      ),
    );
    this.previousFrame = frame;
    this.lastAtMs = atMs;
    if (!state.gameOver) return;
    this.previousFrame = undefined;
    this.ending = {
      players: [recorded.players[0]!.displayName, recorded.players[1]!.displayName],
      winnerSeat: recorded.winnerSeat,
    };
  }

  complete(mode: ReplaySummary["mode"], finishedAt = Date.now()): MatchReplay | undefined {
    const summary = this.summary(mode, finishedAt);
    if (!summary) return undefined;
    return {
      ...summary,
      version: REPLAY_FORMAT_VERSION,
      frames: this.frames,
      viewerSeat: 0,
      visibleHandSeats: [],
      format: "aegis-replay",
    };
  }

  participantFile(
    mode: ReplaySummary["mode"],
    seat: Seat,
    finishedAt = Date.now(),
    decks?: ReplayDecks,
  ): ParticipantReplayFile | undefined {
    const summary = this.summary(mode, finishedAt);
    if (!summary) return undefined;
    if (decks) {
      summary.deckIcons = decks.map((deck) => deck?.mainDeck.at(-1) ?? null) as [string | null, string | null];
    }
    const envelope = JSON.stringify({
      ...summary,
      ...(decks ? { decks } : {}),
      version: REPLAY_FORMAT_VERSION,
      viewerSeat: seat,
      visibleHandSeats: [0, 1],
      format: "aegis-replay",
    });
    return { summary, json: `{"frames":[${this.serializedFrames().join(",")}],${envelope.slice(1)}` };
  }

  spectatorFile({
    mode,
    hiddenIdentities,
    decks,
    finishedAt = Date.now(),
  }: SpectatorFileParams): ParticipantReplayFile | undefined {
    const replay = this.complete(mode, finishedAt);
    if (replay && decks) {
      replay.decks = decks;
      replay.deckIcons = decks.map((deck) => deck?.mainDeck.at(-1) ?? null) as [string | null, string | null];
    }
    return replay
      ? buildSpectatorReplayFile({ replay, hiddenIdentities, sharedDeckSeats: decks?.map(Boolean) })
      : undefined;
  }

  get exceededLimit(): boolean {
    return this.overflow;
  }

  private get frames(): ReplayFrame[] {
    return this.serializedFrames().map((frame) => JSON.parse(frame) as ReplayFrame);
  }

  private serializedFrames(): string[] {
    let previous: Buffer | undefined;
    return this.compressedFrames.map((compressed) => {
      previous = zstdDecompressSync(compressed, previous ? { dictionary: previous } : {});
      return previous.toString();
    });
  }

  private summary(mode: ReplaySummary["mode"], finishedAt: number): ReplaySummary | undefined {
    if (!this.ending) return undefined;
    return {
      id: this.id,
      players: this.ending.players,
      mode,
      startedAt: this.startedAt,
      finishedAt: Math.max(this.startedAt, finishedAt),
      winnerSeat: this.ending.winnerSeat,
      frameCount: this.compressedFrames.length,
    };
  }
}

/** Completed participant replays expose both recorded hands, never live-game hidden state. */
export function projectReplay(replay: MatchReplay, seat: Seat): MatchReplay {
  if (!replay.frames.at(-1)?.state.gameOver) throw new Error("Only completed games can expose replay hands");
  replay.visibleHandSeats = [0, 1];
  replay.viewerSeat = seat;
  return replay;
}
