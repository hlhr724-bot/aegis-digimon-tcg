import { describe, expect, it } from "vitest";
import "../../cards/index.js";
import { assertNoLoudGap, setupEngine, settle } from "../testkit/harness.js";

type Setup = ReturnType<typeof setupEngine>;

async function playLoudmon(): Promise<Setup> {
  const s = setupEngine({
    0: {
      battleArea: [{ card: "EX11-049", as: "punkmon" }],
      hand: [{ card: "EX11-050", as: "loudmon" }, "BT1-009", "BT1-010"],
    },
    1: { battleArea: [{ card: "BT1-009", as: "target", dp: 6500 }] },
  });
  s.state.memory = 10;
  await s.ready();
  expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("loudmon").instanceId })).toEqual({
    ok: true,
  });
  return s;
}

async function usePlugIn(): Promise<Setup> {
  const s = setupEngine({
    0: {
      battleArea: [
        { card: "BT1-010", as: "weak" },
        { card: "AD1-011", as: "strong" },
      ],
      hand: [{ card: "ST22-08", as: "plugIn" }],
    },
    1: { battleArea: [{ card: "BT1-009", as: "target", dp: 6500 }] },
  });
  s.state.memory = 10;
  await s.ready();
  expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("plugIn").instanceId })).toEqual({
    ok: true,
  });
  await settle(() => s.state.pendingDecision?.kind === "optional");
  expect(
    s.engine.applyIntent(0, {
      type: "respondDecision",
      decisionId: s.state.pendingDecision!.decisionId,
      response: { kind: "optional", accept: false },
    }),
  ).toEqual({ ok: true });
  return s;
}

async function chooseReference(s: Setup, permanentId: string, otherReferenceId: string): Promise<void> {
  await settle(
    () =>
      s.state.pendingDecision?.kind === "chooseTargets" &&
      s.state.pendingDecision.payloadJson.includes(permanentId) &&
      s.state.pendingDecision.payloadJson.includes(otherReferenceId),
  );
  expect(
    s.engine.applyIntent(0, {
      type: "respondDecision",
      decisionId: s.state.pendingDecision!.decisionId,
      response: { kind: "chooseTargets", instanceIds: [permanentId] },
    }),
  ).toEqual({ ok: true });
}

describe("deleting by the DP of 1 of your Digimon lets the player choose that Digimon first", () => {
  it("spares the opponent when Loudmon's player chooses a weaker Dark Dragon", async () => {
    const s = await playLoudmon();
    await chooseReference(s, s.perm("punkmon").permanentId, s.perm("loudmon").permanentId);
    await settle(() => s.state.pendingDecision === undefined);
    expect(s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId)).toEqual([
      s.perm("target").permanentId,
    ]);
    assertNoLoudGap(s);
  });

  it("deletes the opponent when Loudmon's player chooses Loudmon itself", async () => {
    const s = await playLoudmon();
    await chooseReference(s, s.perm("loudmon").permanentId, s.perm("punkmon").permanentId);
    await settle(() => s.state.pendingDecision === undefined && s.state.players[1]!.battleArea.length === 0);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    assertNoLoudGap(s);
  });

  it("spares the opponent when Offensive Plug-In V's player chooses a weaker Digimon", async () => {
    const s = await usePlugIn();
    await chooseReference(s, s.perm("weak").permanentId, s.perm("strong").permanentId);
    await settle(() => s.state.pendingDecision === undefined);
    expect(s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId)).toEqual([
      s.perm("target").permanentId,
    ]);
    assertNoLoudGap(s);
  });

  it("deletes the opponent when Offensive Plug-In V's player chooses a stronger Digimon", async () => {
    const s = await usePlugIn();
    await chooseReference(s, s.perm("strong").permanentId, s.perm("weak").permanentId);
    await settle(() => s.state.pendingDecision === undefined && s.state.players[1]!.battleArea.length === 0);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    assertNoLoudGap(s);
  });
});
