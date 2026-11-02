import { expect, it } from "vitest";
import { EffectTiming, Phase } from "@aegis/shared/schema/enums";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/bracketed-name-digivolve-excludes-containing-names.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { assertNoLoudGap, settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";

const withoutGreymon = {
  ...fixture,
  board: {
    ...fixture.board,
    0: { ...fixture.board[0], hand: [{ card: "BT14-101", as: "warGreymon" }] },
  },
};

it("does not free-digivolve Agumon into WarGreymon through a [Greymon] effect", async () => {
  const s = setupScenario(withoutGreymon, { autoAcceptOptional: true, autoSelectCards: true });
  s.state.phase = Phase.Main;
  await s.ready();
  await advance(s.engine).fire(EffectTiming.OnStartMainPhase, s.perm("agumon"));
  await settle();
  expect(s.perm("agumon").topCard.cardId).toBe("BT14-007");
  expect(s.state.players[0]!.hand.map((card) => card.cardId)).toContain("BT14-101");
  expect(s.state.memory).toBe(1);
  assertNoLoudGap(s);
});

it("free-digivolves Agumon into the exact [Greymon] while WarGreymon stays in hand", async () => {
  const s = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: true });
  s.state.phase = Phase.Main;
  await s.ready();
  await advance(s.engine).fire(EffectTiming.OnStartMainPhase, s.perm("agumon"));
  await settle(() => s.perm("agumon").topCard.cardId === "BT1-015");
  expect(s.perm("agumon").topCard.cardId).toBe("BT1-015");
  expect(s.perm("agumon").stack.map((card) => card.cardId)).toEqual(["BT5-001", "BT14-007"]);
  expect(s.state.players[0]!.hand.map((card) => card.cardId)).toContain("BT14-101");
  expect(s.state.memory).toBe(1);
  assertNoLoudGap(s);
});

it("still lets Agumon digivolve into WarGreymon by paying its alternate cost of 4", async () => {
  const s = setupScenario(withoutGreymon, { autoAcceptOptional: true, autoSelectCards: true });
  s.state.phase = Phase.Main;
  s.state.memory = 4;
  await s.ready();
  expect(
    s.engine.applyIntent(0, {
      type: "digivolve",
      permanentId: s.perm("agumon").permanentId,
      instanceId: s.inst("warGreymon").instanceId,
    }),
  ).toEqual({ ok: true });
  await settle(() => s.perm("agumon").topCard.cardId === "BT14-101");
  expect(s.perm("agumon").topCard.cardId).toBe("BT14-101");
  expect(s.state.memory).toBe(0);
});
