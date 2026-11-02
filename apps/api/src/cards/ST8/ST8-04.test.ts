import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import "../P/P-104.js";
import "./ST8-04.js";
import "./ST8-08.js";
import "./ST8-10.js";

describe("ST8-04 Veemon", () => {
  it("digivolves into UlforceVeedramon for 4 ignoring requirements with opposing level 6", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "ST8-04", as: "veemon" }], hand: [{ card: "ST8-10", as: "ulforce" }] },
      1: { battleArea: ["ST8-10"] },
    });
    s.state.memory = 5;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("veemon").permanentId,
        instanceId: s.inst("ulforce").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("veemon").topCard.cardId === "ST8-10");
    expect(s.state.memory).toBe(1);
  });

  it("does not use the alternate path for UlforceVeedramon Zero", () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "ST8-04", as: "veemon" }], hand: [{ card: "P-048", as: "zero" }] },
      1: { battleArea: ["ST8-10"] },
    });
    s.state.memory = 5;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("veemon").permanentId,
        instanceId: s.inst("zero").instanceId,
      }),
    ).toEqual({ ok: false, reason: "invalid-evolution" });
    expect(s.state.memory).toBe(5);
  });

  it("draws 1 when its host attacks with 7 or fewer cards in hand", async () => {
    const s = setupEngine({
      0: { deck: [{ card: "ST8-02", as: "drawn" }], battleArea: [{ card: "ST8-10", as: "host", under: ["ST8-04"] }] },
      1: { security: ["ST8-01"] },
    });
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("drawn").instanceId));
  });
});

async function activateMentalTrainingDelay(opposingDigimon: string) {
  const s = setupEngine(
    {
      0: {
        battleArea: [
          { card: "P-104", as: "mentalTraining" },
          { card: "ST8-04", as: "veemon" },
        ],
        hand: [{ card: "ST8-10", as: "ulforce" }],
      },
      1: { battleArea: [opposingDigimon] },
    },
    { autoAcceptOptional: true, autoSelectCards: true },
  );
  s.state.memory = 5;
  await s.ready();
  const mentalTraining = s.perm("mentalTraining");
  const [delay] = JSON.parse(mentalTraining.activatableEffectsJson || "[]") as { effectKey: string }[];
  expect(delay).toBeDefined();
  expect(
    s.engine.applyIntent(0, {
      type: "activateEffect",
      sourceInstanceId: mentalTraining.topCard.instanceId,
      effectKey: delay!.effectKey,
    }),
  ).toEqual({ ok: true });
  await settle(() =>
    s.state.players[0]!.trash.some(({ instanceId }) => instanceId === mentalTraining.topCard.instanceId),
  );
  await settle();
  return s;
}

describe("ST8-04 Veemon — KB Q&A rulings", () => {
  it("can digivolve into [UlforceVeedramon] through another card's digivolve effect while the opponent has a level 6 (Q697)", async () => {
    const s = await activateMentalTrainingDelay("ST8-10");
    expect(s.perm("veemon").topCard.instanceId).toBe(s.inst("ulforce").instanceId);
    expect(s.state.memory).toBe(3);

    const control = await activateMentalTrainingDelay("ST8-08");
    expect(control.perm("veemon").topCard.cardId).toBe("ST8-04");
    expect(control.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual([
      control.inst("ulforce").instanceId,
    ]);
    expect(control.state.memory).toBe(5);
  });
});
