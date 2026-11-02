import { describe, expect, it } from "vitest";
import { EffectTiming } from "@aegis/shared/schema/enums";
import { advance } from "#api/engine/testkit/advance";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import "#api/cards/index";

describe("Ravemon Burst Mode mourning dance", () => {
  it.each([4, 5])("uses the hand size after discarding as the level floor (%s)", async (count) => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT27-085", as: "burst" }], hand: [{ card: "BT27-085", as: "option" }] },
        1: { hand: Array(count).fill("BT1-009"), battleArea: [{ card: "BT1-009", as: "target" }] },
      },
      { autoSelectCards: true, autoDeclineOptional: true },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId, useAs: "option" }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.some((c) => c.instanceId === s.inst("option").instanceId));
    expect(s.state.players[1]!.hand).toHaveLength(count - 1);
    expect(s.state.players[1]!.battleArea).toHaveLength(count === 4 ? 0 : 1);
  });

  it("highlights the discard and then the deletion clause", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT27-085", as: "burst" }], hand: [{ card: "BT27-085", as: "option" }] },
        1: { hand: ["BT1-009", "BT1-009"], battleArea: [{ card: "BT1-009" }, { card: "BT1-010" }] },
      },
      { autoSelectCards: true, autoDeclineOptional: true },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId, useAs: "option" }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.some((c) => c.instanceId === s.inst("option").instanceId));
    expect(s.decisions.map(({ seat, req }) => [seat, req.kind, req.options?.effectTextEmphasis])).toEqual([
      [1, "selectCards", "[Main] Your opponent trashes any 1 card from their hand or security stack."],
      [
        0,
        "chooseTargets",
        "Then, delete 1 of their Digimon with a level as high as the number of cards in their hand or higher.",
      ],
    ]);
  });

  it("may unsuspend once per turn only for an opponent hand discard", async () => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: "BT27-085", as: "burst", suspended: true }] }, 1: { hand: ["BT1-009", "BT1-011"] } },
      { autoSelectCards: true, autoAcceptOptional: true, declinePrompts: ["Arts Digivolve"] },
    );
    await s.ready();
    await advance(s.engine).fireSubTrigger("whenHandTrashed", { handTrashedSeat: 0, byEffectSeat: 0 });
    expect(s.perm("burst").isSuspended).toBe(true);
    await advance(s.engine).fireSubTrigger("whenHandTrashed", { handTrashedSeat: 1, byEffectSeat: 0 });
    expect(s.perm("burst").isSuspended).toBe(false);
    s.perm("burst").isSuspended = true;
    await advance(s.engine).fireSubTrigger("whenHandTrashed", { handTrashedSeat: 1, byEffectSeat: 0 });
    expect(s.perm("burst").isSuspended).toBe(true);
  });
  it("burst digivolves over Ravemon by returning Keenan and preserves the stack", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT27-083", as: "base", under: ["BT27-078", "BT27-081"] },
            { card: "BT26-094", as: "keenan" },
          ],
          hand: [{ card: "BT27-085", as: "burst" }],
          deck: ["BT1-009"],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("burst").instanceId,
        alternateRequirementIndex: 1,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === "BT27-085");
    expect(s.state.players[0]!.hand.map((c) => c.cardId)).toContain("BT26-094");
    expect(s.perm("base").stack.map((c) => c.cardId)).toEqual(["BT27-078", "BT27-081", "BT27-083"]);
    expect(s.state.memory).toBe(0);
  });

  it("allows declining both activation windows", async () => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: "BT27-085", as: "burst" }] }, 1: { hand: ["BT1-009"] } },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).fire(EffectTiming.WhenDigivolving, s.perm("burst"));
    await advance(s.engine).fire(EffectTiming.OnUseAttack, s.perm("burst"));
    expect(s.state.players[1]!.hand).toHaveLength(1);
  });
  it("activates Mourning Dance when digivolving and unsuspends from the actual discard", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT27-085", as: "burst", suspended: true }] },
        1: { hand: ["BT1-009", "BT1-011"], battleArea: [{ card: "BT1-009" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).fire(EffectTiming.WhenDigivolving, s.perm("burst"));
    expect(s.state.players[1]!.hand).toHaveLength(1);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.perm("burst").isSuspended).toBe(false);
  });
  it("digivolves normally over a green level six without DATA SQUAD", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-082", as: "base" }],
          hand: [{ card: "BT27-085", as: "burst" }],
          deck: ["BT1-009"],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("burst").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === "BT27-085");
    expect(s.state.memory).toBe(5);
  });

  it("rejects a blue level six without DATA SQUAD", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-038", as: "base" }],
          hand: [{ card: "BT27-085", as: "burst" }],
          deck: ["BT1-009"],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("burst").instanceId,
      }),
    ).toMatchObject({ ok: false });
    expect(s.perm("base").topCard.cardId).toBe("BT1-038");
  });
});
