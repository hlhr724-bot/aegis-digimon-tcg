import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled } from "./EX2-008.js";

describe("EX2-008 Guilmon", () => {
  it("matches the catalog and compiles both mandatory reveal buckets", () => {
    expect(getCardDefinition("EX2-008")).toMatchObject({
      cardId: "EX2-008",
      nameEn: "Guilmon",
      colors: ["Red"],
      kinds: ["Digimon"],
      level: 3,
      playCost: 3,
      dp: 1000,
      evoCosts: [{ color: "Red", level: 2, memoryCost: 0 }],
      forms: ["Rookie"],
      attributes: ["Virus"],
      types: ["Reptile"],
      effectText:
        "[On Play] Reveal the top 4 cards of your deck. Add 1 card with [Growlmon] or [Gallantmon] in its name and 1 [Takato Matsuki] among them to your hand. Place the remaining cards at the bottom of your deck in any order.",
      inheritedEffectText:
        "[When Attacking][Once Per Turn] If this Digimon has [Growlmon] or [Gallantmon] in its name, delete 1 of your opponent's Digimon with 3000 DP or less.",
    });
    expect(compiled).toEqual({
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            {
              kind: "RevealAdd",
              revealCount: 4,
              add: [
                {
                  effectTextPart: "Add 1 card with [Growlmon] or [Gallantmon] in its name",
                  filter: {
                    controllerDefault: "mine",
                    nameOrTrait: [{ tokens: ["Growlmon", "Gallantmon"], match: "name" }],
                  },
                  count: 1,
                  to: "hand",
                },
                {
                  effectTextPart: "1 [Takato Matsuki] among them to your hand.",
                  filter: { controllerDefault: "mine", nameOrTrait: [{ tokens: ["Takato Matsuki"], match: "name" }] },
                  count: 1,
                  to: "hand",
                },
              ],
              rest: "deckBottom",
            },
          ],
        },
        {
          trigger: "WhenAttacking",
          actions: [
            {
              kind: "Delete",
              target: {
                filter: { controller: "opponent", kind: ["Digimon"], dp: { op: "lte", value: 3000 } },
                count: 1,
              },
              condition: {
                kind: "selfHasNameContaining",
                names: ["Growlmon", "Gallantmon"],
                raw: "this Digimon has [Growlmon] or [Gallantmon] in its name",
              },
            },
          ],
          isInherited: true,
          frequency: "OncePerTurn",
        },
      ],
      coverage: "full",
      residual: [],
    });
  });
  it("adds a Growlmon/Gallantmon and Takato from the top four on play", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "EX2-008", as: "guilmon" }],
          deck: [
            { card: "EX2-009", as: "growlmon" },
            { card: "EX2-056", as: "takato" },
            "EX2-014",
            "EX2-015",
            "EX2-031",
            "EX2-032",
          ],
        },
      },
      { autoSelectCards: true, autoOrderTriggers: true },
    );
    s.state.memory = 10;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("guilmon").instanceId })).toEqual({
      ok: true,
    });
    await settle(
      () =>
        s.state.pendingDecision === undefined &&
        s.state.players[0]!.deck.map((card) => card.cardId).join(",") === "EX2-031,EX2-032,EX2-014,EX2-015",
    );
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining([s.inst("growlmon").instanceId, s.inst("takato").instanceId]),
    );
    expect(s.state.players[0]!.deck.map((card) => card.cardId)).toEqual(["EX2-031", "EX2-032", "EX2-014", "EX2-015"]);
  });

  it("adds the only available category when the top four contain only Takato (Q3289)", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "EX2-008", as: "guilmon" }],
          deck: [{ card: "EX2-056", as: "takato" }, "EX2-014", "EX2-015", "EX2-016"],
        },
      },
      { autoSelectCards: true, autoOrderTriggers: true },
    );
    s.state.memory = 10;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("guilmon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision === undefined && s.state.players[0]!.hand.length === 1);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([s.inst("takato").instanceId]);
    expect(s.state.players[0]!.deck.map((card) => card.cardId)).toEqual(["EX2-014", "EX2-015", "EX2-016"]);
  });

  it("adds a revealed Gallantmon by exact name (Q3301)", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "EX2-008", as: "guilmon" }],
          deck: [{ card: "EX2-011", as: "gallantmon" }, "EX2-014", "EX2-015", "EX2-016"],
        },
      },
      { autoSelectCards: true, autoOrderTriggers: true },
    );
    s.state.memory = 10;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("guilmon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision === undefined && s.state.players[0]!.hand.length === 1);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([s.inst("gallantmon").instanceId]);
  });

  it("deletes a 3000 DP target when inherited by a Growlmon-family host", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "EX2-009", under: ["EX2-008"], as: "attacker" }], deck: ["BT1-009"] },
        1: {
          battleArea: [
            { card: "EX2-014", dp: 3000, as: "target" },
            { card: "EX2-014", dp: 3000, as: "secondTarget" },
            { card: "EX2-014", dp: 4000, as: "aboveLimit" },
          ],
          security: ["BT1-009", "BT1-010"],
          deck: ["BT1-010"],
        },
      },
      { autoSelectCards: true, autoOrderTriggers: true },
    );
    s.state.memory = 10;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 2);
    expect(s.state.players[1]!.battleArea).toHaveLength(2);
    expect(
      s.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === s.perm("aboveLimit").permanentId),
    ).toBe(true);

    await advance(s.engine).verb.unsuspend([s.perm("attacker").permanentId]);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle();
    expect(s.state.players[1]!.battleArea).toHaveLength(2);
  });

  it("deletes through a legal red evolution stack carrying EX2-008", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-009", under: ["EX2-008"], as: "attacker" }],
          hand: [{ card: "EX2-009", as: "evolution" }],
        },
        1: { battleArea: [{ card: "EX2-031", dp: 3000, as: "target" }], security: ["BT1-009"] },
      },
      { autoSelectCards: true, autoOrderTriggers: true },
    );
    s.state.memory = 5;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("attacker").permanentId,
        instanceId: s.inst("evolution").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("attacker").topCard.instanceId === s.inst("evolution").instanceId);
    expect(s.perm("attacker").stack.map((card) => card.cardId)).toEqual(["EX2-008", "BT1-009"]);
    expect(s.state.memory).toBe(3);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 0);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
  });

  it("does not add cards when none of the top four match either name", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "EX2-008", as: "guilmon" }],
          deck: ["EX2-014", "EX2-015", "EX2-016", "EX2-017"],
        },
      },
      { autoSelectCards: true, autoOrderTriggers: true },
    );
    s.state.memory = 10;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("guilmon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "EX2-008"));
    expect(s.state.players[0]!.hand).toHaveLength(0);
    expect(s.state.players[0]!.deck).toHaveLength(4);
  });

  it("does not delete a low-DP target when inherited by a non-Growlmon-family host", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "EX2-015", under: ["EX2-008"], as: "attacker" }] },
      1: { battleArea: [{ card: "EX2-031", dp: 3000, as: "target" }] },
    });
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle();
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
  });

  it("resets the inherited once-per-turn deletion on the next own turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX2-009", under: ["EX2-008"], as: "attacker" }],
          hand: ["BT1-009"],
          deck: ["BT1-010", "BT1-011", "BT1-012", "BT1-013", "BT1-014", "BT1-009"],
        },
        1: {
          battleArea: [
            { card: "EX2-031", dp: 3000, as: "firstTarget" },
            { card: "EX2-031", dp: 3000, as: "secondTarget" },
          ],
          hand: ["BT1-009"],
          deck: ["BT1-010", "BT1-011", "BT1-012", "BT1-013", "BT1-014", "BT1-009"],
          security: ["BT1-009", "BT1-010"],
        },
      },
      { autoSelectCards: true, autoOrderTriggers: true },
    );
    const loop = s.engine.startTurnLoop();
    const finishPublicAttack = async (): Promise<void> => {
      await settle(() => !observe(s.engine).isAttacking() || observe(s.engine).blockingSeat() === 1);
      const blockingSeat = observe(s.engine).blockingSeat();
      expect(blockingSeat === undefined || blockingSeat === 1).toBe(true);
      const blockResult =
        blockingSeat === 1 ? s.engine.applyIntent(1, { type: "declineBlock" }) : { ok: true as const };
      expect(blockResult).toEqual({ ok: true });
      await settle(() => !observe(s.engine).isAttacking());
    };
    await advance(s.engine).waitForMainPhase(0);
    const firstTargetId = s.perm("firstTarget").permanentId;
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await finishPublicAttack();
    expect(s.state.players[1]!.battleArea.some((p) => p.permanentId === firstTargetId)).toBe(false);

    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(1);
    expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await finishPublicAttack();
    expect(s.state.players[1]!.battleArea).toHaveLength(0);

    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });
});

