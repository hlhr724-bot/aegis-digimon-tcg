import { expect, it } from "vitest";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import "#api/cards/index";

it("shows only Apocalymon's play-cost clause while accepting and selecting Dark Masters", async () => {
  const setup = setupEngine(
    {
      0: {
        hand: [{ card: "BT15-102", as: "apocalymon" }],
        trash: ["EX10-035", "EX10-012", "EX10-057"],
      },
    },
    { autoAcceptOptional: true, autoSelectCards: true },
  );
  setup.state.memory = 5;
  await setup.ready();
  expect(setup.engine.applyIntent(0, { type: "playCard", instanceId: setup.inst("apocalymon").instanceId })).toEqual({
    ok: true,
  });
  await settle(() => setup.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === "BT15-102"));
  const requests = setup.decisions.map(({ req }) => req).filter(({ sourceCardId }) => sourceCardId === "BT15-102");
  expect(requests.map(({ kind }) => kind)).toEqual(["optional", "selectCards"]);
  expect(requests[1]?.options).toMatchObject({ min: 0, max: 3, distinctNames: true });
  for (const request of requests) {
    expect(request.options?.effectTextPart).toBe(
      "When this card would be played, by placing up to 3 [Dark Masters] trait cards with different names from your battle area or trash under it, reduce the play cost by 4 for each one.",
    );
  }
  expect(setup.state.memory).toBe(2);
});

it.each([0, 1, 2, 3])("accepts %s Dark Masters in one selection and rejects duplicate names", async (count) => {
  const setup = setupEngine(
    {
      0: {
        hand: [{ card: "BT15-102", as: "apocalymon" }],
        battleArea: [{ card: "BT15-066", as: "fieldMachine", under: [{ card: "ST1-03", as: "oldSource" }] }],
        trash: [
          { card: "EX10-035", as: "trashMachine" },
          { card: "EX10-012", as: "seaDragon" },
          { card: "EX10-072", as: "mountain" },
        ],
      },
    },
    { autoAcceptOptional: true },
  );
  setup.state.memory = 10;
  await setup.ready();
  expect(setup.engine.applyIntent(0, { type: "playCard", instanceId: setup.inst("apocalymon").instanceId })).toEqual({
    ok: true,
  });
  await settle(() => setup.decisions.some(({ req }) => req.kind === "selectCards"));
  const request = setup.decisions.find(({ req }) => req.kind === "selectCards")!.req;
  expect(request.options).toMatchObject({ min: 0, max: 3, distinctNames: true });
  const answer = (aliases: string[]) =>
    setup.engine.applyIntent(0, {
      type: "respondDecision",
      decisionId: request.decisionId,
      response: { kind: "selectCards", instanceIds: aliases.map((alias) => setup.inst(alias).instanceId) },
    });
  expect(answer(["fieldMachine", "trashMachine"])).toMatchObject({ ok: false });
  expect(answer(["fieldMachine", "trashMachine", "seaDragon", "mountain"])).toMatchObject({ ok: false });
  const chosen = ["fieldMachine", "seaDragon", "mountain"].slice(0, count);
  expect(answer(chosen)).toEqual({ ok: true });
  await settle(() => setup.engine.mainVerbContinuationsInFlight === 0);
  const apocalymon = setup.state.players[0]!.battleArea.find(({ topCard }) => topCard.cardId === "BT15-102");
  expect(apocalymon?.stack.map(({ instanceId }) => instanceId).sort()).toEqual(
    chosen.map((alias) => setup.inst(alias).instanceId).sort(),
  );
  expect(setup.state.memory).toBe(10 - (15 - count * 4));
  expect(setup.decisions.filter(({ req }) => req.kind === "selectCards")).toHaveLength(1);
  expect(setup.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toContain(
    setup.inst("trashMachine").instanceId,
  );
  expect(
    setup.state.players[0]!.trash.some(({ instanceId }) => instanceId === setup.inst("oldSource").instanceId),
  ).toBe(count > 0);
});
