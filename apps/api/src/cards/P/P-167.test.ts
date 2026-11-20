import { describe, expect, it } from "vitest";
import { runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import { EffectTiming } from "@aegis/shared";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import "./P-167.js";

describe("P-167 Landramon", () => {
  it("encodes Mineral/Rock discard cost and reveal placement choices at both timings", () => {
    const compiled = runtimeCompiledCard("P-167")!;
    for (const trigger of ["StartOfYourMainPhase", "WhenDigivolving"] as const) {
      expect(compiled.effects.find((effect) => effect.trigger === trigger)).toMatchObject({
        actions: [
          {
            kind: "RevealAdd",
            revealCount: 3,
            rest: "deckTopOrBottom",
            add: [{ count: 1, to: "hand", orDispositions: [{ to: "placeUnder", underFilter: { isSelfRef: true } }] }],
            cost: {
              kind: "trash",
              target: {
                count: 1,
                filter: {
                  controller: "mine",
                  zone: "digivolutionCards",
                  nameOrTrait: [{ tokens: ["Mineral", "Rock"], match: "trait" }],
                },
              },
            },
            optional: true,
            abortOnDecline: true,
          },
        ],
      });
    }
  });

  it("encodes inherited De-Digivolve 1 after a qualifying digivolution card discard", () => {
    const inherited = runtimeCompiledCard("P-167")!.effects.find((effect) => effect.isInherited)!;
    expect(inherited).toMatchObject({
      trigger: "Static",
      actions: [
        {
          kind: "SubTrigger",
          event: "onDigivolutionCardsDiscardedBatch",
          sourceFilter: { isSelfRef: true },
          requireByEffect: true,
          hostFilter: { controller: "mine", nameOrTrait: [{ tokens: ["Mineral", "Rock"], match: "trait" }] },
          actions: [
            {
              kind: "DeDigivolve",
              amount: 1,
              target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
            },
          ],
        },
      ],
    });
  });

  it("pays with a Mineral digivolution card and adds a revealed Mineral card", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "P-167", as: "landra", under: ["BT10-062"] }],
          deck: [{ card: "BT10-062", as: "revealed" }, { card: "BT1-009" }, { card: "BT1-009" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    await s.ready();
    await advance(s.engine).fire(EffectTiming.OnStartMainPhase, s.perm("landra"));
    await settle();
    expect(s.state.players[0]!.trash.some((card) => card.cardId === "BT10-062")).toBe(true);
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("revealed").instanceId)).toBe(true);
  });

  it.each([
    ["Start of Your Main Phase", EffectTiming.OnStartMainPhase],
    ["When Digivolving", EffectTiming.WhenDigivolving],
  ] as const)("declines the optional 'by' cost at %s and reveals nothing", async (_label, timing) => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "P-167", as: "landra", under: [{ card: "BT10-062", as: "source" }] }],
        deck: [{ card: "BT10-062", as: "top" }, { card: "BT1-009" }, { card: "BT1-009" }],
      },
    });
    await s.ready();
    const deckBefore = s.state.players[0]!.deck.map((card) => card.instanceId);
    const resolution = advance(s.engine).fire(timing, s.perm("landra"));
    await settle(() => s.state.pendingDecision !== undefined || s.perm("landra").stack.length === 0);
    expect(s.state.pendingDecision?.kind).toBe("optional");

    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: s.state.pendingDecision!.decisionId,
        response: { kind: "optional", accept: false },
      }),
    ).toEqual({ ok: true });
    await resolution;

    expect(s.perm("landra").stack.map((card) => card.instanceId)).toEqual([s.inst("source").instanceId]);
    expect(s.state.players[0]!.trash).toHaveLength(0);
    expect(s.state.players[0]!.hand).toHaveLength(0);
    expect(s.state.players[0]!.deck.map((card) => card.instanceId)).toEqual(deckBefore);
  });

  it("publicly triggers the inherited De-Digivolve after an effect trashes a Mineral stack card", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "P-167", as: "landra" },
            { card: "BT10-062", as: "host", under: ["P-167", "BT1-009"] },
          ],
          deck: [{ card: "BT10-062" }, { card: "BT1-009" }, { card: "BT1-009" }],
        },
        1: { battleArea: [{ card: "BT1-025", as: "opponent", under: ["BT1-009"] }] },
      },
      { autoSelectCards: true, autoChooseOption: true },
    );
    await s.ready();
    const source = s.perm("host").stack.find((card) => card.cardId === "P-167");
    if (!source) throw new Error("missing P-167 stack card");
    await advance(s.engine).verb.trashDigivolutionCards(s.perm("host").permanentId, [source.instanceId], 0);
    await settle(() => s.perm("host").stack.length === 1 && s.perm("opponent").stack.length === 0);
    expect(s.perm("host").stack.some((card) => card.cardId === "BT1-009")).toBe(true);
    expect(s.perm("opponent").stack).toHaveLength(0);
  });

  it("does not react when an effect trashes a different stack card", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT10-062", as: "host", under: ["P-167", "BT10-062"] }] },
      1: { battleArea: [{ card: "BT1-025", as: "opponent", under: ["BT1-009"] }] },
    });
    await s.ready();
    const other = s.perm("host").stack.find((card) => card.cardId === "BT10-062");
    if (!other) throw new Error("missing other stack card");
    await advance(s.engine).verb.trashDigivolutionCards(s.perm("host").permanentId, [other.instanceId], 0);
    expect(s.perm("opponent").stack).toHaveLength(1);
  });

  it("does not react when P-167 leaves its stack without effect attribution", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT10-062", as: "host", under: ["P-167"] }] },
      1: { battleArea: [{ card: "BT1-025", as: "opponent", under: ["BT1-009"] }] },
    });
    await s.ready();
    const source = s.perm("host").stack[0]!;
    await advance(s.engine).verb.trashDigivolutionCards(s.perm("host").permanentId, [source.instanceId]);
    expect(s.perm("opponent").stack).toHaveLength(1);
  });
});
