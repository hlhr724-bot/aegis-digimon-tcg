import { describe, expect, it, vi } from "vitest";
import type { Intent } from "@aegis/shared/protocol/intents";
import type { BotPolicy } from "#api/bot/policy";
import type { BotView } from "#api/bot/view";
import { createFallbackBotPolicy } from "#api/bot/experiment/createFallbackBotPolicy";

const END_PHASE: Intent = { type: "endPhase" };
const STANDARD_ANSWER: Intent = { type: "declineBlock" };
const view = {} as BotView;

function createPolicy(name: string, chooseMainAction: BotPolicy<Intent | Promise<Intent>>["chooseMainAction"]) {
  return {
    name,
    observeEvent: vi.fn<NonNullable<BotPolicy["observeEvent"]>>(),
    onTurnStart: vi.fn<BotPolicy["onTurnStart"]>(),
    chooseBreedingAction: vi.fn<BotPolicy["chooseBreedingAction"]>(() => STANDARD_ANSWER),
    chooseMainAction: vi.fn<BotPolicy<Intent | Promise<Intent>>["chooseMainAction"]>(chooseMainAction),
    chooseBlockResponse: vi.fn<BotPolicy["chooseBlockResponse"]>(() => STANDARD_ANSWER),
    chooseCounterResponse: vi.fn<BotPolicy["chooseCounterResponse"]>(() => STANDARD_ANSWER),
    chooseAllianceResponse: vi.fn<BotPolicy["chooseAllianceResponse"]>(() => STANDARD_ANSWER),
    chooseEvadeResponse: vi.fn<BotPolicy["chooseEvadeResponse"]>(() => STANDARD_ANSWER),
    chooseBarrierResponse: vi.fn<BotPolicy["chooseBarrierResponse"]>(() => STANDARD_ANSWER),
    answerDecision: vi.fn<BotPolicy["answerDecision"]>(() => STANDARD_ANSWER),
    noteRejected: vi.fn<BotPolicy["noteRejected"]>(),
    onEngineRejection: vi.fn<NonNullable<BotPolicy["onEngineRejection"]>>(),
  };
}

function setup(candidateMain: BotPolicy<Intent | Promise<Intent>>["chooseMainAction"]) {
  const candidate = createPolicy("candidate", candidateMain);
  const standard = createPolicy("standard", () => STANDARD_ANSWER);
  const onFallback = vi.fn<() => void>();
  const policy = createFallbackBotPolicy({ name: "experiment", candidate, standard, onFallback });
  return { candidate, standard, onFallback, policy };
}

describe("experiment bot fallback", () => {
  it("uses the candidate while it answers", async () => {
    const { policy, standard, onFallback } = setup(async () => END_PHASE);
    await expect(policy.chooseMainAction(view)).resolves.toEqual(END_PHASE);
    expect(standard.chooseMainAction).not.toHaveBeenCalled();
    expect(onFallback).not.toHaveBeenCalled();
  });

  it("answers with the standard bot and keeps it for the match after the candidate fails", async () => {
    const { policy, candidate, standard, onFallback } = setup(async () => {
      throw new Error("candidate crashed");
    });
    await expect(policy.chooseMainAction(view)).resolves.toEqual(STANDARD_ANSWER);
    expect(onFallback).toHaveBeenCalledOnce();
    expect(policy.chooseMainAction(view)).toEqual(STANDARD_ANSWER);
    expect(candidate.chooseMainAction).toHaveBeenCalledOnce();
    expect(standard.chooseMainAction).toHaveBeenCalledTimes(2);
    expect(onFallback).toHaveBeenCalledOnce();
  });

  it("falls back when the candidate throws synchronously", () => {
    const { policy, onFallback } = setup(() => {
      throw new Error("candidate crashed");
    });
    expect(policy.chooseMainAction(view)).toEqual(STANDARD_ANSWER);
    expect(onFallback).toHaveBeenCalledOnce();
  });

  it("falls back after the engine rejects a candidate action", () => {
    const { policy, candidate, standard, onFallback } = setup(async () => END_PHASE);
    policy.noteRejected(END_PHASE);
    expect(onFallback).toHaveBeenCalledOnce();
    expect(candidate.noteRejected).not.toHaveBeenCalled();
    expect(policy.chooseMainAction(view)).toEqual(STANDARD_ANSWER);
    policy.noteRejected(STANDARD_ANSWER);
    expect(standard.noteRejected).toHaveBeenCalledWith(STANDARD_ANSWER);
  });

  it("falls back after an asynchronous engine rejection", () => {
    const { policy, onFallback } = setup(async () => END_PHASE);
    policy.onEngineRejection?.({ kind: "actionRejected", intent: "playCard", reason: "insufficient-memory" });
    expect(onFallback).toHaveBeenCalledOnce();
    expect(policy.chooseMainAction(view)).toEqual(STANDARD_ANSWER);
  });

  it("does not count a cancelled candidate decision as a failure", async () => {
    const controller = new AbortController();
    const { policy, onFallback } = setup(
      (_view, signal) =>
        new Promise<Intent>((_resolve, reject) => signal?.addEventListener("abort", () => reject(signal.reason))),
    );
    const answer = policy.chooseMainAction(view, controller.signal);
    controller.abort();
    await expect(answer).rejects.toBeDefined();
    expect(onFallback).not.toHaveBeenCalled();
  });

  it("keeps both policies informed of match events", () => {
    const { policy, candidate, standard } = setup(async () => END_PHASE);
    const event = { kind: "turnEnded", endingSeat: 0, nextSeat: 1, turnCount: 1 } as const;
    policy.observeEvent?.(event);
    policy.onTurnStart();
    expect(candidate.observeEvent).toHaveBeenCalledWith(event);
    expect(standard.observeEvent).toHaveBeenCalledWith(event);
    expect(candidate.onTurnStart).toHaveBeenCalledOnce();
    expect(standard.onTurnStart).toHaveBeenCalledOnce();
  });
});
