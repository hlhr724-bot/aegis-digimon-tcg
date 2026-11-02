import { describe, expect, it } from "vitest";
import { cite } from "./_kb.js";
import { observe } from "../testkit/observe.js";
import { advance } from "../testkit/advance.js";
import { assertNoLoudGap, setupEngine, settle } from "../testkit/harness.js";
import "../../cards/index.js";

describe("Ascension through public battle deletion", () => {
  it.each([
    { card: "BT25-034", base: "BT1-052", ascends: true },
    { card: "BT25-040", base: "BT1-052", ascends: true },
    { card: "BT26-029", base: "BT1-052", ascends: true },
    { card: "BT1-052", base: "BT1-045", ascends: false },
  ])("$card preserves exact card identity and source destinations", async ({ card, base, ascends }) => {
    cite(
      "comprehensive-0262",
      "16-43: optional deletion-triggered top security placement",
      "76ebf45a33b0f32ac2d60968e7026e86ac27ce1ae59daa902cde5ad628c98dd4",
    );
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card, as: "holder", suspended: true, under: [{ card: base, as: "source" }] }],
          security: [{ card: "BT1-028", as: "oldSecurity" }],
          deck: ["BT1-028"],
        },
        1: { battleArea: [{ card: "BT1-080", as: "attacker" }], security: ["BT1-028"], deck: ["BT1-028"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    s.state.turnSeat = 1;
    s.state.memory = 5;
    await s.ready();
    const holder = s.perm("holder");
    const holderId = holder.topCard.instanceId;
    const sourceId = s.inst("source").instanceId;
    const securityId = s.inst("oldSecurity").instanceId;
    const attacker = s.perm("attacker");
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: attacker.permanentId,
        target: { kind: "permanent", permanentId: holder.permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking());
    await settle();
    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.security.map((instance) => instance.instanceId)).toEqual(
      ascends ? [holderId, securityId] : [securityId],
    );
    expect(s.state.players[0]!.security.map((instance) => instance.faceUp)).toEqual(ascends ? [false, false] : [false]);
    expect(s.state.players[0]!.trash.map((instance) => instance.instanceId).sort()).toEqual(
      (ascends ? [sourceId] : [sourceId, holderId]).sort(),
    );
    expect(s.state.players[1]!.battleArea.map((permanent) => permanent.topCard.instanceId)).toEqual([
      s.inst("attacker").instanceId,
    ]);
    expect(attacker.currentDP).toBe(12000);
    expect(attacker.isSuspended).toBe(true);
    expect(attacker.controllerSeat).toBe(1);
    expect(s.state.players[1]!.trash).toHaveLength(0);
    expect(s.state.players[1]!.security).toHaveLength(1);
    expect(s.state.memory).toBe(5);
    expect(s.state.pendingDecision).toBeUndefined();
    assertNoLoudGap(s);
  });

  it.each([true, false])("preserves an Execute-deleted card when Ascension is accepted: %s", async (accept) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-082", as: "executor" }],
          hand: ["BT1-009"],
          deck: ["BT1-009", "BT1-009"],
          security: ["BT1-028"],
        },
        1: { security: ["BT1-028", "BT1-028", "BT1-028", "BT1-028"], deck: ["BT1-009"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, declinePrompts: accept ? [] : ["Ascension"] },
    );
    await s.ready();
    const id = s.inst("executor").instanceId;
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    advance(s.engine).endMainPhaseIfOpen(0);
    await turn;
    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.security.some(({ instanceId }) => instanceId === id)).toBe(accept);
    expect(s.state.players[0]!.trash.some(({ instanceId }) => instanceId === id)).toBe(!accept);
    assertNoLoudGap(s);
  });

  it.each([false, true])(
    "Execute preserves the chosen reaction order (Ascension first: %s)",
    async (ascensionFirst) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [{ card: "EX12-047", as: "executor", under: ["EX12-004"] }],
            trash: [{ card: "EX12-009", as: "recovered" }],
            deck: ["BT1-009", "BT1-009"],
            security: ["BT1-028"],
          },
          1: { security: ["BT1-028", "BT1-028", "BT1-028", "BT1-028"], deck: ["BT1-009"] },
        },
        { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: false },
      );
      await s.ready();
      const executorId = s.inst("executor").instanceId;
      const turn = s.engine.runOneTurn();
      await advance(s.engine).waitForMainPhase(0);
      advance(s.engine).endMainPhaseIfOpen(0);
      await settle(() => s.state.pendingDecision?.kind === "orderTriggers");
      const pending = s.state.pendingDecision!;
      const request = s.decisions.find(({ req }) => req.decisionId === pending.decisionId)!.req;
      const chosenIndex = request.options!.triggerTimings!.findIndex(
        (timing) => timing === (ascensionFirst ? "Ascension" : "OnDeletion"),
      );
      expect(chosenIndex).toBeGreaterThanOrEqual(0);
      const chosen = request.options!.triggerKeys![chosenIndex]!;
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: pending.decisionId,
          response: { kind: "orderTriggers", order: [chosen] },
        }),
      ).toEqual({ ok: true });
      await turn;
      expect(s.state.players[0]!.security.map(({ instanceId }) => instanceId)).toContain(executorId);
      expect(s.state.players[0]!.battleArea.some((p) => p.topCard.cardId === "EX12-009")).toBe(!ascensionFirst);
      expect(s.state.players[0]!.trash.some((card) => card.cardId === "EX12-009")).toBe(ascensionFirst);
      assertNoLoudGap(s);
    },
  );

  it("publicly refuses optional Ascension and leaves the deleted card in trash", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT25-040", as: "holder", suspended: true }],
          security: [{ card: "BT1-028", as: "oldSecurity" }],
        },
        1: { battleArea: [{ card: "BT1-080", as: "attacker" }] },
      },
      { autoAcceptOptional: false, autoSelectCards: false },
    );
    s.state.turnSeat = 1;
    await s.ready();
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "permanent", permanentId: s.perm("holder").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const decision = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: decision.decisionId,
        response: { kind: "optional", accept: false },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking());
    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toContain(s.inst("holder").instanceId);
    expect(s.state.players[0]!.security.map(({ instanceId }) => instanceId)).toEqual([
      s.inst("oldSecurity").instanceId,
    ]);
    expect(s.state.pendingDecision).toBeUndefined();
    assertNoLoudGap(s);
  });

  it("orders public Ascension before a pending On Deletion effect and preserves source identity", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT26-075", as: "scourge" },
            { card: "BT1-089", as: "tamer", under: [{ card: "BT1-010", as: "faceDown", faceUp: false }] },
          ],
          trash: [{ card: "BT26-052", as: "glowingDawn" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: false },
    );
    await s.ready();

    const deletion = advance(s.engine).verb.deletePermanent([s.perm("scourge").permanentId], "byEffect");
    expect(deletion).toBeDefined();
    await settle(() => s.state.pendingDecision?.kind === "orderTriggers");
    const pending = s.state.pendingDecision!;
    const request = s.decisions.find(({ req }) => req.decisionId === pending.decisionId)!.req;
    const keys = request.options?.triggerKeys ?? [];
    expect(keys).toHaveLength(2);
    const ascensionKey = keys.find((key) => key.startsWith("ascension/"));
    expect(ascensionKey).toBeDefined();
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: pending.decisionId,
        response: { kind: "orderTriggers", order: [ascensionKey!] },
      }),
    ).toMatchObject({ ok: true });
    await settle(() => s.state.players[0]!.security.some(({ cardId }) => cardId === "BT26-075"));

    expect(s.state.players[0]!.security.map(({ cardId }) => cardId)).toContain("BT26-075");
    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard?.cardId)).not.toContain("BT26-052");
    expect(s.perm("tamer").stack.map(({ cardId }) => cardId)).toContain("BT1-010");
    expect(s.state.players[0]!.trash.map(({ cardId }) => cardId)).not.toContain("BT26-075");
    assertNoLoudGap(s);
  });

  it("uses a granted Ascension from a public keyword grant and moves that exact card", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT24-019", as: "iliad", suspended: true }],
          hand: [
            { card: "BT26-030", as: "pumpkinmon" },
            { card: "BT1-009", as: "cost" },
          ],
        },
        1: { battleArea: [{ card: "BT1-010", as: "attacker" }], security: ["BT1-085"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("iliad").permanentId);
    const grantedId = s.perm("iliad").topCard.instanceId;
    await s.ready();
    s.state.memory = 10;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("pumpkinmon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.hand.length === 1);
    expect(observe(s.engine).hasKeyword(s.perm("iliad"), "Ascension")).toBe(true);
    expect(s.state.players[0]!.hand).toHaveLength(0);
    expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toContain(s.inst("cost").instanceId);

    s.state.turnSeat = 1;
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "permanent", permanentId: s.perm("iliad").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.security.some(({ instanceId }) => instanceId === grantedId));
    expect(s.state.players[0]!.security[0]).toMatchObject({ instanceId: grantedId, faceUp: false });
    expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).not.toContain(grantedId);
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
    assertNoLoudGap(s);
  });

  it("expires granted Ascension before the next player's public battle", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT24-019", as: "iliad", suspended: true }],
          hand: [
            { card: "BT26-030", as: "pumpkinmon" },
            { card: "BT1-009", as: "cost" },
            // A playable reserve keeps Main open after the grant. Without it, Main has no legal
            // action left and the engine passes the turn before the grant can be observed.
            { card: "BT1-009", as: "reserve" },
          ],
          deck: ["BT1-009", "BT1-009"],
        },
        1: {
          battleArea: [{ card: "BT1-080", as: "attacker" }],
          security: ["BT1-085"],
          deck: ["BT1-009", "BT1-009"],
        },
      },
      { autoAcceptOptional: false, autoSelectCards: true, preferInstanceIds: preferred },
    );
    s.state.memory = 10;
    await s.ready();
    preferred.push(s.perm("iliad").permanentId);
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: s.perm("iliad").permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await settle(() => !observe(s.engine).isAttacking());
      expect(s.perm("iliad").isSuspended).toBe(true);
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("pumpkinmon").instanceId })).toEqual({
        ok: true,
      });
      // Pumpkinmon's grant is gated only by a hand-trash cost, so it no longer asks a separate
      // "use this effect?" question: the cost selection is that question and `autoSelectCards`
      // pays it (see `costIsAskedAsSelection`).
      await settle(() => s.state.players[0]!.hand.length === 1);
      expect(observe(s.engine).hasKeyword(s.perm("iliad"), "Ascension")).toBe(true);
      advance(s.engine).endMainPhaseIfOpen(0);
      for (let i = 0; i < 3; i += 1) {
        await settle(() => s.state.pendingDecision?.kind === "optional" || s.state.phase !== "End");
        if (s.state.pendingDecision === undefined) break;
        const execute = s.state.pendingDecision;
        expect(
          s.engine.applyIntent(0, {
            type: "respondDecision",
            decisionId: execute.decisionId,
            response: { kind: "optional", accept: false },
          }),
        ).toEqual({ ok: true });
        await settle();
      }
      await advance(s.engine).waitForMainPhase(1);
      expect(observe(s.engine).hasKeyword(s.perm("iliad"), "Execute")).toBe(false);
      expect(
        observe(s.engine)
          .customEffectGrants(s.perm("iliad"))
          .some(({ token }) => token === "Execute"),
      ).toBe(false);
      expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.instanceId)).toContain(
        s.inst("iliad").instanceId,
      );
      expect(
        s.engine.applyIntent(1, {
          type: "attack",
          attackerPermanentId: s.perm("attacker").permanentId,
          target: { kind: "permanent", permanentId: s.perm("iliad").permanentId },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.players[0]!.trash.some(({ instanceId }) => instanceId === s.inst("iliad").instanceId));
      const iliadId = s.inst("iliad").instanceId;
      expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toContain(iliadId);
      expect(s.state.players[0]!.security.map(({ instanceId }) => instanceId)).not.toContain(iliadId);
      expect(s.state.pendingDecision).toBeUndefined();
      advance(s.engine).endMainPhaseIfOpen(1);
      await advance(s.engine).waitForMainPhase(0);
      expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    } finally {
      if (s.state.pendingDecision === undefined && s.state.phase === "Main")
        s.engine.applyIntent(s.state.turnSeat, { type: "surrender" });
      await Promise.race([loop, new Promise<void>((resolve) => setTimeout(resolve, 100))]);
    }
  });
});
