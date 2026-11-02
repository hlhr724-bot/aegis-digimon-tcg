import { EffectDuration, getCardDefinition, type ServerEvent } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { observe } from "../../engine/testkit/observe.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { compiled } from "./BT26-075.js";

describe("BT26-075 compiled behavior", () => {
  it("proves both security/deletion costed plays and the Option lowest-level effect", () => {
    expect(getCardDefinition("BT26-075")).toMatchObject({
      nameEn: "ScourgeChiropmon",
      colors: ["Purple", "Yellow"],
      kinds: ["Digimon", "Option"],
      level: 5,
      playCost: 4,
      dp: 8000,
      types: ["Machine", "Glowing Dawn", "BEATBREAK"],
      isDualCard: true,
      dualEffect: "Despair Blast",
    });
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual).toEqual([]);
    expect(compiled.digivolutionRequirement).toEqual([
      { level: 4, traits: ["Glowing Dawn"], cost: 3, isAlternate: true },
    ]);
    expect(compiled.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          trigger: "Security",
          isSecurity: true,
          actions: [
            expect.objectContaining({
              kind: "PlayWithoutCost",
              payCost: false,
              from: ["trash"],
              optional: true,
              cost: expect.objectContaining({ kind: "trashBottomFaceDownUnderTamer", controller: "mine", count: 1 }),
            }),
          ],
        }),
        expect.objectContaining({
          trigger: "OnDeletion",
          actions: [
            expect.objectContaining({
              kind: "PlayWithoutCost",
              target: expect.objectContaining({
                filter: expect.objectContaining({
                  kind: ["Digimon", "Tamer"],
                  playCostLte: 5,
                  nameOrTrait: [{ tokens: ["Glowing Dawn"], match: "trait" }],
                }),
              }),
            }),
          ],
        }),
        expect.objectContaining({
          trigger: "Main",
          actions: [
            {
              effectTextPart: "[Main] Delete 1 of your opponent’s Digimon with the lowest level.",
              kind: "Delete",
              target: expect.objectContaining({
                count: 1,
                filter: expect.objectContaining({
                  controller: "opponent",
                  kind: ["Digimon"],
                  superlative: "lowestLevel",
                }),
              }),
            },
          ],
        }),
      ]),
    );
  });

  it("digivolves for 3 from an off-color level-4 Glowing Dawn Digimon", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT25-049", as: "greenBase" }],
        hand: [{ card: "BT26-075", as: "scourge" }],
        deck: ["BT1-009"],
      },
    });
    s.state.memory = 3;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("greenBase").permanentId,
        instanceId: s.inst("scourge").instanceId,
        alternateRequirementIndex: 0,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("greenBase").topCard.cardId === "BT26-075");

    expect(s.state.memory).toBe(0);
  });

  it("uses the Despair Blast Option face to delete the lowest-level Digimon", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT26-075", as: "despairBlast" }],
          battleArea: [{ card: "BT25-088", as: "glowingDawnTamer" }],
        },
        1: {
          battleArea: [
            { card: "BT26-062", as: "low" },
            { card: "BT26-060", as: "high" },
          ],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 4;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("despairBlast").instanceId,
        useAs: "option",
      } as never),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[1]!.battleArea.length === 1 &&
        s.state.players[0]!.trash.some(({ cardId }) => cardId === "BT26-075"),
    );

    expect(s.state.players[1]!.battleArea[0]!.topCard.cardId).toBe("BT26-060");
    expect(s.state.players[0]!.trash.map(({ cardId }) => cardId)).toContain("BT26-075");
    expect(s.state.memory).toBe(0);
  });

  it("requires a face-down bottom card under a Tamer and preserves the printed waiver", () => {
    const security = compiled.effects.find((effect) => effect.trigger === "Security")!;
    const cost = security.actions[0]!.cost;
    expect(cost).toMatchObject({ kind: "trashBottomFaceDownUnderTamer", controller: "mine", count: 1 });
    const waiver = compiled.effects.find((effect) =>
      effect.actions.some((action) => action.kind === "WaiveColorRequirement"),
    );
    const keywords = compiled.effects.find((effect) => effect.actions.some((action) => action.kind === "GainKeyword"));
    expect(waiver?.actions[0]).toMatchObject({
      kind: "WaiveColorRequirement",
      condition: { kind: "youHave" },
    });
    expect(keywords?.actions).toEqual([
      expect.objectContaining({ kind: "GainKeyword", keyword: { keyword: "Execute" } }),
      expect.objectContaining({ kind: "GainKeyword", keyword: { keyword: "Ascension" } }),
    ]);
  });

  it("pays the Tamer cost and plays a Glowing Dawn card when On Deletion is ordered before Ascension", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT26-075", as: "scourge" },
            { card: "BT1-089", as: "tamer", under: [{ card: "BT1-010", as: "faceDown", faceUp: false }] },
          ],
          trash: [{ card: "BT26-052", as: "glowingDawn" }],
          deck: ["BT1-009", "BT1-010", "BT1-011"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: false },
    );
    await s.ready();

    const deleting = advance(s.engine).verb.deletePermanent([s.perm("scourge").permanentId], "byEffect");
    await settle(() => s.state.pendingDecision?.kind === "orderTriggers");
    const pending = s.state.pendingDecision!;
    const request = s.decisions.find(({ req }) => req.decisionId === pending.decisionId)!.req;
    const keys = request.options?.triggerKeys ?? [];
    expect(keys).toHaveLength(2);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: pending.decisionId,
        response: { kind: "orderTriggers", order: [keys[1]!] },
      }),
    ).toEqual({ ok: true });
    await deleting;

    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard?.cardId)).toContain("BT26-052");
    expect(s.perm("tamer").stack.map(({ cardId }) => cardId)).not.toContain("BT1-010");
  });

  it("drops the pending On Deletion effect when Ascension is ordered first (Q7100)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT26-075", as: "scourge" },
            { card: "BT1-089", as: "tamer", under: [{ card: "BT1-010", faceUp: false }] },
          ],
          trash: [{ card: "BT26-052", as: "glowingDawn" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    expect(await advance(s.engine).verb.deletePermanent([s.perm("scourge").permanentId], "byEffect")).toBe(1);

    expect(s.state.players[0]!.security.map(({ cardId }) => cardId)).toContain("BT26-075");
    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard?.cardId)).not.toContain("BT26-052");
    expect(s.perm("tamer").stack.map(({ cardId }) => cardId)).toContain("BT1-010");
  });

  it("Q7101 resolves the Digimon-side Security effect and then battles the attacker", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT26-074", as: "attacker" }] },
        1: {
          battleArea: [{ card: "BT1-089", as: "tamer", under: [{ card: "BT1-010", as: "faceDown", faceUp: false }] }],
          security: [{ card: "BT26-075", as: "securityScourge" }],
          trash: [{ card: "BT26-052", as: "glowingDawn" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const attackerId = s.perm("attacker").permanentId;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: attackerId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !s.state.players[0]!.battleArea.some(({ permanentId }) => permanentId === attackerId));

    expect(s.state.players[1]!.battleArea.map(({ topCard }) => topCard.cardId)).toContain("BT26-052");
    expect(s.perm("tamer").stack).toHaveLength(0);
    expect(s.state.players[1]!.trash.map(({ cardId }) => cardId)).toContain("BT26-075");
  });

  it("Q7103 lets an Option-only security lock suppress this DUAL card's effect but not its battle", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT26-074", as: "attacker" }] },
        1: {
          battleArea: [{ card: "BT1-089", as: "tamer", under: [{ card: "BT1-010", as: "faceDown", faceUp: false }] }],
          security: [{ card: "BT26-075", as: "securityScourge" }],
          trash: [{ card: "BT26-052", as: "glowingDawn" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const attackerId = s.perm("attacker").permanentId;
    await s.ready();
    advance(s.engine).ledgers.continuous.addSecurityEffectDisable(
      attackerId,
      "option",
      EffectDuration.UntilEachTurnEnd,
    );

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: attackerId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !s.state.players[0]!.battleArea.some(({ permanentId }) => permanentId === attackerId));

    expect(s.state.players[1]!.battleArea.map(({ topCard }) => topCard.cardId)).not.toContain("BT26-052");
    expect(s.perm("tamer").stack).toHaveLength(1);
    expect(s.state.players[1]!.trash.map(({ cardId }) => cardId)).toEqual(
      expect.arrayContaining(["BT26-052", "BT26-075"]),
    );
  });

  it("executes an end-of-turn attack, self-deletes, and Ascends", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT26-075", as: "scourge" }] },
        1: {
          battleArea: [{ card: "BT1-009", as: "executeTarget" }],
          security: ["BT1-010", "BT1-011"],
          deck: ["BT1-012", "BT1-013", "BT1-014", "BT1-009"],
        },
      },
      {
        autoAcceptOptional: true,
        autoSelectCards: true,
        autoOrderTriggers: true,
        preferInstanceIds: preferred,
      },
    );
    preferred.push(s.perm("executeTarget").permanentId);
    await s.ready();

    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    advance(s.engine).endMainPhaseIfOpen(0);
    await settle(() => s.state.players[0]!.security.some(({ cardId }) => cardId === "BT26-075"));

    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.trash.map(({ cardId }) => cardId)).not.toContain("BT26-075");
    await advance(s.engine).waitForMainPhase(1);
    expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });
});

