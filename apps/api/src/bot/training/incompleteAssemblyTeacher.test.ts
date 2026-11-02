import { expect, it } from "vitest";
import type { DecisionRequest } from "@aegis/shared";
import { setupEngine } from "#api/engine/testkit/harness";
import { buildBotView } from "#api/bot/view";
import { createEvaluationPolicy } from "#api/bot/policy";
import { createAsyncTrainingPolicy, type TrainingWindow } from "#api/bot/training/policy";
import "#api/cards/index";

it("maps a teacher's incomplete Assembly selection onto Decline Assembly", async () => {
  const setup = setupEngine({
    0: {
      trash: [
        { card: "EX13-008", as: "levelThree" },
        { card: "EX13-018", as: "levelFour" },
        { card: "BT21-046", as: "otherLevelThree" },
      ],
    },
  });
  await setup.ready();
  const materials = [setup.inst("levelThree"), setup.inst("levelFour"), setup.inst("otherLevelThree")];
  const request: DecisionRequest = {
    decisionId: "assembly-1",
    seat: 0,
    kind: "selectCards",
    promptText: "Choose Assembly materials",
    options: {
      candidateInstanceIds: materials.map(({ instanceId }) => instanceId),
      visibleInstanceIds: materials.map(({ instanceId }) => instanceId),
      visibleCards: materials.map(({ instanceId, cardId }) => ({ instanceId, cardId })),
      min: 0,
      max: 3,
      assemblyCardId: "EX13-024",
    },
  };
  const teacher = {
    ...createEvaluationPolicy(),
    answerDecision: () => ({
      type: "respondDecision" as const,
      decisionId: request.decisionId,
      response: { kind: "selectCards" as const, instanceIds: [materials[0]!.instanceId] },
    }),
  };
  const windows: TrainingWindow[] = [];
  const policy = createAsyncTrainingPolicy(
    setup.engine,
    0,
    async (window) => {
      windows.push(window);
      return window.teacher?.action ?? -1;
    },
    teacher,
  );
  const answer = await policy.answerDecision(buildBotView(setup.state, 0)!, request);
  expect(windows.map((window) => window.actions.map(({ label }) => label))).toEqual([["Decline Assembly"]]);
  expect(windows[0]!.teacher?.action).toBe(0);
  expect(answer).toEqual({
    type: "respondDecision",
    decisionId: request.decisionId,
    response: { kind: "selectCards", instanceIds: [] },
  });
});
