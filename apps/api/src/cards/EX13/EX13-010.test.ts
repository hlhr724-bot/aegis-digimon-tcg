import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import { assertNoLoudGap, drainMicrotasks, settle, setupEngine } from "../../engine/testkit/harness.js";
import { irNode } from "../../engine/testkit/irNode.js";
import { observe } from "../../engine/testkit/observe.js";
import "../index.js";
import { compiled } from "./EX13-010.js";

const cardId = "EX13-010";

describe("EX13-010 Growlmon", () => {
  it("matches the catalog printed text, stats and evolution cost", () => {
    expect(getCardDefinition(cardId)).toMatchObject({
      cardId,
      nameEn: "Growlmon",
      colors: ["Red"],
      kinds: ["Digimon"],
      level: 4,
      playCost: 6,
      dp: 6000,
      forms: ["Champion"],
      attributes: ["Virus"],
      types: ["Dark Dragon"],
      evoCosts: [{ color: "Red", level: 3, memoryCost: 2 }],
      effectText:
        "[When Moving] [When Digivolving] Delete 1 of your opponent's Digimon with 4000 DP or less. If this effect didn't delete, this Digimon gains ＜Raid＞ and +3000 DP for the turn.",
      inheritedEffectText: "[All Turns] Add 2000 to this Digimon's DP deletion effects' maximums.",
    });
  });

  it("compiles the same clause under both printed timings plus the inherited modifier", () => {
    expect(runtimeCompiledCard(cardId)).toMatchObject({ coverage: "full", residual: [] });

    for (const trigger of ["WhenMoving", "WhenDigivolving"]) {
      const effect = compiled.effects.find((candidate) => candidate.trigger === trigger)!;
      expect(effect.isInherited).toBeUndefined();
      expect(effect.actions).toHaveLength(3);

      expect(effect.actions[0]).toMatchObject({
        kind: "Delete",
        target: {
          count: 1,
          filter: { controller: "opponent", kind: ["Digimon"], dp: { op: "lte", value: 4000 } },
        },
      });
      expect(irNode(effect.actions[0]).optional).toBeUndefined();
      expect(irNode(effect.actions[0]).condition).toBeUndefined();

      expect(effect.actions[1]).toMatchObject({
        kind: "GainKeyword",
        keyword: { keyword: "Raid" },
        duration: "forTheTurn",
        condition: { kind: "ifThisEffectDidNotDelete" },
        target: { count: 1, isSelf: true, filter: { isSelfRef: true } },
      });
      expect(effect.actions[2]).toMatchObject({
        kind: "ModifyDP",
        amount: 3000,
        duration: "forTheTurn",
        condition: { kind: "ifThisEffectDidNotDelete" },
        target: { count: 1, isSelf: true, filter: { isSelfRef: true } },
      });
    }

    const inherited = compiled.effects.find((effect) => effect.isInherited)!;
    expect(inherited).toMatchObject({
      trigger: "AllTurns",
      actions: [{ kind: "DeletionMaxDpModifier", amount: 2000, scope: "self", duration: "permanent" }],
    });
    expect(irNode(inherited.actions[0]).condition).toBeUndefined();
  });

  it("deletes a 4000 DP opponent Digimon on the public digivolve route and gains nothing", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-009", as: "base" }],
          hand: [
            { card: cardId, as: "host" },
            { card: "BT1-010", as: "spare" },
          ],
          deck: ["BT1-011"],
        },
        1: { battleArea: [{ card: "BT1-014", as: "target" }] },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 3;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("host").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 0);

    expect(s.perm("base").topCard?.cardId).toBe(cardId);
    expect(s.perm("base").stack.map((card) => card.cardId)).toEqual(["BT1-009"]);
    expect(s.state.memory).toBe(1);
    expect(s.state.players[0]!.hand.map(({ cardId: id }) => id)).toEqual(["BT1-010", "BT1-011"]);
    expect(s.state.players[0]!.deck.map(({ cardId: id }) => id)).toEqual([]);
    expect(s.state.players[1]!.battleArea.map(({ topCard }) => topCard?.cardId)).toEqual([]);
    expect(s.state.players[1]!.trash.map(({ cardId: id }) => id)).toEqual(["BT1-014"]);
    expect(observe(s.engine).hasKeyword(s.perm("base"), "Raid")).toBe(false);
    expect(s.perm("base").currentDP).toBe(6000);
    expect(s.state.pendingDecision).toBeUndefined();
    assertNoLoudGap(s);
  });

  it("discriminates the 4000 maximum: 4000 DP is deleted, 5000 DP is left alone", async () => {
    const preferInstanceIds: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-009", as: "base" }],
          hand: [
            { card: cardId, as: "host" },
            { card: "BT1-010", as: "spare" },
          ],
          deck: ["BT1-011"],
        },
        1: {
          battleArea: [
            { card: "BT1-009", as: "outOfRange", dp: 5000 },
            { card: "BT1-014", as: "inRange", dp: 4000 },
          ],
        },
      },
      { autoSelectCards: true, preferInstanceIds },
    );
    preferInstanceIds.push(s.perm("outOfRange").permanentId);
    s.state.memory = 3;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("host").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 1);

    expect(s.state.players[1]!.battleArea.map(({ topCard }) => topCard?.instanceId)).toEqual([
      s.inst("outOfRange").instanceId,
    ]);
    expect(s.state.players[1]!.trash.map(({ instanceId }) => instanceId)).toEqual([s.inst("inRange").instanceId]);
    expect(observe(s.engine).hasKeyword(s.perm("base"), "Raid")).toBe(false);
    expect(s.perm("base").currentDP).toBe(6000);
    expect(s.state.pendingDecision).toBeUndefined();
    assertNoLoudGap(s);
  });

  it("gains Raid and +3000 DP when every opponent Digimon is above the maximum", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-009", as: "base" }],
          hand: [
            { card: cardId, as: "host" },
            { card: "BT1-010", as: "spare" },
          ],
          deck: ["BT1-011"],
        },
        1: { battleArea: [{ card: "BT1-009", as: "survivor", dp: 5000 }] },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 3;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("host").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => observe(s.engine).hasKeyword(s.perm("base"), "Raid"));

    expect(s.perm("base").topCard?.cardId).toBe(cardId);
    expect(s.perm("base").currentDP).toBe(9000);
    expect(s.state.players[1]!.battleArea.map(({ topCard }) => topCard?.instanceId)).toEqual([
      s.inst("survivor").instanceId,
    ]);
    expect(s.state.players[1]!.trash.map(({ cardId: id }) => id)).toEqual([]);
    expect(observe(s.engine).hasKeyword(s.perm("survivor"), "Raid")).toBe(false);
    expect(s.state.pendingDecision).toBeUndefined();
    assertNoLoudGap(s);
  });

  it("gains Raid and +3000 DP when the opponent has no Digimon at all", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-009", as: "base" }],
          hand: [
            { card: cardId, as: "host" },
            { card: "BT1-010", as: "spare" },
          ],
          deck: ["BT1-011"],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 3;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("host").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => observe(s.engine).hasKeyword(s.perm("base"), "Raid"));

    expect(s.perm("base").currentDP).toBe(9000);
    expect(s.state.pendingDecision).toBeUndefined();
    assertNoLoudGap(s);
  });

  it("gains Raid and +3000 DP when the mandatory chosen deletion is prevented (Q7232)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-009", as: "base" }],
          hand: [{ card: cardId, as: "host" }],
          deck: ["BT1-011"],
        },
        1: {
          battleArea: [{ card: "BT22-022", as: "protected", under: ["EX13-017"], dp: 4000 }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 3;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("host").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => observe(s.engine).hasKeyword(s.perm("base"), "Raid"));

    expect(s.perm("protected").isSuspended).toBe(true);
    expect(s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId)).toEqual([
      s.perm("protected").permanentId,
    ]);
    expect(s.perm("base").currentDP).toBe(9000);
    expect(s.state.players[1]!.trash).toHaveLength(0);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("treats an own 4000 DP Digimon as no target: 'your opponent's' discriminates", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT1-009", as: "base" },
            { card: "BT1-014", as: "ownSmall" },
          ],
          hand: [
            { card: cardId, as: "host" },
            { card: "BT1-010", as: "spare" },
          ],
          deck: ["BT1-011"],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 3;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("host").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => observe(s.engine).hasKeyword(s.perm("base"), "Raid"));

    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard?.cardId)).toEqual([cardId, "BT1-014"]);
    expect(s.state.players[0]!.trash.map(({ cardId: id }) => id)).toEqual([]);
    expect(s.perm("base").currentDP).toBe(9000);
    expect(observe(s.engine).hasKeyword(s.perm("ownSmall"), "Raid")).toBe(false);
    assertNoLoudGap(s);
  });

  it("fires the same clause when it moves out of breeding, and the grants expire at turn end", async () => {
    const s = setupEngine(
      {
        0: {
          breeding: { card: cardId, as: "mover", under: ["BT1-009"] },
          hand: [{ card: "BT1-010", as: "spare" }],
          deck: ["BT1-011", "BT1-012"],
          security: ["BT1-009"],
        },
        1: {
          battleArea: [{ card: "BT1-009", as: "survivor", dp: 5000 }],
          security: ["BT1-010"],
          deck: ["BT1-011"],
        },
      },
      { autoSelectCards: true },
    );
    await s.ready();

    const loop = s.engine.startTurnLoop();
    await settle(() => s.state.phase === "Breeding" && s.state.turnSeat === 0);
    expect(s.engine.applyIntent(0, { type: "moveFromBreeding", permanentId: s.perm("mover").permanentId })).toEqual({
      ok: true,
    });
    await settle(() => observe(s.engine).hasKeyword(s.perm("mover"), "Raid"));

    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard?.cardId)).toEqual([cardId]);
    expect(s.perm("mover").stack.map((card) => card.cardId)).toEqual(["BT1-009"]);
    expect(s.perm("mover").currentDP).toBe(9000);
    assertNoLoudGap(s);

    await settle(() => s.state.phase === "Main" && s.state.pendingDecision === undefined);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await settle(() => s.state.turnSeat === 1 && s.state.phase === "Main");

    expect(observe(s.engine).hasKeyword(s.perm("mover"), "Raid")).toBe(false);
    expect(s.perm("mover").currentDP).toBe(6000);

    expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it("deletes through the breeding-move route too when a 4000 DP target exists", async () => {
    const s = setupEngine(
      {
        0: {
          breeding: { card: cardId, as: "mover", under: ["BT1-009"] },
          hand: [{ card: "BT1-010", as: "spare" }],
          deck: ["BT1-011", "BT1-012"],
          security: ["BT1-009"],
        },
        1: {
          battleArea: [{ card: "BT1-014", as: "target" }],
          security: ["BT1-010"],
          deck: ["BT1-011"],
        },
      },
      { autoSelectCards: true },
    );
    await s.ready();

    const loop = s.engine.startTurnLoop();
    await settle(() => s.state.phase === "Breeding" && s.state.turnSeat === 0);
    expect(s.engine.applyIntent(0, { type: "moveFromBreeding", permanentId: s.perm("mover").permanentId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.battleArea.length === 0);

    expect(s.state.players[1]!.trash.map(({ instanceId }) => instanceId)).toEqual([s.inst("target").instanceId]);
    expect(observe(s.engine).hasKeyword(s.perm("mover"), "Raid")).toBe(false);
    expect(s.perm("mover").currentDP).toBe(6000);
    assertNoLoudGap(s);

    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it("refuses an illegal source: a red Lv4 is not a red Lv3", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-014", as: "lv4Base" }],
          hand: [
            { card: cardId, as: "host" },
            { card: "BT1-010", as: "spare" },
          ],
          deck: ["BT1-011"],
        },
        1: { battleArea: [{ card: "BT1-014", as: "target" }] },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 3;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("lv4Base").permanentId,
        instanceId: s.inst("host").instanceId,
      }),
    ).toMatchObject({ ok: false });
    await drainMicrotasks(20);

    expect(s.perm("lv4Base").topCard?.cardId).toBe("BT1-014");
    expect(s.state.players[1]!.battleArea.map(({ topCard }) => topCard?.cardId)).toEqual(["BT1-014"]);
    expect(s.state.memory).toBe(3);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("raises a host's printed 8000 deletion maximum to 10000 from the digivolution cards", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT19-012", as: "base", under: [cardId] }],
          hand: [
            { card: "BT19-015", as: "host" },
            { card: "BT1-010", as: "spare" },
          ],
          deck: ["BT1-011"],
        },
        1: { battleArea: [{ card: "BT1-009", as: "target", dp: 9000 }] },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 5;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("host").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 0);

    expect(s.perm("base").stack.map((card) => card.cardId)).toEqual([cardId, "BT19-012"]);
    expect(s.state.players[1]!.trash.map(({ instanceId }) => instanceId)).toEqual([s.inst("target").instanceId]);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("leaves the host's printed 8000 maximum alone without Growlmon in the digivolution cards", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT19-012", as: "base", under: ["BT1-009"] }],
          hand: [
            { card: "BT19-015", as: "host" },
            { card: "BT1-010", as: "spare" },
          ],
          deck: ["BT1-011"],
        },
        1: { battleArea: [{ card: "BT1-009", as: "target", dp: 9000 }] },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 5;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("host").instanceId,
      }),
    ).toEqual({ ok: true });
    await drainMicrotasks(20);

    expect(s.state.players[1]!.battleArea.map(({ topCard }) => topCard?.cardId)).toEqual(["BT1-009"]);
  });

  it("raises its own 4000 maximum to 6000 with EX13-007 Guilmon in the digivolution cards", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX13-007", as: "base" }],
          hand: [
            { card: cardId, as: "host" },
            { card: "BT1-010", as: "spare" },
          ],
          deck: ["BT1-011"],
        },
        1: {
          battleArea: [
            { card: "BT1-009", as: "stillOutOfRange", dp: 7000 },
            { card: "BT1-014", as: "nowInRange", dp: 6000 },
          ],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 3;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("host").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 1);

    expect(s.perm("base").topCard?.cardId).toBe(cardId);
    expect(s.perm("base").stack.map((card) => card.cardId)).toEqual(["EX13-007"]);
    expect(s.state.players[1]!.battleArea.map(({ topCard }) => topCard?.instanceId)).toEqual([
      s.inst("stillOutOfRange").instanceId,
    ]);
    expect(s.state.players[1]!.trash.map(({ instanceId }) => instanceId)).toEqual([s.inst("nowInRange").instanceId]);
    expect(observe(s.engine).hasKeyword(s.perm("base"), "Raid")).toBe(false);
    expect(s.perm("base").currentDP).toBe(6000);
    expect(s.state.pendingDecision).toBeUndefined();
    assertNoLoudGap(s);
  });

  it("still takes the Raid branch above the raised 6000 maximum", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX13-007", as: "base" }],
          hand: [
            { card: cardId, as: "host" },
            { card: "BT1-010", as: "spare" },
          ],
          deck: ["BT1-011"],
        },
        1: { battleArea: [{ card: "BT1-009", as: "survivor", dp: 7000 }] },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 3;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("host").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => observe(s.engine).hasKeyword(s.perm("base"), "Raid"));

    expect(s.perm("base").currentDP).toBe(9000);
    expect(s.state.players[1]!.trash.map(({ cardId: id }) => id)).toEqual([]);
    assertNoLoudGap(s);
  });

  it("does not raise a deletion threshold that references the source Digimon's DP (Q7234)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT19-014", as: "host", under: [cardId], dp: 12_000 }],
          security: ["BT1-010"],
          deck: ["BT1-011"],
        },
        1: {
          battleArea: [{ card: "BT1-009", as: "aboveSourceDp", dp: 13_000 }],
          security: ["BT1-012"],
          deck: ["BT1-013"],
        },
      },
      { autoSelectCards: true },
    );
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 0);

    expect(s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId)).toEqual([
      s.perm("aboveSourceDp").permanentId,
    ]);
    expect(s.state.players[1]!.trash.map(({ instanceId }) => instanceId)).not.toContain(
      s.inst("aboveSourceDp").instanceId,
    );
    expect(s.state.pendingDecision).toBeUndefined();
  });
});

