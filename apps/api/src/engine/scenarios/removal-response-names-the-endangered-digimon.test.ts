import type { DecisionRequest } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import "#api/cards/index";
import { buildRemovalResponseNamesTheEndangeredDigimon } from "#api/engine/scenarios/removal-response-names-the-endangered-digimon.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { settle, type EngineSetup } from "#api/engine/testkit/harness";

type RemovalResponse = Parameters<typeof buildRemovalResponseNamesTheEndangeredDigimon>[0];

async function withTargetedDeletion(response: RemovalResponse, verify: (s: EngineSetup) => Promise<void>) {
  const s = setupScenario(buildRemovalResponseNamesTheEndangeredDigimon(response));
  await s.ready();
  const loop = s.engine.startTurnLoop();
  try {
    await advance(s.engine).waitForMainPhase(0);
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("removal").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision?.seat === 0);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: s.state.pendingDecision!.decisionId,
        response: { kind: "chooseTargets", instanceIds: [s.perm("endangered").permanentId] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.seat === 1);
    await verify(s);
  } finally {
    s.engine.applyIntent(0, { type: "surrender" });
    await loop;
  }
}

function getDefenderRequest(s: EngineSetup): DecisionRequest {
  return s.decisions.find(({ req }) => req.decisionId === s.state.pendingDecision!.decisionId)!.req;
}

describe("a response to an opponent's deletion", () => {
  it("names the endangered Digimon on the Decoy confirmation", async () => {
    await withTargetedDeletion("decoy", async (s) => {
      const request = getDefenderRequest(s);
      const endangered = s.perm("endangered").permanentId;
      expect(request).toMatchObject({ seat: 1, kind: "selectCards", sourceCardId: "BT6-059" });
      expect(request.options?.candidateInstanceIds).toEqual([s.perm("responder").topCard.instanceId]);
      expect(request.options?.affectedPermanentIds).toEqual([endangered]);
      expect(
        s.engine.applyIntent(1, {
          type: "respondDecision",
          decisionId: request.decisionId,
          response: { kind: "selectCards", instanceIds: [s.perm("responder").topCard.instanceId] },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision === undefined && s.state.players[1]!.battleArea.length === 2);
      expect(s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId)).toEqual([
        endangered,
        s.perm("same-name-bystander").permanentId,
      ]);
    });
  });

  it("names the endangered Digimon on an optional would-leave replacement", async () => {
    await withTargetedDeletion("replacement", async (s) => {
      const request = getDefenderRequest(s);
      expect(request).toMatchObject({ seat: 1, kind: "optional", sourceCardId: "BT20-091" });
      expect(request.options?.affectedPermanentIds).toEqual([s.perm("endangered").permanentId]);
      expect(request.options?.visibleCards).toEqual([
        { instanceId: s.inst("replacement-play").instanceId, cardId: "BT20-083" },
      ]);
      expect(
        s.engine.applyIntent(1, {
          type: "respondDecision",
          decisionId: request.decisionId,
          response: { kind: "optional", accept: false },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision === undefined && s.state.players[1]!.battleArea.length === 2);
      expect(s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId)).toEqual([
        s.perm("same-name-bystander").permanentId,
        s.perm("responder").permanentId,
      ]);
      expect(s.state.players[1]!.hand.map(({ instanceId }) => instanceId)).toEqual([
        s.inst("replacement-play").instanceId,
      ]);
    });
  });
});
