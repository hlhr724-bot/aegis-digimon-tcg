import { EffectDuration, EffectTiming } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { drainMicrotasks, setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled } from "./BT18-086.js";
import "./BT18-019.js";
import "./BT18-101.js";
import "../EX10/EX10-060.js";
import "../BT26/BT26-029.js";
import "../ST10/ST10-14.js";

describe("BT18-086 Lucemon: Larva", () => {
  it.each([
    ["declined", "BT18-101", true],
    ["different name", "BT18-082", false],
    ["Larva in battle", "BT18-101", false],
  ])("GitHub #5307: does not prevent leaving when %s", async (control, targetCard, offered) => {
    const larva = { card: "BT18-086", as: "larva" };
    const s = setupEngine(
      {
        0: { battleArea: ["BT1-045", "BT10-079"], hand: [{ card: "ST10-14", as: "chaos" }] },
        1: {
          ...(control === "Larva in battle" ? {} : { breeding: larva }),
          battleArea: [{ card: targetCard, as: "target" }, ...(control === "Larva in battle" ? [larva] : [])],
          security: ["BT1-010"],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true, autoChooseOption: true, preferOptionIndex: 1 },
    );
    s.state.memory = 10;
    await s.ready();
    const targetId = s.inst("target").instanceId;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("chaos").instanceId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("chaos").instanceId));
    expect(s.state.players[1]!.battleArea.some((perm) => perm.topCard.instanceId === targetId)).toBe(false);
    expect(s.state.players[1]!.security.map((card) => card.instanceId)).toEqual([targetId]);
    expect(s.decisions.some(({ req }) => req.kind === "optional" && req.sourceCardId === "BT18-086")).toBe(offered);
    expect(s.state.players[1]!.breeding?.topCard.cardId).toBe(control === "Larva in battle" ? undefined : "BT18-086");
    expect(s.state.pendingDecision).toBeUndefined();
  });
  it.each(["BT18-101", "EX10-060"])(
    "GitHub #5307: breeding Larva offers to prevent %s leaving for security",
    async (satanCard) => {
      const s = setupEngine(
        {
          0: { battleArea: ["BT1-045", "BT10-079"], hand: [{ card: "ST10-14", as: "chaos" }] },
          1: {
            breeding: { card: "BT18-086", as: "larva" },
            battleArea: [{ card: satanCard, as: "satan" }],
            security: ["BT1-010"],
          },
        },
        { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
      );
      s.state.memory = 10;
      await s.ready();
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("chaos").instanceId })).toEqual({
        ok: true,
      });
      await settle(() => s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("chaos").instanceId));
      expect(s.state.players[1]!.breeding).toBeUndefined();
      expect(s.state.players[1]!.battleArea.map((perm) => perm.topCard.cardId)).toEqual([satanCard, "BT18-086"]);
      expect(s.state.players[1]!.security.map((card) => card.cardId)).toEqual(["BT1-010"]);
      expect(s.decisions.some(({ req }) => req.kind === "optional" && req.sourceCardId === "BT18-086")).toBe(true);
      expect(s.state.pendingDecision).toBeUndefined();
    },
  );
  it("covers security play, breeding replacement, and 0 DP protection", () => {
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual).toEqual([]);
    expect(compiled.effects[0]).toMatchObject({
      trigger: "Security",
      isSecurity: true,
      actions: [
        {
          kind: "PlayWithoutCost",
          target: { filter: { nameOrTrait: [{ tokens: ["Lucemon"], match: "nameExact" }] } },
        },
      ],
    });
    expect(compiled.effects[1]).toMatchObject({
      trigger: "AllTurns",
      isBreeding: true,
      actions: [{ kind: "Replacement", event: "wouldLeavePlay" }],
    });
    expect(compiled.effects[2]).toMatchObject({
      trigger: "AllTurns",
      actions: [
        {
          kind: "Aura",
          target: { filter: { controller: "mine", kind: ["Digimon"], dp: { op: "eq", value: 0 } }, count: "all" },
          effect: { kind: "restriction", restriction: "beDeleted" },
          while: {
            filter: { nameOrTrait: [{ tokens: ["Lucemon"], match: "name" }] },
          },
        },
      ],
    });
  });

  it("naturally plays a Lucemon from trash when revealed from security", async () => {
    const s = setupEngine(
      {
        0: {
          security: [{ card: "BT18-086", as: "larva", faceUp: true }],
          trash: [{ card: "BT18-034", as: "lucemon" }],
        },
        1: { battleArea: [{ card: "BT1-060", as: "attacker" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    await s.ready();
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() =>
      s.state.players[0]!.battleArea.some((perm) => perm.topCard?.instanceId === s.inst("lucemon").instanceId),
    );

    expect(
      s.state.players[0]!.battleArea.some((perm) => perm.topCard?.instanceId === s.inst("lucemon").instanceId),
    ).toBe(true);
  });

  it("does not play a Lucemon variant from trash when Larva is revealed from security", async () => {
    const s = setupEngine({
      0: {
        security: [{ card: "BT18-086", as: "larva", faceUp: true }, "BT1-010"],
        trash: [{ card: "BT18-082", as: "variant" }],
      },
      1: { battleArea: [{ card: "BT1-060", as: "attacker" }] },
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
    await settle(() => s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("larva").instanceId));

    expect(
      s.state.players[0]!.battleArea.some((perm) => perm.topCard?.instanceId === s.inst("variant").instanceId),
    ).toBe(false);
    expect(s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("variant").instanceId)).toBe(true);
  });

  it("naturally protects only 0 DP Digimon while a non-white Lucemon is present", async () => {
    const preferInstanceIds: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT18-086", as: "larva" },
            { card: "BT1-009", as: "normal" },
            { card: "BT18-034", as: "lucemon" },
          ],
        },
        1: { hand: [{ card: "BT18-019", as: "millenniummon" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds },
    );
    const normalId = s.perm("normal").permanentId;
    preferInstanceIds.push(normalId);
    s.state.turnSeat = 1;
    s.state.memory = 14;
    await s.ready();
    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("millenniummon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => !s.state.players[0]!.battleArea.some((perm) => perm.permanentId === normalId));

    expect(s.state.players[0]!.battleArea.some((perm) => perm.topCard?.instanceId === s.inst("larva").instanceId)).toBe(
      true,
    );
    expect(
      s.state.players[0]!.battleArea.some((perm) => perm.topCard?.instanceId === s.inst("lucemon").instanceId),
    ).toBe(true);
    expect(observe(s.engine).isRestrictedByEffect(s.perm("larva"), "beDeleted", "Digimon")).toBe(true);
  });

  it("keeps Satan Mode after a DP reduction greater than its remaining DP", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "BT18-086", as: "larva" },
          { card: "EX10-060", as: "satan", dp: 3000 },
        ],
      },
    });
    const satanId = s.perm("satan").permanentId;
    await s.ready();

    await advance(s.engine).verb.modifyDP(satanId, -5000, EffectDuration.UntilEachTurnEnd);
    expect(s.perm("satan").currentDP).toBe(0);
    await advance(s.engine).fireGlobal(EffectTiming.OnStartTurn);

    expect(s.state.players[0]!.battleArea.some((perm) => perm.permanentId === satanId)).toBe(true);
    expect(s.state.players[0]!.trash.some((card) => card.cardId === "EX10-060")).toBe(false);
  });

  it("deletes the same reduced Digimon without Larva", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: "EX10-060", as: "satan", dp: 3000 }] } });
    const satanId = s.perm("satan").permanentId;
    await s.ready();

    await advance(s.engine).verb.modifyDP(satanId, -5000, EffectDuration.UntilEachTurnEnd);
    await advance(s.engine).fireGlobal(EffectTiming.OnStartTurn);

    expect(s.state.players[0]!.battleArea.some((perm) => perm.permanentId === satanId)).toBe(false);
    expect(s.state.players[0]!.trash.some((card) => card.cardId === "EX10-060")).toBe(true);
  });

  it("protects Satan Mode when BT26-029 reduces it below zero", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT18-086", as: "larva" },
            { card: "EX10-060", as: "satan", dp: 3000 },
          ],
        },
        1: { battleArea: [{ card: "BT26-029", as: "aegis" }] },
      },
      { autoSelectCards: true },
    );
    const satanId = s.perm("satan").permanentId;
    await s.ready();

    await advance(s.engine).fireSubTrigger("whenSecurityRemoved", { removedFromSecuritySeat: 1 });
    await settle();

    expect(s.state.players[0]!.battleArea.some((perm) => perm.permanentId === satanId)).toBe(true);
    expect(s.perm("satan").currentDP).toBe(0);
  });

  it("naturally moves Larva from breeding when Satan Mode would leave play", async () => {
    const preferInstanceIds: string[] = [];
    const s = setupEngine(
      {
        0: {
          breeding: { card: "BT18-086", as: "larva" },
          battleArea: [{ card: "BT18-101", as: "satan" }],
          security: ["BT1-010"],
        },
        1: { hand: [{ card: "BT18-019", as: "millenniummon" }], security: ["BT1-010"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds },
    );
    preferInstanceIds.push(s.perm("satan").permanentId);
    s.state.turnSeat = 1;
    s.state.memory = 14;
    await s.ready();
    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("millenniummon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.breeding === undefined);

    expect(s.state.players[0]!.battleArea.some((perm) => perm.topCard?.instanceId === s.inst("larva").instanceId)).toBe(
      true,
    );
    expect(s.state.players[0]!.battleArea.some((perm) => perm.topCard?.instanceId === s.inst("satan").instanceId)).toBe(
      true,
    );
  });
});

describe("BT18-086 Lucemon: Larva — KB Q&A rulings", () => {
  it("keeps a 0 DP Digimon from being deleted by losing a battle and by the 0 DP rule check (Q3044)", async () => {
    const attackLarva = async (withLucemon: boolean) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [
              { card: "BT18-086", as: "larva", suspended: true },
              ...(withLucemon ? [{ card: "BT18-034", as: "lucemon" }] : []),
            ],
          },
          1: { battleArea: [{ card: "BT1-060", as: "attacker" }] },
        },
        { autoAcceptOptional: true, autoSelectCards: true },
      );
      s.state.turnSeat = 1;
      const larvaInstanceId = s.inst("larva").instanceId;
      await s.ready();
      expect(
        s.engine.applyIntent(1, {
          type: "attack",
          attackerPermanentId: s.perm("attacker").permanentId,
          target: { kind: "permanent", permanentId: s.perm("larva").permanentId },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.events.some((event) => event.kind === "attackDeclared") && !observe(s.engine).isAttacking());
      await drainMicrotasks();
      return {
        larvaInPlay: s.state.players[0]!.battleArea.some((perm) => perm.topCard?.instanceId === larvaInstanceId),
        larvaInTrash: s.state.players[0]!.trash.some((card) => card.instanceId === larvaInstanceId),
      };
    };

    expect(await attackLarva(true)).toEqual({ larvaInPlay: true, larvaInTrash: false });
    expect(await attackLarva(false)).toEqual({ larvaInPlay: false, larvaInTrash: true });
  });

  it("activates its [Security] effect and then battles the attacking Digimon when checked (Q6242)", async () => {
    let larvaTrashedWhenLucemonPlayed: boolean | undefined;
    const s = setupEngine(
      {
        0: {
          security: [{ card: "BT18-086", as: "larva" }],
          trash: [{ card: "BT18-034", as: "lucemon" }],
        },
        1: { battleArea: [{ card: "BT1-060", as: "attacker" }] },
      },
      {
        autoAcceptOptional: true,
        autoSelectCards: true,
        onEvent: (event) => {
          if (event.kind !== "cardPlayed" || event.cardId !== "BT18-034") return;
          const larvaInstanceId = s.inst("larva").instanceId;
          larvaTrashedWhenLucemonPlayed = s.state.players[0]!.trash.some((card) => card.instanceId === larvaInstanceId);
        },
      },
    );
    s.state.turnSeat = 1;
    const lucemonInstanceId = s.inst("lucemon").instanceId;
    const larvaInstanceId = s.inst("larva").instanceId;
    await s.ready();
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.some((card) => card.instanceId === larvaInstanceId));

    const securityEffectResolvedIndex = s.events.findIndex(
      (event) => event.kind === "effectResolved" && event.sourceCardId === "BT18-086",
    );
    const lucemonPlayedIndex = s.events.findIndex(
      (event) => event.kind === "cardPlayed" && event.cardId === "BT18-034",
    );
    const checkIndex = s.events.findIndex((event) => event.kind === "securityChecked");
    expect(lucemonPlayedIndex).toBeGreaterThanOrEqual(0);
    expect(lucemonPlayedIndex).toBeLessThan(securityEffectResolvedIndex);
    expect(securityEffectResolvedIndex).toBeLessThan(checkIndex);
    // The battle has not deleted Larva yet when its [Security] effect plays Lucemon.
    expect(larvaTrashedWhenLucemonPlayed).toBe(false);
    expect(s.events[checkIndex]).toMatchObject({
      kind: "securityChecked",
      revealedCardId: "BT18-086",
      resolution: "battle",
      battle: { securityDigimonDeleted: true, attackerDeleted: false },
    });
    expect(s.state.players[0]!.battleArea.some((perm) => perm.topCard?.instanceId === lucemonInstanceId)).toBe(true);
    expect(s.state.players[0]!.trash.some((card) => card.instanceId === larvaInstanceId)).toBe(true);
  });
});
