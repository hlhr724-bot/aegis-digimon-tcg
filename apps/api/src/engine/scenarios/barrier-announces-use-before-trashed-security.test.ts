import { Zone } from "@aegis/shared";
import { expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/drill-barrier.fixture";
import { advance } from "#api/engine/testkit/advance";
import { finishTurnLoop } from "#api/engine/testkit/finishTurnLoop";
import { settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";

it("announces Barrier and its Digimon before naming the security card it trashed", async () => {
  const s = setupScenario(fixture);
  await s.ready();
  const loop = s.engine.startTurnLoop();
  try {
    await advance(s.engine).waitForMainPhase(0);
    const angemon = s.perm("angemon");
    const trashedSecurity = s.state.players[0]!.security[0]!;
    expect(trashedSecurity.faceUp).toBe(false);
    expect(
      s.engine.applyIntent(0, { type: "attack", attackerPermanentId: angemon.permanentId, target: { kind: "player" } }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "barrierPrompt"));
    expect(JSON.stringify(s.events)).not.toContain(trashedSecurity.instanceId);
    expect(s.engine.applyIntent(0, { type: "respondBarrier", permanentId: angemon.permanentId, accept: true })).toEqual(
      {
        ok: true,
      },
    );
    await settle(
      () => s.events.some((event) => event.kind === "attackEnded") && !s.state.combatWindow && !s.state.pendingDecision,
    );
    const used = s.events.findIndex((event) => event.kind === "barrierResolved");
    expect(s.events.slice(used, used + 2)).toEqual([
      { kind: "barrierResolved", permanentId: angemon.permanentId, accepted: true },
      {
        kind: "cardsMoved",
        instanceIds: [trashedSecurity.instanceId],
        from: Zone.Security,
        to: Zone.Trash,
        cardIds: ["ST1-04"],
        artIds: ["ST1-04"],
        seat: 0,
      },
    ]);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(trashedSecurity.instanceId);
  } finally {
    await finishTurnLoop({ setup: s, loop });
  }
});
