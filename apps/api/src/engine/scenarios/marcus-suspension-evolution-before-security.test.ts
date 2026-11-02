import { expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/marcus-suspension-evolution-before-security.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";

it("finishes Marcus's suspension evolution and Burst Mode's effect before checking security", async () => {
  const preferred: string[] = [];
  const s = setupScenario(fixture, {
    autoAcceptOptional: true,
    autoSelectCards: true,
    autoChooseOption: true,
    preferInstanceIds: preferred,
  });
  preferred.push(s.perm("marcus").permanentId, s.inst("burstMode").instanceId);
  const loop = s.engine.startTurnLoop();
  try {
    await advance(s.engine).waitForMainPhase(0);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(1);
    const suspensionResolved = s.events.findIndex(
      (event) =>
        event.kind === "effectResolved" && event.sourceCardId === "AD1-021" && event.timing === "whenSuspended",
    );
    const burstResolved = s.events.findIndex(
      (event) =>
        event.kind === "effectResolved" && event.sourceCardId === "BT25-104" && event.timing === "WhenDigivolving",
    );
    const security = s.events.findIndex((event) => event.kind === "securityRevealed");
    expect(suspensionResolved).toBeGreaterThanOrEqual(0);
    expect(burstResolved).toBeGreaterThan(suspensionResolved);
    expect(security).toBeGreaterThan(burstResolved);
    expect(s.events.find((event) => event.kind === "securityRevealed")).toMatchObject({ attackerDP: 12000 });
    expect(s.state.players[1]!.trash.some((card) => card.instanceId === s.inst("victim").instanceId)).toBe(true);
    expect(s.state.pendingDecision).toBeUndefined();
  } finally {
    s.engine.applyIntent(s.state.turnSeat, { type: "surrender" });
    await loop;
  }
});
