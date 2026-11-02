import { describe, expect, it } from "vitest";
import "#api/cards/EX7/EX7-058";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";

describe("Token Retaliation after battle deletion", () => {
  it.each([4000, 5000, 9000])("resolves only when the token alone loses against %s DP", async (dp) => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT1-009", as: "attacker", dp }] },
        1: { battleArea: [{ card: "TOKEN-Volée-&-Zerdrücken", as: "token", suspended: true }] },
      },
      { autoDeclineOptional: true },
    );
    await s.ready();
    const attacker = s.perm("attacker").permanentId;
    const token = s.perm("token").permanentId;
    expect(observe(s.engine).hasKeyword(s.perm("token"), "Retaliation")).toBe(true);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: attacker,
        target: { kind: "permanent", permanentId: token },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking() && s.state.pendingDecision === undefined);
    expect(s.state.players[0]!.battleArea.some((p) => p.permanentId === attacker)).toBe(false);
    expect(s.state.players[1]!.battleArea.some((p) => p.permanentId === token)).toBe(dp < 5000);
    expect(s.events.filter((e) => e.kind === "effectTriggered" && e.effectKey === "keyword/retaliation")).toHaveLength(
      dp > 5000 ? 1 : 0,
    );
    expect(s.state.players[1]!.trash.some((c) => c.cardId.startsWith("TOKEN-"))).toBe(false);
  });
});
