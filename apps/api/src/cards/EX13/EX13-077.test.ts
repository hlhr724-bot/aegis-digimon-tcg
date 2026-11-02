import {
  assemblyRequirementFor,
  digivolutionRequirementsFor,
  EffectDuration,
  EffectTiming,
  getCardDefinition,
} from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled } from "./EX13-077.js";
import "../BT1/BT1-101.js";
import "../BT4/BT4-057.js";
import "../BT9/BT9-050.js";
import "../AD1/AD1-025.js";
import "../ST20/ST20-12.js";
import "../ST21/ST21-12.js";
import "./EX13-030.js";

const CARD_ID = "EX13-077";

describe("EX13-077 Omnimon: Merciful Mode", () => {
  it("issue #5234: both unsuspended starter Tamers reduce Merciful Mode's hand play cost", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "ST20-12", as: "tai" },
            { card: "ST21-12", as: "matt" },
          ],
          hand: [{ card: CARD_ID, as: "merciful" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 20;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("merciful").instanceId })).toEqual({
      ok: true,
    });
    await settle();
    expect(s.perm("tai").isSuspended).toBe(true);
    expect(s.perm("matt").isSuspended).toBe(true);
    expect(s.state.memory).toBe(6);
  });

  it("matches the newly revealed catalog identity and requirements", () => {
    expect(getCardDefinition(CARD_ID)).toMatchObject({
      cardId: CARD_ID,
      nameEn: "Omnimon: Merciful Mode",
      colors: ["White"],
      kinds: ["Digimon"],
      level: 7,
      playCost: 16,
      dp: 16_000,
      forms: ["Mega"],
      attributes: ["Vaccine"],
      types: ["Holy Warrior", "ADVENTURE"],
      evoCosts: ["Red", "Blue", "Yellow", "Green", "Black", "Purple", "White"].map((color) => ({
        color,
        level: 6,
        memoryCost: 6,
      })),
    });
    expect(digivolutionRequirementsFor(CARD_ID)).toEqual(compiled.digivolutionRequirement);
    expect(assemblyRequirementFor(CARD_ID)).toEqual(compiled.assemblyRequirement);
  });

  it("digivolves from hand onto a level 6 of any color for 6 (Discord bug 1554647960862855248)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "AD1-004", as: "warGreymon" }],
          hand: [{ card: CARD_ID, as: "merciful" }],
          deck: ["BT1-009", "BT1-009"],
          security: ["BT1-090"],
        },
        1: { deck: ["BT1-009"], security: ["BT1-090"] },
      },
      { autoDeclineOptional: true, autoChooseOption: true, autoSelectCards: true, preferOptionIndex: 1 },
    );
    s.state.memory = 6;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("warGreymon").permanentId,
        instanceId: s.inst("merciful").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("warGreymon").topCard.cardId === CARD_ID && s.state.pendingDecision === undefined);
    expect(s.state.memory).toBe(0);
  });

  it("compiles the two timing bodies, color-scaled modal, Assembly, and explicit residual", () => {
    expect(runtimeCompiledCard(CARD_ID)).toMatchObject({ coverage: "full" });
    expect(compiled.residual).toEqual([]);
    expect(compiled.digivolutionRequirement).toEqual([{ namesExact: ["Omnimon"], cost: 2, isAlternate: true }]);
    expect(compiled.assemblyRequirement).toEqual([
      {
        reduceCost: 8,
        materials: [
          {
            count: 6,
            kinds: ["Digimon"],
            nameOrTrait: [{ tokens: ["ADVENTURE"], match: "trait" }],
            differentColors: true,
          },
        ],
      },
    ]);
    const timed = compiled.effects.filter(({ trigger }) => ["OnPlay", "WhenDigivolving"].includes(trigger));
    expect(timed).toHaveLength(2);
    for (const effect of timed) {
      expect(effect.actions[0]).toMatchObject({ kind: "Attack", withoutSuspending: true, optional: true });
      expect(effect.actions[1]).toMatchObject({
        kind: "Modal",
        choose: 1,
        chooseScaling: { per: 2, unit: "colors", filter: { controller: "mine", kind: ["Digimon", "Tamer"] } },
      });
    }
    expect(compiled.effects[2]).toMatchObject({
      trigger: "Static",
      actions: [
        {
          kind: "GrantStatic",
          grant: "hasAllDigivolutionColors",
        },
      ],
    });
    expect(compiled.effects[3]).toMatchObject({
      trigger: "AllTurns",
      actions: [{ kind: "ModifyDP", amount: 1000, duration: "permanent", scaling: { per: 1, unit: "colors" } }],
    });
  });

  it("accepts six ADVENTURE Assembly materials with distinct colors and rejects a repeated-color set", async () => {
    const materials = ["AD1-001", "AD1-010", "AD1-014", "AD1-025", "ST20-05", "ST20-07"];
    const s = setupEngine({
      0: {
        hand: [{ card: CARD_ID, as: "paladin" }],
        trash: materials.map((card, index) => ({ card, as: `m${index}` })),
        deck: ["BT1-009", "BT1-009", "BT1-009"],
        security: ["BT1-090"],
      },
      1: {
        hand: [{ card: "BT1-101", as: "crusher" }],
        battleArea: [{ card: "BT1-028", as: "blueSource" }],
        deck: ["BT1-009"],
        security: ["BT1-090"],
      },
    });
    s.state.memory = 10;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("paladin").instanceId,
        assembly: { materialInstanceIds: materials.map((_card, index) => s.inst(`m${index}`).instanceId) },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some(({ topCard }) => topCard?.cardId === CARD_ID));
    expect(s.state.memory).toBe(2);

    const invalid = setupEngine({
      0: {
        hand: [{ card: CARD_ID, as: "invalidPaladin" }],
        trash: ["AD1-001", "AD1-004", "AD1-009", "BT21-057", "P-182", "ST20-02"].map((card, index) => ({
          card,
          as: `r${index}`,
        })),
      },
      1: {},
    });
    invalid.state.memory = 10;
    await invalid.ready();
    const invalidMaterials = ["r0", "r1", "r2", "r3", "r4", "r5"].map((alias) => invalid.inst(alias).instanceId);
    expect(
      invalid.engine.applyIntent(0, {
        type: "playCard",
        instanceId: invalid.inst("invalidPaladin").instanceId,
        assembly: { materialInstanceIds: invalidMaterials },
      }),
    ).toEqual({ ok: false, reason: "invalid-material" });
    expect(invalid.state.memory).toBe(10);
    expect(invalid.state.players[0]!.hand.map(({ cardId }) => cardId)).toEqual([CARD_ID]);
    expect(invalid.state.players[0]!.trash).toHaveLength(6);
  });

  it("Q7475: counts its own White and colors gained from its live stack", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            {
              card: CARD_ID,
              as: "merciful",
              under: [
                { card: "AD1-001", as: "redSource" },
                { card: "AD1-010", as: "blueSource" },
              ],
            },
            { card: "AD1-001", as: "redAlly" },
          ],
          deck: ["BT1-009", "BT1-009", "BT1-009"],
          security: ["BT1-090"],
        },
        1: {
          hand: [{ card: "BT1-101", as: "crusher" }],
          battleArea: [{ card: "BT1-028", as: "blueSource" }],
          deck: ["BT1-009"],
          security: ["BT1-090"],
        },
      },
      { autoDeclineOptional: true },
    );
    await s.ready();
    const merciful = s.perm("merciful");

    expect(s.engine.effectiveColorsOf(merciful)).toEqual(expect.arrayContaining(["White", "Red", "Blue"]));
    expect(merciful.currentDP).toBe(19_000);

    s.state.turnSeat = 1;
    s.state.memory = 10;
    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("crusher").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => merciful.stack.length === 0);

    expect(s.engine.effectiveColorsOf(merciful)).toEqual(["White"]);
    expect(merciful.currentDP).toBe(18_000);
  });

  it("Q7472-Q7474/Q7478: snapshots unique colors, resolves sequentially, and may repeat Recovery", async () => {
    const make = (allies: string[], trashCount: number) =>
      setupEngine(
        {
          0: {
            hand: [{ card: CARD_ID, as: "merciful" }],
            battleArea: allies.map((card, index) => ({ card, as: `ally${index}` })),
            deck: [
              { card: "BT1-012", as: "deck0" },
              { card: "BT1-013", as: "deck1" },
              { card: "BT1-014", as: "deck2" },
            ],
            security: [{ card: "BT1-090", as: "security" }],
          },
          1: {
            trash: Array.from({ length: trashCount }, (_, index) => ({ card: "BT1-009", as: `opTrash${index}` })),
            deck: [{ card: "BT1-010", as: "opDeck" }],
            security: ["BT1-011"],
          },
        },
        { autoDeclineOptional: true, autoChooseOption: true, autoSelectCards: true, preferOptionIndex: 1 },
      );

    const oneColor = make([], 5);
    oneColor.state.memory = 10;
    await oneColor.ready();
    expect(
      oneColor.engine.applyIntent(0, { type: "playCard", instanceId: oneColor.inst("merciful").instanceId }),
    ).toEqual({ ok: true });
    await settle(() => oneColor.state.players[0]!.battleArea.some(({ topCard }) => topCard?.cardId === CARD_ID));
    expect(oneColor.state.players[1]!.trash).toHaveLength(5);
    expect(oneColor.state.players[0]!.security.map(({ cardId }) => cardId)).toEqual(["BT1-090"]);

    const twoColors = make(["AD1-001"], 5);
    twoColors.state.memory = 10;
    await twoColors.ready();
    const twoReturned = twoColors.state.players[1]!.trash.map(({ instanceId }) => instanceId);
    expect(
      twoColors.engine.applyIntent(0, { type: "playCard", instanceId: twoColors.inst("merciful").instanceId }),
    ).toEqual({ ok: true });
    await settle(() => twoColors.state.players[1]!.trash.length === 0);
    expect(twoColors.state.players[1]!.trash).toHaveLength(0);
    expect(twoColors.state.players[1]!.deck.map(({ instanceId }) => instanceId)).toEqual([
      twoColors.inst("opDeck").instanceId,
      ...twoReturned,
    ]);
    expect(twoColors.state.players[0]!.security.map(({ instanceId }) => instanceId)).toEqual([
      twoColors.inst("deck0").instanceId,
      twoColors.inst("security").instanceId,
    ]);

    const fourColors = make(["AD1-001", "AD1-010", "ST20-07"], 10);
    fourColors.state.memory = 10;
    await fourColors.ready();
    const fourReturned = fourColors.state.players[1]!.trash.map(({ instanceId }) => instanceId);
    expect(
      fourColors.engine.applyIntent(0, { type: "playCard", instanceId: fourColors.inst("merciful").instanceId }),
    ).toEqual({ ok: true });
    await settle(() => fourColors.state.players[1]!.trash.length === 0);
    expect(fourColors.state.players[1]!.deck.map(({ instanceId }) => instanceId)).toEqual([
      fourColors.inst("opDeck").instanceId,
      ...fourReturned,
    ]);
    expect(fourColors.state.players[0]!.security.map(({ instanceId }) => instanceId)).toEqual([
      fourColors.inst("deck1").instanceId,
      fourColors.inst("deck0").instanceId,
      fourColors.inst("security").instanceId,
    ]);
    expect(fourColors.perm("merciful").isSuspended).toBe(false);
  });

  it("Q7471: does not offer Recovery when only four opposing trash cards can be returned", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: CARD_ID, as: "merciful" }],
          battleArea: [{ card: "AD1-001", as: "redAlly" }],
          deck: ["BT1-012"],
          security: ["BT1-090"],
        },
        1: { trash: ["BT1-009", "BT1-010", "BT1-011", "BT1-012"], deck: ["BT1-013"], security: ["BT1-014"] },
      },
      { autoDeclineOptional: true, autoChooseOption: true, autoSelectCards: true, preferOptionIndex: 1 },
    );
    await s.ready();
    const trashBefore = s.state.players[1]!.trash.map(({ instanceId }) => instanceId);
    s.state.memory = 10;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("merciful").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.some(({ topCard }) => topCard?.cardId === CARD_ID));
    expect(s.state.players[1]!.trash.map(({ instanceId }) => instanceId)).toEqual(trashBefore);
    expect(s.state.players[0]!.security.map(({ cardId }) => cardId)).toEqual(["BT1-090"]);
    expect(s.state.players[0]!.deck.map(({ cardId }) => cardId)).toEqual(["BT1-012"]);
  });

  it("offers Don't use on the Recovery cost selection when nothing can be battled, and declining pays nothing", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: CARD_ID, as: "merciful" }],
          battleArea: [{ card: "AD1-001", as: "redAlly" }],
          deck: ["BT1-012"],
          security: ["BT1-090"],
        },
        1: {
          trash: ["BT1-009", "BT1-010", "BT1-011", "BT1-012", "BT1-013"],
          deck: ["BT1-013"],
          security: ["BT1-014"],
        },
      },
      { autoDeclineOptional: true, autoChooseOption: true },
    );
    await s.ready();
    s.state.memory = 10;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("merciful").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.decisions.at(-1)?.req.kind === "selectCards");
    const costSelection = s.decisions.at(-1)!.req;
    expect(costSelection.options).toMatchObject({ min: 5, max: 5, purpose: "cost", declinesCost: true });
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: costSelection.decisionId,
        response: { kind: "selectCards", instanceIds: [] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined);
    expect(s.state.players[1]!.trash).toHaveLength(5);
    expect(s.state.players[0]!.security.map(({ cardId }) => cardId)).toEqual(["BT1-090"]);
  });

  it("Q7473/Q7476: resolves the second color-scaled choice after Battle, and Recovery removes the pending On Deletion source", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: CARD_ID, as: "merciful" }],
          battleArea: [
            { card: "AD1-001", as: "red" },
            { card: "AD1-010", as: "blue" },
            { card: "ST20-07", as: "green" },
          ],
          deck: ["BT1-012", "BT1-013", "BT1-014"],
          security: ["BT1-090"],
        },
        1: {
          battleArea: [{ card: "BT1-035", as: "leomon" }],
          trash: ["BT1-009", "BT1-010", "BT1-011", "BT1-012"],
          deck: [{ card: "BT1-013", as: "opDeck" }],
          security: ["BT1-014"],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();
    const leomonId = s.inst("leomon").instanceId;
    const resolveOptional = async (accept: boolean) => {
      await settle(() => s.decisions.at(-1)?.req.kind === "optional");
      const req = s.decisions.at(-1)!.req;
      if (req.kind !== "optional") throw new Error("Expected the optional attack clause");
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: req.decisionId,
          response: { kind: "optional", accept },
        }),
      ).toEqual({ ok: true });
    };
    const chooseOption = async (optionIndex: number) => {
      await settle(() => s.decisions.at(-1)?.req.kind === "chooseOption");
      const req = s.decisions.at(-1)!.req;
      if (req.kind !== "chooseOption") throw new Error("Expected the color-scaled effect choice");
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: req.decisionId,
          response: { kind: "chooseOption", optionIndex },
        }),
      ).toEqual({ ok: true });
    };

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("merciful").instanceId })).toEqual({
      ok: true,
    });
    await resolveOptional(false); // decline the optional attack without suspending
    await chooseOption(0); // choose Battle for the first of two color activations
    await resolveOptional(true);
    await settle(() => s.state.players[1]!.battleArea.length === 0);
    await chooseOption(1); // only after Battle resolves, choose Recovery
    await settle(() => s.state.players[1]!.trash.length === 0);
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[1]!.deck.map(({ instanceId }) => instanceId)).toContain(leomonId);
    expect(s.state.players[1]!.trash).toHaveLength(0);
    expect(s.state.memory).toBe(-6);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("Q7470: returns a selected Digi-Egg to the bottom of its owner's Digi-Egg deck", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: CARD_ID, as: "merciful" }],
          battleArea: [{ card: "AD1-001", as: "redAlly" }],
          deck: ["BT1-012"],
          security: ["BT1-090"],
        },
        1: {
          trash: [
            { card: "BT1-001", as: "egg" },
            { card: "BT1-009", as: "trash0" },
            { card: "BT1-010", as: "trash1" },
            { card: "BT1-011", as: "trash2" },
            { card: "BT1-012", as: "trash3" },
          ],
          deck: [{ card: "BT1-013", as: "mainDeck" }],
          eggDeck: [{ card: "BT1-002", as: "existingEgg" }],
          security: ["BT1-014"],
        },
      },
      { autoDeclineOptional: true, autoChooseOption: true, autoSelectCards: true, preferOptionIndex: 1 },
    );
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("merciful").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.trash.length === 0);

    expect(s.state.players[1]!.eggDeck.map(({ instanceId }) => instanceId)).toEqual([
      s.inst("existingEgg").instanceId,
      s.inst("egg").instanceId,
    ]);
    expect(s.state.players[1]!.deck.map(({ instanceId }) => instanceId)).not.toContain(s.inst("egg").instanceId);
  });

  it("battles without any Tamers when its own Digimon colors meet the threshold", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: CARD_ID, as: "merciful" }],
          battleArea: [{ card: "AD1-001", as: "redDigimon" }],
          deck: ["BT1-012"],
          security: ["BT1-090"],
        },
        1: {
          battleArea: [{ card: "BT1-009", as: "opponentDigimon" }],
          deck: ["BT1-013"],
          security: ["BT1-014"],
        },
      },
      { autoAcceptOptional: true, autoChooseOption: true, autoSelectCards: true, preferOptionIndex: 0 },
    );
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("merciful").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.battleArea.length === 0);

    expect(s.state.players[1]!.trash.map(({ cardId }) => cardId)).toContain("BT1-009");
    expect(s.perm("merciful").isSuspended).toBe(false);
    expect(s.state.players[0]!.battleArea.some(({ topCard }) => topCard?.cardId === CARD_ID)).toBe(true);
  });

  it("Q7468: the modal Battle branch immediately performs a normal DP battle", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: CARD_ID, as: "merciful" }],
          battleArea: [{ card: "AD1-020", as: "colorTamer" }],
          deck: ["BT1-012"],
          security: ["BT1-090"],
        },
        1: {
          battleArea: [{ card: "BT1-009", as: "opponentDigimon" }],
          deck: ["BT1-013"],
          security: ["BT1-014"],
        },
      },
      { autoAcceptOptional: true, autoChooseOption: true, autoSelectCards: true, preferOptionIndex: 0 },
    );
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("merciful").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.battleArea.length === 0);

    expect(s.state.players[1]!.trash.map(({ cardId }) => cardId)).toContain("BT1-009");
    expect(s.perm("merciful").isSuspended).toBe(false);
    expect(s.state.players[0]!.battleArea.some(({ topCard }) => topCard?.cardId === CARD_ID)).toBe(true);
  });

  it.each([3, 1])(
    "offers inherited Barrier for each consecutive Battle while security remains (%i security, Discord bug 1556063217623629944)",
    async (securityCount) => {
      const s = setupEngine(
        {
          0: {
            hand: [{ card: CARD_ID, as: "merciful" }],
            battleArea: [{ card: "AD1-020", as: "colorTamer" }],
            deck: ["BT1-012"],
            security: ["BT1-090"],
          },
          1: {
            battleArea: [{ card: "BT1-057", as: "host", under: [{ card: "EX13-030", as: "barrierSource" }] }],
            security: Array.from({ length: securityCount }, () => "BT1-009"),
          },
        },
        {
          autoAcceptOptional: true,
          declinePrompts: ["Attack"],
          autoChooseOption: true,
          autoSelectCards: true,
          preferOptionIndex: 0,
        },
      );
      s.state.memory = 10;
      await s.ready();
      const hostId = s.perm("host").permanentId;
      expect(observe(s.engine).hasKeyword(s.perm("host"), "Barrier")).toBe(true);
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("merciful").instanceId })).toEqual({
        ok: true,
      });

      for (let battle = 0; battle < Math.min(securityCount, 2); battle++) {
        await settle(
          () =>
            s.events.filter(({ kind }) => kind === "barrierPrompt").length > battle ||
            s.events.some(
              (event) => event.kind === "effectResolved" && event.sourceCardId === CARD_ID && event.timing === "OnPlay",
            ),
        );
        expect(s.events.filter(({ kind }) => kind === "barrierPrompt")).toHaveLength(battle + 1);
        expect(s.engine.applyIntent(1, { type: "respondBarrier", permanentId: hostId, accept: true })).toEqual({
          ok: true,
        });
      }
      await settle(() =>
        s.events.some(
          (event) => event.kind === "effectResolved" && event.sourceCardId === CARD_ID && event.timing === "OnPlay",
        ),
      );
      expect(s.state.pendingDecision).toBeUndefined();
      expect(s.events.filter(({ kind }) => kind === "effectOptionChosen")).toHaveLength(2);
      expect(s.events.filter(({ kind }) => kind === "barrierPrompt")).toHaveLength(Math.min(securityCount, 2));
      expect(s.state.players[1]!.security).toHaveLength(Math.max(0, securityCount - 2));
      expect(s.state.players[1]!.battleArea.some(({ permanentId }) => permanentId === hostId)).toBe(securityCount > 1);
      const survivor = s.state.players[1]!.battleArea.find(({ permanentId }) => permanentId === hostId);
      expect(survivor?.stack.map(({ instanceId }) => instanceId)).toEqual(
        securityCount > 1 ? [s.inst("barrierSource").instanceId] : undefined,
      );
      expect(s.state.players[1]!.trash.map(({ cardId }) => cardId)).toEqual(
        securityCount > 1 ? ["BT1-009", "BT1-009"] : ["BT1-009", "EX13-030", "BT1-057"],
      );
    },
  );

  it("resolves Battle and Recovery before the attacker's When Attacking effect (Discord bug 1554922883652784198)", async () => {
    const preferInstanceIds: string[] = [];
    const s = setupEngine(
      {
        0: {
          hand: [{ card: CARD_ID, as: "merciful" }],
          battleArea: [
            { card: "BT4-057", as: "attacker" },
            { card: "AD1-020", as: "colorTamer" },
          ],
          deck: ["BT1-012", "BT1-013"],
          security: ["BT1-090"],
        },
        1: {
          battleArea: [{ card: "BT1-009", as: "defender" }],
          trash: ["BT1-010", "BT1-011", "BT1-012", "BT1-013", "BT1-014"],
          deck: ["BT1-015"],
          security: ["BT1-016"],
        },
      },
      {
        autoAcceptOptional: true,
        autoChooseOption: true,
        autoSelectCards: true,
        preferOptionIndex: 0,
        preferInstanceIds,
      },
    );
    s.state.memory = 10;
    await s.ready();
    const attacker = s.perm("attacker");
    preferInstanceIds.push(attacker.permanentId, attacker.topCard.instanceId);
    const defenderId = s.inst("defender").instanceId;
    const returnedIds = s.state.players[1]!.trash.map(({ instanceId }) => instanceId);
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("merciful").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.events.some((event) => event.kind === "securityRevealed"));
    await settle(() => s.state.pendingDecision === undefined);

    const defenderDeleted = s.events.findIndex(
      (event) => event.kind === "cardsMoved" && event.to === "trash" && event.instanceIds.includes(defenderId),
    );
    const trashReturned = s.events.findIndex(
      (event) =>
        event.kind === "cardsMoved" && event.to === "deckBottom" && event.instanceIds.includes(returnedIds[0]!),
    );
    const whenAttackingResolved = s.events.findIndex(
      (event) => event.kind === "effectResolved" && event.sourceCardId === "BT4-057",
    );
    const securityChecked = s.events.findIndex((event) => event.kind === "securityRevealed");
    expect(whenAttackingResolved).toBeGreaterThanOrEqual(0);
    expect(defenderDeleted).toBeGreaterThanOrEqual(0);
    expect(defenderDeleted).toBeLessThan(whenAttackingResolved);
    expect(trashReturned).toBeGreaterThan(defenderDeleted);
    expect(whenAttackingResolved).toBeGreaterThan(trashReturned);
    expect(securityChecked).toBeGreaterThan(whenAttackingResolved);
    expect(s.state.players[1]!.deck.map(({ instanceId }) => instanceId)).toEqual(expect.arrayContaining(returnedIds));
  });

  it("Q7477: a later Battle can target a Leomon played by an opponent immediate battle replacement", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: CARD_ID, as: "merciful" }],
          battleArea: [{ card: "AD1-020", as: "colorTamer" }],
          deck: ["BT1-012", "BT1-013"],
          security: ["BT1-090"],
        },
        1: {
          battleArea: [{ card: "BT9-050", as: "host", under: [{ card: "BT1-035", as: "newLeomon" }] }],
          security: ["BT1-015"],
        },
      },
      {
        autoAcceptOptional: true,
        declinePrompts: ["Attack"],
        autoChooseOption: true,
        autoSelectCards: true,
        preferOptionIndex: 0,
      },
    );
    s.state.memory = 10;
    await s.ready();
    const hostId = s.inst("host").instanceId;
    const newLeomonId = s.inst("newLeomon").instanceId;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("merciful").instanceId })).toEqual({
      ok: true,
    });
    await settle(() =>
      s.events.some(
        (event) => event.kind === "effectResolved" && event.sourceCardId === CARD_ID && event.timing === "OnPlay",
      ),
    );
    await settle(() => s.state.pendingDecision === undefined);

    // The first Battle would delete BT9-050, whose immediate replacement plays its Leomon
    // source. The second color-scaled Battle then scans the live board and finds it.
    expect(s.state.players[1]!.trash.map(({ instanceId }) => instanceId)).toEqual(
      expect.arrayContaining([hostId, newLeomonId]),
    );
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    const sourcePlayedIndex = s.events.findIndex(
      (event) => event.kind === "cardPlayed" && event.seat === 1 && event.cardId === "BT1-035",
    );
    const sourceDeletedIndex = s.events.findIndex(
      (event, index) =>
        index > sourcePlayedIndex && event.kind === "cardsMoved" && event.instanceIds.includes(newLeomonId),
    );
    const effectResolvedIndex = s.events.findIndex(
      (event) => event.kind === "effectResolved" && event.sourceCardId === CARD_ID,
    );
    expect(sourcePlayedIndex).toBeGreaterThanOrEqual(0);
    expect(sourceDeletedIndex).toBeGreaterThan(sourcePlayedIndex);
    expect(effectResolvedIndex).toBeGreaterThan(sourceDeletedIndex);
    const choiceIndices = s.decisions.flatMap(({ req: decision }, index) =>
      decision.kind === "chooseOption" && decision.promptText === "Omnimon: Merciful Mode" ? [index] : [],
    );
    const opponentReplacementIndex = s.decisions.findIndex(
      ({ seat, req: decision }) =>
        seat === 1 && decision.kind === "optional" && decision.promptText === "Play without paying the cost",
    );
    expect(choiceIndices).toHaveLength(2);
    expect(opponentReplacementIndex).toBeGreaterThan(choiceIndices[0]!);
    expect(choiceIndices[1]!).toBeGreaterThan(opponentReplacementIndex);
  });

  it("Q7469: the Battle branch can choose and battle a Digimon unaffected by effects", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: CARD_ID, as: "merciful" },
            { card: "AD1-001", as: "redAlly" },
          ],
          deck: ["BT1-012"],
          security: ["BT1-090"],
        },
        1: { battleArea: [{ card: "BT1-009", as: "immune" }], deck: ["BT1-013"], security: ["BT1-014"] },
      },
      {
        autoAcceptOptional: true,
        declinePrompts: ["Attack"],
        autoChooseOption: true,
        autoSelectCards: true,
        preferOptionIndex: 0,
      },
    );
    await s.ready();
    await advance(s.engine).verb.restrict(s.perm("immune").permanentId, "beAffected", EffectDuration.Permanent);
    expect(observe(s.engine).isRestricted(s.perm("immune"), "beAffected")).toBe(true);

    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("merciful"));
    await settle(() => s.state.players[1]!.battleArea.length === 0);

    expect(s.state.players[1]!.trash.map(({ cardId }) => cardId)).toContain("BT1-009");
  });

  it("uses the normal Omnimon alternate evolution and resolves When Digivolving Recovery", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "AD1-025", as: "omnimon", under: [{ card: "ST20-07", as: "greenSource" }] }],
          hand: [{ card: CARD_ID, as: "merciful" }],
          deck: [
            { card: "BT1-016", as: "digivolveDraw" },
            { card: "BT1-012", as: "recoveryCard" },
          ],
          security: [{ card: "BT1-090", as: "safeSecurity" }],
        },
        1: {
          trash: ["BT1-009", "BT1-010", "BT1-011", "BT1-012", "BT1-013"],
          deck: [{ card: "BT1-014", as: "opDeck" }],
          security: ["BT1-015"],
        },
      },
      { autoDeclineOptional: true, autoChooseOption: true, autoSelectCards: true, preferOptionIndex: 1 },
    );
    s.state.memory = 10;
    await s.ready();
    const sourceId = s.inst("omnimon").instanceId;
    const underId = s.inst("greenSource").instanceId;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("omnimon").permanentId,
        instanceId: s.inst("merciful").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("omnimon").topCard.cardId === CARD_ID);
    expect(s.state.memory).toBe(8);
    expect(s.perm("omnimon").stack.map(({ instanceId }) => instanceId)).toEqual([underId, sourceId]);
    expect(s.perm("omnimon").topCard.instanceId).toBe(s.inst("merciful").instanceId);
    expect(s.state.players[1]!.trash).toHaveLength(0);
    expect(s.state.players[0]!.security.map(({ instanceId }) => instanceId)).toEqual([
      s.inst("recoveryCard").instanceId,
      s.inst("safeSecurity").instanceId,
    ]);
  });
});
