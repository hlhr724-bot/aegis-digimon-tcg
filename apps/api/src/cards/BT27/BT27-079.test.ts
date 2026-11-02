import { requireCardDefinition } from "@aegis/shared/cards/registry";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { advance } from "#api/engine/testkit/advance";
import { setupEngine, settle, type BoardSpec } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";
import { syntheticDefinitions } from "#api/engine/testkit/syntheticDefinitions";
import "#api/cards/BT27/BT27-075";
import "#api/cards/BT27/BT27-076";
import "#api/cards/BT27/BT27-079";

const armyTamerCost5 = "TEST-BT27-079-ARMY-TAMER-5";
const armyTamerCost6 = "TEST-BT27-079-ARMY-TAMER-6";
const armyOptionCost1 = "TEST-BT27-079-ARMY-OPTION-1";

type PoolPick = "tamerInHand" | "proto";

function isOnBattleArea(s: ReturnType<typeof setupEngine>, cardId: string): boolean {
  return s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === cardId);
}

describe("Gizmon: XT level 4 discount", () => {
  it("costs 3 after deleting one of your level 4 Digimon", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT27-079", as: "xt" }],
          battleArea: [
            { card: "BT1-014", as: "champion" },
            { card: "BT1-009", as: "rookie" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("champion").permanentId, s.inst("champion").instanceId);
    await s.ready();
    s.state.memory = 10;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("xt").instanceId })).toEqual({ ok: true });
    await settle(() => isOnBattleArea(s, "BT27-079") && !s.state.pendingDecision);

    expect(s.state.memory).toBe(7);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toEqual([s.inst("champion").instanceId]);
    expect(isOnBattleArea(s, "BT1-009")).toBe(true);
  });

  it("pays the full 9 when the discount is declined", async () => {
    const s = setupEngine(
      { 0: { hand: [{ card: "BT27-079", as: "xt" }], battleArea: [{ card: "BT1-014", as: "champion" }] } },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 10;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("xt").instanceId })).toEqual({ ok: true });
    await settle(() => isOnBattleArea(s, "BT27-079") && !s.state.pendingDecision);

    expect(s.state.memory).toBe(1);
    expect(isOnBattleArea(s, "BT1-014")).toBe(true);
  });

  it.each<[string, BoardSpec]>([
    ["your level 3 Digimon", { 0: { battleArea: [{ card: "BT1-009", as: "fodder" }] } }],
    ["your level 5 Digimon", { 0: { battleArea: [{ card: "BT1-020", as: "fodder" }] } }],
    ["an opponent's level 4 Digimon", { 1: { battleArea: [{ card: "BT1-014", as: "fodder" }] } }],
  ])("cannot delete %s for the discount", async (_label, board) => {
    const s = setupEngine(
      { ...board, 0: { ...board[0], hand: [{ card: "BT27-079", as: "xt" }] } },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 10;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("xt").instanceId })).toEqual({ ok: true });
    await settle(() => isOnBattleArea(s, "BT27-079") && !s.state.pendingDecision);

    expect(s.state.memory).toBe(1);
    expect([...s.state.players[0]!.trash, ...s.state.players[1]!.trash].map((card) => card.instanceId)).not.toContain(
      s.inst("fodder").instanceId,
    );
  });
});

describe("Gizmon: XT keywords and restriction", () => {
  it("has Blocker and Retaliation and cannot digivolve", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT27-079", as: "xt" }], hand: [{ card: "ST6-12", as: "mega" }] },
    });
    await s.ready();
    s.state.memory = 10;

    expect(observe(s.engine).hasKeyword(s.perm("xt"), "Blocker")).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("xt"), "Retaliation")).toBe(true);
    expect(observe(s.engine).isRestricted(s.perm("xt"), "digivolve")).toBe(true);
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("xt").permanentId,
        instanceId: s.inst("mega").instanceId,
      }).ok,
    ).toBe(false);
    expect(s.perm("xt").topCard.cardId).toBe("BT27-079");
  });

  it("deletes the Digimon that defeats it in battle through Retaliation", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT27-079", as: "xt" }], deck: ["BT1-009", "BT1-009"] },
        1: { battleArea: [{ card: "BT1-009", as: "defender", dp: 12000, suspended: true }] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("xt").permanentId,
        target: { kind: "permanent", permanentId: s.perm("defender").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 0 && !s.state.pendingDecision);

    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toEqual([s.inst("defender").instanceId]);
  });
});

