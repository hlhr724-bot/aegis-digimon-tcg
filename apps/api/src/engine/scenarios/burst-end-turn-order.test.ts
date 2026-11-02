import { EffectTiming } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "#api/engine/testkit/advance";
import { setupEngine } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";
import "#api/cards/index";

describe("Burst Digivolve end-of-turn ordering", () => {
  it("processes each marked permanent once and leaves ordinary evolution stacks intact", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "BT25-104", as: "burst", under: ["BT12-043", "BT1-009"] },
          { card: "BT25-104", as: "ordinary", under: ["BT12-043"] },
        ],
      },
      1: { battleArea: [{ card: "BT25-104", as: "opponent", under: ["BT12-043"] }] },
    });
    s.perm("burst").burstDigivolvePendingTrash = true;
    s.perm("opponent").burstDigivolvePendingTrash = true;
    await advance(s.engine).fireGlobal(EffectTiming.OnEndTurn);
    expect(s.perm("burst").topCard.cardId).toBe("BT1-009");
    expect(s.perm("opponent").topCard.cardId).toBe("BT12-043");
    expect(s.perm("ordinary").topCard.cardId).toBe("BT25-104");
    expect(s.decisions.find(({ req }) => req.options?.triggerKeys?.length === 2)?.seat).toBe(0);
    await advance(s.engine).fireGlobal(EffectTiming.OnEndTurn);
    expect(s.perm("burst").topCard.cardId).toBe("BT1-009");
    expect(s.perm("burst").stack).toHaveLength(1);
    expect(s.state.players[0]!.trash).toHaveLength(1);
    expect(s.state.players[1]!.trash).toHaveLength(1);
  });

  it.each([
    { card: "BT25-104", under: [] },
    { card: "BT13-095", under: ["BT12-043"] },
  ])("clears pending processing without trashing an ineligible stack: $card", async (spec) => {
    const s = setupEngine({ 0: { battleArea: [{ ...spec, as: "marked" }] } });
    s.perm("marked").burstDigivolvePendingTrash = true;
    await advance(s.engine).fireGlobal(EffectTiming.OnEndTurn);
    expect(s.perm("marked").topCard.cardId).toBe(spec.card);
    expect(s.perm("marked").burstDigivolvePendingTrash).toBe(false);
    expect(s.state.players[0]!.trash).toHaveLength(0);
  });

  it.each([true, false])("lets the turn player choose Burst processing first: %s", async (burstFirst) => {
    const preferInstanceIds: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT25-104", as: "burst", under: ["BT12-043"] },
            { card: "AD1-021", as: "marcus" },
          ],
          deck: ["BT1-009", "BT1-009"],
        },
        1: { security: ["BT1-009", "BT1-009", "BT1-009"] },
      },
      {
        autoAcceptOptional: true,
        autoSelectCards: true,
        preferInstanceIds,
        preferTriggerKeys: [burstFirst ? "burst-digivolve-trash" : "AD1-021"],
      },
    );
    preferInstanceIds.push(s.perm("marcus").topCard.instanceId);
    s.perm("burst").burstDigivolvePendingTrash = true;
    await s.ready();
    expect(s.perm("marcus").currentDP).toBe(12000);
    const end = advance(s.engine).fireGlobal(EffectTiming.OnEndTurn);
    await end;
    await advance(s.engine).finishAttack();

    const order = s.decisions.find(({ req }) => req.kind === "orderTriggers" && req.options?.triggerKeys?.length === 2);
    expect(order?.seat).toBe(0);
    expect(order?.req).toMatchObject({
      kind: "orderTriggers",
      options: { triggerCardIds: expect.arrayContaining(["BT25-104", "AD1-021"]) },
    });
    const triggered = s.events.filter((event) => event.kind === "effectTriggered");
    const burstIndex = triggered.findIndex((event) => event.effectKey.startsWith("burst-digivolve-trash/"));
    const marcusIndex = triggered.findIndex(
      (event) => event.sourceCardId === "AD1-021" && event.timing === "OnEndTurn",
    );
    expect(burstIndex).toBeGreaterThanOrEqual(0);
    expect(marcusIndex).toBeGreaterThanOrEqual(0);
    expect(burstIndex < marcusIndex).toBe(burstFirst);
    expect(s.perm("burst").topCard.cardId).toBe("BT12-043");
    expect(s.perm("burst").burstDigivolvePendingTrash).toBe(false);
    expect(s.perm("marcus").currentDP).toBe(9000);
    expect(observe(s.engine).hasKeyword(s.perm("marcus"), "Rush")).toBe(true);
    expect(s.state.players[0]!.trash.some((card) => card.cardId === "BT25-104")).toBe(true);
    expect(s.events.find((event) => event.kind === "attackDeclared")).toMatchObject({
      attackerPermanentId: s.perm("marcus").permanentId,
    });
    const peelIndex = s.events.findIndex(
      (event) => event.kind === "effectResolved" && event.effectKey.startsWith("burst-digivolve-trash/"),
    );
    const securityIndex = s.events.findIndex((event) => event.kind === "securityRevealed");
    expect(securityIndex).toBeGreaterThan(peelIndex);
  });
});
