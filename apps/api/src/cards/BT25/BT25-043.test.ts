import { describe, expect, it } from "vitest";
import { observe } from "#api/engine/testkit/observe";
import { compiled as BT25_043 } from "./BT25-043.js";
import { EffectTiming } from "@aegis/shared";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import "../index.js";

describe("BT25-043 Habakirimon", () => {
  it("checks security only on a second declared attack after Lucemon prevents its battle deletion", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT25-043", as: "habakiri", dp: 15000 }],
          security: ["BT1-009", "BT1-010", "BT1-011"],
          deck: ["BT1-009", "BT1-010"],
        },
        1: {
          battleArea: [{ card: "EX10-052", as: "lucemon", under: ["EX10-004", "EX10-013"] }],
          security: ["BT1-009", "BT1-010"],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();
    const attackerPermanentId = s.perm("habakiri").permanentId;
    expect(s.engine.applyIntent(0, { type: "attack", attackerPermanentId, target: { kind: "player" } })).toEqual({
      ok: true,
    });
    await settle(() => observe(s.engine).blockingSeat() === 1);
    expect(
      s.engine.applyIntent(1, { type: "declareBlock", blockerPermanentId: s.perm("lucemon").permanentId }),
    ).toEqual({
      ok: true,
    });
    await settle(() => !observe(s.engine).isAttacking());
    expect(s.state.players[1]!.battleArea.map((permanent) => permanent.topCard.cardId)).toEqual(["EX10-052"]);
    expect(s.perm("lucemon").isSuspended).toBe(true);
    expect(s.perm("habakiri").isSuspended).toBe(false);
    expect(s.events.filter((event) => event.kind === "securityChecked")).toHaveLength(0);
    expect(s.state.players[1]!.security).toHaveLength(2);

    expect(s.engine.applyIntent(0, { type: "attack", attackerPermanentId, target: { kind: "player" } })).toEqual({
      ok: true,
    });
    await advance(s.engine).finishAttack();
    await settle();
    expect(s.events.filter((event) => event.kind === "attackDeclared")).toHaveLength(2);
    expect(s.events.filter((event) => event.kind === "securityChecked")).toHaveLength(1);
    expect(s.state.players[1]!.security).toHaveLength(1);
    expect(s.state.players[1]!.battleArea.map((permanent) => permanent.topCard.cardId)).toEqual(["EX10-052"]);
  });

  it("reaches Habakirimon through the public Glowing Dawn Lv.5 alternate evolution", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT25-041", as: "murasamemon" }],
        hand: [{ card: "BT25-043", as: "habakiri" }],
        security: [{ card: "BT1-009", as: "security" }],
        deck: [
          { card: "BT1-010", as: "draw" },
          { card: "BT1-011", as: "recovery" },
        ],
      },
    });
    s.state.memory = 3;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("murasamemon").permanentId,
        instanceId: s.inst("habakiri").instanceId,
        useAlternateCost: true,
        alternateRequirementIndex: 0,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("murasamemon").topCard.cardId === "BT25-043");

    expect(s.state.memory).toBe(0);
    expect(s.perm("murasamemon").topCard.cardId).toBe("BT25-043");
    expect(s.state.players[0]!.security).toHaveLength(2);
  });

  it("uses the ordinary yellow Lv.5 evolution at its printed cost 4", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-058", as: "yellowBase" }],
        hand: [{ card: "BT25-043", as: "habakiri" }],
        security: ["BT1-009"],
        deck: ["BT1-010", "BT1-011"],
      },
    });
    s.state.memory = 6;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("yellowBase").permanentId,
        instanceId: s.inst("habakiri").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("yellowBase").topCard.cardId === "BT25-043");
    expect(s.state.memory).toBe(2);
    expect(s.perm("yellowBase").stack.map((card) => card.cardId)).toEqual(["BT1-058"]);
  });

  it("GitHub #5274: does not use the Option waiver for ordinary purple-only evolution", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "BT24-076", as: "purpleBase" },
          { card: "BT25-041", as: "glowingDawn" },
        ],
        hand: [{ card: "BT25-043", as: "habakiri" }],
        security: ["BT1-009"],
        deck: ["BT1-010", "BT1-011"],
      },
    });
    s.state.memory = 6;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("purpleBase").permanentId,
        instanceId: s.inst("habakiri").instanceId,
      }),
    ).toMatchObject({ ok: false });
    expect(s.state.memory).toBe(6);
    expect(s.perm("purpleBase").topCard.cardId).toBe("BT24-076");
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("habakiri").instanceId);
    expect(s.state.players[0]!.security).toHaveLength(1);
  });

  it("recovers first, then trashes the top security of a player with the most security", () => {
    for (const trigger of ["WhenDigivolving", "WhenAttacking"] as const) {
      const effect = BT25_043.effects?.find((entry) => entry.trigger === trigger);
      expect(effect?.actions).toHaveLength(3);
      expect(effect?.actions?.[0]).toMatchObject({
        kind: "SecurityManipulation",
        op: "addTop",
        controller: "mine",
        source: "deck",
        amount: 1,
      });
      expect(effect?.actions?.[1]).toMatchObject({
        kind: "RecoverByTrashingMostSecurity",
        amount: 1,
        recover: false,
      });
      const exchange = effect?.actions?.[1] as { optional?: boolean } | undefined;
      expect(exchange?.optional).toBeUndefined();
      expect(effect?.actions?.[2]).toMatchObject({ condition: { kind: "ifThisEffectActed" } });
    }
  });

  it("only unsuspends after the most-security trash succeeds", async () => {
    const success = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT25-043", as: "habakiri", suspended: true }],
          security: [{ card: "BT1-009" }],
        },
      },
      { autoSelectCards: true },
    );
    await success.ready();
    await advance(success.engine).fireForPermanent(EffectTiming.OnUseAttack, success.perm("habakiri"));
    expect(success.perm("habakiri").isSuspended).toBe(false);
    expect(success.state.players[0]!.security).toHaveLength(0);

    const noEligiblePlayer = setupEngine({
      0: { battleArea: [{ card: "BT25-043", as: "habakiri", suspended: true }] },
    });
    await noEligiblePlayer.ready();
    await advance(noEligiblePlayer.engine).fireForPermanent(
      EffectTiming.OnUseAttack,
      noEligiblePlayer.perm("habakiri"),
    );
    expect(noEligiblePlayer.perm("habakiri").isSuspended).toBe(true);
  });

  it("lets the activating player choose either side when recovery creates a security tie", async () => {
    const run = async (selectedPlayer: string) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [{ card: "BT25-043", as: "habakiri", suspended: true }],
            security: [{ card: "BT1-009", as: "mine" }],
            deck: [{ card: "BT1-010", as: "recovery" }],
          },
          1: { security: ["BT1-011", "BT1-012"] },
        },
        { autoSelectCards: true, preferInstanceIds: [selectedPlayer] },
      );
      await s.ready();
      await advance(s.engine).fireForPermanent(EffectTiming.OnUseAttack, s.perm("habakiri"));
      return s;
    };
    const mine = await run("mine");
    expect(mine.state.players[0]!.security).toHaveLength(1);
    expect(mine.state.players[1]!.security).toHaveLength(2);
    const opponent = await run("opponent");
    expect(opponent.state.players[0]!.security).toHaveLength(2);
    expect(opponent.state.players[1]!.security).toHaveLength(1);
  });

  it("offers the same activating-player tie choice on public When Digivolving", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT25-041", as: "murasamemon" }],
          hand: [{ card: "BT25-043", as: "habakiri" }],
          security: [{ card: "BT1-009" }],
          deck: [
            { card: "BT1-008", as: "evolutionDraw" },
            { card: "BT1-010", as: "recovery" },
          ],
        },
        1: { security: ["BT1-011", "BT1-012"] },
      },
      { autoSelectCards: true, preferInstanceIds: ["opponent"] },
    );
    s.state.memory = 3;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("murasamemon").permanentId,
        instanceId: s.inst("habakiri").instanceId,
        useAlternateCost: true,
        alternateRequirementIndex: 0,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("murasamemon").topCard.cardId === "BT25-043");
    expect(s.state.players[0]!.security).toHaveLength(2);
    expect(s.state.players[1]!.security).toHaveLength(1);
  });

  it("naturally resolves Recovery, most-security trash, and unsuspend during an attack", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT25-043", as: "habakiri" }],
          security: [{ card: "BT1-001", as: "security" }],
          deck: [{ card: "BT1-002", as: "recovery" }],
        },
        1: { security: [] },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 0;
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("habakiri").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !s.perm("habakiri").isSuspended && s.state.players[0]!.trash.length === 1);

    expect(s.perm("habakiri").isSuspended).toBe(false);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(s.inst("recovery").instanceId);
    expect(s.state.players[0]!.security.map((card) => card.instanceId)).toEqual([s.inst("security").instanceId]);
  });

  it("uses the public Option intent for both -8000 and the optional security-funded -5000", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT25-043", as: "habakiriOption" }],
          battleArea: [{ card: "BT25-032", as: "glowingDawn" }],
          security: [{ card: "BT1-001", as: "optionCost" }],
        },
        1: {
          battleArea: [
            { card: "BT1-009", as: "firstTarget", dp: 20000 },
            { card: "BT1-010", as: "secondTarget", dp: 20000 },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 6;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("habakiriOption").instanceId,
        useAs: "option",
      } as never),
    ).toEqual({ ok: true });
    await settle(() =>
      s.state.players[0]!.hand.every((card) => card.instanceId !== s.inst("habakiriOption").instanceId),
    );

    expect(s.state.memory).toBe(0);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(s.inst("optionCost").instanceId);
    expect(s.perm("firstTarget").currentDP).toBe(7000);
    expect(s.perm("secondTarget").currentDP).toBe(15000);
    // CR 15-11-2-2: a Digimon that enters afterwards is affected too.
    const lateEntrant = s.putOnBoard(1, "BT10-086");
    await advance(s.engine).recompute();
    expect(lateEntrant.currentDP - lateEntrant.baseDP).toBe(
      s.perm("secondTarget").currentDP - s.perm("secondTarget").baseDP,
    );
  });

  it("applies the optional -5000 to a Digimon played later in the turn (Discord 1555352172206493706)", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT25-043", as: "habakiriOption" }],
          battleArea: [{ card: "BT25-032", as: "glowingDawn" }],
          security: [{ card: "BT1-001", as: "optionCost" }],
        },
        1: {
          battleArea: [{ card: "BT1-009", as: "current", dp: 20000 }],
          hand: [{ card: "BT1-024", as: "late" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 6;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("habakiriOption").instanceId,
        useAs: "option",
      } as never),
    ).toEqual({ ok: true });
    await settle(() => s.perm("current").currentDP === 7000);

    await advance(s.engine).verb.playInstances([s.inst("late").instanceId]);

    expect(s.perm("late").currentDP).toBe(5000);
  });

  it("reduces DP first, then offers the later security cost, and deletes at zero DP only after the effect", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT25-043", as: "habakiriOption" }],
          battleArea: [{ card: "BT25-032", as: "glowingDawn" }],
          security: [{ card: "BT1-001", as: "optionCost" }],
        },
        1: { battleArea: [{ card: "BT1-009", as: "target", dp: 8000 }] },
      },
      { autoAcceptOptional: false, autoSelectCards: true },
    );
    s.state.memory = 6;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("habakiriOption").instanceId,
        useAs: "option",
      } as never),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    expect(s.perm("target").currentDP).toBe(0);
    expect(s.state.players[1]!.battleArea.some((p) => p.topCard?.cardId === "BT1-009")).toBe(true);
    const cost = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: cost.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined);
    expect(s.state.players[1]!.battleArea.some((p) => p.topCard?.cardId === "BT1-009")).toBe(false);
    const costMove = s.events.findIndex(
      (event) => event.kind === "cardsMoved" && event.instanceIds.includes(s.inst("optionCost").instanceId),
    );
    const targetMove = s.events.findIndex(
      (event) => event.kind === "cardsMoved" && event.instanceIds.includes(s.inst("target").instanceId),
    );
    expect(costMove).toBeGreaterThanOrEqual(0);
    expect(targetMove).toBeGreaterThan(costMove);
  });

  it("can refuse the optional security-funded -5000 while retaining the -8000 effect", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT25-043", as: "habakiriOption" }],
          battleArea: [{ card: "BT25-032", as: "glowingDawn" }],
          security: [{ card: "BT1-001", as: "optionCost" }],
        },
        1: { battleArea: [{ card: "BT1-009", as: "target", dp: 12000 }] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 6;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("habakiriOption").instanceId,
        useAs: "option",
      } as never),
    ).toEqual({ ok: true });
    await settle(() =>
      s.state.players[0]!.hand.every((card) => card.instanceId !== s.inst("habakiriOption").instanceId),
    );
    expect(s.perm("target").currentDP).toBe(4000);
    expect(s.state.players[0]!.security).toContainEqual(
      expect.objectContaining({ instanceId: s.inst("optionCost").instanceId }),
    );
  });

  it("refuses then accepts Habakirimon's replacement cost across two opponent effects", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT25-043", as: "habakiri" },
            { card: "BT25-032", as: "firstGlowingDawn", dp: 5000 },
            { card: "BT25-035", as: "secondGlowingDawn", dp: 5000 },
          ],
          security: ["BT1-001", "BT1-002"],
        },
        1: {
          battleArea: [{ card: "BT1-010", as: "redSource" }],
          hand: [
            { card: "ST1-16", as: "firstGaia" },
            { card: "ST1-16", as: "secondGaia" },
          ],
          deck: ["BT1-003"],
        },
      },
      { autoSelectCards: false, autoAcceptOptional: false },
    );
    s.state.turnSeat = 1;
    s.state.memory = 20;
    await s.ready();
    const sourceId = s.perm("habakiri").permanentId;
    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("firstGaia").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision?.kind === "chooseTargets");
    const firstTarget = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(1, {
        type: "respondDecision",
        decisionId: firstTarget.decisionId,
        response: { kind: "chooseTargets", instanceIds: [s.perm("firstGlowingDawn").permanentId] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const decline = s.state.pendingDecision!;
    expect(decline.promptText).toBe("Prevent leaving the battle area?");
    expect(decline.payloadJson).toContain("trashing your top security card");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: decline.decisionId,
        response: { kind: "optional", accept: false },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === "ST1-16"));
    expect(
      s.state.players[0]!.battleArea.some(
        (permanent) => permanent.topCard?.instanceId === s.inst("firstGlowingDawn").instanceId,
      ),
    ).toBe(false);
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.permanentId === sourceId)).toBe(true);
    expect(s.state.players[0]!.security).toHaveLength(2);

    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("secondGaia").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision?.kind === "chooseTargets");
    const secondTarget = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(1, {
        type: "respondDecision",
        decisionId: secondTarget.decisionId,
        response: { kind: "chooseTargets", instanceIds: [s.perm("secondGlowingDawn").permanentId] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const accept = s.state.pendingDecision!;
    expect(accept.promptText).toBe("Prevent leaving the battle area?");
    expect(accept.payloadJson).toContain("trashing your top security card");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: accept.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined);
    expect(
      s.state.players[0]!.battleArea.some(
        (permanent) => permanent.topCard?.instanceId === s.inst("secondGlowingDawn").instanceId,
      ),
    ).toBe(true);
    expect(s.state.players[0]!.security).toHaveLength(1);
  });

  it("applies both Option DP reductions only for the current turn", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT25-043", as: "habakiriOption" }],
          battleArea: [{ card: "BT25-032", as: "glowingDawn" }],
          security: [{ card: "BT1-001", as: "optionCost" }],
          deck: ["BT1-002", "BT1-003"],
        },
        1: { battleArea: [{ card: "BT1-009", as: "target", dp: 20000 }], deck: ["BT1-004"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 0;
    s.state.memory = 6;
    await s.ready();
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("habakiriOption").instanceId,
        useAs: "option",
      } as never),
    ).toEqual({ ok: true });
    await settle(() => s.perm("target").currentDP === 7000);
    expect(s.state.players[0]!.security).toHaveLength(0);
    expect(s.perm("target").currentDP).toBe(7000);
    advance(s.engine).endMainPhaseIfOpen(0);
    await turn;
    expect(s.perm("target").currentDP).toBe(20000);
  });

  it("does not pay the optional security cost when the controller has no security", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT25-043", as: "habakiriOption" }],
          battleArea: [{ card: "BT25-032", as: "glowingDawn" }],
          deck: ["BT1-001"],
        },
        1: { battleArea: [{ card: "BT1-009", as: "target", dp: 12000 }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 6;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("habakiriOption").instanceId,
        useAs: "option",
      } as never),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined && s.state.players[0]!.hand.length === 0);
    expect(s.perm("target").currentDP).toBe(4000);
    expect(s.state.players[0]!.trash.some((card) => card.cardId === "BT1-001")).toBe(false);
  });

  it("prevents all matching Glowing Dawn Digimon from leaving with one once-per-turn replacement", () => {
    const effect = BT25_043.effects?.find((entry) => entry.trigger === "AllTurns");
    const replacement = effect?.actions?.[0] as {
      affectsAll?: boolean;
      target?: { filter?: unknown; count?: unknown };
      frequency?: string;
    };
    expect(effect?.frequency).toBe("OncePerTurn");
    expect(replacement.affectsAll).toBe(true);
    expect(replacement.target).toMatchObject({
      count: "all",
      filter: {
        controller: "mine",
        kind: ["Digimon"],
        nameOrTrait: [{ tokens: ["Glowing Dawn"], match: "trait" }],
      },
    });
  });

  it("protects every matching trait permanent, but not a non-matching Digimon", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT25-043", as: "habakiri" },
            { card: "BT25-032", as: "matchingOne" },
            { card: "BT25-035", as: "matchingTwo" },
            { card: "BT1-009", as: "nonMatching" },
          ],
          security: [{ card: "BT1-009" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    expect(
      await advance(s.engine).verb.deletePermanent(
        [s.perm("matchingOne").permanentId, s.perm("matchingTwo").permanentId, s.perm("nonMatching").permanentId],
        "byBattle",
      ),
    ).toBe(1);
    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard?.cardId)).toEqual(
      expect.arrayContaining(["BT25-032", "BT25-035"]),
    );
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === "BT1-009")).toBe(false);
    expect(s.state.players[0]!.security).toHaveLength(0);

    expect(await advance(s.engine).verb.deletePermanent([s.perm("matchingOne").permanentId], "byBattle")).toBe(1);
    expect(s.state.players[0]!.trash.map((card) => card.cardId)).toContain("BT25-032");
  });

  it("does not reuse the replacement in the same turn, then resets it on a real next turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT25-043", as: "habakiri" },
            { card: "BT25-032", as: "firstMatching" },
            { card: "BT25-035", as: "secondMatching" },
          ],
          security: ["BT1-001", "BT1-002"],
          deck: ["BT1-003", "BT1-004"],
        },
        1: { deck: ["BT1-005", "BT1-006"], security: ["BT1-007"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    expect(await advance(s.engine).verb.deletePermanent([s.perm("firstMatching").permanentId], "byBattle")).toBe(0);
    expect(s.state.players[0]!.security).toHaveLength(1);
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard?.cardId === "BT25-032")).toBe(true);

    expect(await advance(s.engine).verb.deletePermanent([s.perm("secondMatching").permanentId], "byBattle")).toBe(1);
    expect(s.state.players[0]!.security).toHaveLength(1);
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard?.cardId === "BT25-035")).toBe(false);

    s.state.turnSeat = 1;
    s.state.memory = 10;
    const opponentTurn = s.engine.runOneTurn();
    await opponentTurn;
    s.state.turnSeat = 0;
    s.state.memory = 10;
    const nextTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    expect(await advance(s.engine).verb.deletePermanent([s.perm("firstMatching").permanentId], "byBattle")).toBe(0);
    expect(s.state.players[0]!.security).toHaveLength(0);
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard?.cardId === "BT25-032")).toBe(true);
    advance(s.engine).endMainPhaseIfOpen(0);
    await nextTurn;
  });
});

