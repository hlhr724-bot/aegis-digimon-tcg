import { EffectTiming } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled } from "./BT13-077.js";
import "./BT13-011.js";
import "./BT13-058.js";
import "../BT19/BT19-062.js";

describe("BT13-077 Craniamon", () => {
  it("grants Blocker and opponent-Digimon effect immunity through the opponent's turn", () => {
    expect(compiled.effects?.filter((entry) => entry.trigger === "Static")).toEqual([
      { trigger: "Static", actions: [], keywords: [{ keyword: "Blocker", raw: "＜Blocker＞" }] },
    ]);
    for (const trigger of ["OnPlay", "WhenDigivolving"]) {
      expect(compiled.effects?.find((entry) => entry.trigger === trigger)?.keywords).toBeUndefined();
      expect(compiled.effects?.find((entry) => entry.trigger === trigger)).toMatchObject({
        actions: [
          {
            kind: "GrantStatic",
            target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
            grant: "immuneToOpponentDigimonEffects",
            duration: "untilOpponentTurnEnd",
          },
        ],
      });
    }
  });

  it("optionally makes an opponent Digimon attack the player at end of turn", () => {
    expect(compiled.effects?.find((entry) => entry.trigger === "EndOfOpponentsTurn")).toMatchObject({
      actions: [
        {
          kind: "Attack",
          target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
          optional: true,
          attackTargetScope: "any",
        },
      ],
    });
  });

  it("installs opponent Digimon-effect immunity when played", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT13-077", as: "craniamon", dp: 3000 }] },
        1: { hand: [{ card: "BT13-011", as: "opponentEffect" }] },
      },
      { autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).fireForPermanent(EffectTiming.OnPlay, s.perm("craniamon"));
    s.state.turnSeat = 1;
    s.state.memory = 10;
    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("opponentEffect").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.battleArea.length === 1);
    expect(s.state.players[0]!.battleArea.some((p) => p.permanentId === s.perm("craniamon").permanentId)).toBe(true);
  });

  it("makes a chosen opponent Digimon attack the player at the opponent's turn end", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT13-077", as: "craniamon", suspended: true }],
          security: [{ card: "BT1-009", as: "security" }],
        },
        1: { battleArea: [{ card: "BT1-009", as: "attacker" }] },
      },
      { autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    await s.ready();
    const attackerPermanentId = s.perm("attacker").permanentId;
    const attackerInstanceId = s.inst("attacker").instanceId;
    const securityInstanceId = s.inst("security").instanceId;

    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(1);
    advance(s.engine).endMainPhaseIfOpen(1);
    await settle(() => s.decisions.some(({ req }) => req.kind === "optional"));
    const choice = s.decisions.find(({ req }) => req.kind === "optional")!;
    expect(choice.seat).toBe(0);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: choice.req.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await turn;

    expect(
      s.events.some((event) => event.kind === "attackDeclared" && event.attackerPermanentId === attackerPermanentId),
    ).toBe(true);
    expect(s.state.players[1]!.trash.some((card) => card.instanceId === attackerInstanceId)).toBe(true);
    expect(s.state.players[0]!.trash.some((card) => card.instanceId === securityInstanceId)).toBe(true);
  });

  it("lets Craniamon's controller decline choosing an attacker", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT13-077", as: "craniamon", suspended: true }], security: ["BT1-009"] },
        1: { battleArea: [{ card: "BT1-009", as: "attacker" }] },
      },
      { autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    await s.ready();
    const attackerPermanentId = s.perm("attacker").permanentId;
    const attackerInstanceId = s.inst("attacker").instanceId;
    const securityInstanceId = s.state.players[0]!.security[0]!.instanceId;

    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(1);
    advance(s.engine).endMainPhaseIfOpen(1);
    await settle(() => s.decisions.some(({ req }) => req.kind === "optional"));
    const choice = s.decisions.find(({ req }) => req.kind === "optional")!;
    expect(choice.seat).toBe(0);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: choice.req.decisionId,
        response: { kind: "optional", accept: false },
      }),
    ).toEqual({ ok: true });
    await turn;

    expect(
      s.events.some((event) => event.kind === "attackDeclared" && event.attackerPermanentId === attackerPermanentId),
    ).toBe(false);
    expect(s.state.players[1]!.battleArea.some((p) => p.topCard?.instanceId === attackerInstanceId)).toBe(true);
    expect(s.state.players[0]!.security.some((card) => card.instanceId === securityInstanceId)).toBe(true);
  });

  it("allows choosing an opposing Digimon immune to effects (Q2320)", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT13-077", as: "craniamon", suspended: true }], security: ["BT1-009"] },
        1: {
          battleArea: [{ card: "BT2-060", as: "establishedHost" }],
          hand: [{ card: "BT13-077", as: "immuneAttacker" }],
          security: ["BT1-009"],
        },
      },
      { autoSelectCards: true },
    );
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
    expect(observe(s.engine).isRestrictedByEffect(s.perm("immuneAttacker"), "beAffected", "Digimon")).toBe(true);
    advance(s.engine).endMainPhaseIfOpen(1);
    await settle(() => s.decisions.some(({ req }) => req.kind === "optional"));
    const choice = s.decisions.find(({ req }) => req.kind === "optional")!;
    expect(choice.seat).toBe(0);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: choice.req.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await turn;

    expect(
      s.events.some(
        (event) =>
          event.kind === "attackDeclared" && event.attackerPermanentId === s.perm("immuneAttacker").permanentId,
      ),
    ).toBe(true);
  });

  it("keeps When Digivolving immunity against a real opposing Digimon effect", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "EX8-052", as: "base" }], hand: [{ card: "BT13-077", as: "craniamon" }] },
        1: { battleArea: [{ card: "BT13-056", as: "leopard" }], hand: [{ card: "BT13-058", as: "mode" }] },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();
    const baseInstanceId = s.inst("base").instanceId;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("craniamon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard?.cardId === "BT13-077");
    await settle();
    expect(s.state.memory).toBe(5);
    expect(s.perm("base").stack.some((card) => card.instanceId === baseInstanceId)).toBe(true);
    s.state.turnSeat = 1;
    s.state.memory = 10;

    expect(
      s.engine.applyIntent(1, {
        type: "digivolve",
        permanentId: s.perm("leopard").permanentId,
        instanceId: s.inst("mode").instanceId,
        alternateRequirementIndex: 0,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("leopard").topCard?.cardId === "BT13-058");

    expect(s.perm("base").isSuspended).toBe(false);
  });

  it("uses Blocker in a real opponent attack block window", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT13-077", as: "blocker" }], security: ["BT1-009"] },
      1: { battleArea: [{ card: "BT1-009", as: "attacker" }] },
    });
    s.state.turnSeat = 1;
    await s.ready();

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "blockWindowOpened"));
    expect(s.events.find((event) => event.kind === "blockWindowOpened")).toMatchObject({
      eligibleBlockerIds: [s.perm("blocker").permanentId],
    });

    expect(
      s.engine.applyIntent(0, {
        type: "declareBlock",
        blockerPermanentId: s.perm("blocker").permanentId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "blocked"));
    expect(s.perm("blocker").isSuspended).toBe(true);
  });
});

