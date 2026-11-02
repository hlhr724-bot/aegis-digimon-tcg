import { expect, it } from "vitest";
import { EffectTiming } from "@aegis/shared";
import { Phase } from "@aegis/shared/schema/enums";
import type { DecisionRequest } from "@aegis/shared/protocol/events";
import type { DecisionResponse } from "@aegis/shared/protocol/intents";
import fixture from "#api/engine/scenarios/arisa-rematch-story-adaptation.fixture";
import { effectsOf } from "#api/engine/effects/collect";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";
import "#api/cards/index";

type Setup = ReturnType<typeof setupScenario>;
type Answer = (seat: number, request: DecisionRequest) => DecisionResponse | undefined;

function cardIdOf(s: Setup, instanceId: string): string | undefined {
  for (const player of s.state.players) {
    for (const zone of [player.hand, player.deck, player.trash, player.security, player.eggDeck]) {
      const card = zone.find((entry) => entry.instanceId === instanceId);
      if (card) return card.cardId;
    }
    for (const permanent of [...player.battleArea, ...(player.breeding ? [player.breeding] : [])]) {
      if (permanent.permanentId === instanceId) return permanent.topCard.cardId;
      const card = [permanent.topCard, ...permanent.stack].find((entry) => entry.instanceId === instanceId);
      if (card) return card.cardId;
    }
  }
  return undefined;
}

function candidatesFor(s: Setup, request: DecisionRequest, ...cardIds: string[]): string[] {
  const candidates = request.options?.candidateInstanceIds ?? [];
  const chosen: string[] = [];
  for (const cardId of cardIds) {
    const match = candidates.find((id) => !chosen.includes(id) && cardIdOf(s, id) === cardId);
    if (match) chosen.push(match);
  }
  return chosen;
}

function defaultAnswer(request: DecisionRequest): DecisionResponse {
  switch (request.kind) {
    case "orderTriggers":
      return { kind: "orderTriggers", order: (request.options?.triggerKeys ?? []).slice(0, 1) };
    case "optional":
      return { kind: "optional", accept: false };
    case "orderCards":
      return { kind: "orderCards", order: request.options?.candidateInstanceIds ?? [] };
    case "chooseOption":
      return { kind: "chooseOption", optionIndex: request.options?.declineIndex ?? 0 };
    default:
      return {
        kind: request.kind === "chooseTargets" ? "chooseTargets" : "selectCards",
        instanceIds: (request.options?.candidateInstanceIds ?? []).slice(0, request.options?.min ?? 0),
      };
  }
}

async function answerDecisions(s: Setup, answer: Answer) {
  let quietPolls = 0;
  let answered = s.decisions.length;
  while (quietPolls < 2000) {
    if (quietPolls % 200 === 199) await new Promise((resolve) => setImmediate(resolve));
    else await Promise.resolve();
    if (!s.state.pendingDecision || s.decisions.length === answered) {
      quietPolls += 1;
      continue;
    }
    quietPolls = 0;
    answered = s.decisions.length;
    const { seat, req } = s.decisions[answered - 1]!;
    const response = answer(seat, req) ?? defaultAnswer(req);
    expect(
      s.engine.applyIntent(seat, { type: "respondDecision", decisionId: req.decisionId, response }),
      `${req.sourceCardId} ${req.kind} "${req.promptText}"`,
    ).toEqual({ ok: true });
  }
}

