import { expect, it } from "vitest";
import "#api/cards/index";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";

it.each(["BT26-016", "BT26-033"])("offers the natural Engage attack for %s", async (card) => {
  const s = setupEngine({
    0: { deck: ["BT1-009", "BT1-009"], battleArea: [{ card, as: "attacker" }] },
    1: { security: ["BT1-009"] },
  });
  await s.ready();
  const turn = s.engine.runOneTurn();
  await advance(s.engine).waitForMainPhase(0);
  expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
  await settle(() => s.state.pendingDecision !== undefined);
  const pending = s.state.pendingDecision;
  expect(pending?.kind).toBe("optional");
  const request = s.decisions.find(({ req }) => req.decisionId === pending?.decisionId)!.req;
  expect(request.sourceCardId).toBe(card);
  expect(
    s.engine.applyIntent(0, {
      type: "respondDecision",
      decisionId: pending!.decisionId,
      response: { kind: "optional", accept: false },
    }),
  ).toEqual({ ok: true });
  await turn;
});

it("does not retrigger the end-of-turn timing when Kanan's effect evolves into Jupitermon during that timing", async () => {
  const s = setupEngine(
    {
      0: {
        deck: ["BT1-009", "BT1-009", "BT1-009"],
        security: ["BT1-009"],
        hand: [{ card: "BT26-033", as: "jupitermon" }],
        battleArea: [
          { card: "BT26-090", as: "kanan" },
          { card: "BT25-039", as: "base" },
        ],
      },
      1: { deck: ["BT1-009"], security: ["BT1-009"] },
    },
    { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
  );
  await s.ready();
  const turn = s.engine.runOneTurn();
  await advance(s.engine).waitForMainPhase(0);
  expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
  await turn;
  expect(s.perm("base").topCard.cardId).toBe("BT26-033");
  expect(
    s.events.some((e) => e.kind === "effectTriggered" && e.sourceCardId === "BT26-033" && e.timing === "OnEndTurn"),
  ).toBe(false);
  expect(s.events.some((e) => e.kind === "attackDeclared")).toBe(false);
  expect(s.state.pendingDecision).toBeUndefined();
});
