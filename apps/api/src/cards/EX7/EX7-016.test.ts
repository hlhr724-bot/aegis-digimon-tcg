import { digivolutionRequirementsFor, getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled } from "./EX7-016.js";
import "../index.js";
import "../BT1/BT1-039.js";
import "../EX8/EX8-004.js";
import "../P/P-148.js";

const FILLER = ["BT1-009", "BT1-011", "BT1-012", "BT1-013", "BT1-014"];
const SECURITY = ["BT1-013", "BT1-014", "BT1-013"];

describe("EX7-016 Bulucomon", () => {
  it("matches the catalog and compiles every printed clause", () => {
    expect(getCardDefinition("EX7-016")).toMatchObject({
      cardId: "EX7-016",
      nameEn: "Bulucomon",
      colors: ["Blue"],
      kinds: ["Digimon"],
      level: 3,
      playCost: 3,
      dp: 1000,
      forms: ["Rookie"],
      attributes: ["Data"],
      types: ["Mini Dragon", "Ice-Snow"],
      evoCosts: [{ color: "Blue", level: 2, memoryCost: 0 }],
      effectText:
        "[On Play] Reveal the top 3 cards of your deck. Add 1 card with [Paledramon]/[Hexeblaumon]\u00a0in its name and 1 card with the [Ice-Snow]\u00a0trait among them to the hand. Return the rest to the bottom of the deck.\n[Rule] Trait: Has [Ice-Snow].",
      inheritedEffectText:
        "[When Attacking] [Once Per Turn] Trash the top digivolution card of 1 of your opponent's Digimon.",
    });
    expect(digivolutionRequirementsFor("EX7-016")).toBeUndefined();
    expect(compiled.effects).toEqual([
      {
        trigger: "OnPlay",
        actions: [
          {
            kind: "RevealAdd",
            revealCount: 3,
            add: [
              {
                effectTextPart: "Add 1 card with [Paledramon]/[Hexeblaumon] in its name",
                filter: {
                  controllerDefault: "mine",
                  nameOrTrait: [{ tokens: ["Paledramon", "Hexeblaumon"], match: "name" }],
                },
                count: 1,
                to: "hand",
              },
              {
                effectTextPart: "1 card with the [Ice-Snow] trait among them to the hand.",
                filter: {
                  controllerDefault: "mine",
                  nameOrTrait: [{ tokens: ["Ice-Snow"], match: "trait" }],
                },
                count: 1,
                to: "hand",
              },
            ],
            rest: "deckBottom",
          },
        ],
      },
      {
        trigger: "Rule",
        actions: [
          {
            kind: "GrantStatic",
            target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
            grant: "trait",
            tokens: ["Ice-Snow"],
          },
        ],
      },
      {
        trigger: "WhenAttacking",
        actions: [
          {
            kind: "TrashDigivolution",
            target: {
              filter: { controller: "opponent", kind: ["Digimon"], digivolutionCards: "hasAny" },
              count: 1,
            },
            amount: 1,
            fromTop: true,
          },
        ],
        isInherited: true,
        frequency: "OncePerTurn",
      },
    ]);
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual).toEqual([]);
  });

  it("Q3841: publicly adds both available categories from the top three and bottoms the rest", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "EX7-016", as: "bulu" }],
          deck: [
            { card: "BT5-025", as: "namedMatch" },
            { card: "EX7-017", as: "traitMatch" },
            { card: "BT1-009", as: "nearMiss" },
            { card: "BT1-011", as: "belowReveal" },
          ],
          security: SECURITY,
        },
        1: { deck: [...FILLER], security: SECURITY },
      },
      { autoSelectCards: true, autoChooseOption: true },
    );
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    s.state.memory = 10;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("bulu").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.hand.length === 2);

    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([
      s.inst("namedMatch").instanceId,
      s.inst("traitMatch").instanceId,
    ]);
    expect(s.state.players[0]!.deck.map((card) => card.instanceId)).toEqual([
      s.inst("belowReveal").instanceId,
      s.inst("nearMiss").instanceId,
    ]);
    expect(s.state.memory).toBe(7);
    expect(observe(s.engine).hasEffectiveTrait(s.perm("bulu"), "Ice-Snow")).toBe(true);
    expect(s.state.pendingDecision).toBeUndefined();

    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it("digivolves from a Blue Lv.2 for 0, draws the exact card, and preserves source stack identity", async () => {
    const s = setupEngine({
      0: {
        breeding: { card: "P-148", as: "source" },
        hand: [{ card: "EX7-016", as: "bulu" }],
        deck: [
          { card: "BT1-009", as: "drawn" },
          { card: "BT1-011", as: "rest" },
        ],
        security: SECURITY,
      },
      1: { deck: [...FILLER], security: SECURITY },
    });
    s.state.memory = 0;
    await s.ready();
    const sourceId = s.inst("source").instanceId;
    const buluId = s.inst("bulu").instanceId;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("source").permanentId,
        instanceId: buluId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.breeding?.topCard?.instanceId === buluId);

    expect(s.state.players[0]!.breeding?.topCard?.cardId).toBe("EX7-016");
    expect(s.state.players[0]!.breeding?.stack.map((card) => card.instanceId)).toEqual([sourceId]);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([s.inst("drawn").instanceId]);
    expect(s.state.players[0]!.deck.map((card) => card.instanceId)).toEqual([s.inst("rest").instanceId]);
    expect(s.state.memory).toBe(0);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("refuses an illegal Red Lv.3 source without paying, stacking, or drawing", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-009", as: "illegalSource" }],
        hand: [{ card: "EX7-016", as: "bulu" }],
        deck: [
          { card: "BT1-009", as: "drawn" },
          { card: "BT1-011", as: "rest" },
        ],
        security: SECURITY,
      },
      1: { deck: [...FILLER], security: SECURITY },
    });
    s.state.memory = 5;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("illegalSource").permanentId,
        instanceId: s.inst("bulu").instanceId,
      }).ok,
    ).toBe(false);
    expect(s.perm("illegalSource").topCard?.cardId).toBe("BT1-009");
    expect(s.perm("illegalSource").stack).toHaveLength(0);
    expect(s.state.memory).toBe(5);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([s.inst("bulu").instanceId]);
    expect(s.state.players[0]!.deck.map((card) => card.instanceId)).toEqual([
      s.inst("drawn").instanceId,
      s.inst("rest").instanceId,
    ]);
  });

  it("trashes exactly one opposing top source per turn, refuses the second attack, then resets next turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-039", as: "host", under: ["EX7-016"] }],
          hand: ["BT1-009", "BT1-011", "BT1-012", "BT1-013", "BT1-014", "BT1-009"],
          deck: [...FILLER, ...FILLER],
          security: SECURITY,
        },
        1: {
          battleArea: [
            {
              card: "BT1-009",
              as: "target",
              under: [
                { card: "BT1-010", as: "bottomSource" },
                { card: "BT1-011", as: "topSource" },
              ],
            },
          ],
          deck: [...FILLER, ...FILLER],
          security: SECURITY,
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);

    const attack = () =>
      s.engine.applyIntent(0, {
        type: "attack" as const,
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "player" as const },
      });

    expect(attack()).toEqual({ ok: true });
    await settle(
      () =>
        s.perm("target").stack.length === 1 &&
        s.state.players[0]!.hand.length === 3 &&
        !observe(s.engine).isAttacking() &&
        !s.perm("host").isSuspended,
    );
    expect(s.perm("target").stack.map((card) => card.instanceId)).toEqual([s.inst("bottomSource").instanceId]);
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toContain(s.inst("topSource").instanceId);

    expect(attack()).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.hand.length === 0 && !observe(s.engine).isAttacking());
    expect(s.perm("target").stack.map((card) => card.instanceId)).toEqual([s.inst("bottomSource").instanceId]);

    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(1);
    expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);

    expect(attack()).toEqual({ ok: true });
    await settle(() => s.perm("target").stack.length === 0 && !observe(s.engine).isAttacking());
    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toContain(s.inst("bottomSource").instanceId);

    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });
});
