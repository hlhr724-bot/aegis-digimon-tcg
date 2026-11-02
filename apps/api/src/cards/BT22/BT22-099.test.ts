import { EffectTiming } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { effectsOf } from "../../engine/effects/collect.js";
import type { CardSource } from "../../engine/effects/CardSource.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { compiled } from "./BT22-099.js";
import "../index.js";
import { useOptionWithBreedingDigimon } from "./colorWaiver.testSupport.js";

function delayEffectKey(s: ReturnType<typeof setupEngine>): string {
  const optionCard = s.perm("agency").topCard;
  const source = (s.engine as unknown as { cardSourceOf(card: typeof optionCard): CardSource }).cardSourceOf(
    optionCard,
  );
  return effectsOf(EffectTiming.OnDeclaration, source).find((effect) => effect.effectKey.startsWith("BT22-099/"))!
    .effectKey;
}

describe("BT22-099 Kuremi Detective Agency", () => {
  it("waives color requirements while a CS card is in either field area", () => {
    const effect = compiled.effects.find((entry) => entry.trigger === "Static");
    expect(effect?.actions[0]).toMatchObject({
      kind: "WaiveColorRequirement",
      condition: {
        kind: "anyOf",
        conditions: [
          { kind: "youHave", filter: { kind: ["Digimon", "Tamer"] } },
          { kind: "youHave", filter: { zone: "breeding", kind: ["Digimon", "Tamer"] } },
        ],
      },
    });
  });

  it("reveals three, adds one CS card, bottoms the rest, then places itself", () => {
    const effect = compiled.effects.find((entry) => entry.trigger === "Main");
    expect(effect?.actions).toMatchObject([
      {
        kind: "RevealAdd",
        revealCount: 3,
        add: [{ filter: { nameOrTrait: [{ tokens: ["CS"], match: "trait" }] }, count: 1, to: "hand" }],
        rest: "deckBottom",
      },
      { kind: "PlaceInBattleAreaSelf" },
    ]);
  });

  it("keeps the Delay memory effect and Security placement", () => {
    const delay = compiled.effects.find(
      (entry) => entry.trigger === "Main" && entry.keywords?.some((k) => k.keyword === "Delay"),
    );
    expect(delay?.actions).toEqual([{ effectTextPart: "Gain 2 memory.", kind: "GainMemory", amount: 2 }]);
    expect(compiled.effects.find((entry) => entry.trigger === "Security")).toMatchObject({
      isSecurity: true,
      actions: [{ kind: "PlaceInBattleAreaSelf" }],
    });
  });

  it("reveals into observable hand/deck state and places the used Option", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT22-099", as: "agency" }],
          battleArea: ["BT22-054"],
          deck: ["BT1-009", "BT1-010", "BT22-054"],
        },
      },
      { autoSelectCards: true },
    );
    const agencyId = s.inst("agency").instanceId;
    s.state.memory = 5;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: agencyId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.some((p) => p.topCard?.instanceId === agencyId));
    expect(s.state.players[0]!.hand.some((c) => c.cardId === "BT22-054")).toBe(true);
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard?.instanceId === agencyId)).toBe(true);
  });

  it("activates the public Delay effect on a later turn and gains exactly 2 memory", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT22-099", as: "agency" }],
          battleArea: ["BT22-054"],
          deck: ["BT1-009", "BT1-010", "BT22-054"],
        },
      },
      { autoSelectCards: true },
    );
    const agencyId = s.inst("agency").instanceId;
    s.state.memory = 5;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: agencyId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some((p) => p.topCard?.instanceId === agencyId));
    s.perm("agency").enterFieldTurnCount = s.state.turnCount - 1;
    s.perm("agency").placedByEffect = true;
    expect(s.state.memory).toBe(2);

    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: agencyId,
        effectKey: delayEffectKey(s),
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.some((card) => card.instanceId === agencyId));

    expect(s.state.memory).toBe(4);
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard?.instanceId === agencyId)).toBe(false);
  });
});

describe("BT22-099 Kuremi Detective Agency — KB Q&A rulings", () => {
  it("counts a [CS] trait Digimon in the breeding area as on the field for its color waiver (Q4970)", async () => {
    expect(await useOptionWithBreedingDigimon("BT22-099", "BT22-069")).toEqual({ ok: true });
    expect(await useOptionWithBreedingDigimon("BT22-099", "BT2-067")).toMatchObject({ ok: false });
  });
});
