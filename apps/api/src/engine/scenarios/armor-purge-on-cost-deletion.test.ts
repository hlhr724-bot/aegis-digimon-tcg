import { describe, expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/armor-purge-on-cost-deletion.fixture";
import { advance } from "#api/engine/testkit/advance";
import { finishTurnLoop } from "#api/engine/testkit/finishTurnLoop";
import { settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";

const armorPurgePrompt = "＜Armor Purge＞";

async function playGizmonXtByDeletingStegomon(purge: boolean) {
  const s = setupScenario(fixture, { autoAcceptOptional: true });
  await s.ready();
  const loop = s.engine.startTurnLoop();
  await advance(s.engine).waitForMainPhase(0);
  const memoryBefore = s.state.memory;
  const stegomonTopId = s.perm("stegomon").topCard.instanceId;
  expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("gizmonXt").instanceId })).toEqual({
    ok: true,
  });
  const armorPurgeRequest = () =>
    s.decisions.find(({ req }) => req.options?.effectText?.startsWith(armorPurgePrompt) === true)?.req;
  await settle(() => armorPurgeRequest() !== undefined && s.state.pendingDecision !== undefined);
  const prompt = armorPurgeRequest()!;
  expect(prompt).toMatchObject({ seat: 0, kind: "selectCards" });
  expect(prompt.options).toMatchObject({
    candidateInstanceIds: [stegomonTopId],
    min: 0,
    max: 1,
    promptKey: "armorPurge",
  });
  expect(
    s.engine.applyIntent(0, {
      type: "respondDecision",
      decisionId: prompt.decisionId,
      response: { kind: "selectCards", instanceIds: purge ? [stegomonTopId] : [] },
    }),
  ).toEqual({ ok: true });
  await settle(
    () =>
      s.state.pendingDecision === undefined &&
      s.state.players[0]!.battleArea.some(
        (permanent) => permanent.topCard.instanceId === s.inst("gizmonXt").instanceId,
      ),
  );
  return { s, loop, memoryBefore, stegomonTopId };
}

describe("Armor Purge prompt on a Digimon deleted to pay a cost", () => {
  it("lets the controller decline it, so the deletion pays the discount and triggers Akihiro Kurata", async () => {
    const { s, loop, memoryBefore, stegomonTopId } = await playGizmonXtByDeletingStegomon(false);
    try {
      const player = s.state.players[0]!;
      expect(s.state.memory).toBe(memoryBefore - 3);
      expect(player.trash.map((card) => card.instanceId)).toEqual(
        expect.arrayContaining([stegomonTopId, s.inst("kurataTamer").instanceId]),
      );
      expect(s.perm("akihiro").isSuspended).toBe(true);
      expect(s.perm("akihiro").stack).toHaveLength(2);
    } finally {
      await finishTurnLoop({ setup: s, loop });
    }
  });

  it("lets the controller use it, so the Digimon is not deleted, the full cost is paid, and Akihiro Kurata does not trigger", async () => {
    const { s, loop, memoryBefore, stegomonTopId } = await playGizmonXtByDeletingStegomon(true);
    try {
      const player = s.state.players[0]!;
      expect(s.state.memory).toBe(memoryBefore - 9);
      expect(player.trash.map((card) => card.instanceId)).toEqual([stegomonTopId]);
      expect(player.battleArea.map((permanent) => permanent.topCard.instanceId)).toContain(
        s.inst("kurataTamer").instanceId,
      );
      expect(s.perm("akihiro").isSuspended).toBe(false);
      expect(s.perm("akihiro").stack).toHaveLength(0);
    } finally {
      await finishTurnLoop({ setup: s, loop });
    }
  });
});
