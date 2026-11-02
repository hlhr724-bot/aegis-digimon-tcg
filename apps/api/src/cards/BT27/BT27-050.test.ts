import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { EffectTiming } from "@aegis/shared/schema/enums";
import { observe } from "#api/engine/testkit/observe";
import { advance } from "#api/engine/testkit/advance";
import "#api/cards/index";

describe("Monarchlizamon hand evolution and suspension", () => {
  it("places Armalizamon under Gekkomon and digivolves for 3 with Tomoro", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-044", as: "base" }, { card: "BT27-091" }],
          hand: [{ card: "BT27-050", as: "card" }],
          trash: ["BT27-046"],
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
    await settle(() => s.perm("base").topCard.cardId === "BT27-050" && !s.state.pendingDecision);
    expect(s.perm("base").stack.map((c) => c.cardId)).toEqual(["BT27-046", "BT27-044"]);
    expect(s.state.memory).toBe(8);
    expect([...s.perm("base").keywords]).toEqual(expect.arrayContaining(["Piercing"]));
    advance(s.engine).endMainPhaseIfOpen(0);
    await turn;
  });

  it("does not offer the hand evolution without Tomoro", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: ["BT27-044", "BT26-095"],
          hand: [{ card: "BT27-050", as: "card" }],
          trash: ["BT27-046"],
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

  it.each(["BT1-060", "BT1-085"])("suspends opposing Digimon or Tamers: %s", async (card) => {
    const s = setupEngine(
      { 0: { hand: [{ card: "BT27-050", as: "card" }] }, 1: { battleArea: [{ card, as: "target" }] } },
      { autoSelectCards: true, autoAcceptOptional: true },
    );
    await s.ready();
    s.state.memory = 10;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("card").instanceId })).toEqual({ ok: true });
    await settle(() => s.perm("target").isSuspended && !s.state.pendingDecision);
    expect(s.state.memory).toBe(3);
  });

  it.each([true, false])("pays the bottom face-down card to forbid unsuspension: %s", async (pay) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT27-050", as: "host" },
            {
              card: "BT1-085",
              as: "tamer",
              under: [
                { card: "BT1-009", as: "bottom", faceUp: false },
                { card: "BT1-011", faceUp: true },
              ],
            },
          ],
        },
        1: { battleArea: [{ card: "BT1-060", as: "target" }] },
      },
      { autoSelectCards: true, autoAcceptOptional: pay, autoDeclineOptional: !pay },
    );
    await s.ready();
    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("host"));
    expect(observe(s.engine).isRestricted(s.perm("target"), "unsuspend")).toBe(pay);
    expect(s.perm("tamer").stack).toHaveLength(pay ? 1 : 2);
    expect(s.state.players[0]!.trash.some((c) => c.instanceId === s.inst("bottom").instanceId)).toBe(pay);
    await advance(s.engine).verb.unsuspend([s.perm("target").permanentId]);
    expect(s.perm("target").isSuspended).toBe(pay);
  });

  it.each(["BT27-052", "BT1-083"])("unsuspends only a Glowing Dawn host at end of attack: %s", async (card) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card, as: "host", under: ["BT27-050"] },
            {
              card: "BT1-085",
              as: "tamer",
              under: [
                { card: "BT1-009", faceUp: false },
                { card: "BT1-011", faceUp: false },
              ],
            },
          ],
        },
      },
      { autoSelectCards: true, autoAcceptOptional: true },
    );
    await s.ready();
    s.perm("host").isSuspended = true;
    await advance(s.engine).fire(EffectTiming.EndOfAttack, s.perm("host"));
    expect(s.perm("host").isSuspended).toBe(card !== "BT27-052");
    expect(s.perm("tamer").stack).toHaveLength(card === "BT27-052" ? 1 : 2);
    s.perm("host").isSuspended = true;
    await advance(s.engine).fire(EffectTiming.EndOfAttack, s.perm("host"));
    expect(s.perm("host").isSuspended).toBe(true);
    expect(s.perm("tamer").stack).toHaveLength(card === "BT27-052" ? 1 : 2);
  });

  it("keeps the unsuspend restriction through the opponent turn and expires afterward", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT27-050", as: "card" }],
          battleArea: [{ card: "BT1-085", under: [{ card: "BT1-009", faceUp: false }] }],
          deck: Array<string>(10).fill("BT1-009"),
        },
        1: { battleArea: [{ card: "BT1-060", as: "target" }], deck: Array<string>(10).fill("BT1-009") },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    s.state.memory = 10;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("card").instanceId })).toEqual({ ok: true });
    await settle(() => observe(s.engine).isRestricted(s.perm("target"), "unsuspend") && !s.state.pendingDecision);
    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);
    expect(s.perm("target").isSuspended).toBe(true);
    expect(observe(s.engine).isRestricted(s.perm("target"), "unsuspend")).toBe(true);
    advance(s.engine).endMainPhaseIfOpen(1);
    await advance(s.engine).waitForMainPhase(0);
    expect(observe(s.engine).isRestricted(s.perm("target"), "unsuspend")).toBe(false);
    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });
});
