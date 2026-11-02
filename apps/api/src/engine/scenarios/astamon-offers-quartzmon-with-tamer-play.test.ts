import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { DecisionResponse } from "@aegis/shared";
import { runReplay, type ReplayRun } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";

const record = JSON.parse(
  readFileSync(new URL("./astamon-offers-quartzmon-with-tamer-play.replay.json", import.meta.url), "utf8"),
) as ReplayRecord;

const astamonEffectInput = 118;
const astamonPermanentId = "perm-14";
const tamerWithSavePermanentId = "perm-12";

async function respond(run: ReplayRun, response: DecisionResponse) {
  const pending = run.state.pendingDecision!;
  await run.applyIntent(pending.seat, { type: "respondDecision", decisionId: pending.decisionId, response });
}

async function declineFollowUpPrompts(run: ReplayRun) {
  for (let pending = run.state.pendingDecision; pending !== undefined; pending = run.state.pendingDecision) {
    if (pending.kind === "optional") await respond(run, { kind: "optional", accept: false });
    else if (pending.kind === "selectCards" && "digiXrosCardId" in JSON.parse(pending.payloadJson))
      await respond(run, { kind: "selectCards", instanceIds: [] });
    else return;
  }
}

function astamonChoices(run: ReplayRun): string[] {
  const pending = run.state.pendingDecision!;
  const payload = JSON.parse(pending.payloadJson) as { choices: string[]; effectKey: string };
  expect(pending.kind).toBe("chooseOption");
  expect(payload.effectKey).toMatch(/^BT12-081\//);
  return payload.choices;
}

function topCardOf(run: ReplayRun, permanentId: string) {
  return run.state.players[0]!.battleArea.find((permanent) => permanent.permanentId === permanentId)?.topCard?.cardId;
}

function cardsUnder(run: ReplayRun, permanentId: string) {
  const permanent = run.state.players[0]!.battleArea.find((candidate) => candidate.permanentId === permanentId);
  return permanent?.stack.map(({ cardId }) => cardId) ?? [];
}

describe("Astamon When Digivolving choice between a Tamer play and Quartzmon", () => {
  it("replays the recorded match up to the Astamon effect", async () => {
    const { divergences } = await runReplay(record, { untilInput: astamonEffectInput });

    expect(divergences).toEqual([]);
  });

  it("offers the Quartzmon digivolution beside the play from under a Tamer", async () => {
    const run = await runReplay(record, { untilInput: astamonEffectInput });

    const choices = astamonChoices(run);

    expect(choices).toHaveLength(3);
    expect(choices.some((choice) => /Quartzmon/.test(choice))).toBe(true);
    expect(choices.some((choice) => /under .*Tamers/.test(choice))).toBe(true);
  });

  it("digivolves into the Quartzmon in hand and leaves the Tamer's card in place", async () => {
    const run = await runReplay(record, { untilInput: astamonEffectInput });
    const quartzmonIndex = astamonChoices(run).findIndex((choice) => /Quartzmon/.test(choice));

    await respond(run, { kind: "chooseOption", optionIndex: quartzmonIndex });
    await declineFollowUpPrompts(run);

    expect(topCardOf(run, astamonPermanentId)).toBe("BT12-057");
    expect(run.state.players[0]!.hand.map(({ cardId }) => cardId)).not.toContain("BT12-057");
    expect(cardsUnder(run, tamerWithSavePermanentId)).toContain("BT21-066");
  });

  it("plays the Tamer's Save Digimon instead of digivolving when that option is chosen", async () => {
    const run = await runReplay(record, { untilInput: astamonEffectInput });
    const playIndex = astamonChoices(run).findIndex((choice) => /under .*Tamers/.test(choice));

    await respond(run, { kind: "chooseOption", optionIndex: playIndex });
    await declineFollowUpPrompts(run);

    expect(topCardOf(run, astamonPermanentId)).toBe("BT12-081");
    expect(run.state.players[0]!.battleArea.some(({ topCard }) => topCard?.cardId === "BT21-066")).toBe(true);
    expect(run.state.players[0]!.hand.map(({ cardId }) => cardId)).toContain("BT12-057");
    expect(cardsUnder(run, tamerWithSavePermanentId)).not.toContain("BT21-066");
  });
});
