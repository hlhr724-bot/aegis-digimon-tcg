import { getCardDefinition } from "@aegis/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerIrCard } from "../../engine/effects/interpreter.js";
import { unregisterIrCard } from "#api/engine/effects/interpreter/registration/unregisterIrCard";
import { advance } from "../../engine/testkit/advance.js";
import { observe } from "../../engine/testkit/observe.js";
import { setupEngine, settle, type BoardSpec } from "../../engine/testkit/harness.js";
import { syntheticDefinitions } from "../../engine/testkit/syntheticDefinitions.js";
import { compiled } from "./BT27-102.js";
import "../index.js";

const CARD_ID = "BT27-102";
const BIO_HYBRID = "TEST-BT27-102-BIO-HYBRID";
const KURATA_TAMER = "BT27-098";
const DATA_SQUAD_TAMER = "BT27-093";
const PURPLE_SOURCE = "BT27-075";

const registerBioHybrid = () => {
  syntheticDefinitions.set(BIO_HYBRID, {
    ...getCardDefinition("BT27-079")!,
    cardId: BIO_HYBRID,
    nameEn: "Bio Hybrid Fixture",
    imageId: BIO_HYBRID,
  });
  registerIrCard(BIO_HYBRID, {
    effects: [],
    digivolutionRequirement: [{ traits: ["Kurata's Army"], baseIsTamer: true, cost: 3, isAlternate: true }],
    coverage: "full",
    residual: [],
  });
};

const battleAreaIds = (s: ReturnType<typeof setupEngine>, seat: 0 | 1) =>
  s.state.players[seat]!.battleArea.map((permanent) => permanent.topCard.instanceId);
const trashIds = (s: ReturnType<typeof setupEngine>, seat: 0 | 1) =>
  s.state.players[seat]!.trash.map((card) => card.instanceId);
const handIds = (s: ReturnType<typeof setupEngine>, seat: 0 | 1) =>
  s.state.players[seat]!.hand.map((card) => card.instanceId);

describe("BT27-102 Bio Hybrid Digivolution", () => {
  it("preserves the printed card and complete compiled coverage", () => {
    expect(getCardDefinition(CARD_ID)).toMatchObject({
      nameEn: "Bio Hybrid Digivolution",
      nameJp: "ハイパーバイオエボリューション",
      colors: ["Purple"],
      kinds: ["Option"],
      playCost: 3,
      types: ["Kurata's Army"],
    });
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual).toEqual([]);
    const allTurns = compiled.effects?.find((effect) => effect.trigger === "AllTurns");
    expect(allTurns?.keywords).toEqual([{ keyword: "Delay", raw: "＜Delay＞" }]);
    expect(allTurns?.actions?.[0]).toMatchObject({
      kind: "SubTrigger",
      event: "onDeletionOf",
      sourceFilter: { controller: "any", kind: ["Digimon"] },
      actions: [{ kind: "Digivolve", from: ["hand", "trash"], payCost: false, optional: true }],
    });
  });

  it.each(["hand", "trash"] as const)(
    "plays a Kurata's Army Tamer from the %s for free, then places itself in the battle area",
    async (zone) => {
      const board = {
        0: {
          battleArea: [{ card: PURPLE_SOURCE, as: "source" }],
          hand: [{ card: CARD_ID, as: "option" }, ...(zone === "hand" ? [{ card: KURATA_TAMER, as: "tamer" }] : [])],
          ...(zone === "trash" ? { trash: [{ card: KURATA_TAMER, as: "tamer" }] } : {}),
        },
      } as BoardSpec;
      const s = setupEngine(board, { autoAcceptOptional: true, autoSelectCards: true });
      s.state.memory = 3;
      await s.ready();
      const optionId = s.inst("option").instanceId;

      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: optionId })).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision === undefined && battleAreaIds(s, 0).includes(optionId));

      expect(battleAreaIds(s, 0)).toEqual(expect.arrayContaining([optionId, s.inst("tamer").instanceId]));
      expect(s.state.memory).toBe(0);
    },
  );

  it("still places itself after declining the Tamer play", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: PURPLE_SOURCE, as: "source" }],
          hand: [
            { card: CARD_ID, as: "option" },
            { card: KURATA_TAMER, as: "tamer" },
          ],
        },
      },
      { autoDeclineOptional: true },
    );
    s.state.memory = 3;
    await s.ready();
    const optionId = s.inst("option").instanceId;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: optionId })).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined && battleAreaIds(s, 0).includes(optionId));

    expect(handIds(s, 0)).toContain(s.inst("tamer").instanceId);
    expect(battleAreaIds(s, 0)).not.toContain(s.inst("tamer").instanceId);
  });

  it("does not play a Tamer without the Kurata's Army trait", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: PURPLE_SOURCE, as: "source" }],
          hand: [
            { card: CARD_ID, as: "option" },
            { card: DATA_SQUAD_TAMER, as: "otherTamer" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 3;
    await s.ready();
    const optionId = s.inst("option").instanceId;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: optionId })).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined && battleAreaIds(s, 0).includes(optionId));

    expect(handIds(s, 0)).toContain(s.inst("otherTamer").instanceId);
  });
});

