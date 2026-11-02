import { describe, expect, it } from "vitest";
import { EffectTiming, digivolutionRequirementsFor, getCardDefinition } from "@aegis/shared";
import { effectiveStaticTraits } from "@aegis/shared/cards/effectiveTraits";
import { advance } from "#api/engine/testkit/advance";
import { assertNoLoudGap, setupEngine, settle } from "#api/engine/testkit/harness";
import { compiled } from "./BT27-031.js";
import "#api/cards/index";

const cardId = "BT27-031";

function stackCardIds(s: ReturnType<typeof setupEngine>, alias: string): string[] {
  return s.perm(alias).stack.map((card) => card.cardId);
}

function inBattleArea(s: ReturnType<typeof setupEngine>, seat: 0 | 1, instanceId: string): boolean {
  return s.state.players[seat]!.battleArea.some(({ topCard }) => topCard.instanceId === instanceId);
}

describe("BT27-031 JumboGamemon", () => {
  it("compiles the alternate evolution, Decode, shared placement effect, watcher, and Aquatic rule", () => {
    expect(getCardDefinition(cardId)).toMatchObject({
      nameEn: "JumboGamemon",
      colors: ["Blue"],
      level: 6,
      playCost: 12,
      dp: 13000,
      types: ["Cyborg", "DATA SQUAD"],
    });
    expect(digivolutionRequirementsFor(cardId)).toContainEqual({
      level: 5,
      traits: ["DATA SQUAD"],
      cost: 4,
      isAlternate: true,
    });
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual).toEqual([]);
    const placement = compiled.effects.filter((effect) => effect.sharedUseKey === "BT27-031/place-once-per-turn");
    expect(placement.map((effect) => effect.trigger)).toEqual(["OnPlay", "WhenDigivolving", "Counter"]);
    expect(placement.every((effect) => effect.frequency === "OncePerTurn")).toBe(true);
    expect(effectiveStaticTraits(getCardDefinition(cardId)!)).toEqual(expect.arrayContaining(["Aquatic"]));
  });

  it("places a Tamer, returns a Digimon with as many sources, and the watcher plays the Tamer back", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: cardId, as: "jumbo", under: [{ card: "BT2-027", as: "zudomon" }] },
            { card: "BT1-086", as: "tamer" },
          ],
        },
        1: {
          battleArea: [
            { card: "BT1-009", as: "eligible", under: ["BT1-010", "BT1-011"] },
            { card: "BT1-009", as: "tooMany", under: ["BT1-010", "BT1-011", "BT1-012"] },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    await s.ready();
    const tamerCard = s.perm("tamer").topCard.instanceId;
    const eligibleCard = s.perm("eligible").topCard.instanceId;
    const tooManyId = s.perm("tooMany").permanentId;
    preferred.push(s.perm("tamer").permanentId, s.perm("eligible").permanentId, tamerCard);

    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("jumbo"));
    await settle(() => s.state.players[1]!.battleArea.length === 1 && inBattleArea(s, 0, tamerCard));

    expect(s.state.players[1]!.deck.at(-1)?.instanceId).toBe(eligibleCard);
    expect(s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId)).toEqual([tooManyId]);
    expect(stackCardIds(s, "jumbo")).toEqual(["BT2-027"]);
    expect(inBattleArea(s, 0, tamerCard)).toBe(true);
    assertNoLoudGap(s);
  });

  it("places only an ally Digimon's top card, trashing its sources, before comparing counts", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: cardId, as: "jumbo", under: ["BT1-019"] },
            { card: "BT2-027", as: "ally", under: [{ card: "BT1-009", as: "allySource" }] },
          ],
        },
        1: {
          battleArea: [
            { card: "BT1-009", as: "eligible", under: ["BT1-010", "BT1-011"] },
            { card: "BT1-009", as: "tooMany", under: ["BT1-010", "BT1-011", "BT1-012"] },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    await s.ready();
    const eligibleCard = s.perm("eligible").topCard.instanceId;
    preferred.push(s.perm("ally").permanentId, s.perm("eligible").permanentId);

    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("jumbo"));
    await settle(() => s.state.players[1]!.battleArea.length === 1);

    expect(stackCardIds(s, "jumbo")).toEqual(["BT2-027", "BT1-019"]);
    expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toEqual([s.inst("allySource").instanceId]);
    expect(s.state.players[1]!.deck.at(-1)?.instanceId).toBe(eligibleCard);
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
    assertNoLoudGap(s);
  });

  it("returns nothing when every opponent Digimon has more sources, and shares the use with When Digivolving", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: cardId, as: "jumbo" },
            { card: "BT1-019", as: "first" },
            { card: "BT1-019", as: "second" },
          ],
        },
        1: { battleArea: [{ card: "BT1-009", as: "target", under: ["BT1-010", "BT1-011"] }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("jumbo"));
    await settle();
    expect(s.perm("jumbo").stack).toHaveLength(1);
    expect(s.state.players[1]!.battleArea).toHaveLength(1);

    await advance(s.engine).fire(EffectTiming.WhenDigivolving, s.perm("jumbo"));
    await settle();
    expect(s.perm("jumbo").stack).toHaveLength(1);
    expect(s.state.players[0]!.battleArea).toHaveLength(2);
  });

  it.each([
    ["a play cost 5 blue Digimon", "BT25-023", true],
    ["a green Digimon", "BT26-039", false],
  ] as const)("the watcher plays %s placed by an effect: %s", async (_label, added, played) => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: cardId, as: "jumbo" },
            { card: "BT27-020", as: "kamemon" },
          ],
          hand: [{ card: added, as: "added" }],
          deck: ["BT1-009"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    await s.ready();
    preferred.push(s.inst("added").instanceId, s.perm("jumbo").permanentId);

    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("kamemon"));
    await settle(() => s.state.players[0]!.deck.length === 0);
    await settle();

    expect(inBattleArea(s, 0, s.inst("added").instanceId)).toBe(played);
    expect(s.perm("jumbo").stack.some(({ instanceId }) => instanceId === s.inst("added").instanceId)).toBe(!played);
  });

  it("ignores cards added without an effect", async () => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: cardId, as: "jumbo" }], hand: [{ card: "BT1-027", as: "added" }] } },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).verb.placeUnder(s.perm("jumbo").permanentId, [s.inst("added").instanceId]);
    await settle();

    expect(stackCardIds(s, "jumbo")).toEqual(["BT1-027"]);
  });

  it("plays a placed card back only once per turn and never a play cost 6 card", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: cardId, as: "jumbo" },
            { card: "BT27-020", as: "first" },
            { card: "BT27-020", as: "second" },
          ],
          hand: [
            { card: "ST24-03", as: "firstAdded" },
            { card: "ST24-03", as: "secondAdded" },
          ],
          deck: ["BT1-009", "BT1-010"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    await s.ready();
    preferred.push(s.inst("firstAdded").instanceId, s.perm("jumbo").permanentId);

    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("first"));
    await settle(() => s.state.players[0]!.deck.length === 1);
    await settle();
    preferred.unshift(s.inst("secondAdded").instanceId);
    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("second"));
    await settle(() => s.state.players[0]!.deck.length === 0);
    await settle();

    expect(inBattleArea(s, 0, s.inst("firstAdded").instanceId)).toBe(true);
    expect(s.perm("jumbo").stack.map(({ instanceId }) => instanceId)).toEqual([s.inst("secondAdded").instanceId]);
  });

  it.each([
    ["a DATA SQUAD level 5", "BT27-028", true],
    ["an Aquatic level 4", "BT2-024", false],
  ] as const)("Decode plays %s: %s", async (_label, source, played) => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: cardId, as: "jumbo", under: [{ card: source, as: "decode" }] }] } },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    expect(await advance(s.engine).verb.deletePermanent([s.perm("jumbo").permanentId], "byEffect")).toBe(1);
    await settle();

    expect(inBattleArea(s, 0, s.inst("decode").instanceId)).toBe(played);
  });

  it("uses Counter during the opponent's attack to return the attacker", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: cardId, as: "jumbo" },
            { card: "BT1-019", as: "ally" },
          ],
          deck: ["BT1-009"],
          security: ["BT1-009", "BT1-010"],
        },
        1: {
          battleArea: [{ card: "BT1-013", as: "attacker", under: ["BT1-009"] }],
          deck: ["BT1-012"],
          security: ["BT1-011"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    await s.ready();
    preferred.push(s.perm("ally").permanentId);
    s.state.turnSeat = 1;
    const attackerId = s.perm("attacker").permanentId;

    expect(
      s.engine.applyIntent(1, { type: "attack", attackerPermanentId: attackerId, target: { kind: "player" } }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "counterWindowOpened"));
    const opened = s.events.find((event) => event.kind === "counterWindowOpened");
    if (opened?.kind !== "counterWindowOpened") throw new Error("counter window did not open");
    const counter = opened.eligibleCounters.find(
      ({ instanceId }) => instanceId === s.perm("jumbo").topCard.instanceId,
    )!;
    expect(counter).toBeDefined();

    expect(
      s.engine.applyIntent(0, {
        type: "respondCounter",
        sourceInstanceId: counter.instanceId,
        effectKey: counter.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 0);

    expect(stackCardIds(s, "jumbo")).toEqual(["BT1-019"]);
    expect(s.state.players[1]!.deck.at(-1)?.cardId).toBe("BT1-013");
  });

  it("highlights the placement cost, then the return clause, but not the activation question", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: cardId, as: "jumbo", under: ["BT1-019"] },
            { card: "BT1-086", as: "tamer" },
            { card: "BT1-019", as: "ally" },
          ],
        },
        1: {
          battleArea: [
            { card: "BT1-009", as: "first" },
            { card: "BT1-009", as: "second" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("jumbo"));
    await settle(() => s.state.players[1]!.battleArea.length === 1);

    const prompts = s.decisions
      .map(({ req }) => req)
      .filter((req) => req.sourceCardId === cardId && req.options?.effectText?.startsWith("[On Play]"));
    expect(prompts.map((req) => [req.kind, req.options?.effectTextEmphasis])).toEqual([
      ["optional", undefined],
      ["chooseTargets", "By placing 1 of your other Digimon or Tamers as this Digimon's bottom digivolution card"],
      [
        "chooseTargets",
        "return 1 of your opponent's Digimon with as many digivolution cards as this Digimon or fewer to the bottom of the deck.",
      ],
    ]);
  });
});
