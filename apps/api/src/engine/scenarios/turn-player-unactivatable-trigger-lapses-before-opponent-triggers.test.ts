import { Phase } from "@aegis/shared";
import { expect, it } from "vitest";
import "#api/cards/index";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";
import { turnPlayerUnactivatableTriggerLapsesBeforeOpponentTriggers } from "./turn-player-unactivatable-trigger-lapses-before-opponent-triggers.fixture.js";

it("lapses the turn player's unactivatable [When Attacking] once the opponent's simultaneous effects begin", async () => {
  const preferInstanceIds: string[] = [];
  const s = setupScenario(turnPlayerUnactivatableTriggerLapsesBeforeOpponentTriggers(), {
    autoAcceptOptional: true,
    autoSelectCards: true,
    preferInstanceIds,
  });
  const solarmonId = s.inst("solarmon").instanceId;
  preferInstanceIds.push(solarmonId);
  const loop = s.engine.startTurnLoop();
  try {
    await settle(() => s.state.phase === Phase.Breeding);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);

    const boltmonId = s.perm("boltmon").permanentId;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("gokuumon").permanentId,
        instanceId: s.inst("seitenGokuumon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[1]!.battleArea.some((permanent) => permanent.topCard.instanceId === solarmonId) &&
        !s.state.pendingDecision,
    );

    expect(s.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === boltmonId)).toBe(false);
    const triggeredEffectKeys = s.events.flatMap((event) =>
      event.kind === "effectTriggered" ? [event.effectKey] : [],
    );
    const solarmonPlay = triggeredEffectKeys.indexOf("BT22-074/ir-11-1");
    expect(solarmonPlay).toBeGreaterThanOrEqual(0);
    expect(triggeredEffectKeys.slice(solarmonPlay)).not.toContain("EX12-015/ir-12-0");
    expect(s.state.players[1]!.battleArea.some((permanent) => permanent.topCard.instanceId === solarmonId)).toBe(true);
  } finally {
    if (!s.state.gameOver) s.engine.applyIntent(s.state.turnSeat as 0 | 1, { type: "surrender" });
    await loop;
  }
});
