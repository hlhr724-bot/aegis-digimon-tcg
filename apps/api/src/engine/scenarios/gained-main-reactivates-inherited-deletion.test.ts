import { Phase } from "@aegis/shared/schema/enums";
import { describe, expect, it } from "vitest";
import fixture from "#api/engine/scenarios/black-egg-flame-stack.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { assertNoLoudGap, settle } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";
import "#api/cards/BT22/BT22-005";
import "#api/cards/BT22/BT22-078";
import "#api/cards/BT27/BT27-007";
import "#api/cards/BT27/BT27-010";
import "#api/cards/BT27/BT27-012";

async function buildFlameStack(optionIndex: number) {
  const s = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: true, preferOptionIndex: optionIndex });
  await s.ready();
  const loop = s.engine.startTurnLoop();
  await settle(() => s.state.turnSeat === 0 && s.state.phase === Phase.Main);
  for (const alias of ["rookie", "champion", "ultimate", "mega"]) {
    const instanceId = s.inst(alias).instanceId;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId,
        useAlternateCost: alias === "ultimate" || alias === "mega",
      }).ok,
    ).toBe(true);
    await settle(() => s.perm("base").topCard.instanceId === instanceId && !s.state.pendingDecision);
  }
  expect(s.state.memory).toBe(2);
  expect(s.perm("base").stack.map((card) => card.cardId)).toEqual(["BT22-005", "BT27-007", "BT27-010", "BT27-012"]);
  expect(s.engine.applyIntent(0, { type: "endPhase" }).ok).toBe(true);
  await settle(() => s.state.turnSeat === 1 && s.state.phase === Phase.Main);
  expect(s.engine.applyIntent(1, { type: "endPhase" }).ok).toBe(true);
  await settle(() => s.state.turnSeat === 0 && s.state.phase === Phase.Breeding);
  expect(s.engine.applyIntent(0, { type: "moveFromBreeding", permanentId: s.perm("base").permanentId }).ok).toBe(true);
  await settle(
    () => s.state.players[0]!.battleArea.length === 1 && s.state.phase === Phase.Main && !s.state.pendingDecision,
  );
  expect(s.state.memory).toBe(3);
  return { ...s, loop };
}

function activateMeramonMain(s: Awaited<ReturnType<typeof buildFlameStack>>) {
  const main = observe(s.engine)
    .activatableEffects(s.perm("base"))
    .find((entry) => entry.instanceId === s.inst("champion").instanceId)!;
  expect(main).toBeDefined();
  expect(
    s.engine.applyIntent(0, {
      type: "activateEffect",
      sourceInstanceId: s.inst("champion").instanceId,
      effectKey: main.effectKey,
    }).ok,
  ).toBe(true);
  return main;
}

describe("gained Main activates the host's inherited deletion effects", () => {
  it("uses Meramon's inherited 6000 DP deletion on Boltmon without deleting its larger opponent", async () => {
    const s = await buildFlameStack(1);
    const main = activateMeramonMain(s);
    await settle(() => s.state.players[1]!.trash.length === 1 && !s.state.pendingDecision);
    expect(s.state.players[1]!.trash[0]!.instanceId).toBe(s.inst("target").instanceId);
    expect(s.state.players[1]!.battleArea.map((p) => p.topCard.instanceId)).toEqual([s.inst("larger").instanceId]);
    expect(s.state.players[1]!.security).toHaveLength(2);
    expect(s.state.memory).toBe(2);
    expect(s.state.turnSeat).toBe(0);
    expect(
      observe(s.engine)
        .activatableEffects(s.perm("base"))
        .some((entry) => entry.effectKey === main.effectKey),
    ).toBe(false);
    assertNoLoudGap(s);
    expect(s.engine.applyIntent(0, { type: "surrender" }).ok).toBe(true);
    await s.loop;
  });

  it("selects SkullMeramon's inherited security effect instead of the other inherited deletions", async () => {
    const s = await buildFlameStack(2);
    activateMeramonMain(s);
    await settle(() => s.state.players[1]!.security.length === 1 && !s.state.pendingDecision);
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toEqual([s.inst("securityTop").instanceId]);
    expect(s.state.players[1]!.battleArea).toHaveLength(2);
    expect(s.perm("base").stack).toHaveLength(4);
    expect(s.state.memory).toBe(2);
    expect(s.state.turnSeat).toBe(0);
    assertNoLoudGap(s);
    expect(s.engine.applyIntent(0, { type: "surrender" }).ok).toBe(true);
    await s.loop;
  });
});
