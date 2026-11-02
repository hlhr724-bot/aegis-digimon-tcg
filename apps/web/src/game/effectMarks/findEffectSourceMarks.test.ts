import { describe, expect, it } from "vitest";
import type { DecisionRequest, SequencedServerEvent, ServerEvent } from "@aegis/shared/protocol/events";
import { buildTriggerKey } from "@aegis/shared/protocol/triggerKey";
import { EffectSourceMark } from "@/game/effectMarks/EffectSourceMark";
import { findEffectSourceMarks } from "@/game/effectMarks/findEffectSourceMarks";

let nextSeq = 1;

function sequenced(event: ServerEvent, stateVersion: number): SequencedServerEvent {
  return { ...event, seq: nextSeq++, batch: `batch-${stateVersion}`, stateVersion };
}

function triggered(sourceInstanceId: string, stateVersion: number, effectKey = "BT1-001/0"): SequencedServerEvent {
  return sequenced(
    { kind: "effectTriggered", seat: 0, sourceCardId: "BT1-001", sourceInstanceId, effectKey, description: "" },
    stateVersion,
  );
}

function resolved(sourceInstanceId: string, stateVersion: number, effectKey = "BT1-001/0"): SequencedServerEvent {
  return sequenced(
    { kind: "effectResolved", seat: 0, sourceCardId: "BT1-001", sourceInstanceId, effectKey, description: "" },
    stateVersion,
  );
}

function orderTriggers(instanceIds: readonly string[]): DecisionRequest {
  return {
    decisionId: "order",
    seat: 0,
    kind: "orderTriggers",
    promptText: "Choose the order.",
    options: { triggerKeys: instanceIds.map((instanceId) => buildTriggerKey(instanceId, "BT1-001/0")) },
  };
}

describe("effect source marks", () => {
  it("marks every source waiting in the viewer's trigger order prompt as pending", () => {
    const marks = findEffectSourceMarks({
      events: [],
      presentedStateVersion: undefined,
      viewerDecision: orderTriggers(["hand-copy-2", "trash-card"]),
    });

    expect(marks).toEqual(
      new Map([
        ["hand-copy-2", EffectSourceMark.PENDING.value],
        ["trash-card", EffectSourceMark.PENDING.value],
      ]),
    );
  });

  it("marks the source of an optional activation question as pending", () => {
    const marks = findEffectSourceMarks({
      events: [],
      presentedStateVersion: undefined,
      viewerDecision: {
        decisionId: "use",
        seat: 0,
        kind: "optional",
        promptText: "Use this effect?",
        sourceInstanceId: "hand-card",
      },
    });

    expect(marks.get("hand-card")).toBe(EffectSourceMark.PENDING.value);
  });

  it("marks an accepted effect as resolving until its resolution arrives", () => {
    const opened = [triggered("trash-card", 4)];

    expect(
      findEffectSourceMarks({ events: opened, presentedStateVersion: undefined, viewerDecision: undefined }).get(
        "trash-card",
      ),
    ).toBe(EffectSourceMark.RESOLVING.value);
    expect(
      findEffectSourceMarks({
        events: [...opened, resolved("trash-card", 5)],
        presentedStateVersion: undefined,
        viewerDecision: undefined,
      }).size,
    ).toBe(0);
  });

  it("prefers resolving over pending for the same source", () => {
    const marks = findEffectSourceMarks({
      events: [triggered("hand-card", 3)],
      presentedStateVersion: undefined,
      viewerDecision: orderTriggers(["hand-card"]),
    });

    expect(marks.get("hand-card")).toBe(EffectSourceMark.RESOLVING.value);
  });

  it("keeps one copy marked while a second activation of the same effect is still open", () => {
    const marks = findEffectSourceMarks({
      events: [triggered("trash-card", 3), triggered("trash-card", 3), resolved("trash-card", 4)],
      presentedStateVersion: undefined,
      viewerDecision: undefined,
    });

    expect(marks.get("trash-card")).toBe(EffectSourceMark.RESOLVING.value);
  });

  it("follows the presented revision instead of the live stream", () => {
    const events = [triggered("trash-card", 3), resolved("trash-card", 6)];

    expect(findEffectSourceMarks({ events, presentedStateVersion: 2, viewerDecision: undefined }).size).toBe(0);
    expect(
      findEffectSourceMarks({ events, presentedStateVersion: 4, viewerDecision: undefined }).get("trash-card"),
    ).toBe(EffectSourceMark.RESOLVING.value);
    expect(findEffectSourceMarks({ events, presentedStateVersion: 6, viewerDecision: undefined }).size).toBe(0);
  });

  it("ignores effects whose physical source the server did not publish", () => {
    const anonymous = sequenced(
      { kind: "effectTriggered", seat: 1, sourceCardId: "BT1-001", effectKey: "BT1-001/0", description: "" },
      2,
    );

    expect(
      findEffectSourceMarks({ events: [anonymous], presentedStateVersion: undefined, viewerDecision: undefined }).size,
    ).toBe(0);
  });
});
