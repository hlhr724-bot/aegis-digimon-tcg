import { describe, expect, it } from "vitest";
import "#api/cards/BT15/BT15-001";
import "#api/cards/BT15/BT15-082";
import "#api/cards/BT16/BT16-015";
import { setupEngine, settle } from "#api/engine/testkit/harness";

describe("Trash-return reactions during Phoenixmon's end-of-attack effects", () => {
  it.each([false, true])("resolves Sora after Yokomon before older effects, Blitz=%s", async (blitz) => {
    const preferInstanceIds: string[] = [];
    const sources = ["BT15-001", "BT1-013", "BT15-013", "BT1-020"];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: blitz ? "BT15-017" : "BT16-015", as: "phoenix", under: blitz ? sources : [...sources, "BT15-017"] },
            { card: "BT15-082", as: "sora" },
          ],
          hand: [...(blitz ? [{ card: "BT16-015", as: "phoenixX" }] : []), { card: "BT1-013", as: "otherBird" }],
          trash: [{ card: "BT1-013", as: "returnedBird" }],
          deck: Array<string>(8).fill("BT1-009"),
        },
        1: { security: ["BT1-009", "BT1-009", "BT1-009"] },
      },
      {
        autoAcceptOptional: true,
        autoSelectCards: true,
        autoChooseOption: true,
        preferTriggerKeys: ["BT15-001"],
        preferInstanceIds,
      },
    );
    s.state.memory = blitz ? 1 : 5;
    preferInstanceIds.push(s.inst("returnedBird").instanceId);
    await s.ready();
    const result = blitz
      ? s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: s.perm("phoenix").permanentId,
          instanceId: s.inst("phoenixX").instanceId,
          useAlternateCost: true,
        })
      : s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: s.perm("phoenix").permanentId,
          target: { kind: "player" },
        });
    expect(result).toEqual({ ok: true });
    if (blitz) {
      await settle(() => s.engine.pendingBlitzAttack !== undefined);
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: s.perm("phoenix").permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
    }
    await settle(() => s.events.some((e) => e.kind === "attackEnded") && s.state.pendingDecision === undefined);
    const yokomon = s.events.findIndex((e) => e.kind === "effectResolved" && e.sourceCardId === "BT15-001");
    const sora = s.events.findIndex((e) => e.kind === "effectTriggered" && e.sourceCardId === "BT15-082");
    const phoenix = s.events.findIndex(
      (e) => e.kind === "effectTriggered" && e.sourceCardId === "BT16-015" && e.timing === "OnEndAttack",
    );
    expect(yokomon).toBeGreaterThan(-1);
    expect(sora).toBeGreaterThan(yokomon);
    expect(phoenix).toBeGreaterThan(sora);
    const soraResolved = s.events.findIndex((e) => e.kind === "effectResolved" && e.sourceCardId === "BT15-082");
    expect(soraResolved).toBeGreaterThan(sora);
    expect(phoenix).toBeGreaterThan(soraResolved);
    expect(s.events.filter((e) => e.kind === "effectTriggered" && e.sourceCardId === "BT15-082")).toHaveLength(1);
    expect(s.events.filter((e) => e.kind === "effectResolved" && e.sourceCardId === "BT15-082")).toHaveLength(1);
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === s.inst("returnedBird").instanceId)).toBe(
      true,
    );
    expect(s.state.players[0]!.hand.some((c) => c.instanceId === s.inst("sora").instanceId)).toBe(true);
  });
});
