import fixture from "../../api/src/engine/scenarios/granted-deletion-controller.fixture";
import { fixtureInstanceId } from "../../api/src/engine/scenario/references";
import { test, expect } from "./scenario-page";

test.use({
  holdBotAfterTurn: 3,
  botMainIntents: [
    [{ type: "playCard", instanceId: fixtureInstanceId("fascination") }, { type: "endPhase" }],
    { scope: "test" },
  ],
});

test("the recipient chooses their own Seventh Fascination deletion in the real prompt", async ({ scenario }) => {
  const refs = await scenario.openFixture(
    {
      ...fixture,
      memory: 7,
      turnSeat: 1,
      board: { 0: fixture.board[1], 1: fixture.board[0] },
    },
    "normal",
    "none",
  );
  await scenario.resolveUntil((state) => state.turnSeat === 0 && state.phase === "Main" && !state.pendingDecision);
  const recipients = (await scenario.snapshot()).players[0]!.battleArea;
  expect(
    recipients.every((permanent) =>
      permanent.grantedEffectTexts.includes("[End of Your Turn] Delete 1 of your Digimon."),
    ),
  ).toBe(true);
  await scenario.page.getByRole("button", { name: /^End turn$/i }).click();
  let deletionChoices = 0;
  await scenario.resolveUntil(
    (state) =>
      state.turnSeat === 1 &&
      !state.pendingDecision &&
      state.players[0]!.trash.some((card) => card.instanceId === refs.instanceId("second")),
    (decision) => {
      if (decision.kind === "chooseTargets") {
        deletionChoices += 1;
        expect(decision.seat).toBe(0);
        expect(decision.options.candidateInstanceIds).toEqual(
          expect.arrayContaining([refs.permanentId("first"), refs.permanentId("second")]),
        );
        return { instanceId: refs.permanentId("second") };
      }
      return {};
    },
    30_000,
  );
  expect(deletionChoices).toBe(1);
  expect((await scenario.snapshot()).players[0]!.battleArea.map((permanent) => permanent.permanentId)).toEqual([
    refs.permanentId("first"),
  ]);
  await scenario.healthy();
});
