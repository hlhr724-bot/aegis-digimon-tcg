import { describe, expect, it } from "vitest";
import { settle } from "#api/engine/testkit/harness";
import "#api/cards/BT26/BT26-055";
import { setupScenario } from "#api/engine/testkit/scenario";
import { Phase } from "@aegis/shared/schema/enums";
import fixture from "#api/engine/scenarios/optional-ver-three-deletion.fixture";

describe("optional Ver.3 deletion", () => {
  it("can accept face-down placement and decline deletion with multiple own targets", async () => {
    const s = setupScenario(fixture, { autoSelectCards: true });
    s.state.phase = Phase.Main;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("giromon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const placementId = s.state.pendingDecision!.decisionId;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: placementId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await settle(
      () => s.state.pendingDecision?.kind === "optional" && s.state.pendingDecision.decisionId !== placementId,
    );
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: s.state.pendingDecision!.decisionId,
        response: { kind: "optional", accept: false },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === "BT26-055") &&
        s.state.pendingDecision === undefined,
    );
    expect(s.perm("giromon").stack.map(({ instanceId, faceUp }) => ({ instanceId, faceUp }))).toEqual([
      { instanceId: s.inst("material").instanceId, faceUp: false },
    ]);
    expect(s.state.players[0]!.battleArea).toHaveLength(2);
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
    expect(s.decisions.filter(({ req }) => req.kind === "optional")).toHaveLength(2);
  });
});
