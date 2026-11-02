import {
  CardColor,
  CardKind,
  digivolutionRequirementsFor,
  EffectTiming,
  getCardDefinition,
  type CardDefinition,
  type Seat,
} from "@aegis/shared";
import { describe, expect, it, vi } from "vitest";
import { irNode } from "../../engine/testkit/irNode.js";
import type { CardSource } from "../../engine/effects/CardSource.js";
import type { EffectContext, GameAccess, Primitives, SubTriggerInstall } from "../../engine/effects/EffectContext.js";
import { getEffectModule } from "../../engine/effects/registry.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { compiled } from "./BT26-063.js";
import "../index.js";

const CARD_ID = "BT26-063";

function definition(overrides: Partial<CardDefinition> = {}): CardDefinition {
  return {
    cardId: overrides.cardId ?? "FIXTURE",
    set: overrides.set ?? "TEST",
    nameEn: overrides.nameEn ?? "Fixture",
    colors: overrides.colors ?? ([CardColor.Purple] as CardDefinition["colors"]),
    kinds: overrides.kinds ?? [CardKind.Digimon],
    playCost: overrides.playCost ?? 4,
    dp: overrides.dp ?? 4000,
    evoCosts: overrides.evoCosts ?? [],
    maxCountInDeck: overrides.maxCountInDeck ?? 4,
    types: overrides.types ?? [],
    ...overrides,
  };
}

function source(hostId = "tellermon"): CardSource {
  return {
    instanceId: `${hostId}-card`,
    cardId: CARD_ID,
    ownerSeat: 0 as Seat,
    definition: definition({ cardId: CARD_ID }),
    permanent: () => ({ permanentId: hostId, controllerSeat: 0, topCard: { cardId: "ATTRIBUTE" }, stack: [] }) as never,
    isOnBattleArea: () => true,
    isOwnersTurn: () => true,
    hasColor: () => true,
  };
}

async function installedWatcher(cardSource: CardSource): Promise<SubTriggerInstall> {
  let installed: SubTriggerInstall | undefined;
  const ctx = {
    source: cardSource,
    trigger: {},
    game: {
      opponentOf: (seat: Seat) => (seat === 0 ? 1 : 0),
      permanentById: (permanentId: string) =>
        permanentId === cardSource.permanent()?.permanentId ? cardSource.permanent() : undefined,
    },
    ask: {},
    fx: {
      subscribeSubTrigger: (subscription: SubTriggerInstall) => {
        installed = subscription;
      },
    },
  } as unknown as EffectContext;
  const effect = getEffectModule(CARD_ID)!.effectsForTiming(EffectTiming.None, cardSource)[0]!;
  await effect.resolve(ctx);
  return installed!;
}

