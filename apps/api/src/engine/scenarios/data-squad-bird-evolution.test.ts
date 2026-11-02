import { describe, expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import { advance } from "#api/engine/testkit/advance";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import fixture from "#api/engine/scenarios/data-squad-bird-evolution.fixture";
import "#api/cards/index";

describe("DATA SQUAD bird evolution stack", () => {
  it("retains inherited effects through real turn evolution and shares Crowmon's use with attack", async () => {
    const s = setupScenario(fixture, { autoSelectCards: true, autoDeclineOptional: true });
    const loop = s.engine.startTurnLoop();
    try {
      await settle(() => s.state.phase === Phase.Main);
      await advance(s.engine).waitForMainPhase(0);
      for (const [alias, card, memory] of [
        ["peckmon", "BT27-078", 8],
        ["crowmon", "BT27-081", 5],
      ] as const) {
        expect(
          s.engine.applyIntent(0, {
            type: "digivolve",
            permanentId: s.perm("line").permanentId,
            instanceId: s.inst(alias).instanceId,
          }),
        ).toEqual({ ok: true });
        await settle(() => s.perm("line").topCard.cardId === card && !s.state.pendingDecision);
        await advance(s.engine).waitForMainPhase(0);
        expect(s.state.memory).toBe(memory);
      }
      expect(s.perm("line").stack.map((c) => c.cardId)).toEqual(["BT26-005", "BT27-074", "BT27-078"]);
      expect(s.state.players[1]!.hand).toHaveLength(5);
      const beforeDeck = s.state.players[0]!.deck.length;
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: s.perm("line").permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.players[1]!.security.length === 2 && !s.state.pendingDecision);
      expect(s.state.players[0]!.deck).toHaveLength(beforeDeck - 1);
      expect(s.state.players[0]!.trash).toHaveLength(1);
      expect(s.state.players[1]!.hand).toHaveLength(5);
      expect(s.perm("keenan").stack).toHaveLength(1);
    } finally {
      s.engine.applyIntent(s.state.turnSeat, { type: "surrender" });
      await loop;
    }
  });
});
