import { digivolutionRequirementsFor, getCardDefinition, nameIncludesToken } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { registeredCompiledCards } from "../../engine/effects/interpreter/compiledCards.js";
import { runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled } from "./EX13-066.js";
import { compiled as originalBt1011 } from "../BT1/BT1-011.js";
import "./EX13-066.js";

const CARD_ID = "EX13-066";
const NOIR_ON_PLAY = "BT6-084";

const board = (s: ReturnType<typeof setupEngine>, seat: 0 | 1): string[] =>
  s.state.players[seat]!.battleArea.map((permanent) => permanent.topCard.cardId);

const trash = (s: ReturnType<typeof setupEngine>, seat: 0 | 1): string[] =>
  s.state.players[seat]!.trash.map((card) => card.cardId).sort();

describe("EX13-066 compiled fidelity", () => {
  it("matches the catalog and encodes both DUAL faces with no residual behaviour", () => {
    expect(getCardDefinition(CARD_ID)).toMatchObject({
      nameEn: "Sistermon Noir (Awakened)",
      colors: ["White", "Black"],
      kinds: ["Digimon", "Option"],
      level: 4,
      playCost: 5,
      dp: 6000,
      forms: ["Champion"],
      attributes: ["Virus"],
      types: ["Puppet"],
      evoCosts: [],
      isDualCard: true,
      dualEffect: "Mickey Bullet (Awakened)",
      optionColorRequirements: ["White"],
    });
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
    expect(compiled.digivolutionRequirement).toEqual([
      { namesExact: ["Sistermon Noir", "Sistermon Ciel"], cost: 1, isAlternate: true },
      { level: 3, texts: ["Huckmon"], cost: 3, isAlternate: true },
    ]);
    expect(digivolutionRequirementsFor(CARD_ID)).toEqual(compiled.digivolutionRequirement);
    expect(compiled.effects).toHaveLength(5);
    expect(compiled.effects[0]).toMatchObject({
      trigger: "Static",
      keywords: [{ keyword: "Decode" }],
    });
    expect(compiled.effects[1]).toMatchObject({
      trigger: "Rule",
      actions: [
        { kind: "GrantStatic", grant: "name", tokens: ["Sistermon Ciel (Awakened)"] },
        { kind: "GrantStatic", grant: "trait", tokens: ["Data"] },
      ],
    });
    expect(compiled.effects[2]).toMatchObject({
      trigger: "WhenDigivolving",
      actions: [
        {
          kind: "Delete",
          target: { filter: { controller: "opponent", kind: ["Digimon"], playCostLte: 4 }, count: 1 },
        },
      ],
    });
    expect(compiled.effects[3]).toMatchObject({
      trigger: "AllTurns",
      actions: [
        {
          kind: "Replacement",
          event: "wouldLeavePlay",
          leaveCause: "otherThanBattle",
          sourceFilter: { isSelfRef: true },
          actions: [
            {
              kind: "PlayWithoutCost",
              from: ["digivolutionCards"],
              payCost: false,
              playedByDecode: true,
              optional: true,
              target: {
                filter: {
                  hostFilter: { isSelfRef: true },
                  nameOrTrait: [{ tokens: ["Sistermon Noir", "Sistermon Ciel"], match: "nameExact" }],
                },
              },
            },
          ],
        },
      ],
    });
    expect(compiled.effects[4]).toMatchObject({
      trigger: "Main",
      actions: [
        {
          kind: "PlayWithoutCost",
          from: ["hand", "trash"],
          payCost: false,
          optional: true,
          target: {
            filter: { playCostLte: 4, nameOrTrait: [{ tokens: ["Sistermon"], match: "name" }] },
            count: 1,
          },
        },
        { kind: "SelectBind", target: { bindAs: "noirOpponent", count: 1 } },
        {
          kind: "DeDigivolve",
          amount: 1,
          scaling: { per: 1, unit: "cards", filter: { controller: "mine", kind: ["Digimon"] } },
          target: { fromSelectionRef: "noirOpponent", count: 1 },
        },
      ],
    });
    const optionPlay = compiled.effects[4]!.actions[0]! as unknown as {
      target: { filter: Record<string, unknown> };
    };
    expect(optionPlay.target.filter).not.toHaveProperty("kind");
    expect(registeredCompiledCards.get(CARD_ID)).toEqual(compiled);
  });

  it("Q7431-Q7432: is an Option card with [Huckmon] in its whole printed text", () => {
    const definition = getCardDefinition(CARD_ID)!;

    expect(definition.kinds).toContain("Option");
    expect(definition.nameEn).not.toContain("Huckmon");
    expect(definition.types).not.toContain("Huckmon");
    expect(definition.effectText).toContain("Huckmon");
  });
});

