import { describe, expect, it } from "vitest";
import "../../cards/index.js";
import { setupEngine } from "../testkit/harness.js";

const PRINCE_MAMEMON = "EX13-063";
const THUNDERMON_ALSO_MAMEMON = "BT8-061";
const THUNDERMON_INCLUDING_MAMEMON = "EX13-053";
const THUNDERMON_HAVING_MAMEMON = "EX12-041";
const MAMEMON = "BT6-064";
const MOTIMON_MAMEMON_TEXT = "P-246";
const SENTINEL = "BT1-009";

async function declarePrinceMamemonAssembly(materials: readonly string[]) {
  const s = setupEngine({
    0: {
      hand: [{ card: PRINCE_MAMEMON, as: "prince" }],
      trash: materials.map((card, index) => ({ card, as: `material-${index}` })),
      deck: [SENTINEL, SENTINEL, SENTINEL],
      security: [SENTINEL],
    },
    1: { deck: [SENTINEL, SENTINEL, SENTINEL], security: [SENTINEL] },
  });
  s.state.memory = 10;
  await s.ready();
  return s.engine.applyIntent(0, {
    type: "playCard",
    instanceId: s.inst("prince").instanceId,
    assembly: { materialInstanceIds: materials.map((_card, index) => s.inst(`material-${index}`).instanceId) },
  });
}

describe("Assembly materials with different names", () => {
  it("counts a card that is also treated as another name under whichever name the others leave free", async () => {
    expect(
      await declarePrinceMamemonAssembly([THUNDERMON_ALSO_MAMEMON, THUNDERMON_INCLUDING_MAMEMON, MOTIMON_MAMEMON_TEXT]),
    ).toEqual({ ok: true });
    expect(
      await declarePrinceMamemonAssembly([THUNDERMON_ALSO_MAMEMON, THUNDERMON_HAVING_MAMEMON, MOTIMON_MAMEMON_TEXT]),
    ).toEqual({ ok: true });
  });

  it("refuses materials that leave a card without a free name", async () => {
    const refusals = [
      [THUNDERMON_ALSO_MAMEMON, MAMEMON, THUNDERMON_INCLUDING_MAMEMON],
      [THUNDERMON_HAVING_MAMEMON, THUNDERMON_INCLUDING_MAMEMON, MOTIMON_MAMEMON_TEXT],
    ];
    for (const materials of refusals) {
      expect(await declarePrinceMamemonAssembly(materials)).toEqual({ ok: false, reason: "invalid-material" });
    }
  });

  it("accepts a treated-as card beside cards that each use another name", async () => {
    expect(await declarePrinceMamemonAssembly([THUNDERMON_ALSO_MAMEMON, MAMEMON, MOTIMON_MAMEMON_TEXT])).toEqual({
      ok: true,
    });
  });

  it("lets two copies of a treated-as card count under its two names", async () => {
    expect(
      await declarePrinceMamemonAssembly([THUNDERMON_ALSO_MAMEMON, THUNDERMON_ALSO_MAMEMON, MOTIMON_MAMEMON_TEXT]),
    ).toEqual({ ok: true });
  });
});
