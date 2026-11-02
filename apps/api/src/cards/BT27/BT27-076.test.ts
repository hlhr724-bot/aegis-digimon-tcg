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

describe("Gizmon: AT level 3 discount", () => {
  it("costs 2 after deleting one of your level 3 Digimon", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT27-076", as: "at" }],
          battleArea: [
            { card: "BT1-009", as: "rookie" },
            { card: "BT1-014", as: "champion" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("rookie").permanentId, s.inst("rookie").instanceId);
    await s.ready();
    s.state.memory = 10;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("at").instanceId })).toEqual({ ok: true });
    await settle(() => isOnBattleArea(s, "BT27-076") && !s.state.pendingDecision);

    expect(s.state.memory).toBe(8);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toEqual([s.inst("rookie").instanceId]);
    expect(isOnBattleArea(s, "BT1-014")).toBe(true);
  });

  it("pays the full 6 when the discount is declined", async () => {
    const s = setupEngine(
      { 0: { hand: [{ card: "BT27-076", as: "at" }], battleArea: [{ card: "BT1-009", as: "rookie" }] } },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 10;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("at").instanceId })).toEqual({ ok: true });
    await settle(() => isOnBattleArea(s, "BT27-076") && !s.state.pendingDecision);

    expect(s.state.memory).toBe(4);
    expect(isOnBattleArea(s, "BT1-009")).toBe(true);
  });

  it.each<[string, BoardSpec]>([
    ["your level 4 Digimon", { 0: { battleArea: [{ card: "BT1-014", as: "fodder" }] } }],
    ["your level 3 Digimon in the breeding area", { 0: { breeding: { card: "BT1-009", as: "fodder" } } }],
    ["an opponent's level 3 Digimon", { 1: { battleArea: [{ card: "BT1-009", as: "fodder" }] } }],
  ])("cannot delete %s for the discount", async (_label, board) => {
    const s = setupEngine(
      { ...board, 0: { ...board[0], hand: [{ card: "BT27-076", as: "at" }] } },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 10;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("at").instanceId })).toEqual({ ok: true });
    await settle(() => isOnBattleArea(s, "BT27-076") && !s.state.pendingDecision);

    expect(s.state.memory).toBe(4);
    expect([...s.state.players[0]!.trash, ...s.state.players[1]!.trash].map((card) => card.instanceId)).not.toContain(
      s.inst("fodder").instanceId,
    );
  });
});

describe("Gizmon: AT Kurata recruitment", () => {
  it.each(["BT13-103", "EX10-066"])("may play Akihiro Kurata %s from hand for free", async (kurata) => {
    const s = setupEngine(
      { 0: { hand: [{ card: "BT27-076", as: "at" }, { card: kurata, as: "kurata" }, "BT1-085"] } },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 10;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("at").instanceId })).toEqual({ ok: true });
    await settle(() => isOnBattleArea(s, kurata) && !s.state.pendingDecision);

    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard.cardId)).toEqual(["BT27-076", kurata]);
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toEqual(["BT1-085"]);
    expect(s.state.memory).toBe(4);
  });

  it("can decline the Kurata play", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: "BT27-076", as: "at" },
            { card: "BT13-103", as: "kurata" },
          ],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 10;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("at").instanceId })).toEqual({ ok: true });
    await settle(() => isOnBattleArea(s, "BT27-076") && !s.state.pendingDecision);

    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([s.inst("kurata").instanceId]);
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
  });

  it("does not play Akihiro Kurata from the trash", async () => {
    const s = setupEngine(
      { 0: { hand: [{ card: "BT27-076", as: "at" }], trash: [{ card: "BT13-103", as: "kurata" }] } },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 10;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("at").instanceId })).toEqual({ ok: true });
    await settle(() => isOnBattleArea(s, "BT27-076") && !s.state.pendingDecision);

    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toEqual([s.inst("kurata").instanceId]);
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
  });
});

