import { expect, it } from "vitest";
import { Side } from "@/game/side";
import type { SequencedServerEvent } from "@aegis/shared/protocol/events";
import { effectNoticeFromEvent } from "@/game/notices";
import { hasEarlierClauseResults } from "@/game/match/narration/targetClause";
import { noticeEffectClause } from "@/game/overlay/effectText";
import { validReplayEvent } from "@/replays/eventValidation";

const continuation: SequencedServerEvent = {
  kind: "effectClauseAdvanced",
  seat: 0,
  sourceCardId: "EX14-054",
  sourceInstanceId: "source",
  timing: "OnPlay",
  clause: "Then, your opponent trashes 1 card in their hand.",
  seq: 1,
  batch: "continuation",
  stateVersion: 1,
};

it("presents continuation on the source controller's side without another activation", () => {
  const notice = effectNoticeFromEvent(continuation, 0, "notice", 0);
  expect(notice).toMatchObject({
    side: Side.Viewer,
    body: { variant: "effect", isContinuation: true, effectTextPart: continuation.clause },
  });
  expect(effectNoticeFromEvent(continuation, 1, "opponent", 0)?.side).toBe(Side.Opponent);
  expect(notice?.body.variant).toBe("effect");
  if (notice?.body.variant !== "effect") {
    throw new Error("Expected an effect notice");
  }
  expect(noticeEffectClause({ ...notice.body, timing: notice.body.timing, description: notice.body.description })).toBe(
    continuation.clause,
  );
  expect(validReplayEvent(continuation)).toBe(true);
});

it("recognizes results following the exact continuation occurrence", () => {
  const notice = effectNoticeFromEvent(continuation, 0, "notice", 0)!;
  const item = { id: "item", side: notice.side, batchId: "continuation", createdAt: 0, notice };
  const decision = {
    decisionId: "decision",
    kind: "selectCards" as const,
    seat: 1 as const,
    promptText: "Discard",
    stateVersion: 1,
  };
  const batch = { id: "continuation", stateVersion: 1, events: [continuation] };
  expect(hasEarlierClauseResults(item, decision, [batch])).toBe(false);
  const moved: SequencedServerEvent = {
    kind: "cardsMoved",
    seat: 1,
    instanceIds: ["discard"],
    from: "hand",
    to: "trash",
    seq: 2,
    batch: "continuation",
    stateVersion: 1,
  };
  expect(hasEarlierClauseResults(item, decision, [{ ...batch, events: [continuation, moved] }])).toBe(true);
});
