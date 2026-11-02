import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { getCardDefinition } from "@aegis/shared";
import { compiled } from "./EX2-073.js";
import "../BT9/BT9-017.js";
import "./EX2-073.js";

describe("EX2-073 Gallantmon: Crimson Mode", () => {
  it("matches the catalog, Q2146/Q3366/Q3367 context, and typed IR", () => {
    expect(getCardDefinition("EX2-073")).toMatchObject({
      cardId: "EX2-073",
      nameEn: "Gallantmon: Crimson Mode",
      colors: ["Red"],
      kinds: ["Digimon"],
      level: 7,
      playCost: 15,
      dp: 15000,
      evoCosts: [{ color: "Red", level: 6, memoryCost: 6 }],
      forms: ["Mega"],
      attributes: ["Virus"],
      types: ["Holy Warrior"],
      rarity: "SEC",
      maxCountInDeck: 4,
      effectText:
        "[When Digivolving] Delete all of your opponent's Digimon with the highest DP.[When Attacking] Trash the top card of your opponent's security stack. Add 1 to the number of cards trashed by this effect for every 10 cards in your opponent's trash.",
    });
    expect(compiled.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          trigger: "WhenDigivolving",
          actions: [
            {
              kind: "Delete",
              target: {
                filter: { controller: "opponent", kind: ["Digimon"], superlative: "highestDP" },
                count: "all",
              },
            },
          ],
        }),
        expect.objectContaining({
          trigger: "WhenAttacking",
          actions: [
            {
              kind: "SecurityManipulation",
              op: "trashTop",
              controller: "opponent",
              amount: 1,
              scaling: {
                per: 10,
                filter: { zone: "trash", controller: "opponent" },
                unit: "cards",
                bonus: 1,
              },
            },
          ],
        }),
      ]),
    );
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual).toEqual([]);
  });

  it("deletes every opposing Digimon tied for highest DP when digivolving", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "EX2-011", as: "base" }], hand: [{ card: "EX2-073", as: "evolution" }] },
        1: { battleArea: ["EX2-029", "EX2-043", "EX2-019"] },
      },
      { autoSelectCards: true, autoOrderTriggers: true },
    );
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("evolution").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 2);
    expect(s.state.players[1]!.battleArea.map((permanent) => permanent.topCard.cardId)).toEqual(["EX2-043", "EX2-019"]);
    expect(s.state.memory).toBe(4);
  });

  it("uses the Gallantmon X line to reach 10 cards in trash and remove 2 security before the check", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT9-017", as: "gallantmonX", under: ["EX2-011"] }],
          hand: [{ card: "EX2-073", as: "crimsonMode" }],
        },
        1: {
          battleArea: [
            { card: "BT2-047", as: "highestA", dp: 10000 },
            { card: "BT2-047", as: "highestB", dp: 10000 },
            { card: "BT1-010", as: "lower", dp: 4000 },
          ],
          trash: ["BT1-009", "BT1-010", "BT1-011", "BT1-012", "BT1-013", "BT1-014", "BT1-009", "BT1-010"],
          security: ["BT1-009", "BT1-011", "BT1-012", "BT1-013"],
          deck: ["BT1-014"],
        },
      },
      { autoOrderTriggers: true, autoSelectCards: true },
    );
    s.state.memory = 6;
    const highestIds = [s.perm("highestA").topCard.instanceId, s.perm("highestB").topCard.instanceId];

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("gallantmonX").permanentId,
        instanceId: s.inst("crimsonMode").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() =>
      highestIds.every((instanceId) => s.state.players[1]!.trash.some((card) => card.instanceId === instanceId)),
    );
    expect(s.state.players[1]!.trash).toHaveLength(10);

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("gallantmonX").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 1 && !observe(s.engine).isAttacking());

    expect(s.state.players[1]!.security).toHaveLength(1);
    expect(s.state.players[1]!.battleArea.map((permanent) => permanent.topCard.cardId)).toEqual(["BT1-010"]);
  });

  it("wins by the successful attack after its security trash reaches zero", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT9-017", as: "base", under: ["EX2-011"] }],
          hand: [{ card: "EX2-073", as: "attacker" }],
          deck: ["BT1-014"],
        },
        1: {
          trash: Array.from({ length: 10 }, () => "BT1-009"),
          security: ["EX2-070", "BT1-013"],
          deck: ["BT1-014"],
        },
      },
      { autoOrderTriggers: true, autoSelectCards: true },
    );
    s.state.memory = 6;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("attacker").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === "EX2-073");
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("base").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.gameOver === true);
    expect(s.state.players[1]!.security).toHaveLength(0);
    expect(s.state.players[1]!.trash.map((card) => card.cardId)).toContain("EX2-070");
    expect(s.events.some((event) => event.kind === "effectActivated" && event.sourceCardId === "EX2-070")).toBe(false);
    expect(s.state.gameOver).toBe(true);
    expect(s.state.winnerSeat).toBe(0);
  });

  it("still trashes the base security card with fewer than ten cards in the trash", async () => {
    const nine = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT9-017", as: "base", under: ["EX2-011"] }],
          hand: [{ card: "EX2-073", as: "attacker" }],
          deck: ["BT1-014"],
        },
        1: {
          trash: Array.from({ length: 9 }, () => "BT1-009"),
          security: ["BT1-009", "BT1-010", "BT1-011", "BT1-012", "BT1-013"],
          deck: ["BT1-014"],
        },
      },
      { autoOrderTriggers: true, autoSelectCards: true },
    );
    nine.state.memory = 6;
    expect(
      nine.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: nine.perm("base").permanentId,
        instanceId: nine.inst("attacker").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => nine.perm("base").topCard.cardId === "EX2-073");
    await nine.ready();
    expect(
      nine.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: nine.perm("base").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(nine.engine).isAttacking());
    expect(nine.state.players[1]!.security).toHaveLength(3);
  });

  it("adds each complete ten-card trash group to its When Attacking security trash", async () => {
    const nineteen = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT9-017", as: "base", under: ["EX2-011"] }],
          hand: [{ card: "EX2-073", as: "attacker" }],
          deck: ["BT1-014"],
        },
        1: {
          trash: Array.from({ length: 19 }, () => "BT1-009"),
          security: ["BT1-009", "BT1-010", "BT1-011", "BT1-012", "BT1-013"],
          deck: ["BT1-014"],
        },
      },
      { autoOrderTriggers: true, autoSelectCards: true },
    );
    nineteen.state.memory = 6;
    expect(
      nineteen.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: nineteen.perm("base").permanentId,
        instanceId: nineteen.inst("attacker").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => nineteen.perm("base").topCard.cardId === "EX2-073");
    await nineteen.ready();
    expect(
      nineteen.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: nineteen.perm("base").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(nineteen.engine).isAttacking());
    expect(nineteen.state.players[1]!.security).toHaveLength(2);

    const twenty = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT9-017", as: "base", under: ["EX2-011"] }],
          hand: [{ card: "EX2-073", as: "attacker" }],
          deck: ["BT1-014"],
        },
        1: {
          trash: Array.from({ length: 20 }, () => "BT1-009"),
          security: ["BT1-009", "BT1-010", "BT1-011", "BT1-012", "BT1-013"],
          deck: ["BT1-014"],
        },
      },
      { autoOrderTriggers: true, autoSelectCards: true },
    );
    twenty.state.memory = 6;
    expect(
      twenty.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: twenty.perm("base").permanentId,
        instanceId: twenty.inst("attacker").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => twenty.perm("base").topCard.cardId === "EX2-073");
    await twenty.ready();
    expect(
      twenty.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: twenty.perm("base").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(twenty.engine).isAttacking());
    expect(twenty.state.players[1]!.security).toHaveLength(1);
  });
});
