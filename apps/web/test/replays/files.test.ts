import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { MAX_REPLAY_BYTES } from "@aegis/shared";
import { replayFixture } from "./fixture";
import { readReplay } from "../../src/replays/files";
import { frameDelay, playbackState, turnPositions } from "../../src/replays/playback";

describe("portable replay files", () => {
  it("opens actual server snapshots as JSON or gzip without a server", async () => {
    const replay = replayFixture();
    const text = JSON.stringify(replay);
    for (const file of [new Blob([text]), new Blob([gzipSync(text)])]) {
      expect(await readReplay(file)).toEqual(JSON.parse(text));
    }
  });
  it("rejects unsupported versions, corrupt archives, incomplete states, invalid event shapes and empty files", async () => {
    await expect(readReplay(new Blob())).rejects.toMatchObject({ code: "size" });
    await expect(readReplay(new Blob([new Uint8Array([31, 139, 99, 99])]))).rejects.toMatchObject({ code: "invalid" });
    await expect(readReplay(new Blob(['{"format":"aegis-replay","version":999}']))).rejects.toMatchObject({
      code: "version",
    });
    for (const mutate of [
      (replay: ReturnType<typeof replayFixture>) => {
        replay.frames.at(-1)!.state.gameOver = false;
      },
      (replay: ReturnType<typeof replayFixture>) => {
        replay.frames[0]!.state.players[0]!.battleArea = null as never;
      },
      (replay: ReturnType<typeof replayFixture>) => {
        replay.frames[0]!.events[0]!.kind = "toString" as never;
      },
      (replay: ReturnType<typeof replayFixture>) => {
        replay.frames[1]!.atMs = -1;
      },
      (replay: ReturnType<typeof replayFixture>) => {
        replay.frames[0]!.events[0] = { kind: "attackDeclared", seq: 1, batch: "batch-0", stateVersion: 1 } as never;
      },
      (replay: ReturnType<typeof replayFixture>) => {
        replay.frames[0]!.state.series = { bestOf: "3" } as never;
      },
    ]) {
      const replay = replayFixture();
      mutate(replay);
      await expect(readReplay(new Blob([JSON.stringify(replay)]))).rejects.toMatchObject({ code: "invalid" });
    }
  });
  it("opens files recorded before newer schema fields existed", async () => {
    const replay = replayFixture();
    for (const frame of replay.frames) delete (frame.state as Partial<typeof frame.state>).format;
    const opened = await readReplay(new Blob([JSON.stringify(replay)]));
    expect(opened.frames[0]!.state.format).toBe(replayFixture().frames[0]!.state.format);
  });

  it("validates manual public state and rejects imported private inspections", async () => {
    const replay = replayFixture();
    replay.mode = "manual";
    for (const frame of replay.frames) {
      frame.state.gameMode = "manual";
      frame.state.manual.revealedJson = JSON.stringify([{ cardId: "ST1-03", artId: "", seat: 0 }]);
    }
    expect((await readReplay(new Blob([JSON.stringify(replay)]))).mode).toBe("manual");
    for (const malformed of ["{", "{}", '[{"cardId":12,"seat":0}]']) {
      const invalid = structuredClone(replay);
      invalid.frames[0]!.state.manual.revealedJson = malformed;
      await expect(readReplay(new Blob([JSON.stringify(invalid)]))).rejects.toMatchObject({ code: "invalid" });
    }
    replay.frames[0]!.state.players[0]!.manualInspectionJson = '[{"instanceId":"private-card"}]';
    await expect(readReplay(new Blob([JSON.stringify(replay)]))).rejects.toMatchObject({ code: "invalid" });
  });

  it("rejects unknown manual phase and combat projections", async () => {
    for (const fields of [{ turnPhase: "invalid" }, { combatStage: "invalid" }, { attackerSeat: 7 }]) {
      const replay = replayFixture();
      Object.assign(replay.frames[0]!.state.manual, fields);
      await expect(readReplay(new Blob([JSON.stringify(replay)]))).rejects.toMatchObject({ code: "invalid" });
    }
  });

  it("limits gzip expansion so a small compressed file cannot allocate unlimited memory", async () => {
    const bomb = gzipSync(" ".repeat(MAX_REPLAY_BYTES + 1));
    await expect(readReplay(new Blob([bomb]))).rejects.toMatchObject({ code: "size" });
  });
  it("seeks across turn changes and hides a hand without mutating the recording", () => {
    const replay = replayFixture();
    expect(turnPositions(replay)).toEqual([
      { index: 0, turn: 1, seat: 0 },
      { index: 2, turn: 2, seat: 1 },
    ]);
    expect(playbackState(replay, 0, false).players[0]!.hand).toEqual([]);
    expect(replay.frames[0]!.state.players[0]!.hand).toHaveLength(1);
    expect(frameDelay(replay, 0, 2)).toBe(500);
    replay.frames[1]!.atMs = 60_000;
    expect(frameDelay(replay, 0, 1)).toBe(2500);
  });
});

it("opens face-down public cards without identities and rejects missing face-up identities", async () => {
  const replay = replayFixture();
  const frame = replay.frames[1]!;
  const permanent = frame.state.players[0]!.battleArea[0]!;
  permanent.topCard.faceUp = false;
  delete (permanent.topCard as Partial<typeof permanent.topCard>).cardId;
  delete (permanent.topCard as Partial<typeof permanent.topCard>).artId;
  const opened = await readReplay(new Blob([JSON.stringify(replay)]));
  expect(opened.frames[1]!.state.players[0]!.battleArea[0]!.topCard.cardId).toBe("");
  expect(opened.frames[1]!.state.players[0]!.battleArea[0]!.topCard.artId).toBe("");
  permanent.topCard.faceUp = true;
  await expect(readReplay(new Blob([JSON.stringify(replay)]))).rejects.toMatchObject({ code: "invalid" });
});

it("rejects malformed manual signals, restart agreements, reveal locations and statuses", async () => {
  for (const fields of [
    { signalSeat: 8 },
    { signalTargetSeat: 3 },
    { signalRevision: -1 },
    { restartRequester: 4 },
    { restartFirstSeat: 2 },
    { restartCount: 0.5 },
    { revealedJson: JSON.stringify([{ cardId: "ST1-03", seat: 0, zone: "invalid" }]) },
  ]) {
    const replay = replayFixture();
    Object.assign(replay.frames[0]!.state.manual, fields);
    await expect(readReplay(new Blob([JSON.stringify(replay)]))).rejects.toMatchObject({ code: "invalid" });
  }
  const replay = replayFixture();
  replay.frames[1]!.state.players[0]!.battleArea[0]!.manualStatuses = ["invalid"];
  await expect(readReplay(new Blob([JSON.stringify(replay)]))).rejects.toMatchObject({ code: "invalid" });
});
