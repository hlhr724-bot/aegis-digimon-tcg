import { expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/nested-option-use-during-attack-evolution.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";

it.each([
  { arts: false, destination: "trash" },
  { arts: true, destination: "the battle area through Arts Digivolve" },
])("uses Doom Buster during Final Judgment's attack and routes it to $destination", async ({ arts }) => {
  const preferred: string[] = [];
  const s = setupScenario(fixture, {
    autoAcceptOptional: true,
    autoSelectCards: true,
    autoChooseOption: true,
    preferInstanceIds: preferred,
    declinePrompts: ["Pay the cost to reduce the cost?", "Monarchlizamon", ...(arts ? [] : ["Arts Digivolve"])],
  });
  preferred.push(s.perm("attacker").permanentId, s.inst("murasamemon").instanceId, s.inst("innerOption").instanceId);
  s.state.phase = Phase.Main;
  await s.ready();
  expect(
    s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("outerOption").instanceId, useAs: "option" }),
  ).toEqual({ ok: true });
  await settle();
  await advance(s.engine).finishAttack();
  await settle();
  expect(s.perm("attacker").topCard.cardId).toBe(arts ? "BT27-067" : "BT25-041");
  expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toEqual(
    expect.arrayContaining([s.inst("outerOption").instanceId, s.inst("evolutionCost").instanceId]),
  );
  expect(s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("innerOption").instanceId)).toBe(!arts);
  expect(
    s.events.filter(
      (event) =>
        event.kind === "effectTriggered" &&
        event.sourceCardId === "BT25-041" &&
        event.printedTiming === "WhenDigivolving",
    ),
  ).toHaveLength(1);
  expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("innerOption").instanceId)).toBe(false);
  expect(s.perm("attacker").isSuspended).toBe(false);
  expect(s.perm("attacker").currentDP).toBe(arts ? 22000 : 17000);
  expect(s.state.memory).toBe(3);
  expect(s.state.players[0]!.resolvingOption).toBeUndefined();
  expect(s.state.pendingDecision).toBeUndefined();
});

it("finishes the outer Option when Murasamemon declines the nested play or use", async () => {
  const preferred: string[] = [];
  const s = setupScenario(fixture, {
    autoAcceptOptional: true,
    autoSelectCards: true,
    autoChooseOption: true,
    preferInstanceIds: preferred,
    declinePrompts: ["Arts Digivolve", "Pay the cost to reduce the cost?", "Modal"],
  });
  preferred.push(s.perm("attacker").permanentId, s.inst("murasamemon").instanceId);
  s.state.phase = Phase.Main;
  await s.ready();
  expect(
    s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("outerOption").instanceId, useAs: "option" }),
  ).toEqual({ ok: true });
  await settle();
  await advance(s.engine).finishAttack();
  await settle();
  expect(s.perm("attacker").topCard.cardId).toBe("BT25-041");
  expect(s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("outerOption").instanceId)).toBe(true);
  expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("innerOption").instanceId)).toBe(true);
  expect(s.state.players[0]!.security).toHaveLength(1);
  expect(s.state.memory).toBe(5);
  expect(s.state.players[0]!.resolvingOption).toBeUndefined();
  expect(s.state.pendingDecision).toBeUndefined();
});

it("resolves Eclipse Impact during Final Judgment's attack before completing the outer Option", async () => {
  const eclipse = structuredClone(fixture);
  eclipse.board[0]!.hand = [
    { card: "BT25-041", as: "murasamemon" },
    { card: "BT25-057", as: "outerOption" },
    { card: "ST23-09", as: "innerOption" },
  ];
  eclipse.board[1]!.battleArea = [{ card: "BT1-010", as: "target" }];
  const preferred: string[] = [];
  const s = setupScenario(eclipse, {
    autoAcceptOptional: true,
    autoSelectCards: true,
    autoChooseOption: true,
    preferInstanceIds: preferred,
    declinePrompts: ["Pay the cost to reduce the cost?", "Monarchlizamon", "Arts Digivolve"],
  });
  preferred.push(s.perm("attacker").permanentId, s.inst("murasamemon").instanceId, s.inst("innerOption").instanceId);
  const targetId = s.inst("target").instanceId;
  s.state.phase = Phase.Main;
  await s.ready();
  expect(
    s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("outerOption").instanceId, useAs: "option" }),
  ).toEqual({ ok: true });
  await settle();
  await advance(s.engine).finishAttack();
  await settle();
  expect(s.state.players[1]!.battleArea).toHaveLength(0);
  expect(s.state.players[1]!.deck.at(-1)?.instanceId).toBe(targetId);
  expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toEqual(
    expect.arrayContaining([
      s.inst("innerOption").instanceId,
      s.inst("outerOption").instanceId,
      s.inst("evolutionCost").instanceId,
    ]),
  );
  expect(s.perm("attacker").topCard.cardId).toBe("BT25-041");
  expect(s.state.memory).toBe(3);
  expect(s.state.players[0]!.resolvingOption).toBeUndefined();
  expect(s.state.pendingDecision).toBeUndefined();
});

it("uses Penetrate Blow through Wolvermon after blocking Final Judgment's attack", async () => {
  const bearcat = structuredClone(fixture);
  bearcat.board[0]!.battleArea = [
    { card: "BT26-053", as: "attacker" },
    { card: "BT1-087", as: "tamer", under: [{ card: "BT1-009", as: "evolutionCost", faceUp: false }] },
  ];
  bearcat.board[0]!.hand = [
    { card: "BT25-057", as: "outerOption" },
    { card: "BT26-057", as: "innerOption" },
  ];
  bearcat.board[1]!.battleArea = [
    { card: "BT2-058", as: "blocker", dp: 20000 },
    { card: "BT2-058", as: "target", suspended: true, under: ["BT1-010"] },
  ];
  const preferred: string[] = [];
  const s = setupScenario(bearcat, {
    autoAcceptOptional: true,
    autoSelectCards: true,
    preferInstanceIds: preferred,
    declinePrompts: ["Arts Digivolve"],
  });
  preferred.push(s.perm("attacker").permanentId, s.inst("innerOption").instanceId, s.perm("target").permanentId);
  s.state.phase = Phase.Main;
  await s.ready();
  expect(
    s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("outerOption").instanceId, useAs: "option" }),
  ).toEqual({ ok: true });
  await settle(() => s.state.combatWindow !== undefined);
  expect(s.state.combatWindow?.kind).toBe("block");
  expect(s.engine.applyIntent(1, { type: "declareBlock", blockerPermanentId: s.perm("blocker").permanentId })).toEqual({
    ok: true,
  });
  await settle();
  await advance(s.engine).finishAttack();
  await settle();
  expect(s.perm("target").topCard.cardId).toBe("BT1-010");
  expect(s.perm("tamer").stack).toHaveLength(0);
  expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toEqual(
    expect.arrayContaining([
      s.inst("innerOption").instanceId,
      s.inst("outerOption").instanceId,
      s.inst("evolutionCost").instanceId,
    ]),
  );
  expect(s.state.memory).toBe(6);
  expect(s.state.players[0]!.resolvingOption).toBeUndefined();
  expect(s.state.pendingDecision).toBeUndefined();
});
