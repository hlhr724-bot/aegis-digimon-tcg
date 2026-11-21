import { describe, expect, it } from "vitest";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { settle, type EngineSetup } from "#api/engine/testkit/harness";
import fixture from "#api/engine/scenarios/fragment-requires-full-count-or-decline.fixture";
import "#api/cards/index";

async function deleteFragmentHolder() {
  const s = setupScenario(fixture, { autoAcceptOptional: false, autoSelectCards: false, autoOrderTriggers: true });
  const loop = s.engine.startTurnLoop();
  await advance(s.engine).waitForMainPhase(0);
  expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("removal").instanceId })).toEqual({ ok: true });
  await settle(() => s.state.pendingDecision?.kind === "selectCards" && s.state.pendingDecision.seat === 1);
  return { s, loop };
}

function pick(s: EngineSetup, instanceIds: string[]) {
  return s.engine.applyIntent(1, {
    type: "respondDecision",
    decisionId: s.state.pendingDecision!.decisionId,
    response: { kind: "selectCards", instanceIds },
  });
}

describe("＜Fragment＞ with more digivolution cards than its count", () => {
  it("offers only the full count or a decline", async () => {
    const { s, loop } = await deleteFragmentHolder();
    try {
      expect(s.decisions.at(-1)?.req.options).toMatchObject({ min: 3, max: 3, declinesCost: true });
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  });

  it("refuses a partial pick and saves the holder once the full count is chosen", async () => {
    const { s, loop } = await deleteFragmentHolder();
    try {
      const sources = s.perm("fragmentHolder").stack.map((card) => card.instanceId);
      expect(pick(s, sources.slice(0, 2)).ok).toBe(false);
      expect(pick(s, sources.slice(0, 3))).toEqual({ ok: true });
      await settle(() => s.perm("fragmentHolder").stack.length === 2);

      expect(s.state.players[1]!.battleArea.map((permanent) => permanent.topCard.cardId)).toEqual(["BT22-061"]);
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  });
});
