import { describe, expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/galacticmon-rematch-story-adaptation.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { observe } from "#api/engine/testkit/observe";
import { settle } from "#api/engine/testkit/harness";

function setupBattle() {
  return setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: true });
}

describe("Galacticmon rematch story adaptation", () => {
  it("starts WarGreymon at 19000 DP through its real inherited effects", async () => {
    const s = setupBattle();
    await s.ready();
    const attacker = s.state.players[0]!.battleArea[0]!;
    expect(attacker.stack.map((card) => card.cardId)).toEqual(["BT21-001", "BT21-007", "BT21-015", "BT21-024"]);
    expect(attacker.currentDP).toBe(19000);
  });

  it("lets the opening Elizamon digivolve from the provided egg", async () => {
    const s = setupBattle();
    await s.ready();
    s.state.phase = Phase.Breeding;
    expect(s.engine.applyIntent(0, { type: "hatchEgg" })).toEqual({ ok: true });
    const player = s.state.players[0]!;
    s.state.phase = Phase.Main;
    const rookie = player.hand.find((card) => card.cardId === "BT21-008")!;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        instanceId: rookie.instanceId,
        permanentId: player.breeding!.permanentId,
      }),
    ).toEqual({ ok: true });
    await settle(() => player.breeding?.topCard.cardId === "BT21-008" && !s.state.pendingDecision);
    expect(player.breeding!.stack.map((card) => card.cardId)).toEqual(["BT21-001"]);
  });

  it("funds the opening Elizamon to Medusamon line with the supplied Memory Boosts", async () => {
    const s = setupBattle();
    await s.ready();
    s.state.phase = Phase.Main;
    const player = s.state.players[0]!;
    for (const boost of Array.from(player.battleArea).filter((permanent) => permanent.topCard.cardId === "P-035")) {
      expect(
        s.engine.applyIntent(0, {
          type: "activateEffect",
          sourceInstanceId: boost.topCard.instanceId,
          effectKey: observe(s.engine).activatableEffects(boost)[0]!.effectKey,
        }),
      ).toEqual({ ok: true });
      await settle(() => !s.state.pendingDecision && !player.battleArea.includes(boost));
    }
    expect(s.state.memory).toBe(8);
    const rookie = player.hand.find((card) => card.cardId === "BT21-008")!;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: rookie.instanceId })).toEqual({ ok: true });
    await settle(
      () =>
        player.battleArea.some((permanent) => permanent.topCard.instanceId === rookie.instanceId) &&
        !s.state.pendingDecision,
    );
    const host = player.battleArea.find((permanent) => permanent.topCard.instanceId === rookie.instanceId)!;
    for (const cardId of ["BT21-017", "BT24-016"]) {
      const card = player.hand.find((entry) => entry.cardId === cardId)!;
      expect(
        s.engine.applyIntent(0, { type: "digivolve", instanceId: card.instanceId, permanentId: host.permanentId }),
      ).toEqual({ ok: true });
      await settle(() => !s.state.pendingDecision && s.engine.mainVerbContinuationsInFlight === 0);
    }
    expect(host.topCard.cardId).toBe("BT24-017");
    expect(host.stack.map((card) => card.cardId)).toEqual(["BT21-008", "BT21-017", "BT24-016"]);
    expect(player.battleArea.some((permanent) => permanent.topCard.cardId === "BT21-081")).toBe(true);
    expect(s.state.memory).toBe(0);
  });

  it("provides a complete red Dragonkin evolution line and a 50-card main deck", async () => {
    const s = setupBattle();
    await s.ready();
    const player = s.state.players[0]!;
    const main = [
      ...player.hand,
      ...player.deck,
      ...player.security,
      ...player.delayZone,
      ...Array.from(player.battleArea).flatMap((permanent) => [
        permanent.topCard,
        ...permanent.stack.filter((card) => card.cardId !== "BT21-001"),
      ]),
    ].map((card) => card.cardId);
    expect(main).toHaveLength(50);
    expect(main).toContain("BT24-016");
    expect(main).toContain("BT24-017");
    expect(main).toContain("BT24-018");
    expect(main).toContain("EX11-012");
    expect(main).toContain("BT24-082");
    expect(main).toContain("EX11-054");
    expect(main.filter((card) => card === "BT21-008")).toHaveLength(4);
    expect(main.filter((card) => card === "BT24-016")).toHaveLength(4);
    expect(main.filter((card) => card === "EX11-012")).toHaveLength(3);
    expect(main.filter((card) => card === "P-035")).toHaveLength(2);
    expect(main.filter((card) => card === "BT21-026")).toHaveLength(1);
    expect(main).not.toContain("BT21-057");
    expect(main).not.toContain("BT21-061");
  });
});
