import { gunzipSync } from "node:zlib";
import { ArraySchema } from "@colyseus/schema";
import {
  CardInstance,
  GameState,
  PendingDecision,
  PlayerState,
  Permanent,
  CombatWindow,
  type MatchReplay,
  type SequencedServerEvent,
} from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { projectReplay, ReplayRecording } from "./recording.js";
import { replayDownload } from "./download.js";

function card(id: string, ownerSeat: 0 | 1, faceUp = true): CardInstance {
  return Object.assign(new CardInstance(), {
    instanceId: `${ownerSeat}-${id}`,
    cardId: id,
    artId: id,
    ownerSeat,
    faceUp,
  });
}
function state(): GameState {
  const result = new GameState();
  result.players = new ArraySchema(
    ...([0, 1] as const).map((seat) => {
      const player = Object.assign(new PlayerState(), {
        seat,
        displayName: `Player ${seat}`,
        sessionId: `private-session-${seat}`,
      });
      player.hand.push(card(`hand-${seat}`, seat));
      player.deck.push(card(`deck-${seat}`, seat));
      player.eggDeck.push(card(`egg-${seat}`, seat));
      player.security.push(card(`security-${seat}`, seat, false));
      player.handCount = player.deckCount = player.securityCount = player.eggDeckCount = 1;
      return player;
    }),
  );
  result.roomCode = result.spectatorCode = "SECRET";
  result.pendingDecision = Object.assign(new PendingDecision(), {
    seat: 1,
    decisionId: "private",
    payloadJson: '{"cardId":"secret-decision"}',
  });
  result.combatWindow = Object.assign(new CombatWindow(), { eligibleCountersJson: '[{"effectKey":"secret-counter"}]' });
  result.stateVersion = 1;
  return result;
}
const event = (kind: "matchStarted" | "gameOver", seq: number): SequencedServerEvent =>
  kind === "matchStarted"
    ? { kind, firstSeat: 0, seq, batch: `b${seq}`, stateVersion: seq }
    : {
        kind,
        result: { outcome: "win", winnerSeat: 0 },
        reason: "surrender",
        seq,
        batch: `b${seq}`,
        stateVersion: seq,
      };
function finishedRecording(): ReplayRecording {
  const recording = new ReplayRecording(100);
  const game = state();
  recording.capture(game, [event("matchStarted", 1)], 100);
  game.players[0]!.hand[0]!.cardId = "changed-later";
  game.memory = 7;
  game.stateVersion = 2;
  game.gameOver = true;
  game.winnerSeat = 0;
  recording.capture(game, [event("gameOver", 2)], 200);
  return recording;
}

