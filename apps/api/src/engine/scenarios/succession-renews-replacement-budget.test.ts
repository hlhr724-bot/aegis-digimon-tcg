import "#api/cards/index";
import { describe, expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";
import fixture from "#api/engine/scenarios/succession-renews-replacement-budget.fixture";

describe("Succession gives a distinct once-per-turn replacement effect", () => {
  it.each([
    {
      provider: "BT24-101",
      successor: "BT26-103",
      firstMemory: 5,
      finalMemory: 0,
      firstSecurity: 1,
      opponentSecurity: 1,
    },
    {
      provider: "BT26-016",
      successor: "BT26-060",
      firstMemory: 7,
      finalMemory: 2,
      firstSecurity: 2,
      opponentSecurity: 3,
    },
  ])("$successor gains one fresh protection after $provider already prevented a return", async (scenario) => {
    const s = setupScenario(
      {
        ...fixture,
        board: {
          ...fixture.board,
          0: {
            ...fixture.board[0],
            hand: [
              { card: scenario.provider, as: "provider" },
              { card: scenario.successor, as: "successor" },
            ],
          },
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const loop = s.engine.runOneTurn();
    try {
      await settle(() => s.state.phase === Phase.Breeding);
      expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
      await advance(s.engine).waitForMainPhase(0);
      const permanentId = s.perm("base").permanentId;
      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          instanceId: s.inst("provider").instanceId,
          permanentId,
          useAlternateCost: true,
          alternateRequirementIndex: 0,
        }),
      ).toEqual({ ok: true });
      await settle(
        () =>
          s.events.some((event) => event.kind === "effectResolved" && event.effectKey === "keyword/fortitude") &&
          s.state.pendingDecision === undefined,
      );
      await settle();
      expect(s.perm("base").topCard.cardId).toBe(scenario.provider);
      expect(s.state.players[0]!.security).toHaveLength(scenario.firstSecurity);
      expect(s.state.players[1]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual(["EX12-065"]);
      expect(s.state.memory).toBe(scenario.firstMemory);

      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          instanceId: s.inst("successor").instanceId,
          permanentId,
          useAlternateCost: true,
          alternateRequirementIndex: 0,
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.players[1]!.battleArea.length === 0 && s.state.pendingDecision === undefined);
      await settle();
      expect(
        s.state.players[0]!.battleArea.find((permanent) => permanent.permanentId === permanentId)?.topCard.cardId,
      ).toBe(scenario.successor);
      expect(s.state.players[0]!.deck.some(({ instanceId }) => instanceId === s.inst("successor").instanceId)).toBe(
        false,
      );
      expect(
        s.events.filter(
          (event) =>
            event.kind === "effectResolved" && event.sourceCardId === scenario.provider && event.timing === "AllTurns",
        ),
      ).toHaveLength(2);
      expect(s.state.memory).toBe(scenario.finalMemory);
      expect(s.state.players[1]!.security).toHaveLength(scenario.opponentSecurity);
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await settle(
        () =>
          s.state.players[0]!.trash.some(({ cardId }) => cardId === scenario.successor) &&
          s.state.pendingDecision === undefined,
      );
      await settle();
      expect(s.state.players[0]!.battleArea).toHaveLength(0);
      expect(
        s.events.filter(
          (event) =>
            event.kind === "effectResolved" && event.sourceCardId === scenario.provider && event.timing === "AllTurns",
        ),
      ).toHaveLength(2);
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  });
});
