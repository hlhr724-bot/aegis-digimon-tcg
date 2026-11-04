import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { universalNameAliasesFor } from "../../engine/effects/interpreter/compiledCards.js";
import { compiled } from "./BT11-054.js";
import "./BT11-016.js";
import "../EX2/EX2-058.js";
import "../EX2/EX2-069.js";

describe("BT11-054 Panjyamon", () => {
  it("maps the Leomon rule, dual-color Tamer play, and inherited Rush clauses", () => {
    expect(getCardDefinition("BT11-054")).toMatchObject({
      cardId: "BT11-054",
      colors: ["Green"],
      level: 5,
      playCost: 7,
      dp: 7000,
      types: ["Beastkin"],
    });
    expect(compiled.effects).toHaveLength(3);
    expect(compiled.effects[0]).toMatchObject({ trigger: "Rule" });
    expect(compiled.effects[1]).toMatchObject({ trigger: "WhenDigivolving", actions: [{ kind: "PlayWithoutCost" }] });
    expect(compiled.effects[2]).toMatchObject({ trigger: "YourTurn", frequency: "OncePerTurn", isInherited: true });
  });

  it("is also treated as having Leomon in its name", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: "BT11-054", as: "panjyamon" }] } });

    await advance(s.engine).recompute();

    expect(observe(s.engine).grantedNames(s.perm("panjyamon"))).toContain("leomon");
    expect(observe(s.engine).effectiveNames(s.perm("panjyamon"))).toEqual(["panjyamon"]);
  });

  it("exposes the alias to the universal loose-card name resolver", () => {
    expect(universalNameAliasesFor("BT11-054")).toContain("Leomon");
  });

  it("plays a green or blue Tamer costing 4 or less when digivolving", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT11-050", as: "base" }],
          hand: [
            { card: "BT11-054", as: "panjyamon" },
            { card: "BT1-086", as: "tamer" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("panjyamon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() =>
      s.state.players[0]!.battleArea.some(({ topCard }) => topCard?.instanceId === s.inst("tamer").instanceId),
    );

    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).not.toContain(s.inst("tamer").instanceId);
  });

  it("grants Rush to a selected friendly Digimon once per turn, then resets", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT1-080", as: "host", under: ["BT11-054"] },
            { card: "BT1-013", as: "spare" },
            { card: "BT11-016", as: "phoenix1" },
            { card: "BT11-016", as: "phoenix2" },
            { card: "BT11-016", as: "phoenix3" },
          ],
          hand: [
            { card: "BT1-012", as: "biyomon1" },
            { card: "BT1-012", as: "biyomon2" },
            { card: "BT1-012", as: "biyomon3" },
          ],
          deck: Array.from({ length: 8 }, () => "BT1-013"),
          security: Array.from({ length: 4 }, () => "BT1-013"),
        },
        1: {
          battleArea: [{ card: "BT1-080", as: "titan", suspended: true }],
          deck: Array.from({ length: 8 }, () => "BT1-013"),
          security: Array.from({ length: 4 }, () => "BT1-013"),
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(
      s.perm("host").topCard.instanceId,
      s.inst("biyomon1").instanceId,
      s.inst("biyomon2").instanceId,
      s.inst("biyomon3").instanceId,
    );
    s.state.memory = 3;
    await s.ready();
    const titanId = s.perm("titan").permanentId;
    const phoenixIds = [s.perm("phoenix1").permanentId, s.perm("phoenix2").permanentId, s.perm("phoenix3").permanentId];

    const firstTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    for (const [index, phoenixId] of phoenixIds.slice(0, 2).entries()) {
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: phoenixId,
          target: { kind: "permanent", permanentId: titanId },
        }),
      ).toEqual({ ok: true });
      await settle(() => !s.state.players[0]!.battleArea.some(({ permanentId }) => permanentId === phoenixId));
      await settle(
        () =>
          !observe(s.engine).isAttacking() &&
          s.state.players[0]!.battleArea.some(({ topCard }) => topCard?.cardId === "BT1-012"),
      );
      const biyomonAlias = index === 0 ? "host" : "biyomon2";
      expect(observe(s.engine).hasKeyword(s.perm(biyomonAlias), "Rush")).toBe(index === 0);
      expect(s.state.memory).toBe(3);
    }
    advance(s.engine).endMainPhaseIfOpen(0);
    await firstTurn;

    s.state.turnSeat = 1;
    s.state.memory = 3;
    const opponentTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(1);
    expect(
      s.engine.applyIntent(1, { type: "attack", attackerPermanentId: titanId, target: { kind: "player" } }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking());
    advance(s.engine).endMainPhaseIfOpen(1);
    await opponentTurn;

    s.state.turnSeat = 0;
    s.state.memory = 3;
    preferred.splice(0, preferred.length, s.inst("biyomon3").instanceId);
    const resetTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: phoenixIds[2]!,
        target: { kind: "permanent", permanentId: titanId },
      }),
    ).toEqual({ ok: true });
    await settle(() => !s.state.players[0]!.battleArea.some(({ permanentId }) => permanentId === phoenixIds[2]));
    await settle(
      () =>
        !observe(s.engine).isAttacking() &&
        s.state.players[0]!.battleArea.some(({ topCard }) => topCard?.cardId === "BT1-012"),
    );
    expect(observe(s.engine).hasKeyword(s.perm("host"), "Rush")).toBe(false);
    expect(observe(s.engine).hasKeyword(s.perm("biyomon3"), "Rush")).toBe(true);
    expect(s.state.memory).toBe(3);
    advance(s.engine).endMainPhaseIfOpen(0);
    await resetTurn;
  });
});

describe("BT11-054 Panjyamon — KB Q&A rulings", () => {
  it("counts as a card with [Leomon] in its name but not as a card named [Leomon] (Q2087)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT11-054", as: "panjyamon", suspended: true }],
          hand: [
            { card: "EX2-058", as: "jeri" },
            { card: "BT11-054", as: "panjyamonInHand" },
            { card: "EX1-027", as: "leomon" },
            { card: "EX2-069", as: "fistOfTheBeastKing" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("jeri").instanceId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.length === 3 && s.state.pendingDecision === undefined);
    expect(s.decisions.map(({ req }) => req.kind)).toEqual(["optional", "selectCards"]);
    expect(s.decisions[1]!.req.options?.candidateInstanceIds).toEqual([s.inst("leomon").instanceId]);
    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard?.instanceId)).toContain(
      s.inst("leomon").instanceId,
    );
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toContain(
      s.inst("panjyamonInHand").instanceId,
    );

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("fistOfTheBeastKing").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => !s.perm("panjyamon").isSuspended && s.state.pendingDecision === undefined);
    expect(s.perm("panjyamon").isSuspended).toBe(false);
    expect(s.state.memory).toBe(4);
  });
});
