import { Phase } from "@aegis/shared/schema/enums";
import { describe, expect, it } from "vitest";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import fixture from "#api/engine/scenarios/simultaneous-play-entry-costs.fixture";
import "#api/cards/index";

describe("simultaneous play entry costs", () => {
  it.each([
    { machineFirst: false, resident: false },
    { machineFirst: true, resident: false },
    { machineFirst: false, resident: true },
    { machineFirst: true, resident: true },
  ])(
    "keeps fellow entrants unavailable to entry costs ($machineFirst, $resident)",
    async ({ machineFirst, resident }) => {
      const preferInstanceIds: string[] = [];
      const s = setupScenario(
        {
          ...fixture,
          board: {
            ...fixture.board,
            0: {
              ...fixture.board[0],
              battleArea: [
                { card: "P-220", as: "millenniummon" },
                ...(resident ? [{ card: "BT2-077", as: "resident" }] : []),
              ],
            },
          },
        },
        {
          preferInstanceIds,
          autoAcceptOptional: true,
          autoSelectCards: true,
          autoChooseOption: true,
          declineDigiXros: true,
          declinePrompts: ["by deleting one of your other Digimon"],
        },
      );
      preferInstanceIds.push(
        ...[
          "returnOne",
          "returnTwo",
          "returnThree",
          ...(machineFirst ? ["machinedramon", "kimeramon"] : ["kimeramon", "machinedramon"]),
        ].map((alias) => s.inst(alias).instanceId),
      );
      s.state.phase = Phase.Main;
      await s.ready();
      expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("gaiaForce").instanceId })).toEqual({
        ok: true,
      });
      await settle(
        () =>
          s.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === "BT18-073") &&
          s.state.pendingDecision === undefined,
      );
      expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId).sort()).toEqual([
        "BT18-073",
        "BT2-077",
      ]);
      expect(s.state.players[0]!.deck.slice(-3).map(({ instanceId }) => instanceId)).toEqual([
        s.inst("returnOne").instanceId,
        s.inst("returnTwo").instanceId,
        s.inst("returnThree").instanceId,
      ]);
      expect(s.state.memory).toBe(2);
      expect(s.state.players[0]!.trash.filter(({ cardId }) => cardId === "BT2-077")).toHaveLength(resident ? 1 : 0);
      expect(s.decisions.some(({ req }) => req.sourceCardId === "BT18-073")).toBe(resident);
    },
  );
});
