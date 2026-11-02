import { Phase } from "@aegis/shared/schema/enums";
import { describe, expect, it } from "vitest";
import "#api/cards/BT20/BT20-077";
import "#api/cards/EX11/EX11-050";
import "#api/cards/EX7/EX7-001";
import "#api/cards/EX7/EX7-055";
import "#api/cards/EX13/EX13-077";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";
import fixture from "#api/engine/scenarios/scapegoat-preserves-ace-memory.fixture";

describe("Scapegoat preserves an ACE in a security battle", () => {
  it("deletes the aura source without charging Overflow to the surviving ACE", async () => {
    const preferred: string[] = [];
    const s = setupScenario(fixture, { autoSelectCards: true, preferInstanceIds: preferred });
    preferred.push(s.inst("scapegoatSource").instanceId);
    await s.ready();
    const loop = s.engine.startTurnLoop();
    try {
      await settle(() => s.state.phase === Phase.Breeding);
      expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
      await advance(s.engine).waitForMainPhase(0);
      const memoryBefore = s.state.memory;
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: s.perm("ace").permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.events.some((event) => event.kind === "attackEnded"));
      expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard.instanceId)).toContain(
        s.inst("ace").instanceId,
      );
      expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(s.inst("scapegoatSource").instanceId);
      expect(s.state.memory).toBe(memoryBefore);
      expect(s.events.filter((event) => event.kind === "memoryChanged" && event.reason === "overflow")).toEqual([]);
      expect(s.events).toContainEqual(
        expect.objectContaining({
          kind: "deletionPrevented",
          keyword: "Scapegoat",
          cardId: "BT20-077",
          paidCardId: "EX11-050",
        }),
      );
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  });
});
