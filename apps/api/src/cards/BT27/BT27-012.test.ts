import { Phase, EffectTiming } from "@aegis/shared/schema/enums";
import { describe, expect, it } from "vitest";
import fixture from "#api/engine/scenarios/flame-deletion-stack.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { assertNoLoudGap, setupEngine, settle } from "#api/engine/testkit/harness";
import "#api/cards/BT27/BT27-012";
import "#api/cards/BT27/BT27-010";
import "#api/cards/BT27/BT27-007";

function activateMain(s: ReturnType<typeof setupEngine>) {
  return s.engine.applyIntent(0, {
    type: "activateEffect",
    sourceInstanceId: s.inst("host").instanceId,
    effectKey: `BT27-012/ir-${EffectTiming.OnDeclaration}-0`,
  });
}

describe("SkullMeramon deletion effects", () => {
  it("pays one memory and selects only a lowest-level opponent", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT27-012", as: "host" }] },
        1: {
          battleArea: [
            { card: "BT1-019", as: "higher" },
            { card: "BT1-009", as: "lower" },
            { card: "BT1-010", as: "tied" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 5;
    await s.ready();
    expect(activateMain(s).ok).toBe(true);
    await settle(() => s.state.players[1]!.trash.length === 1 && !s.state.pendingDecision);
    expect(s.state.memory).toBe(4);
    expect(s.state.players[1]!.trash[0]!.cardId).toBe("BT1-009");
    expect(s.state.players[1]!.battleArea.some((p) => p.permanentId === s.perm("higher").permanentId)).toBe(true);
    expect(activateMain(s).ok).toBe(false);
    assertNoLoudGap(s);
  });

  it("lets the player select an inherited deletion instead of its printed lowest-level effect", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT27-012", as: "host", under: ["BT27-010"] }] },
        1: {
          battleArea: [
            { card: "BT1-009", as: "small", dp: 7000 },
            { card: "BT1-019", as: "large", dp: 6000 },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferOptionIndex: 1 },
    );
    s.state.memory = 5;
    await s.ready();
    expect(activateMain(s).ok).toBe(true);
    await settle(() => s.state.players[1]!.trash.length === 1 && !s.state.pendingDecision);
    expect(s.state.players[1]!.trash[0]!.cardId).toBe("BT1-019");
    expect(s.state.memory).toBe(4);
    expect(s.decisions.some(({ req }) => req.kind === "chooseOption")).toBe(true);
    assertNoLoudGap(s);
  });

  it("trashes the opponent's top security from an inherited deletion", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT1-019", as: "host", under: ["BT27-012"] }] },
        1: { security: [{ card: "BT1-009", as: "securityTop" }, "BT1-010"] },
      },
      { autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).verb.deletePermanent([s.perm("host").permanentId]);
    await settle(() => s.state.players[1]!.security.length === 1);
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toContain(s.inst("securityTop").instanceId);
    assertNoLoudGap(s);
  });
  it("builds the Solarmon to Meramon to SkullMeramon stack and preserves both inherited deletion effects", async () => {
    const s = setupScenario(fixture, { autoSelectCards: true, autoAcceptOptional: true });
    s.state.phase = Phase.Main;
    await s.ready();
    for (const alias of ["champion", "ultimate"]) {
      const id = s.inst(alias).instanceId;
      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: s.perm("base").permanentId,
          instanceId: id,
          useAlternateCost: alias === "ultimate",
        }).ok,
      ).toBe(true);
      await settle(() => s.perm("base").topCard.instanceId === id && !s.state.pendingDecision);
    }
    expect(s.state.memory).toBe(0);
    expect(s.perm("base").stack.map((c) => c.cardId)).toEqual(["BT27-007", "BT27-010"]);
    await advance(s.engine).verb.deletePermanent([s.perm("base").permanentId]);
    await settle(() => s.state.players[1]!.battleArea.length === 0 && !s.state.pendingDecision);
    expect(s.state.players[0]!.trash.map((c) => c.cardId)).toEqual(
      expect.arrayContaining(["BT27-007", "BT27-010", "BT27-012"]),
    );
    assertNoLoudGap(s);
  });
  it.each(["BT27-010", "BT3-083", "BT1-035"])("checks the Flame-only alternate evolution from %s", async (base) => {
    const valid = base !== "BT1-035";
    const s = setupEngine({
      0: { battleArea: [{ card: base, as: "base" }], hand: [{ card: "BT27-012", as: "evolution" }], deck: ["BT1-009"] },
    });
    s.state.memory = 5;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("evolution").instanceId,
        useAlternateCost: true,
      }).ok,
    ).toBe(valid);
    if (valid) {
      await settle(() => s.perm("base").topCard.cardId === "BT27-012" && !s.state.pendingDecision);
    }
    expect(s.state.memory).toBe(valid ? 2 : 5);
    expect(s.perm("base").topCard.cardId).toBe(valid ? "BT27-012" : base);
    assertNoLoudGap(s);
  });
});
