import { describe, expect, it } from "vitest";
import { getCardDefinition } from "@aegis/shared";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import { compiled } from "./EX4-018.js";
import "../index.js";

async function passTurn(s: ReturnType<typeof setupEngine>, seat: 0 | 1): Promise<void> {
  const turn = s.engine.runOneTurn();
  await advance(s.engine).waitForMainPhase(seat);
  advance(s.engine).endMainPhaseIfOpen(seat);
  await turn;
}

describe("EX4-018 MailBirdramon", () => {
  it("registers the catalog identity and complete residual-free IR", () => {
    expect(getCardDefinition("EX4-018")).toMatchObject({
      cardId: "EX4-018",
      nameEn: "MailBirdramon",
      colors: ["Blue"],
      kinds: ["Digimon"],
      level: 4,
      playCost: 5,
      dp: 5000,
      evoCosts: [
        { color: "Blue", level: 3, memoryCost: 3 },
        { color: "Black", level: 3, memoryCost: 3 },
      ],
      types: ["Machine", "Blue Flare"],
      effectText: expect.stringContaining("lowest level"),
      inheritedEffectText: expect.stringContaining("can't be deleted"),
    });
    expect(runtimeCompiledCard("EX4-018")).toMatchObject({ coverage: "full", residual: [] });
  });

  it("gives the lowest-level opposing Digimon a temporary attack trigger", () => {
    expect(compiled.effects?.find((entry) => entry.trigger === "OnPlay")?.actions?.[0]).toMatchObject({
      kind: "GrantAuraToOpponents",
      target: { filter: { controller: "opponent", kind: ["Digimon"], superlative: "lowestLevel" } },
      effectText: "[When Attacking] Lose 2 memory",
      duration: "untilOpponentTurnEnd",
    });
  });
  it("has Save on deletion", () => {
    const deletion = compiled.effects?.find((entry) => entry.trigger === "OnDeletion");
    expect(deletion?.keywords).toMatchObject([{ keyword: "Save" }]);
    expect(deletion?.actions?.[0]).toMatchObject({
      kind: "PlaceUnder",
      optional: true,
      target: { count: 1, isSelf: true },
      underFilter: { controller: "mine", kind: ["Tamer"] },
    });
  });

  it("has inherited Jamming", () => {
    expect(compiled.effects?.find((entry) => entry.trigger === "Static" && entry.isInherited)?.keywords).toMatchObject([
      { keyword: "Jamming" },
    ]);
  });

  it("makes the lowest-level opposing Digimon lose 2 memory when it attacks", async () => {
    const s = setupEngine(
      {
        0: { security: ["BT1-009"], hand: [{ card: "EX4-018", as: "mail" }] },
        1: {
          security: ["BT1-009"],
          battleArea: [
            { card: "BT1-009", as: "lowest" },
            { card: "AD1-001", as: "higher" },
          ],
        },
      },
      { autoOrderTriggers: true, autoSelectCards: true },
    );
    s.state.turnSeat = 0;
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("mail").instanceId })).toEqual({ ok: true });
    await settle(() =>
      observe(s.engine)
        .customEffectGrants(s.perm("lowest"))
        .some((grant) => grant.token === "[When Attacking] Lose 2 memory"),
    );
    s.state.turnSeat = 1;
    s.state.memory = 10;

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("lowest").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking());
    expect(s.state.memory).toBe(8);
  });

  it("survives a stronger Security Digimon through inherited Jamming", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "EX4-019", as: "host", under: ["EX4-018"] }] },
      1: { security: ["BT1-081"] },
    });
    await s.ready();

    expect(observe(s.engine).hasKeyword(s.perm("host"), "Jamming")).toBe(true);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 0);

    expect(
      s.state.players[0]!.battleArea.some((permanent) => permanent.permanentId === s.perm("host").permanentId),
    ).toBe(true);
  });

  it("keeps the attack effect on its original target after that target digivolves (Q3459)", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "EX4-018", as: "mail" }],
          security: ["BT1-009", "BT1-009", "BT1-009"],
        },
        1: {
          security: ["BT1-009", "BT1-009", "BT1-009"],
          deck: ["BT1-010"],
          hand: [{ card: "AD1-001", as: "evolution" }],
          battleArea: [
            { card: "BT1-009", as: "target" },
            { card: "AD1-001", as: "higher" },
          ],
        },
      },
      { autoSelectCards: true },
    );
    s.state.turnSeat = 0;
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("mail").instanceId })).toEqual({ ok: true });
    await settle(() =>
      observe(s.engine)
        .customEffectGrants(s.perm("target"))
        .some((grant) => grant.token === "[When Attacking] Lose 2 memory"),
    );

    s.state.turnSeat = 1;
    s.state.memory = 10;
    const targetTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(1);
    expect(
      s.engine.applyIntent(1, {
        type: "digivolve",
        permanentId: s.perm("target").permanentId,
        instanceId: s.inst("evolution").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("target").topCard?.cardId === "AD1-001");

    const newLowest = s.putOnBoard(1, { card: "BT1-009", as: "newLowest" });
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("target").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking());
    expect(s.state.memory).toBe(8);

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: newLowest.permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking());
    expect(s.state.memory).toBe(8);
    advance(s.engine).endMainPhaseIfOpen(1);
    await targetTurn;
  });

  it("digivolves from a blue level 3 for 3, preserves the source, and rejects a red route", async () => {
    const legal = setupEngine({
      0: {
        battleArea: [{ card: "EX4-015", as: "blueBase" }],
        hand: [{ card: "EX4-018", as: "mail" }],
      },
    });
    legal.state.turnSeat = 0;
    legal.state.memory = 3;
    await legal.ready();
    expect(
      legal.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: legal.perm("blueBase").permanentId,
        instanceId: legal.inst("mail").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => legal.perm("blueBase").topCard?.cardId === "EX4-018");
    expect(legal.state.memory).toBe(0);
    expect(legal.perm("blueBase").topCard?.instanceId).toBe(legal.inst("mail").instanceId);
    expect(legal.perm("blueBase").stack.map(({ cardId }) => cardId)).toEqual(["EX4-015"]);

    const illegal = setupEngine({
      0: {
        battleArea: [{ card: "BT1-009", as: "redBase" }],
        hand: [{ card: "EX4-018", as: "mail" }],
      },
    });
    illegal.state.turnSeat = 0;
    illegal.state.memory = 3;
    await illegal.ready();
    expect(
      illegal.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: illegal.perm("redBase").permanentId,
        instanceId: illegal.inst("mail").instanceId,
      }).ok,
    ).toBe(false);
    expect(illegal.state.memory).toBe(3);
    expect(illegal.perm("redBase").topCard?.cardId).toBe("BT1-009");
  });

  it("expires the granted attack trigger at the end of the opponent's turn", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "EX4-018", as: "mail" }],
          deck: ["BT1-009", "BT1-009", "BT1-009"],
          security: ["BT1-009", "BT1-009", "BT1-009"],
        },
        1: {
          battleArea: [{ card: "BT1-009", as: "target", dp: 12000 }],
          deck: ["BT1-009", "BT1-009", "BT1-009"],
          security: ["BT1-009", "BT1-009", "BT1-009"],
        },
      },
      { autoSelectCards: true },
    );
    s.state.turnSeat = 0;
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("mail").instanceId })).toEqual({ ok: true });
    await settle(() =>
      observe(s.engine)
        .customEffectGrants(s.perm("target"))
        .some((grant) => grant.token === "[When Attacking] Lose 2 memory"),
    );

    s.state.turnSeat = 1;
    s.state.memory = 0;
    const firstOpponentTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(1);
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("target").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking());
    expect(s.state.memory).toBe(-2);
    advance(s.engine).endMainPhaseIfOpen(1);
    await firstOpponentTurn;

    s.state.turnSeat = 0;
    s.state.memory = 2;
    await passTurn(s, 0);
    s.state.turnSeat = 1;
    s.state.memory = 0;
    const secondOpponentTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(1);
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("target").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking());
    expect(s.state.memory).toBe(0);
    advance(s.engine).endMainPhaseIfOpen(1);
    await secondOpponentTurn;
  });

  it("may Save itself under a Tamer after deletion", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX4-018", as: "mail" },
            { card: "BT10-088", as: "tamer" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const savedInstanceId = s.perm("mail").topCard!.instanceId;

    await advance(s.engine).verb.deletePermanent([s.perm("mail").permanentId], "byEffect");
    await settle(() => s.perm("tamer").stack.some((card) => card.instanceId === savedInstanceId));

    expect(s.perm("tamer").stack.some((card) => card.instanceId === savedInstanceId)).toBe(true);
    expect(s.state.players[0]!.trash.some((card) => card.instanceId === savedInstanceId)).toBe(false);
  });

  it("may decline Save and remain in the trash", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX4-018", as: "mail" },
            { card: "BT10-088", as: "tamer" },
          ],
        },
      },
      { autoDeclineOptional: true },
    );
    const mailInstanceId = s.perm("mail").topCard!.instanceId;
    await s.ready();

    await advance(s.engine).verb.deletePermanent([s.perm("mail").permanentId], "byEffect");
    await settle(() => s.state.players[0]!.trash.some((card) => card.instanceId === mailInstanceId));

    expect(s.state.players[0]!.trash.some((card) => card.instanceId === mailInstanceId)).toBe(true);
    expect(s.perm("tamer").stack.some((card) => card.instanceId === mailInstanceId)).toBe(false);
  });
});
