import { assemblyRequirementFor, EffectDuration, EffectTiming, getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { assertNoLoudGap, setupEngine, settle, settleAcrossTimers } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import "../index.js";
import { compiled } from "./EX13-062.js";

const CARD_ID = "EX13-062";

const LV5_BLACK_BLOCKER = "BT2-061";
const LV4_BLACK_BLOCKER = "BT2-058";
const LV3_BLACK_BLOCKER = "BT2-054";
const LV4_BLACK_NO_BLOCKER = "BT3-067";
const LV4_GREEN_BLOCKER = "BT1-072";
const BLACK_LV5 = "BT2-060";
const RED_LV5 = "BT1-024";
const COST2 = "BT1-009";
const COST3 = "BT1-013";
const COST4 = "BT4-065";
const FILLER = "BT1-009";
const DECK = Array(20).fill(FILLER) as string[];

async function openOpponentMain(s: ReturnType<typeof setupEngine>): Promise<void> {
  advance(s.engine).endMainPhaseIfOpen(0);
  await advance(s.engine).waitForMainPhase(1);
}

async function openOwnMain(s: ReturnType<typeof setupEngine>): Promise<void> {
  advance(s.engine).endMainPhaseIfOpen(1);
  await advance(s.engine).waitForMainPhase(0);
}

describe("EX13-062 Craniamon", () => {
  it.each(["LM-067", "BT27-035"])("ignores %s use cost when deleting the lowest play cost", async (cardId) => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: CARD_ID, as: "craniamon" }] },
        1: { battleArea: [{ card: cardId, as: "gundramon", under: ["BT25-082"] }], security: 3 },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("craniamon").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await advance(s.engine).finishAttack();
    await settle();
    expect(s.state.players[1]!.battleArea.map((permanent) => permanent.topCard.cardId)).toEqual([cardId]);
  });

  it("matches the catalog identity and every printed clause", () => {
    expect(getCardDefinition(CARD_ID)).toMatchObject({
      cardId: CARD_ID,
      nameEn: "Craniamon",
      colors: ["Black"],
      kinds: ["Digimon"],
      level: 6,
      playCost: 12,
      dp: 12_000,
      forms: ["Mega"],
      attributes: ["Vaccine"],
      types: ["Holy Warrior", "Royal Knight"],
      evoCosts: [{ color: "Black", level: 5, memoryCost: 3 }],
      rarity: "SR",
      maxCountInDeck: 4,
    });
    const text = getCardDefinition(CARD_ID)?.effectText ?? "";
    expect(text).toContain("[Assembly -5] Lv.5 × Lv.4 × Lv.3, all Black w/＜Blocker＞");
    expect(text).toContain("＜Reboot＞");
    expect(text).toContain("＜Blocker＞");
    expect(text).toContain(
      "[On Play] [When Digivolving] Your opponent's effects don't affect this Digimon until their turn ends.",
    );
    expect(text).toContain(
      "[All Turns] [Once Per Turn] When this Digimon suspends, you may delete all of your opponent's Digimon with the lowest play cost.",
    );
    expect(text).toContain("[All Turns] When this Digimon unsuspends, it gets +3000 DP until your turn ends.");
    expect((getCardDefinition(CARD_ID)?.inheritedEffectText ?? "").trim()).toBe("");
    expect((getCardDefinition(CARD_ID)?.securityEffectText ?? "").trim()).toBe("");
  });

  it("compiles the keyword pair, both immunity windows, both watchers and the Assembly header", () => {
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual).toEqual([]);
    expect(compiled.effects).toHaveLength(5);

    expect(compiled.effects[0]).toMatchObject({
      trigger: "Static",
      actions: [],
      keywords: [{ keyword: "Reboot" }, { keyword: "Blocker" }],
    });

    for (const [index, trigger] of (["OnPlay", "WhenDigivolving"] as const).entries()) {
      expect(compiled.effects[index + 1]).toMatchObject({
        trigger,
        actions: [
          {
            kind: "GrantImmunity",
            target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
            immuneFrom: "opponentEffects",
            duration: "untilOpponentTurnEnd",
          },
        ],
      });
      expect(compiled.effects[index + 1]?.frequency).toBeUndefined();
      expect(compiled.effects[index + 1]?.sharedUseKey).toBeUndefined();
    }

    expect(compiled.effects[3]).toMatchObject({
      trigger: "AllTurns",
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenSuspended",
          sourceFilter: { isSelfRef: true },
          actions: [
            {
              kind: "Delete",
              optional: true,
              target: {
                count: "all",
                filter: { controller: "opponent", kind: ["Digimon"], superlative: "lowestPlayCost" },
              },
            },
          ],
        },
      ],
    });

    expect(compiled.effects[4]).toMatchObject({
      trigger: "AllTurns",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenUnsuspended",
          sourceFilter: { isSelfRef: true },
          actions: [
            {
              kind: "ModifyDP",
              target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
              amount: 3000,
              duration: "untilYourTurnEnd",
            },
          ],
        },
      ],
    });
    expect(compiled.effects[4]?.frequency).toBeUndefined();

    const assembly = [
      {
        reduceCost: 5,
        materials: [
          { count: 1, level: 5, colors: ["Black"], printedKeywords: ["Blocker"] },
          { count: 1, level: 4, colors: ["Black"], printedKeywords: ["Blocker"] },
          { count: 1, level: 3, colors: ["Black"], printedKeywords: ["Blocker"] },
        ],
      },
    ];
    expect(compiled.assemblyRequirement).toEqual(assembly);
    expect(assemblyRequirementFor(CARD_ID)).toEqual(assembly);
    expect(compiled.digivolutionRequirement).toBeUndefined();
  });

  it("grants both printed keywords through the continuous ledger", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: CARD_ID, as: "craniamon" }], deck: DECK } });
    await s.ready();

    expect(observe(s.engine).hasKeyword(s.perm("craniamon"), "Reboot")).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("craniamon"), "Blocker")).toBe(true);
    expect(s.perm("craniamon").currentDP).toBe(12_000);
  });

  it("Q7407: an opponent Digimon effect can select Craniamon after it gains immunity, but doesn't affect it", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: CARD_ID, as: "craniamon" }],
          deck: DECK,
          security: [FILLER],
        },
        1: {
          hand: [{ card: "BT20-033", as: "loader" }],
          deck: DECK,
          security: [FILLER],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 0;
    s.state.memory = 12;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("craniamon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision === undefined);
    expect(observe(s.engine).isRestrictedByEffect(s.perm("craniamon"), "beAffected", "Digimon")).toBe(true);

    s.state.turnSeat = 1;
    s.state.memory = 10;
    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("loader").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.perm("craniamon").currentDP).toBe(12_000);
    expect(observe(s.engine).isRestrictedByEffect(s.perm("craniamon"), "beAffected", "Digimon")).toBe(true);
  });

  it.each([LV5_BLACK_BLOCKER, "BT23-056"])(
    "Discord 1556898336567459890: plays by Assembly with %s for 5 less, stacking the leftmost slot closest to the top",
    async (lv5) => {
      const s = setupEngine(
        {
          0: {
            hand: [
              { card: CARD_ID, as: "craniamon" },
              { card: FILLER, as: "spare" },
            ],
            trash: [
              { card: lv5, as: "lv5" },
              { card: LV4_BLACK_BLOCKER, as: "lv4" },
              { card: LV3_BLACK_BLOCKER, as: "lv3" },
            ],
            deck: DECK,
            security: [FILLER],
          },
          1: { deck: DECK, security: [FILLER, FILLER] },
        },
        { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
      );
      s.state.memory = 8;
      await s.ready();

      expect(
        s.engine.applyIntent(0, {
          type: "playCard",
          instanceId: s.inst("craniamon").instanceId,
          assembly: {
            materialInstanceIds: [s.inst("lv5").instanceId, s.inst("lv4").instanceId, s.inst("lv3").instanceId],
          },
        } as never),
      ).toEqual({ ok: true });
      await settle(() => s.state.players[0]!.battleArea.some(({ topCard }) => topCard?.cardId === CARD_ID));
      await settle(() => s.state.pendingDecision === undefined);

      expect(s.state.memory).toBe(1);
      const played = s.state.players[0]!.battleArea.find(({ topCard }) => topCard?.cardId === CARD_ID)!;
      expect(played.stack.map(({ instanceId }) => instanceId)).toEqual([
        s.inst("lv3").instanceId,
        s.inst("lv4").instanceId,
        s.inst("lv5").instanceId,
      ]);
      expect(played.currentDP).toBe(12_000);
      expect(s.state.players[0]!.trash).toHaveLength(0);
      expect(s.state.pendingDecision).toBeUndefined();
    },
  );

  it("refuses Assembly declarations failing either printed predicate, the level order, the count or the zone", async () => {
    const cases: { label: string; trash: string[] }[] = [
      { label: "Lv.4 without ＜Blocker＞", trash: [LV5_BLACK_BLOCKER, LV4_BLACK_NO_BLOCKER, LV3_BLACK_BLOCKER] },
      { label: "green Lv.4 with ＜Blocker＞", trash: [LV5_BLACK_BLOCKER, LV4_GREEN_BLOCKER, LV3_BLACK_BLOCKER] },
      { label: "duplicate level", trash: [LV5_BLACK_BLOCKER, LV3_BLACK_BLOCKER, LV3_BLACK_BLOCKER] },
      { label: "partial count", trash: [LV5_BLACK_BLOCKER, LV4_BLACK_BLOCKER] },
    ];
    for (const { label, trash } of cases) {
      const s = setupEngine({
        0: {
          hand: [{ card: CARD_ID, as: "craniamon" }],
          trash: trash.map((card, index) => ({ card, as: `m${index}` })),
          deck: DECK,
        },
      });
      s.state.memory = 10;
      await s.ready();
      expect(
        s.engine.applyIntent(0, {
          type: "playCard",
          instanceId: s.inst("craniamon").instanceId,
          assembly: { materialInstanceIds: trash.map((_card, index) => s.inst(`m${index}`).instanceId) },
        } as never),
        `${label}`,
      ).toEqual({ ok: false, reason: "invalid-material" });
      expect(s.state.memory, `${label}`).toBe(10);
      expect(s.state.players[0]!.trash, `${label}`).toHaveLength(trash.length);
      expect(s.state.players[0]!.battleArea, `${label}`).toHaveLength(0);
    }

    const fromHand = setupEngine({
      0: {
        hand: [
          { card: CARD_ID, as: "craniamon" },
          { card: LV5_BLACK_BLOCKER, as: "lv5" },
          { card: LV4_BLACK_BLOCKER, as: "lv4" },
          { card: LV3_BLACK_BLOCKER, as: "lv3" },
        ],
        deck: DECK,
      },
    });
    fromHand.state.memory = 10;
    await fromHand.ready();
    expect(
      fromHand.engine.applyIntent(0, {
        type: "playCard",
        instanceId: fromHand.inst("craniamon").instanceId,
        assembly: {
          materialInstanceIds: [
            fromHand.inst("lv5").instanceId,
            fromHand.inst("lv4").instanceId,
            fromHand.inst("lv3").instanceId,
          ],
        },
      } as never),
    ).toEqual({ ok: false, reason: "invalid-material" });
    expect(fromHand.state.players[0]!.hand).toHaveLength(4);
    expect(fromHand.state.memory).toBe(10);
  });

  it("Q7412/Q7413: rejects an Assembly material whose ＜Blocker＞ is inherited only", async () => {
    const s = setupEngine({
      0: {
        hand: [{ card: CARD_ID, as: "craniamon" }],
        trash: [
          { card: LV5_BLACK_BLOCKER, as: "lv5" },
          { card: LV4_BLACK_BLOCKER, as: "lv4" },
          { card: "EX13-050", as: "inheritedOnly" },
        ],
        deck: DECK,
      },
    });
    s.state.memory = 10;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("craniamon").instanceId,
        assembly: {
          materialInstanceIds: [s.inst("lv5").instanceId, s.inst("lv4").instanceId, s.inst("inheritedOnly").instanceId],
        },
      } as never),
    ).toEqual({ ok: false, reason: "invalid-material" });
  });

  it("digivolves from a black Lv.5 for 3, keeping source identity and drawing the bonus card", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: BLACK_LV5, as: "base" }],
          hand: [
            { card: CARD_ID, as: "craniamon" },
            { card: FILLER, as: "spare" },
          ],
          deck: DECK,
          security: [FILLER],
        },
        1: { deck: DECK, security: [FILLER] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 6;
    await s.ready();
    const baseInstanceId = s.perm("base").topCard.instanceId;
    const handBefore = s.state.players[0]!.hand.length;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("craniamon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.instanceId === s.inst("craniamon").instanceId);
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.memory).toBe(3);
    expect(s.perm("base").stack.map(({ instanceId }) => instanceId)).toEqual([baseInstanceId]);
    expect(s.perm("base").currentDP).toBe(12_000);
    expect(s.state.players[0]!.hand).toHaveLength(handBefore);
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).not.toContain(s.inst("craniamon").instanceId);
  });

  it("refuses illegal digivolution sources: a red Lv.5 and a black Lv.4, on either cost preference", async () => {
    for (const base of [RED_LV5, LV4_BLACK_NO_BLOCKER] as const) {
      const s = setupEngine(
        {
          0: {
            battleArea: [{ card: base, as: "base" }],
            hand: [{ card: CARD_ID, as: "craniamon" }],
            deck: DECK,
          },
        },
        { autoDeclineOptional: true, autoSelectCards: true, autoChooseOption: true },
      );
      s.state.memory = 10;
      await s.ready();

      for (const useAlternateCost of [false, true]) {
        expect(
          s.engine.applyIntent(0, {
            type: "digivolve",
            permanentId: s.perm("base").permanentId,
            instanceId: s.inst("craniamon").instanceId,
            ...(useAlternateCost ? { useAlternateCost: true } : {}),
          }).ok,
          `${base} alt=${useAlternateCost}`,
        ).toBe(false);
      }
      expect(s.state.memory, `${base}`).toBe(10);
      expect(s.perm("base").topCard.cardId, `${base}`).toBe(base);
      expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual([s.inst("craniamon").instanceId]);
    }
  });

  it("is untouchable by any opponent effect after [On Play], while an un-triggered copy is deleted", async () => {
    const board = () =>
      setupEngine(
        {
          0: {
            hand: [
              { card: CARD_ID, as: "craniamon" },
              { card: FILLER, as: "spare" },
            ],
            trash: [
              { card: LV5_BLACK_BLOCKER, as: "lv5" },
              { card: LV4_BLACK_BLOCKER, as: "lv4" },
              { card: LV3_BLACK_BLOCKER, as: "lv3" },
            ],
            deck: DECK,
            security: [FILLER],
          },
          1: { deck: DECK, security: [FILLER] },
        },
        { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
      );

    const idle = setupEngine(
      { 0: { battleArea: [{ card: CARD_ID, as: "craniamon" }], deck: DECK }, 1: { deck: DECK } },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    await idle.ready();
    advance(idle.engine).verb.enterEffectResolution(1, ["Digimon"]);
    expect(await advance(idle.engine).verb.deletePermanent([idle.perm("craniamon").permanentId], "byEffect")).toBe(1);
    advance(idle.engine).verb.leaveEffectResolution();
    expect(idle.state.players[0]!.battleArea).toHaveLength(0);

    const s = board();
    s.state.memory = 8;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("craniamon").instanceId,
        assembly: {
          materialInstanceIds: [s.inst("lv5").instanceId, s.inst("lv4").instanceId, s.inst("lv3").instanceId],
        },
      } as never),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some(({ topCard }) => topCard?.cardId === CARD_ID));
    await settle(() => s.state.pendingDecision === undefined);
    const craniamonId = s.state.players[0]!.battleArea.find(({ topCard }) => topCard?.cardId === CARD_ID)!.permanentId;

    advance(s.engine).verb.enterEffectResolution(1, ["Digimon"]);
    expect(await advance(s.engine).verb.deletePermanent([craniamonId], "byEffect")).toBe(0);
    advance(s.engine).verb.leaveEffectResolution();
    expect(s.state.players[0]!.battleArea.map(({ permanentId }) => permanentId)).toEqual([craniamonId]);

    advance(s.engine).verb.enterEffectResolution(1, ["Option"]);
    expect(await advance(s.engine).verb.deletePermanent([craniamonId], "byEffect")).toBe(0);
    advance(s.engine).verb.leaveEffectResolution();
    advance(s.engine).verb.enterEffectResolution(1, ["Tamer"]);
    expect(await advance(s.engine).verb.deletePermanent([craniamonId], "byEffect")).toBe(0);
    advance(s.engine).verb.leaveEffectResolution();

    expect(observe(s.engine).isRestricted(craniamonId, "beAffected")).toBe(true);

    advance(s.engine).verb.enterEffectResolution(0, ["Digimon"]);
    expect(await advance(s.engine).verb.deletePermanent([craniamonId], "byEffect")).toBe(1);
    advance(s.engine).verb.leaveEffectResolution();
    expect(s.state.players[0]!.battleArea).toHaveLength(0);
  });

  it("reaches the same immunity on [When Digivolving], and it lapses once the opponent's turn ends", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: BLACK_LV5, as: "base" }],
          hand: [
            { card: CARD_ID, as: "craniamon" },
            { card: FILLER, as: "spare" },
          ],
          deck: DECK,
          security: [FILLER, FILLER],
        },
        1: { deck: DECK, security: [FILLER, FILLER] },
      },
      { autoDeclineOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 6;
    await s.ready();
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    const craniamonId = s.perm("base").permanentId;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: craniamonId,
        instanceId: s.inst("craniamon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.instanceId === s.inst("craniamon").instanceId);
    await settle(() => s.state.pendingDecision === undefined);

    advance(s.engine).verb.enterEffectResolution(1, ["Digimon"]);
    expect(await advance(s.engine).verb.deletePermanent([craniamonId], "byEffect")).toBe(0);
    advance(s.engine).verb.leaveEffectResolution();
    expect(s.state.players[0]!.battleArea.map(({ permanentId }) => permanentId)).toEqual([craniamonId]);

    await openOpponentMain(s);
    advance(s.engine).verb.enterEffectResolution(1, ["Digimon"]);
    expect(await advance(s.engine).verb.deletePermanent([craniamonId], "byEffect")).toBe(0);
    advance(s.engine).verb.leaveEffectResolution();

    await openOwnMain(s);
    advance(s.engine).verb.enterEffectResolution(1, ["Digimon"]);
    expect(await advance(s.engine).verb.deletePermanent([craniamonId], "byEffect")).toBe(1);
    advance(s.engine).verb.leaveEffectResolution();
    expect(s.state.players[0]!.battleArea).toHaveLength(0);

    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it("Q7408-Q7411: Craniamon accepts a granted trigger while immune, suppresses it on block, then resumes it", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: BLACK_LV5, as: "target", dp: 20_000 }],
          hand: [{ card: CARD_ID, as: "craniamon" }],
          deck: DECK,
          security: [FILLER],
        },
        1: {
          battleArea: [
            { card: "BT19-035", as: "debuffer" },
            { card: "BT14-044", as: "palmon" },
            { card: COST2, as: "attacker", dp: 3_000 },
          ],
          hand: [{ card: "BT10-007", as: "xros" }],
          deck: DECK,
          security: [FILLER],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    await s.ready();
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);
    s.state.memory = 10;
    await advance(s.engine).waitForMainPhase(1);

    // BT19-035's real Digimon trigger applies -3000 DP without a digivolution restriction.
    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("xros").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("target").currentDP === 17_000 && s.state.pendingDecision === undefined);
    expect(s.perm("target").currentDP).toBe(17_000);
    expect(s.state.pendingDecision).toBeUndefined();

    advance(s.engine).endMainPhaseIfOpen(1);
    await advance(s.engine).waitForMainPhase(0);
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("target").permanentId,
        instanceId: s.inst("craniamon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.perm("target").topCard.cardId === CARD_ID &&
        observe(s.engine).isRestrictedByEffect(s.perm("target"), "beAffected", "Digimon") &&
        s.perm("target").currentDP === 12_000 &&
        s.state.pendingDecision === undefined,
    );

    // Craniamon's [When Digivolving] blanket immunity immediately stops the existing DP effect.
    expect(observe(s.engine).isRestrictedByEffect(s.perm("target"), "beAffected", "Option")).toBe(true);
    expect(s.perm("target").currentDP).toBe(12_000);

    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);
    await settle(() => observe(s.engine).customEffectGrants(s.perm("target")).length === 1);
    expect(observe(s.engine).isRestrictedByEffect(s.perm("target"), "beAffected", "Digimon")).toBe(true);

    const memoryWhileImmune = s.state.memory;
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some(({ kind }) => kind === "blockWindowOpened"));
    expect(s.engine.applyIntent(0, { type: "declareBlock", blockerPermanentId: s.perm("target").permanentId })).toEqual(
      { ok: true },
    );
    await settle(() => s.events.some(({ kind }) => kind === "combatResolved") && s.state.pendingDecision === undefined);

    // Craniamon is still selectable as a blocker, but its granted Palmon trigger does not
    // resolve when it suspends while opponent-effect immunity is active.
    expect(s.perm("target").isSuspended).toBe(true);
    expect(s.state.memory).toBe(memoryWhileImmune);
    expect(observe(s.engine).customEffectGrants(s.perm("target"))).toHaveLength(1);

    advance(s.engine).endMainPhaseIfOpen(1);
    await advance(s.engine).waitForMainPhase(0);
    expect(observe(s.engine).isRestrictedByEffect(s.perm("target"), "beAffected", "Digimon")).toBe(false);
    expect(observe(s.engine).customEffectGrants(s.perm("target"))).toHaveLength(1);

    const memoryAfterImmunity = s.state.memory;
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("target").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking() && s.state.pendingDecision === undefined);
    expect(s.perm("target").isSuspended).toBe(true);
    expect(Math.abs(s.state.memory - memoryAfterImmunity)).toBe(2);

    advance(s.engine).endMainPhaseIfOpen(0);
    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it("lets an Assembly copy sweep after Kakkinmon suspends it at turn end", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: CARD_ID, as: "first", under: ["P-245"] },
            { card: CARD_ID, as: "second" },
          ],
          hand: [{ card: CARD_ID, as: "third" }, FILLER],
          trash: [
            { card: LV5_BLACK_BLOCKER, as: "lv5" },
            { card: LV4_BLACK_BLOCKER, as: "lv4" },
            { card: LV3_BLACK_BLOCKER, as: "lv3" },
          ],
          deck: DECK,
          security: [FILLER],
        },
        1: {
          battleArea: [
            { card: COST2, as: "low" },
            { card: COST3, as: "middle" },
            { card: COST4, as: "high" },
          ],
          deck: DECK,
          security: [FILLER],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    s.state.memory = 10;
    await s.ready();
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    await advance(s.engine).verb.suspend([s.perm("first").permanentId]);
    await advance(s.engine).verb.suspend([s.perm("second").permanentId]);
    expect(s.state.players[1]!.battleArea.map(({ topCard }) => topCard.instanceId)).toEqual([
      s.inst("high").instanceId,
    ]);
    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("third").instanceId,
        assembly: {
          materialInstanceIds: [s.inst("lv5").instanceId, s.inst("lv4").instanceId, s.inst("lv3").instanceId],
        },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.length === 3 && s.state.pendingDecision === undefined);
    const third = s.state.players[0]!.battleArea.find(
      ({ topCard }) => topCard.instanceId === s.inst("third").instanceId,
    )!;
    preferred.push(third.permanentId);
    advance(s.engine).endMainPhaseIfOpen(0);
    await turn;
    expect(third.isSuspended).toBe(true);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    assertNoLoudGap(s);
  });

  it("tracks each Craniamon suspension sweep independently in the same turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: CARD_ID, as: "first" },
            { card: CARD_ID, as: "second" },
          ],
          deck: DECK,
        },
        1: {
          battleArea: [
            { card: COST2, as: "low" },
            { card: COST3, as: "high" },
          ],
          deck: DECK,
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).verb.suspend([s.perm("first").permanentId]);
    await settle();
    expect(s.state.players[1]!.battleArea.map(({ topCard }) => topCard.instanceId)).toEqual([
      s.inst("high").instanceId,
    ]);
    await advance(s.engine).verb.suspend([s.perm("second").permanentId]);
    await settle();
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    assertNoLoudGap(s);
  });

  it("deletes every tied lowest-play-cost opponent on an attack suspension, sparing dearer ones and breeding", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: CARD_ID, as: "craniamon" }], deck: DECK, security: [FILLER] },
        1: {
          battleArea: [
            { card: COST2, as: "low1" },
            { card: COST2, as: "low2" },
            { card: COST3, as: "mid" },
            { card: COST4, as: "high" },
          ],
          breeding: { card: COST2, as: "breeder" },
          deck: DECK,
          security: [FILLER, FILLER],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    await s.ready();
    const low1 = s.perm("low1").permanentId;
    const low2 = s.perm("low2").permanentId;
    const midId = s.perm("mid").permanentId;
    const highId = s.perm("high").permanentId;
    const breederId = s.perm("breeder").permanentId;
    const breederInstanceId = s.inst("breeder").instanceId;

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("craniamon").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking() && s.state.pendingDecision === undefined);
    await settle();

    expect(s.perm("craniamon").isSuspended).toBe(true);
    const remaining = s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId);
    expect(remaining).not.toContain(low1);
    expect(remaining).not.toContain(low2);
    expect(remaining).toEqual(expect.arrayContaining([midId, highId]));
    expect(remaining).toHaveLength(2);
    expect(s.state.players[1]!.breeding?.permanentId).toBe(breederId);
    const trashedIds = s.state.players[1]!.trash.map(({ instanceId }) => instanceId);
    expect(trashedIds).toContain(s.inst("low1").instanceId);
    expect(trashedIds).toContain(s.inst("low2").instanceId);
    expect(trashedIds).not.toContain(breederInstanceId);
    expect(s.state.players[1]!.trash).toHaveLength(3);
    expect(s.state.players[1]!.security).toHaveLength(1);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("ignores Siriusmon DUAL when deleting the lowest play cost (Discord 1556424046827282472)", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: CARD_ID, as: "craniamon" }], deck: DECK, security: [FILLER] },
        1: {
          battleArea: [
            { card: "EX12-018", as: "siriusmon" },
            { card: "EX12-013", as: "betel" },
            { card: "P-240", as: "arcturusmon", suspended: true },
          ],
          deck: DECK,
          security: [FILLER, FILLER],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    await s.ready();
    const siriusmonId = s.perm("siriusmon").permanentId;
    const arcturusmonId = s.perm("arcturusmon").permanentId;

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("craniamon").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking() && s.state.pendingDecision === undefined);
    await settle();

    expect(s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId)).toEqual([siriusmonId, arcturusmonId]);
    expect(s.state.players[1]!.trash.map(({ cardId }) => cardId)).toContain("EX12-013");
    expect(s.state.players[1]!.trash.map(({ cardId }) => cardId)).not.toContain("EX12-018");
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("may decline the sweep, leaving every opposing Digimon alive", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: CARD_ID, as: "craniamon" }], deck: DECK, security: [FILLER] },
        1: {
          battleArea: [
            { card: COST2, as: "low" },
            { card: COST3, as: "mid" },
          ],
          deck: DECK,
          security: [FILLER, FILLER],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    await s.ready();
    const lowId = s.perm("low").permanentId;
    const midId = s.perm("mid").permanentId;

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("craniamon").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking() && s.state.pendingDecision === undefined);
    await settle();

    expect(s.perm("craniamon").isSuspended).toBe(true);
    expect(s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId)).toEqual([lowId, midId]);
    expect(s.state.players[1]!.trash.map(({ cardId }) => cardId)).toEqual([FILLER]);
  });

  it("sweeps once per turn and re-arms on the controller's next turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: CARD_ID, as: "craniamon" }],
          hand: [{ card: FILLER, as: "spare0" }],
          deck: DECK,
          security: [FILLER, FILLER, FILLER],
        },
        1: {
          battleArea: [
            { card: COST2, as: "first" },
            { card: COST3, as: "second" },
            { card: COST4, as: "survivor" },
          ],
          hand: [{ card: FILLER, as: "spare1" }],
          deck: DECK,
          security: [FILLER, FILLER, FILLER, FILLER, FILLER],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    await s.ready();
    const attackPlayer = () =>
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("craniamon").permanentId,
        target: { kind: "player" },
      });
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    const secondId = s.perm("second").permanentId;
    const survivorId = s.perm("survivor").permanentId;

    expect(attackPlayer()).toEqual({ ok: true });
    await settleAcrossTimers(() => !observe(s.engine).isAttacking() && s.state.pendingDecision === undefined);
    await settle();
    expect(s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId)).toEqual([secondId, survivorId]);

    await advance(s.engine).verb.unsuspend([s.perm("craniamon").permanentId]);
    expect(s.perm("craniamon").isSuspended).toBe(false);
    expect(attackPlayer()).toEqual({ ok: true });
    await settleAcrossTimers(() => !observe(s.engine).isAttacking() && s.state.pendingDecision === undefined);
    await settle();
    expect(s.perm("craniamon").isSuspended).toBe(true);
    expect(s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId)).toEqual([secondId, survivorId]);

    await openOpponentMain(s);
    await openOwnMain(s);
    expect(s.perm("craniamon").isSuspended).toBe(false);
    expect(attackPlayer()).toEqual({ ok: true });
    await settleAcrossTimers(() => !observe(s.engine).isAttacking() && s.state.pendingDecision === undefined);
    await settle();
    expect(s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId)).toEqual([survivorId]);

    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it("＜Blocker＞ intercepts an attack, and that block suspension is itself a sweep trigger", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: CARD_ID, as: "craniamon" }],
          hand: [{ card: FILLER, as: "spare0" }],
          deck: DECK,
          security: [FILLER, FILLER, FILLER],
        },
        1: {
          battleArea: [
            { card: COST2, as: "cheap" },
            { card: COST3, as: "mid" },
            { card: COST4, as: "attacker" },
          ],
          hand: [{ card: FILLER, as: "spare1" }],
          deck: DECK,
          security: [FILLER, FILLER, FILLER],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    await s.ready();
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    const securityBefore = s.state.players[0]!.security.length;
    const cheapId = s.perm("cheap").permanentId;
    const midId = s.perm("mid").permanentId;
    const attackerId = s.perm("attacker").permanentId;
    await openOpponentMain(s);

    expect(
      s.engine.applyIntent(1, { type: "attack", attackerPermanentId: attackerId, target: { kind: "player" } }),
    ).toEqual({ ok: true });
    await settleAcrossTimers(() => s.events.some(({ kind }) => kind === "blockWindowOpened"));
    expect(s.events.find(({ kind }) => kind === "blockWindowOpened")).toMatchObject({
      eligibleBlockerIds: [s.perm("craniamon").permanentId],
    });
    expect(
      s.engine.applyIntent(0, { type: "declareBlock", blockerPermanentId: s.perm("craniamon").permanentId }),
    ).toEqual({ ok: true });
    await settleAcrossTimers(() => !observe(s.engine).isAttacking() && s.state.pendingDecision === undefined);
    await settle();

    expect(s.state.players[0]!.security).toHaveLength(securityBefore);
    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard?.cardId)).toEqual([CARD_ID]);
    expect(s.perm("craniamon").isSuspended).toBe(true);
    const remaining = s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId);
    expect(remaining).toEqual([midId]);
    expect(remaining).not.toContain(cheapId);
    expect(remaining).not.toContain(attackerId);

    expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it("gains +3000 DP on the ＜Reboot＞ unsuspension, keeps it through its own turn and loses it at that turn's end", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: CARD_ID, as: "craniamon" }],
          hand: [{ card: FILLER, as: "spare0" }],
          deck: DECK,
          security: [FILLER, FILLER, FILLER],
        },
        1: {
          battleArea: [{ card: COST4, as: "bystander" }],
          hand: [{ card: FILLER, as: "spare1" }],
          deck: DECK,
          security: [FILLER, FILLER, FILLER],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    await s.ready();
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    expect(s.perm("craniamon").currentDP).toBe(12_000);

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("craniamon").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settleAcrossTimers(() => !observe(s.engine).isAttacking() && s.state.pendingDecision === undefined);
    await settle();
    expect(s.perm("craniamon").isSuspended).toBe(true);
    expect(s.perm("craniamon").currentDP).toBe(12_000);

    await openOpponentMain(s);
    expect(s.perm("craniamon").isSuspended).toBe(false);
    expect(s.perm("craniamon").currentDP).toBe(15_000);

    await openOwnMain(s);
    expect(s.perm("craniamon").currentDP).toBe(15_000);

    await openOpponentMain(s);
    expect(s.perm("craniamon").currentDP).toBe(12_000);

    expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it("has no once-per-turn cap on the unsuspend boost: two unsuspensions in one turn stack to +6000", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: CARD_ID, as: "craniamon", suspended: true }], deck: DECK, security: [FILLER] },
        1: { deck: DECK, security: [FILLER] },
      },
      { autoDeclineOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    await s.ready();
    const craniamonId = s.perm("craniamon").permanentId;

    await advance(s.engine).verb.unsuspend([craniamonId]);
    await settle(() => s.perm("craniamon").currentDP === 15_000);
    expect(s.perm("craniamon").currentDP).toBe(15_000);

    await advance(s.engine).verb.suspend([craniamonId]);
    await settle();
    expect(s.perm("craniamon").isSuspended).toBe(true);
    expect(s.perm("craniamon").currentDP).toBe(15_000);

    await advance(s.engine).verb.unsuspend([craniamonId]);
    await settle(() => s.perm("craniamon").currentDP === 18_000);
    expect(s.perm("craniamon").currentDP).toBe(18_000);
    expect(s.state.pendingDecision).toBeUndefined();
  });
});

