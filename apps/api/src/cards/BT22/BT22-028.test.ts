import { describe, expect, it } from "vitest";
import { EffectTiming } from "@aegis/shared";
import { advance } from "../../engine/testkit/advance.js";
import { settle, setupEngine } from "../../engine/testkit/harness.js";
import "../BT21/BT21-031.js";
import { compiled } from "./BT22-028.js";

describe("BT22-028 Ariemon", () => {
  it("plays one qualifying stack card at each level and shares the once-per-turn costed reaction", () => {
    expect(compiled.effects).toContainEqual(
      expect.objectContaining({
        trigger: "Static",
        keywords: [{ keyword: "Decode", raw: "＜Decode (Lv.6 or lower w/[Aqua]/[Sea Animal] in any trait)＞" }],
      }),
    );
    expect(compiled.effects).toContainEqual(
      expect.objectContaining({
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
                fromOwnDigivolutionStack: true,
                payCost: false,
                playedByDecode: true,
                optional: true,
                target: {
                  filter: {
                    controller: "mine",
                    kind: ["Digimon"],
                    levelComparison: { op: "lte", value: 6 },
                    nameOrTrait: [{ tokens: ["Aqua", "Sea Animal"], match: "traitContains" }],
                  },
                  count: 1,
                },
              },
            ],
          },
        ],
      }),
    );
    const digivolving = compiled.effects.filter((entry) => entry.trigger === "WhenDigivolving");
    expect(digivolving[0]?.optional).toBe(true);
    expect(digivolving[0]?.actions).toHaveLength(1);
    expect(digivolving[0]?.actions[0]).toMatchObject({
      kind: "PlayWithoutCost",
      fromOwnDigivolutionStack: true,
      optional: false,
      target: { filter: { levels: [3] } },
      additionalSimultaneousTargets: [{ filter: { levels: [4] } }, { filter: { levels: [5] } }],
    });
    for (const trigger of ["WhenDigivolving", "WhenAttacking"]) {
      const effect = compiled.effects.find((entry) => entry.trigger === trigger && entry.actions[0]?.kind === "Return");
      expect(effect).toMatchObject({
        frequency: "OncePerTurn",
        sharedUseKey: "ir-shared-0",
        actions: [
          {
            kind: "Return",
            to: "deckBottom",
            optional: true,
            abortOnDecline: true,
            cost: {
              kind: "place",
              position: "bottom",
              destination: "digivolutionStack",
              host: "self",
              targetIsPermanent: true,
            },
          },
          { kind: "Unsuspend", target: { filter: { isSelfRef: true }, isSelf: true } },
        ],
      });
    }
  });

  it("plays every available level bucket from a mixed realistic evolution stack as required by Q5213", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            {
              card: "BT22-028",
              as: "ariemon",
              under: ["BT14-008", "BT22-021", "BT22-024", "BT22-027"],
            },
          ],
        },
      },
      {
        autoAcceptOptional: true,
        autoSelectCards: true,
        declinePrompts: ["placing 1 of your other Digimon"],
      },
    );
    await s.ready();

    await advance(s.engine).fire(EffectTiming.WhenDigivolving, s.perm("ariemon"));
    await settle(() => s.state.players[0]!.battleArea.length === 4);

    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard?.cardId).sort()).toEqual([
      "BT14-008",
      "BT22-021",
      "BT22-024",
      "BT22-028",
    ]);
    expect(s.perm("ariemon").stack.map((card) => card.cardId)).toEqual(["BT22-027"]);
  });

  it("pays with another Digimon, bottom-decks exactly one opponent, unsuspends, and shares frequency", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT22-028", as: "ariemon", suspended: true },
            { card: "BT22-021", as: "cost" },
          ],
        },
        1: {
          battleArea: [
            { card: "BT22-024", as: "firstTarget" },
            { card: "BT22-024", as: "secondTarget" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).fire(EffectTiming.WhenDigivolving, s.perm("ariemon"));
    await settle(() => s.state.players[1]!.battleArea.length === 1);
    await settle();

    expect(s.perm("ariemon").stack.map((card) => card.cardId)).toEqual(["BT22-021"]);
    expect(s.state.players[1]!.deck.at(-1)?.cardId).toBe("BT22-024");
    expect(s.perm("ariemon").isSuspended).toBe(false);

    await advance(s.engine).fire(EffectTiming.OnUseAttack, s.perm("ariemon"));
    await settle();

    expect(s.state.players[1]!.battleArea).toHaveLength(1);
    expect(s.state.players[1]!.deck).toHaveLength(1);
  });

  it("leaves all zones and suspension unchanged when the optional stack cost is declined", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT22-028", as: "ariemon", suspended: true },
            { card: "BT22-021", as: "cost" },
          ],
        },
        1: { battleArea: [{ card: "BT22-024", as: "target" }] },
      },
      { autoAcceptOptional: false, autoSelectCards: true },
    );
    await s.ready();

    const resolution = advance(s.engine).fire(EffectTiming.OnUseAttack, s.perm("ariemon"));
    await settle(() => s.decisions.some((decision) => decision.req.kind === "optional"), 60);
    const prompt = s.decisions.find((decision) => decision.req.kind === "optional");
    expect(prompt).toBeDefined();
    if (prompt !== undefined) {
      expect(
        s.engine.applyIntent(prompt.seat, {
          type: "respondDecision",
          decisionId: prompt.req.decisionId,
          response: { kind: "optional", accept: false },
        }),
      ).toEqual({ ok: true });
    }
    await resolution;

    expect(s.perm("ariemon").isSuspended).toBe(true);
    expect(s.perm("ariemon").stack).toHaveLength(0);
    expect(s.state.players[0]!.battleArea).toHaveLength(2);
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
    expect(s.state.players[1]!.deck).toHaveLength(0);
  });

  it("executes Decode from its own stack on a non-battle leave", async () => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: "BT22-028", under: ["BT22-024"], as: "host" }] } },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    expect(await advance(s.engine).verb.deletePermanent([s.perm("host").permanentId], "byEffect")).toBe(1);
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === "BT22-024"));

    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard?.cardId)).toEqual(["BT22-024"]);
  });
});

