import { describe, expect, it } from "vitest";
import { getCardDefinition, getCompiledCard } from "@aegis/shared";
import { registeredCompiledCards } from "../../engine/effects/interpreter/compiledCards.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { advance } from "../../engine/testkit/advance.js";
import "../../cards/index.js";

describe("AD1-003 WarGrowlmon", () => {
  it("plays Takato and deletes an opposing Digimon at the printed DP limit when digivolving", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "AD1-001", as: "base" }],
          hand: [
            { card: "AD1-003", as: "wargrowlmon" },
            { card: "BT12-089", as: "takato" },
          ],
        },
        1: { battleArea: [{ card: "BT1-010", as: "target", dp: 6000 }] },
      },
      { autoSelectCards: true, autoAcceptOptional: true },
    );
    s.state.memory = 3;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("wargrowlmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 0 && s.state.players[0]!.battleArea.length === 2);

    const confirmations = s.decisions.filter(
      ({ req }) => req.sourceCardId === "AD1-003" && (req.kind === "optional" || req.kind === "chooseTargets"),
    );
    expect(confirmations.map(({ req }) => req.options?.effectTextPart)).toEqual([
      "[On Play] [When Digivolving] You may play 1 [Takato Matsuki] from your hand or trash without paying the cost.",
      "Then, you may delete 1 of your opponent's Digimon with 6000 DP or less.",
    ]);
    expect(confirmations[1]?.req).toMatchObject({
      kind: "chooseTargets",
      options: { min: 0, max: 1, purpose: "optionalTarget" },
    });
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(
      s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.instanceId === s.inst("takato").instanceId),
    ).toBe(true);
  });

  it("allows both printed level-4 Growlmon-name and Hero digivolution routes for cost 3", async () => {
    for (const baseCardId of ["BT12-010", "BT21-066"]) {
      const s = setupEngine({
        0: {
          battleArea: [{ card: baseCardId, as: "base" }],
          hand: [{ card: "AD1-003", as: "wargrowlmon" }],
          deck: [{ card: "BT1-009", as: "bonus" }],
        },
      });
      s.state.memory = 3;

      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: s.perm("base").permanentId,
          instanceId: s.inst("wargrowlmon").instanceId,
        }),
      ).toEqual({ ok: true });
      await settle(() => s.perm("base").topCard?.cardId === "AD1-003");

      expect(s.perm("base").topCard?.cardId).toBe("AD1-003");
      expect(s.state.memory).toBe(0);
      expect(s.perm("base").stack.map((card) => card.cardId)).toEqual([baseCardId]);
      expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("bonus").instanceId)).toBe(true);
      expect(s.state.players[0]!.deck.length).toBe(0);
    }
  });

  it("plays Takato from trash and deletes only an eligible Digimon on play", async () => {
    const s = setupEngine(
      {
        0: { hand: [{ card: "AD1-003", as: "wargrowlmon" }], trash: [{ card: "BT12-089", as: "takato" }] },
        1: {
          battleArea: [
            { card: "BT1-010", as: "eligible", dp: 6000 },
            { card: "BT1-010", as: "tooLarge", dp: 7000 },
          ],
        },
      },
      { autoSelectCards: true, autoAcceptOptional: true },
    );
    s.state.memory = 7;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("wargrowlmon").instanceId })).toEqual({
      ok: true,
    });
    await settle(
      () =>
        s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === "BT12-089") &&
        s.state.players[1]!.battleArea.length === 1,
    );

    expect(
      s.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === s.perm("tooLarge").permanentId),
    ).toBe(true);
  });

  it("uses Raid to redirect a player attack to the highest-DP unsuspended Digimon", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "AD1-003", dp: 7000, as: "attacker" }] },
        1: {
          battleArea: [
            { card: "BT1-010", dp: 9000, as: "highest" },
            { card: "BT1-011", dp: 3000, as: "lower" },
          ],
        },
      },
      { autoSelectCards: true },
    );
    await s.ready();
    const attackerId = s.perm("attacker").permanentId;
    const highestId = s.perm("highest").permanentId;
    const lowerId = s.perm("lower").permanentId;

    expect(
      s.engine.applyIntent(0, { type: "attack", attackerPermanentId: attackerId, target: { kind: "player" } }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.every((permanent) => permanent.permanentId !== attackerId), 5000);

    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.permanentId === attackerId)).toBe(false);
    expect(s.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === highestId)).toBe(true);
    expect(s.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === lowerId)).toBe(true);
  });

  it("plays both Takato and Guilmon when an inherited holder leaves in battle, per Q6053", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            {
              card: "AD1-008",
              dp: 12000,
              suspended: true,
              as: "gallantmon",
              under: ["BT12-089", "BT12-007", "AD1-003"],
            },
          ],
        },
        1: { battleArea: [{ card: "BT1-010", dp: 13000, as: "attacker" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    const gallantmonId = s.perm("gallantmon").permanentId;

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "permanent", permanentId: gallantmonId },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[0]!.battleArea.filter(
          (permanent) => permanent.topCard?.cardId === "BT12-089" || permanent.topCard?.cardId === "BT12-007",
        ).length === 2,
      5000,
    );
    await settle();

    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.permanentId === gallantmonId)).toBe(false);
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === "BT12-089")).toBe(true);
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === "BT12-007")).toBe(true);
  });

  it("plays the sole available Takato when no Guilmon is in the stack, per Q6054", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "AD1-008", dp: 12000, suspended: true, as: "gallantmon", under: ["BT12-089", "AD1-003"] },
          ],
        },
        1: { battleArea: [{ card: "BT1-010", dp: 13000, as: "attacker" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 1;

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "permanent", permanentId: s.perm("gallantmon").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(
      () => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === "BT12-089"),
      5000,
    );

    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === "BT12-089")).toBe(true);
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === "BT12-007")).toBe(false);
  });

  it("plays the sole available Guilmon when no Takato is in the stack, per Q6054", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "AD1-008", dp: 12000, suspended: true, as: "gallantmon", under: ["BT12-007", "AD1-003"] },
          ],
        },
        1: { battleArea: [{ card: "BT1-010", dp: 13000, as: "attacker" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 1;

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "permanent", permanentId: s.perm("gallantmon").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(
      () => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === "BT12-007"),
      5000,
    );

    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === "BT12-007")).toBe(true);
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === "BT12-089")).toBe(false);
  });

  it("feedback #10: has no inherited replacement once Wingdramon trashed WarGrowlmon from the stack", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            {
              card: "AD1-008",
              dp: 12000,
              suspended: true,
              as: "gallantmon",
              under: ["AD1-003", "ST7-05", "BT17-080", "BT21-064"],
            },
          ],
        },
        1: {
          battleArea: [{ card: "BT1-010", dp: 17000, as: "attacker" }],
          hand: [{ card: "EX13-021", as: "wingdramon" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    s.state.memory = 9;
    const gallantmonId = s.perm("gallantmon").permanentId;
    await s.ready();

    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("wingdramon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("gallantmon").stack.length === 2 && s.state.pendingDecision === undefined);
    expect(s.perm("gallantmon").stack.map((card) => card.cardId)).toEqual(["BT17-080", "BT21-064"]);
    expect(s.state.players[0]!.trash.map((card) => card.cardId).sort()).toEqual(["AD1-003", "ST7-05"]);

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "permanent", permanentId: gallantmonId },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[0]!.battleArea.every((permanent) => permanent.permanentId !== gallantmonId) &&
        s.state.pendingDecision === undefined,
      5000,
    );
    await settle();

    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.decisions.some(({ req }) => req.sourceCardId === "AD1-003")).toBe(false);
    expect(s.state.players[0]!.trash.map((card) => card.cardId)).toEqual(
      expect.arrayContaining(["AD1-003", "ST7-05", "BT17-080", "BT21-064", "AD1-008"]),
    );
  });

  it("does not play inherited cards when Gallantmon leaves by its controller's effect", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "AD1-008", dp: 12000, as: "gallantmon", under: ["BT12-089", "BT12-007", "AD1-003"] }],
        },
        1: { battleArea: [{ card: "BT1-010", as: "opponent", dp: 4000 }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await advance(s.engine).verb.deletePermanent([s.perm("gallantmon").permanentId], "byEffect");
    await settle(
      () =>
        s.state.players[0]!.battleArea.length === 0 &&
        s.state.players[0]!.trash.some((card) => card.cardId === "BT12-089") &&
        s.state.players[0]!.trash.some((card) => card.cardId === "BT12-007"),
    );

    expect(s.state.players[1]!.battleArea).toHaveLength(1);

    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.trash.some((card) => card.cardId === "BT12-089")).toBe(true);
    expect(s.state.players[0]!.trash.some((card) => card.cardId === "BT12-007")).toBe(true);
  });

  it("does not use another Gallantmon's inherited replacement when an unrelated host leaves", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "AD1-008", dp: 12000, as: "protected", under: ["BT12-089", "BT12-007", "AD1-003"] },
            { card: "AD1-008", dp: 12000, suspended: true, as: "unrelated" },
          ],
        },
        1: { battleArea: [{ card: "AD1-005", dp: 13000, as: "attacker" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    const unrelatedId = s.perm("unrelated").permanentId;
    const protectedId = s.perm("protected").permanentId;
    await s.ready();

    await advance(s.engine).verb.deletePermanent([unrelatedId], "byBattle");
    await settle(
      () => s.state.players[0]!.battleArea.every((permanent) => permanent.permanentId !== unrelatedId),
      5000,
    );

    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.permanentId === unrelatedId)).toBe(false);
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === "BT12-089")).toBe(false);
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === "BT12-007")).toBe(false);
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.permanentId === protectedId)).toBe(true);
  });

  it("rejects play when memory is below the printed cost", () => {
    const s = setupEngine({ 0: { hand: [{ card: "AD1-003", as: "wargrowlmon" }] } });
    s.state.memory = -10;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("wargrowlmon").instanceId })).toEqual({
      ok: false,
      reason: "insufficient-memory",
    });
  });

  it("matches committed metadata and publishes fully covered compiled IR", () => {
    const definition = getCardDefinition("AD1-003");
    const compiled = registeredCompiledCards.get("AD1-003") ?? getCompiledCard("AD1-003");
    expect(definition).toBeDefined();
    expect(definition?.cardId).toBe("AD1-003");
    expect(definition?.nameEn).toBe("WarGrowlmon");
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
    expect(compiled?.effects.length).toBeGreaterThan(0);
    expect(compiled?.effects).toEqual(expect.any(Array));
  });
});
