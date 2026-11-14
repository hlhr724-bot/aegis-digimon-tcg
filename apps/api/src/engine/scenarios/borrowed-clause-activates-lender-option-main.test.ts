import "#api/cards/index";
import { describe, expect, it } from "vitest";
import type { DecisionResponse } from "@aegis/shared/protocol/intents";
import { advance } from "#api/engine/testkit/advance";
import { settle, type EngineSetup } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";
import fixture from "#api/engine/scenarios/borrowed-clause-activates-lender-option-main.fixture";

async function respond(s: EngineSetup, response: DecisionResponse): Promise<void> {
  await settle(() => s.state.pendingDecision !== undefined);
  const { decisionId } = s.state.pendingDecision!;
  expect(s.engine.applyIntent(0, { type: "respondDecision", decisionId, response })).toEqual({ ok: true });
  await settle(() => s.state.pendingDecision?.decisionId !== decisionId);
  await settle();
}

async function digivolveIntoJesmonGx(s: EngineSetup): Promise<void> {
  await advance(s.engine).waitForMainPhase(0);
  expect(
    s.engine.applyIntent(0, {
      type: "digivolve",
      permanentId: s.perm("jesmon").permanentId,
      instanceId: s.inst("jesmonGx").instanceId,
    }),
  ).toEqual({ ok: true });
  await respond(s, { kind: "optional", accept: true });
}

function instanceIds(cards: readonly { instanceId: string }[]): string[] {
  return cards.map(({ instanceId }) => instanceId);
}

describe("a borrowed [When Digivolving] that activates the Option side of its printed card", () => {
  it("resolves the lender's Option-side [Main] after the activator pays the cost", async () => {
    const s = setupScenario(fixture, { autoAcceptOptional: false, autoSelectCards: false });
    const loop = s.engine.runOneTurn();
    try {
      await digivolveIntoJesmonGx(s);
      await respond(s, { kind: "selectCards", instanceIds: [s.inst("jesmon").instanceId] });

      const opponent = s.state.players[1]!;
      const security = instanceIds(opponent.security);
      expect(opponent.battleArea.map((permanent) => permanent.topCard?.cardId)).toEqual(["BT1-080"]);
      expect(security).toHaveLength(3);
      expect(security.at(-1)).toBe(s.inst("magnaAngemon").instanceId);
      expect(security).not.toContain(s.inst("topSecurity").instanceId);
      expect(instanceIds(opponent.trash)).toEqual([s.inst("topSecurity").instanceId]);
      expect(instanceIds(s.state.players[0]!.deck).at(-1)).toBe(s.inst("jesmon").instanceId);
    } finally {
      if (!s.state.gameOver) s.engine.applyIntent(s.state.turnSeat as 0 | 1, { type: "surrender" });
      await loop;
    }
  });

  it("skips the Option-side [Main] when the activator declines the cost", async () => {
    const s = setupScenario(fixture, { autoAcceptOptional: false, autoSelectCards: false });
    const loop = s.engine.runOneTurn();
    try {
      await digivolveIntoJesmonGx(s);
      await respond(s, { kind: "selectCards", instanceIds: [] });

      const opponent = s.state.players[1]!;
      expect(opponent.battleArea.map((permanent) => permanent.topCard?.cardId)).toEqual(["BT1-060", "BT1-080"]);
      expect(opponent.security).toHaveLength(3);
      expect(opponent.trash).toHaveLength(0);
    } finally {
      if (!s.state.gameOver) s.engine.applyIntent(s.state.turnSeat as 0 | 1, { type: "surrender" });
      await loop;
    }
  });
});
