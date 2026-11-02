import { describe, expect, it } from "vitest";
import { EffectTiming } from "@aegis/shared";
import { advance } from "../../engine/testkit/advance.js";
import { runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import "./P-205.js";
import "../EX9/EX9-026.js";
import "../EX9/EX9-074.js";

describe("P-205 Insane Synthetic Monster", () => {
  it("waives its color requirement only while you have a DM Digimon or Tamer", () => {
    expect(runtimeCompiledCard("P-205")!.effects.find((effect) => effect.trigger === "Static")).toMatchObject({
      condition: {
        kind: "youHave",
        filter: { controller: "mine", kind: ["Digimon", "Tamer"], nameOrTrait: [{ tokens: ["DM"], match: "trait" }] },
      },
      actions: [{ kind: "WaiveColorRequirement", target: { isSelf: true } }],
    });
  });

  it("draws, trashes two, and places itself for Main and Security", () => {
    const card = runtimeCompiledCard("P-205")!;
    for (const effect of card.effects.filter(
      (entry) => (entry.trigger === "Main" && !entry.keywords?.length) || entry.trigger === "Security",
    )) {
      const isSecurity = effect.trigger === "Security";
      const printed = isSecurity
        ? { effectTextPart: "[Security] ＜Draw 2＞ and trash 2 cards in your hand." }
        : { effectTextPart: "[Main] ＜Draw 2＞ and trash 2 cards in your hand." };
      const placement = isSecurity ? {} : { effectTextPart: "Then, place this card in the battle area." };
      expect(effect.actions).toEqual([
        { kind: "Draw", controller: "mine", amount: 2, ...printed },
        { kind: "Trash", target: { filter: { controller: "mine", zone: "hand" }, count: 2 }, ...printed },
        { kind: "PlaceInBattleAreaSelf", ...placement },
      ]);
    }
  });

  it("deletes your low-cost Digimon and plays a named card from your trash with cost reduced by 3", () => {
    expect(
      runtimeCompiledCard("P-205")!.effects.find((effect) =>
        effect.keywords?.some((keyword) => keyword.keyword === "Delay"),
      ),
    ).toMatchObject({
      keywords: [{ keyword: "Delay" }],
      actions: [
        { kind: "Delete", target: { count: 1, filter: { controller: "mine", kind: ["Digimon"], playCostLte: 7 } } },
        {
          kind: "PlayWithoutCost",
          from: ["trash"],
          payCost: true,
          reduceCostBy: 3,
          target: {
            count: 1,
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              nameOrTrait: [{ tokens: ["Kimeramon", "Millenniummon"], match: "name" }],
            },
          },
        },
      ],
    });
  });

  it("draws two, trashes two cards, and places itself from Main", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: "P-205", as: "option" },
            { card: "BT1-101", as: "trash1" },
            { card: "BT1-101", as: "trash2" },
          ],
          battleArea: [{ card: "BT19-065", as: "color" }],
          deck: ["BT1-028", "BT1-028"],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 20;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.length > 0);
    expect(s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("trash1").instanceId)).toBe(true);
    expect(s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("trash2").instanceId)).toBe(true);
  });

  it("draws, trashes, and places itself from Security", async () => {
    const s = setupEngine(
      {
        0: {
          security: [{ card: "P-205", as: "option" }],
          hand: [
            { card: "BT1-101", as: "trash1" },
            { card: "BT1-101", as: "trash2" },
          ],
          deck: ["BT1-028", "BT1-028"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("option"));
    await settle();
    expect(
      s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === s.inst("option").instanceId),
    ).toBe(true);
    expect(s.state.players[0]!.trash).toHaveLength(2);
  });

  it("activates Delay to delete a low-cost Digimon and play Millenniummon from trash", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "P-205", as: "option" },
            { card: "BT1-009", as: "sacrifice" },
          ],
          trash: [{ card: "BT2-077", as: "kimeramon" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 20;
    await s.ready();
    const source = s.perm("option");
    const delay = (
      observe(s.engine).activatableEffects(source) as Array<{ effectKey: string; description?: string }>
    ).find((entry) => /delay/i.test(entry.description ?? ""));
    expect(delay).toBeDefined();
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: source.topCard.instanceId,
        effectKey: delay!.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle();
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT2-077")).toBe(true);
    expect(
      s.state.players[0]!.battleArea.some(
        (permanent) => permanent.topCard.instanceId === s.inst("sacrifice").instanceId,
      ),
    ).toBe(false);
  });
});

describe("P-205 Insane Synthetic Monster — KB Q&A rulings", () => {
  const otherMaterials = ["EX9-009", "EX9-017", "EX9-025", "EX9-037", "EX9-049", "EX9-060"];

  async function delayIntoAssemblyKimeramon(seventhMaterial: "angemon" | "devimon") {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "P-205", as: "option" },
            { card: "EX9-052", as: "sacrifice", under: [{ card: "EX9-026", as: "angemon" }] },
          ],
          trash: [
            { card: "EX9-074", as: "kimeramon" },
            ...otherMaterials.map((card, index) => ({ card, as: `material${index}` })),
            { card: "EX9-061", as: "devimon" },
          ],
          deck: Array.from({ length: 5 }, () => "BT1-009"),
          security: [],
        },
      },
      {
        autoAcceptOptional: true,
        autoSelectCards: true,
        preferInstanceIds: preferred,
        declinePrompts: ["Place 1 card(s) under"],
      },
    );
    s.state.memory = 3;
    await s.ready();
    const chosenIds = [
      ...otherMaterials.map((_, index) => s.inst(`material${index}`).instanceId),
      s.inst(seventhMaterial).instanceId,
    ];
    preferred.push(s.perm("sacrifice").permanentId, s.inst("kimeramon").instanceId, ...chosenIds);

    const source = s.perm("option");
    const delay = observe(s.engine)
      .activatableEffects(source)
      .find((entry) => /delay/i.test(entry.description ?? ""));
    expect(delay).toBeDefined();
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: source.topCard.instanceId,
        effectKey: delay!.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.pendingDecision === undefined &&
        s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "EX9-074"),
    );
    await settle(() => s.state.pendingDecision === undefined);
    const kimeramon = s.state.players[0]!.battleArea.find((permanent) => permanent.topCard.cardId === "EX9-074")!;
    return { s, kimeramon, chosenIds };
  }

  it("does not activate the deleted card's [On Deletion] once that card became an Assembly material (Q5200)", async () => {
    const { s, kimeramon, chosenIds } = await delayIntoAssemblyKimeramon("angemon");

    expect(kimeramon.stack.map((card) => card.instanceId)).toEqual(expect.arrayContaining(chosenIds));
    expect(s.state.players[0]!.security).toHaveLength(0);
  });

  it("still activates that [On Deletion] when the deleted card stays in the trash (Q5200 contrast)", async () => {
    const { s, kimeramon } = await delayIntoAssemblyKimeramon("devimon");

    expect(kimeramon.stack.map((card) => card.instanceId)).not.toContain(s.inst("angemon").instanceId);
    expect(s.state.players[0]!.security).toHaveLength(1);
  });

  it("stacks the Assembly reduction on top of the Delay reduction of 3 (Q5397)", async () => {
    const { s, kimeramon, chosenIds } = await delayIntoAssemblyKimeramon("angemon");

    expect(kimeramon.stack.filter((card) => chosenIds.includes(card.instanceId))).toHaveLength(7);
    expect(s.state.memory).toBe(3);
    expect(s.events).not.toContainEqual(expect.objectContaining({ kind: "memoryChanged", reason: "playCard" }));
  });
});
