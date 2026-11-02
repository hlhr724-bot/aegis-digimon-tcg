import { describe, expect, it } from "vitest";
import { EffectTiming, type Seat } from "@aegis/shared/schema/enums";
import { getCardArts } from "@aegis/shared/cards/arts";
import { setupEngine, settle, settleAcrossTimers } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import "#api/cards/index";

describe("Hjaðningar Waltz", () => {
  it("offers the Craniamon X alternate art under the canonical card", () => {
    expect(getCardArts("BT27-070")).toContainEqual({
      artId: "BT27-070_P1",
      imageId: "BT27-070_P1",
      label: "BT-27: BOOSTER IGNITION OF X",
    });
  });

  it("pays three memory, stays in play, and forces the selected opponent to attack next main phase", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT2-055" }],
          hand: [{ card: "BT27-100", as: "option" }],
          security: ["BT1-009", "BT1-009"],
          deck: ["BT1-009", "BT1-009"],
        },
        1: { battleArea: [{ card: "BT1-084", as: "attacker" }], deck: ["BT1-009", "BT1-009"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 10;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(
      () => s.state.players[0]!.battleArea.some((p) => p.topCard.cardId === "BT27-100") && !s.state.pendingDecision,
    );
    expect(s.state.memory).toBe(7);
    s.state.turnSeat = 1;
    await advance(s.engine).fireGlobal(EffectTiming.OnStartMainPhase);
    await settleAcrossTimers(() => s.events.some((e) => e.kind === "attackDeclared"));
    expect(s.perm("attacker").isSuspended).toBe(true);
    await settleAcrossTimers(() => s.state.players[0]!.security.length === 1);
  });

  it("places itself in play even when no opponent can receive the attack effect", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: "BT2-055" }], hand: [{ card: "BT27-100", as: "option" }] } });
    await s.ready();
    s.state.memory = 10;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.some((p) => p.topCard.cardId === "BT27-100"));
    expect(s.state.memory).toBe(7);
  });

  it.each<{ card: string; turnSeat: Seat }>([
    { card: "BT3-075", turnSeat: 0 },
    { card: "BT27-070", turnSeat: 0 },
    { card: "BT3-075", turnSeat: 1 },
  ])(
    "trashes Delay when $card suspends on seat $turnSeat turn, de-digivolves all, then deletes the newly tied lowest costs",
    async ({ card, turnSeat }) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [
              { card, as: "craniamon" },
              { card: "BT27-100", as: "option" },
            ],
          },
          1: {
            battleArea: [
              { card: "BT1-084", under: ["BT1-009"], as: "first" },
              { card: "BT1-084", under: ["BT1-009"], as: "second" },
              { card: "BT1-084", as: "survivor" },
            ],
          },
        },
        { autoAcceptOptional: true, autoSelectCards: true, declinePrompts: ["Delete"] },
      );
      await s.ready();
      s.state.turnCount += 1;
      s.state.turnSeat = turnSeat;
      await advance(s.engine).verb.suspend([s.perm("craniamon").permanentId]);
      expect(s.state.players[0]!.trash.map((c) => c.cardId)).toContain("BT27-100");
      expect(s.state.players[1]!.battleArea.map((p) => p.topCard.cardId)).toEqual(["BT1-084"]);
      expect(s.state.players[1]!.trash.map((c) => c.cardId).sort()).toEqual([
        "BT1-009",
        "BT1-009",
        "BT1-084",
        "BT1-084",
      ]);
    },
  );

  it.each(["same turn", "other name", "opponent"])("does not consume Delay for %s", async (reason) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: reason === "other name" ? "BT2-055" : "BT3-075", as: "own" },
            { card: "BT27-100", as: "option" },
          ],
        },
        1: { battleArea: [{ card: "BT3-075", as: "opponent" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    if (reason === "same turn") {
      s.perm("option").enterFieldTurnCount = s.state.turnCount;
    } else {
      s.state.turnCount += 1;
    }
    const suspension = advance(s.engine).verb.suspend([s.perm(reason === "opponent" ? "opponent" : "own").permanentId]);
    await suspension;
    expect(s.state.players[0]!.battleArea.map((p) => p.topCard.cardId)).toContain("BT27-100");
    expect(s.state.players[0]!.trash).toHaveLength(0);
  });

  it("allows declining Delay and preserves the Option", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT3-075", as: "own" },
            { card: "BT27-100", as: "option" },
          ],
        },
      },
      { autoSelectCards: true },
    );
    await s.ready();
    s.state.turnCount += 1;
    const suspension = advance(s.engine).verb.suspend([s.perm("own").permanentId]);
    await settle(() => s.state.pendingDecision !== undefined);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: s.state.pendingDecision!.decisionId,
        response: { kind: "optional", accept: false },
      }),
    ).toEqual({ ok: true });
    await suspension;
    expect(s.state.players[0]!.battleArea.map((p) => p.topCard.cardId)).toContain("BT27-100");
    expect(s.state.players[0]!.trash).toHaveLength(0);
  });

  it("Security deletes every tied lowest play cost without de-digivolving, then returns to hand", async () => {
    const s = setupEngine(
      {
        0: { security: [{ card: "BT27-100", as: "option" }] },
        1: {
          battleArea: [
            { card: "BT1-009" },
            { card: "BT1-009" },
            { card: "BT1-084", under: ["BT1-009"], as: "survivor" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("option"));
    expect(s.state.players[1]!.battleArea.map((p) => p.topCard.cardId)).toEqual(["BT1-084"]);
    expect(s.perm("survivor").stack).toHaveLength(1);
    expect(s.state.players[0]!.hand.map((c) => c.cardId)).toEqual(["BT27-100"]);
  });
});