describe("BT26-063 Tellermon", () => {
  it("matches the catalog and exposes the printed Detach keyword", () => {
    expect(getCardDefinition(CARD_ID)).toMatchObject({
      nameEn: "Tellermon",
      colors: ["Purple"],
      kinds: ["Digimon"],
      level: 3,
      playCost: 4,
      dp: 4000,
      forms: ["Stnd.", "Appmon"],
      attributes: ["Entertainment"],
      types: ["Fortune Telling", "Seven Code"],
    });
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual).toEqual([]);
    expect(compiled.keywords).toEqual([{ keyword: "Detach", raw: "＜Detach ([Seven Code] trait)＞" }]);
  });
  it("exposes the Appmon evolution and Link requirements", () => {
    expect(digivolutionRequirementsFor("BT26-063")).toContainEqual({
      level: 2,
      traits: ["Appmon"],
      cost: 0,
      isAlternate: true,
    });
    expect(compiled.linkRequirement).toEqual([{ traits: ["Appmon"], cost: 3 }]);
  });

  it("encodes the linked reveal effect in IR", () => {
    expect(compiled.effects?.[0]).toMatchObject({
      trigger: "YourTurn",
      frequency: "OncePerTurn",
      actions: [{ kind: "SubTrigger", event: "whenLinked", sourceFilter: { isSelfRef: true } }],
    });
    expect(irNode(compiled.effects?.[0]?.actions?.[0])?.actions?.[0]).toMatchObject({
      kind: "RevealAdd",
      revealCount: 3,
      rest: "deckTopOrBottom",
    });
    expect(compiled.effects?.[1]).toMatchObject({
      trigger: "WhenLinking",
      isLinked: true,
      actions: [{ kind: "Delete", target: { filter: { superlative: "lowestLevel" }, count: 1 } }],
    });
  });

  it("digivolves from a non-purple level 2 Appmon for the printed alternate cost 0", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT25-004", as: "tapmon" }],
        hand: [{ card: CARD_ID, as: "tellermon" }],
        deck: ["BT1-009"],
      },
    });
    s.state.memory = 0;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("tapmon").permanentId,
        instanceId: s.inst("tellermon").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("tapmon").topCard.instanceId === s.inst("tellermon").instanceId);

    expect(s.state.memory).toBe(0);
    expect(s.perm("tapmon").stack.map((card) => card.cardId)).toEqual(["BT25-004"]);
  });

  it("links through the public action, pays cost 1, and resolves the reveal on Tellermon", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: CARD_ID, as: "tellermon" }],
          hand: [{ card: "P-190", as: "linkCard" }],
          deck: [
            { card: "BT26-086", as: "matchingTop" },
            { card: "BT1-009", as: "nonmatchA" },
            { card: "BT1-010", as: "nonmatchB" },
          ],
        },
      },
      { autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 1;
    const linkId = s.inst("linkCard").instanceId;
    const matchingId = s.inst("matchingTop").instanceId;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "linkCard",
        instanceId: linkId,
        targetPermanentId: s.perm("tellermon").permanentId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.hand.some((card) => card.instanceId === matchingId));

    expect(s.state.memory).toBe(0);
    expect(s.perm("tellermon").linked.map((card) => card.instanceId)).toContain(linkId);
    expect(getCardDefinition("BT26-086")?.types).toEqual(["Open"]);
    expect(s.state.players[0]!.deck.map((card) => card.instanceId)).not.toContain(matchingId);
  });

  it("uses explicit public Link selections to prove separate once-per-turn link budgets", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: CARD_ID, as: "first" },
            { card: CARD_ID, as: "second" },
          ],
          hand: [
            { card: "BT21-009", as: "firstLink" },
            { card: "BT21-009", as: "secondLink" },
          ],
          deck: [
            { card: CARD_ID, as: "firstMatch" },
            { card: "BT1-009", as: "firstRestA" },
            { card: "BT1-010", as: "firstRestB" },
            { card: CARD_ID, as: "secondMatch" },
            { card: "BT1-011", as: "secondRestA" },
            { card: "BT1-012", as: "secondRestB" },
          ],
        },
      },
      { autoChooseOption: true },
    );
    s.state.memory = 6;
    await s.ready();

    for (const [linkAlias, hostAlias, matchAlias] of [
      ["firstLink", "first", "firstMatch"],
      ["secondLink", "second", "secondMatch"],
    ] as const) {
      expect(
        s.engine.applyIntent(0, {
          type: "linkCard",
          instanceId: s.inst(linkAlias).instanceId,
          targetPermanentId: s.perm(hostAlias).permanentId,
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision?.kind === "selectCards");
      const pending = s.state.pendingDecision!;
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: pending.decisionId,
          response: { kind: "selectCards", instanceIds: [s.inst(matchAlias).instanceId] },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.players[0]!.hand.some((card) => card.instanceId === s.inst(matchAlias).instanceId));
    }

    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining([s.inst("firstMatch").instanceId, s.inst("secondMatch").instanceId]),
    );
  });

  it("deletes one opposing lowest-level Digimon when Tellermon itself links", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT25-045", as: "host" }],
          hand: [{ card: CARD_ID, as: "tellermon" }],
        },
        1: {
          battleArea: [
            { card: "BT1-009", as: "lowest" },
            { card: "BT26-060", as: "higher" },
          ],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 3;
    const lowestId = s.perm("lowest").permanentId;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "linkCard",
        instanceId: s.inst("tellermon").instanceId,
        targetPermanentId: s.perm("host").permanentId,
      }),
    ).toEqual({ ok: true });
    await settle(() => !s.state.players[1]!.battleArea.some(({ permanentId }) => permanentId === lowestId));

    expect(s.state.players[1]!.battleArea.map(({ topCard }) => topCard?.cardId)).toEqual(["BT26-060"]);
  });

  it("uses Detach to trash a linked Seven Code card and prevent its battle deletion", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            {
              card: CARD_ID,
              as: "tellermon",
              linked: [{ card: "BT26-019", as: "sevenCodeLink" }],
            },
          ],
        },
        1: { battleArea: [{ card: "BT26-060", as: "defender", suspended: true }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const tellermonId = s.perm("tellermon").permanentId;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: tellermonId,
        target: { kind: "permanent", permanentId: s.perm("defender").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() =>
      s.state.players[0]!.trash.some(({ instanceId }) => instanceId === s.inst("sevenCodeLink").instanceId),
    );

    expect(s.state.players[0]!.battleArea.map(({ permanentId }) => permanentId)).toContain(tellermonId);
    expect(s.perm("tellermon").linked).toHaveLength(0);
    expect(s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId)).toContain(
      s.perm("defender").permanentId,
    );
  });

  it("does not reveal when another Appmon, rather than this Tellermon, gets linked", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: CARD_ID, as: "tellermon" },
            { card: "BT25-045", as: "otherAppmon" },
          ],
          hand: [{ card: "P-190", as: "linkCard" }],
          deck: [
            { card: CARD_ID, as: "matchingTop" },
            { card: "BT1-009", as: "nonmatchA" },
            { card: "BT1-010", as: "nonmatchB" },
          ],
        },
      },
      { autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 1;
    const matchingId = s.inst("matchingTop").instanceId;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "linkCard",
        instanceId: s.inst("linkCard").instanceId,
        targetPermanentId: s.perm("otherAppmon").permanentId,
      }),
    ).toEqual({ ok: true });
    await settle();

    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).not.toContain(matchingId);
    expect(s.state.players[0]!.deck.map((card) => card.instanceId)).toContain(matchingId);
  });

  it("does not arm the Your Turn watcher during the opponent's turn", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: CARD_ID, as: "tellermon" }],
        deck: [CARD_ID, "BT1-009", "BT1-010"],
      },
    });
    expect(s.state.players[0]!.deck).toHaveLength(3);
    expect(s.state.players[0]!.hand).toHaveLength(0);
  });

  it.each([
    [0, true],
    [1, false],
  ] as const)("honors return choice %i for the unchosen revealed cards", async (choice, toTop) => {
    const cardSource = source();
    const watcher = await installedWatcher(cardSource);
    const revealed = [
      { instanceId: "attribute-match", cardId: "ATTRIBUTE" },
      { instanceId: "form-match", cardId: "FORM" },
      { instanceId: "nonmatch", cardId: "OTHER" },
    ];
    const defs: Record<string, CardDefinition> = {
      ATTRIBUTE: definition({ cardId: "ATTRIBUTE", attributes: ["Entertainment"] }),
      FORM: definition({ cardId: "FORM", forms: ["Open"] as never }),
      OTHER: definition({ cardId: "OTHER", types: ["Seven Codes"] }),
    };
    const returnToHand = vi.fn<() => Promise<(typeof revealed)[number][]>>(async () => [revealed[0]!]);
    const returnToDeck = vi.fn<() => Promise<typeof revealed>>(async () => revealed.slice(1));
    const selectCards = vi.fn<
      (_ctx: EffectContext, opts: { candidates: string[]; visible: string[] }) => Promise<string[]>
    >(async (_ctx, opts) => {
      expect(opts).toMatchObject({
        candidates: ["attribute-match", "form-match"],
        visible: ["attribute-match", "form-match", "nonmatch"],
        min: 1,
        max: 1,
      });
      return ["attribute-match"];
    });
    const ctx = {
      source: cardSource,
      trigger: { subjectPermanentId: "tellermon", linkedInstanceIds: [cardSource.instanceId] },
      game: {
        opponentOf: (seat: Seat) => (seat === 0 ? 1 : 0),
        permanentById: (permanentId: string) => (permanentId === "tellermon" ? cardSource.permanent() : undefined),
        definitionOf: (card: { cardId: string }) => defs[card.cardId]!,
      } as unknown as GameAccess,
      ask: { selectCards, chooseOption: vi.fn<() => Promise<number>>(async () => choice) },
      fx: {
        reveal: vi.fn<() => Promise<typeof revealed>>(async () => revealed),
        returnToHand,
        returnToDeck,
      } as unknown as Primitives,
    } as unknown as EffectContext;

    expect(watcher.matches?.(ctx)).toBe(true);
    await watcher.run(ctx);

    // The reveal is public, so the card taken from it is named on its movement event.
    expect(returnToHand).toHaveBeenCalledWith(["attribute-match"], { publicIdentities: true });
    expect(returnToDeck).toHaveBeenCalledWith(toTop ? ["nonmatch", "form-match"] : ["form-match", "nonmatch"], {
      toTop,
      suppressWhenEffectAddsToDeck: true,
    });
  });

  it("returns all revealed cards when none has an exact eligible trait", async () => {
    const cardSource = source();
    const watcher = await installedWatcher(cardSource);
    const revealed = [
      { instanceId: "near", cardId: "NEAR" },
      { instanceId: "plain-a", cardId: "PLAIN-A" },
      { instanceId: "plain-b", cardId: "PLAIN-B" },
    ];
    const selectCards = vi.fn<() => Promise<string[]>>();
    const returnToDeck = vi.fn<() => Promise<typeof revealed>>(async () => revealed);
    const ctx = {
      source: cardSource,
      trigger: { subjectPermanentId: "tellermon" },
      game: {
        opponentOf: (seat: Seat) => (seat === 0 ? 1 : 0),
        permanentById: (permanentId: string) => (permanentId === "tellermon" ? cardSource.permanent() : undefined),
        definitionOf: (card: { cardId: string }) =>
          definition({ cardId: card.cardId, types: card.cardId === "NEAR" ? ["Seven Codes"] : [] }),
      },
      ask: { selectCards, chooseOption: vi.fn<() => Promise<number>>(async () => 1) },
      fx: { reveal: vi.fn<() => Promise<typeof revealed>>(async () => revealed), returnToDeck },
    } as unknown as EffectContext;

    await watcher.run(ctx);

    expect(selectCards).not.toHaveBeenCalled();
    expect(returnToDeck).toHaveBeenCalledWith(["near", "plain-a", "plain-b"], {
      toTop: false,
      suppressWhenEffectAddsToDeck: true,
    });
  });
});
