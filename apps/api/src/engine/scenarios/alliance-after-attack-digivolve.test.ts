import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import "#api/cards/index";

describe("Alliance granted by a digivolution card after the attacker digivolves mid-attack", () => {
  it("resolves the pending inherited Alliance on the digivolved attacker", async () => {
    const preferInstanceIds: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT15-063", as: "attacker", under: ["BT15-056", "BT15-087"] },
            { card: "BT27-008", as: "ally" },
          ],
          hand: [{ card: "BT27-015", as: "ouryumon" }],
        },
        1: {
          battleArea: [{ card: "BT1-009", as: "suspendTarget" }],
          security: ["BT1-009", "BT1-009", "BT1-009", "BT1-009"],
        },
      },
      {
        autoAcceptOptional: true,
        autoSelectCards: true,
        autoChooseOption: true,
        preferTriggerKeys: ["BT15-056"],
        preferInstanceIds,
      },
    );
    preferInstanceIds.push(s.perm("suspendTarget").permanentId);
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some(({ kind }) => kind === "alliancePrompt" || kind === "attackEnded"));
    expect(s.perm("attacker").topCard.cardId).toBe("BT27-015");
    expect(s.events.some(({ kind }) => kind === "alliancePrompt")).toBe(true);

    expect(s.engine.applyIntent(0, { type: "respondAlliance", allyPermanentId: s.perm("ally").permanentId })).toEqual({
      ok: true,
    });
    await settle(() => s.events.some(({ kind }) => kind === "attackEnded") && !s.state.pendingDecision);
    expect(s.perm("ally").isSuspended).toBe(true);
    expect(s.state.players[1]!.security).toHaveLength(1);
  });
});
