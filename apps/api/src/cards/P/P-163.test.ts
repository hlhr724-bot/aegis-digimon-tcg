import { describe, expect, it } from "vitest";
import { runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import { assertNoLoudGap, setupEngine, settle } from "../../engine/testkit/harness.js";
import "./P-163.js";

describe("P-163 Dokugumon", () => {
  it("suspends an opponent's Digimon on play", async () => {
    const s = setupEngine(
      {
        0: { hand: [{ card: "P-163", as: "source" }] },
        1: { battleArea: [{ card: "BT1-009", as: "target" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("source").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("target").isSuspended);
    expect(s.perm("target").isSuspended).toBe(true);
    assertNoLoudGap(s);
  });

  it("encodes the printed On Play and On Deletion effects and NSo requirement", () => {
    const compiled = runtimeCompiledCard("P-163")!;
    expect(compiled.effects.map((effect) => effect.trigger)).toEqual(["OnPlay", "OnDeletion"]);
    expect(compiled.effects.find((effect) => effect.trigger === "OnDeletion")).toMatchObject({
      actions: [{ kind: "Suspend", target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 } }],
    });
    expect(compiled.digivolutionRequirement).toEqual([{ level: 3, traits: ["NSo"], cost: 2, isAlternate: true }]);
  });

  it("uses the alternate NSo evolution path without a When Digivolving suspension", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX8-030", as: "nsoHost" }],
          hand: [{ card: "P-163", as: "dokugumon" }],
        },
        1: { battleArea: [{ card: "BT1-009", as: "target" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("nsoHost").permanentId,
        instanceId: s.inst("dokugumon").instanceId,
        alternateRequirementIndex: 0,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("nsoHost").topCard.cardId === "P-163");
    expect(s.perm("nsoHost").topCard.cardId).toBe("P-163");
    expect(s.perm("target").isSuspended).toBe(false);
    expect(s.state.memory).toBe(8);
    assertNoLoudGap(s);
  });
});
