import { expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/security-replacement-digivolution-recovery.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";

it("resolves Wrath Mode's digivolution recovery after Tsunomon evolves during security battle prevention", async () => {
  const preferred: string[] = [];
  const s = setupScenario(fixture, {
    autoAcceptOptional: true,
    autoSelectCards: true,
    autoChooseOption: true,
    preferOptionIndex: 1,
    preferInstanceIds: preferred,
  });
  await s.ready();
  const turn = s.engine.runOneTurn();
  await advance(s.engine).waitForMainPhase(0);
  preferred.push(s.inst("wrath-mode").instanceId);
  expect(
    s.engine.applyIntent(0, {
      type: "attack",
      attackerPermanentId: s.perm("jupitermon").permanentId,
      target: { kind: "player" },
    }),
  ).toEqual({ ok: true });
  await settle();

  expect(s.perm("jupitermon").topCard.cardId).toBe("BT26-103");
  expect(s.state.players[0]!.security).toHaveLength(2);
  expect(
    s.events.some(
      (event) =>
        event.kind === "effectTriggered" && event.sourceCardId === "BT26-103" && event.timing === "WhenDigivolving",
    ),
  ).toBe(true);
  expect(s.state.pendingDecision).toBeUndefined();
  advance(s.engine).endMainPhaseIfOpen(0);
  await turn;
});