describe("Gizmon: AT static restriction", () => {
  it("cannot digivolve, unlike a vanilla purple level 4", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT27-076", as: "at" },
            { card: "ST6-07", as: "control" },
          ],
          hand: [
            { card: "ST6-09", as: "onAt" },
            { card: "ST6-09", as: "onControl" },
          ],
          deck: ["BT1-009", "BT1-009"],
        },
      },
      { autoDeclineOptional: true },
    );
    await s.ready();
    s.state.memory = 10;

    expect(observe(s.engine).isRestricted(s.perm("at"), "digivolve")).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("at"), "Blocker")).toBe(false);
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("at").permanentId,
        instanceId: s.inst("onAt").instanceId,
      }).ok,
    ).toBe(false);
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("control").permanentId,
        instanceId: s.inst("onControl").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("control").topCard.cardId === "ST6-09" && !s.state.pendingDecision);

    expect(s.perm("at").topCard.cardId).toBe("BT27-076");
  });
});

describe("Gizmon: AT deletion recursion", () => {
  it("returns two Gizmon cards before playing Gizmon: XT from the trash", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-076", as: "at" }],
          deck: ["BT1-009"],
          trash: [
            { card: "BT27-079", as: "xt" },
            { card: "BT27-075", as: "proto" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.inst("at").instanceId, s.inst("proto").instanceId);
    await s.ready();
    s.state.memory = 3;

    await advance(s.engine).verb.deletePermanent([s.perm("at").permanentId]);
    await settle(() => isOnBattleArea(s, "BT27-079") && !s.state.pendingDecision);

    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard.instanceId)).toEqual([
      s.inst("xt").instanceId,
    ]);
    expect(s.state.players[0]!.deck.slice(-2).map((card) => card.instanceId)).toEqual(
      expect.arrayContaining([s.inst("at").instanceId, s.inst("proto").instanceId]),
    );
    expect(s.state.players[0]!.trash).toHaveLength(0);
    expect(s.state.memory).toBe(3);
  });

  it("pays the return cost but plays nothing when only Gizmon: AT cards remain", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-076", as: "at" }],
          trash: [
            { card: "BT13-083", as: "oldAt" },
            { card: "BT27-075", as: "proto" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.inst("at").instanceId, s.inst("proto").instanceId);
    await s.ready();

    await advance(s.engine).verb.deletePermanent([s.perm("at").permanentId]);
    await settle(() => !s.state.pendingDecision);

    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.deck).toHaveLength(2);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toEqual([s.inst("oldAt").instanceId]);
  });

  it("does not offer the return cost with only one Gizmon card in the trash", async () => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: "BT27-076", as: "at" }], trash: [{ card: "BT1-009", as: "neutral" }] } },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).verb.deletePermanent([s.perm("at").permanentId]);
    await settle(() => !s.state.pendingDecision);

    expect(s.state.players[0]!.deck).toHaveLength(0);
    expect(s.state.players[0]!.trash).toHaveLength(2);
  });

  it("keeps every card in the trash when the return cost is declined", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-076", as: "at" }],
          trash: [
            { card: "BT27-079", as: "xt" },
            { card: "BT27-075", as: "proto" },
          ],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).verb.deletePermanent([s.perm("at").permanentId]);
    await settle(() => !s.state.pendingDecision);

    expect(s.state.players[0]!.deck).toHaveLength(0);
    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.trash).toHaveLength(3);
  });

  it("can pay the return cost and decline the Gizmon: XT play", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-076", as: "at" }],
          trash: [
            { card: "BT27-079", as: "xt" },
            { card: "BT27-075", as: "proto" },
          ],
        },
      },
      { autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.inst("at").instanceId, s.inst("proto").instanceId);
    await s.ready();

    const deletion = advance(s.engine).verb.deletePermanent([s.perm("at").permanentId]);
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
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toEqual([s.inst("xt").instanceId]);
  });
});
