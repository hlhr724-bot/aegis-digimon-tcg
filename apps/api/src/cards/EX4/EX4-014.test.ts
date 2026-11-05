import { describe, expect, it } from "vitest";
import { getCardDefinition } from "@aegis/shared";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import { compiled } from "./EX4-014.js";
import "../BT10/BT10-024.js";
import "../index.js";

describe("EX4-014 Gaossmon", () => {
  it("has the official identity and draws when either player's Blue Flare card is played", () => {
    expect(getCardDefinition("EX4-014")).toMatchObject({
      cardId: "EX4-014",
      nameEn: "Gaossmon",
      colors: ["Blue"],
      level: 3,
      playCost: 3,
      dp: 1000,
      evoCosts: [{ color: "Blue", level: 2, memoryCost: 0 }],
      forms: ["Rookie"],
      attributes: ["Virus"],
      types: ["Reptile", "Blue Flare"],
      effectText:
        "[Your Turn][Once Per Turn] When a card with the [Blue Flare] trait is played, . ＜Draw 1＞ (Draw 1 card from your deck.) When a card with the [Twilight] trait is played, return 1 Digimon card with DigiXros requirements from your trash to your hand.",
    });
    expect(runtimeCompiledCard("EX4-014")).toMatchObject({ coverage: "full", residual: [] });
    expect(compiled.effects?.find((entry) => entry.trigger === "YourTurn")?.actions?.[0]).toMatchObject({
      kind: "SubTrigger",
      event: "whenPlayed",
      sourceFilter: { nameOrTrait: [{ match: "trait", tokens: ["Blue Flare"] }] },
      actions: [{ kind: "Draw", controller: "mine", amount: 1 }],
    });
  });

  it("digivolves from a blue level-2 Digi-Egg for 0 and preserves the source", async () => {
    const s = setupEngine({
      0: {
        breeding: { card: "BT1-003", as: "base" },
        hand: [{ card: "EX4-014", as: "gaossmon" }],
      },
    });
    s.state.memory = 0;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("gaossmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === "EX4-014");

    expect(s.state.memory).toBe(0);
    expect(s.perm("base").topCard.cardId).toBe("EX4-014");
    expect(s.perm("base").topCard.instanceId).toBe(s.inst("gaossmon").instanceId);
    expect(s.perm("base").stack.map((card) => card.cardId)).toEqual(["BT1-003"]);
  });

  it("rejects a non-blue level-3 source without paying or moving cards", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-009", as: "base" }],
        hand: [{ card: "EX4-014", as: "gaossmon" }],
      },
    });
    s.state.memory = 0;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("gaossmon").instanceId,
      }),
    ).toEqual({ ok: false, reason: "invalid-evolution" });
    expect(s.state.memory).toBe(0);
    expect(s.perm("base").topCard.cardId).toBe("BT1-009");
    expect(s.perm("base").stack).toHaveLength(0);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("gaossmon").instanceId);
  });
  it("returns a DigiXros-requirement Digimon when either player's Twilight card is played", () => {
    expect(compiled.effects?.find((entry) => entry.trigger === "YourTurn")?.actions?.[1]).toMatchObject({
      kind: "SubTrigger",
      event: "whenPlayed",
      sourceFilter: { nameOrTrait: [{ match: "trait", tokens: ["Twilight"] }] },
      actions: [
        {
          kind: "Return",
          to: "hand",
          target: { filter: { zone: "trash", controller: "mine", kind: ["Digimon"], hasDigiXrosRequirements: true } },
        },
      ],
    });
  });

  it("draws when a Blue Flare card is played during your turn", async () => {
    const s = setupEngine(
      {
        0: {
          deck: ["BT1-010", "BT1-011"],
          battleArea: [{ card: "EX4-014", as: "gaossmon" }],
          hand: [{ card: "BT10-018", as: "blueFlare" }],
        },
      },
      { autoSelectCards: true },
    );
    s.state.turnSeat = 0;
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("blueFlare").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.hand.length === 1);

    expect(s.state.players[0]!.hand).toHaveLength(1);
    expect(s.state.players[0]!.deck).toHaveLength(1);
  });

  it("Q3453 draws when the opponent plays Blue Flare during your turn", async () => {
    const s = setupEngine({
      0: {
        deck: ["BT1-010"],
        battleArea: [{ card: "EX4-014", as: "gaossmon" }],
      },
      1: { hand: [{ card: "BT10-018", as: "opponentBlueFlare" }] },
    });
    s.state.turnSeat = 0;
    await s.ready();

    await advance(s.engine).verb.playInstances([s.inst("opponentBlueFlare").instanceId]);
    await settle(() => s.state.players[0]!.hand.length === 1);

    expect(s.state.players[0]!.hand).toHaveLength(1);
    expect(s.state.players[0]!.deck).toHaveLength(0);
  });

  it("Q3455 draws from its own Blue Flare play", async () => {
    const s = setupEngine({
      0: {
        deck: ["BT1-010"],
        hand: [{ card: "EX4-014", as: "gaossmon" }],
      },
    });
    s.state.turnSeat = 0;
    s.state.memory = 3;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("gaossmon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.hand.length === 1);

    expect(s.state.players[0]!.hand).toHaveLength(1);
    expect(s.state.players[0]!.deck).toHaveLength(0);
  });

  it("does not react to a Blue Flare play during the opponent's turn", async () => {
    const s = setupEngine({
      0: {
        deck: ["BT1-010"],
        battleArea: [{ card: "EX4-014", as: "gaossmon" }],
      },
      1: { hand: [{ card: "BT10-018", as: "opponentBlueFlare" }] },
    });
    s.state.turnSeat = 1;
    await s.ready();

    await advance(s.engine).verb.playInstances([s.inst("opponentBlueFlare").instanceId]);

    expect(s.state.players[0]!.hand).toHaveLength(0);
    expect(s.state.players[0]!.deck).toHaveLength(1);
  });

  it("returns a DigiXros Digimon when a Twilight card is played during your turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX4-014", as: "gaossmon" }],
          hand: [{ card: "BT10-058", as: "twilight" }],
          deck: ["BT10-061", "BT10-066", "BT10-062", "BT10-064"],
          trash: [
            { card: "BT10-024", as: "xrosCard" },
            { card: "BT1-009", as: "nonDigiXrosCard" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 10;
    s.state.turnSeat = 0;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("twilight").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.some((perm) => perm.topCard?.cardId === "BT10-058"));
    await settle(() => s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("xrosCard").instanceId));
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("xrosCard").instanceId)).toBe(true);
    expect(s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("xrosCard").instanceId)).toBe(false);
    expect(s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("nonDigiXrosCard").instanceId)).toBe(
      true,
    );
  });

  it("ignores a play without either watched trait", async () => {
    const s = setupEngine(
      {
        0: {
          deck: ["BT1-010"],
          battleArea: [{ card: "EX4-014", as: "gaossmon" }],
          hand: [{ card: "BT1-009", as: "unwatched" }],
        },
      },
      { autoSelectCards: true },
    );
    s.state.turnSeat = 0;
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("unwatched").instanceId })).toEqual({
      ok: true,
    });
    await settle(() =>
      s.state.players[0]!.battleArea.some((perm) => perm.topCard?.instanceId === s.inst("unwatched").instanceId),
    );

    expect(s.state.players[0]!.deck).toHaveLength(1);
    expect(s.state.players[0]!.hand).toHaveLength(0);
  });

  it("resolves both clauses for one dual-trait play, then blocks each later separate trigger (Q3454/Q3456)", async () => {
    const s = setupEngine(
      {
        0: {
          deck: ["BT1-009", "BT1-009", "BT1-009"],
          battleArea: [{ card: "EX4-014", as: "gaossmon" }],
          hand: [
            { card: "EX4-021", as: "dualTrait" },
            { card: "BT10-018", as: "singleTrait" },
            { card: "BT14-057", as: "twilightTrait" },
          ],
          trash: [
            { card: "BT10-024", as: "xrosCard" },
            { card: "BT10-024", as: "xrosCardSecond" },
          ],
        },
        1: {
          battleArea: [{ card: "BT1-009", as: "opponentTarget" }],
          security: ["BT1-009", "BT1-009", "BT1-009", "BT1-009", "BT1-009"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    s.state.memory = 20;
    s.state.turnSeat = 0;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("dualTrait").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("xrosCard").instanceId));
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("xrosCard").instanceId)).toBe(true);
    expect(s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("xrosCardSecond").instanceId)).toBe(
      true,
    );
    expect(s.state.players[0]!.deck).toHaveLength(2);

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("singleTrait").instanceId })).toEqual({
      ok: true,
    });
    await settle(() =>
      s.state.players[0]!.battleArea.some((perm) => perm.topCard?.instanceId === s.inst("singleTrait").instanceId),
    );
    expect(s.state.players[0]!.deck).toHaveLength(2);

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("twilightTrait").instanceId })).toEqual({
      ok: true,
    });
    await settle(() =>
      s.state.players[0]!.battleArea.some((perm) => perm.topCard?.instanceId === s.inst("twilightTrait").instanceId),
    );
    expect(s.state.players[0]!.deck).toHaveLength(2);
    expect(s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("xrosCardSecond").instanceId)).toBe(
      true,
    );
  });
});
