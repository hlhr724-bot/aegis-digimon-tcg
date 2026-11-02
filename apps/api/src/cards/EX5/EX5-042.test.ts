import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { observe } from "../../engine/testkit/observe.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { compiled } from "./EX5-042.js";
import "../index.js";

describe("EX5-042 Merukimon", () => {
  it("matches the catalog and encodes Fortitude, reveal/play, and Rush boundaries", () => {
    expect(getCardDefinition("EX5-042")).toMatchObject({
      cardId: "EX5-042",
      nameEn: "Merukimon",
      colors: ["Green"],
      kinds: ["Digimon"],
      level: 6,
      playCost: 12,
      dp: 12000,
      forms: ["Mega"],
      attributes: ["Virus"],
      types: ["Shaman", "Olympos XII"],
      evoCosts: [{ color: "Green", level: 5, memoryCost: 4 }],
      effectText: expect.stringContaining("Reveal the top card of your deck"),
    });
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
    expect(compiled.effects?.every((entry) => entry.frequency === undefined)).toBe(true);
    expect(compiled.effects?.find((entry) => entry.trigger === "Static")?.keywords).toEqual([
      { keyword: "Fortitude", raw: "＜Fortitude＞" },
    ]);

    const revealAction = {
      kind: "RevealAdd",
      revealCount: 1,
      add: [
        {
          effectTextPart: "a level 5 or lower Digimon card with ＜Fortitude＞, play it without paying the cost.",
          filter: {
            controllerDefault: "mine",
            kind: ["Digimon"],
            levelComparison: { op: "lte", value: 5 },
            keywords: ["Fortitude"],
          },
          count: 1,
          to: "play",
        },
        { effectTextPart: "Add the rest to your hand.", filter: {}, count: 1, to: "hand" },
      ],
      rest: "deckBottom",
    };
    expect(compiled.effects?.find((entry) => entry.trigger === "OnPlay")?.actions).toEqual([revealAction]);
    expect(compiled.effects?.find((entry) => entry.trigger === "WhenDigivolving")?.actions).toEqual([revealAction]);
    expect(compiled.effects?.find((entry) => entry.trigger === "YourTurn")?.actions).toEqual([
      {
        kind: "GainKeyword",
        target: {
          filter: { digivolutionCards: "none", controller: "mine", kind: ["Digimon"], keywords: ["Fortitude"] },
          count: "all",
        },
        keyword: { keyword: "Rush", raw: "＜Rush＞" },
        duration: "permanent",
      },
    ]);
  });

  it("plays a revealed level-five-or-lower Fortitude Digimon on public On Play", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "EX5-042", as: "source" }],
          deck: [{ card: "EX5-039", as: "fortitude" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderCards: true, autoChooseOption: true },
    );
    s.state.memory = 12;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("source").instanceId })).toEqual({
      ok: true,
    });
    await settle(() =>
      s.state.players[0]!.battleArea.some((perm) => perm.topCard?.instanceId === s.inst("fortitude").instanceId),
    );

    expect(
      s.state.players[0]!.battleArea.some((perm) => perm.topCard?.instanceId === s.inst("fortitude").instanceId),
    ).toBe(true);
    expect(s.state.players[0]!.deck).toHaveLength(0);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("plays a revealed Fortitude Digimon on public When Digivolving", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX5-039", as: "base" }],
          hand: [{ card: "EX5-042", as: "source" }],
          deck: [
            { card: "BT1-009", as: "evolutionDraw" },
            { card: "EX5-039", as: "fortitude" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderCards: true, autoChooseOption: true },
    );
    s.state.memory = 4;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("source").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() =>
      s.state.players[0]!.battleArea.some((perm) => perm.topCard?.instanceId === s.inst("fortitude").instanceId),
    );

    expect(
      s.state.players[0]!.battleArea.some((perm) => perm.topCard?.instanceId === s.inst("fortitude").instanceId),
    ).toBe(true);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("evolutionDraw").instanceId);
    expect(s.state.players[0]!.deck).toHaveLength(0);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("returns a revealed non-Fortitude or over-level Fortitude card to hand", async () => {
    for (const card of ["BT10-079", "EX5-042"] as const) {
      const alias = card === "BT10-079" ? "nonFortitude" : "tooHigh";
      const s = setupEngine(
        {
          0: {
            hand: [{ card: "EX5-042", as: "source" }],
            deck: [{ card, as: alias }],
          },
        },
        { autoAcceptOptional: true, autoSelectCards: true, autoOrderCards: true, autoChooseOption: true },
      );
      s.state.memory = 12;
      await s.ready();
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("source").instanceId })).toEqual({
        ok: true,
      });
      await settle(() => s.state.players[0]!.hand.some((entry) => entry.instanceId === s.inst(alias).instanceId));

      expect(s.state.players[0]!.hand.map((entry) => entry.instanceId)).toContain(s.inst(alias).instanceId);
      expect(s.state.players[0]!.battleArea.some((perm) => perm.topCard?.instanceId === s.inst(alias).instanceId)).toBe(
        false,
      );
      expect(s.state.pendingDecision).toBeUndefined();
    }
  });

  it("grants Rush only to own Fortitude Digimon without digivolution cards and permits a public attack", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX5-042", as: "merukimon" },
            { card: "EX5-039", as: "fortitude" },
            { card: "EX5-039", as: "stackedFortitude", under: ["BT1-009"] },
            { card: "BT1-009", as: "nonFortitude" },
          ],
        },
        1: { security: ["BT1-010"] },
      },
      { autoSelectCards: true },
    );
    await s.ready();
    expect(observe(s.engine).hasKeyword(s.perm("merukimon"), "Fortitude")).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("merukimon"), "Rush")).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("fortitude"), "Rush")).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("stackedFortitude"), "Rush")).toBe(false);
    expect(observe(s.engine).hasKeyword(s.perm("nonFortitude"), "Rush")).toBe(false);

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("fortitude").permanentId,
        target: { kind: "player" },
      }).ok,
    ).toBe(true);
    await settle(() => s.perm("fortitude").isSuspended);
    expect(s.state.pendingDecision).toBeUndefined();
  });
});
