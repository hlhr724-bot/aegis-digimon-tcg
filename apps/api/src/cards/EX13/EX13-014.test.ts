import {
  assemblyRequirementFor,
  digivolutionRequirementsFor,
  EffectTiming,
  getCardDefinition,
  Phase,
} from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import "../index.js";
import { compiled } from "./EX13-014.js";

const CARD_ID = "EX13-014";
const TOKEN_ID = "TOKEN-AthoRenePor-Token";

async function attackWindow(s: ReturnType<typeof setupEngine>, alias: string): Promise<void> {
  await advance(s.engine).fireForPermanent(EffectTiming.OnUseAttack, s.perm(alias), {
    attackerPermanentId: s.perm(alias).permanentId,
  });
}

describe("EX13-014 Jesmon", () => {
  it("matches the catalog identity and the printed clauses", () => {
    expect(getCardDefinition(CARD_ID)).toMatchObject({
      cardId: CARD_ID,
      nameEn: "Jesmon",
      colors: ["Red", "White"],
      kinds: ["Digimon"],
      level: 6,
      playCost: 12,
      dp: 12000,
      forms: ["Mega"],
      attributes: ["Data"],
      types: ["Holy Warrior", "Royal Knight"],
      evoCosts: [{ color: "Red", level: 5, memoryCost: 3 }],
    });
    const text = getCardDefinition(CARD_ID)?.effectText ?? "";
    expect(text).toContain("[Digivolve] Lv.5 w/[Huckmon] in text: Cost 3");
    expect(text).toContain("[Assembly -5] Lv.5 × Lv.4 × Lv.3, all w/[Huckmon] in text");
    expect(text).toContain(
      "[When Digivolving] [When Attacking] [Once Per Turn] You may use 1 use cost 5 or lower [Huckmon] text Option card from your hand or this Digimon's digivolution cards without paying the cost.",
    );
    expect(text).toContain(
      "[All Turns] [Once Per Turn] When any of your Digimon are played, you may delete 1 of your opponent's lowest DP Digimon. Then, if you don't have [Atho, René & Por], you may play 1 [Atho, René & Por] Token.",
    );
    expect((getCardDefinition(CARD_ID)?.inheritedEffectText ?? "").trim()).toBe("");
    expect((getCardDefinition(CARD_ID)?.securityEffectText ?? "").trim()).toBe("");
    expect(compiled.effects.every((effect) => effect.isInherited !== true)).toBe(true);
    expect(compiled.effects.every((effect) => effect.isSecurity !== true)).toBe(true);
  });

  it("compiles the shared Option windows, the played-Digimon watcher and both play headers", () => {
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual).toEqual([]);
    expect(compiled.effects).toHaveLength(3);

    const optionBody = {
      kind: "UseOptionWithoutCost",
      from: ["hand", "digivolutionCards"],
      payCost: false,
      optional: true,
      filter: {
        controller: "mine",
        kind: ["Option"],
        playCostLte: 5,
        nameOrTrait: [{ tokens: ["Huckmon"], match: "text" }],
      },
      target: {
        count: 1,
        source: "thisDigimon",
        filter: { kind: ["Option"], playCostLte: 5 },
      },
    };
    expect(compiled.effects[0]).toMatchObject({
      trigger: "WhenDigivolving",
      frequency: "OncePerTurn",
      sharedUseKey: "ir-shared-0",
      actions: [optionBody],
    });
    expect(compiled.effects[1]).toMatchObject({
      trigger: "WhenAttacking",
      frequency: "OncePerTurn",
      sharedUseKey: "ir-shared-0",
      actions: [optionBody],
    });
    expect(compiled.effects[0]?.sharedUseKey).toBe(compiled.effects[1]?.sharedUseKey);

    expect(compiled.effects[2]).toMatchObject({
      trigger: "AllTurns",
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenPlayed",
          sourceFilter: { controller: "mine", kind: ["Digimon"] },
          actions: [
            {
              kind: "Delete",
              optional: true,
              target: {
                count: 1,
                filter: { controller: "opponent", kind: ["Digimon"], superlative: "lowestDP" },
              },
            },
            {
              kind: "PlayToken",
              count: 1,
              payCost: false,
              optional: true,
              tokens: [
                {
                  name: "Atho, René & Por",
                  color: "White",
                  dp: 6000,
                  keywords: [
                    { keyword: "Reboot" },
                    { keyword: "Blocker" },
                    { keyword: "Decoy", colors: ["Red", "Black"] },
                  ],
                },
              ],
              condition: {
                kind: "youHaveNone",
                filter: {
                  controller: "mine",
                  zone: "battleArea",
                  kind: ["Digimon"],
                  nameOrTrait: [{ tokens: ["AthoRenePor Token"], match: "nameExact" }],
                },
              },
            },
          ],
        },
      ],
    });
    expect(compiled.effects[2]?.actions[0]).not.toHaveProperty("sourceFilter.excludeSelf");

    expect(compiled.digivolutionRequirement).toEqual([{ level: 5, texts: ["Huckmon"], cost: 3, isAlternate: true }]);
    expect(assemblyRequirementFor(CARD_ID)).toEqual([
      {
        materials: [
          { count: 1, level: 5, nameOrTrait: [{ tokens: ["Huckmon"], match: "text" }] },
          { count: 1, level: 4, nameOrTrait: [{ tokens: ["Huckmon"], match: "text" }] },
          { count: 1, level: 3, nameOrTrait: [{ tokens: ["Huckmon"], match: "text" }] },
        ],
        reduceCost: 5,
      },
    ]);
    expect(getCardDefinition(TOKEN_ID)).toMatchObject({
      cardId: TOKEN_ID,
      nameEn: "AthoRenePor Token",
      kinds: ["Digimon"],
      colors: ["White"],
      dp: 6000,
      isToken: true,
    });
  });

  it("digivolves from a red Lv.5 on the printed EvoCost for 3, keeping source identity", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-020", as: "base" }],
          hand: [{ card: CARD_ID, as: "jesmon" }],
          deck: ["BT1-009", "BT1-010"],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 6;
    await s.ready();
    const baseInstanceId = s.perm("base").topCard.instanceId;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("jesmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.instanceId === s.inst("jesmon").instanceId);
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.memory).toBe(3);
    expect(s.perm("base").stack.map(({ instanceId }) => instanceId)).toEqual([baseInstanceId]);
    expect(s.perm("base").currentDP).toBe(12000);
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).not.toContain(s.inst("jesmon").instanceId);
    expect(s.state.players[0]!.hand).toHaveLength(1);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("digivolves on the alternate [Huckmon]-text route for 3", async () => {
    const alternate = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX13-012", as: "base" }],
          hand: [{ card: CARD_ID, as: "jesmon" }],
          deck: ["BT1-009", "BT1-010"],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    alternate.state.memory = 6;
    await alternate.ready();
    const baseInstanceId = alternate.perm("base").topCard.instanceId;

    expect(
      alternate.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: alternate.perm("base").permanentId,
        instanceId: alternate.inst("jesmon").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => alternate.perm("base").topCard.instanceId === alternate.inst("jesmon").instanceId);
    await settle(() => alternate.state.pendingDecision === undefined);

    expect(alternate.state.memory).toBe(3);
    expect(alternate.perm("base").stack.map(({ instanceId }) => instanceId)).toEqual([baseInstanceId]);
    expect(alternate.state.players[0]!.hand).toHaveLength(1);

    expect(digivolutionRequirementsFor(CARD_ID)).toEqual(
      expect.arrayContaining([{ level: 5, texts: ["Huckmon"], cost: 3, isAlternate: true }]),
    );
  });

  it("refuses illegal digivolution sources on both routes", async () => {
    for (const base of ["BT20-013", "BT1-038"] as const) {
      const s = setupEngine(
        {
          0: {
            battleArea: [{ card: base, as: "base" }],
            hand: [{ card: CARD_ID, as: "jesmon" }],
            deck: ["BT1-009", "BT1-010"],
          },
        },
        { autoDeclineOptional: true, autoSelectCards: true },
      );
      s.state.memory = 6;
      await s.ready();

      for (const useAlternateCost of [false, true]) {
        expect(
          s.engine.applyIntent(0, {
            type: "digivolve",
            permanentId: s.perm("base").permanentId,
            instanceId: s.inst("jesmon").instanceId,
            ...(useAlternateCost ? { useAlternateCost: true } : {}),
          }).ok,
          `${base} alt=${useAlternateCost}`,
        ).toBe(false);
      }
      expect(s.state.memory).toBe(6);
      expect(s.perm("base").topCard.cardId).toBe(base);
      expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual([s.inst("jesmon").instanceId]);
    }
  });

  it.each([
    ["ST12-08", "ST12-06", "ST12-04"],
    ["BT20-014", "BT13-013", "BT20-008"],
  ])("assembles %s / %s / %s for 5 less, including the VPS Huckmon deck", async (level5, level4, level3) => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: CARD_ID, as: "jesmon" }],
          trash: [
            { card: level5, as: "level5" },
            { card: level4, as: "level4" },
            { card: level3, as: "level3" },
          ],
          deck: ["BT1-009", "BT1-010"],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 7;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("jesmon").instanceId,
        assembly: {
          materialInstanceIds: [s.inst("level5").instanceId, s.inst("level4").instanceId, s.inst("level3").instanceId],
        },
      } as never),
    ).toEqual({ ok: true });
    await settle(() => {
      const permanent = s.state.players[0]!.battleArea.find(({ topCard }) => topCard.cardId === CARD_ID);
      return permanent?.stack.length === 3;
    });
    await settle(() => s.state.pendingDecision === undefined);

    const played = s.state.players[0]!.battleArea.find(({ topCard }) => topCard.cardId === CARD_ID)!;
    expect(s.state.memory).toBe(0);
    expect(played.stack.map(({ cardId }) => cardId)).toEqual(expect.arrayContaining([level5, level4, level3]));
    expect(played.stack).toHaveLength(3);
    expect(s.state.players[0]!.trash).toHaveLength(0);
  });

  it.each([
    ["Lv.5", "BT1-020", "ST12-06", "ST12-04"],
    ["Lv.4", "ST12-08", "BT1-014", "ST12-04"],
    ["Lv.3", "ST12-08", "ST12-06", "BT1-011"],
  ])("Q7246 rejects Assembly when the %s material lacks the [Huckmon] token", (_slot, l5, l4, l3) => {
    const s = setupEngine({
      0: {
        hand: [{ card: CARD_ID, as: "jesmon" }],
        trash: [
          { card: l5, as: "level5" },
          { card: l4, as: "level4" },
          { card: l3, as: "level3" },
        ],
        deck: ["BT1-009", "BT1-010"],
      },
    });
    s.state.memory = 7;

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("jesmon").instanceId,
        assembly: {
          materialInstanceIds: [s.inst("level5").instanceId, s.inst("level4").instanceId, s.inst("level3").instanceId],
        },
      } as never),
    ).toEqual(expect.objectContaining({ ok: false }));
    expect(s.state.memory).toBe(7);
    expect(s.state.players[0]!.trash).toHaveLength(3);
  });

  it("Q7243 reads [Huckmon] 'in text' as the full printed union, not the name alone", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: CARD_ID, as: "jesmon" }],
          trash: [
            { card: "ST12-08", as: "level5" },
            { card: "ST12-06", as: "level4" },
            { card: "BT23-076", as: "level3" },
          ],
          deck: ["BT1-009", "BT1-010"],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 7;
    await s.ready();
    expect((getCardDefinition("BT23-076")?.nameEn ?? "").includes("Huckmon")).toBe(false);
    expect((getCardDefinition("BT23-076")?.effectText ?? "").includes("[Huckmon]")).toBe(true);

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("jesmon").instanceId,
        assembly: {
          materialInstanceIds: [s.inst("level5").instanceId, s.inst("level4").instanceId, s.inst("level3").instanceId],
        },
      } as never),
    ).toEqual({ ok: true });
    await settle(() => {
      const permanent = s.state.players[0]!.battleArea.find(({ topCard }) => topCard.cardId === CARD_ID);
      return permanent?.stack.length === 3;
    });

    const played = s.state.players[0]!.battleArea.find(({ topCard }) => topCard.cardId === CARD_ID)!;
    expect(played.stack.map(({ cardId }) => cardId)).toEqual(
      expect.arrayContaining(["ST12-08", "ST12-06", "BT23-076"]),
    );
    expect((getCardDefinition("BT1-011")?.effectText ?? "").includes("[Agumon]")).toBe(true);
  });

  it("uses a cost-1 [Huckmon]-text Option from hand for free on [When Digivolving]", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX13-012", as: "base" }],
          hand: [
            { card: CARD_ID, as: "jesmon" },
            { card: "BT6-093", as: "option" },
            { card: "BT1-010", as: "spare" },
          ],
          deck: ["BT1-009", "BT1-010"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 5;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("jesmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.some(({ cardId }) => cardId === "BT6-093"));
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.memory).toBe(2);
    const handIds = s.state.players[0]!.hand.map(({ instanceId }) => instanceId);
    expect(handIds).toContain(s.inst("spare").instanceId);
    expect(handIds).not.toContain(s.inst("option").instanceId);
    expect(handIds).toHaveLength(2);
    expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toEqual([s.inst("option").instanceId]);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it.each(["EX13-065", "EX13-066"])("uses the DUAL Option %s after digivolving", async (optionCard) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX13-012", as: "base" }],
          hand: [
            { card: CARD_ID, as: "jesmon" },
            { card: optionCard, as: "option" },
          ],
          deck: ["BT1-009", "BT1-010", "BT1-011"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 5;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("jesmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.some(({ instanceId }) => instanceId === s.inst("option").instanceId));
    await settle(() => s.state.pendingDecision === undefined);
    expect(s.state.memory).toBe(2);
  });

  it("Q7241 removes an Option used from its OWN digivolution cards", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: CARD_ID, as: "jesmon", under: [{ card: "BT6-093", as: "stackOption" }] },
            { card: "BT1-020", as: "neighbour", under: [{ card: "BT6-093", as: "foreignOption" }] },
          ],
          hand: [{ card: "BT1-010", as: "spare" }],
          deck: ["BT1-009", "BT1-010"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 3;
    await s.ready();

    await attackWindow(s, "jesmon");
    await settle(() => s.state.players[0]!.trash.some(({ cardId }) => cardId === "BT6-093"));
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.memory).toBe(3);
    expect(s.perm("jesmon").stack).toHaveLength(0);
    expect(s.perm("neighbour").stack.map(({ instanceId }) => instanceId)).toEqual([s.inst("foreignOption").instanceId]);
    expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toEqual([s.inst("stackOption").instanceId]);
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual([s.inst("spare").instanceId]);
  });

  it("never reaches a neighbour's digivolution cards when nothing else qualifies", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: CARD_ID, as: "jesmon" },
            { card: "BT1-020", as: "neighbour", under: [{ card: "BT6-093", as: "foreignOption" }] },
          ],
          hand: [{ card: "BT1-010", as: "spare" }],
          deck: ["BT1-009", "BT1-010"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 3;
    await s.ready();

    await attackWindow(s, "jesmon");
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.memory).toBe(3);
    expect(s.perm("neighbour").stack.map(({ instanceId }) => instanceId)).toEqual([s.inst("foreignOption").instanceId]);
    expect(s.state.players[0]!.trash).toHaveLength(0);
  });

  it("ignores a non-[Huckmon] Option and the over-cap [Huckmon] Option", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: CARD_ID, as: "jesmon", dp: 9000 }],
          hand: [
            { card: "BT1-091", as: "noToken" },
            { card: "ST12-16", as: "overCap" },
          ],
          deck: ["BT1-009", "BT1-010"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 9;
    await s.ready();
    expect(getCardDefinition("ST12-16")?.playCost).toBe(7);

    await attackWindow(s, "jesmon");
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.memory).toBe(9);
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual([
      s.inst("noToken").instanceId,
      s.inst("overCap").instanceId,
    ]);
    expect(s.state.players[0]!.trash).toHaveLength(0);
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
  });

  it("declines the Option window without spending the shared use", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: CARD_ID, as: "jesmon" }],
          hand: [
            { card: "BT6-093", as: "option" },
            { card: "BT1-010", as: "spare" },
          ],
          deck: ["BT1-009", "BT1-010"],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 3;
    await s.ready();

    await attackWindow(s, "jesmon");
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.memory).toBe(3);
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual([
      s.inst("option").instanceId,
      s.inst("spare").instanceId,
    ]);
    expect(s.state.players[0]!.trash).toHaveLength(0);
  });

  it("spends one shared Option use across both timings and reopens on the next own turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX13-012", as: "base" }],
          hand: [
            { card: CARD_ID, as: "jesmon" },
            { card: "BT6-093", as: "first" },
            { card: "BT6-093", as: "second" },
            { card: "BT1-010", as: "spare" },
          ],
          deck: ["BT1-009", "BT1-010", "BT1-011", "BT1-012"],
          security: ["BT1-009"],
        },
        1: { deck: ["BT1-009", "BT1-010", "BT1-011"], security: ["BT1-009"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 5;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("jesmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.some(({ cardId }) => cardId === "BT6-093"));
    await settle(() => s.state.pendingDecision === undefined);
    const usedFirst = s.state.players[0]!.trash.map(({ instanceId }) => instanceId);
    expect(usedFirst).toHaveLength(1);

    await attackWindow(s, "base");
    await settle(() => s.state.pendingDecision === undefined);
    expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toEqual(usedFirst);

    s.state.turnSeat = 1;
    s.state.memory = 3;
    await advance(s.engine).runTurn(1);

    s.state.turnSeat = 0;
    s.state.memory = 4;
    await attackWindow(s, "base");
    await settle(() => s.state.players[0]!.trash.filter(({ cardId }) => cardId === "BT6-093").length === 2);

    expect(s.state.players[0]!.trash.filter(({ cardId }) => cardId === "BT6-093")).toHaveLength(2);
  });

  it("deletes the opponent's lowest DP Digimon and plays the token when another Digimon is played", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: CARD_ID, as: "jesmon" }],
          hand: [{ card: "BT1-010", as: "played" }],
          deck: ["BT1-009", "BT1-010"],
        },
        1: {
          battleArea: [
            { card: "BT1-009", as: "lowest", dp: 1000 },
            { card: "BT1-009", as: "middle", dp: 5000 },
            { card: "BT1-009", as: "highest", dp: 9000 },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 6;
    await s.ready();
    const lowestId = s.perm("lowest").permanentId;
    const middleId = s.perm("middle").permanentId;
    const highestId = s.perm("highest").permanentId;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("played").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === TOKEN_ID));
    await settle(() => s.state.pendingDecision === undefined);

    const opponentIds = s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId);
    expect(opponentIds).toEqual([middleId, highestId]);
    expect(opponentIds).not.toContain(lowestId);

    const token = s.state.players[0]!.battleArea.find(({ topCard }) => topCard.cardId === TOKEN_ID)!;
    expect(token.currentDP).toBe(6000);
    expect(observe(s.engine).hasKeyword(token, "Reboot")).toBe(true);
    expect(observe(s.engine).hasKeyword(token, "Blocker")).toBe(true);
    expect(observe(s.engine).hasKeyword(token, "Decoy")).toBe(true);
    expect(s.state.players[0]!.battleArea).toHaveLength(3);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("Q7244 arms the watcher from its OWN play: the printed clause says 'any', not 'any other'", async () => {
    const s = setupEngine(
      {
        0: { hand: [{ card: CARD_ID, as: "jesmon" }], deck: ["BT1-009", "BT1-010"] },
        1: {
          battleArea: [
            { card: "BT1-009", as: "lowest", dp: 1000 },
            { card: "BT1-009", as: "highest", dp: 9000 },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 12;
    await s.ready();
    const highestId = s.perm("highest").permanentId;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("jesmon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === TOKEN_ID));
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.memory).toBe(0);
    expect(s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId)).toEqual([highestId]);
    expect(s.state.players[0]!.battleArea).toHaveLength(2);
  });

  it("Q7242 activates a newly assembled inherited effect for Jesmon's own play", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: CARD_ID, as: "jesmon" }],
          trash: [
            { card: "ST12-08", as: "level5" },
            { card: "ST12-06", as: "level4" },
            { card: "EX13-009", as: "level3" },
          ],
          deck: ["BT1-009", "BT1-010"],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 7;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("jesmon").instanceId,
        assembly: {
          materialInstanceIds: [s.inst("level5").instanceId, s.inst("level4").instanceId, s.inst("level3").instanceId],
        },
      } as never),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.memory).toBe(1);
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
    expect(s.state.players[0]!.battleArea[0]!.stack.map(({ cardId }) => cardId)).toEqual(
      expect.arrayContaining(["ST12-08", "ST12-06", "EX13-009"]),
    );
  });

  it("Q7245 finishes the token half after an immediate would-leave effect removes Jesmon", async () => {
    const preferredTargets: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: CARD_ID, as: "jesmon", dp: 9000 }],
          hand: [{ card: "BT1-010", as: "played" }],
          deck: ["BT1-009", "BT1-010"],
        },
        1: { battleArea: [{ card: "EX13-015", as: "gallantmon", dp: 1000 }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferredTargets },
    );
    preferredTargets.push(s.perm("jesmon").topCard.instanceId);
    s.state.memory = 6;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("played").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === TOKEN_ID));
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[1]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual(["EX13-015"]);
    expect(s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === CARD_ID)).toBe(false);
    expect(s.state.players[0]!.trash.map(({ cardId }) => cardId)).toContain(CARD_ID);
    expect(s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === TOKEN_ID)).toBe(true);
  });

  it("skips the token half while an [Atho, René & Por] Token is already on the board", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: CARD_ID, as: "jesmon" },
            { card: TOKEN_ID, as: "existing" },
          ],
          hand: [{ card: "BT1-010", as: "played" }],
          deck: ["BT1-009", "BT1-010"],
        },
        1: { battleArea: [{ card: "BT1-009", as: "lowest", dp: 1000 }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 6;
    await s.ready();
    const existingId = s.perm("existing").permanentId;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("played").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.battleArea.length === 0);
    await settle(() => s.state.pendingDecision === undefined);

    const tokens = s.state.players[0]!.battleArea.filter(({ topCard }) => topCard.cardId === TOKEN_ID);
    expect(tokens.map(({ permanentId }) => permanentId)).toEqual([existingId]);
    expect(s.state.players[0]!.battleArea).toHaveLength(3);
  });

  it("declines both halves when the controller says no", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: CARD_ID, as: "jesmon" }],
          hand: [{ card: "BT1-010", as: "played" }],
          deck: ["BT1-009", "BT1-010"],
        },
        1: { battleArea: [{ card: "BT1-009", as: "lowest", dp: 1000 }] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 6;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("played").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.length === 2);
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId)).toEqual([
      s.perm("lowest").permanentId,
    ]);
    expect(s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === TOKEN_ID)).toBe(false);
  });

  it("fires the watcher once per turn and resets it after a real opponent turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: CARD_ID, as: "jesmon" }],
          hand: [
            { card: "BT1-010", as: "first" },
            { card: "BT1-010", as: "second" },
            { card: "BT1-012", as: "spare" },
          ],
          deck: ["BT1-009", "BT1-010", "BT1-011"],
          security: ["BT1-009"],
        },
        1: {
          battleArea: [
            { card: "BT1-009", as: "firstTarget", dp: 1000 },
            { card: "BT1-009", as: "secondTarget", dp: 2000 },
          ],
          deck: ["BT1-009", "BT1-010", "BT1-011"],
          security: ["BT1-009"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 9;
    await s.ready();
    const secondTargetId = s.perm("secondTarget").permanentId;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("first").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.battleArea.length === 1);
    await settle(() => s.state.pendingDecision === undefined);
    expect(s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId)).toEqual([secondTargetId]);
    const tokensAfterFirst = s.state.players[0]!.battleArea.filter(({ topCard }) => topCard.cardId === TOKEN_ID).length;
    expect(tokensAfterFirst).toBe(1);

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("second").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => false, 60);
    expect(s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId)).toEqual([secondTargetId]);

    s.state.turnSeat = 1;
    s.state.memory = 3;
    await advance(s.engine).runTurn(1);

    s.state.turnSeat = 0;
    s.state.memory = 6;
    s.state.phase = Phase.Main;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("spare").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.battleArea.length === 0);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
  });

  it("does not arm the watcher from a Tamer play or from an opponent's Digimon play", async () => {
    const tamer = setupEngine(
      {
        0: {
          battleArea: [{ card: CARD_ID, as: "jesmon" }],
          hand: [{ card: "BT20-090", as: "tamer" }],
          deck: ["BT1-009", "BT1-010"],
        },
        1: { battleArea: [{ card: "BT1-009", as: "lowest", dp: 1000 }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    tamer.state.memory = 6;
    await tamer.ready();
    expect(getCardDefinition("BT20-090")?.kinds).toEqual(["Tamer"]);

    expect(tamer.engine.applyIntent(0, { type: "playCard", instanceId: tamer.inst("tamer").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => tamer.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === "BT20-090"));
    await settle(() => tamer.state.pendingDecision === undefined);
    expect(tamer.state.players[1]!.battleArea.map(({ permanentId }) => permanentId)).toEqual([
      tamer.perm("lowest").permanentId,
    ]);
    expect(tamer.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === TOKEN_ID)).toBe(false);

    const opponent = setupEngine(
      {
        0: {
          battleArea: [
            { card: CARD_ID, as: "jesmon" },
            { card: "BT1-009", as: "mine", dp: 1000 },
          ],
          deck: ["BT1-009", "BT1-010"],
        },
        1: { hand: [{ card: "BT1-010", as: "played" }], deck: ["BT1-009", "BT1-010"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    opponent.state.turnSeat = 1;
    opponent.state.memory = 6;
    await opponent.ready();
    const mineId = opponent.perm("mine").permanentId;

    expect(
      opponent.engine.applyIntent(1, { type: "playCard", instanceId: opponent.inst("played").instanceId }),
    ).toEqual({ ok: true });
    await settle(() => opponent.state.players[1]!.battleArea.some(({ topCard }) => topCard.cardId === "BT1-010"));
    await settle(() => opponent.state.pendingDecision === undefined);

    expect(opponent.state.players[0]!.battleArea.map(({ permanentId }) => permanentId)).toContain(mineId);
    expect(opponent.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === TOKEN_ID)).toBe(false);
  });

  it("lets the controller choose which Digimon the token's Decoy saves from a board wipe (Discord 1555594986756767896)", async () => {
    const preferInstanceIds: string[] = [];
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT20-102", as: "omnimonX" }],
          battleArea: [
            { card: "BT5-086", as: "omnimon" },
            { card: "AD1-011", as: "survivor" },
          ],
          deck: ["BT1-010", "BT1-010", "BT1-010", "BT1-010"],
        },
        1: {
          battleArea: [
            { card: "AD1-011", as: "opponentSurvivor" },
            { card: "EX13-047", as: "gotsumon" },
            { card: "BT13-019", as: "gankoomon" },
            { card: TOKEN_ID, as: "token" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true, preferInstanceIds },
    );
    s.state.memory = 10;
    const gotsumonId = s.perm("gotsumon").permanentId;
    const gankoomonId = s.perm("gankoomon").permanentId;
    // Omnimon (X Antibody) keeps 1 Digimon per player; the survivors come first so the
    // wipe keeps them, leaving Gotsumon and Gankoomon (both Decoy-eligible) in danger.
    preferInstanceIds.push(
      s.perm("survivor").topCard.instanceId,
      s.perm("opponentSurvivor").topCard.instanceId,
      s.perm("token").topCard.instanceId,
      s.perm("gankoomon").topCard.instanceId,
    );
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("omnimon").permanentId,
        instanceId: s.inst("omnimonX").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === "BT20-102") &&
        s.state.pendingDecision === undefined,
    );

    expect(s.events.flatMap((event) => (event.kind === "deletionPrevented" ? [event.permanentId] : []))).toEqual([
      gankoomonId,
    ]);
    const protectPrompts = s.decisions.filter(
      ({ seat, req }) => seat === 1 && req.kind === "selectCards" && req.promptText?.includes("protect") === true,
    );
    expect(protectPrompts).toHaveLength(1);
    expect([...(protectPrompts[0]!.req.options?.candidateInstanceIds ?? [])].sort()).toEqual(
      [s.inst("gotsumon").instanceId, s.inst("gankoomon").instanceId].sort(),
    );
    expect(
      s.events.flatMap((event) =>
        event.kind === "cardsMoved" ? (event.deletedPermanents ?? []).map(({ permanentId }) => permanentId) : [],
      ),
    ).toContain(gotsumonId);
  });
});