describe("BT22-028 Ariemon — KB Q&A rulings", () => {
  it("lets the player choose the order of its simultaneous [When Digivolving] effects (Q4878)", async () => {
    async function digivolveResolvingFirst(firstEffect: "return" | "play") {
      const s = setupEngine(
        {
          0: {
            battleArea: [
              { card: "BT1-044", as: "host" },
              { card: "BT21-031", as: "sangomon" },
            ],
            hand: [{ card: "BT22-028", as: "ariemon" }],
          },
          1: { battleArea: [{ card: "BT1-009", as: "target" }] },
        },
        { autoOrderTriggers: false, autoAcceptOptional: true, autoSelectCards: true },
      );
      s.state.memory = 10;
      await s.ready();

      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: s.perm("host").permanentId,
          instanceId: s.inst("ariemon").instanceId,
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision?.kind === "orderTriggers");
      const order = s.decisions.findLast(({ req }) => req.kind === "orderTriggers")!.req;
      const ariemonKeys = (order.options?.triggerKeys ?? []).filter(
        (_, index) => order.options?.triggerCardIds?.[index] === "BT22-028",
      );
      expect(ariemonKeys).toHaveLength(2);
      const returnEffectKey = compiled.effects.find((effect) => effect.actions[0]?.kind === "Return")!.sharedUseKey!;
      const returnKey = ariemonKeys.find((key) => key.endsWith(returnEffectKey));
      const playKey = ariemonKeys.find((key) => key !== returnKey);
      const chosen = firstEffect === "return" ? returnKey : playKey;
      expect(chosen).toBeDefined();
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: order.decisionId,
          response: { kind: "orderTriggers", order: [chosen!] },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision === undefined && s.state.players[1]!.battleArea.length === 0);
      await settle();
      return s;
    }

    const returnFirst = await digivolveResolvingFirst("return");
    expect(returnFirst.state.players[1]!.deck.map((card) => card.cardId)).toEqual(["BT1-009"]);
    expect(returnFirst.state.players[0]!.battleArea.map((permanent) => permanent.topCard?.cardId).sort()).toEqual([
      "BT21-031",
      "BT22-028",
    ]);
    expect(returnFirst.perm("host").stack.map((card) => card.cardId)).toEqual(["BT1-044"]);

    const playFirst = await digivolveResolvingFirst("play");
    expect(playFirst.state.players[1]!.deck.map((card) => card.cardId)).toEqual(["BT1-009"]);
    expect(playFirst.state.players[0]!.battleArea.map((permanent) => permanent.topCard?.cardId)).toEqual(["BT22-028"]);
    expect(playFirst.perm("host").stack.map((card) => card.cardId)).toEqual(["BT21-031", "BT1-044"]);
  });
});

