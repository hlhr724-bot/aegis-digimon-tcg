import { describe, expect, it } from "vitest";
import { validReplayEvent } from "@/replays/eventValidation";

describe("replay digivolution outcome validation", () => {
  it.each([
    { outcome: undefined, accepted: true },
    { outcome: false, accepted: true },
    { outcome: true, accepted: true },
    { outcome: "false", accepted: false },
    { outcome: null, accepted: false },
  ])("accepts outcome $outcome: $accepted", ({ outcome, accepted }) => {
    expect(
      validReplayEvent({
        kind: "effectResolved",
        seat: 0,
        sourceCardId: "LM-057",
        effectKey: "delay",
        description: "Digivolve with the cost reduced by 2.",
        digivolutionPerformed: outcome,
        seq: 1,
        batch: "effect",
        stateVersion: 1,
      }),
    ).toBe(accepted);
  });
});

it("accepts optional movement origins and rejects malformed owners and hosts", () => {
  const event = {
    kind: "cardsMoved",
    seq: 1,
    batch: "effect",
    stateVersion: 1,
    instanceIds: ["source"],
    from: "digivolutionCards",
    to: "trash",
  };
  expect(validReplayEvent(event)).toBe(true);
  expect(validReplayEvent({ ...event, fromSeat: 1, fromHost: { permanentId: "host", hostCardId: "ST1-07" } })).toBe(
    true,
  );
  expect(validReplayEvent({ ...event, fromSeat: 2 })).toBe(false);
  expect(validReplayEvent({ ...event, fromHost: { permanentId: "host" } })).toBe(false);
  expect(validReplayEvent({ ...event, fromHost: null })).toBe(false);
});
