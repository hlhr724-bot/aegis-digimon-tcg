import { digivolutionRequirementsFor, EffectTiming } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import "../BT11/BT11-072.js";
import "../BT18/BT18-073.js";
import "../EX3/EX3-013.js";
import "./BT12-072.js";

describe("BT12-072 Chaosdramon (X Antibody)", () => {
  it.each([
    ["EX3-013", "Chaosdramon"],
    ["BT11-072", "Machinedramon"],
  ])("digivolves for 2 from %s (%s) through the public intent", async (base, name) => {
    expect(digivolutionRequirementsFor("BT12-072")).toContainEqual({
      namesExact: [name],
      cost: 2,
      isAlternate: true,
    });
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: base, as: "base" }],
          hand: [{ card: "BT12-072", as: "chaosX" }],
          deck: ["BT1-009"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    s.state.memory = 2;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("chaosX").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === "BT12-072");
    expect(s.state.memory).toBe(0);
    expect(s.perm("base").stack.map(({ cardId }) => cardId)).toContain(base);
  });

  it("rejects the alternate route from an unrelated same-level Digimon", () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT12-070", as: "war" }], hand: [{ card: "BT12-072", as: "chaosX" }] },
    });
    s.state.memory = 2;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("war").permanentId,
        instanceId: s.inst("chaosX").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: false, reason: "invalid-evolution" });
  });

  it("immediately gains and activates Chaosdramon's When Digivolving effect (Q2213)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX3-013", as: "chaos" }],
          hand: [
            { card: "BT12-072", as: "chaosX" },
            { card: "BT9-065", as: "cyborg" },
          ],
          deck: ["BT1-009"],
        },
        1: { battleArea: [{ card: "BT1-025", as: "target", under: ["BT1-015"] }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    s.state.memory = 2;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("chaos").permanentId,
        instanceId: s.inst("chaosX").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("target").topCard.cardId === "BT1-015");
    expect(s.perm("chaos").stack.map(({ instanceId }) => instanceId)).toContain(s.inst("cyborg").instanceId);
    expect(s.perm("target").topCard.cardId).toBe("BT1-015");
  });

  it("places a Cyborg from trash at the bottom of its stack at start of main phase", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT12-072", as: "chaos", under: ["BT1-009"] }],
          trash: [{ card: "BT1-021", as: "cyborg" }],
        },
      },
      { autoSelectCards: true },
    );
    await advance(s.engine).fire(EffectTiming.OnStartMainPhase, s.perm("chaos"));
    expect(s.perm("chaos").stack[0]?.cardId).toBe("BT1-021");
  });

  it("trashes the top opposing security when deleted", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT12-072", as: "chaos" }] },
      1: { security: ["BT1-009", "BT1-010"] },
    });
    const topSecurityId = s.state.players[1]!.security[0]!.instanceId;
    await advance(s.engine).verb.deletePermanent([s.perm("chaos").permanentId]);
    await settle(() => s.state.players[1]!.security.length === 1);
    expect(s.state.players[1]!.security).toHaveLength(1);
    expect(s.state.players[1]!.trash.map(({ instanceId }) => instanceId)).toContain(topSecurityId);
  });

  it("retains Machinedramon's gained On Deletion effect through deletion (Q2214)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT12-072", as: "chaosX", under: ["BT11-072"] },
            { card: "BT11-092", as: "analogman" },
          ],
          hand: [{ card: "BT11-072", as: "machinedramon" }],
        },
        1: { security: ["BT1-009", "BT1-010"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    const analogId = s.inst("analogman").instanceId;
    const replacementId = s.inst("machinedramon").instanceId;
    await s.ready();
    await advance(s.engine).verb.deletePermanent([s.perm("chaosX").permanentId], "byEffect");
    await settle(() => s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === "BT11-072"));
    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.instanceId)).toContain(replacementId);
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toContain(analogId);
    expect(s.state.players[1]!.security).toHaveLength(1);
  });

  it("does not trash security when another own Digimon is deleted", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "BT12-072", as: "chaos" },
          { card: "BT1-009", as: "other" },
        ],
      },
      1: { security: ["BT1-009", "BT1-010"] },
    });
    await advance(s.engine).verb.deletePermanent([s.perm("other").permanentId]);
    await settle(() => s.state.players[0]!.battleArea.length === 1);
    expect(s.state.players[1]!.security).toHaveLength(2);
  });
});

describe("BT12-072 Chaosdramon (X Antibody) — KB Q&A rulings", () => {
  it("trashes the opponent's top security first, then prevents the deletion with gained [EX3-013 Chaosdramon] (Q2212)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            {
              card: "BT12-072",
              as: "chaosX",
              under: [{ card: "BT9-065", as: "firstLevel5" }, { card: "BT9-065", as: "secondLevel5" }, "EX3-013"],
            },
          ],
        },
        1: { security: ["BT1-009", "BT1-010"] },
      },
      {
        autoAcceptOptional: true,
        autoSelectCards: true,
        autoOrderTriggers: true,
        preferTriggerKeys: ["BT12-072"],
      },
    );
    await s.ready();
    const chaosPermanentId = s.perm("chaosX").permanentId;
    const topSecurityId = s.state.players[1]!.security[0]!.instanceId;
    const levelFiveIds = [s.inst("firstLevel5").instanceId, s.inst("secondLevel5").instanceId];

    await advance(s.engine).verb.deletePermanent([chaosPermanentId], "byEffect");
    await settle(() => s.state.players[1]!.security.length === 1);
    await settle();

    expect(s.state.players[0]!.battleArea.map(({ permanentId }) => permanentId)).toEqual([chaosPermanentId]);
    expect(s.state.players[1]!.trash.map(({ instanceId }) => instanceId)).toEqual([topSecurityId]);
    expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toEqual(expect.arrayContaining(levelFiveIds));
    expect(s.perm("chaosX").stack.map(({ cardId }) => cardId)).toEqual(["EX3-013"]);
    const trashMoves = s.events.filter((event) => event.kind === "cardsMoved" && event.to === "trash");
    expect(trashMoves.map((event) => event.kind === "cardsMoved" && event.instanceIds)).toEqual([
      [topSecurityId],
      levelFiveIds,
    ]);
  });
});

describe("BT12-072 Chaosdramon (X Antibody) gained effects", () => {
  it("does not grant a Machinedramon source's inherited effect a second time", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT12-072", as: "chaosX", under: ["BT18-073"] }] },
      1: { battleArea: [{ card: "BT1-009", as: "attacker" }] },
    });
    s.state.turnSeat = 1;
    await s.ready();

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    const offeredRedirects: string[] = [];
    while (true) {
      await settle(() => s.state.pendingDecision !== undefined || s.state.combatWindow === undefined);
      const decision = s.state.pendingDecision;
      if (decision === undefined) break;
      offeredRedirects.push(decision.kind);
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: decision.decisionId,
          response:
            decision.kind === "orderTriggers"
              ? { kind: "orderTriggers", order: [], orderIndexes: [0, 1] }
              : { kind: "optional", accept: false },
        }),
      ).toEqual({ ok: true });
    }

    expect(offeredRedirects).toEqual(["optional"]);
  });
});