describe("BT25-043 Habakirimon — KB Q&A rulings", () => {
  async function digivolveIntoHabakirimonWithTie(preferredPlayer: "mine" | "opponent") {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT25-041", as: "murasamemon" }],
          hand: [{ card: "BT25-043", as: "habakiri" }],
          security: [{ card: "BT1-009", as: "mySecurity" }],
          deck: [
            { card: "BT1-008", as: "evolutionDraw" },
            { card: "BT1-010", as: "recovery" },
          ],
        },
        1: { security: ["BT1-011", "BT1-012"] },
      },
      { autoSelectCards: true, preferInstanceIds: [preferredPlayer] },
    );
    s.state.memory = 3;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("murasamemon").permanentId,
        instanceId: s.inst("habakiri").instanceId,
        useAlternateCost: true,
        alternateRequirementIndex: 0,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("murasamemon").topCard.cardId === "BT25-043" && s.state.pendingDecision === undefined);
    return s;
  }

  it.each([
    ["mine", 1, 2],
    ["opponent", 2, 1],
  ] as const)(
    "lets the activating player pick either tied player, here %s (Q6312)",
    async (preferredPlayer, mySecurityAfter, opponentSecurityAfter) => {
      const s = await digivolveIntoHabakirimonWithTie(preferredPlayer);

      const choice = s.decisions.find(({ req }) => /most security cards/i.test(req.promptText ?? ""));
      expect(choice?.seat).toBe(0);
      expect(choice?.req.options?.candidateInstanceIds).toEqual(expect.arrayContaining(["mine", "opponent"]));
      expect(s.state.players[0]!.security).toHaveLength(mySecurityAfter);
      expect(s.state.players[1]!.security).toHaveLength(opponentSecurityAfter);
    },
  );

  it("deletes a 0 DP Digimon only after the used Option card is trashed (Q6313)", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT25-043", as: "habakiriOption" }],
          battleArea: [{ card: "BT25-032", as: "glowingDawn" }],
          security: ["BT1-001"],
        },
        1: { battleArea: [{ card: "BT1-009", as: "target", dp: 8000 }] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 6;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("habakiriOption").instanceId,
        useAs: "option",
      } as never),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 0 && s.state.pendingDecision === undefined);

    const optionTrashed = s.events.findIndex(
      (event) =>
        event.kind === "cardsMoved" &&
        event.to === "trash" &&
        event.instanceIds.includes(s.inst("habakiriOption").instanceId),
    );
    const targetDeleted = s.events.findIndex(
      (event) => event.kind === "cardsMoved" && event.instanceIds.includes(s.inst("target").instanceId),
    );
    expect(optionTrashed).toBeGreaterThanOrEqual(0);
    expect(targetDeleted).toBeGreaterThan(optionTrashed);
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toContain(s.inst("target").instanceId);
  });

  it("deletes a 0 DP Digimon only after Arts Digivolve, then its [On Deletion] triggers with [When Digivolving] (Q6313)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-060", as: "base" }],
          hand: [{ card: "BT25-043", as: "dualCard" }],
          security: ["BT1-001"],
          deck: ["BT1-001", "BT1-002"],
        },
        1: { battleArea: [{ card: "BT25-039", as: "target", dp: 8000 }], security: ["BT1-003", "BT1-004", "BT1-005"] },
      },
      { autoSelectCards: false, autoDeclineOptional: true },
    );
    s.state.memory = 6;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("dualCard").instanceId,
        useAs: "option",
      } as never),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "selectCards");
    expect(s.perm("target").currentDP).toBe(0);
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard?.cardId === "BT1-060")).toBe(true);
    const arts = s.state.pendingDecision!;
    expect(JSON.parse(arts.payloadJson).candidateInstanceIds).toContain(s.inst("base").instanceId);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: arts.decisionId,
        response: { kind: "selectCards", instanceIds: [s.inst("base").instanceId] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === "BT25-043");
    await settle(
      () =>
        s.state.pendingDecision?.kind === "selectCards" &&
        s.state.pendingDecision.promptText === "Trash the top security card of 1 player with the most security cards?",
    );
    const mostSecurity = s.state.pendingDecision!;
    expect(JSON.parse(mostSecurity.payloadJson).candidateInstanceIds).toEqual(["opponent"]);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: mostSecurity.decisionId,
        response: { kind: "selectCards", instanceIds: ["opponent"] },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.events.some(
          (event) =>
            event.kind === "effectResolved" && event.sourceCardId === "BT25-043" && event.timing === "WhenDigivolving",
        ) && s.state.pendingDecision === undefined,
    );
    expect(s.perm("base").stack.map((card) => card.cardId)).toContain("BT1-060");
    expect(s.state.players[0]!.trash.some((card) => card.cardId === "BT25-043")).toBe(false);
    expect(s.state.players[0]!.security).toHaveLength(2);
    expect(s.state.players[1]!.security).toHaveLength(2);
    expect(s.state.players[1]!.battleArea.some((permanent) => permanent.topCard?.cardId === "BT25-039")).toBe(false);
    expect(s.state.players[1]!.trash.map((card) => card.cardId)).toContain("BT25-039");
    const habakiriResolved = s.events.findIndex(
      (event) => event.kind === "effectResolved" && event.sourceCardId === "BT25-043" && event.timing === "OnUseOption",
    );
    const targetMoved = s.events.findIndex(
      (event) => event.kind === "cardsMoved" && event.instanceIds.includes(s.inst("target").instanceId),
    );
    const whenDigivolvingResolved = s.events.findIndex(
      (event) =>
        event.kind === "effectResolved" && event.sourceCardId === "BT25-043" && event.timing === "WhenDigivolving",
    );
    const onDeletionResolved = s.events.findIndex(
      (event) =>
        event.kind === "effectResolved" && event.sourceCardId === "BT25-039" && event.timing === "OnDestroyedAnyone",
    );
    expect(habakiriResolved).toBeGreaterThanOrEqual(0);
    expect(targetMoved).toBeGreaterThan(habakiriResolved);
    expect(whenDigivolvingResolved).toBeGreaterThan(targetMoved);
    expect(onDeletionResolved).toBe(-1);
    expect(
      s.decisions.some(({ req }) => req.sourceCardId === "BT25-039" && req.options?.activationConfirmation === true),
    ).toBe(true);
  });

  it("stops every Glowing Dawn Digimon leaving at the same time with one security trash (Q6314)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT25-043", as: "habakiri" },
            { card: "BT25-032", as: "matchingOne" },
            { card: "BT25-035", as: "matchingTwo" },
            { card: "BT1-009", as: "nonMatching" },
          ],
          security: [{ card: "BT1-001", as: "paid" }, "BT1-002"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    const protectedIds = [
      s.perm("habakiri").permanentId,
      s.perm("matchingOne").permanentId,
      s.perm("matchingTwo").permanentId,
    ];
    const nonMatchingId = s.perm("nonMatching").permanentId;

    advance(s.engine).verb.enterEffectResolution(1, ["Option"]);
    await advance(s.engine).verb.deletePermanent([...protectedIds, nonMatchingId], "byEffect");
    advance(s.engine).verb.leaveEffectResolution();
    await settle(() => s.state.pendingDecision === undefined);

    const remaining = s.state.players[0]!.battleArea.map((permanent) => permanent.permanentId);
    expect(remaining).toEqual(expect.arrayContaining(protectedIds));
    expect(remaining).not.toContain(nonMatchingId);
    expect(s.state.players[0]!.security).toHaveLength(1);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(s.inst("paid").instanceId);
  });
});
