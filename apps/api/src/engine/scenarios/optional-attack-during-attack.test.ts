import type { DecisionRequest, DecisionResponse } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import "../../cards/index.js";
import { setupEngine, settleAcrossTimers } from "../testkit/harness.js";
import { observe } from "../testkit/observe.js";

describe("optional attack accepted while another attack resolves (Q2859)", () => {
  it("asks for no attacker and still offers the following clause", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "EX13-060", as: "alphamon", under: ["BT1-010"] },
          { card: "BT1-044", as: "metalGarurumon", under: [{ card: "BT20-010", as: "ryudamon" }] },
        ],
        deck: ["BT1-009", "BT1-009"],
        security: 2,
      },
      1: {
        battleArea: [{ card: "BT1-009", as: "victim", dp: 12_000 }],
        deck: ["BT1-009"],
        security: ["BT1-009", "BT1-009"],
      },
    });
    s.state.memory = 10;
    await s.ready();
    const alphamonId = s.perm("alphamon").permanentId;
    let lastDecisionId: string | undefined;
    async function decision(sourceCardId: string, kind: DecisionRequest["kind"]) {
      await settleAcrossTimers(
        () => !!s.state.pendingDecision && s.state.pendingDecision.decisionId !== lastDecisionId,
      );
      const req = s.decisions.find(
        ({ req: candidate }) => candidate.decisionId === s.state.pendingDecision?.decisionId,
      )!.req;
      expect(req).toMatchObject({ sourceCardId, kind });
      lastDecisionId = req.decisionId;
      return req;
    }
    function respond(req: DecisionRequest, response: DecisionResponse) {
      expect(s.engine.applyIntent(req.seat, { type: "respondDecision", decisionId: req.decisionId, response })).toEqual(
        { ok: true },
      );
    }

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("metalGarurumon").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    const attackPrompt = await decision("EX13-060", "optional");
    expect(attackPrompt.options).toMatchObject({
      promptKey: "attackAlreadyResolving",
      selectionContext: "attackSource",
    });
    expect(observe(s.engine).isAttacking()).toBe(true);
    respond(attackPrompt, { kind: "optional", accept: true });

    const thenPrompt = await decision("EX13-060", "optional");
    expect(thenPrompt.options?.effectTextPart).toBe(
      "Then, you may activate 1 of this Digimon's [When Digivolving] effects.",
    );
    expect(
      s.decisions.filter(({ req }) => req.kind === "chooseTargets" && req.options?.selectionContext === "attackSource"),
    ).toEqual([]);
    respond(thenPrompt, { kind: "optional", accept: false });

    await settleAcrossTimers(() => s.events.some(({ kind }) => kind === "attackEnded"));
    expect(s.perm("alphamon").isSuspended).toBe(false);
    expect(s.events.filter(({ kind }) => kind === "attackDeclared")).toHaveLength(1);
    expect(s.state.players[0]!.battleArea.some(({ permanentId }) => permanentId === alphamonId)).toBe(true);
  });
});
