import { Phase } from "@aegis/shared/schema/enums";
import { describe, expect, it } from "vitest";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle, type EngineSetup } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";
import fixture from "#api/engine/scenarios/crimson-blaze-xros-source-play.fixture";
import "#api/cards/index";

type PlayOptionParams = { setup: EngineSetup; alias: "crimsonBlaze" | "gaiaForce" };

async function playOption({ setup, alias }: PlayOptionParams) {
  const instanceId = setup.inst(alias).instanceId;
  expect(setup.engine.applyIntent(1, { type: "playCard", instanceId })).toEqual({ ok: true });
  await settle(
    () =>
      setup.state.players[1]!.trash.some((card) => card.instanceId === instanceId) &&
      setup.state.pendingDecision === undefined,
  );
}

describe("Crimson Blaze blocks Xros source plays", () => {
  it.each([false, true])("keeps the X7 source-play prohibition separate from storing sources: %s", async (blocked) => {
    const s = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: true });
    s.state.phase = Phase.Main;
    await s.ready();
    const x7Id = s.perm("x7").permanentId;
    if (blocked) {
      await playOption({ setup: s, alias: "crimsonBlaze" });
    }
    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("gaiaForce").instanceId })).toEqual({
      ok: true,
    });
    await settle(
      () =>
        !s.state.players[0]!.battleArea.some((p) => p.permanentId === x7Id) && s.state.pendingDecision === undefined,
    );
    expect(s.perm("kotone").stack.some((c) => c.instanceId === s.inst("omniShoutmon").instanceId)).toBe(true);
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === s.inst("zeigGreymon").instanceId)).toBe(
      !blocked,
    );
  });
  it.each([false, true])("applies the effect-play prohibition to Kotone after suspending it: %s", async (blocked) => {
    const s = setupScenario(fixture, {
      autoAcceptOptional: true,
      autoSelectCards: true,
      declineDigiXros: true,
    });
    s.state.phase = Phase.Main;
    await s.ready();
    if (blocked) {
      await playOption({ setup: s, alias: "crimsonBlaze" });
    }
    s.state.turnSeat = 0;
    s.state.memory = 1;
    const effect = observe(s.engine).activatableEffects(s.perm("kotone"))[0]!;
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: s.inst("kotone").instanceId,
        effectKey: effect.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle();
    expect(s.perm("kotone").isSuspended).toBe(true);
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === s.inst("ex6").instanceId)).toBe(
      !blocked,
    );
    expect(s.perm("kotone").stack.some((c) => c.instanceId === s.inst("ex6").instanceId)).toBe(blocked);
    expect(s.state.pendingDecision).toBeUndefined();
  });
});
