import { describe, expect, it } from "vitest";
import { digivolutionRequirementsFor, EffectTiming } from "@aegis/shared";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { registeredCompiledCards } from "../../engine/effects/interpreter/compiledCards.js";
import { getEffectModule } from "../../engine/effects/registry.js";
import "../index.js";

it("GitHub #5274: evolves from the VB WereGarurumon for 3, without selecting a normal cost", async () => {
  const s = setupEngine(
    {
      0: {
        battleArea: [{ card: "EX12-032", as: "weregarurumon" }],
        hand: [{ card: "EX12-018", as: "siriusmon" }],
        deck: ["BT1-009"],
      },
    },
    { autoDeclineOptional: true, autoSelectCards: true },
  );
  s.state.memory = 10;
  await s.ready();
  expect(s.inst("siriusmon").digivolveRoutes.length).toBeGreaterThan(0);
  expect(s.inst("siriusmon").digivolveRoutes.every((r) => r.projectedCost === 3)).toBe(true);
  expect(
    s.engine.applyIntent(0, {
      type: "digivolve",
      permanentId: s.perm("weregarurumon").permanentId,
      instanceId: s.inst("siriusmon").instanceId,
    }),
  ).toEqual({ ok: true });
  await settle(() => s.engine.mainVerbContinuationsInFlight === 0 && s.state.pendingDecision === undefined);
  expect(s.perm("weregarurumon").topCard.cardId).toBe("EX12-018");
  expect(s.state.memory).toBe(7);
});

it("GitHub #5274: Use Req does not create an off-color route from a non-VB level 5", async () => {
  const s = setupEngine({
    0: {
      battleArea: [{ card: "BT1-038", as: "base" }, "EX12-007"],
      hand: [{ card: "EX12-018", as: "siriusmon" }],
    },
  });
  s.state.memory = 10;
  await s.ready();
  expect(s.inst("siriusmon").digivolveRoutes.some((r) => r.permanentId === s.perm("base").permanentId)).toBe(false);
  expect(
    s.engine.applyIntent(0, {
      type: "digivolve",
      permanentId: s.perm("base").permanentId,
      instanceId: s.inst("siriusmon").instanceId,
    }),
  ).toEqual({ ok: false, reason: "invalid-evolution" });
  expect(s.state.memory).toBe(10);
});

it.each([false, true])(
  "GitHub #5274: a red VB base retains both printed routes (alternate %s)",
  async (useAlternateCost) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX12-014", as: "base" }],
          hand: [{ card: "EX12-018", as: "siriusmon" }],
          deck: ["BT1-009"],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("siriusmon").instanceId,
        useAlternateCost,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.engine.mainVerbContinuationsInFlight === 0 && s.state.pendingDecision === undefined);
    expect(s.state.memory).toBe(useAlternateCost ? 7 : 6);
  },
);

