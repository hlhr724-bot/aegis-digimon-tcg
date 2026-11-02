import { expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/mind-link-locks-suspended-digimon.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";
import { advance } from "#api/engine/testkit/advance";

it.each([
  { alreadySuspended: true, mindLink: true },
  { alreadySuspended: false, mindLink: true },
  { alreadySuspended: true, mindLink: false },
  { alreadySuspended: false, mindLink: false },
])(
  "Ginryumon targets suspended Digimon and locks only after Mind Link ($alreadySuspended, $mindLink)",
  async ({ alreadySuspended, mindLink }) => {
    const s = setupScenario(
      {
        ...fixture,
        board: {
          ...fixture.board,
          1: {
            ...fixture.board[1],
            battleArea: [{ card: "EX12-035", as: "metalgarurumon", suspended: alreadySuspended }],
          },
        },
      },
      {
        autoAcceptOptional: mindLink,
        autoDeclineOptional: !mindLink,
        autoSelectCards: true,
        preferTriggerKeys: ["BT24-086"],
      },
    );
    s.state.phase = Phase.Main;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("ginryumon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision === undefined && s.state.players[0]!.hand.length === 0);
    const ginryumon = s.state.players[0]!.battleArea.find((permanent) => permanent.topCard.cardId === "BT15-058");
    expect(ginryumon?.stack.map((card) => card.cardId)).toEqual(mindLink ? ["BT24-086"] : []);
    expect(s.perm("metalgarurumon").isSuspended).toBe(true);
    expect(observe(s.engine).hasRestriction(s.perm("metalgarurumon"), "unsuspend")).toBe(mindLink);
    expect(s.state.memory).toBe(4);
    expect(s.state.pendingDecision).toBeUndefined();
  },
);

it("keeps MetalGarurumon suspended for the next opponent turn and expires the lock afterward", async () => {
  const s = setupScenario(fixture, {
    autoAcceptOptional: true,
    autoSelectCards: true,
    preferTriggerKeys: ["BT24-086"],
  });
  await s.ready();
  const firstTurn = s.engine.runOneTurn();
  await advance(s.engine).waitForMainPhase(0);
  expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("ginryumon").instanceId })).toEqual({
    ok: true,
  });
  await settle(() => observe(s.engine).hasRestriction(s.perm("metalgarurumon"), "unsuspend"));
  advance(s.engine).endMainPhaseIfOpen(0);
  await firstTurn;
  s.state.turnSeat = 1;
  s.state.memory = 10;
  await advance(s.engine).runTurn(1);
  expect(s.perm("metalgarurumon").isSuspended).toBe(true);
  expect(observe(s.engine).hasRestriction(s.perm("metalgarurumon"), "unsuspend")).toBe(false);
  s.state.turnSeat = 0;
  s.state.memory = 10;
  await advance(s.engine).runTurn(0);
  s.state.turnSeat = 1;
  s.state.memory = 10;
  await advance(s.engine).runTurn(1);
  expect(s.perm("metalgarurumon").isSuspended).toBe(false);
  expect(s.state.pendingDecision).toBeUndefined();
});
