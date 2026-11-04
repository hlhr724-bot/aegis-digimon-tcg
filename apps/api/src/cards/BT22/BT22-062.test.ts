import { EffectDuration } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled } from "./BT22-062.js";
import "../BT13/BT13-077.js";
import { X_ANTIBODY_NAME_PROBES, xAntibodyNameGateVerdicts } from "../../engine/testkit/xAntibodyNameGate.js";

describe("BT22-062 MetalTyrannomon (X Antibody)", () => {
  it("requires a non-X Antibody Tyrannomon and gates the digivolving restriction on the stack", () => {
    expect(compiled.digivolutionRequirement).toEqual([
      { level: 4, colors: ["Black"], cost: 4, isAlternate: false },
      { level: 4, colors: ["Green"], cost: 4, isAlternate: false },
      { level: 5, names: ["Tyrannomon"], excludeTraits: ["X Antibody"], cost: 1, isAlternate: true },
    ]);
    expect(compiled.digivolutionRequirement).toContainEqual({
      level: 5,
      names: ["Tyrannomon"],
      excludeTraits: ["X Antibody"],
      cost: 1,
      isAlternate: true,
    });

    const whenDigivolving = compiled.effects.find((entry) => entry.trigger === "WhenDigivolving");
    expect(whenDigivolving?.actions[0]).toMatchObject({
      kind: "ModifyDP",
      amount: 4000,
      duration: "untilOpponentTurnEnd",
      target: { filter: { isSelfRef: true }, isSelf: true },
    });
    expect(whenDigivolving?.actions[1]).toMatchObject({
      kind: "Restrict",
      restriction: "digivolve",
      duration: "untilOpponentTurnEnd",
      target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
      condition: {
        kind: "selfDigivolutionStackHasTrait",
        filter: {
          nameOrTrait: [
            { tokens: ["MetalTyrannomon"], match: "nameExact" },
            { tokens: ["X Antibody"], match: "nameExact" },
          ],
        },
      },
    });
  });

  it("lets its controller optionally choose one of the opponent's Digimon to attack", () => {
    const inherited = compiled.effects.find((entry) => entry.isInherited);
    expect(inherited).toMatchObject({ trigger: "EndOfOpponentsTurn", frequency: "OncePerTurn" });
    expect(inherited?.actions[0]).not.toHaveProperty("target.chooser");
    expect(inherited?.actions[0]).toMatchObject({
      kind: "Attack",
      optional: true,
      drainTimingWindowDuringAttack: true,
      target: {
        filter: { controller: "opponent", kind: ["Digimon"] },
        count: 1,
      },
    });
  });

  it("publicly makes the opponent's chosen unsuspended Digimon attack at their turn end", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT22-065", as: "host", under: ["BT22-062"] }],
          security: ["BT1-010", "BT1-010", "BT1-010"],
        },
        1: {
          battleArea: [
            { card: "BT1-009", as: "chosen", dp: 20000 },
            { card: "BT1-010", as: "other", dp: 20000 },
          ],
        },
      },
      { autoSelectCards: true, autoAcceptOptional: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("chosen").topCard!.instanceId);
    s.state.turnSeat = 1;
    await s.ready();
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(1);
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("other").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking());
    advance(s.engine).endMainPhaseIfOpen(1);
    await turn;

    expect(s.perm("chosen").isSuspended).toBe(true);
    expect(s.perm("other").isSuspended).toBe(true);
    expect(s.state.players[0]!.security).toHaveLength(1);
    expect(s.state.players[0]!.trash.filter((card) => card.cardId === "BT1-010")).toHaveLength(2);
    expect(observe(s.engine).isAttacking()).toBe(false);
  });

  it("offers the optional attack, then allows refusal while leaving legal and suspended candidates unchanged", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT22-065", as: "host", under: ["BT22-062"] }] },
        1: { battleArea: [{ card: "BT1-009", as: "legal" }] },
      },
      { autoSelectCards: true, autoDeclineOptional: true },
    );
    s.state.turnSeat = 1;
    await s.ready();
    await advance(s.engine).runTurn(1);

    expect(s.decisions.some(({ req }) => req.kind === "optional" && req.sourceCardId === "BT22-062")).toBe(true);
    expect(s.perm("legal").isSuspended).toBe(false);
    expect(observe(s.engine).isAttacking()).toBe(false);
  });

  it("does not create an attack choice when every opponent Digimon is already suspended", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT22-065", as: "host", under: ["BT22-062"] }] },
        1: { battleArea: [{ card: "BT1-009", as: "suspended" }] },
      },
      { autoSelectCards: true, autoAcceptOptional: true },
    );
    s.state.turnSeat = 1;
    await s.ready();
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(1);
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("suspended").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking());
    advance(s.engine).endMainPhaseIfOpen(1);
    await turn;

    expect(s.decisions.some(({ req }) => req.kind === "optional" && req.sourceCardId === "BT22-062")).toBe(false);
    expect(s.perm("suspended").isSuspended).toBe(true);
    expect(observe(s.engine).isAttacking()).toBe(false);
  });

  it("pays 1 from MetalTyrannomon, gains 4000 DP, and locks an opponent's evolution", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-024", as: "metaltyrannomon" }],
          hand: [{ card: "BT22-062", as: "x-antibody" }],
        },
        1: { battleArea: [{ card: "BT22-071", as: "opponent" }] },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 1;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("metaltyrannomon").permanentId,
        instanceId: s.inst("x-antibody").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => observe(s.engine).isRestricted(s.perm("opponent"), "digivolve"));

    expect(s.state.memory).toBe(0);
    expect(s.perm("metaltyrannomon").currentDP).toBe(12000);
    expect(observe(s.engine).isRestricted(s.perm("opponent"), "digivolve")).toBe(true);
  });
});