describe("EX2-008 Guilmon — KB Q&A rulings", () => {
  it("requires adding both a Growlmon-family card and Takato when both are revealed (Q3290)", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "EX2-008", as: "guilmon" }],
          deck: [
            { card: "EX2-009", as: "growlmon" },
            { card: "EX2-056", as: "takato" },
            "EX2-014",
            "EX2-015",
            "EX2-031",
          ],
        },
      },
      { autoOrderTriggers: true, autoOrderCards: true },
    );
    s.state.memory = 10;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("guilmon").instanceId })).toEqual({
      ok: true,
    });

    for (const alias of ["growlmon", "takato"]) {
      await settle(() => s.state.pendingDecision?.kind === "selectCards");
      const decision = s.state.pendingDecision!;
      const payload = JSON.parse(decision.payloadJson) as { candidateInstanceIds: string[]; min: number };
      expect(payload.candidateInstanceIds).toEqual([s.inst(alias).instanceId]);
      expect(payload.min).toBe(1);
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: decision.decisionId,
          response: { kind: "selectCards", instanceIds: [] },
        }).ok,
      ).toBe(false);
      expect(s.state.pendingDecision?.decisionId).toBe(decision.decisionId);
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: decision.decisionId,
          response: { kind: "selectCards", instanceIds: [s.inst(alias).instanceId] },
        }),
      ).toEqual({ ok: true });
    }
    await settle(() => s.state.pendingDecision === undefined && s.state.players[0]!.hand.length === 2);

    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([
      s.inst("growlmon").instanceId,
      s.inst("takato").instanceId,
    ]);
    expect(s.state.players[0]!.deck.map((card) => card.cardId).slice(0, 1)).toEqual(["EX2-031"]);
  });
});