describe("BT26-075 ScourgeChiropmon — KB Q&A rulings", () => {
  it("resolves its checked [Security] effect as a Digimon effect, not an Option effect (Q7102)", async () => {
    const kindsWhileResolving: (readonly string[] | undefined)[] = [];
    let securityEffectResolving = false;
    const isScourgeSecurityEffect = (event: ServerEvent) =>
      "sourceCardId" in event && event.sourceCardId === "BT26-075" && "timing" in event && event.timing === "Security";
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT26-074", as: "attacker" }] },
        1: {
          battleArea: [{ card: "BT1-089", as: "tamer", under: [{ card: "BT1-010", faceUp: false }] }],
          security: [{ card: "BT26-075", as: "securityScourge" }],
          trash: [{ card: "BT26-052", as: "glowingDawn" }],
        },
      },
      {
        autoAcceptOptional: true,
        autoSelectCards: true,
        onEvent: (event) => {
          if (event.kind === "effectTriggered" && isScourgeSecurityEffect(event)) securityEffectResolving = true;
          else if (event.kind === "effectResolved" && isScourgeSecurityEffect(event)) securityEffectResolving = false;
          else if (securityEffectResolving) kindsWhileResolving.push(observe(s.engine).resolvingEffectSourceKinds());
        },
      },
    );
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() =>
      s.state.players[1]!.battleArea.some(({ topCard }) => topCard.instanceId === s.inst("glowingDawn").instanceId),
    );

    expect(kindsWhileResolving.length).toBeGreaterThan(0);
    expect(kindsWhileResolving[0]).toEqual(["Digimon"]);
  });
});
