import { advance } from "../../engine/testkit/advance.js";
import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { compiled } from "./BT11-022.js";
import "../index.js";

describe("BT11-022 Dracomon", () => {
  it("matches the catalog and carries both complete watcher contracts", () => {
    expect(getCardDefinition("BT11-022")).toMatchObject({
      cardId: "BT11-022",
      nameEn: "Dracomon",
      colors: ["Blue"],
      kinds: ["Digimon"],
      level: 3,
      playCost: 3,
      dp: 1000,
      evoCosts: [{ color: "Blue", level: 2, memoryCost: 0 }],
      forms: ["Rookie"],
      attributes: ["Data"],
      types: ["Dragon", "Blue Flare"],
    });
    expect(compiled.digivolutionRequirement).toEqual([{ names: ["Bebydomon"], cost: 0, isAlternate: true }]);
    expect(compiled).toMatchObject({
      effects: [
        { trigger: "YourTurn", frequency: "OncePerTurn", actions: [{ kind: "SubTrigger", event: "whenPlayed" }] },
        {
          trigger: "YourTurn",
          isInherited: true,
          frequency: "OncePerTurn",
          actions: [{ kind: "SubTrigger", event: "whenPlayed" }],
        },
      ],
      coverage: "full",
      residual: [],
    });
  });

  it("supports both normal blue and named red Bebydomon evolution for 0", async () => {
    for (const base of ["BT11-002", "BT1-002"] as const) {
      const s = setupEngine({
        0: { battleArea: [{ card: base, as: "base" }], hand: [{ card: "BT11-022", as: "dracomon" }] },
      });
      s.state.memory = 2;
      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: s.perm("base").permanentId,
          instanceId: s.inst("dracomon").instanceId,
          ...(base === "BT1-002" ? { useAlternateCost: true } : {}),
        }),
      ).toEqual({ ok: true });
      await settle(() => s.perm("base").topCard.cardId === "BT11-022");
      expect(s.state.memory).toBe(2);
    }
  });
  it("draws once when another Blue Flare Digimon is played", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT11-022", as: "dracomon" }],
        hand: [{ card: "BT19-022", as: "qualifier" }],
        deck: [{ card: "BT1-009", as: "drawn" }, "BT1-009", "BT1-009", "BT1-009", "BT1-009"],
      },
    });
    s.state.memory = 10;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("qualifier").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.hand.some(({ instanceId }) => instanceId === s.inst("drawn").instanceId));

    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toContain(s.inst("drawn").instanceId);
  });

  it("does not trigger for a non-Dramon, non-Blue-Flare Digimon", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT11-022", as: "dracomon" }],
        hand: [{ card: "BT1-010", as: "nonQualifier" }],
        deck: [{ card: "BT1-009", as: "notDrawn" }],
      },
    });
    s.state.memory = 10;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("nonQualifier").instanceId })).toEqual({
      ok: true,
    });
    await settle(() =>
      s.state.players[0]!.battleArea.some(({ topCard }) => topCard?.instanceId === s.inst("nonQualifier").instanceId),
    );
    await Promise.resolve();

    expect(s.state.players[0]!.deck.map(({ instanceId }) => instanceId)).toContain(s.inst("notDrawn").instanceId);
  });

  it("gains 1 memory only for the first qualifying public play each turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT1-037", as: "carrier", under: ["BT11-022"] },
            { card: "BT1-086", as: "tamer" },
            { card: "BT1-013", as: "spare" },
          ],
          hand: [
            { card: "BT19-022", as: "first" },
            { card: "BT19-022", as: "second" },
            { card: "BT19-022", as: "third" },
          ],
          deck: ["BT1-013", "BT1-013", "BT1-013", "BT1-013", "BT1-013"],
        },
        1: { deck: ["BT1-013", "BT1-013", "BT1-013", "BT1-013", "BT1-013"] },
      },
      { autoDeclineOptional: true },
    );
    s.state.memory = 10;
    await s.ready();

    const firstTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("first").instanceId })).toEqual({ ok: true });
    await settle(() =>
      s.state.players[0]!.battleArea.some((p) => p.topCard?.instanceId === s.inst("first").instanceId),
    );
    expect(s.state.memory).toBe(6);

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("second").instanceId })).toEqual({
      ok: true,
    });
    await settle(() =>
      s.state.players[0]!.battleArea.some((p) => p.topCard?.instanceId === s.inst("second").instanceId),
    );
    expect(s.state.memory).toBe(1);
    advance(s.engine).endMainPhaseIfOpen(0);
    await firstTurn;

    s.state.turnSeat = 1;
    s.state.memory = 3;
    await advance(s.engine).runTurn(1);
    s.state.turnSeat = 0;
    s.state.memory = 10;
    const nextTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("third").instanceId })).toEqual({ ok: true });
    await settle(() =>
      s.state.players[0]!.battleArea.some((p) => p.topCard?.instanceId === s.inst("third").instanceId),
    );
    expect(s.state.memory).toBe(6);
    advance(s.engine).endMainPhaseIfOpen(0);
    await nextTurn;
  });

  it("draws for the Dramon-name branch only once across two qualifying plays", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT11-022", as: "dracomon" }],
        hand: [
          { card: "BT1-009", as: "first" },
          { card: "BT1-009", as: "second" },
        ],
        deck: [
          { card: "BT1-009", as: "drawn" },
          { card: "BT1-009", as: "notDrawn" },
        ],
      },
    });
    s.state.memory = 30;
    for (const alias of ["first", "second"] as const) {
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst(alias).instanceId })).toEqual({ ok: true });
      await settle(() =>
        s.state.players[0]!.battleArea.some((p) => p.topCard?.instanceId === s.inst(alias).instanceId),
      );
    }
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toContain(s.inst("drawn").instanceId);
    expect(s.state.players[0]!.deck.map(({ instanceId }) => instanceId)).toContain(s.inst("notDrawn").instanceId);
  });
});
