import "#api/cards/index";
import { expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import fixture from "#api/engine/scenarios/phase-scoped-unsuspend-lock-shows-on-permanent.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import { observe } from "#api/engine/testkit/observe";

const LOCK = "unsuspendDuringOwnUnsuspendPhase";

it("publishes a lock on the next unsuspend phase as a standing restriction until it expires", async () => {
  const s = setupScenario(fixture, { autoSelectCards: true, autoDeclineOptional: true });
  await s.ready();
  s.state.phase = Phase.Main;
  const lockedId = s.perm("lockedDigimon").permanentId;
  expect(s.perm("lockedDigimon").cannotUnsuspend).toBe(false);

  expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("groundramon").instanceId })).toEqual({
    ok: true,
  });
  await settle(() => observe(s.engine).isRestricted(lockedId, LOCK) && s.state.pendingDecision === undefined);

  expect(s.perm("lockedDigimon").isSuspended).toBe(true);
  expect(s.perm("lockedDigimon").cannotUnsuspend).toBe(true);
  expect(s.perm("lockedDigimon").cannotUnsuspendAtAll).toBe(false);
  expect(s.perm("groundramon").cannotUnsuspend).toBe(false);

  s.state.turnSeat = 1;
  s.state.memory = 3;
  await advance(s.engine).runTurn(1);

  expect(observe(s.engine).isRestricted(lockedId, LOCK)).toBe(false);
  expect(s.perm("lockedDigimon").isSuspended).toBe(true);
  expect(s.perm("lockedDigimon").cannotUnsuspend).toBe(false);
});