describe("BT13-077 Craniamon — KB Q&A rulings", () => {
  type Engine = ReturnType<typeof setupEngine>;

  async function endOpponentTurnAnswering(s: Engine, accept: boolean): Promise<void> {
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(1);
    advance(s.engine).endMainPhaseIfOpen(1);
    await settle(() => s.decisions.some(({ req }) => req.kind === "optional"));
    const choice = s.decisions.find(({ req }) => req.kind === "optional")!;
    expect(choice.seat).toBe(0);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: choice.req.decisionId,
        response: { kind: "optional", accept },
      }),
    ).toEqual({ ok: true });
    await turn;
  }

  function attackDeclaredBy(s: Engine, permanentId: string): boolean {
    return s.events.some((event) => event.kind === "attackDeclared" && event.attackerPermanentId === permanentId);
  }

  it("lets an opponent's Blocker block Craniamon while it is unaffected by opponent Digimon effects (Q2315)", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT13-077", as: "craniamon" }] },
      1: { battleArea: [{ card: "EX6-012", as: "blocker" }], security: ["BT1-009"] },
    });
    await s.ready();
    await advance(s.engine).fireForPermanent(EffectTiming.OnPlay, s.perm("craniamon"));
    expect(observe(s.engine).isRestrictedByEffect(s.perm("craniamon"), "beAffected", "Digimon")).toBe(true);
    const blockerInstanceId = s.inst("blocker").instanceId;

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("craniamon").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "blockWindowOpened"));
    expect(s.events.find((event) => event.kind === "blockWindowOpened")).toMatchObject({
      eligibleBlockerIds: [s.perm("blocker").permanentId],
    });

    expect(
      s.engine.applyIntent(1, { type: "declareBlock", blockerPermanentId: s.perm("blocker").permanentId }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "blocked"));
    await settle();
    expect(s.state.players[1]!.security).toHaveLength(1);
    expect(s.state.players[1]!.trash.some((card) => card.instanceId === blockerInstanceId)).toBe(true);
  });

  it("does not have to choose, and no attack happens when the choice is declined (Q2316)", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT13-077", as: "craniamon", suspended: true }], security: ["BT1-009"] },
        1: { battleArea: [{ card: "BT1-009", as: "attacker" }] },
      },
      { autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    await s.ready();
    const attackerPermanentId = s.perm("attacker").permanentId;

    await endOpponentTurnAnswering(s, false);

    expect(attackDeclaredBy(s, attackerPermanentId)).toBe(false);
    expect(s.perm("attacker").isSuspended).toBe(false);
    expect(s.state.players[0]!.security).toHaveLength(1);
  });

  it("does not require choosing any opponent Digimon (Q2317)", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT13-077", as: "craniamon", suspended: true }], security: ["BT1-009"] },
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

    await endOpponentTurnAnswering(s, false);

    expect(s.decisions.filter(({ seat, req }) => seat === 0 && req.kind !== "optional")).toEqual([]);
    expect(s.events.some((event) => event.kind === "attackDeclared")).toBe(false);
    expect(s.state.players[1]!.battleArea.every((permanent) => !permanent.isSuspended)).toBe(true);
    expect(s.state.players[0]!.security).toHaveLength(1);
  });

  it("does not make a chosen opponent Digimon that can't attack declare an attack (Q2318)", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT13-077", as: "craniamon", suspended: true }], security: ["BT1-009"] },
      1: {
        battleArea: [{ card: "BT1-009", as: "veteran" }],
        hand: [{ card: "BT1-009", as: "newcomer" }],
      },
    });
    s.state.turnSeat = 1;
    s.state.memory = 10;
    await s.ready();
    const newcomerInstanceId = s.inst("newcomer").instanceId;
    const veteranPermanentId = s.perm("veteran").permanentId;
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
    await settle(() => s.decisions.some(({ req }) => req.kind === "optional"));
    const choice = s.decisions.find(({ req }) => req.kind === "optional")!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: choice.req.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.decisions.some(({ req }) => req.kind === "chooseTargets"));
    const pick = s.decisions.find(({ req }) => req.kind === "chooseTargets")!;
    expect(pick.seat).toBe(0);
    expect(pick.req.options?.candidateInstanceIds).toEqual(
      expect.arrayContaining([newcomerPermanentId, veteranPermanentId]),
    );
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: pick.req.decisionId,
        response: { kind: "chooseTargets", instanceIds: [newcomerPermanentId] },
      }),
    ).toEqual({ ok: true });
    await turn;

    expect(s.events.some((event) => event.kind === "attackDeclared")).toBe(false);
    expect(newcomerPermanent()?.isSuspended).toBe(false);
    expect(s.perm("veteran").isSuspended).toBe(false);
    expect(s.state.players[0]!.security).toHaveLength(1);
  });

  it("does not start a new attack when chosen while an opponent's end-of-turn attack is in progress (Q2319)", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT13-077", as: "craniamon" }], security: ["BT1-009"] },
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

    await settle(() => s.decisions.some(({ req }) => req.kind === "optional"));
    const optional = s.decisions.find(({ req }) => req.kind === "optional")!;
    expect(optional.req.sourceCardId).toBe("BT13-077");
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
      s.engine.applyIntent(0, { type: "declareBlock", blockerPermanentId: s.perm("craniamon").permanentId }),
    ).toEqual({ ok: true });
    await turn;

    expect(attackDeclaredBy(s, chosenPermanentId)).toBe(false);
    expect(s.perm("chosen").isSuspended).toBe(false);
    expect(s.events.filter((event) => event.kind === "attackDeclared")).toHaveLength(1);
    expect(s.state.players[0]!.security).toHaveLength(1);
  });
});
