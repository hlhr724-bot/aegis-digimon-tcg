import { Phase } from "@aegis/shared/schema/enums";
import { expect, it } from "vitest";
import fixture from "#api/engine/scenarios/tamer-reactivates-digimon-immunity.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { assertNoLoudGap, settle } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";
import "#api/cards/BT22/BT22-074";
import "#api/cards/BT22/BT22-078";
import "#api/cards/BT22/BT22-092";
import "#api/cards/BT25/BT25-035";
import "#api/cards/BT26/BT26-057";

it.each([
  { immune: true, outcome: "protects an immune Digimon" },
  { immune: false, outcome: "deletes an unprotected Digimon" },
])("$outcome when a Tamer activates a Main effect gained from a digivolution card", async ({ immune }) => {
  const scenario = structuredClone(fixture);
  scenario.board[1]!.battleArea = scenario.board[1]!.battleArea!.map((permanent) =>
    typeof permanent === "string" || permanent.as !== "tamer"
      ? permanent
      : { ...permanent, under: [{ card: "BT1-010", as: "immunityCost", faceUp: !immune }] },
  );
  const s = setupScenario(scenario, {
    autoAcceptOptional: true,
    autoSelectCards: true,
    declinePrompts: ["Attack", "attack"],
  });
  await s.ready();
  const loop = s.engine.startTurnLoop();
  try {
    await settle(() => s.state.turnSeat === 1 && s.state.phase === Phase.Main);
    expect(
      s.engine.applyIntent(1, {
        type: "digivolve",
        permanentId: s.perm("protectedBase").permanentId,
        instanceId: s.inst("bearcatmon").instanceId,
        useAlternateCost: true,
      }).ok,
    ).toBe(true);
    await settle(() => s.perm("protectedBase").currentDP === (immune ? 11000 : 8000) && !s.state.pendingDecision);
    expect(s.state.memory).toBe(0);
    expect(s.state.players[1]!.trash.some((card) => card.instanceId === s.inst("immunityCost").instanceId)).toBe(
      immune,
    );
    expect(observe(s.engine).isRestrictedByEffect(s.perm("protectedBase"), "beAffected", "Digimon")).toBe(immune);
    expect(s.engine.applyIntent(1, { type: "endPhase" }).ok).toBe(true);
    await settle(() => s.state.turnSeat === 0 && s.state.phase === Phase.Main);
    expect(s.state.memory).toBe(3);
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("flameBase").permanentId,
        instanceId: s.inst("boltmon").instanceId,
      }).ok,
    ).toBe(true);
    await settle(
      () =>
        s.perm("jimmy").isSuspended &&
        s.state.turnSeat === 1 &&
        s.state.phase === Phase.Main &&
        !s.state.pendingDecision,
    );
    expect(s.state.players[1]!.battleArea.some((p) => p.topCard.instanceId === s.inst("bearcatmon").instanceId)).toBe(
      immune,
    );
    expect(s.state.players[1]!.trash.some((card) => card.cardId === "BT26-057")).toBe(!immune);
    expect(s.perm("flameBase").topCard.cardId).toBe("BT22-078");
    expect(s.perm("flameBase").stack.map((card) => card.cardId)).toEqual(["BT22-074"]);
    expect(s.state.memory).toBe(3);
    assertNoLoudGap(s);
  } finally {
    s.engine.applyIntent(0, { type: "surrender" });
    await loop;
  }
});
