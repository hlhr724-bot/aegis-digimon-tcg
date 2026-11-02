import { EffectTiming } from "@aegis/shared/schema/enums";
import { describe, expect, it } from "vitest";
import { advance } from "#api/engine/testkit/advance";
import { assertNoLoudGap, setupEngine, settle } from "#api/engine/testkit/harness";
import "#api/cards/BT27/BT27-010";
import "#api/cards/BT27/BT27-007";

function activateMain(s: ReturnType<typeof setupEngine>) {
  return s.engine.applyIntent(0, {
    type: "activateEffect",
    sourceInstanceId: s.inst("host").instanceId,
    effectKey: `BT27-010/ir-${EffectTiming.OnDeclaration}-0`,
  });
}

describe("Meramon paid deletion activation", () => {
  it.each([5999, 6000, 6001])("pays one memory and observes the 6000 DP boundary at %s", async (dp) => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT27-010", as: "host" }] },
        1: { battleArea: [{ card: "BT1-019", as: "target", dp }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 5;
    await s.ready();
    expect(activateMain(s).ok).toBe(true);
    await settle(
      () =>
        s.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === "BT27-010") &&
        !s.state.pendingDecision,
    );
    expect(s.state.players[1]!.battleArea).toHaveLength(dp <= 6000 ? 0 : 1);
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
    expect(activateMain(s).ok).toBe(false);
    assertNoLoudGap(s);
  });

  it("declines without paying memory or deleting", async () => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: "BT27-010", as: "host" }] }, 1: { battleArea: ["BT1-019"] } },
      { autoDeclineOptional: true },
    );
    s.state.memory = 5;
    await s.ready();
    expect(activateMain(s).ok).toBe(true);
    await settle(() => s.decisions.some(({ req }) => req.kind === "optional") && !s.state.pendingDecision);
    expect(s.state.memory).toBe(5);
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
    expect(activateMain(s).ok).toBe(true);
  });

  it("deletes through its main and inherited effects when the host is deleted", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT27-010", as: "host", under: ["BT27-007"] }] },
        1: { battleArea: ["BT1-019", "BT1-019"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).verb.deletePermanent([s.perm("host").permanentId]);
    await settle(() => s.state.players[1]!.battleArea.length === 0);
    expect(s.state.players[0]!.trash.map((card) => card.cardId)).toEqual(
      expect.arrayContaining(["BT27-010", "BT27-007"]),
    );
    assertNoLoudGap(s);
  });
});