describe("Gizmon: XT deletion recruits Kurata's Army", () => {
  beforeAll(() => {
    const tamer = requireCardDefinition("BT13-103");
    const option = requireCardDefinition("ST6-15");
    syntheticDefinitions.set(armyTamerCost5, {
      ...tamer,
      cardId: armyTamerCost5,
      nameEn: "Kurata's Army Tamer Five",
      types: ["Kurata's Army"],
      playCost: 5,
      effectText: undefined,
      securityEffectText: undefined,
    });
    syntheticDefinitions.set(armyTamerCost6, {
      ...tamer,
      cardId: armyTamerCost6,
      nameEn: "Kurata's Army Tamer Six",
      types: ["Kurata's Army"],
      playCost: 6,
      effectText: undefined,
      securityEffectText: undefined,
    });
    syntheticDefinitions.set(armyOptionCost1, {
      ...option,
      cardId: armyOptionCost1,
      nameEn: "Kurata's Army Option",
      types: ["Kurata's Army"],
      playCost: 1,
    });
  });

  afterAll(() => {
    syntheticDefinitions.delete(armyTamerCost5);
    syntheticDefinitions.delete(armyTamerCost6);
    syntheticDefinitions.delete(armyOptionCost1);
  });

  function setupMixedPool(preferredAlias: PoolPick, accept: boolean) {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-079", as: "xt" }],
          hand: [
            { card: armyTamerCost5, as: "tamerInHand" },
            { card: "BT13-080", as: "unknownProto" },
            { card: "BT27-076", as: "atInHand" },
          ],
          trash: [
            { card: "BT27-075", as: "proto" },
            { card: armyTamerCost6, as: "tamerTooExpensive" },
            { card: armyOptionCost1, as: "option" },
            { card: "BT13-103", as: "kurata" },
          ],
        },
      },
      { autoAcceptOptional: accept, autoDeclineOptional: !accept, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.inst(preferredAlias).instanceId);
    return s;
  }

  it.each<[string, PoolPick, string]>([
    ["a cost 5 Kurata's Army Tamer from hand", "tamerInHand", armyTamerCost5],
    ["a Kurata's Army ProtoGizmon from trash", "proto", "BT27-075"],
  ])("offers only the qualifying cards and plays %s for free", async (_label, alias, cardId) => {
    const s = setupMixedPool(alias, true);
    await s.ready();
    s.state.memory = 3;

    await advance(s.engine).verb.deletePermanent([s.perm("xt").permanentId]);
    await settle(() => isOnBattleArea(s, cardId) && !s.state.pendingDecision);

    const selection = s.decisions.find(
      ({ req }) =>
        req.kind === "selectCards" && req.options?.candidateInstanceIds?.includes(s.inst("proto").instanceId),
    );
    expect([...(selection?.req.options?.candidateInstanceIds ?? [])].sort()).toEqual(
      [s.inst("tamerInHand").instanceId, s.inst("proto").instanceId].sort(),
    );
    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard.instanceId)).toEqual([
      s.inst(alias).instanceId,
    ]);
    expect(s.state.memory).toBe(3);
  });

  it("can decline the play", async () => {
    const s = setupMixedPool("proto", false);
    await s.ready();

    await advance(s.engine).verb.deletePermanent([s.perm("xt").permanentId]);
    await settle(() => !s.state.pendingDecision);

    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.hand).toHaveLength(3);
    expect(s.state.players[0]!.trash).toHaveLength(5);
  });
});
