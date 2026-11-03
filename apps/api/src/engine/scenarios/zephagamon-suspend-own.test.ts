import fixtureZephagamonSuspendOwn from "./zephagamon-suspend-own.fixture.js";
import { fixturePermanentId, fixtureInstanceId } from "../scenario/references.js";
import { Phase } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import "../../cards/index.js";
import { layScenarioFixture } from "../scenario/fixture.js";
import { BLUE_DECK, RED_DECK } from "../testDecks.js";
import { advance } from "../testkit/advance.js";
import { setupEngine, settle } from "../testkit/harness.js";

const HOST_ID = fixturePermanentId("own-grandgalemon");
const FIELD_PTEROMON_ID = fixturePermanentId("own-pteromon");
const BOT_MONODRAMON_ID = fixturePermanentId("opponent-monodramon");
const HAND_PTEROMON = fixtureInstanceId("hand-pteromon-card");

async function openZephagamonScenario() {
  const s = setupEngine({ 0: {}, 1: {} });
  layScenarioFixture(s.state, fixtureZephagamonSuspendOwn, [BLUE_DECK, RED_DECK], true);
  const loop = s.engine.startTurnLoop();
  await settle(() => s.state.phase === Phase.Breeding);
  expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
  await advance(s.engine).waitForMainPhase(0);
  return { s, loop };
}

function openDecision(s: ReturnType<typeof setupEngine>) {
  const pendingId = s.state.pendingDecision?.decisionId;
  const latest = s.decisions.at(-1)?.req;
  return latest && latest.decisionId === pendingId ? latest : undefined;
}

function permanent(s: ReturnType<typeof setupEngine>, seat: 0 | 1, permanentId: string) {
  return s.state.players[seat]!.battleArea.find((candidate) => candidate.permanentId === permanentId);
}

// Feedback report #26 (match 0d0a78cd): "Zephagamon isn't able to suspend your digimon".
describe("Zephagamon suspends your own Digimon", () => {
  it("offers your own Digimon to the suspend step, and suspending one plays a Bird from hand", async () => {
    const { s, loop } = await openZephagamonScenario();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: HOST_ID,
        instanceId: fixtureInstanceId("zephagamon-card"),
      }),
    ).toEqual({ ok: true });

    await settle(() => openDecision(s)?.kind === "chooseTargets");
    const unsuspend = openDecision(s)!;
    expect(unsuspend.options?.targetFate).toBe("unsuspend");
    expect(unsuspend.options?.min).toBe(0);
    expect(unsuspend.options?.candidateInstanceIds).toEqual([BOT_MONODRAMON_ID]);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: unsuspend.decisionId,
        response: { kind: "chooseTargets", instanceIds: [] },
      }),
    ).toEqual({ ok: true });

    await settle(
      () => openDecision(s)?.kind === "chooseTargets" && openDecision(s)?.decisionId !== unsuspend.decisionId,
    );
    const suspend = openDecision(s)!;
    expect(suspend.options?.targetFate).toBe("suspend");
    expect([...(suspend.options?.candidateInstanceIds ?? [])].sort()).toEqual(
      [BOT_MONODRAMON_ID, FIELD_PTEROMON_ID, HOST_ID].sort(),
    );
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: suspend.decisionId,
        response: { kind: "chooseTargets", instanceIds: [FIELD_PTEROMON_ID] },
      }),
    ).toEqual({ ok: true });
    await settle(() => openDecision(s)?.kind === "optional" || s.state.pendingDecision === undefined);
    expect(permanent(s, 0, FIELD_PTEROMON_ID)?.isSuspended).toBe(true);
    const playOffer = openDecision(s)!;
    expect(playOffer.sourceCardId).toBe("EX11-035");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: playOffer.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await settle(() => openDecision(s)?.kind === "selectCards");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: openDecision(s)!.decisionId,
        response: { kind: "selectCards", instanceIds: [HAND_PTEROMON] },
      }),
    ).toEqual({ ok: true });

    await settle(() =>
      s.state.players[0]!.battleArea.some((candidate) => candidate.topCard.instanceId === HAND_PTEROMON),
    );
    expect(permanent(s, 0, HOST_ID)?.topCard.cardId).toBe("EX11-035");
    expect(permanent(s, 0, HOST_ID)?.isSuspended).toBe(false);
    expect(permanent(s, 1, BOT_MONODRAMON_ID)?.isSuspended).toBe(true);
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === HAND_PTEROMON)).toBe(false);

    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it("does not offer the free play when the suspend step targets the opponent's Digimon", async () => {
    const { s, loop } = await openZephagamonScenario();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: HOST_ID,
        instanceId: fixtureInstanceId("zephagamon-card"),
      }),
    ).toEqual({ ok: true });

    await settle(() => openDecision(s)?.kind === "chooseTargets");
    const unsuspend = openDecision(s)!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: unsuspend.decisionId,
        response: { kind: "chooseTargets", instanceIds: [BOT_MONODRAMON_ID] },
      }),
    ).toEqual({ ok: true });
    await settle(
      () => openDecision(s)?.kind === "chooseTargets" && openDecision(s)?.decisionId !== unsuspend.decisionId,
    );
    expect(permanent(s, 1, BOT_MONODRAMON_ID)?.isSuspended).toBe(false);
    const suspend = openDecision(s)!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: suspend.decisionId,
        response: { kind: "chooseTargets", instanceIds: [BOT_MONODRAMON_ID] },
      }),
    ).toEqual({ ok: true });

    await settle(() => s.state.pendingDecision === undefined);
    expect(permanent(s, 1, BOT_MONODRAMON_ID)?.isSuspended).toBe(true);
    expect(s.decisions.filter(({ req }) => req.kind === "optional" && req.sourceCardId === "EX11-035")).toEqual([]);
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === HAND_PTEROMON)).toBe(true);

    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });
});
