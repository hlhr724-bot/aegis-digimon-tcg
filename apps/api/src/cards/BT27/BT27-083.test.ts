import { describe, expect, it } from "vitest";
import { EffectTiming } from "@aegis/shared/schema/enums";
import { advance } from "#api/engine/testkit/advance";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import "#api/cards/index";

describe("Ravemon discard and revival", () => {
  it.each([0, 7, 8, 9])("trashes down to seven or deletes when no card was trashed at %s", async (count) => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT27-083", as: "raven" }], hand: [{ card: "BT27-083", as: "option" }] },
        1: { hand: Array(count).fill("BT1-009"), battleArea: [{ card: "BT1-009", as: "target" }] },
      },
      { autoSelectCards: true, autoAcceptOptional: true, declinePrompts: ["Arts Digivolve"] },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId, useAs: "option" }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.some((c) => c.instanceId === s.inst("option").instanceId));
    expect(s.state.players[1]!.hand).toHaveLength(Math.min(7, count));
    expect(s.state.players[1]!.battleArea).toHaveLength(count <= 7 ? 0 : 1);
  });

  it.each([
    [8, 1, "selectCards", "[Main] Your opponent trashes cards in their hand so that they have 7 left."],
    [5, 0, "chooseTargets", "If this effect didn't trash, delete 1 of their Digimon."],
  ])("highlights the resolving clause at %s opponent hand cards", async (count, seat, kind, emphasis) => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT27-083", as: "raven" }], hand: [{ card: "BT27-083", as: "option" }] },
        1: { hand: Array(count).fill("BT1-009"), battleArea: [{ card: "BT1-009" }, { card: "BT1-010" }] },
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
      [seat, kind, emphasis],
    ]);
  });

  it.each([7, 8])("revives a purple bird only at seven or fewer opponent hand cards (%s)", async (count) => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT27-083", as: "raven" }], trash: ["BT27-078", "BT1-009"] },
        1: { hand: Array(count).fill("BT1-009") },
      },
      { autoSelectCards: true, autoAcceptOptional: true, declinePrompts: ["Arts Digivolve"] },
    );
    await s.ready();
    await advance(s.engine).verb.deletePermanent([s.perm("raven").permanentId]);
    expect(s.state.players[0]!.battleArea.map((p) => p.topCard.cardId)).toEqual(count === 7 ? ["BT27-078"] : []);
  });

  it("lets the opponent choose a security card without exposing its identity", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT27-083", as: "raven" }], hand: [{ card: "BT27-083", as: "option" }] },
        1: { security: ["BT1-009", "BT1-011"] },
      },
      { autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).fire(EffectTiming.WhenDigivolving, s.perm("raven"));
    expect(s.state.players[1]!.security).toHaveLength(1);
    expect(s.state.players[1]!.trash).toHaveLength(1);
    const decision = s.decisions.find((d) => d.req.kind === "selectCards");
    expect(decision?.seat).toBe(1);
    expect(decision?.req.options?.visibleCards ?? []).toEqual([]);
  });
  it("uses Arts Digivolve over Crowmon without paying evolution memory", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-081", as: "base", under: ["BT27-078"] }],
          hand: [{ card: "BT27-083", as: "option" }],
          deck: ["BT1-009"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId, useAs: "option" }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === "BT27-083");
    expect(s.perm("base").stack.map((c) => c.cardId)).toEqual(["BT27-078", "BT27-081"]);
    expect(s.state.memory).toBe(5);
  });

  it("allows declining revival", async () => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: "BT27-083", as: "raven" }], trash: ["BT27-078"] } },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).verb.deletePermanent([s.perm("raven").permanentId]);
    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.trash.map((c) => c.cardId)).toContain("BT27-078");
  });
});
