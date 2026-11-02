import { expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/security-removal-retriggers-before-pending-reactions.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { beginResolvingWindow, endResolvingWindow, settleBetweenEffects } from "#api/engine/gameEngine/windows";

it("resolves Dynasmon's newly triggered DP reduction before opposing security-removal reactions", async () => {
  const s = setupScenario(fixture, {
    autoAcceptOptional: true,
    autoSelectCards: true,
    autoChooseOption: true,
    preferTriggerKeys: ["trash-and-boost", "BT26-029"],
  });
  s.state.phase = Phase.Main;
  await s.ready();
  expect(
    s.engine.applyIntent(0, {
      type: "attack",
      attackerPermanentId: s.perm("mistymon").permanentId,
      target: { kind: "player" },
    }),
  ).toEqual({ ok: true });
  await advance(s.engine).finishAttack();
  const reductions = s.events.filter(
    (event) =>
      event.kind === "effectTriggered" && event.sourceCardId === "EX13-037" && event.timing === "whenSecurityRemoved",
  );
  expect(reductions).toHaveLength(1);
  const reduction = s.events.indexOf(reductions[0]!);
  const dedigivolution = s.events.findIndex(
    (event) => event.kind === "effectTriggered" && event.sourceCardId === "BT26-029",
  );
  expect(reduction).toBeLessThan(dedigivolution);
  expect(s.perm("wrathMode").currentDP).toBe(4000);
  expect(s.state.pendingDecision).toBeUndefined();
});

it("offers one Dynasmon OPT activation after its body removes cards from both security stacks", async () => {
  const s = setupEngine(
    {
      0: {
        hand: [{ card: "EX13-037", as: "dynasmon" }],
        security: ["BT1-009", "BT1-009", "BT1-009", "BT1-009"],
        deck: ["BT1-009", "BT1-009"],
      },
      1: {
        battleArea: [{ card: "BT26-103", as: "wrathMode" }],
        security: ["BT1-009", "BT1-009", "BT1-009"],
      },
    },
    { autoAcceptOptional: true, autoSelectCards: true },
  );
  s.state.memory = 10;
  await s.ready();
  expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("dynasmon").instanceId })).toEqual({
    ok: true,
  });
  await settle(() => s.perm("wrathMode").currentDP === 4000 && s.state.pendingDecision === undefined);
  await settle();
  expect(s.state.players[1]!.security).toHaveLength(2);
  expect(s.state.players[0]!.security).toHaveLength(4);
  expect(
    s.events.filter(
      (event) =>
        event.kind === "effectTriggered" && event.sourceCardId === "EX13-037" && event.timing === "whenSecurityRemoved",
    ),
  ).toHaveLength(1);
  const offers = s.decisions.filter(({ req }) => req.kind === "orderTriggers");
  for (const { req } of offers) {
    expect(req.options?.triggerCardIds?.filter((cardId) => cardId === "EX13-037").length ?? 0).toBeLessThanOrEqual(1);
  }
  expect(s.perm("wrathMode").currentDP).toBe(4000);
});

it("allows a declined optional security watcher to react to a later removal in the same window", async () => {
  const options = { autoDeclineOptional: true, autoAcceptOptional: false };
  const s = setupEngine(
    {
      0: { battleArea: [{ card: "BT1-009", as: "host", under: ["EX13-034"] }] },
      1: {},
    },
    options,
  );
  s.perm("host").isSuspended = true;
  await s.ready();
  const outermost = beginResolvingWindow(s.engine);
  try {
    await s.engine.fireSubTrigger("whenSecurityRemoved", { removedFromSecuritySeat: 0 });
    await settleBetweenEffects(s.engine);
    expect(s.perm("host").isSuspended).toBe(true);
    expect(s.decisions.filter(({ req }) => req.kind === "optional")).toHaveLength(1);
    options.autoDeclineOptional = false;
    options.autoAcceptOptional = true;
    await s.engine.fireSubTrigger("whenSecurityRemoved", { removedFromSecuritySeat: 0 });
    await settleBetweenEffects(s.engine);
    expect(s.perm("host").isSuspended).toBe(false);
    expect(s.decisions.filter(({ req }) => req.kind === "optional")).toHaveLength(2);
    s.perm("host").isSuspended = true;
    await s.engine.fireSubTrigger("whenSecurityRemoved", { removedFromSecuritySeat: 0 });
    await settleBetweenEffects(s.engine);
    expect(s.perm("host").isSuspended).toBe(true);
    expect(s.decisions.filter(({ req }) => req.kind === "optional")).toHaveLength(2);
    expect(s.state.pendingDecision).toBeUndefined();
  } finally {
    endResolvingWindow(s.engine, outermost);
  }
});
