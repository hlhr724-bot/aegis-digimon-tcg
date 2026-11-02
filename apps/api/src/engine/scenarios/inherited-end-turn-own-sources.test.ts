import { expect, it } from "vitest";
import "#api/cards/index";
import { setupEngine } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";

it("each inherited Eiji effect plays only the Eiji under its own holder", async () => {
  const preferred: string[] = [];
  const s = setupEngine(
    {
      0: {
        deck: ["BT1-009", "BT1-009"],
        battleArea: [
          { card: "BT1-010", as: "first", under: [{ card: "BT17-091", as: "first-eiji" }] },
          { card: "BT1-010", as: "second", under: [{ card: "BT17-091", as: "second-eiji" }] },
        ],
      },
    },
    { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
  );
  await s.ready();
  preferred.push(s.inst("second-eiji").instanceId);
  const turn = s.engine.runOneTurn();
  await advance(s.engine).waitForMainPhase(0);
  expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
  await turn;
  expect(s.perm("first").stack).toHaveLength(0);
  expect(s.perm("second").stack).toHaveLength(0);
  expect(s.state.players[0]!.battleArea.filter(({ topCard }) => topCard.cardId === "BT17-091")).toHaveLength(2);
  expect(s.state.pendingDecision).toBeUndefined();
});
