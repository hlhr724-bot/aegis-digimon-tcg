import { describe, expect, it } from "vitest";
import { EffectTiming } from "@aegis/shared";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { matchingAlternateDigivolutionRequirement } from "../../engine/cards/cardData.js";
import "./BT12-081.js";

describe("BT12-081 Astamon", () => {
  it("registers every printed clause as executable IR", async () => {
    const { runtimeCompiledCard } = await import("../../engine/effects/interpreter/compiledCards.js");
    const card = runtimeCompiledCard("BT12-081")!;
    expect(card.coverage).toBe("full");
    expect(JSON.stringify(card)).not.toContain("RawUnparsed");
    expect(card.residual).toEqual([]);
  });

  it("limits the Save alternate evolution to yellow, green, or purple level 4 cards", () => {
    expect(matchingAlternateDigivolutionRequirement("BT12-081", "BT12-037")?.cost).toBe(3);
    expect(matchingAlternateDigivolutionRequirement("BT12-081", "BT12-061")).toBeUndefined();
  });

  it("plays a level 4 Save Digimon from under a Tamer", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT12-081", as: "astamon" },
            { card: "BT12-094", as: "tamer", under: ["BT12-008"] },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await advance(s.engine).fire(EffectTiming.WhenDigivolving, s.perm("astamon"));
    await settle(() => s.state.players[0]!.battleArea.some((p) => p.topCard?.cardId === "BT12-008"));
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard?.cardId === "BT12-008")).toBe(true);
  });

  it("offers the Quartzmon branch only with four digivolution cards", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT12-081", as: "astamon", under: ["BT12-008", "BT12-009", "BT12-010", "BT12-011"] }],
          hand: ["BT12-057"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 6;
    await advance(s.engine).fire(EffectTiming.WhenDigivolving, s.perm("astamon"));
    await settle(() => s.perm("astamon").topCard?.cardId === "BT12-057");
    expect(s.perm("astamon").topCard?.cardId).toBe("BT12-057");
  });

  it("does not resolve Quartzmon when the Save play option is chosen instead", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT12-081", as: "astamon", under: ["BT12-008", "BT12-009", "BT12-010", "BT12-011"] },
            { card: "BT12-094", as: "tamer", under: ["BT12-008"] },
          ],
          hand: ["BT12-057"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    await advance(s.engine).fire(EffectTiming.WhenDigivolving, s.perm("astamon"));
    await settle(() => s.state.pendingDecision === undefined);
    expect(s.perm("astamon").topCard?.cardId).toBe("BT12-081");
    expect(s.state.players[0]!.hand.map(({ cardId }) => cardId)).toContain("BT12-057");
    expect(s.state.players[0]!.battleArea.some(({ topCard }) => topCard?.cardId === "BT12-008")).toBe(true);
  });

  it("does not offer Quartzmon with fewer than four digivolution cards", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT12-081", as: "astamon", under: ["BT12-008", "BT12-009", "BT12-010"] }],
          hand: ["BT12-057"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await advance(s.engine).fire(EffectTiming.WhenDigivolving, s.perm("astamon"));
    await settle(() => s.state.pendingDecision === undefined);
    expect(s.perm("astamon").topCard?.cardId).toBe("BT12-081");
  });

  it("draws from its inherited Save attack effect", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT12-077", as: "host", under: ["BT12-081"] }], deck: ["BT1-010"] },
    });
    await s.ready();
    await advance(s.engine).fire(EffectTiming.OnUseAttack, s.perm("host"));
    await settle(() => s.state.players[0]!.hand.some(({ cardId }) => cardId === "BT1-010"));
    expect(s.state.players[0]!.hand.map(({ cardId }) => cardId)).toContain("BT1-010");
  });
});