describe("EX13-010 Growlmon — KB Q&A rulings", () => {
  it("must delete an available 4000 DP Digimon, so declining to pick cannot claim Raid and +3000 DP (Q7231)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-009", as: "base" }],
          hand: [{ card: cardId, as: "host" }],
          deck: ["BT1-011"],
        },
        1: {
          battleArea: [
            { card: "BT1-014", as: "first", dp: 4000 },
            { card: "BT1-014", as: "second", dp: 3000 },
          ],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 3;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("host").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 1);

    const targetChoice = s.decisions.find(({ req }) => req.kind === "chooseTargets");
    expect(targetChoice?.req.options?.min).toBe(1);
    expect(s.state.players[1]!.trash).toHaveLength(1);
    expect(observe(s.engine).hasKeyword(s.perm("base"), "Raid")).toBe(false);
    expect(s.perm("base").currentDP).toBe(6000);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("adds 2000 to a host's 'delete 8000 DP or less' so a 10000 DP Digimon is deleted and 11000 DP is not (Q7233)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT19-012", as: "base", under: [cardId] }],
          hand: [{ card: "BT19-015", as: "host" }],
          deck: ["BT1-010"],
        },
        1: {
          battleArea: [
            { card: "BT1-009", as: "inRange", dp: 10_000 },
            { card: "BT1-010", as: "outOfRange", dp: 11_000 },
          ],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 5;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("host").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 1);

    expect(s.state.players[1]!.trash.map(({ instanceId }) => instanceId)).toEqual([s.inst("inRange").instanceId]);
    expect(s.state.players[1]!.battleArea.map(({ topCard }) => topCard?.instanceId)).toEqual([
      s.inst("outOfRange").instanceId,
    ]);
    expect(s.state.pendingDecision).toBeUndefined();
  });
});
