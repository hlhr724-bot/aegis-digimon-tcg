import "#api/cards/index";
import { describe, expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import fixture from "#api/engine/scenarios/play-cost-deletion-watchers-wait-for-play.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";

const battleAreaCardIds = (s: ReturnType<typeof setupScenario>) =>
  s.state.players[0]!.battleArea.map((permanent) => permanent.topCard.cardId);

describe("effects triggered by a play-cost deletion", () => {
  it("wait for the play and share one ordering window with its [On Play]", async () => {
    const preferred: string[] = [];
    const s = setupScenario(fixture, {
      autoAcceptOptional: true,
      autoSelectCards: true,
      autoOrderTriggers: false,
      preferInstanceIds: preferred,
    });
    preferred.push(s.perm("tapirmon").permanentId, s.inst("tapirmon").instanceId);
    await s.ready();
    s.state.phase = Phase.Main;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("gizmonAt").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision?.kind === "orderTriggers");

    const order = s.decisions.find(({ req }) => req.kind === "orderTriggers")!;
    expect(order.seat).toBe(0);
    expect([...(order.req.options?.triggerCardIds ?? [])].sort()).toEqual(
      ["BT13-083", "BT2-070", "BT27-098", "BT27-102"].sort(),
    );
    expect(battleAreaCardIds(s)).toContain("BT13-083");
    expect(s.state.memory).toBe(6);
    expect(s.perm("kurata").isSuspended).toBe(false);
    expect(s.events.some((event) => event.kind === "effectTriggered")).toBe(false);
  });

  it("do not reach a watcher of battle-area Digimon when the deleted Digimon was in the breeding area", async () => {
    const s = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: true });
    await s.ready();
    s.state.phase = Phase.Main;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("protoGizmon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision === undefined && s.events.some((event) => event.kind === "digivolved"));

    expect(s.state.memory).toBe(7);
    expect(s.state.players[0]!.breeding).toBeUndefined();
    expect(s.events.some((event) => event.kind === "effectTriggered" && event.sourceCardId === "BT27-098")).toBe(false);
    const played = s.events.findIndex((event) => event.kind === "cardPlayed" && event.cardId === "BT27-075");
    const fieldWatcher = s.events.findIndex(
      (event) => event.kind === "effectTriggered" && event.sourceCardId === "BT27-102",
    );
    expect(played).toBeGreaterThan(-1);
    expect(fieldWatcher).toBeGreaterThan(played);
    expect(s.state.players[0]!.trash.map((card) => card.cardId)).toContain("BT27-102");
    expect(s.perm("kurata").topCard.cardId).toBe("BT27-048");
  });
});