it("lets Violet win the Arisa rematch with the Battle Coverage 11 Ruin Mode comeback", async () => {
  const s = setupScenario(fixture, { autoOrderTriggers: false, autoOrderCards: false });
  const violet = s.state.players[0]!;
  const arisa = s.state.players[1]!;
  const progress = { rushes: 0, rushLimit: 1, soulBanquetReady: false, necromonRevives: 0 };
  const accept = (): DecisionResponse => ({ kind: "optional", accept: true });
  const answer: Answer = (seat, request) => {
    const source = request.sourceCardId;
    const select = (...cardIds: string[]) => ({
      kind: request.kind as "selectCards",
      instanceIds: candidatesFor(s, request, ...cardIds),
    });
    if (request.kind === "orderTriggers") return undefined;
    if (seat === 1) {
      if (source === "TOKEN-Familiar-Token" && request.kind === "chooseTargets") return select("BT20-068");
      return undefined;
    }
    if (request.kind === "selectCards" && request.promptText.includes("attack target")) {
      return {
        kind: "selectCards",
        instanceIds: (request.options?.candidateInstanceIds ?? []).filter((id) => cardIdOf(s, id) === undefined),
      };
    }
    switch (source) {
      case "BT20-079":
        if (request.kind === "chooseTargets") return select("ST19-03");
        if (request.kind === "optional") return accept();
        progress.necromonRevives += 1;
        return select(progress.necromonRevives === 1 ? "BT20-072" : "BT20-067");
      case "BT20-072":
        if (request.kind === "optional") return accept();
        return select("BT21-065");
      case "BT20-073":
        return select("BT22-042");
      case "BT20-088":
        if (request.kind === "optional") return accept();
        return request.kind === "chooseTargets" ? select("BT20-072") : select("BT23-069");
      case "BT23-087": {
        if (request.promptText.includes("By returning this Tamer")) return { kind: "optional", accept: false };
        const useRush = progress.rushes < progress.rushLimit;
        if (useRush) progress.rushes += 1;
        return { kind: "optional", accept: useRush };
      }
      case "BT23-098":
        if (request.kind === "optional") return { kind: "optional", accept: progress.soulBanquetReady };
        return select("BT23-071");
      case "EX4-074":
        return select("EX9-033");
      case "BT23-065":
        return request.kind === "optional" ? accept() : select("BT20-068");
      case "BT23-071":
        return request.kind === "optional" ? accept() : select("BT20-079");
      default:
        return undefined;
    }
  };
  const loop = s.engine.runOneTurn();
  try {
    await settle(() => s.state.phase === Phase.Breeding);
    const metalPhantomon = violet.breeding!;
    expect(s.engine.applyIntent(0, { type: "moveFromBreeding", permanentId: metalPhantomon.permanentId })).toEqual({
      ok: true,
    });
    const mainPhase = advance(s.engine).waitForMainPhase(0);
    await answerDecisions(s, answer);
    await mainPhase;
    expect(s.state.memory).toBe(7);

    const necromon = violet.hand.find((card) => card.cardId === "BT20-079")!;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: metalPhantomon.permanentId,
        instanceId: necromon.instanceId,
      }),
    ).toEqual({ ok: true });
    await answerDecisions(s, answer);
    const revivedNecromon = violet.battleArea.find((permanent) => permanent.topCard.cardId === "BT23-069")!;
    expect(revivedNecromon.stack.map((card) => card.cardId)).toEqual(["BT20-072"]);
    expect(arisa.battleArea.some((permanent) => permanent.topCard.cardId === "BT22-042")).toBe(false);
    expect(s.state.memory).toBe(4);

    const memoryBoost = violet.battleArea.find((permanent) => permanent.topCard.cardId === "P-040")!;
    const delay = observe(s.engine)
      .activatableEffects(memoryBoost)
      .find((entry) => entry.instanceId === memoryBoost.topCard.instanceId)!;
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: memoryBoost.topCard.instanceId,
        effectKey: delay.effectKey,
      }),
    ).toEqual({ ok: true });
    await answerDecisions(s, answer);
    const ruinMode = violet.hand.find((card) => card.cardId === "EX4-074")!;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: revivedNecromon.permanentId,
        instanceId: ruinMode.instanceId,
      }),
    ).toEqual({ ok: true });
    await answerDecisions(s, answer);
    expect(arisa.battleArea.some((permanent) => permanent.topCard.cardId === "TOKEN-Familiar-Token")).toBe(false);

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: revivedNecromon.permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await answerDecisions(s, answer);
    const pandamon = arisa.battleArea.find((permanent) => permanent.topCard.cardId === "ST19-09")!;
    expect(s.engine.applyIntent(1, { type: "declareBlock", blockerPermanentId: pandamon.permanentId })).toEqual({
      ok: true,
    });
    await answerDecisions(s, answer);
    expect(arisa.battleArea.some((permanent) => permanent.topCard.cardId === "EX9-033")).toBe(false);
    expect(violet.security).toHaveLength(1);

    const hatched = violet.breeding!;
    const candlemon = violet.hand.find((card) => card.cardId === "BT20-062")!;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: hatched.permanentId,
        instanceId: candlemon.instanceId,
      }),
    ).toEqual({ ok: true });
    await answerDecisions(s, answer);
    const jackRaid = violet.hand.find((card) => card.cardId === "BT4-111")!;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: jackRaid.instanceId })).toEqual({ ok: true });
    await answerDecisions(s, answer);
    expect(s.state.memory).toBe(3);

    progress.rushLimit = 2;
    progress.soulBanquetReady = true;
    const phantomon = violet.hand.find((card) => card.cardId === "BT23-065")!;
    const phantomonMain = effectsOf(EffectTiming.OnDeclaration, observe(s.engine).cardSource(phantomon)).find(
      (effect) => effect.effectKey.startsWith("BT23-065/"),
    )!;
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: phantomon.instanceId,
        effectKey: phantomonMain.effectKey,
      }),
    ).toEqual({ ok: true });
    await answerDecisions(s, answer);
    expect(arisa.security).toHaveLength(0);
    expect(arisa.battleArea.some((permanent) => permanent.topCard.cardId === "ST19-12")).toBe(false);
    expect(s.state.turnSeat).toBe(0);
    expect(s.state.memory).toBe(0);

    const bakemon = violet.battleArea.find((permanent) => permanent.topCard.cardId === "BT20-068")!;
    const soulmon = violet.battleArea.find((permanent) => permanent.topCard.cardId === "BT20-067")!;
    const kimeramon = violet.hand.find((card) => card.cardId === "BT8-084")!;
    expect(
      s.engine.applyIntent(0, {
        type: "dnaDigivolve",
        materialPermanentIds: [bakemon.permanentId, soulmon.permanentId],
        instanceId: kimeramon.instanceId,
      }),
    ).toEqual({ ok: true });
    await answerDecisions(s, answer);
    const finisher = violet.battleArea.find((permanent) => permanent.topCard.cardId === "BT8-084")!;
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: finisher.permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.gameOver);
    expect(s.state.winnerSeat).toBe(0);
  } finally {
    if (!s.state.gameOver) s.engine.applyIntent(s.state.turnSeat, { type: "surrender" });
    await loop;
  }
});
