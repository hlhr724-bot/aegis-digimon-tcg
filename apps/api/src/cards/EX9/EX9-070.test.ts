import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled } from "./EX9-070.js";
import "../index.js";

describe("EX9-070", () => {
  it.each([
    { ruling: "Q4743", base: "EX9-025", evolution: "EX9-030", egg: true, suspended: false, cost: 1 },
    { ruling: "Q4743 without Tokomon", base: "EX9-025", evolution: "EX9-030", egg: false, suspended: false, cost: 2 },
    { ruling: "Q4884", base: "EX9-025", evolution: "BT22-038", egg: false, suspended: false, cost: 1 },
    { ruling: "Q4915", base: "EX9-017", evolution: "BT22-061", egg: false, suspended: false, cost: 1 },
    { ruling: "Q4939", base: "BT22-038", evolution: "BT22-076", egg: false, suspended: false, cost: 1 },
    {
      ruling: "Q4939 with two physical copies",
      base: "BT22-038",
      evolution: "BT22-076",
      egg: false,
      suspended: false,
      cost: 1,
      copies: 2,
    },
    { ruling: "Q5195", base: "P-202", evolution: "EX9-011", egg: false, suspended: true, cost: 0 },
    { ruling: "Q5195 unsuspended", base: "P-202", evolution: "EX9-011", egg: false, suspended: false, cost: 1 },
  ])(
    "$ruling combines only applicable reductions with Meat",
    async ({ base, evolution, egg, suspended, cost, copies = 1 }) => {
      const options = {
        autoDeclineOptional: false,
        autoSelectCards: true,
        autoChooseOption: true,
        preferInstanceIds: [] as string[],
      };
      const s = setupEngine(
        {
          0: {
            battleArea: [
              { card: "EX9-070", as: "meat" },
              { card: base, as: "host", suspended, under: egg ? ["EX9-003", "EX9-023"] : [] },
            ],
            hand: [{ card: "BT1-009", as: "cost" }, ...Array.from({ length: copies }, () => evolution)],
            deck: ["BT1-048"],
          },
        },
        options,
      );
      s.perm("meat").placedByEffect = true;
      options.preferInstanceIds.push(s.inst("cost").instanceId);
      s.state.memory = 5;
      await s.ready();
      const ability = observe(s.engine).activatableEffects(s.perm("meat"))[0]!;
      expect(ability).toBeDefined();
      expect(
        s.engine.applyIntent(0, {
          type: "activateEffect",
          sourceInstanceId: s.perm("meat").topCard.instanceId,
          effectKey: ability.effectKey,
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision?.kind === "optional");
      const choice = s.state.pendingDecision!;
      expect(choice.kind).toBe("optional");

      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: choice.decisionId,
          response: { kind: "optional", accept: true },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision?.kind === "optional");
      options.autoDeclineOptional = true;
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: s.state.pendingDecision!.decisionId,
          response: { kind: "optional", accept: true },
        }),
      ).toEqual({ ok: true });

      await settle();
      expect(s.perm("host").topCard.cardId).toBe(evolution);
      expect(s.perm("host").stack[0]).toMatchObject({ cardId: "BT1-009", faceUp: false });
      expect(s.perm("host").stack.at(-1)?.cardId).toBe(base);
      expect(s.state.memory).toBe(5 - cost);
      expect(s.state.players[0]!.hand.map((card) => card.cardId)).toEqual([
        ...Array.from({ length: copies - 1 }, () => evolution),
        "BT1-048",
      ]);
      expect(s.state.players[0]!.trash.map((card) => card.cardId)).toEqual(["EX9-070"]);
      expect(s.state.pendingDecision).toBeUndefined();
    },
  );
  it("Q4742 rejects Meat during EX9-002's Training-triggered evolution and charges that effect's reduced cost", async () => {
    const options = { autoAcceptOptional: false, autoSelectCards: true, autoChooseOption: true };
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX9-070", as: "meat" },
            { card: "EX9-015", as: "host", under: ["EX9-002"] },
          ],
          hand: ["EX9-017", "BT1-009"],
          deck: ["BT1-009", "BT1-048"],
        },
      },
      options,
    );
    s.perm("meat").placedByEffect = true;
    s.state.memory = 4;
    await s.ready();
    const meatId = s.perm("meat").topCard.instanceId;
    const meat = observe(s.engine).activatableEffects(s.perm("meat"))[0]!;
    const training = observe(s.engine).activatableEffects(s.perm("host"))[0]!;
    expect(meat).toBeDefined();
    expect(training).toBeDefined();
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: s.perm("host").topCard.instanceId,
        effectKey: training.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const choice = s.state.pendingDecision!;
    expect(choice.kind).toBe("optional");
    expect(
      s.engine.applyIntent(0, { type: "activateEffect", sourceInstanceId: meatId, effectKey: meat.effectKey }).ok,
    ).toBe(false);
    expect(s.state.pendingDecision?.decisionId).toBe(choice.decisionId);
    options.autoAcceptOptional = true;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: choice.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await settle();
    expect(s.perm("host").topCard.cardId).toBe("EX9-017");
    expect(s.state.memory).toBe(3);
    expect(s.perm("meat").topCard.instanceId).toBe(meatId);
    expect(s.state.players[0]!.trash.some((card) => card.cardId === "EX9-070")).toBe(false);
    expect(s.state.pendingDecision).toBeUndefined();
  });
  it.each([
    { egg: "EX9-001", evolution: "EX9-009", fromTrash: false },
    { egg: "EX9-006", evolution: "EX9-010", fromTrash: true },
  ])(
    "Q4741/Q4749 reject Meat during the inherited attack evolution from $egg",
    async ({ egg, evolution, fromTrash }) => {
      const options = { autoAcceptOptional: false, autoSelectCards: true, autoChooseOption: true };
      const s = setupEngine(
        {
          0: {
            battleArea: [
              { card: "EX9-070", as: "meat" },
              { card: "EX9-008", as: "host", under: [{ card: "BT1-009", faceUp: false }, egg] },
            ],
            hand: [evolution, "BT1-009"],
            trash: fromTrash ? [evolution] : [],
            deck: ["BT1-048"],
          },
          1: { security: ["BT1-046"] },
        },
        options,
      );
      s.perm("meat").placedByEffect = true;
      s.state.memory = 4;
      await s.ready();
      const meatId = s.perm("meat").topCard.instanceId;
      const ability = observe(s.engine).activatableEffects(s.perm("meat"))[0]!;
      expect(ability).toBeDefined();
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: s.perm("host").permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision?.kind === "optional");
      const choice = s.state.pendingDecision!;
      expect(choice.kind).toBe("optional");
      expect(
        s.engine.applyIntent(0, { type: "activateEffect", sourceInstanceId: meatId, effectKey: ability.effectKey }).ok,
      ).toBe(false);
      expect(s.state.pendingDecision?.decisionId).toBe(choice.decisionId);
      options.autoAcceptOptional = true;
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: choice.decisionId,
          response: { kind: "optional", accept: true },
        }),
      ).toEqual({ ok: true });
      await settle();
      expect(s.perm("host").topCard.cardId).toBe(evolution);
      expect(s.state.memory).toBe(3);
      expect(s.perm("meat").topCard.instanceId).toBe(meatId);
      expect(s.state.players[0]!.trash.some((card) => card.cardId === "EX9-070")).toBe(false);
      expect(s.state.players[1]!.security).toHaveLength(0);
      expect(s.state.pendingDecision).toBeUndefined();
    },
  );
  it("Q4831 rejects a second Delay during the first and combines only the intrinsic Ver.4 reduction", async () => {
    const options = {
      autoAcceptOptional: false,
      autoSelectCards: true,
      autoOrderTriggers: true,
      preferInstanceIds: [] as string[],
    };
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX9-070", as: "first" },
            { card: "EX9-070", as: "second" },
            { card: "EX9-038", as: "host" },
          ],
          hand: [
            { card: "BT1-009", as: "cost" },
            { card: "EX9-063", as: "evo" },
          ],
          deck: ["BT1-048"],
        },
      },
      options,
    );
    options.preferInstanceIds.push(s.inst("cost").instanceId);
    s.perm("first").placedByEffect = true;
    s.perm("second").placedByEffect = true;
    s.state.memory = 3;
    await s.ready();
    const first = observe(s.engine).activatableEffects(s.perm("first"))[0]!;
    const second = observe(s.engine).activatableEffects(s.perm("second"))[0]!;
    const secondId = s.perm("second").topCard.instanceId;
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: s.perm("first").topCard.instanceId,
        effectKey: first.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const decision = s.state.pendingDecision!;
    expect(decision.kind).toBe("optional");
    expect(
      s.engine.applyIntent(0, { type: "activateEffect", sourceInstanceId: secondId, effectKey: second.effectKey }).ok,
    ).toBe(false);
    expect(s.state.pendingDecision?.decisionId).toBe(decision.decisionId);
    expect(s.perm("second").topCard.instanceId).toBe(secondId);
    options.autoAcceptOptional = true;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: decision.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await settle();
    expect(s.perm("host").topCard.cardId).toBe("EX9-063");
    expect(s.state.memory).toBe(2);
    expect(s.perm("second").topCard.instanceId).toBe(secondId);
    expect(s.state.players[0]!.trash.filter((card) => card.cardId === "EX9-070")).toHaveLength(1);
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toEqual(["BT1-048"]);
    expect(s.state.pendingDecision).toBeUndefined();
  });
  it.each([
    { card: "EX9-068", breeding: false, opponent: false, legal: true },
    { card: "EX9-015", breeding: false, opponent: false, legal: true },
    { card: "EX9-015", breeding: true, opponent: false, legal: true },
    { card: "EX9-024", breeding: false, opponent: false, legal: false },
    { card: "BT1-030", breeding: false, opponent: false, legal: false },
    { card: "EX9-015", breeding: false, opponent: true, legal: false },
  ])(
    "Q4832 enforces color waiver for $card (breeding=$breeding, opponent=$opponent)",
    async ({ card, breeding, opponent, legal }) => {
      const s = setupEngine({
        0: {
          battleArea: !breeding && !opponent ? [card] : [],
          ...(breeding ? { breeding: { card } } : {}),
          hand: [{ card: "EX9-070", as: "option" }],
          deck: ["BT1-009"],
        },
        1: { battleArea: opponent ? [card] : [] },
      });
      s.state.memory = 5;
      await s.ready();
      const optionId = s.inst("option").instanceId;
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: optionId }).ok).toBe(legal);
      await settle();
      expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === optionId)).toBe(legal);
      expect(s.state.players[0]!.hand.map((instance) => instance.cardId)).toEqual(legal ? ["BT1-009"] : ["EX9-070"]);
      expect(s.state.memory).toBe(legal ? 3 : 5);
      expect(s.state.pendingDecision).toBeUndefined();
    },
  );
  it("declining Delay's placement cost preserves the host and hand but trashes the activated Option", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX9-070", as: "option" },
            { card: "EX9-007", as: "host" },
          ],
          hand: ["BT1-009", "EX9-010"],
        },
      },
      { autoDeclineOptional: true },
    );
    s.state.memory = 3;
    await s.ready();
    const effect = observe(s.engine).activatableEffects(s.perm("option"))[0];
    expect(effect).toBeDefined();
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: s.perm("option").topCard.instanceId,
        effectKey: effect!.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle();
    expect(s.perm("host").topCard.cardId).toBe("EX9-007");
    expect(s.perm("host").stack).toHaveLength(0);
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toEqual(["BT1-009", "EX9-010"]);
    expect(s.state.players[0]!.trash.map((card) => card.cardId)).toEqual(["EX9-070"]);
    expect(s.state.memory).toBe(3);
    expect(s.state.pendingDecision).toBeUndefined();
  });
  it("waives its color requirement while a DM Digimon or Tamer is present", () =>
    expect(compiled.effects?.find((entry) => entry.trigger === "Static")).toMatchObject({
      actions: [{ kind: "WaiveColorRequirement", condition: { kind: "youHave" } }],
    }));
  it("has the draw-and-enter main effect", () =>
    expect(compiled.effects?.find((entry) => entry.trigger === "Main")?.actions).toEqual([
      { effectTextPart: "[Main] ＜Draw 1＞.", kind: "Draw", controller: "mine", amount: 1 },
      { effectTextPart: "Then, place this card in the battle area.", kind: "PlaceInBattleAreaSelf" },
    ]));
  it("can digivolve any own DM Digimon by two after placing a hand card underneath", () =>
    expect(compiled.effects?.filter((entry) => entry.trigger === "Main")[1]).toMatchObject({
      actions: [
        {
          kind: "Digivolve",
          target: {
            filter: { controller: "mine", kind: ["Digimon"], nameOrTrait: [{ tokens: ["DM"], match: "trait" }] },
            fromSelectionRef: "paidHost",
          },
          reduceCost: 2,
          payCost: true,
          cost: {
            kind: "place",
            host: "target",
            underFilter: { controller: "mine", kind: ["Digimon"], nameOrTrait: [{ tokens: ["DM"], match: "trait" }] },
            bindHostAs: "paidHost",
            faceDown: true,
            destination: "digivolutionStack",
          },
        },
      ],
    }));
  it("draws and enters the battle area from security", () =>
    expect(compiled.effects?.find((entry) => entry.trigger === "Security")).toMatchObject({
      isSecurity: true,
      actions: [{ kind: "Draw", amount: 1 }, { kind: "PlaceInBattleAreaSelf" }],
    }));

  it("draws and places itself as a battle-area option when activated from hand", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX9-007", as: "dm" }],
          hand: [{ card: "EX9-070", as: "option" }],
          deck: [{ card: "BT1-009", as: "drawn" }],
        },
      },
      { autoDeclineOptional: true },
    );

    s.state.memory = 2;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("drawn").instanceId), 20);
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "EX9-070"), 20);

    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("drawn").instanceId)).toBe(true);
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "EX9-070")).toBe(true);
    expect(s.perm("option").placedByEffect).toBe(true);
    expect(observe(s.engine).activatableEffects(s.perm("option"))).toEqual([]);
    expect(s.state.memory).toBe(0);
  });

  it("draws and places itself as a battle-area option from security", async () => {
    const s = setupEngine(
      {
        0: { security: [{ card: "EX9-070", as: "option" }, "BT1-048"], deck: ["BT1-009", "BT1-046"] },
        1: { battleArea: [{ card: "BT1-009", as: "attacker" }] },
      },
      { autoAcceptOptional: true },
    );

    s.state.turnSeat = 1;
    s.state.memory = 5;
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle();
    expect(s.state.memory).toBe(5);
    expect(s.state.players[0]!.hand.map(({ cardId }) => cardId)).toEqual(["BT1-009"]);
    expect(s.state.players[0]!.deck.map(({ cardId }) => cardId)).toEqual(["BT1-046"]);
    expect(s.state.players[0]!.security.map(({ cardId }) => cardId)).toEqual(["BT1-048"]);
    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual(["EX9-070"]);
    expect(s.perm("option").placedByEffect).toBe(true);
    expect(s.state.players[0]!.trash).toHaveLength(0);
    expect(s.state.pendingDecision).toBeUndefined();
  });
  it("activates Delay to place a hand card face-down and digivolve a DM Digimon", async () => {
    const options = {
      autoAcceptOptional: true,
      autoSelectCards: true,
      autoOrderTriggers: true,
      autoChooseOption: true,
      preferInstanceIds: [] as string[],
    };
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX9-070", as: "option" },
            { card: "EX9-007", as: "host" },
          ],
          hand: [
            { card: "BT1-009", as: "under" },
            { card: "EX9-010", as: "evo" },
          ],
          deck: ["BT1-048"],
        },
      },
      options,
    );
    options.preferInstanceIds.push(s.inst("under").instanceId);
    s.state.memory = 3;
    await s.ready();

    const effect = JSON.parse(s.perm("option").activatableEffectsJson || "[]").find((entry: { description?: string }) =>
      /Delay/i.test(entry.description ?? ""),
    );
    expect(effect).toBeDefined();
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: s.perm("option").topCard.instanceId,
        effectKey: effect.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle();

    expect(s.state.players[0]!.hand).toHaveLength(0);
    expect(s.perm("host").topCard.cardId).toBe("EX9-010");
    expect(
      s.state.players[0]!.battleArea.map((permanent) => ({
        top: permanent.topCard.cardId,
        stack: permanent.stack.map((card) => card.cardId),
      })),
    ).toEqual([{ top: "EX9-010", stack: ["BT1-048", "BT1-009", "EX9-007"] }]);
    expect(s.perm("host").stack.some((card) => card.cardId === "BT1-048" && card.faceUp === false)).toBe(true);
    expect(s.perm("host").stack.some((card) => card.cardId === "BT1-009" && card.faceUp === false)).toBe(true);
    expect(s.state.players[0]!.trash.map(({ cardId }) => cardId)).toEqual(["EX9-070"]);
    expect(s.state.players[0]!.deck).toHaveLength(0);
    expect(s.state.memory).toBe(3);
    expect(s.state.pendingDecision).toBeUndefined();
  });
});
