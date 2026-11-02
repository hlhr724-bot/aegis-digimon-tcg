import { beforeAll, describe, expect, it } from "vitest";
import { extractReplay } from "./extract.js";
import { runReplay } from "./run.js";
import { recordRoomMatch } from "./roomMatch.fixture.js";
import type { ReplayInput, ReplayRecord } from "./types.js";

let record: ReplayRecord;

beforeAll(async () => {
  const recorded = await recordRoomMatch({ seed: 20260914 });
  record = extractReplay(recorded.lines, recorded.matchId);
});

type IntentInput = Extract<ReplayInput, { kind: "intent" }>;

describe("runReplay divergence reporting", () => {
  it("reports a replayed intent the engine answers differently, with its index and reason", async () => {
    const tampered = structuredClone(record);
    const index = tampered.inputs.findIndex(
      (input) => input.kind === "intent" && input.ok === true && input.intent.type === "playCard",
    );
    expect(index).toBeGreaterThan(0);
    const input = tampered.inputs[index] as IntentInput;
    if (input.intent.type !== "playCard") throw new Error("unreachable");
    input.intent.instanceId = "no-such-card";

    const replay = await runReplay(tampered, { stopOnDivergence: true });

    expect(replay.divergences).toHaveLength(1);
    expect(replay.divergences[0]).toMatchObject({
      index,
      kind: "intent-result",
      inputKind: "intent",
      intentType: "playCard",
      seat: input.seat,
      expected: "accepted",
    });
    expect(replay.divergences[0]!.reason).toEqual(expect.any(String));
    expect(replay.divergences[0]!.message).toContain(`#${index}`);
    expect(replay.divergences[0]!.message).toContain(replay.divergences[0]!.reason!);
    expect(replay.applied).toBe(index + 1);
  });

  it("keeps playing after a divergence unless told to stop", async () => {
    const tampered = structuredClone(record);
    const index = tampered.inputs.findIndex((input) => input.kind === "intent" && input.intent.type === "mulligan");
    (tampered.inputs[index] as IntentInput).ok = false;

    const replay = await runReplay(tampered);

    expect(replay.applied).toBe(tampered.inputs.length);
    expect(replay.divergences[0]).toMatchObject({
      index,
      kind: "intent-result",
      expected: "rejected",
      actual: "accepted",
    });
  });

  it("reports a board that no longer matches the recorded revision", async () => {
    const tampered = structuredClone(record);
    const index = tampered.inputs.findIndex((input) => input.stateVersion > 0);
    tampered.inputs[index]!.stateVersion += 1;

    const replay = await runReplay(tampered, { stopOnDivergence: true });

    expect(replay.divergences).toEqual([
      expect.objectContaining({ index, kind: "state-version", expected: tampered.inputs[index]!.stateVersion }),
    ]);
  });
  it("accepts a duplicate intent the room rejected mid-resolution at an earlier position", async () => {
    const duplicated = structuredClone(record);
    const index = duplicated.inputs.findIndex(
      (input) => input.kind === "intent" && input.ok === true && input.intent.type === "playCard",
    );
    expect(index).toBeGreaterThan(0);
    const accepted = duplicated.inputs[index] as IntentInput;
    duplicated.inputs.splice(index + 1, 0, {
      ...structuredClone(accepted),
      ok: false,
      reason: "wrong-phase",
      ...(accepted.engineEvents !== undefined ? { engineEvents: accepted.engineEvents + 1 } : {}),
    });

    const replay = await runReplay(duplicated, { stopOnDivergence: true });

    expect(replay.divergences).toEqual([]);
    expect(replay.applied).toBe(duplicated.inputs.length);
  });
});