describe("EX13-066 [Rule] Also has Name / Trait", () => {
  it("carries the granted name and the [Data] attribute alongside its printed identity", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: CARD_ID, as: "noir" }] } });
    await s.ready();

    const noir = s.perm("noir");
    const grantedNames = observe(s.engine).grantedNames(noir);
    expect(grantedNames).toContain("sistermon ciel (awakened)");
    expect(grantedNames.some((name) => nameIncludesToken(name, "Sistermon Ciel"))).toBe(true);
    expect(observe(s.engine).effectiveNames(noir)).toEqual(["sistermon noir (awakened)", "sistermon ciel (awakened)"]);
    expect(observe(s.engine).hasEffectiveTrait(noir, "Data")).toBe(true);
    expect(observe(s.engine).hasEffectiveTrait(noir, "Virus")).toBe(true);
    expect(observe(s.engine).hasEffectiveTrait(noir, "Vaccine")).toBe(false);
    expect(observe(s.engine).hasEffectiveTrait(noir, "Puppet")).toBe(true);
    expect(observe(s.engine).hasKeyword(noir, "Decode")).toBe(true);
  });

  it("grants neither the name nor the attribute to an unrelated board neighbour", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: CARD_ID, as: "noir" },
          { card: "BT1-009", as: "neighbour" },
        ],
      },
    });
    await s.ready();

    expect(observe(s.engine).grantedNames(s.perm("neighbour"))).toEqual([]);
    expect(observe(s.engine).hasEffectiveTrait(s.perm("neighbour"), "Data")).toBe(false);
    expect(observe(s.engine).hasKeyword(s.perm("neighbour"), "Decode")).toBe(false);
  });
});

describe("EX13-066 digivolution routes", () => {
  it("digivolves from an exact [Sistermon Ciel] for 1 memory, keeping the source under it", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT10-085", as: "base" }],
        hand: [
          { card: CARD_ID, as: "noir" },
          { card: "BT1-013", as: "spare" },
        ],
      },
    });
    s.state.memory = 1;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("noir").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === CARD_ID);
    await settle();

    expect(s.state.memory).toBe(0);
    expect(s.perm("base").stack.map(({ cardId }) => cardId)).toEqual(["BT10-085"]);
    expect(s.perm("base").topCard.instanceId).toBe(s.inst("noir").instanceId);
    expect(s.state.players[0]!.hand.map(({ cardId }) => cardId)).toEqual(["BT1-013"]);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("digivolves from a Lv.3 carrying [Huckmon] in its text for 3 memory", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "EX13-009", as: "base" }],
        hand: [
          { card: CARD_ID, as: "noir" },
          { card: "BT1-013", as: "spare" },
        ],
      },
    });
    s.state.memory = 3;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("noir").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === CARD_ID);
    await settle();

    expect(s.state.memory).toBe(0);
    expect(s.perm("base").stack.map(({ cardId }) => cardId)).toEqual(["EX13-009"]);
  });

  it("refuses every illegal source: the (Awakened) near-name, a plain Lv.3, and a Lv.4 [Huckmon]", async () => {
    for (const [label, baseCardId] of [
      ["exact-name near miss", "BT7-083"],
      ["Lv.3 without [Huckmon]", "BT1-009"],
      ["Lv.4 with [Huckmon]", "EX13-011"],
    ] as const) {
      for (const useAlternateCost of [true, false]) {
        const s = setupEngine({
          0: {
            battleArea: [{ card: baseCardId, as: "base" }],
            hand: [{ card: CARD_ID, as: "noir" }],
          },
        });
        s.state.memory = 10;
        await s.ready();

        expect(
          s.engine.applyIntent(0, {
            type: "digivolve",
            permanentId: s.perm("base").permanentId,
            instanceId: s.inst("noir").instanceId,
            useAlternateCost,
          }),
          `${label} / useAlternateCost=${String(useAlternateCost)}`,
        ).toEqual(expect.objectContaining({ ok: false }));
        expect(s.perm("base").topCard.cardId).toBe(baseCardId);
        expect(s.state.memory).toBe(10);
      }
    }
  });
});