it("groups Ariemon's three levels into one public digivolution play event", async () => {
  const s = setupEngine(
    {
      0: {
        battleArea: [
          { card: "BT10-027", as: "source", under: ["BT18-020", "BT1-033", "BT10-023"] },
          { card: "BT1-010", as: "observer" },
        ],
        hand: [{ card: "BT22-028", as: "evolution" }],
      },
    },
    { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
  );
  s.state.memory = 10;
  await s.ready();
  const batches: string[][] = [];
  advance(s.engine).ledgers.subTriggers.subscribe({
    event: "whenPlayed",
    sourcePermanentId: s.perm("observer").permanentId,
    once: false,
    description: "test: observe simultaneous play subjects",
    run: async (ctx) => {
      batches.push(ctx.trigger.subjectPermanentIds ?? [ctx.trigger.subjectPermanentId!]);
    },
  });
  expect(
    s.engine.applyIntent(0, {
      type: "digivolve",
      permanentId: s.perm("source").permanentId,
      instanceId: s.inst("evolution").instanceId,
    }),
  ).toEqual({ ok: true });
  await settle();
  expect(batches.map((batch) => batch.length)).toEqual([3]);
  expect(s.state.pendingDecision).toBeUndefined();
});

describe("BT22-028 Ariemon — Yao Qinglan alternate digivolve route", () => {
  async function digivolveAriemon(
    board: { battleArea: { card: string; as: string }[] },
    baseAlias: string,
    opponentBattleArea: { card: string; as: string }[] = [],
  ) {
    const s = setupEngine({
      0: { ...board, hand: [{ card: "BT22-028", as: "ariemon" }], deck: ["BT1-010", "BT1-011"] },
      1: { battleArea: opponentBattleArea },
    });
    await s.ready();
    s.state.memory = 6;
    const result = s.engine.applyIntent(0, {
      type: "digivolve",
      permanentId: s.perm(baseAlias).permanentId,
      instanceId: s.inst("ariemon").instanceId,
    });
    return { s, result };
  }

  it("digivolves from MarineBullmon for cost 6 while you have Yao Qinglan", async () => {
    const { s, result } = await digivolveAriemon(
      {
        battleArea: [
          { card: "BT22-024", as: "marineBullmon" },
          { card: "BT19-082", as: "yao" },
        ],
      },
      "marineBullmon",
    );

    expect(result).toEqual({ ok: true });
    await settle(() => s.perm("marineBullmon").topCard?.cardId === "BT22-028");
    expect(s.state.memory).toBe(0);
  });

  it("refuses to digivolve onto the Yao Qinglan Tamer itself", async () => {
    const { s, result } = await digivolveAriemon(
      {
        battleArea: [
          { card: "BT22-024", as: "marineBullmon" },
          { card: "BT19-082", as: "yao" },
        ],
      },
      "yao",
    );

    expect(result).toEqual({ ok: false, reason: "invalid-evolution" });
    expect(s.perm("yao").topCard?.cardId).toBe("BT19-082");
    expect(s.state.memory).toBe(6);
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toEqual(["BT22-028"]);
  });

  it("refuses the MarineBullmon route without your own Yao Qinglan", async () => {
    const { s, result } = await digivolveAriemon(
      { battleArea: [{ card: "BT22-024", as: "marineBullmon" }] },
      "marineBullmon",
      [{ card: "BT19-082", as: "opponentYao" }],
    );

    expect(result).toEqual({ ok: false, reason: "invalid-evolution" });
    expect(s.perm("marineBullmon").topCard?.cardId).toBe("BT22-024");
    expect(s.state.memory).toBe(6);
  });
});
