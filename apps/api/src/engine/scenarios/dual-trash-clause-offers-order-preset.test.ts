import { Phase } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import "#api/cards/index";
import { advance } from "#api/engine/testkit/advance";
import { settle, type EngineSetup } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";
import { dualTrashClauseOffersOrderPreset } from "#api/engine/scenarios/dual-trash-clause-offers-order-preset.fixture";

const TRASH_CLAUSE =
  "[Trash] [Your Turn] When one of your [Evil], [Dark Dragon] or [Evil Dragon] trait Digimon attacks, if your hand has 4 or fewer cards, you may use this card with the cost reduced by 3.";

type OrderOptions = {
  triggerKeys: string[];
  triggerCardIds: string[];
  triggerDescriptions: string[];
  triggerIsOptional: boolean[];
};

async function attackIntoOrderPrompt(s: EngineSetup): Promise<OrderOptions> {
  await settle(() => s.state.phase === Phase.Breeding);
  expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
  await advance(s.engine).waitForMainPhase(0);
  expect(
    s.engine.applyIntent(0, {
      type: "attack",
      attackerPermanentId: s.perm("evilDragonAttacker").permanentId,
      target: { kind: "player" },
    }),
  ).toEqual({ ok: true });
  await settle(() => s.state.pendingDecision?.kind === "orderTriggers");
  return s.decisions.findLast(({ req }) => req.kind === "orderTriggers")!.req.options as OrderOptions;
}

async function withScenario(verify: (s: EngineSetup) => Promise<void>) {
  const s = setupScenario(dualTrashClauseOffersOrderPreset(), {
    autoSelectCards: true,
    autoChooseOption: true,
    autoOrderTriggers: false,
    declinePrompts: ["digivolve"],
  });
  const loop = s.engine.startTurnLoop();
  try {
    await verify(s);
  } finally {
    if (!s.state.gameOver) s.engine.applyIntent(s.state.turnSeat as 0 | 1, { type: "surrender" });
    await loop;
  }
}

describe("DUAL card [Trash] clause in the effect order prompt", () => {
  it("offers a DUAL card's [Trash] Option-side clause as an optional effect", () =>
    withScenario(async (s) => {
      const options = await attackIntoOrderPrompt(s);
      const index = options.triggerCardIds.indexOf("LM-068");

      expect(options.triggerDescriptions[index]).toBe(TRASH_CLAUSE);
      expect(options.triggerIsOptional[index]).toBe(true);
    }));

  it("honors a No preset on the [Trash] clause without asking again", () =>
    withScenario(async (s) => {
      const options = await attackIntoOrderPrompt(s);
      const trashKey = options.triggerKeys[options.triggerCardIds.indexOf("LM-068")]!;

      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: s.state.pendingDecision!.decisionId,
          response: {
            kind: "orderTriggers",
            order: [trashKey, ...options.triggerKeys.filter((key) => key !== trashKey)],
            optionalAnswers: { [trashKey]: false },
          },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision !== undefined || s.events.some(({ kind }) => kind === "attackEnded"));

      expect(s.decisions.some(({ req }) => req.kind === "optional" && req.sourceCardId === "LM-068")).toBe(false);
      expect(s.state.players[0]!.trash.map(({ cardId }) => cardId)).toContain("LM-068");
      expect(s.state.players[1]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual(["BT1-020"]);
    }));
});
