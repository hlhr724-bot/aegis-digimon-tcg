import { expect, it } from "vitest";
import type { Intent } from "@aegis/shared/protocol/intents";
import type { ServerEvent } from "@aegis/shared/protocol/events";
import { createLiveSearchPolicy } from "#api/bot/search/createLiveSearchPolicy";
import { createEvaluationPolicy, type BlockContext, type BotPolicy } from "#api/bot/policy";
import { DEFAULT_BOT_PROFILE } from "#api/bot/profiles";
import { SEED_RESIDUAL } from "#api/bot/evolution/residualPolicy";
import { buildBotView } from "#api/bot/view";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import { SeededRandom } from "#api/engine/random/SeededRandom";

type AnswerParams = { block: Intent; counter: Intent };

function createAnsweringPolicy({ block, counter }: AnswerParams): BotPolicy {
  return { ...createEvaluationPolicy(), chooseBlockResponse: () => block, chooseCounterResponse: () => counter };
}

async function openBlockWindow() {
  const setup = setupEngine({
    0: {
      battleArea: [{ card: "BT20-047", as: "blocker", dp: 7000 }],
      security: ["BT1-009", "BT1-010"],
      deck: ["BT1-013", "BT1-014", "BT1-015"],
    },
    1: { battleArea: [{ card: "BT1-009", as: "attacker" }], security: ["BT1-009"], deck: ["BT1-013", "BT1-014"] },
  });
  setup.state.turnSeat = 1;
  setup.engine.randomStreams = [new SeededRandom({ seed: 5 }), new SeededRandom({ seed: 6 })];
  const loop = setup.engine.startTurnLoop();
  await advance(setup.engine).waitForMainPhase(1);
  setup.engine.applyIntent(1, {
    type: "attack",
    attackerPermanentId: setup.perm("attacker").permanentId,
    target: { kind: "player" },
  });
  await settle(() => setup.events.some((event) => event.kind === "blockWindowOpened"));
  const opened = setup.events.find((event) => event.kind === "blockWindowOpened") as Extract<
    ServerEvent,
    { kind: "blockWindowOpened" }
  >;
  const context: BlockContext = {
    attackerPermanentId: opened.attackerPermanentId,
    eligibleBlockerIds: opened.eligibleBlockerIds,
    mustBlock: false,
    targetsPlayer: true,
  };
  const close = async () => {
    setup.engine.applyIntent(1, { type: "surrender" });
    await loop.catch(() => undefined);
  };
  return { setup, context, close };
}

type PolicyParams = { engine: ReturnType<typeof setupEngine>["engine"]; seat: 0 | 1 };

function createPolicy({ engine, seat }: PolicyParams) {
  return createLiveSearchPolicy({
    engine,
    seat,
    policy: createAnsweringPolicy({ block: { type: "declineBlock" }, counter: { type: "respondCounter" } }),
    fallbackPolicy: createAnsweringPolicy({
      block: { type: "declareBlock", blockerPermanentId: "standard" },
      counter: { type: "respondCounter" },
    }),
    profile: DEFAULT_BOT_PROFILE,
    program: SEED_RESIDUAL,
    seed: 5,
    simulations: 2,
    maxDurationMs: 500,
    getSeenOpponentCards: () => ({ main: [], eggs: [] }),
  });
}

it("counts an error fallback and returns the Standard block answer when the block position has no snapshot anchor", async () => {
  const { setup, context, close } = await openBlockWindow();
  const policy = createPolicy({ engine: setup.engine, seat: 0 });
  const answer = await policy.chooseBlockResponse(buildBotView(setup.state, 0)!, context);
  expect(answer).toEqual({ type: "declareBlock", blockerPermanentId: "standard" });
  expect(policy.searchFallbacks?.()).toEqual({ deadline: 0, capacity: 0, error: 1 });
  const causes = Object.entries(policy.searchErrors?.() ?? {});
  expect(causes).toHaveLength(1);
  expect(causes[0]![0]).toMatch(/^snapshot: /);
  expect(causes[0]![1]).toBe(1);
  await close();
});

it("returns the Standard block answer without searching when the open window belongs to the other seat", async () => {
  const { setup, context, close } = await openBlockWindow();
  const policy = createPolicy({ engine: setup.engine, seat: 1 });
  const answer = await policy.chooseBlockResponse(buildBotView(setup.state, 1)!, context);
  expect(answer).toEqual({ type: "declareBlock", blockerPermanentId: "standard" });
  expect(policy.searchFallbacks?.()).toEqual({ deadline: 0, capacity: 0, error: 0 });
  await close();
});
