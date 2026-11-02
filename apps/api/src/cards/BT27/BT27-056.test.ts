import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import "#api/cards/index";

describe("Pristimon evolution discount and inherited Reboot", () => {
  it.each([
    ["BT27-058", 1],
    ["BT10-062", 1],
    ["BT27-077", 2],
  ])("charges the correct evolution cost into %s", async (card, cost) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-056", as: "base" }],
          hand: [{ card, as: "evolution" }],
          deck: ["BT1-009", "BT1-009"],
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
        instanceId: s.inst("evolution").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === card && !s.state.pendingDecision);
    expect(s.state.memory).toBe(10 - cost);
    expect(s.perm("base").stack.map((c) => c.cardId)).toEqual(["BT27-056"]);
  });

  it.each([
    ["BT26-004", true],
    ["BT1-003", false],
  ])("honors the Glowing Dawn egg alternate evolution from %s", async (egg, allowed) => {
    const s = setupEngine({
      0: { breeding: { card: egg, as: "egg" }, hand: [{ card: "BT27-056", as: "card" }], deck: ["BT1-009"] },
    });
    await s.ready();
    s.state.memory = 10;
    const result = s.engine.applyIntent(0, {
      type: "digivolve",
      permanentId: s.perm("egg").permanentId,
      instanceId: s.inst("card").instanceId,
    });
    expect(result.ok).toBe(allowed);
    if (allowed) await settle(() => s.perm("egg").topCard.cardId === "BT27-056");
    expect(s.state.memory).toBe(10);
  });

  it("gives Reboot only to a Digimon with Pristimon among its digivolution cards", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "BT27-058", as: "host", under: ["BT27-056"] },
          { card: "BT27-056", as: "alone" },
        ],
      },
    });
    await s.ready();
    expect([...s.perm("host").keywords]).toContain("Reboot");
    expect([...s.perm("alone").keywords]).not.toContain("Reboot");
  });
});
