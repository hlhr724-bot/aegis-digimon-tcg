import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import { runReplay } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";
import { settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";
import fixture from "#api/engine/scenarios/decode-iliad-sources.fixture";

it("has no eligible Decode source in the recorded Junomon stack", async () => {
  const record = JSON.parse(
    readFileSync(new URL("./decode-iliad-sources.replay.json", import.meta.url), "utf8"),
  ) as ReplayRecord;
  const replay = await runReplay(record);
  try {
    expect(replay.divergences).toEqual([]);
    const host = replay.state.players[0]!.battleArea.find((permanent) => permanent.permanentId === "perm-19")!;
    expect(host.stack.map((card) => card.cardId)).toEqual(["BT21-071", "BT25-083", "BT25-085"]);
    expect(
      replay.state.players[0]!.battleArea.some(
        (permanent) =>
          permanent.permanentId !== host.permanentId && permanent.stack.some((card) => card.cardId === "BT25-082"),
      ),
    ).toBe(true);
  } finally {
    await replay.applyIntent(0, { type: "surrender" });
  }
});

it.each([true, false])("keeps Decode within the leaving host's sources when accepted is %s", async (accept) => {
  const preferred: string[] = [];
  const s = setupScenario(fixture, {
    autoAcceptOptional: accept,
    autoDeclineOptional: !accept,
    autoSelectCards: true,
    preferInstanceIds: preferred,
  });
  preferred.push(s.perm("hysteric").permanentId, s.inst("blackgatomon").instanceId);
  await s.ready();
  s.state.phase = Phase.Main;
  expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("gaiaForce").instanceId })).toEqual({
    ok: true,
  });
  await settle(() => !s.state.pendingDecision && s.engine.mainVerbContinuationsInFlight === 0);
  const own = s.state.players[0]!;
  expect(own.battleArea.some(({ topCard }) => topCard.instanceId === s.inst("blackgatomon").instanceId)).toBe(accept);
  expect(own.trash.some(({ cardId }) => cardId === "BT26-083")).toBe(true);
  expect(s.perm("otherHost").stack.map(({ instanceId }) => instanceId)).toContain(
    s.inst("otherBlackgatomon").instanceId,
  );
});

it("does not Decode BlackGatomon from a different Digimon's sources", async () => {
  const preferred: string[] = [];
  const s = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred });
  const host = s.perm("hysteric");
  host.stack.splice(0, 1);
  preferred.push(host.permanentId);
  await s.ready();
  s.state.phase = Phase.Main;
  expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("gaiaForce").instanceId })).toEqual({
    ok: true,
  });
  await settle(() => !s.state.pendingDecision && s.engine.mainVerbContinuationsInFlight === 0);
  expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual(["EX7-073"]);
  expect(s.perm("otherHost").stack.map(({ cardId }) => cardId)).toEqual(["BT25-082"]);
  expect(s.state.players[0]!.trash.some(({ cardId }) => cardId === "BT26-083")).toBe(true);
});
