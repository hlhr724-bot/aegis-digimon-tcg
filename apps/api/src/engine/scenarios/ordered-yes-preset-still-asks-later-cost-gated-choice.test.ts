import "#api/cards/BT1/BT1-009";
import "#api/cards/BT1/BT1-010";
import "#api/cards/BT26/BT26-075";
import "#api/cards/BT27/BT27-097";
import { expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import fixture from "#api/engine/scenarios/ordered-yes-preset-still-asks-later-cost-gated-choice.fixture";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";

const USE_CLAUSE = "After, if it's your turn, by trashing 4 bottom face-down cards";

it("asks the later trash-to-use choice after a Yes preset and keeps every card when it is declined", async () => {
  const s = setupScenario(fixture, {
    autoAcceptOptional: true,
    autoSelectCards: true,
    autoOrderTriggers: false,
    declinePrompts: ["By paying"],
  });
  await s.ready();
  s.state.phase = Phase.Main;
  expect(
    s.engine.applyIntent(0, {
      type: "attack",
      attackerPermanentId: s.perm("attacker").permanentId,
      target: { kind: "player" },
    }),
  ).toEqual({ ok: true });
  await settle(() => s.state.pendingDecision?.kind === "orderTriggers");
  const options = s.decisions.at(-1)!.req.options!;
  const firstKey = options.triggerKeys!.find((_, index) => options.triggerCardIds?.[index] === "BT27-097")!;
  expect(
    s.engine.applyIntent(0, {
      type: "respondDecision",
      decisionId: s.state.pendingDecision!.decisionId,
      response: { kind: "orderTriggers", order: [firstKey], optionalAnswers: { [firstKey]: true } },
    }),
  ).toEqual({ ok: true });
  await advance(s.engine).finishAttack();

  const orderPrompts = s.decisions.filter(({ req }) => req.kind === "orderTriggers");
  const useQuestions = s.decisions.filter(
    ({ req }) => req.kind === "optional" && req.options?.effectTextPart?.startsWith(USE_CLAUSE) === true,
  );
  expect(orderPrompts).toHaveLength(1);
  expect(useQuestions).toHaveLength(2);
  expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(s.inst("beatbreakOption").instanceId);
  expect(s.perm("firstMakoto").stack).toHaveLength(4);
  expect(s.perm("secondMakoto").stack).toHaveLength(4);
  expect(s.perm("target").topCard.cardId).toBe("BT1-009");
});
