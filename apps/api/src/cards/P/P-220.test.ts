import {
  dnaDigivolutionRequirementsFor as dnaRequirementsFor,
  getCardDefinition as cardDefinition,
} from "@aegis/shared";
import { dnaDigivolveCostFor } from "../../engine/effects/primitives.js";
import { compiled as compiledDna } from "./P-220.js";
import { describe, expect, it } from "vitest";
import { EffectTiming } from "@aegis/shared";
import type { CardSource } from "../../engine/effects/CardSource.js";
import type { EffectContext, GameAccess } from "../../engine/effects/EffectContext.js";
import { getEffectModule } from "../../engine/effects/registry.js";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import "#api/cards/index";
import "./P-220.js";

describe("P-220 Millenniummon", () => {
  it("returns level-seven Millenniummon and MoonMillenniummon to pay its revival cost", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "P-220", as: "host" }],
          trash: [
            { card: "BT18-019", as: "millennium" },
            { card: "BT19-075", as: "moon" },
            { card: "BT2-083", as: "third" },
            { card: "BT18-073", as: "machinedramon" },
            { card: "BT19-070", as: "kimeramon" },
          ],
        },
      },
      { autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.inst("millennium").instanceId, s.inst("moon").instanceId, s.inst("third").instanceId);
    await s.ready();
    const deletion = advance(s.engine).verb.deletePermanent([s.perm("host").permanentId], "byEffect");
    await settle(() => s.state.pendingDecision?.kind === "optional");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: s.state.pendingDecision!.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === "BT19-070"));
    await settle(() => s.state.pendingDecision?.kind === "optional");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: s.state.pendingDecision!.decisionId,
        response: { kind: "optional", accept: false },
      }),
    ).toEqual({ ok: true });
    await deletion;
    await settle();
    expect(
      s.state.players[0]!.deck.slice(-3)
        .map(({ cardId }) => cardId)
        .sort(),
    ).toEqual(["BT18-019", "BT19-075", "BT2-083"]);
    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId).sort()).toEqual([
      "BT18-073",
      "BT19-070",
    ]);
  });

  it("can choose itself for its optional On Play deletion", async () => {
    const s = setupEngine(
      { 0: { hand: [{ card: "P-220", as: "played" }] } },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 14;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("played").instanceId })).toEqual({
      ok: true,
    });
    await settle();
    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.trash.some(({ instanceId }) => instanceId === s.inst("played").instanceId)).toBe(true);
  });

  it("provides Reboot and Blocker continuously", () => {
    const effects = getEffectModule("P-220")!.effectsForTiming(EffectTiming.None, {
      isOnBattleArea: () => true,
    } as unknown as CardSource);
    expect(effects.map((effect) => effect.effectKey)).toEqual(["P-220/reboot", "P-220/blocker"]);
  });

  it("returns three cost cards and only offers played trash Digimon at different levels", async () => {
    const cards = [
      { instanceId: "cost-1", cardId: "C1" },
      { instanceId: "cost-2", cardId: "C2" },
      { instanceId: "cost-3", cardId: "C3" },
      { instanceId: "play-5", cardId: "P5" },
      { instanceId: "play-5b", cardId: "P5B" },
      { instanceId: "play-6", cardId: "P6" },
    ];
    const definitions: Record<string, Record<string, unknown>> = {
      C1: { kinds: [], types: ["Composite"] },
      C2: { kinds: [], types: ["DM"] },
      C3: { kinds: [], types: ["Wicked God"] },
      P5: { kinds: ["Digimon"], level: 5, types: ["Composite"] },
      P5B: { kinds: ["Digimon"], level: 5, types: ["Ver.3"] },
      P6: { kinds: ["Digimon"], level: 6, types: ["Ver.5"] },
    };
    const owner = {
      trash: cards.slice(),
      battleArea: [],
      hand: [],
      deck: [],
      security: [],
      eggDeck: [],
    };
    const opponent = {
      trash: [],
      battleArea: [],
      hand: [],
      deck: [],
      security: [],
      eggDeck: [],
    };
    const selections: string[][] = [];
    const played: string[][] = [];
    const effect = getEffectModule("P-220")!.effectsForTiming(EffectTiming.OnDestroyedAnyone, {
      ownerSeat: 0,
      definition: { effectText: "" },
    } as unknown as CardSource)[0]!;
    await effect.resolve({
      source: { ownerSeat: 0 } as unknown as CardSource,
      game: {
        player: (seat: number) => (seat === 0 ? owner : opponent),
        definitionOf: (card: { cardId: string }) => definitions[card.cardId],
        opponentOf: () => 1,
      } as unknown as GameAccess,
      ask: {
        optional: async () => true,
        selectCards: async (_ctx: unknown, options: { candidates: string[] }) => {
          selections.push(options.candidates);
          return selections.length === 1
            ? ["cost-1", "cost-2", "cost-3"]
            : selections.length === 2
              ? ["play-5"]
              : ["play-6"];
        },
      },
      fx: {
        returnToDeck: async () => {},
        playInstances: async (ids: string[]) => {
          played.push(ids);
        },
      },
    } as unknown as EffectContext);
    expect(selections[2]).toEqual(["play-6"]);
    expect(played).toEqual([["play-5", "play-6"]]);
  });
});