describe("portable participant replay", () => {
  it("captures immutable initial and terminal frames, and never exports incomplete games", () => {
    const recording = new ReplayRecording();
    recording.capture(state(), [event("matchStarted", 1)]);
    expect(recording.complete("casual")).toBeUndefined();
    const replay = finishedRecording().complete("casual", 200)!;
    expect(replay.frames).toHaveLength(2);
    expect(replay.frames[0]!.state.players[0]!.hand[0]!.cardId).toBe("hand-0");
    expect(replay.frames.map((frame) => frame.atMs)).toEqual([0, 100]);
    expect(replay.frames[1]!.state).toMatchObject({ memory: 7, gameOver: true, winnerSeat: 0 });
  });
  it("exports independent gzip files with both recorded hands and no private piles or prompts", async () => {
    const recording = finishedRecording();
    const files = await Promise.all(
      ([0, 1] as const).map((seat) => replayDownload(recording.participantFile("casual", seat, 200)!, seat)),
    );
    const read = (index: number): MatchReplay => {
      const file = files[index]!;
      if (file.kind !== "ready") throw new Error("Replay should be ready");
      return JSON.parse(gunzipSync(Buffer.from(file.data, "base64")).toString());
    };
    for (const seat of [0, 1] as const) {
      const replay = read(seat);
      expect(replay.visibleHandSeats).toEqual([0, 1]);
      expect(replay.viewerSeat).toBe(seat);
      for (const frame of replay.frames) {
        expect(frame.state.players[seat]!.hand.length).toBe(1);
        expect(frame.state.players[1 - seat]!.hand.length).toBe(1);
        expect(frame.state.players[1 - seat]!.handCount).toBe(1);
      }
      expect(JSON.stringify(replay)).not.toMatch(
        /deck-\d|egg-\d|security-\d|SECRET|private-session|secret-decision|secret-counter/,
      );
    }
    expect(recording.complete("casual", 200)!.frames[0]!.state.players[1]!.hand).toHaveLength(1);
  });
  it("assembles each participant file as the projected completed replay", () => {
    const recording = finishedRecording();
    for (const seat of [0, 1] as const) {
      const file = recording.participantFile("ranked", seat, 200)!;
      const expected = projectReplay(recording.complete("ranked", 200)!, seat);
      expect(JSON.parse(file.json)).toEqual(expected);
      const {
        frames: _frames,
        visibleHandSeats: _hands,
        viewerSeat: _seat,
        format: _format,
        version: _version,
        ...summary
      } = expected;
      expect(file.summary).toEqual(summary);
    }
  });
  it("has no participant file before the game is over", () => {
    const recording = new ReplayRecording();
    recording.capture(state(), [event("matchStarted", 1)]);
    expect(recording.participantFile("casual", 0)).toBeUndefined();
  });
  it("removes final reveal and eligible counter contents, while retaining revealed gameplay events", () => {
    const game = state();
    const recording = new ReplayRecording(0);
    const hidden = card("face-down-option", 1, false);
    hidden.instanceId = "opaque-facedown-instance";
    hidden.activatableEffectsJson = '{"description":"secret-effect"}';
    game.players[1]!.delayZone.push(hidden);
    game.players[1]!.battleArea.push(
      Object.assign(new Permanent(), { permanentId: "p", controllerSeat: 1, topCard: hidden }),
    );
    game.gameOver = true;
    recording.capture(game, [
      {
        kind: "finalReveal",
        players: [{ seat: 0, hand: [], deck: [{ cardId: "secret-deck", artId: "" }], security: [], eggDeck: [] }],
        seq: 1,
        batch: "b",
        stateVersion: 1,
      },
      {
        kind: "counterWindowOpened",
        attackerPermanentId: "p",
        defendingSeat: 1,
        eligibleCounters: [
          { instanceId: "private-instance", effectKey: "private-effect", description: "private-description" },
        ],
        seq: 2,
        batch: "b",
        stateVersion: 1,
      },
      { kind: "cardRevealed", seat: 0, cardId: "public-card", seq: 3, batch: "b", stateVersion: 1 },
    ]);
    const replay = recording.complete("private")!;
    expect(replay.frames[0]!.events.map((entry) => entry.kind)).toEqual(["counterWindowOpened", "cardRevealed"]);
    expect(JSON.stringify(replay)).not.toMatch(
      /secret-deck|private-instance|private-effect|private-description|face-down-option|secret-effect/,
    );
  });
  it("drops an over-limit recording rather than returning a partial replay", () => {
    const recording = new ReplayRecording();
    const game = state();
    for (let index = 0; index <= 5000; index++) {
      game.stateVersion++;
      recording.capture(game, [], index);
    }
    game.gameOver = true;
    recording.capture(game, []);
    expect(recording.exceededLimit).toBe(true);
    expect(recording.complete("casual")).toBeUndefined();
    expect(recording.participantFile("casual", 0)).toBeUndefined();
  });
});

describe("neutral spectator replay export", () => {
  it("removes every hand in every frame while preserving public events and anonymous names", async () => {
    const recording = finishedRecording();
    const file = recording.spectatorFile({ mode: "casual", hiddenIdentities: [true, false], finishedAt: 200 })!;
    const message = await replayDownload(file, -1);
    expect(message).toMatchObject({ kind: "ready", viewerSeat: -1 });
    const replay = JSON.parse(file.json) as MatchReplay;
    expect(replay.visibleHandSeats).toEqual([]);
    expect(replay.players).toEqual(["Player 1", "Player 1"]);
    for (const frame of replay.frames) {
      for (const player of frame.state.players) {
        expect(player.hand).toEqual([]);
        expect(player.deck).toEqual([]);
        expect(player.eggDeck).toEqual([]);
        expect(player.security).toEqual([]);
        expect(player.manualInspectionJson).toBe("[]");
      }
      expect(frame.state.players[0]!.displayName).toBe("Player 1");
      expect(frame.state.players[0]!.avatarId).toBe("");
    }
    expect(replay.frames.flatMap((frame) => frame.events).map((entry) => entry.kind)).toEqual([
      "matchStarted",
      "gameOver",
    ]);
    expect(file.json).not.toContain("hand-0");
    expect(file.json).not.toContain("hand-1");
    expect(file.json).not.toContain("changed-later");
    expect(file.json).not.toContain("secret-decision");
    expect(file.json).not.toContain("private-session");
  });
});
