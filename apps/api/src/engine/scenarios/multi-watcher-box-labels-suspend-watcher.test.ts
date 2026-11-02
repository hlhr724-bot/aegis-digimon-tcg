import { Phase } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import "#api/cards/index";
import { advance } from "#api/engine/testkit/advance";
import { settle, type EngineSetup } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";
import { multiWatcherBoxLabelsSuspendWatcher } from "#api/engine/scenarios/multi-watcher-box-labels-suspend-watcher.fixture";

const SUSPEND_CLAUSE =
  "[All Turns] [Once Per Turn] When this Digimon suspends, you may delete all of your opponent's lowest DP Digimon. Then, by trashing 1 [Craniamon] or [X Antibody] from this Digimon's digivolution cards, activate 1 [Main] effect on this card's Option side.";

type OrderOptions = {
  triggerKeys: string[];
  triggerCardIds: string[];
  triggerDescriptions: string[];
  triggerIsOptional: boolean[];
  triggerIsInherited: boolean[];
};

async function attackIntoOrderPrompt(s: EngineSetup): Promise<OrderOptions> {
  await settle(() => s.state.phase === Phase.Breeding);
  expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
  await advance(s.engine).waitForMainPhase(0);
  expect(
    s.engine.applyIntent(0, {
      type: "attack",
      attackerPermanentId: s.perm("craniamonX").permanentId,
      target: { kind: "player" },
    }),
  ).toEqual({ ok: true });
  await settle(() => s.state.pendingDecision?.kind === "orderTriggers");
  return s.decisions.findLast(({ req }) => req.kind === "orderTriggers")!.req.options as OrderOptions;
}

async function withScenario(verify: (s: EngineSetup) => Promise<void>) {
  const s = setupScenario(multiWatcherBoxLabelsSuspendWatcher(), {
    autoSelectCards: true,
    autoChooseOption: true,
    autoOrderTriggers: false,
  });
  const loop = s.engine.startTurnLoop();
  try {
    await verify(s);
  } finally {
    if (!s.state.gameOver) s.engine.applyIntent(s.state.turnSeat as 0 | 1, { type: "surrender" });
    await loop;
  }
}

describe("watcher from a box that prints several watcher lines", () => {
  it("offers the printed suspend clause as an optional effect", () =>
    withScenario(async (s) => {
      const options = await attackIntoOrderPrompt(s);
      const index = options.triggerCardIds.findIndex(
        (cardId, position) => cardId === "BT27-070" && !options.triggerIsInherited[position],
      );

      expect(options.triggerDescriptions[index]).toBe(SUSPEND_CLAUSE);
      expect(options.triggerIsOptional[index]).toBe(true);
    }));
});