describe("BT22-062 [X Antibody] reference", () => {
  it("matches the X Antibody card name and its Rule aliases, not X Antibody-trait Digimon", () => {
    expect(xAntibodyNameGateVerdicts("BT22-062")).toEqual(X_ANTIBODY_NAME_PROBES);
  });
});

describe("BT22-062 MetalTyrannomon (X Antibody) — KB Q&A rulings", () => {
  const SECURITY = ["BT1-010", "BT1-010", "BT1-010"];

  function attackersDeclared(s: ReturnType<typeof setupEngine>): string[] {
    return s.events.flatMap((event) => (event.kind === "attackDeclared" ? [event.attackerPermanentId] : []));
  }

  async function runOpponentTurnToEnd(s: ReturnType<typeof setupEngine>): Promise<void> {
    s.state.turnSeat = 1;
    await s.ready();
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(1);
    advance(s.engine).endMainPhaseIfOpen(1);
    await turn;
  }

  it("lets MetalTyrannomon's controller decline to choose any opponent's Digimon (Q4916)", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT22-065", as: "host", under: ["BT22-062"] }], security: SECURITY },
        1: {
          battleArea: [
            { card: "BT1-009", as: "first" },
            { card: "BT1-010", as: "second" },
          ],
        },
      },
      { autoSelectCards: true, autoDeclineOptional: true },
    );

    await runOpponentTurnToEnd(s);

    const offer = s.decisions.find(({ req }) => req.kind === "optional" && req.sourceCardId === "BT22-062");
    expect(offer?.seat).toBe(0);
    expect(attackersDeclared(s)).toEqual([]);
    expect(s.perm("first").isSuspended).toBe(false);
    expect(s.perm("second").isSuspended).toBe(false);
    expect(s.state.players[0]!.security).toHaveLength(3);
  });

  it("requires the opponent to choose an attack target after the source controller selects their Digimon", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT22-065", as: "host", under: ["BT22-062"] }], security: SECURITY },
      1: {
        battleArea: [
          { card: "BT1-009", as: "chosen", dp: 20000 },
          { card: "BT1-010", as: "other", dp: 20000 },
        ],
      },
    });
    s.state.turnSeat = 1;
    await s.ready();
    const turn = s.engine.runOneTurn();
    try {
      await advance(s.engine).waitForMainPhase(1);
      advance(s.engine).endMainPhaseIfOpen(1);
      await settle(() => s.state.pendingDecision?.kind === "optional");
      const activation = s.decisions.at(-1)!;
      expect(activation.seat).toBe(0);
      expect(activation.req.sourceCardId).toBe("BT22-062");
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: activation.req.decisionId,
          response: { kind: "optional", accept: true },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision?.kind === "chooseTargets");
      const attackerChoice = s.decisions.at(-1)!;
      expect(attackerChoice.seat).toBe(0);
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: attackerChoice.req.decisionId,
          response: { kind: "chooseTargets", instanceIds: [s.perm("chosen").permanentId] },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision?.kind === "selectCards");
      const targetChoice = s.decisions.at(-1)!;
      expect(targetChoice.seat).toBe(1);
      expect(targetChoice.req.options?.selectionContext).toBe("attackTarget");
      expect(targetChoice.req.options?.min).toBe(1);
      expect(
        s.engine.applyIntent(1, {
          type: "respondDecision",
          decisionId: targetChoice.req.decisionId,
          response: { kind: "selectCards", instanceIds: [] },
        }).ok,
      ).toBe(false);
      expect(s.state.pendingDecision?.decisionId).toBe(targetChoice.req.decisionId);
      expect(
        s.engine.applyIntent(1, {
          type: "respondDecision",
          decisionId: targetChoice.req.decisionId,
          response: { kind: "selectCards", instanceIds: ["player"] },
        }),
      ).toEqual({ ok: true });
      await settle(() => attackersDeclared(s).length === 1);
      await advance(s.engine).finishAttack();
      await turn;
      expect(attackersDeclared(s)).toEqual([s.perm("chosen").permanentId]);
      expect(s.perm("chosen").isSuspended).toBe(true);
      expect(s.perm("other").isSuspended).toBe(false);
      expect(s.state.players[0]!.security).toHaveLength(2);
      expect(s.state.pendingDecision).toBeUndefined();
    } finally {
      s.engine.applyIntent(1, { type: "surrender" });
      await turn;
    }
  });

  it("does not make a chosen Digimon that can't attack attack (Q4917)", async () => {
    async function runWithChosenDigimon(canAttack: boolean) {
      const s = setupEngine(
        {
          0: { battleArea: [{ card: "BT22-065", as: "host", under: ["BT22-062"] }], security: SECURITY },
          1: { battleArea: [{ card: "BT1-009", as: "chosen", dp: 20000 }] },
        },
        { autoSelectCards: true, autoAcceptOptional: true },
      );
      if (!canAttack) {
        await advance(s.engine).verb.restrict(s.perm("chosen").permanentId, "attack", EffectDuration.Permanent);
      }
      await runOpponentTurnToEnd(s);
      return s;
    }

    const restricted = await runWithChosenDigimon(false);
    const offer = restricted.decisions.find(({ req }) => req.kind === "optional" && req.sourceCardId === "BT22-062");
    expect(offer?.seat).toBe(0);
    expect(attackersDeclared(restricted)).toEqual([]);
    expect(restricted.perm("chosen").isSuspended).toBe(false);
    expect(restricted.state.players[0]!.security).toHaveLength(3);

    const unrestricted = await runWithChosenDigimon(true);
    expect(attackersDeclared(unrestricted)).toEqual([unrestricted.perm("chosen").permanentId]);
    expect(unrestricted.perm("chosen").isSuspended).toBe(true);
    expect(unrestricted.state.players[0]!.security).toHaveLength(2);
  });

  it("does not declare a second attack while another effect's end-of-turn attack is in progress (Q4918)", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT13-077", as: "craniamon", suspended: true },
            { card: "BT22-065", as: "host", under: ["BT22-062"] },
          ],
          security: SECURITY,
        },
        1: {
          battleArea: [
            { card: "BT1-009", as: "craniamonPick", dp: 20000 },
            { card: "BT1-010", as: "metalTyrannomonPick", dp: 20000 },
          ],
        },
      },
      {
        autoSelectCards: true,
        autoAcceptOptional: true,
        preferInstanceIds: preferred,
        preferTriggerKeys: ["BT13-077"],
      },
    );
    preferred.push(s.perm("craniamonPick").topCard!.instanceId);

    await runOpponentTurnToEnd(s);

    expect(s.decisions.some(({ seat, req }) => seat === 0 && req.sourceCardId === "BT22-062")).toBe(true);
    expect(attackersDeclared(s)).toEqual([s.perm("craniamonPick").permanentId]);
    expect(s.perm("craniamonPick").isSuspended).toBe(true);
    expect(s.perm("metalTyrannomonPick").isSuspended).toBe(false);
    expect(s.state.players[0]!.security).toHaveLength(2);
  });

  it("lets its controller choose a Digimon unaffected by effects, and that Digimon attacks (Q4919)", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT22-065", as: "host", under: ["BT22-062"] }], security: SECURITY },
        1: {
          battleArea: [
            { card: "BT1-009", as: "immune", dp: 20000 },
            { card: "BT1-010", as: "ordinary", dp: 20000 },
          ],
        },
      },
      { autoSelectCards: true, autoAcceptOptional: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("immune").topCard!.instanceId);
    await advance(s.engine).verb.restrict(s.perm("immune").permanentId, "beAffected", EffectDuration.Permanent);

    await runOpponentTurnToEnd(s);

    const choice = s.decisions.find(({ req }) => req.kind === "chooseTargets" && req.sourceCardId === "BT22-062");
    expect(choice?.seat).toBe(0);
    expect(attackersDeclared(s)).toEqual([s.perm("immune").permanentId]);
    expect(s.perm("ordinary").isSuspended).toBe(false);
    expect(s.state.players[0]!.security).toHaveLength(2);
  });
});