describe("EX13-066 [When Digivolving] Delete", () => {
  it("deletes an opposing play cost 4 Digimon and leaves the play cost 5 one alone", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT10-085", as: "base" }],
          hand: [
            { card: CARD_ID, as: "noir" },
            { card: "BT1-013", as: "spare" },
          ],
        },
        1: {
          battleArea: [
            { card: "BT10-085", as: "costFour" },
            { card: "BT7-082", as: "costFive" },
          ],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 1;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("noir").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.trash.length === 1);
    await settle();

    expect(board(s, 1)).toEqual(["BT7-082"]);
    expect(trash(s, 1)).toEqual(["BT10-085"]);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("is a no-op when the only opposing Digimon sits just above the ceiling at play cost 5", async () => {
    for (const [label, cardId, survives] of [
      ["play cost 5", "BT7-082", true],
      ["play cost 10", "BT1-080", true],
      ["play cost 4", "BT10-085", false],
      ["play cost 3", "BT1-014", false],
    ] as const) {
      const s = setupEngine(
        {
          0: {
            battleArea: [{ card: "BT10-085", as: "base" }],
            hand: [
              { card: CARD_ID, as: "noir" },
              { card: "BT1-013", as: "spare" },
            ],
          },
          1: { battleArea: [{ card: cardId, as: "subject" }] },
        },
        { autoSelectCards: true },
      );
      s.state.memory = 1;
      await s.ready();

      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: s.perm("base").permanentId,
          instanceId: s.inst("noir").instanceId,
          useAlternateCost: true,
        }),
      ).toEqual({ ok: true });
      await settle(() => s.perm("base").topCard.cardId === CARD_ID);
      await settle();

      expect({ label, battleArea: board(s, 1), trash: trash(s, 1) }).toEqual({
        label,
        battleArea: survives ? [cardId] : [],
        trash: survives ? [] : [cardId],
      });
      expect(s.state.pendingDecision).toBeUndefined();
    }
  });
});

