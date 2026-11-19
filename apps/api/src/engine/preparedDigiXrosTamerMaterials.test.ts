import { expect, it } from "vitest";
import "#api/cards/index";
import { setupEngine, settle } from "#api/engine/testkit/harness";

it.each([
  ["BT21-030", "BT10-087", false],
  ["BT12-112", "BT10-087", false],
  ["BT21-030", "BT19-079", true],
])(
  "%s DigiXroses from hand and under a Tamer using %s without a Shoutmon in play",
  async (cardId, expanderCardId, acceptReplacement) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: expanderCardId, as: "expander" },
            { card: "BT21-083", as: "host", under: [{ card: "BT10-008", as: "storedMaterial" }] },
          ],
          hand: [
            { card: cardId, as: "played" },
            { card: "BT21-021", as: "handMaterial" },
          ],
        },
      },
      { autoSelectCards: true, autoAcceptOptional: acceptReplacement, declinePrompts: ["attack"] },
    );
    s.state.memory = 3;
    await s.ready();
    const playedId = s.inst("played").instanceId;
    const materialIds = [s.inst("storedMaterial").instanceId, s.inst("handMaterial").instanceId];
    const findPlayed = () =>
      s.state.players[0]!.battleArea.find((permanent) => permanent.topCard.instanceId === playedId);

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: playedId })).toEqual({ ok: true });
    await settle(() => findPlayed()?.stack.length === 2 || s.events.some((event) => event.kind === "actionRejected"));

    expect(s.events.find((event) => event.kind === "actionRejected")).toBeUndefined();
    expect(
      findPlayed()
        ?.stack.map(({ instanceId }) => instanceId)
        .sort(),
    ).toEqual(materialIds.sort());
    expect(s.perm("expander").isSuspended).toBe(true);
    expect(s.perm("host").stack).toHaveLength(0);
    expect(s.state.memory).toBe(-10);
  },
);

it("keeps the expander ready when the selected materials cannot bring the play within the memory gauge", async () => {
  const s = setupEngine({
    0: {
      battleArea: [{ card: "BT10-087", as: "expander", under: [{ card: "BT10-008", as: "storedMaterial" }] }],
      hand: [{ card: "BT21-030", as: "played" }, "BT21-021"],
    },
  });
  s.state.memory = 3;
  await s.ready();
  const playedId = s.inst("played").instanceId;
  const storedMaterialId = s.inst("storedMaterial").instanceId;

  expect(s.engine.applyIntent(0, { type: "playCard", instanceId: playedId })).toEqual({ ok: true });
  await settle(() => s.decisions.length === 1);
  expect(
    s.engine.applyIntent(0, {
      type: "respondDecision",
      decisionId: s.decisions[0]!.req.decisionId,
      response: { kind: "selectCards", instanceIds: [s.perm("expander").topCard.instanceId] },
    }),
  ).toEqual({ ok: true });
  await settle(() => s.decisions.length === 2);
  expect(
    s.engine.applyIntent(0, {
      type: "respondDecision",
      decisionId: s.decisions[1]!.req.decisionId,
      response: { kind: "selectCards", instanceIds: [storedMaterialId] },
    }),
  ).toEqual({ ok: true });
  await settle(() => s.events.some((event) => event.kind === "actionRejected"));

  expect(s.events.find((event) => event.kind === "actionRejected")).toMatchObject({ reason: "insufficient-memory" });
  expect(s.perm("expander").isSuspended).toBe(false);
  expect(s.perm("expander").stack.map(({ instanceId }) => instanceId)).toEqual([storedMaterialId]);
  expect(s.state.players[0]!.hand.some(({ instanceId }) => instanceId === playedId)).toBe(true);
  expect(s.state.memory).toBe(3);
});