describe("P-220 continuous behavior", () => {
  it("exposes Reboot and Blocker on a resident Millenniummon", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "P-220", as: "millenniummon" }] },
    });
    await s.ready();
    const ledger = (
      s.engine as unknown as {
        continuous: { hasKeyword(id: string, keyword: string): boolean };
      }
    ).continuous;
    expect(ledger.hasKeyword(s.perm("millenniummon").permanentId, "Reboot")).toBe(true);
    expect(ledger.hasKeyword(s.perm("millenniummon").permanentId, "Blocker")).toBe(true);
  });
});

describe("P-220 engine behavior", () => {
  it("de-digivolves an opposing Digimon by two and permits declining the optional deletion", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "P-220", as: "millenniummon" }] },
        1: {
          battleArea: [
            {
              card: "BT1-080",
              as: "target",
              under: ["BT1-009", "BT1-070", "BT1-020"],
            },
          ],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("millenniummon"));
    await settle();
    expect(s.perm("target").stack).toHaveLength(1);
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
  });

  it("returns three qualifying trash cards and plays two different-level eligible Digimon on deletion", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "P-220", as: "millenniummon" }],
          trash: [
            "BT18-013",
            "BT22-049",
            "BT19-099",
            { card: "BT26-040", as: "level4" },
            { card: "BT22-060", as: "level5" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    const beforeDeck = s.state.players[0]!.deck.length;
    await advance(s.engine).verb.deletePermanent([s.perm("millenniummon").permanentId]);
    await settle();
    expect(s.state.players[0]!.deck.length).toBe(beforeDeck + 3);
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === s.inst("level4").instanceId)).toBe(true);
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === s.inst("level5").instanceId)).toBe(true);
  });
});

describe("P-220 DNA requirement", () => {
  it("DNA digivolves only from exact [Kimeramon] + [Machinedramon] for 0", () => {
    expect(dnaRequirementsFor("P-220")).toEqual([
      {
        cost: 0,
        materials: [{ namesExact: ["Kimeramon"] }, { namesExact: ["Machinedramon"] }],
      },
    ]);
    expect(compiledDna.dnaDigivolveRequirement).toEqual(dnaRequirementsFor("P-220"));
    const evolving = cardDefinition("P-220")!;
    const kimeramon = cardDefinition("BT8-084")!;
    const machinedramon = cardDefinition("BT11-072")!;
    expect(dnaDigivolveCostFor(evolving, [kimeramon, machinedramon])).toBe(0);
    expect(
      dnaDigivolveCostFor(evolving, [{ ...kimeramon, nameEn: "Kimeramon (X Antibody)" }, machinedramon]),
    ).toBeUndefined();
  });
});