describe("EX13-066 ＜Decode ([Sistermon Noir]/[Sistermon Ciel])＞", () => {
  const decodeBoard = (stack: string[]) => ({
    0: {
      battleArea: [{ card: CARD_ID, as: "noir", under: stack }],
      deck: ["BT1-009"],
      security: ["BT1-009"],
    },
    1: { battleArea: [{ card: "BT1-009", as: "attacker", dp: 12_000 }], security: ["BT1-009"] },
  });

  it("plays the exact [Sistermon Ciel] out of its own stack when an opponent effect deletes it", async () => {
    const s = setupEngine(decodeBoard(["BT1-009", "BT10-085"]), {
      autoAcceptOptional: true,
      autoSelectCards: true,
    });
    await s.ready();
    const noirId = s.perm("noir").permanentId;
    expect(observe(s.engine).hasKeyword(s.perm("noir"), "Decode")).toBe(true);

    advance(s.engine).verb.enterEffectResolution(1, ["Digimon"]);
    await advance(s.engine).verb.deletePermanent([noirId], "byEffect");
    advance(s.engine).verb.leaveEffectResolution();
    await settle(() => board(s, 0).includes("BT10-085"));
    await settle();

    expect(board(s, 0)).toEqual(["BT10-085"]);
    expect(s.state.players[0]!.battleArea[0]!.stack).toHaveLength(0);
    expect(trash(s, 0)).toEqual(["BT1-009", CARD_ID]);
    expect(s.state.memory).toBe(0);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("plays it from the trash zone of choice — the controller may decline and lose the stack", async () => {
    const s = setupEngine(decodeBoard(["BT1-009", "BT10-085"]), {
      autoDeclineOptional: true,
      autoSelectCards: true,
    });
    await s.ready();
    const noirId = s.perm("noir").permanentId;

    advance(s.engine).verb.enterEffectResolution(1, ["Digimon"]);
    await advance(s.engine).verb.deletePermanent([noirId], "byEffect");
    advance(s.engine).verb.leaveEffectResolution();
    await settle(() => s.state.players[0]!.trash.length === 3);
    await settle();

    expect(board(s, 0)).toEqual([]);
    expect(trash(s, 0)).toEqual(["BT1-009", "BT10-085", CARD_ID]);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("does not activate when the leave IS a battle deletion", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: CARD_ID, as: "noir", suspended: true, under: ["BT10-085"] }],
          security: ["BT1-009"],
        },
        1: { battleArea: [{ card: "BT1-009", as: "attacker", dp: 12_000 }], security: ["BT1-009"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    s.state.memory = 0;
    await s.ready();

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "permanent", permanentId: s.perm("noir").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.length === 2);
    await settle();

    expect(board(s, 0)).toEqual([]);
    expect(trash(s, 0)).toEqual(["BT10-085", CARD_ID]);
  });

  it("reads only its OWN stack, and only an exactly named source", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: CARD_ID, as: "noir", under: ["BT7-083", "BT1-009"] },
            { card: "BT1-013", as: "neighbour", under: ["BT10-085"] },
          ],
          deck: ["BT1-009"],
          security: ["BT1-009"],
        },
        1: { battleArea: [{ card: "BT1-009", as: "attacker", dp: 12_000 }], security: ["BT1-009"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    const noirId = s.perm("noir").permanentId;

    advance(s.engine).verb.enterEffectResolution(1, ["Digimon"]);
    await advance(s.engine).verb.deletePermanent([noirId], "byEffect");
    advance(s.engine).verb.leaveEffectResolution();
    await settle(() => s.state.players[0]!.trash.length === 3);
    await settle();

    expect(board(s, 0)).toEqual(["BT1-013"]);
    expect(s.perm("neighbour").stack.map(({ cardId }) => cardId)).toEqual(["BT10-085"]);
    expect(trash(s, 0)).toEqual(["BT1-009", "BT7-083", CARD_ID]);
    expect(s.state.pendingDecision).toBeUndefined();
  });
});

