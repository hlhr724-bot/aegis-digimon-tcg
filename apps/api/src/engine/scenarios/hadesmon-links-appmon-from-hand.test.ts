import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "../testkit/harness.js";
import "../../cards/index.js";

function candidatesOf(payloadJson: string | undefined): string[] {
  return (JSON.parse(payloadJson ?? "{}") as { candidateInstanceIds?: string[] }).candidateInstanceIds ?? [];
}

describe("Hadesmon When Digivolving link", () => {
  it("asks for the Appmon card from hand before the Digimon that receives it", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "BT2-075", as: "base" },
          { card: "BT21-009", as: "recipient" },
        ],
        hand: [
          { card: "BT24-079", as: "hadesmon" },
          { card: "BT24-071", as: "raidramon" },
          { card: "BT24-053", as: "protecmon" },
        ],
      },
    });
    s.state.memory = 6;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("hadesmon").instanceId,
      }),
    ).toEqual({ ok: true });

    await settle(() => s.state.pendingDecision?.kind === "optional");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: s.state.pendingDecision!.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });

    await settle(() => s.state.pendingDecision !== undefined);
    const cardChoice = s.state.pendingDecision!;
    expect(cardChoice.kind).toBe("selectCards");
    expect(candidatesOf(cardChoice.payloadJson)).toEqual(
      expect.arrayContaining([s.inst("raidramon").instanceId, s.inst("protecmon").instanceId]),
    );
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: cardChoice.decisionId,
        response: { kind: "selectCards", instanceIds: [s.inst("raidramon").instanceId] },
      }),
    ).toEqual({ ok: true });

    await settle(() => s.state.pendingDecision?.kind === "chooseTargets");
    const recipientChoice = s.state.pendingDecision!;
    expect(candidatesOf(recipientChoice.payloadJson)).toEqual(
      expect.arrayContaining([s.perm("base").permanentId, s.perm("recipient").permanentId]),
    );
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: recipientChoice.decisionId,
        response: { kind: "chooseTargets", instanceIds: [s.perm("recipient").permanentId] },
      }),
    ).toEqual({ ok: true });

    await settle(() => s.perm("recipient").linked.length > 0);
    expect(s.perm("recipient").linked.map((card) => card.instanceId)).toEqual([s.inst("raidramon").instanceId]);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([s.inst("protecmon").instanceId]);
    expect(s.state.pendingDecision).toBeUndefined();
  });
});
