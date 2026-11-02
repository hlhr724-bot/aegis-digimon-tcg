import fixture from "#api/engine/scenarios/suspension-before-zero-dp-deletion.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import { Phase } from "@aegis/shared/schema/enums";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { runReplay } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";

const record = JSON.parse(
  readFileSync(new URL("./suspension-before-zero-dp-deletion.replay.json", import.meta.url), "utf8"),
) as ReplayRecord;

it("preserves Breakdramon's suspension trigger after the suspended ally is deleted at zero DP", async () => {
  const replay = await runReplay(record);
  try {
    expect(replay.divergences).toEqual([]);
    expect(replay.pendingRequest).toMatchObject({ kind: "chooseTargets", seat: 0 });
    expect(
      await replay.applyIntent(0, {
        type: "respondDecision",
        decisionId: replay.state.pendingDecision!.decisionId,
        response: { kind: "chooseTargets", instanceIds: ["perm-17"] },
      }),
    ).toEqual({ ok: true });
    expect(replay.state.players[0]!.battleArea.some((permanent) => permanent.permanentId === "perm-17")).toBe(false);
    expect(replay.state.pendingDecision).toMatchObject({ seat: 0, kind: "optional", promptText: "Battle" });
    expect(
      await replay.applyIntent(0, {
        type: "respondDecision",
        decisionId: replay.state.pendingDecision!.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    expect(
      await replay.applyIntent(0, {
        type: "respondDecision",
        decisionId: replay.state.pendingDecision!.decisionId,
        response: { kind: "chooseTargets", instanceIds: ["perm-28"] },
      }),
    ).toEqual({ ok: true });
    expect(replay.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === "perm-1")).toBe(false);
  } finally {
    await replay.applyIntent(0, { type: "surrender" });
  }
});

it("lets a surviving ally battle after the suspension cost payer dies at zero DP", async () => {
  const preferred: string[] = [];
  const s = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred });
  preferred.push(s.perm("payer").permanentId, s.perm("examon").permanentId);
  await s.ready();
  s.state.phase = Phase.Main;
  expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("reduction").instanceId })).toEqual({
    ok: true,
  });
  await settle(() => !s.state.pendingDecision && s.engine.mainVerbContinuationsInFlight === 0);
  expect(s.state.players[0]!.trash.some((card) => card.cardId === "EX13-041")).toBe(true);
  expect(s.state.players[1]!.battleArea).toHaveLength(0);
  expect(s.events.some((event) => event.kind === "battleCompared")).toBe(true);
});
