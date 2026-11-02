import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { assertNoLoudGap, setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled } from "./BT18-069.js";
import "../BT13/BT13-077.js";
import "../BT19/BT19-062.js";

describe("BT18-069 Knightmon", () => {
  it("declares the optional once-per-turn forced attack at the opponent's end turn", () => {
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual).toEqual([]);
    expect(compiled.effects[1]).toMatchObject({
      trigger: "EndOfOpponentsTurn",
      optional: true,
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "Attack",
          mandatory: true,
          attackTargetScope: "any",
          target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
        },
      ],
    });
  });

  it("keeps Blocker and the inherited Knightmon DP effect", () => {
    expect(compiled.effects[0]).toMatchObject({ trigger: "Static", keywords: [{ keyword: "Blocker" }] });
    expect(compiled.effects[2]).toMatchObject({
      trigger: "AllTurns",
      isInherited: true,
      actions: [{ kind: "ModifyDP", amount: 2000, duration: "permanent" }],
    });
  });

  it("makes the chosen opponent Digimon attack at a natural opponent-turn end", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT18-069", as: "knightmon" }] },
        1: { battleArea: [{ card: "BT1-009", as: "attacker" }], deck: ["BT1-010"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    s.state.memory = 4;
    await s.ready();

    const turn = advance(s.engine).runTurn(1);
    await settle(() => s.events.some((event) => event.kind === "blockWindowOpened"));
    expect(s.engine.applyIntent(0, { type: "declineBlock" })).toEqual({ ok: true });
    await turn;

    expect(observe(s.engine).hasAttackedThisTurn(s.perm("attacker"))).toBe(true);
    assertNoLoudGap(s);
  });

  it("applies inherited +2000 DP only to Digimon with Knightmon text", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "BT8-062", dp: 5000, as: "host", under: ["BT18-069"] },
          { card: "BT8-062", dp: 5000, as: "knight" },
          { card: "BT1-078", dp: 5000, as: "other" },
        ],
      },
    });
    await s.ready();

    expect(s.perm("host").currentDP).toBe(7000);
    expect(s.perm("knight").currentDP).toBe(7000);
    expect(s.perm("other").currentDP).toBe(5000);
    assertNoLoudGap(s);
  });

  it("does not give a host its [Knightmon] text through the inherited effect (rule 4-23-2)", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-078", dp: 5000, as: "host", under: ["BT18-069"] }] },
    });
    await s.ready();

    expect(s.perm("host").currentDP).toBe(5000);
  });
});

