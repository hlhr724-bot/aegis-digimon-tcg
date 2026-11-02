import { describe, expect, it } from "vitest";
import { encodeTriggerResolutionPlan } from "#shared/protocol/encodeTriggerResolutionPlan";
import { decodeTriggerResolutionPlan } from "#shared/protocol/decodeTriggerResolutionPlan";
import type { OrderTriggersResponse } from "#shared/protocol/intents";

const triggerKeys = ["first".repeat(100), "second".repeat(100), "third".repeat(100)];
const response: OrderTriggersResponse = {
  kind: "orderTriggers",
  order: [triggerKeys[2]!, triggerKeys[0]!],
  optionalAnswers: { [triggerKeys[0]!]: false, [triggerKeys[2]!]: true },
};

describe("indexed trigger resolution plans", () => {
  it("round trips reordered partial plans and optional answers without repeated identifiers", () => {
    const compact = encodeTriggerResolutionPlan({ response, triggerKeys, supportsIndexes: true });
    expect(compact.orderIndexes).toEqual([2, 0]);
    expect(compact.optionalAnswersByIndex).toEqual([false, null, true]);
    expect(decodeTriggerResolutionPlan({ response: compact, triggerKeys, supportsIndexes: true })).toEqual(response);
    expect(JSON.stringify(compact).length).toBeLessThan(JSON.stringify(response).length / 10);
  });
  it("omits trailing unanswered presets while preserving explicit declines and omitted questions", () => {
    const offered = Array.from({ length: 256 }, (_, index) => `trigger-${index}`);
    const named: OrderTriggersResponse = {
      kind: "orderTriggers",
      order: [offered[0]!],
      optionalAnswers: { [offered[0]!]: false },
    };
    const compact = encodeTriggerResolutionPlan({ response: named, triggerKeys: offered, supportsIndexes: true });
    expect(compact.optionalAnswersByIndex).toEqual([false]);
    expect(decodeTriggerResolutionPlan({ response: compact, triggerKeys: offered, supportsIndexes: true })).toEqual(
      named,
    );
  });

  it("preserves the legacy format when the server lacks the capability", () => {
    expect(encodeTriggerResolutionPlan({ response, triggerKeys, supportsIndexes: false })).toBe(response);
    expect(decodeTriggerResolutionPlan({ response, triggerKeys, supportsIndexes: false })).toBe(response);
  });
  it.each([[0, 0], [-1], [3], [0.5], []])("rejects invalid index sequences %j", (...orderIndexes) => {
    expect(
      decodeTriggerResolutionPlan({
        response: { kind: "orderTriggers", order: [], orderIndexes },
        triggerKeys,
        supportsIndexes: true,
      }),
    ).toBeUndefined();
  });
  it("rejects compact responses without negotiated support", () => {
    const compact = encodeTriggerResolutionPlan({ response, triggerKeys, supportsIndexes: true });
    expect(decodeTriggerResolutionPlan({ response: compact, triggerKeys, supportsIndexes: false })).toBeUndefined();
  });
  it("rejects ambiguous legacy and indexed fields", () => {
    expect(
      decodeTriggerResolutionPlan({ response: { ...response, orderIndexes: [0] }, triggerKeys, supportsIndexes: true }),
    ).toBeUndefined();
  });
  it.each([[true, false, true, false], ["yes"], [{}]])(
    "rejects malformed or oversized optional answers %j",
    (...answers) => {
      const malformed = {
        kind: "orderTriggers",
        order: [],
        orderIndexes: [0],
        optionalAnswersByIndex: answers,
      } as unknown as OrderTriggersResponse;
      expect(decodeTriggerResolutionPlan({ response: malformed, triggerKeys, supportsIndexes: true })).toBeUndefined();
    },
  );
});
