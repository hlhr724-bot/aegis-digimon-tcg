import { describe, expect, it } from "vitest";
import "#api/cards/index";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";

describe("Barrier blocker prevents Piercing", () => {
  it.each([true, false])("protects Nezhamon and prevents checks when Barrier accepted=%s", async (acceptBarrier) => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "EX13-045", as: "examon", dp: 24000 }] },
        1: {
          battleArea: [{ card: "EX12-019", as: "nezhamon", under: ["EX13-030"] }],
          security: ["BT1-009", "BT1-010", "BT1-011"],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true, declinePrompts: ["Raid"] },
    );
    s.state.memory = 5;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("examon").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "blockWindowOpened"));
    expect(
      s.engine.applyIntent(1, { type: "declareBlock", blockerPermanentId: s.perm("nezhamon").permanentId }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "barrierPrompt"));
    expect(
      s.engine.applyIntent(1, {
        type: "respondBarrier",
        permanentId: s.perm("nezhamon").permanentId,
        accept: acceptBarrier,
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking() && s.state.pendingDecision === undefined);
    expect(s.events.filter((event) => event.kind === "securityChecked")).toHaveLength(acceptBarrier ? 0 : 2);
    expect(s.state.players[1]!.security).toHaveLength(acceptBarrier ? 2 : 1);
    expect(s.state.players[1]!.battleArea.some((permanent) => permanent.topCard.cardId === "EX12-019")).toBe(
      acceptBarrier,
    );
  });
});
