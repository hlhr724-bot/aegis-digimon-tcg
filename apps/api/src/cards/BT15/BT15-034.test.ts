import { EffectTiming } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import "../index.js";
import { compiled } from "./BT15-034.js";

describe("BT15-034", () => {
  it("moves one security card to hand or places a yellow Vaccine Digimon from hand as security", () => {
    expect(compiled.effects?.[0]?.actions[0]).toMatchObject({
      kind: "SecurityManipulation",
      op: "toHand",
      amount: 1,
      condition: { kind: "securityAtLeast", value: 3 },
      optional: true,
    });
    expect(compiled.effects?.[0]?.actions[1]).toMatchObject({
      kind: "SecurityManipulation",
      op: "placeAsSecurity",
      from: ["hand"],
      position: "choice",
      condition: { kind: "securityAtMost", value: 2 },
      optional: true,
    });
  });
  it("once per turn gives an opposing Digimon -2000 DP when its controller loses security", () =>
    expect(compiled.effects?.[1]).toMatchObject({
      trigger: "AllTurns",
      isInherited: true,
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenSecurityRemoved",
          sourceFilter: { controller: "mine" },
          actions: [{ kind: "ModifyDP", amount: -2000 }],
        },
      ],
    }));

  it("at 3 security takes the top card, then may refill after the live count becomes 2", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT15-034", as: "salamon" }],
          hand: [{ card: "BT15-033", as: "vaccine" }],
          security: [
            { card: "BT1-009", as: "top" },
            { card: "BT1-010", as: "middle" },
            { card: "BT1-009", as: "bottom" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferOptionIndex: 1 },
    );

    await advance(s.engine).fire(EffectTiming.StartOfYourMainPhase, s.perm("salamon"));
    await settle(
      () =>
        s.state.players[0]!.hand.some(({ instanceId }) => instanceId === s.inst("top").instanceId) &&
        s.state.players[0]!.security.length === 3,
    );

    expect(s.state.players[0]!.security.map(({ instanceId }) => instanceId)).toEqual([
      s.inst("middle").instanceId,
      s.inst("bottom").instanceId,
      s.inst("vaccine").instanceId,
    ]);
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).not.toContain(s.inst("vaccine").instanceId);
    expect(
      s.decisions
        .filter(({ req }) => req.kind === "optional" && req.sourceCardId === "BT15-034")
        .map(({ req }) => req.options?.effectTextPart),
    ).toEqual([
      "[Start of Your Main Phase] If you have 3 or more security cards, you may add the top card of your security stack to the hand.",
      "If you have 2 or fewer, you may place 1 yellow Digimon card with the [Vaccine] trait from your hand at the top or bottom of your security stack.",
    ]);
  });

  it("at 2 security places only a yellow Vaccine Digimon at the chosen bottom", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT15-034", as: "salamon" }],
          hand: [
            { card: "BT15-033", as: "yellowVaccine" },
            { card: "BT15-035", as: "nonVaccine" },
          ],
          security: [
            { card: "BT1-009", as: "top" },
            { card: "BT1-010", as: "bottom" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferOptionIndex: 1 },
    );

    await advance(s.engine).fire(EffectTiming.StartOfYourMainPhase, s.perm("salamon"));
    await settle(() => s.state.players[0]!.security.length === 3);

    expect(s.state.players[0]!.security.map(({ instanceId }) => instanceId)).toEqual([
      s.inst("top").instanceId,
      s.inst("bottom").instanceId,
      s.inst("yellowVaccine").instanceId,
    ]);
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual([s.inst("nonVaccine").instanceId]);
  });

  it("can instead place the yellow Vaccine at the chosen top", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT15-034", as: "salamon" }],
          hand: [{ card: "BT15-033", as: "yellowVaccine" }],
          security: [
            { card: "BT1-009", as: "oldTop" },
            { card: "BT1-010", as: "oldBottom" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferOptionIndex: 0 },
    );

    await advance(s.engine).fire(EffectTiming.StartOfYourMainPhase, s.perm("salamon"));
    await settle(() => s.state.players[0]!.security.length === 3);

    expect(s.state.players[0]!.security.map(({ instanceId }) => instanceId)).toEqual([
      s.inst("yellowVaccine").instanceId,
      s.inst("oldTop").instanceId,
      s.inst("oldBottom").instanceId,
    ]);
  });

  it("its inherited host applies -2000 DP only once when its controller loses security", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT15-035", as: "host", under: ["BT15-034"] }],
          security: ["BT1-009", "BT1-009", "BT1-009"],
        },
        1: {
          battleArea: [{ card: "BT15-029", as: "target", dp: 7000 }],
          security: ["BT1-009", "BT1-010", "BT1-009"],
          deck: ["BT1-010", "BT1-009"],
        },
      },
      { autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).verb.trashFromSecurity(1, 1);
    expect(s.perm("target").currentDP).toBe(7000);
    await advance(s.engine).verb.trashFromSecurity(0, 1);
    await settle(() => s.perm("target").currentDP === 5000);
    await advance(s.engine).verb.trashFromSecurity(0, 1);

    expect(s.perm("target").currentDP).toBe(5000);

    await advance(s.engine).runTurn(0);
    s.state.turnSeat = 1;
    s.state.memory = 3;
    const opponentTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(1);
    await advance(s.engine).verb.trashFromSecurity(0, 1);
    await settle(() => s.perm("target").currentDP === 5000);
    expect(s.perm("target").currentDP).toBe(5000);
    advance(s.engine).endMainPhaseIfOpen(1);
    await opponentTurn;
  });
});

describe("BT15-034 Salamon — KB Q&A rulings", () => {
  async function runMainPhaseStartWithSecurity(securityCount: number) {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT15-034", as: "salamon" }],
          hand: [{ card: "BT15-033", as: "yellowVaccine" }],
          security: Array.from({ length: securityCount }, () => "BT1-009"),
          deck: ["BT1-010"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, declineDigiXros: true, preferOptionIndex: 1 },
    );
    await s.ready();
    s.state.memory = 3;
    await advance(s.engine).runTurn(0);
    return s;
  }

  it("still offers the yellow Vaccine placement after the first clause drops security from 3 to 2 (Q2515)", async () => {
    const fromThree = await runMainPhaseStartWithSecurity(3);
    expect(fromThree.state.players[0]!.security).toHaveLength(3);
    expect(fromThree.state.players[0]!.security.at(-1)!.instanceId).toBe(fromThree.inst("yellowVaccine").instanceId);
    expect(fromThree.state.players[0]!.hand.map(({ instanceId }) => instanceId)).not.toContain(
      fromThree.inst("yellowVaccine").instanceId,
    );

    const fromFour = await runMainPhaseStartWithSecurity(4);
    expect(fromFour.state.players[0]!.security).toHaveLength(3);
    expect(fromFour.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toContain(
      fromFour.inst("yellowVaccine").instanceId,
    );
  });
});
