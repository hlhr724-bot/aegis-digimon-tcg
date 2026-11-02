import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import "#api/cards/EX13/EX13-039";
import "#api/cards/BT11/BT11-043";
import "#api/cards/BT12/BT12-067";

describe("Sukamon original DP with inherited modifiers", () => {
  it.each([
    ["EX13-039", 3000],
    ["BT12-067", 4000],
  ] as const)("applies %s only while its printed timing is active", async (sourceCard, expectedDp) => {
    const s = setupEngine(
      {
        0: { hand: [{ card: "BT11-043", as: "king" }], trash: ["BT11-040", "BT11-040", "BT11-040"] },
        1: { battleArea: [{ card: "EX13-021", as: "host", under: [sourceCard] }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("king").instanceId })).toEqual({ ok: true });
    await settle(() => s.perm("host").currentDP === expectedDp);
    expect(s.perm("host").currentDP).toBe(expectedDp);
  });
});