describe("EX12-018 Siriusmon", () => {
  it("places up to two matching cards on digivolving and reduces an opposing Digimon by the full stack count", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX12-014", as: "base" }],
          hand: [
            { card: "EX12-018", as: "source" },
            { card: "EX12-007", as: "handMaterial" },
          ],
          trash: [{ card: "EX12-013", as: "trashMaterial" }],
        },
        1: { battleArea: [{ card: "BT1-011", as: "opponent", dp: 8000 }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 10;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("source").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").stack.length === 3 && s.perm("opponent").currentDP === 2000);

    expect(s.perm("base").topCard?.cardId).toBe("EX12-018");
    expect(s.perm("base").stack.map((card) => card.cardId)).toEqual(
      expect.arrayContaining(["EX12-014", "EX12-007", "EX12-013"]),
    );
    expect(s.perm("opponent").currentDP).toBe(2000);
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("handMaterial").instanceId)).toBe(false);
    expect(s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("trashMaterial").instanceId)).toBe(
      false,
    );
  });

  it("places a matching card during an attack and scales the temporary reduction", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX12-018", as: "source", under: ["EX12-007"] }],
          trash: [{ card: "EX12-013", as: "material" }],
        },
        1: { battleArea: [{ card: "BT1-011", as: "opponent", dp: 7000 }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );

    await advance(s.engine).fire(EffectTiming.OnUseAttack, s.perm("source"));
    await settle(() => s.perm("source").stack.length === 2 && s.perm("opponent").currentDP === 3000);

    expect(s.perm("source").stack.map((card) => card.cardId)).toEqual(expect.arrayContaining(["EX12-007", "EX12-013"]));
    expect(s.perm("opponent").currentDP).toBe(3000);
  });

  it("uses the shared When Attacking effect on a public attack without firing a newly placed inherited trigger (Q6748)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX12-018", as: "source" }],
          hand: [{ card: "BT1-009", as: "filler" }],
          trash: [{ card: "EX12-024", as: "newInherited" }],
          deck: ["BT1-090"],
        },
        1: {
          battleArea: [{ card: "BT1-011", as: "opponent", dp: 5000 }],
          security: ["BT1-009", "BT1-009", "BT1-009"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 10;
    const inheritedId = s.inst("newInherited").instanceId;
    const fillerId = s.inst("filler").instanceId;
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("source").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("source").stack.some((card) => card.instanceId === inheritedId));

    expect(s.perm("source").stack.map((card) => card.cardId)).toEqual(["EX12-024"]);
    expect(s.perm("opponent").currentDP).toBe(3000);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([fillerId]);
    expect(s.state.players[0]!.deck.map((card) => card.cardId)).toEqual(["BT1-090"]);
    expect(s.state.players[1]!.security).toHaveLength(1);
    expect(s.state.memory).toBe(10);

    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it("counts a Digi-Egg digivolution card in the per-card reduction", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX12-018", as: "source", under: ["BT1-003", "EX12-007"] }],
          trash: [{ card: "EX12-013", as: "material" }],
          deck: Array.from({ length: 8 }, () => "BT1-009"),
        },
        1: {
          battleArea: [{ card: "BT1-011", as: "opponent", dp: 8000 }],
          security: ["BT1-009", "BT1-009"],
          deck: Array.from({ length: 8 }, () => "BT1-010"),
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("source").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.filter((event) => event.kind === "securityChecked").length === 2);
    await settle(() => s.perm("source").stack.length === 3 && s.perm("opponent").currentDP === 2000);

    expect(s.perm("source").stack.map((card) => card.cardId)).toEqual(
      expect.arrayContaining(["BT1-003", "EX12-007", "EX12-013"]),
    );
    expect(s.perm("opponent").currentDP).toBe(2000);
    expect(s.state.players[1]!.security).toHaveLength(0);
    expect(s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("material").instanceId)).toBe(false);
    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it("matches Gammamon anywhere in a card's text, not only its name or trait (Q6747)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX12-018", as: "source" }],
          trash: [{ card: "BT16-062", as: "textMatch" }],
        },
        1: { battleArea: [{ card: "BT1-011", as: "opponent", dp: 5000 }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );

    await advance(s.engine).fire(EffectTiming.WhenDigivolving, s.perm("source"));

    expect(s.perm("source").stack.map((card) => card.cardId)).toContain("BT16-062");
    expect(s.perm("opponent").currentDP).toBe(3000);
  });

  it("does not trigger a newly placed When Attacking inherited effect in the current attack window (Q6748)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX12-018", as: "source" }],
          trash: [{ card: "EX12-024", as: "newInherited" }],
          deck: ["BT1-090"],
        },
        1: { battleArea: [{ card: "BT1-011", as: "opponent", dp: 5000 }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );

    await advance(s.engine).fire(EffectTiming.OnUseAttack, s.perm("source"));

    expect(s.perm("source").stack.map((card) => card.cardId)).toContain("EX12-024");
    expect(s.state.players[0]!.deck).toHaveLength(1);
  });

  it("does not apply the reduction when no matching card can be placed", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "EX12-018", as: "source" }] },
        1: { battleArea: [{ card: "BT1-011", as: "opponent", dp: 7000 }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );

    await advance(s.engine).fire(EffectTiming.WhenDigivolving, s.perm("source"));
    await settle();

    expect(s.perm("source").stack).toHaveLength(0);
    expect(s.perm("opponent").currentDP).toBe(7000);
  });

  it("lets the controller place a selected card at the bottom instead of the top", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX12-018", as: "source", under: ["EX12-007"] }],
          hand: [{ card: "EX12-013", as: "material" }],
        },
        1: { battleArea: [{ card: "BT1-011", as: "opponent", dp: 7000 }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );

    const resolving = advance(s.engine).fire(EffectTiming.WhenDigivolving, s.perm("source"));
    await settle(() => s.decisions.some(({ req }) => req.kind === "chooseOption"));
    const placement = s.decisions.find(({ req }) => req.kind === "chooseOption")!;
    expect(placement.req.options?.choices).toEqual(["top", "bottom"]);
    expect(
      s.engine.applyIntent(placement.seat, {
        type: "respondDecision",
        decisionId: placement.req.decisionId,
        response: { kind: "chooseOption", optionIndex: 1 },
      }),
    ).toEqual({ ok: true });
    await resolving;

    expect(s.perm("source").stack.map((card) => card.cardId)).toEqual(["EX12-013", "EX12-007"]);
    expect(s.perm("opponent").currentDP).toBe(3000);
  });

  it("deletes the highest opposing Digimon when used as Planet Punch", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "EX12-018", as: "option" }],
          battleArea: [{ card: "EX12-021", as: "attacker", dp: 20_000 }],
        },
        1: {
          battleArea: [
            { card: "BT1-011", as: "lower", dp: 5000 },
            { card: "BT1-011", as: "highest", dp: 7000 },
          ],
          security: ["BT1-090"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();
    const highestId = s.perm("highest").permanentId;

    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId, useAs: "option" } as never),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.every((permanent) => permanent.permanentId !== highestId));

    expect(s.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === highestId)).toBe(false);
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
    expect(s.events.some((event) => event.kind === "attackDeclared")).toBe(true);
    expect(s.perm("attacker").isSuspended).toBe(true);
  });

  it("rejects Planet Punch without a red color source or an own VB card", () => {
    const s = setupEngine({
      0: { hand: [{ card: "EX12-018", as: "option" }], battleArea: [{ card: "BT1-029", as: "blue" }] },
    });
    s.state.memory = 5;

    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId, useAs: "option" } as never),
    ).toEqual(expect.objectContaining({ ok: false }));
  });

  it("still deletes the highest opposing Digimon when the optional Planet Punch attack is declined", async () => {
    const s = setupEngine(
      {
        0: { hand: [{ card: "EX12-018", as: "option" }], battleArea: [{ card: "BT1-009", as: "attacker" }] },
        1: { battleArea: [{ card: "BT1-011", as: "highest", dp: 7000 }] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 5;

    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId, useAs: "option" } as never),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 0);

    expect(s.events.some((event) => event.kind === "attackDeclared")).toBe(false);
  });

  it("does not open a new When Attacking window after Planet Punch Arts Digivolves the attacker (Q6749)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX12-014", as: "attacker" }],
          hand: [{ card: "EX12-018", as: "option" }],
          trash: [{ card: "EX12-013", as: "material" }],
        },
        1: {
          battleArea: [{ card: "BT1-011", as: "deletion", dp: 5000 }],
          security: ["BT1-090"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 5;

    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId, useAs: "option" } as never),
    ).toEqual({ ok: true });
    await settle(() => s.perm("attacker").topCard?.cardId === "EX12-018");

    expect(s.events.filter((event) => event.kind === "attackDeclared")).toHaveLength(1);
    expect(s.perm("attacker").stack.map((card) => card.cardId)).toContain("EX12-013");
  });

  it.each([
    ["from hand", false],
    ["through Proximamon's [When Digivolving]", true],
  ] as const)(
    "resolves the Arts Digivolve [When Digivolving] before the attack checks security (%s)",
    async (_label, throughProximamon) => {
      const preferred: string[] = [];
      const s = setupEngine(
        {
          0: throughProximamon
            ? {
                battleArea: [
                  { card: "EX12-018", as: "siriusmon" },
                  { card: "EX12-014", as: "attacker" },
                ],
                hand: [{ card: "EX12-077", as: "proximamon" }],
                trash: [{ card: "EX12-013", as: "material" }],
              }
            : {
                battleArea: [{ card: "EX12-014", as: "attacker" }],
                hand: [{ card: "EX12-018", as: "option" }],
                trash: [{ card: "EX12-013", as: "material" }],
              },
          1: {
            battleArea: [{ card: "BT1-011", as: "deletion", dp: 5000 }],
            security: ["BT1-090", "BT1-090"],
          },
        },
        { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true, preferInstanceIds: preferred },
      );
      s.state.memory = 5;
      await s.ready();
      preferred.push(s.perm("attacker").permanentId, s.perm("attacker").topCard.instanceId);
      if (throughProximamon) preferred.push(s.perm("siriusmon").topCard.instanceId);

      expect(
        s.engine.applyIntent(
          0,
          throughProximamon
            ? {
                type: "digivolve",
                permanentId: s.perm("siriusmon").permanentId,
                instanceId: s.inst("proximamon").instanceId,
                useAlternateCost: true,
              }
            : ({ type: "playCard", instanceId: s.inst("option").instanceId, useAs: "option" } as never),
        ),
      ).toEqual({ ok: true });
      await settle(() => s.events.some((event) => event.kind === "securityRevealed"));

      const whenDigivolving = s.events.findIndex(
        (event) =>
          event.kind === "effectTriggered" &&
          event.sourceCardId === "EX12-018" &&
          event.sourcePermanentId === s.perm("attacker").permanentId,
      );
      const securityRevealed = s.events.findIndex((event) => event.kind === "securityRevealed");
      expect(s.perm("attacker").topCard.cardId).toBe("EX12-018");
      expect(whenDigivolving).toBeGreaterThanOrEqual(0);
      expect(whenDigivolving).toBeLessThan(securityRevealed);
    },
  );

  it("has Progress and Piercing, and checks two security after winning a Digimon battle", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "EX12-018", as: "attacker" }] },
        1: {
          battleArea: [{ card: "BT1-009", as: "defender", dp: 1000, suspended: true }],
          security: ["BT1-009", "BT1-009"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    await s.ready();

    expect(observe(s.engine).hasKeyword(s.perm("attacker"), "Progress")).toBe(true);
    expect(observe(s.engine).hasPierce(s.perm("attacker"))).toBe(true);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "permanent", permanentId: s.perm("defender").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 0);

    expect(s.state.players[1]!.security).toHaveLength(0);
  });

  it("encodes Progress, Piercing, Security Attack +1, waive-color, shared timing, and evolution routes", () => {
    const compiled = registeredCompiledCards.get("EX12-018")!;
    expect(compiled.digivolutionRequirement).toEqual([
      { level: 5, texts: ["Gammamon"], cost: 3, isAlternate: true },
      { traits: ["VB"], cost: 3, isAlternate: true, level: 5 },
    ]);
    const keywords = compiled.effects
      .filter((effect) => effect.trigger === "Static")
      .flatMap((effect) => effect.keywords ?? []);
    expect(keywords.map((keyword) => keyword.keyword)).toEqual(["Progress", "Piercing", "SecurityAttack"]);
    expect(keywords.find((keyword) => keyword.keyword === "SecurityAttack")).toMatchObject({ amount: 1 });
    const module = getEffectModule("EX12-018")!;
    expect(
      module.effectsForTiming(EffectTiming.WhenDigivolving, { cardId: "EX12-018", ownerSeat: 0 } as never),
    ).toHaveLength(1);
    expect(
      module.effectsForTiming(EffectTiming.OnUseAttack, { cardId: "EX12-018", ownerSeat: 0 } as never),
    ).toHaveLength(1);
    for (const trigger of ["WhenDigivolving", "WhenAttacking"]) {
      expect(compiled.effects.find((effect) => effect.trigger === trigger)).toMatchObject({
        frequency: "OncePerTurn",
        sharedUseKey: "ir-shared-0",
        actions: [
          {
            kind: "PlaceUnder",
            optional: true,
            position: "choice",
            target: { count: 2, upTo: true, from: ["hand", "trash"] },
          },
          {
            kind: "ModifyDP",
            amount: -2000,
            duration: "untilOpponentTurnEnd",
            condition: { kind: "ifThisEffectActed" },
            scaling: { per: 1, unit: "digivolutionCards" },
          },
        ],
      });
    }
    expect(
      compiled.effects.find(
        (effect) =>
          effect.trigger === "Static" && effect.actions?.some((action) => action.kind === "WaiveColorRequirement"),
      ),
    ).toMatchObject({
      actions: [
        {
          kind: "WaiveColorRequirement",
          condition: { kind: "youHave", filter: { nameOrTrait: [{ tokens: ["VB"], match: "trait" }] } },
        },
      ],
    });
  });

  it("uses both normal colors and both cost-3 evolution alternatives", async () => {
    expect(digivolutionRequirementsFor("EX12-018")).toEqual([
      { level: 5, texts: ["Gammamon"], cost: 3, isAlternate: true },
      { level: 5, traits: ["VB"], cost: 3, isAlternate: true },
    ]);
    for (const [baseCardId, useAlternateCost, startingMemory] of [
      ["AD1-003", false, 4],
      ["AD1-015", false, 4],
      ["BT16-062", true, 3],
      ["EX12-032", true, 3],
    ] as const) {
      const s = setupEngine({
        0: {
          battleArea: [{ card: baseCardId, as: "base" }],
          hand: [{ card: "EX12-018", as: "siriusmon" }],
        },
      });
      s.state.memory = startingMemory;
      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: s.perm("base").permanentId,
          instanceId: s.inst("siriusmon").instanceId,
          useAlternateCost,
        }),
      ).toEqual({ ok: true });
      await settle(() => s.perm("base").topCard.cardId === "EX12-018");
      expect(s.state.memory).toBe(0);
    }
  });

  describe("Discord 1555224478416633927: places the whole group at one chosen end", () => {
    function setupGroupPlacement(opponentDP: number) {
      const s = setupEngine(
        {
          0: {
            battleArea: [{ card: "EX12-014", as: "base", under: ["BT1-009"] }],
            hand: [
              { card: "EX12-018", as: "source" },
              { card: "EX12-007", as: "handMaterial" },
            ],
            trash: [{ card: "EX12-013", as: "trashMaterial" }],
          },
          1: { battleArea: [{ card: "BT1-011", as: "opponent", dp: opponentDP }] },
        },
        { autoAcceptOptional: true, autoSelectCards: true, autoOrderCards: false },
      );
      s.state.memory = 10;
      return s;
    }

    const placementPrompts = (s: ReturnType<typeof setupGroupPlacement>) =>
      s.decisions.filter(({ req }) => req.kind === "chooseOption");
    const orderPrompts = (s: ReturnType<typeof setupGroupPlacement>) =>
      s.decisions.filter(({ req }) => req.kind === "orderCards");

    async function placeGroup(
      s: ReturnType<typeof setupGroupPlacement>,
      optionIndex: number,
      order: (handId: string, trashId: string) => string[],
    ) {
      const handId = s.inst("handMaterial").instanceId;
      const trashId = s.inst("trashMaterial").instanceId;
      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: s.perm("base").permanentId,
          instanceId: s.inst("source").instanceId,
        }),
      ).toEqual({ ok: true });
      await settle(() => placementPrompts(s).length > 0);
      const placement = placementPrompts(s)[0]!;
      expect(placement.req.options?.choices).toEqual(["top", "bottom"]);
      expect(placement.req.options?.topBottomZone).toBe("digivolutionCards");
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: placement.req.decisionId,
          response: { kind: "chooseOption", optionIndex },
        }),
      ).toEqual({ ok: true });
      await settle(() => placementPrompts(s).length > 1 || orderPrompts(s).length > 0);
      expect(placementPrompts(s)).toHaveLength(1);
      const ordering = orderPrompts(s)[0]!;
      expect([...(ordering.req.options?.candidateInstanceIds ?? [])].sort()).toEqual([handId, trashId].sort());
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: ordering.req.decisionId,
          response: { kind: "orderCards", order: order(handId, trashId) },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision === undefined && s.perm("opponent").currentDP === 2000);
      return { handId, trashId, ordering };
    }

    function placementMoves(s: ReturnType<typeof setupGroupPlacement>, ids: string[]) {
      return s.events.filter(
        (event) =>
          event.kind === "cardsMoved" &&
          event.to === "battleArea" &&
          event.instanceIds.some((instanceId) => ids.includes(instanceId)),
      );
    }

    it("asks top or bottom once and places both cards at the bottom in the chosen order", async () => {
      const s = setupGroupPlacement(10_000);
      const { handId, trashId, ordering } = await placeGroup(s, 1, (hand, trash) => [trash, hand]);

      expect(ordering.req.options?.orderDestination).toBe("stackBottom");
      expect(
        s
          .perm("base")
          .stack.map((card) => card.instanceId)
          .slice(0, 2),
      ).toEqual([trashId, handId]);
      expect(s.perm("base").stack.map((card) => card.cardId)).toEqual(["EX12-013", "EX12-007", "BT1-009", "EX12-014"]);
      const moves = placementMoves(s, [handId, trashId]);
      expect(moves).toHaveLength(2);
      expect(moves.flatMap((event) => (event.kind === "cardsMoved" ? event.instanceIds : [])).sort()).toEqual(
        [handId, trashId].sort(),
      );
      expect(s.perm("opponent").currentDP).toBe(2000);
    });

    it("asks top or bottom once and places both cards directly beneath the top card in the chosen order", async () => {
      const s = setupGroupPlacement(10_000);
      const { handId, trashId, ordering } = await placeGroup(s, 0, (hand, trash) => [hand, trash]);

      expect(ordering.req.options?.orderDestination).toBe("stackTop");
      expect(s.perm("base").topCard.cardId).toBe("EX12-018");
      expect(
        s
          .perm("base")
          .stack.map((card) => card.instanceId)
          .slice(2),
      ).toEqual([trashId, handId]);
      expect(s.perm("base").stack.map((card) => card.cardId)).toEqual(["BT1-009", "EX12-014", "EX12-013", "EX12-007"]);
      expect(placementMoves(s, [handId, trashId])).toHaveLength(2);
      expect(s.perm("opponent").currentDP).toBe(2000);
    });
  });

  it("rejects an off-color level-5 card without Gammamon text or VB", () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-038", as: "base" }],
        hand: [{ card: "EX12-018", as: "siriusmon" }],
      },
    });
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("siriusmon").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual(expect.objectContaining({ ok: false }));
  });
});
