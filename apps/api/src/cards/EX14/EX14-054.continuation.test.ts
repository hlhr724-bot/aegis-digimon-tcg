import { expect, it } from "vitest";
import { EffectTiming } from "@aegis/shared/schema/enums";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import "#api/cards/index";

it("announces the opponent discard continuation before their selection and ensuing deletion trigger", async () => {
  const s = setupEngine(
    {
      0: { battleArea: [{ card: "EX14-054", as: "source" }] },
      1: { hand: [{ card: "BT1-009", as: "discard" }, "BT1-015"], battleArea: ["BT1-009"] },
    },
    { autoAcceptOptional: true },
  );
  await s.ready();
  const resolution = advance(s.engine).fire(EffectTiming.OnPlay, s.perm("source"));
  await settle(() => s.state.pendingDecision?.seat === 1);
  const continuation = s.events.filter((event) => event.kind === "effectClauseAdvanced");
  expect(continuation).toHaveLength(1);
  expect(continuation[0]).toMatchObject({
    seat: 0,
    sourceCardId: "EX14-054",
    sourceInstanceId: s.inst("source").instanceId,
    clause: "Then, your opponent trashes 1 card in their hand.",
  });
  expect(s.state.players[1]!.hand).toHaveLength(2);
  const decision = s.state.pendingDecision!;
  expect(
    s.engine.applyIntent(1, {
      type: "respondDecision",
      decisionId: decision.decisionId,
      response: { kind: "selectCards", instanceIds: [s.inst("discard").instanceId] },
    }),
  ).toEqual({ ok: true });
  await resolution;
  const continuationIndex = s.events.findIndex((event) => event.kind === "effectClauseAdvanced");
  const discardIndex = s.events.findIndex(
    (event) => event.kind === "cardsMoved" && event.from === "hand" && event.to === "trash",
  );
  const reactionIndex = s.events.findIndex(
    (event) =>
      event.kind === "effectTriggered" && event.description.includes("When your opponent's hand is trashed from"),
  );
  expect(discardIndex).toBeGreaterThan(continuationIndex);
  expect(reactionIndex).toBeGreaterThan(discardIndex);
  expect(s.events.filter((event) => event.kind === "effectClauseAdvanced")).toHaveLength(1);
  expect(s.state.players[1]!.battleArea).toHaveLength(0);
});

it("does not announce a discard continuation when the opponent has no hand", async () => {
  const s = setupEngine(
    { 0: { battleArea: [{ card: "EX14-054", as: "source" }] } },
    { autoAcceptOptional: true, autoSelectCards: true },
  );
  await s.ready();
  await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("source"));
  expect(s.events.filter((event) => event.kind === "effectClauseAdvanced")).toHaveLength(0);
});
