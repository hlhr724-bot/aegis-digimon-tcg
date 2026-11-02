import "#api/cards/index";
import { describe, expect, it } from "vitest";
import type { ServerEvent } from "@aegis/shared";
import { Phase } from "@aegis/shared/schema/enums";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";
import fixture from "#api/engine/scenarios/habakirimon-declined-trash-spends-once-per-turn.fixture";

const trashPrompt = "Trash the top security card of 1 player with the most security cards?";

describe("Habakirimon's declined security trash still spends its shared [Once Per Turn]", () => {
  it("recovers on digivolve, lets the player skip the trash, and does not trigger again when attacking", async () => {
    const s = setupScenario(fixture);
    const loop = s.engine.runOneTurn();
    try {
      await advance(s.engine).waitForMainPhase(0);
      const host = s.perm("yellowBase");
      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: host.permanentId,
          instanceId: s.inst("habakirimon").instanceId,
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision?.promptText === trashPrompt);
      const trash = s.state.pendingDecision!;
      expect(trash.seat).toBe(0);
      expect(JSON.parse(trash.payloadJson)).toMatchObject({ candidateInstanceIds: ["opponent"], min: 0, max: 1 });
      expect(s.state.players[0]!.security).toHaveLength(3);
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: trash.decisionId,
          response: { kind: "selectCards", instanceIds: [] },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.engine.mainVerbContinuationsInFlight === 0 && s.state.pendingDecision === undefined);
      expect(host.topCard.cardId).toBe("BT25-043");
      expect(s.state.players[0]!.security).toHaveLength(3);
      expect(s.state.players[1]!.security).toHaveLength(4);

      expect(
        s.engine.applyIntent(0, { type: "attack", attackerPermanentId: host.permanentId, target: { kind: "player" } }),
      ).toEqual({ ok: true });
      await settle(
        () =>
          s.state.players[1]!.security.length === 3 &&
          s.engine.mainVerbContinuationsInFlight === 0 &&
          s.state.pendingDecision === undefined &&
          s.state.phase === Phase.Main,
      );
      expect(host.isSuspended).toBe(true);
      expect(s.state.players[0]!.security).toHaveLength(3);
      const habakirimonResolutions = s.events.filter(
        (event): event is Extract<ServerEvent, { kind: "effectResolved" }> =>
          event.kind === "effectResolved" && event.sourceCardId === "BT25-043",
      );
      expect(habakirimonResolutions.map((event) => event.timing)).toEqual(["WhenDigivolving"]);
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  });
});
