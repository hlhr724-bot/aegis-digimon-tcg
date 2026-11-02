import { describe, expect, it } from "vitest";
import "#api/cards/index";
import { Phase } from "@aegis/shared/schema/enums";
import { setupScenario } from "#api/engine/testkit/scenario";
import fixture from "#api/engine/scenarios/arts-partition-security-trigger-priority.fixture";
import { settle } from "#api/engine/testkit/harness";

describe("Arts digivolution security triggers before opposing Partition On Play", () => {
  it("resolves Kentaurosmon X's new security trigger before the opponent's pending On Play", async () => {
    const s = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true });
    s.state.phase = Phase.Main;
    await s.ready();
    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("dual").instanceId, useAs: "option" }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined && s.state.players[0]!.hand.length === 2);
    await settle();
    const securityTrigger = s.events.findIndex(
      (event) =>
        event.kind === "effectTriggered" && event.sourceCardId === "BT27-043" && event.timing === "whenSecurityRemoved",
    );
    expect(securityTrigger).toBeGreaterThanOrEqual(0);
    const opponentOnPlay = s.events.findIndex(
      (event) =>
        event.kind === "effectTriggered" &&
        event.sourceCardId === "EX13-036" &&
        event.seat === 1 &&
        event.timing === "OnPlay",
    );
    expect(opponentOnPlay).toBe(-1);
    expect(s.perm("base").topCard.cardId).toBe("BT27-043");
    expect(s.perm("base").currentDP).toBe(13000);
    expect(s.state.players[1]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual(["BT1-083"]);
    expect(s.state.players[0]!.security.map(({ cardId }) => cardId)).toEqual(["BT1-009", "EX13-036"]);
  });
});
