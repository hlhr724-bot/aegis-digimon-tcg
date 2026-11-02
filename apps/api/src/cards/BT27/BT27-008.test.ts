import { describe, expect, it } from "vitest";
import { EffectTiming } from "@aegis/shared";
import { advance } from "#api/engine/testkit/advance";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";
import "#api/cards/index";

describe("Ryudamon (BT27) Chronicle draw, X Antibody evolution and inherited Raid", () => {
  it("trashes only a [Chronicle] hand card to draw 1 and gain 1 memory", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-008", as: "ryudamon" }],
          hand: [
            { card: "BT1-009", as: "unrelated" },
            { card: "BT20-048", as: "chronicle" },
          ],
          deck: [{ card: "BT1-010", as: "drawn" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );

    await advance(s.engine).fire(EffectTiming.OnStartMainPhase, s.perm("ryudamon"));

    expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toEqual([s.inst("chronicle").instanceId]);
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual(
      expect.arrayContaining([s.inst("unrelated").instanceId, s.inst("drawn").instanceId]),
    );
    expect(s.state.memory).toBe(1);
  });

  it("does nothing without a [Chronicle] hand card", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-008", as: "ryudamon" }],
          hand: [{ card: "BT1-009", as: "unrelated" }],
          deck: [{ card: "BT1-010", as: "notDrawn" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );

    await advance(s.engine).fire(EffectTiming.OnStartMainPhase, s.perm("ryudamon"));

    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual([s.inst("unrelated").instanceId]);
    expect(s.state.players[0]!.deck).toHaveLength(1);
    expect(s.state.memory).toBe(0);
  });

  it("may decline the payment without trashing, drawing or gaining memory", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-008", as: "ryudamon" }],
          hand: [{ card: "BT20-048", as: "chronicle" }],
          deck: [{ card: "BT1-010", as: "notDrawn" }],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );

    await advance(s.engine).fire(EffectTiming.OnStartMainPhase, s.perm("ryudamon"));

    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual([s.inst("chronicle").instanceId]);
    expect(s.state.players[0]!.trash).toHaveLength(0);
    expect(s.state.memory).toBe(0);
  });

  it.each([
    ["BT15-005", true, 0],
    ["BT10-005", false, 1],
  ])("digivolves from %s with the alternate route %s for %i memory", async (base, alternate, cost) => {
    const s = setupEngine({
      0: { breeding: { card: base, as: "egg" }, hand: [{ card: "BT27-008", as: "ryudamon" }] },
    });
    s.state.memory = 3;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("egg").permanentId,
        instanceId: s.inst("ryudamon").instanceId,
        ...(alternate ? { useAlternateCost: true } : {}),
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("egg").topCard.cardId === "BT27-008");
    expect(s.state.memory).toBe(3 - cost);
  });

  it("rejects the cost-0 route from a black Lv.2 without [X Antibody]", async () => {
    const s = setupEngine({
      0: { breeding: { card: "BT10-005", as: "egg" }, hand: [{ card: "BT27-008", as: "ryudamon" }] },
    });
    s.state.memory = 3;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("egg").permanentId,
        instanceId: s.inst("ryudamon").instanceId,
        useAlternateCost: true,
        alternateRequirementIndex: 1,
      }),
    ).toMatchObject({ ok: false });
    expect(s.perm("egg").topCard.cardId).toBe("BT10-005");
  });

  it("gives Raid only to a Digimon with Ryudamon in its digivolution cards", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "BT1-009", as: "host", under: ["BT27-008"] },
          { card: "BT1-009", as: "plain" },
        ],
      },
    });
    await s.ready();
    expect(observe(s.engine).hasKeyword(s.perm("host"), "Raid")).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("plain"), "Raid")).toBe(false);
  });
});