describe("EX13-062 Craniamon — KB Q&A rulings", () => {
  const KING_SUKAMON = "EX13-031";
  const CHUUMON_FEE = "BT3-061";

  function boardWithOpposingKingSukamon() {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: { battleArea: [{ card: CARD_ID, as: "craniamon" }], deck: DECK, security: [FILLER] },
        1: {
          battleArea: [{ card: KING_SUKAMON, as: "king" }],
          hand: [{ card: CHUUMON_FEE, as: "fee" }],
          deck: DECK,
          security: [FILLER],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("craniamon").permanentId);
    return s;
  }

  async function rewriteWithKingSukamon(s: ReturnType<typeof setupEngine>): Promise<void> {
    s.state.turnSeat = 1;
    await advance(s.engine).fireForPermanent(EffectTiming.OnPlay, s.perm("king"));
    await settle(() => s.state.pendingDecision === undefined);
  }

  async function grantImmunity(s: ReturnType<typeof setupEngine>): Promise<void> {
    s.state.turnSeat = 0;
    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("craniamon"));
    await settle(
      () =>
        observe(s.engine).isRestrictedByEffect(s.perm("craniamon"), "beAffected", "Digimon") &&
        s.state.pendingDecision === undefined,
    );
  }

  it("neither suspends nor loses DP when an opponent's effect suspends it or gives it -3000 DP (Q7406)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: CARD_ID, as: "craniamon" },
            { card: BLACK_LV5, as: "ally" },
          ],
          deck: DECK,
        },
        1: { deck: DECK },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("craniamon"));
    await settle(() => s.state.pendingDecision === undefined);
    const craniamonDP = s.perm("craniamon").currentDP;
    const allyDP = s.perm("ally").currentDP;
    const targets = [s.perm("craniamon").permanentId, s.perm("ally").permanentId];

    advance(s.engine).verb.enterEffectResolution(1, ["Digimon"]);
    await advance(s.engine).verb.suspend(targets, 1);
    for (const permanentId of targets) {
      await advance(s.engine).verb.modifyDP(permanentId, -3000, EffectDuration.UntilOpponentTurnEnd);
    }
    advance(s.engine).verb.leaveEffectResolution();

    expect(s.perm("craniamon").isSuspended).toBe(false);
    expect(s.perm("craniamon").currentDP).toBe(craniamonDP);
    expect(s.perm("ally").isSuspended).toBe(true);
    expect(s.perm("ally").currentDP).toBe(allyDP - 3000);
  });

  it("stops an opposing effect already applied to it as soon as it gains the immunity (Q7409)", async () => {
    const s = boardWithOpposingKingSukamon();
    await s.ready();

    await rewriteWithKingSukamon(s);
    expect(observe(s.engine).effectiveNames(s.perm("craniamon"))).toEqual(["sukamon"]);
    expect(s.perm("craniamon").currentDP).toBe(3000);

    await grantImmunity(s);

    expect(observe(s.engine).effectiveNames(s.perm("craniamon"))).toEqual(["craniamon"]);
    expect(observe(s.engine).effectiveColors(s.perm("craniamon"))).toEqual(["Black"]);
    expect(s.perm("craniamon").currentDP).toBe(getCardDefinition(CARD_ID)!.dp);
  });

  it("applies an opposing effect it gained while immune once the immunity ends (Q7410)", async () => {
    const s = boardWithOpposingKingSukamon();
    await s.ready();

    await grantImmunity(s);
    await rewriteWithKingSukamon(s);

    expect(s.state.players[1]!.trash.map(({ instanceId }) => instanceId)).toEqual([s.inst("fee").instanceId]);
    expect(observe(s.engine).effectiveNames(s.perm("craniamon"))).toEqual(["craniamon"]);

    await advance(s.engine).runTurn(1);
    await settle(() => s.state.pendingDecision === undefined);

    expect(observe(s.engine).isRestrictedByEffect(s.perm("craniamon"), "beAffected", "Digimon")).toBe(false);
    expect(observe(s.engine).effectiveNames(s.perm("craniamon"))).toEqual(["sukamon"]);
    expect(observe(s.engine).effectiveColors(s.perm("craniamon"))).toEqual(["White"]);
    expect(s.perm("craniamon").currentDP).toBe(3000);
  });
});

describe("GitHub #4916 — Raid target cannot block itself", () => {
  it("does not open a block window for the lone Digimon already targeted by Raid", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "AD1-008", as: "gallant", dp: 17000 }] },
        1: { hand: [{ card: "EX13-062", as: "crania" }], security: ["BT1-009", "BT1-010"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("crania").instanceId })).toEqual({
      ok: true,
    });
    await settle(() =>
      s.events.some((e) => e.kind === "effectResolved" && e.sourceCardId === "EX13-062" && e.timing === "OnPlay"),
    );
    s.state.turnSeat = 0;
    s.state.memory = 5;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("gallant").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await advance(s.engine).finishAttack();
    expect(
      s.events.some((e) => e.kind === "attackDeclared" && e.redirected === true && e.target.kind === "permanent"),
    ).toBe(true);
    expect(s.events.filter((e) => e.kind === "blockWindowOpened")).toHaveLength(0);
  });
});