describe("BT18-069 Knightmon — KB Q&A rulings", () => {
  type Engine = ReturnType<typeof setupEngine>;

  function attackDeclaredBy(s: Engine, permanentId: string): boolean {
    return s.events.some((event) => event.kind === "attackDeclared" && event.attackerPermanentId === permanentId);
  }

  async function acceptKnightmonAndChoose(s: Engine, permanentId: string): Promise<void> {
    await settle(() => s.decisions.some(({ req }) => req.kind === "optional" && req.sourceCardId === "BT18-069"));
    const optional = s.decisions.find(({ req }) => req.kind === "optional" && req.sourceCardId === "BT18-069")!;
    expect(optional.seat).toBe(0);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: optional.req.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.decisions.some(({ req }) => req.kind === "chooseTargets"));
    const pick = s.decisions.find(({ req }) => req.kind === "chooseTargets")!;
    expect(pick.seat).toBe(0);
    expect(pick.req.options?.candidateInstanceIds).toContain(permanentId);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: pick.req.decisionId,
        response: { kind: "chooseTargets", instanceIds: [permanentId] },
      }),
    ).toEqual({ ok: true });
  }

  it("does not have to choose an opponent's Digimon, and declining makes no Digimon attack (Q3005)", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT18-069", as: "knightmon", suspended: true }], security: ["BT1-009"] },
        1: {
          battleArea: [
            { card: "BT1-009", as: "first" },
            { card: "BT1-009", as: "second" },
          ],
        },
      },
      { autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    await s.ready();

    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(1);
    advance(s.engine).endMainPhaseIfOpen(1);
    await settle(() => s.decisions.some(({ req }) => req.kind === "optional" && req.sourceCardId === "BT18-069"));
    const optional = s.decisions.find(({ req }) => req.kind === "optional" && req.sourceCardId === "BT18-069")!;
    expect(optional.seat).toBe(0);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: optional.req.decisionId,
        response: { kind: "optional", accept: false },
      }),
    ).toEqual({ ok: true });
    await turn;

    expect(s.decisions.filter(({ seat, req }) => seat === 0 && req.kind === "chooseTargets")).toEqual([]);
    expect(s.events.some((event) => event.kind === "attackDeclared")).toBe(false);
    expect(s.state.players[1]!.battleArea.every((permanent) => !permanent.isSuspended)).toBe(true);
    expect(s.state.players[0]!.security).toHaveLength(1);
  });

  it("does not make a chosen opponent Digimon that can't attack declare an attack (Q3006)", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT18-069", as: "knightmon", suspended: true }], security: ["BT1-009"] },
      1: {
        battleArea: [{ card: "BT1-009", as: "veteran" }],
        hand: [{ card: "BT1-009", as: "newcomer" }],
      },
    });
    s.state.turnSeat = 1;
    s.state.memory = 10;
    await s.ready();
    const newcomerInstanceId = s.inst("newcomer").instanceId;
    const newcomerPermanent = () =>
      s.state.players[1]!.battleArea.find((permanent) => permanent.topCard?.instanceId === newcomerInstanceId);

    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(1);
    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: newcomerInstanceId })).toEqual({ ok: true });
    await settle(() => newcomerPermanent() !== undefined);
    const newcomerPermanentId = newcomerPermanent()!.permanentId;
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: newcomerPermanentId,
        target: { kind: "player" },
      }),
    ).not.toEqual({ ok: true });
    advance(s.engine).endMainPhaseIfOpen(1);
    await acceptKnightmonAndChoose(s, newcomerPermanentId);
    await turn;

    expect(s.events.some((event) => event.kind === "attackDeclared")).toBe(false);
    expect(newcomerPermanent()?.isSuspended).toBe(false);
    expect(s.perm("veteran").isSuspended).toBe(false);
    expect(s.state.players[0]!.security).toHaveLength(1);
  });

  it("does not start a new attack with the chosen Digimon while an end-of-turn attack is in progress (Q3007)", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT18-069", as: "knightmon" }], security: ["BT1-009"] },
      1: {
        battleArea: [
          { card: "BT19-062", as: "cyberdramon" },
          { card: "BT1-009", as: "chosen" },
        ],
      },
    });
    s.state.turnSeat = 1;
    await s.ready();
    const cyberdramonPermanentId = s.perm("cyberdramon").permanentId;
    const chosenPermanentId = s.perm("chosen").permanentId;

    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(1);
    advance(s.engine).endMainPhaseIfOpen(1);
    await settle(() => s.decisions.some(({ req }) => req.kind === "selectCards"));
    const cyberdramonTarget = s.decisions.find(({ req }) => req.kind === "selectCards")!;
    expect(
      s.engine.applyIntent(1, {
        type: "respondDecision",
        decisionId: cyberdramonTarget.req.decisionId,
        response: { kind: "selectCards", instanceIds: ["player"] },
      }),
    ).toEqual({ ok: true });
    await settle(() => attackDeclaredBy(s, cyberdramonPermanentId));

    await settle(() => s.decisions.some(({ req }) => req.kind === "optional" && req.sourceCardId === "BT18-069"));
    const optional = s.decisions.find(({ req }) => req.kind === "optional" && req.sourceCardId === "BT18-069")!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: optional.req.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });

    await settle(() => s.events.some((event) => event.kind === "blockWindowOpened"));
    expect(s.decisions.some(({ req }) => req.kind === "chooseTargets")).toBe(false);
    expect(
      s.engine.applyIntent(0, { type: "declareBlock", blockerPermanentId: s.perm("knightmon").permanentId }),
    ).toEqual({ ok: true });
    await turn;

    expect(attackDeclaredBy(s, chosenPermanentId)).toBe(false);
    expect(s.perm("chosen").isSuspended).toBe(false);
    expect(s.events.filter((event) => event.kind === "attackDeclared")).toHaveLength(1);
    expect(s.state.players[0]!.security).toHaveLength(1);
  });

  it("can choose an opponent Digimon unaffected by effects, and that Digimon must attack (Q3008)", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT18-069", as: "knightmon", suspended: true }], security: ["BT1-009"] },
      1: {
        battleArea: [
          { card: "BT2-060", as: "establishedHost" },
          { card: "BT1-009", as: "bystander" },
        ],
        hand: [{ card: "BT13-077", as: "immuneAttacker" }],
        security: ["BT1-009"],
      },
    });
    s.state.turnSeat = 1;
    s.state.memory = 10;
    await s.ready();

    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(1);
    expect(
      s.engine.applyIntent(1, {
        type: "digivolve",
        permanentId: s.perm("establishedHost").permanentId,
        instanceId: s.inst("immuneAttacker").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() =>
      s.state.players[1]!.battleArea.some((p) => p.topCard?.instanceId === s.inst("immuneAttacker").instanceId),
    );
    const immunePermanentId = s.perm("immuneAttacker").permanentId;
    expect(observe(s.engine).isRestrictedByEffect(s.perm("immuneAttacker"), "beAffected", "Digimon")).toBe(true);
    advance(s.engine).endMainPhaseIfOpen(1);
    await acceptKnightmonAndChoose(s, immunePermanentId);
    await settle(() => s.decisions.some(({ seat, req }) => seat === 1 && req.kind === "selectCards"));
    const attackTarget = s.decisions.find(({ seat, req }) => seat === 1 && req.kind === "selectCards")!;
    expect(
      s.engine.applyIntent(1, {
        type: "respondDecision",
        decisionId: attackTarget.req.decisionId,
        response: { kind: "selectCards", instanceIds: ["player"] },
      }),
    ).toEqual({ ok: true });
    await turn;

    expect(attackDeclaredBy(s, immunePermanentId)).toBe(true);
    expect(attackDeclaredBy(s, s.perm("bystander").permanentId)).toBe(false);
  });
});
