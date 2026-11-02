import { expect, it } from "vitest";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import "#api/cards/index";

it.each([3, 4])("checks %i Vemmon when granting immunity before Plutomon deletes", async (count) => {
  const s = setupEngine(
    {
      0: {
        battleArea: [{ card: "BT21-062", as: "base", under: Array.from({ length: count }, () => "BT11-061") }],
        hand: [{ card: "EX11-046", as: "evolution" }],
        deck: ["BT1-009"],
      },
      1: { hand: [{ card: "BT26-059", as: "plutomon" }, "BT1-009"] },
    },
    { autoAcceptOptional: true, autoSelectCards: true },
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
  await settle(() => s.perm("base").topCard.cardId === "EX11-046" && !s.state.pendingDecision);
  expect(s.perm("base").immuneToOpponentDigimonEffects).toBe(count === 4);
  expect([...s.perm("base").keywords].includes("Blocker")).toBe(count === 4);
  s.state.turnSeat = 1;
  s.state.memory = 10;
  expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("plutomon").instanceId })).toEqual({
    ok: true,
  });
  await settle(() => s.state.players[1]!.trash.some((card) => card.cardId === "BT1-009") && !s.state.pendingDecision);
  expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "EX11-046")).toBe(count === 4);
});
