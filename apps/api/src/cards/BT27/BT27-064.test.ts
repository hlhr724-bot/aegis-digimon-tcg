import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import "#api/cards/index";

describe("Bearcatmon (BT27) De-Digivolve, Reina evolution and inherited security trash", () => {
  it.each([true, false])(
    "de-digivolves and forces an attack only after paying a face-down Tamer card: %s",
    async (pay) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [{ card: "BT1-085", as: "tamer", under: [{ card: "BT1-009", faceUp: false }] }],
            hand: [{ card: "BT27-064", as: "card" }],
          },
          1: { battleArea: [{ card: "BT10-064", as: "target", under: ["BT10-062"] }] },
        },
        { autoSelectCards: true, autoAcceptOptional: pay, autoDeclineOptional: !pay },
      );
      await s.ready();
      s.state.memory = 10;
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("card").instanceId })).toEqual({
        ok: true,
      });
      await settle(() => s.perm("target").topCard.cardId === "BT10-062" && !s.state.pendingDecision);
      expect(s.perm("tamer").stack).toHaveLength(pay ? 0 : 1);
      expect(s.state.memory).toBe(3);
    },
  );

  it("places Wolvermon under Pristimon and digivolves for 3 with Reina", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-056", as: "base" }, { card: "BT26-093" }],
          hand: [{ card: "BT27-064", as: "card" }],
          trash: ["BT27-058"],
          deck: ["BT1-009", "BT1-009", "BT1-009"],
        },
      },
      { autoSelectCards: true, autoDeclineOptional: true },
    );
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    s.state.memory = 10;
    const effects: { effectKey: string }[] = JSON.parse(s.inst("card").activatableEffectsJson || "[]");
    expect(effects).toHaveLength(1);
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: s.inst("card").instanceId,
        effectKey: effects[0]!.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === "BT27-064" && !s.state.pendingDecision);
    expect(s.perm("base").stack.map((c) => c.cardId)).toEqual(["BT27-058", "BT27-056"]);
    expect(s.state.memory).toBe(8);
    expect([...s.perm("base").keywords]).toEqual(expect.arrayContaining(["Reboot", "Blocker"]));
    advance(s.engine).endMainPhaseIfOpen(0);
    await turn;
  });

  it("does not offer the hand evolution without Reina", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: ["BT27-056", "BT26-095"],
          hand: [{ card: "BT27-064", as: "card" }],
          trash: ["BT27-058"],
          deck: ["BT1-009", "BT1-009"],
        },
      },
      { autoDeclineOptional: true },
    );
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    const effects: unknown[] = JSON.parse(s.inst("card").activatableEffectsJson || "[]");
    expect(effects).toHaveLength(0);
    advance(s.engine).endMainPhaseIfOpen(0);
    await turn;
  });

  it.each([
    ["BT27-077", 1],
    ["BT1-083", 2],
  ])("trashes the opponent's top security on a block only for a Glowing Dawn host (%s)", async (host, left) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: host, as: "host", under: ["BT27-064"] },
            { card: "ST6-08", as: "blocker" },
            { card: "BT1-089", as: "tamer", under: [{ card: "BT1-009", faceUp: false }] },
          ],
          deck: ["BT1-009", "BT1-009", "BT1-009"],
        },
        1: {
          battleArea: [{ card: "BT10-065", as: "attacker" }],
          security: ["BT1-009", "BT1-009"],
          deck: ["BT1-009", "BT1-009", "BT1-009"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some(({ kind }) => kind === "blockWindowOpened"));
    expect(
      s.engine.applyIntent(0, { type: "declareBlock", blockerPermanentId: s.perm("blocker").permanentId }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some(({ kind }) => kind === "combatResolved") && !s.state.pendingDecision);
    expect(s.state.players[1]!.security).toHaveLength(left);
    expect(s.perm("tamer").stack).toHaveLength(left === 1 ? 0 : 1);
    expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });
});
