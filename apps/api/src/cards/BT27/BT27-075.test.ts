import { describe, expect, it } from "vitest";
import { advance } from "#api/engine/testkit/advance";
import { setupEngine, settle, type BoardSpec } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";
import "#api/cards/BT27/BT27-075";
import "#api/cards/BT27/BT27-076";
import "#api/cards/BT27/BT27-079";

function isOnBattleArea(s: ReturnType<typeof setupEngine>, cardId: string): boolean {
  return s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === cardId);
}

describe("ProtoGizmon breeding-area discount", () => {
  it("costs 1 after deleting a level 2 Digi-Egg from the breeding area", async () => {
    const s = setupEngine(
      { 0: { hand: [{ card: "BT27-075", as: "proto" }], breeding: { card: "BT1-001", as: "egg" } } },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 5;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("proto").instanceId })).toEqual({ ok: true });
    await settle(() => isOnBattleArea(s, "BT27-075") && !s.state.pendingDecision);

    expect(s.state.players[0]!.breeding).toBeUndefined();
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(s.inst("egg").instanceId);
    expect(s.state.memory).toBe(4);
  });

  it("pays the full 3 when the discount is declined", async () => {
    const s = setupEngine(
      { 0: { hand: [{ card: "BT27-075", as: "proto" }], breeding: { card: "BT1-001", as: "egg" } } },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 5;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("proto").instanceId })).toEqual({ ok: true });
    await settle(() => isOnBattleArea(s, "BT27-075") && !s.state.pendingDecision);

    expect(s.state.players[0]!.breeding?.topCard?.instanceId).toBe(s.inst("egg").instanceId);
    expect(s.state.memory).toBe(2);
  });

  it.each<[string, BoardSpec]>([
    ["a level 3 Digimon in the breeding area", { 0: { breeding: { card: "BT1-009", as: "fodder" } } }],
    ["an opponent's level 2 Digi-Egg in their breeding area", { 1: { breeding: { card: "BT1-001", as: "fodder" } } }],
  ])("cannot use %s for the discount", async (_label, board) => {
    const s = setupEngine(
      { ...board, 0: { ...board[0], hand: [{ card: "BT27-075", as: "proto" }] } },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 5;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("proto").instanceId })).toEqual({ ok: true });
    await settle(() => isOnBattleArea(s, "BT27-075") && !s.state.pendingDecision);

    expect(s.state.memory).toBe(2);
    expect([...s.state.players[0]!.trash, ...s.state.players[1]!.trash].map((card) => card.instanceId)).not.toContain(
      s.inst("fodder").instanceId,
    );
  });
});

describe("ProtoGizmon static restrictions", () => {
  it("has Blocker and cannot digivolve, unlike a vanilla purple level 3", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT27-075", as: "proto" },
            { card: "ST6-02", as: "control" },
          ],
          hand: [
            { card: "ST6-07", as: "onProto" },
            { card: "ST6-07", as: "onControl" },
          ],
          deck: ["BT1-009", "BT1-009"],
        },
      },
      { autoDeclineOptional: true },
    );
    await s.ready();
    s.state.memory = 10;

    expect(observe(s.engine).hasKeyword(s.perm("proto"), "Blocker")).toBe(true);
    expect(observe(s.engine).isRestricted(s.perm("proto"), "digivolve")).toBe(true);
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("proto").permanentId,
        instanceId: s.inst("onProto").instanceId,
      }).ok,
    ).toBe(false);
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("control").permanentId,
        instanceId: s.inst("onControl").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("control").topCard.cardId === "ST6-07" && !s.state.pendingDecision);

    expect(s.perm("proto").topCard.cardId).toBe("BT27-075");
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("onProto").instanceId);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).not.toContain(s.inst("onControl").instanceId);
  });
});

