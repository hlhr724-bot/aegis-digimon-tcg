import { describe, expect, it } from "vitest";
import "#api/cards/index";
import { setupEngine, settle } from "#api/engine/testkit/harness";

describe("inherited deletion trigger pends for its deleted host", () => {
  it.each([false, true])(
    "activates Pinamon after the deletion when recovery returns its source=%s",
    async (returnsSource) => {
      const preferred: string[] = [];
      const s = setupEngine(
        {
          0: {
            hand: [{ card: "BT26-016", as: "chronomon" }],
            trash: [
              { card: "BT1-009", as: "firstCost" },
              { card: "BT1-010", as: "secondCost" },
              { card: "BT1-011", as: "thirdCost" },
            ],
            deck: ["BT1-009", "BT1-010"],
            security: ["BT1-011"],
          },
          1: {
            battleArea: [
              {
                card: "BT1-009",
                as: "victim",
                under: [
                  { card: "EX4-004", as: "pinamon" },
                  { card: "BT1-010", as: "source" },
                  { card: "BT1-011", as: "otherSource" },
                ],
              },
            ],
            deck: ["BT1-011"],
          },
        },
        { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true, preferInstanceIds: preferred },
      );
      const costAliases = returnsSource
        ? ["pinamon", "source", "otherSource"]
        : ["firstCost", "secondCost", "thirdCost"];
      preferred.push(...costAliases.map((alias) => s.inst(alias).instanceId));
      s.state.memory = 10;
      await s.ready();
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("chronomon").instanceId })).toEqual({
        ok: true,
      });
      await settle(() => s.state.players[0]!.security.length === 2 && s.state.pendingDecision === undefined);
      await settle();
      expect(s.state.players[1]!.battleArea).toHaveLength(0);
      expect(s.state.players[1]!.trash).toHaveLength(returnsSource ? 1 : 4);
      expect(s.state.players[1]!.eggDeck.some(({ cardId }) => cardId === "EX4-004")).toBe(returnsSource);
      expect(
        s.events.filter((event) => event.kind === "effectResolved" && event.sourceCardId === "EX4-004"),
      ).toHaveLength(1);
      expect(s.state.memory).toBe(-3);
    },
  );
});