describe("BT27-102 Bio Hybrid Digivolution — Delay digivolution", () => {
  beforeEach(registerBioHybrid);
  afterEach(() => {
    for (const id of syntheticDefinitions.keys()) unregisterIrCard(id);
    syntheticDefinitions.clear();
  });

  const delayBoard = (zone: "hand" | "trash", evolution: string) =>
    setupEngine(
      {
        0: {
          battleArea: [
            { card: CARD_ID, as: "option" },
            { card: KURATA_TAMER, as: "tamer" },
            { card: "BT1-009", as: "ownDigimon" },
          ],
          [zone]: [{ card: evolution, as: "evolution" }],
          deck: ["BT1-009", "BT1-010", "BT1-011"],
        },
        1: { battleArea: [{ card: "BT1-009", as: "opponentDigimon" }], deck: ["BT1-009", "BT1-010"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );

  it.each([
    ["the opponent's Digimon is deleted, from the hand", "opponentDigimon", "hand"],
    ["your own Digimon is deleted, from the trash", "ownDigimon", "trash"],
  ] as const)("trashes itself and digivolves a Tamer for free when %s", async (_label, deleted, zone) => {
    const s = delayBoard(zone, BIO_HYBRID);
    s.state.memory = 4;
    await s.ready();
    const optionId = s.inst("option").instanceId;
    const tamerId = s.inst("tamer").instanceId;

    await advance(s.engine).verb.deletePermanent([s.perm(deleted).permanentId]);
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.perm("tamer").topCard.instanceId).toBe(s.inst("evolution").instanceId);
    expect(s.perm("tamer").stack.map((card) => card.instanceId)).toEqual([tamerId]);
    expect(trashIds(s, 0)).toContain(optionId);
    expect(battleAreaIds(s, 0)).not.toContain(optionId);
    expect(s.state.memory).toBe(4);
  });

  it("can't digivolve a Tamer into a real Gizmon, which has no digivolution requirement", async () => {
    const s = delayBoard("hand", "BT27-079");
    s.state.memory = 4;
    await s.ready();
    const tamerId = s.inst("tamer").instanceId;

    await advance(s.engine).verb.deletePermanent([s.perm("opponentDigimon").permanentId]);
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.perm("tamer").topCard.instanceId).toBe(tamerId);
    expect(handIds(s, 0)).toContain(s.inst("evolution").instanceId);
  });

  it("does not activate Delay on the turn it was placed", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: PURPLE_SOURCE, as: "source" },
            { card: KURATA_TAMER, as: "tamer" },
          ],
          hand: [
            { card: CARD_ID, as: "option" },
            { card: BIO_HYBRID, as: "evolution" },
          ],
          deck: ["BT1-009", "BT1-010"],
        },
        1: { battleArea: [{ card: "BT1-009", as: "opponentDigimon" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 5;
    await s.ready();
    const optionId = s.inst("option").instanceId;
    const tamerId = s.inst("tamer").instanceId;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: optionId })).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined && battleAreaIds(s, 0).includes(optionId));
    await advance(s.engine).verb.deletePermanent([s.perm("opponentDigimon").permanentId]);
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.perm("tamer").topCard.instanceId).toBe(tamerId);
    expect(battleAreaIds(s, 0)).toContain(optionId);
    expect(handIds(s, 0)).toContain(s.inst("evolution").instanceId);
  });
});

describe("BT27-102 Bio Hybrid Digivolution — Security", () => {
  const securityBoard = (candidate: string, zone: "hand" | "trash", decline = false) =>
    setupEngine(
      {
        0: {
          security: [{ card: CARD_ID, as: "option" }],
          [zone]: [{ card: candidate, as: "candidate" }],
        },
        1: { battleArea: [{ card: "BT1-009", as: "attacker" }] },
      },
      decline ? { autoDeclineOptional: true } : { autoAcceptOptional: true, autoSelectCards: true },
    );

  const checkSecurity = async (s: ReturnType<typeof setupEngine>) => {
    s.state.turnSeat = 1;
    s.state.memory = 3;
    await s.ready();
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "securityChecked") && !observe(s.engine).isAttacking());
  };

  it.each([
    ["plays a cost-4 Kurata's Army Tamer from the hand", KURATA_TAMER, "hand", true],
    ["plays a cost-3 Kurata's Army Digimon from the trash", PURPLE_SOURCE, "trash", true],
    ["rejects a cost-6 Kurata's Army Digimon", "BT27-076", "hand", false],
    ["rejects a cost-4 Tamer without the trait", DATA_SQUAD_TAMER, "hand", false],
  ] as const)("%s without paying the cost", async (_label, candidate, zone, played) => {
    const s = securityBoard(candidate, zone);
    await checkSecurity(s);

    expect(battleAreaIds(s, 0).includes(s.inst("candidate").instanceId)).toBe(played);
    expect(s.state.memory).toBe(3);
  });

  it("lets the owner decline the Security play", async () => {
    const s = securityBoard(KURATA_TAMER, "trash", true);
    await checkSecurity(s);

    expect(trashIds(s, 0)).toContain(s.inst("candidate").instanceId);
    expect(battleAreaIds(s, 0)).not.toContain(s.inst("candidate").instanceId);
  });
});