describe("ProtoGizmon deletion recursion", () => {
  it("returns two Gizmon cards in the chosen order before playing Gizmon: AT from the trash", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-075", as: "proto" }],
          deck: ["BT1-009"],
          trash: [
            { card: "BT27-076", as: "at" },
            { card: "BT13-086", as: "otherGizmon" },
            { card: "BT1-009", as: "neutral" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderCards: false, preferInstanceIds: preferred },
    );
    preferred.push(s.inst("proto").instanceId, s.inst("otherGizmon").instanceId);
    await s.ready();
    s.state.memory = 3;

    const deletion = advance(s.engine).verb.deletePermanent([s.perm("proto").permanentId]);
    await settle(() => s.state.pendingDecision?.kind === "orderCards");
    const requestedOrder = [s.inst("otherGizmon").instanceId, s.inst("proto").instanceId];
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: s.state.pendingDecision!.decisionId,
        response: { kind: "orderCards", order: requestedOrder },
      }),
    ).toEqual({ ok: true });
    await deletion;
    await settle(() => isOnBattleArea(s, "BT27-076") && !s.state.pendingDecision);

    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard.instanceId)).toEqual([
      s.inst("at").instanceId,
    ]);
    expect(s.state.players[0]!.deck.map((card) => card.instanceId).slice(-2)).toEqual(requestedOrder);
    expect(s.state.players[0]!.deck).toHaveLength(3);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toEqual([s.inst("neutral").instanceId]);
    expect(s.state.memory).toBe(3);
  });

  it("pays the return cost but plays nothing when only Gizmon: XT cards remain", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-075", as: "proto" }],
          trash: [
            { card: "BT27-079", as: "xt" },
            { card: "BT13-086", as: "oldXt" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.inst("proto").instanceId, s.inst("oldXt").instanceId);
    await s.ready();

    await advance(s.engine).verb.deletePermanent([s.perm("proto").permanentId]);
    await settle(() => !s.state.pendingDecision);

    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.deck.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining([s.inst("proto").instanceId, s.inst("oldXt").instanceId]),
    );
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toEqual([s.inst("xt").instanceId]);
  });

  it("does not offer the return cost with only one Gizmon card in the trash", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-075", as: "proto" }],
          trash: [
            { card: "BT1-009", as: "neutral" },
            { card: "BT13-103", as: "kurata" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).verb.deletePermanent([s.perm("proto").permanentId]);
    await settle(() => !s.state.pendingDecision);

    expect(s.state.players[0]!.deck).toHaveLength(0);
    expect(s.state.players[0]!.trash).toHaveLength(3);
  });

  it("keeps every card in the trash when the return cost is declined", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-075", as: "proto" }],
          trash: [
            { card: "BT27-076", as: "at" },
            { card: "BT13-086", as: "otherGizmon" },
          ],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).verb.deletePermanent([s.perm("proto").permanentId]);
    await settle(() => !s.state.pendingDecision);

    expect(s.state.players[0]!.deck).toHaveLength(0);
    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.trash).toHaveLength(3);
  });

  it("can pay the return cost and decline the Gizmon: AT play", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-075", as: "proto" }],
          trash: [
            { card: "BT27-076", as: "at" },
            { card: "BT13-086", as: "otherGizmon" },
          ],
        },
      },
      { autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.inst("proto").instanceId, s.inst("otherGizmon").instanceId);
    await s.ready();

    const deletion = advance(s.engine).verb.deletePermanent([s.perm("proto").permanentId]);
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const costDecisionId = s.state.pendingDecision!.decisionId;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: costDecisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await settle(
      () => s.state.pendingDecision?.kind === "optional" && s.state.pendingDecision.decisionId !== costDecisionId,
    );
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: s.state.pendingDecision!.decisionId,
        response: { kind: "optional", accept: false },
      }),
    ).toEqual({ ok: true });
    await deletion;
    await settle(() => !s.state.pendingDecision);

    expect(s.state.players[0]!.deck).toHaveLength(2);
    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toEqual([s.inst("at").instanceId]);
  });
});
