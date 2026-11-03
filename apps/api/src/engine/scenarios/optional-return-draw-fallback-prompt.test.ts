import { Phase } from "@aegis/shared";
import type { DecisionResponse } from "@aegis/shared/protocol/intents";
import { describe, expect, it } from "vitest";
import "#api/cards/index";
import { advance } from "#api/engine/testkit/advance";
import { settle, type EngineSetup } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";
import { setupScenario } from "#api/engine/testkit/scenario";
import { optionalReturnDrawFallbackPrompt } from "#api/engine/scenarios/optional-return-draw-fallback-prompt.fixture";

const RETURN_CLAUSE =
  "You may return 1 Digimon card with [Greymon], [Garurumon] or [Omnimon] in its name from your trash to the hand.";

function respond(s: EngineSetup, response: DecisionResponse) {
  const request = s.state.pendingDecision!;
  expect(s.engine.applyIntent(0, { type: "respondDecision", decisionId: request.decisionId, response })).toEqual({
    ok: true,
  });
}

async function playTaiAndMattThroughDelay(s: EngineSetup) {
  const delay = observe(s.engine)
    .activatableEffects(s.perm("digitalGateOpen"))
    .find((effect) => /delay/i.test(effect.description ?? ""))!;
  expect(
    s.engine.applyIntent(0, {
      type: "activateEffect",
      sourceInstanceId: delay.instanceId!,
      effectKey: delay.effectKey,
    }),
  ).toEqual({ ok: true });
  await settle(() => s.state.pendingDecision?.kind === "optional");
  respond(s, { kind: "optional", accept: true });
  await settle(() => s.state.pendingDecision?.kind === "selectCards");
  respond(s, { kind: "selectCards", instanceIds: [s.inst("taiAndMatt").instanceId] });
  await settle(() => s.state.pendingDecision !== undefined && s.decisions.at(-1)?.req.sourceCardId === "EX9-066");
  expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard.instanceId)).toContain(
    s.inst("taiAndMatt").instanceId,
  );
  return s.decisions.at(-1)!.req;
}

async function withScenario(verify: (s: EngineSetup) => Promise<void>) {
  const s = setupScenario(optionalReturnDrawFallbackPrompt(), { declineDigiXros: true });
  const loop = s.engine.startTurnLoop();
  try {
    await settle(() => s.state.phase === Phase.Breeding);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);
    await verify(s);
  } finally {
    if (!s.state.gameOver) {
      s.engine.applyIntent(s.state.turnSeat as 0 | 1, { type: "surrender" });
    }
    await loop;
  }
}

function handIds(s: EngineSetup) {
  return s.state.players[0]!.hand.map((card) => card.instanceId);
}

describe("optional return with a draw fallback", () => {
  it("asks only about the return clause, so declining it still draws", async () => {
    await withScenario(async (s) => {
      const request = await playTaiAndMattThroughDelay(s);
      expect(request.kind).toBe("optional");
      const emphasis = request.options?.effectTextEmphasis;
      expect(request.options?.timing).toBe("OnPlay");
      expect(emphasis?.replace(/\s+/g, " ")).toBe(RETURN_CLAUSE);
      expect(request.options?.effectText).toContain(emphasis);
      expect(request.options?.effectText).toContain("If this effect didn't return, ＜Draw 1＞");
      respond(s, { kind: "optional", accept: false });
      await settle(
        () => s.state.pendingDecision === undefined && handIds(s).includes(s.inst("fallbackDraw").instanceId),
      );
      expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(s.inst("onlyReturnTarget").instanceId);
      expect(handIds(s)).not.toContain(s.inst("onlyReturnTarget").instanceId);
    });
  });

  it("returns the only named Digimon without drawing when the return is accepted", async () => {
    await withScenario(async (s) => {
      await playTaiAndMattThroughDelay(s);
      respond(s, { kind: "optional", accept: true });
      await settle(
        () => s.state.pendingDecision === undefined && handIds(s).includes(s.inst("onlyReturnTarget").instanceId),
      );
      expect(handIds(s)).not.toContain(s.inst("fallbackDraw").instanceId);
      expect(s.state.players[0]!.deck[0]!.instanceId).toBe(s.inst("fallbackDraw").instanceId);
    });
  });
});