describe("P-220 Millenniummon — KB Q&A rulings", () => {
  it.each([
    ["my own", 0, "ownDigimon"],
    ["the opponent's", 1, "opponentDigimon"],
  ] as const)("may delete %s Digimon with the optional follow-up deletion (Q5764)", async (_label, seat, alias) => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "P-220", as: "millenniummon" },
            { card: "BT1-010", as: "ownDigimon" },
          ],
        },
        1: {
          battleArea: [
            {
              card: "BT1-080",
              as: "dedigivolved",
              under: ["BT1-009", "BT1-070", "BT1-020"],
            },
            { card: "BT1-011", as: "opponentDigimon" },
          ],
        },
      },
      {
        autoAcceptOptional: true,
        autoSelectCards: true,
        preferInstanceIds: preferred,
      },
    );
    await s.ready();
    const deletedId = s.perm(alias).permanentId;
    const bothIds = [s.perm("ownDigimon").permanentId, s.perm("opponentDigimon").permanentId];
    preferred.push(deletedId);
    await advance(s.engine).fire(EffectTiming.OnPlay, s.perm("millenniummon"));
    await settle(() => s.state.pendingDecision === undefined);

    const deletionChoice = s.decisions.filter(({ req }) => req.kind === "chooseTargets").at(-1)!.req;
    expect(deletionChoice.options?.candidateInstanceIds).toEqual(expect.arrayContaining(bothIds));
    expect(s.state.players[seat]!.battleArea.some((permanent) => permanent.permanentId === deletedId)).toBe(false);
    expect(s.state.players[seat]!.trash.map((card) => card.cardId)).toContain(
      alias === "ownDigimon" ? "BT1-010" : "BT1-011",
    );
  });
});

describe("P-220 Assembly requirement (Discord: Millenniummon Assembly unavailable)", () => {
  const VALID_MATERIALS = ["EX9-023", "BT18-013", "BT18-015"];

  async function playByAssembly(materials: string[]) {
    const s = setupEngine({
      0: {
        hand: [{ card: "P-220", as: "source" }],
        trash: materials.map((card, index) => ({ card, as: `m${index}` })),
      },
    });
    s.state.memory = 8;
    await s.ready();
    const result = s.engine.applyIntent(0, {
      type: "playCard",
      instanceId: s.inst("source").instanceId,
      assembly: { materialInstanceIds: materials.map((_, index) => s.inst(`m${index}`).instanceId) },
    });
    return { s, result };
  }

  it("prints [Assembly -6] in the catalog", () => {
    expect(cardDefinition("P-220")!.effectText).toContain(
      "[Assembly -6] 3 [Composite]/[Ver.3]/[Ver.5] trait Digimon cards w/different levels",
    );
  });

  it("plays by Assembly -6 with three [Composite]/[Ver.3]/[Ver.5] Digimon of different levels", async () => {
    const { s, result } = await playByAssembly(VALID_MATERIALS);
    expect(result).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === "P-220"));
    expect(s.state.memory).toBe(0);
  });

  it.each([
    ["two materials share a level", ["EX9-023", "EX9-034", "BT18-015"]],
    ["a material lacks the trait", ["EX9-023", "BT18-013", "BT1-020"]],
  ])("rejects Assembly when %s", async (_label, materials) => {
    const { result } = await playByAssembly(materials);
    expect(result).toEqual({ ok: false, reason: "invalid-material" });
  });
});

describe("GitHub #5279 Millenniummon self-deletion", () => {
  it("offers and deletes the just-played Millenniummon itself after De-Digivolve", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: { hand: [{ card: "P-220", as: "millennium" }] },
        1: { battleArea: [{ card: "BT1-020", as: "target", under: ["BT1-010", "BT1-015"] }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    s.state.memory = 10;
    await s.ready();
    const instanceId = s.inst("millennium").instanceId;
    preferred.push(instanceId);
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId })).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[0]!.trash.some((card) => card.instanceId === instanceId) &&
        s.state.pendingDecision === undefined,
    );
    const deletion = s.decisions.filter(({ req }) => req.kind === "chooseTargets").at(-1)!.req;
    expect(deletion.options?.candidateInstanceIds).toHaveLength(2);
    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
  });
});
