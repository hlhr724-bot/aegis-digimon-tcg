import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import type { DecisionRequest } from "@aegis/shared/protocol/events";
import { runReplay } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";
import { settle } from "#api/engine/testkit/harness";

const record: ReplayRecord = JSON.parse(
  readFileSync(new URL("./stacked-yuu-reducers-place-every-chosen-card.replay.json", import.meta.url), "utf8"),
);

const yuuPrompt = "BT10-093";
const playedInstanceId = "s1-05b149c20c96d3eb3980a264abec4fd1a71ee0abafb507340c38304f1633dfae";
const chosenUnderTamer = [
  "s1-e5296e715f479e3cc31e24eb407ae0dff6ff5683baec92a3109dd6c28b8de90f",
  "s1-2864a05f154d18ec1a6640741f849b0a9ebe5152a050618261caf16db1e5c8a4",
];
const digiXrosMaterials = [
  "s1-4df2538d420394167ad4863804e566c2815ee5444616219ef4cec1b888a9f4b2",
  "s1-baa0643e3ab90398637dba0593697e6489a483ac215a018ef1c7a3c697f31577",
];

it("places the cards chosen by the first of two Yuu Amano reducers and offers them to neither again", async () => {
  const decisions: DecisionRequest[] = [];
  let replayed = false;
  const run = await runReplay(record, {
    untilInput: 41,
    onDecision: (request) => {
      if (replayed) decisions.push(request);
    },
  });
  replayed = true;
  try {
    expect(run.divergences).toEqual([]);
    const selection = run.pendingRequest as DecisionRequest;
    expect(selection.kind).toBe("selectCards");
    expect(selection.options?.candidateInstanceIds).toEqual(expect.arrayContaining(chosenUnderTamer));
    expect(
      await run.applyIntent(1, {
        type: "respondDecision",
        decisionId: selection.decisionId,
        response: { kind: "selectCards", instanceIds: chosenUnderTamer },
      }),
    ).toEqual({ ok: true });

    const seat = run.state.players[1]!;
    await settle(() => seat.battleArea.some((permanent) => permanent.topCard?.instanceId === playedInstanceId));
    expect(decisions.filter((request) => (request.promptText ?? "").includes(yuuPrompt))).toEqual([]);
    const played = seat.battleArea.find((permanent) => permanent.topCard?.instanceId === playedInstanceId)!;
    expect(played.stack.map((card) => card.instanceId).sort()).toEqual(
      [...chosenUnderTamer, ...digiXrosMaterials].sort(),
    );
    const tamerStacks = seat.battleArea
      .filter((permanent) => permanent.permanentId !== played.permanentId)
      .flatMap((permanent) => permanent.stack.map((card) => card.instanceId));
    for (const instanceId of chosenUnderTamer) expect(tamerStacks).not.toContain(instanceId);
  } finally {
    run.engine.applyIntent(0, { type: "surrender" });
  }
});
