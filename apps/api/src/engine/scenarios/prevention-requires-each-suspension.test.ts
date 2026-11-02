import { expect, it } from "vitest";
import { settle } from "#api/engine/testkit/harness";
import "#api/cards/index";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import fixture from "#api/engine/scenarios/prevention-requires-each-suspension.fixture";

it.each([false, true])(
  "requires a fresh suspension for each protection when initially suspended=%s",
  async (suspended) => {
    const s = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: true });
    s.perm("protector").isSuspended = suspended;
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(1);
      const protectorId = s.perm("protector").permanentId;
      for (let n = 1; n <= (suspended ? 1 : 3); n++) {
        const instanceId = s.inst(`removal${n}`).instanceId;
        expect(s.engine.applyIntent(1, { type: "playCard", instanceId })).toEqual({ ok: true });
        await settle(
          () =>
            s.state.players[1]!.trash.some((card) => card.instanceId === instanceId) &&
            s.state.pendingDecision === undefined,
        );
        const protector = s.state.players[0]!.battleArea.find((p) => p.permanentId === protectorId);
        const expected = suspended || n === 3 ? undefined : { isSuspended: n === 2 };
        expect(protector === undefined ? undefined : { isSuspended: protector.isSuspended }).toEqual(expected);
      }
    } finally {
      s.engine.applyIntent(1, { type: "surrender" });
      await loop;
    }
  },
);
