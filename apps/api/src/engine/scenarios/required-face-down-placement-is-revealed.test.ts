import { describe, expect, it } from "vitest";
import "#api/cards/index";
import { Phase } from "@aegis/shared/schema/enums";
import { settle } from "#api/engine/testkit/harness";
import { identityVisibility } from "#api/cards/ST24/tamerStack.testSupport";
import fixture from "#api/engine/scenarios/required-face-down-placement-is-revealed.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";

describe("required face-down placement is revealed", () => {
  it.each(["BT26-094", "BT26-091"])("%s reveals only its paid DATA SQUAD card before hiding it", async (tamer) => {
    const s = setupScenario(
      {
        ...fixture,
        board: {
          ...fixture.board,
          0: {
            ...fixture.board[0],
            battleArea: [{ card: tamer, as: "tamer", under: [{ card: "BT1-001", as: "prior", faceUp: false }] }],
          },
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      expect(s.state.pendingDecision).toBeUndefined();
      expect(s.perm("tamer").stack.map((card) => card.instanceId)).toEqual([
        s.inst("payment").instanceId,
        s.inst("prior").instanceId,
      ]);
      expect(s.inst("payment").faceUp).toBe(false);
      expect(identityVisibility(s, s.inst("payment"))).toEqual({ owner: true, opponent: false });
      expect(s.state.memory).toBe(4);
      expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual(
        expect.arrayContaining([s.inst("unrelated").instanceId, s.inst("effectDraw").instanceId]),
      );
      expect(s.events.filter((event) => event.kind === "cardRevealed")).toEqual([
        { kind: "cardRevealed", seat: 0, cardId: "BT26-044", sourceCardId: tamer },
      ]);
      const revealIndex = s.events.findIndex((event) => event.kind === "cardRevealed");
      const placementIndex = s.events.findIndex(
        (event) => event.kind === "cardsMoved" && event.placedUnder?.permanentId === s.perm("tamer").permanentId,
      );
      expect(revealIndex).toBeLessThan(placementIndex);
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  });

  it("keeps an unrestricted hand-card payment private even under Keenan", async () => {
    const s = setupScenario(
      {
        ...fixture,
        board: {
          ...fixture.board,
          0: {
            ...fixture.board[0],
            hand: [
              { card: "BT1-009", as: "payment" },
              { card: "BT27-074", as: "falcomon" },
            ],
          },
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.phase = Phase.Main;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("falcomon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("tamer").stack.length === 2 && s.state.pendingDecision === undefined);
    expect(s.perm("tamer").stack.some((card) => card.instanceId === s.inst("payment").instanceId)).toBe(true);
    expect(s.inst("payment").faceUp).toBe(false);
    expect(s.events.filter((event) => event.kind === "cardRevealed")).toEqual([]);
  });

  it("declining the placement reveals nothing and grants no draw or memory", async () => {
    const s = setupScenario(fixture, { autoDeclineOptional: true, autoSelectCards: true });
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      expect(s.perm("tamer").stack).toHaveLength(1);
      expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("payment").instanceId);
      expect(s.state.players[0]!.deck.map((card) => card.instanceId)).toContain(s.inst("effectDraw").instanceId);
      expect(s.state.memory).toBe(3);
      expect(s.events.filter((event) => event.kind === "cardRevealed")).toEqual([]);
      expect(s.state.pendingDecision).toBeUndefined();
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  });
});
