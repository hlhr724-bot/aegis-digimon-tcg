import { expect, it } from "vitest";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import fixture from "#api/engine/scenarios/zero-dp-deleted-after-losing-color-buff.fixture";
import "#api/cards/BT20/BT20-017";
import "#api/cards/BT24/BT24-094";
import "#api/cards/BT25/BT25-055";
import "#api/cards/EX13/EX13-027";
import "#api/cards/EX13/EX13-028";
import "#api/cards/EX13/EX13-031";
import "#api/cards/EX13/EX13-035";

const playWatcherCardId = "BT20-017";

it("deletes a Digimon that lost its color buff at 0 DP before the next pending effect resolves", async () => {
  const preferred: string[] = [];
  const s = setupScenario(fixture, {
    autoAcceptOptional: true,
    autoSelectCards: true,
    preferInstanceIds: preferred,
    preferTriggerKeys: ["EX13-031"],
    declinePrompts: ["attack"],
  });
  const colorBuffedId = s.perm("colorBuffed").permanentId;
  const survivorId = s.perm("survivor").permanentId;
  preferred.push(colorBuffedId, s.inst("recolorCost").instanceId);
  const loop = s.engine.startTurnLoop();
  try {
    await advance(s.engine).waitForMainPhase(0);
    expect(s.perm("colorBuffed").currentDP).toBe(5000);

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("recolorer").instanceId })).toEqual({
      ok: true,
    });
    await settle(
      () =>
        s.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === playWatcherCardId) &&
        !s.state.pendingDecision,
    );

    const deletion = s.events.findIndex(
      (event) =>
        event.kind === "cardsMoved" &&
        (event.deletedPermanents ?? []).some(({ permanentId }) => permanentId === colorBuffedId),
    );
    const watcherTriggered = s.events.findIndex(
      (event) => event.kind === "effectTriggered" && event.sourceCardId === playWatcherCardId,
    );
    const watcherDeletion = s.events.findIndex(
      (event) =>
        event.kind === "cardsMoved" &&
        (event.deletedPermanents ?? []).some(({ permanentId }) => permanentId === survivorId),
    );

    expect(deletion).toBeGreaterThan(-1);
    expect(watcherTriggered).toBeGreaterThan(deletion);
    expect(watcherDeletion).toBeGreaterThan(watcherTriggered);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
  } finally {
    s.engine.applyIntent(0, { type: "surrender" });
    await loop;
  }
});
