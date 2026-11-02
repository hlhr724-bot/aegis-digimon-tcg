import fixture from "../../api/src/engine/scenarios/data-squad-aquatic-digivolution-chain.fixture";
import { stubCardArtwork } from "./card-artwork";
import { test, expect, type DecisionPolicy } from "./scenario-page";

test("Homer Yushima digivolves into Shaujinmon, and JumboGamemon places Homer to return a Digimon and replay it", async ({
  scenario,
}) => {
  const { page } = scenario;
  await stubCardArtwork(page);
  const refs = await scenario.openFixture(fixture);
  const homerId = refs.permanentId("homer");
  const gaogamonId = refs.permanentId("gaogamon");
  const returnTargetId = refs.permanentId("returnTarget");
  const lockTargetId = refs.permanentId("lockTarget");
  const aquaticCost = refs.instanceId("aquaticCost");
  const homerFaceDown = refs.instanceId("homerFaceDown");
  const shaujinmon = refs.instanceId("shaujinmon");
  const jumboGamemon = refs.instanceId("jumboGamemon");

  const startOfMain = await scenario.snapshot();
  const homerCard = startOfMain.players[0]!.battleArea.find((permanent) => permanent.permanentId === homerId)!.topCard
    .instanceId;
  const offered: Record<string, string[]> = {};
  const policy: DecisionPolicy = (decision) => {
    const candidates = decision.options.candidateInstanceIds ?? [];
    if (decision.kind === "selectCards" || decision.kind === "chooseTargets") {
      offered[`${decision.sourceCardId}:${decision.kind}:${Object.keys(offered).length}`] = [...candidates];
    }
    if (candidates.includes(aquaticCost)) return { instanceId: aquaticCost };
    if (decision.sourceCardId === "BT27-028" && candidates.includes(lockTargetId)) return { instanceId: lockTargetId };
    if (candidates.includes(homerId)) return { instanceId: homerId };
    if (candidates.includes(homerCard)) return { instanceId: homerCard };
    return { accept: true };
  };

  await scenario.resolveUntil((state) => state.phase === "Main" && !state.pendingDecision, policy);
  const afterStart = await scenario.snapshot();
  const homerAfterStart = afterStart.players[0]!.battleArea.find((permanent) => permanent.permanentId === homerId)!;
  expect(homerAfterStart.stack.map((card) => card.instanceId)).toEqual([aquaticCost, homerFaceDown]);
  expect(afterStart.players[0]!.hand.map((card) => card.instanceId)).not.toContain(aquaticCost);
  expect(afterStart.memory).toBe(6);

  await page.locator(`[data-drop="perm-you"][data-id="${homerId}"]`).click();
  await page.getByRole("button", { name: /^Activate effect: \[Main\] By suspending this Tamer/ }).click();
  await scenario.resolveUntil((state) => {
    const host = state.players[0]!.battleArea.find((permanent) => permanent.permanentId === gaogamonId);
    return host?.topCard.instanceId === shaujinmon && !state.pendingDecision;
  }, policy);

  const afterHomer = await scenario.snapshot();
  const suspendedHomer = afterHomer.players[0]!.battleArea.find((permanent) => permanent.permanentId === homerId)!;
  expect(suspendedHomer.isSuspended).toBe(true);
  expect(suspendedHomer.stack).toHaveLength(0);
  expect(afterHomer.players[0]!.trash.map((card) => card.instanceId)).toEqual(
    expect.arrayContaining([aquaticCost, homerFaceDown]),
  );
  expect(afterHomer.memory).toBe(5);
  expect(
    Object.entries(offered)
      .find(([key]) => key.startsWith("BT27-028:chooseTargets"))?.[1]
      .sort(),
  ).toEqual([lockTargetId, returnTargetId].sort());

  await scenario.evolve("JumboGamemon", gaogamonId);
  await scenario.resolveUntil(
    (state) =>
      !state.pendingDecision &&
      !state.players[1]!.battleArea.some((permanent) => permanent.permanentId === returnTargetId) &&
      state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === homerCard),
    policy,
  );

  const final = await scenario.snapshot();
  const jumbo = final.players[0]!.battleArea.find((permanent) => permanent.permanentId === gaogamonId)!;
  expect(jumbo.topCard.instanceId).toBe(jumboGamemon);
  expect(jumbo.stack.map((card) => card.cardId)).toEqual(["ST24-03", "BT27-028"]);
  expect(final.players[1]!.battleArea.map((permanent) => permanent.permanentId)).toEqual([lockTargetId]);
  expect(final.players[1]!.deckCount).toBe(startOfMain.players[1]!.deckCount + 1);
  expect(final.players[1]!.trash).toHaveLength(startOfMain.players[1]!.trash.length + 1);
  const replayedHomer = final.players[0]!.battleArea.find((permanent) => permanent.topCard.instanceId === homerCard)!;
  expect(replayedHomer.isSuspended).toBe(false);
  expect(final.memory).toBe(1);
  await scenario.healthy();
});