describe("EX13-066 Option side — Mickey Bullet (Awakened)", () => {
  const victim = () => ({
    card: "BT1-080",
    as: "victim",
    under: ["BT7-082", "BT7-083", "BT2-027"],
  });

  const whiteAnchor = () => ({ card: "BT20-084", as: "white" });

  it("Q7433: finishes Then before rule-deleting the newly played 0 DP Digimon", async () => {
    const { registerIrCard } = await import("../../engine/effects/interpreter.js");
    const auraId = "BT1-011";
    registerIrCard(auraId, {
      effects: [
        {
          trigger: "AllTurns",
          actions: [
            {
              kind: "Aura",
              target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: "all" },
              effect: { kind: "modifyDP", amount: -5000 },
            },
          ],
        },
      ],
      coverage: "full",
      residual: [],
    });
    try {
      const prefer: string[] = [];
      const s = setupEngine(
        {
          0: {
            battleArea: [whiteAnchor()],
            hand: [
              { card: CARD_ID, as: "mickey" },
              { card: NOIR_ON_PLAY, as: "freePlay" },
            ],
          },
          1: { battleArea: [{ card: auraId, as: "aura" }, victim()] },
        },
        {
          autoAcceptOptional: true,
          autoSelectCards: true,
          declinePrompts: ["Arts Digivolve"],
          preferInstanceIds: prefer,
        },
      );
      s.state.memory = 5;
      await s.ready();
      prefer.push(s.perm("victim").permanentId);

      expect(
        s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("mickey").instanceId, useAs: "option" }),
      ).toEqual({ ok: true });
      await settle(() => !s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === NOIR_ON_PLAY));
      await settle();

      expect(s.perm("victim").topCard.cardId).toBe("BT7-083");
      expect(s.perm("victim").stack.map(({ cardId }) => cardId)).toEqual(["BT7-082"]);
      expect(trash(s, 0)).toEqual(expect.arrayContaining([CARD_ID, NOIR_ON_PLAY]));
    } finally {
      registerIrCard(auraId, originalBt1011);
    }
  });

  it("leaves production card registrations unchanged after synthetic scenarios", () => {
    expect(runtimeCompiledCard("BT1-011")).toEqual(originalBt1011);
  });

  it("Q7434: Arts Digivolve removes the played Sistermon Noir's pending On Play effect", async () => {
    await import("../BT6/BT6-084.js");
    const s = setupEngine(
      {
        0: {
          battleArea: [whiteAnchor()],
          hand: [
            { card: CARD_ID, as: "mickey" },
            { card: NOIR_ON_PLAY, as: "artsTarget" },
          ],
        },
        1: {},
      },
      { autoAcceptOptional: true, autoSelectCards: false, autoOrderTriggers: true },
    );
    s.state.memory = 5;
    await s.ready();

    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("mickey").instanceId, useAs: "option" }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "selectCards");
    const handPlay = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: handPlay.decisionId,
        response: { kind: "selectCards", instanceIds: [s.inst("artsTarget").instanceId] },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.pendingDecision?.kind === "selectCards" && s.state.pendingDecision.decisionId !== handPlay.decisionId,
    );
    const decision = s.state.pendingDecision!;
    expect(decision.promptText).toContain("Arts Digivolve");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: decision.decisionId,
        response: { kind: "selectCards", instanceIds: [s.inst("artsTarget").instanceId] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("artsTarget").topCard.cardId === CARD_ID);
    await settle();

    expect(s.state.memory).toBe(0);
    expect(s.perm("artsTarget").stack.map(({ cardId }) => cardId)).toEqual([NOIR_ON_PLAY]);
    expect(
      s.events.some(
        (event) => event.kind === "effectResolved" && event.sourceCardId === NOIR_ON_PLAY && event.timing === "OnPlay",
      ),
    ).toBe(false);
  });

  it("plays a cost 4 [Sistermon] from hand for free, then De-Digivolves once per own Digimon", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [whiteAnchor()],
          hand: [
            { card: CARD_ID, as: "mickey" },
            { card: "BT10-085", as: "payload" },
            { card: "BT7-082", as: "tooExpensive" },
            { card: "BT1-013", as: "notSistermon" },
          ],
        },
        1: { battleArea: [victim()] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 5;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("mickey").instanceId,
        useAs: "option",
      } as never),
    ).toEqual({ ok: true });
    await settle(() => s.perm("victim").topCard.cardId === "BT7-083");
    await settle();

    expect(s.state.memory).toBe(0);
    expect(s.state.players[0]!.hand.map(({ cardId }) => cardId).sort()).toEqual(["BT1-013", "BT7-082"]);
    expect(s.perm("victim").topCard.cardId).toBe("BT7-083");
    expect(s.perm("victim").stack.map(({ cardId }) => cardId)).toEqual(["BT7-082"]);
    expect(trash(s, 1)).toEqual(["BT1-080", "BT2-027"]);
    expect(board(s, 0).sort()).toEqual(["BT20-084", CARD_ID]);
    expect(s.perm("white").stack).toHaveLength(0);
    expect(s.state.players[0]!.trash).toHaveLength(0);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("still De-Digivolves when the optional play is declined, counting one fewer Digimon", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [whiteAnchor()],
          hand: [
            { card: CARD_ID, as: "mickey" },
            { card: "BT10-085", as: "payload" },
          ],
        },
        1: { battleArea: [victim()] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 5;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("mickey").instanceId,
        useAs: "option",
      } as never),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.some(({ cardId }) => cardId === CARD_ID));
    await settle();

    expect(board(s, 0)).toEqual(["BT20-084"]);
    expect(s.state.players[0]!.hand.map(({ cardId }) => cardId)).toEqual(["BT10-085"]);
    expect(s.perm("victim").topCard.cardId).toBe("BT2-027");
    expect(s.perm("victim").stack.map(({ cardId }) => cardId)).toEqual(["BT7-082", "BT7-083"]);
    expect(trash(s, 1)).toEqual(["BT1-080"]);
    expect(trash(s, 0)).toEqual([CARD_ID]);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("peels once per own Digimon — three own Digimon peel three times", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [whiteAnchor(), { card: "BT1-013", as: "fillerA" }, { card: "BT1-009", as: "fillerB" }],
          hand: [{ card: CARD_ID, as: "mickey" }],
        },
        1: { battleArea: [victim()] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 5;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("mickey").instanceId,
        useAs: "option",
      } as never),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.some(({ cardId }) => cardId === CARD_ID));
    await settle();

    expect(s.perm("victim").topCard.cardId).toBe("BT7-082");
    expect(s.perm("victim").stack).toHaveLength(0);
    expect(trash(s, 1)).toEqual(["BT1-080", "BT2-027", "BT7-083"]);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("reaches a [Sistermon] in the trash, and refuses a cost 5 or cost 6 one", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [whiteAnchor()],
          hand: [
            { card: CARD_ID, as: "mickey" },
            { card: "BT7-082", as: "tooExpensive" },
            { card: "BT1-013", as: "notSistermon" },
          ],
          trash: [
            { card: "BT10-085", as: "payload" },
            { card: "BT7-083", as: "alsoTooExpensive" },
          ],
        },
        1: { battleArea: [victim()] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 5;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("mickey").instanceId,
        useAs: "option",
      } as never),
    ).toEqual({ ok: true });
    await settle(() => s.perm("victim").topCard.cardId === "BT7-083");
    await settle();

    expect(s.state.players[0]!.hand.map(({ cardId }) => cardId).sort()).toEqual(["BT1-013", "BT7-082"]);
    expect(trash(s, 0)).toEqual(["BT7-083"]);
    expect(s.perm("victim").stack.map(({ cardId }) => cardId)).toEqual(["BT7-082"]);
  });

  it("leaves the play clause empty when no [Sistermon] is cheap enough, and still peels", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [whiteAnchor()],
          hand: [
            { card: CARD_ID, as: "mickey" },
            { card: "BT7-082", as: "tooExpensive" },
            { card: "BT1-013", as: "notSistermon" },
          ],
        },
        1: { battleArea: [victim()] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 5;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("mickey").instanceId,
        useAs: "option",
      } as never),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.some(({ cardId }) => cardId === CARD_ID));
    await settle();

    expect(board(s, 0)).toEqual(["BT20-084"]);
    expect(s.state.players[0]!.hand.map(({ cardId }) => cardId).sort()).toEqual(["BT1-013", "BT7-082"]);
    expect(s.perm("victim").stack.map(({ cardId }) => cardId)).toEqual(["BT7-082", "BT7-083"]);
  });

  it("labels the mandatory De-Digivolve target prompt with its own clause, not the skipped play (GitHub #5430)", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [whiteAnchor()], hand: [{ card: CARD_ID, as: "mickey" }] },
        1: { battleArea: [victim(), { card: "BT1-080", as: "bystander", under: ["BT7-082"] }] },
      },
      { autoAcceptOptional: true },
    );
    s.state.memory = 5;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("mickey").instanceId,
        useAs: "option",
      } as never),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision !== undefined);

    const request = s.decisions.at(-1)!.req;
    expect(request.kind).toBe("chooseTargets");
    expect(request.options?.min).toBe(1);
    expect(request.options?.candidateInstanceIds).toEqual([
      s.perm("victim").permanentId,
      s.perm("bystander").permanentId,
    ]);
    expect(request.options?.effectTextPart).toBe(
      "Then, to 1 of your opponent's Digimon, ＜De-Digivolve 1＞ for each of your Digimon.",
    );
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: request.decisionId,
        response: { kind: "chooseTargets", instanceIds: [s.perm("victim").permanentId] },
      } as never),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined);
    expect(s.perm("victim").stack.map(({ cardId }) => cardId)).toEqual(["BT7-082", "BT7-083"]);
    expect(s.state.players[0]!.trash.some(({ cardId }) => cardId === CARD_ID)).toBe(true);
  });

  it("cannot be used as an Option without a white card in play", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-013", as: "notWhite" }],
          hand: [
            { card: CARD_ID, as: "mickey" },
            { card: "BT10-085", as: "payload" },
          ],
        },
        1: { battleArea: [victim()] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 5;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("mickey").instanceId,
        useAs: "option",
      } as never),
    ).toEqual({ ok: false, reason: "color-requirement-unmet" });
    expect(board(s, 0)).toEqual(["BT1-013"]);
    expect(s.perm("victim").topCard.cardId).toBe("BT1-080");
    expect(s.state.memory).toBe(5);
  });

  it("rejects a Digimon play declaration even when the Option cost is affordable", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [whiteAnchor()],
          hand: [
            { card: CARD_ID, as: "noir" },
            { card: "BT1-013", as: "spare" },
          ],
        },
        1: { battleArea: [victim()] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 5;
    await s.ready();

    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("noir").instanceId, useAs: "digimon" }),
    ).toEqual({ ok: false, reason: "not-playable-kind" });

    expect(s.state.memory).toBe(5);
    expect(board(s, 0)).toEqual(["BT20-084"]);
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toContain(CARD_ID);
    expect(s.perm("victim").topCard.cardId).toBe("BT1-080");
    expect(s.perm("victim").stack).toHaveLength(3);
    expect(trash(s, 1)).toEqual([]);
  });

  it("requires the Option side's White color for implicit hand use", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-013", as: "redAlly" }],
        hand: [{ card: CARD_ID, as: "noir" }],
      },
      1: { battleArea: [victim()] },
    });
    s.state.memory = 5;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("noir").instanceId })).toEqual({
      ok: false,
      reason: "color-requirement-unmet",
    });

    expect(s.state.memory).toBe(5);
    expect(board(s, 0)).not.toContain(CARD_ID);
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toContain(CARD_ID);
  });
});

describe("GitHub #4929 — Noir repeated De-Digivolve", () => {
  it("asks for one opponent and finishes when none of their Digimon have sources", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT6-082" }, { card: "ST12-12" }, { card: "BT6-084" }],
          hand: [{ card: "EX13-066", as: "noir" }],
        },
        1: {
          battleArea: [
            { card: "EX5-021", as: "first" },
            { card: "EX5-025", as: "second" },
          ],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();
    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("noir").instanceId, useAs: "option" }),
    ).toEqual({ ok: true });
    await settle(() =>
      s.events.some((e) => e.kind === "effectResolved" && e.sourceCardId === "EX13-066" && e.timing === "OnUseOption"),
    );
    expect(s.decisions.filter((d) => d.req.sourceCardId === "EX13-066" && d.req.kind === "chooseTargets")).toHaveLength(
      1,
    );
    expect(s.state.pendingDecision).toBeUndefined();
  });
});
