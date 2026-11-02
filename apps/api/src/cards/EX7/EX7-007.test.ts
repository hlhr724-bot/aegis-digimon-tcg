import { describe, expect, it } from "vitest";
import { getCardDefinition } from "@aegis/shared";
import { compiled } from "./EX7-007.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { advance } from "../../engine/testkit/advance.js";
import "../index.js";

describe("EX7-007 Vorvomon", () => {
  it("matches the catalog printing and complete IR", () => {
    expect(getCardDefinition("EX7-007")).toMatchObject({
      cardId: "EX7-007",
      nameEn: "Vorvomon",
      colors: ["Red"],
      kinds: ["Digimon"],
      level: 3,
      playCost: 3,
      dp: 1000,
      evoCosts: [
        { color: "Red", level: 2, memoryCost: 0 },
        { color: "Black", level: 2, memoryCost: 0 },
      ],
      forms: ["Rookie"],
      attributes: ["Virus"],
      types: ["Rock Dragon"],
      effectText:
        "[On Play] Reveal the top 3 cards of your deck. Add 1 card with the [Rock Dragon]/[Earth Dragon]/[Machine Dragon]/[Sky Dragon]\u00a0trait and 1 [Hina Kurihara] among them to the hand. Return the rest to the bottom of the deck.",
      inheritedEffectText: "[Your Turn] This Digimon gets +2000 DP.",
    });
    expect(compiled).toEqual({
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            {
              kind: "RevealAdd",
              revealCount: 3,
              add: [
                {
                  effectTextPart:
                    "Add 1 card with the [Rock Dragon]/[Earth Dragon]/[Machine Dragon]/[Sky Dragon] trait",
                  filter: {
                    controllerDefault: "mine",
                    nameOrTrait: [
                      {
                        tokens: ["Rock Dragon", "Earth Dragon", "Machine Dragon", "Sky Dragon"],
                        match: "trait",
                      },
                    ],
                  },
                  count: 1,
                  to: "hand",
                },
                {
                  effectTextPart: "1 [Hina Kurihara] among them to the hand.",
                  filter: {
                    controllerDefault: "mine",
                    nameOrTrait: [{ tokens: ["Hina Kurihara"], match: "nameExact" }],
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
          trigger: "YourTurn",
          actions: [
            {
              kind: "ModifyDP",
              target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
              amount: 2000,
              duration: "permanent",
            },
          ],
          isInherited: true,
        },
      ],
      coverage: "full",
      residual: [],
    });
  });
  it("inherits permanent +2000 DP", () =>
    expect(compiled.effects?.find((entry) => entry.isInherited)?.actions[0]).toMatchObject({
      kind: "ModifyDP",
      amount: 2000,
      duration: "permanent",
    }));

  it("Q3828: publicly pays 3, adds one Dragon and Hina, and bottoms the remaining reveal", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "EX7-007", as: "vorvomon" }],
          deck: ["BT2-011", "EX3-065", "BT1-009"],
          security: ["BT1-009"],
        },
        1: { security: ["BT1-010"] },
      },
      { autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 6;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("vorvomon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === "EX7-007"));

    expect(s.state.memory).toBe(3);
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toEqual(["BT2-011", "EX3-065"]);
    expect(s.state.players[0]!.deck.map((card) => card.cardId)).toEqual(["BT1-009"]);
  });

  it("uses the exact Dragon-trait/name boundaries and adds as many as possible", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "EX7-007", as: "vorvomon" }],
          deck: ["EX7-039", "BT23-084", "EX3-065"],
          security: ["BT1-009"],
        },
        1: { security: ["BT1-010"] },
      },
      { autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 6;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("vorvomon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.hand.some((card) => card.cardId === "EX7-039"));

    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toEqual(["EX7-039", "EX3-065"]);
    expect(s.state.players[0]!.deck.map((card) => card.cardId)).toEqual(["BT23-084"]);
  });

  it("applies the inherited +2000 DP during its controller's turn", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: "BT1-009", as: "host", under: ["EX7-007"] }] } });
    await s.ready();
    expect(s.perm("host").currentDP).toBe(5000);
    s.state.turnSeat = 1;
    await advance(s.engine).recompute();
    expect(s.perm("host").currentDP).toBe(3000);
  });

  it("legally evolves from a red level 2, pays 0, and preserves the source stack", async () => {
    const s = setupEngine(
      {
        0: {
          breeding: { card: "BT1-002", as: "base" },
          hand: [{ card: "EX7-007", as: "vorvomon" }],
          deck: [{ card: "BT1-009", as: "drawn" }],
          security: ["BT1-009"],
        },
        1: { security: ["BT1-010"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 3;
    await s.ready();
    const drawnInstanceId = s.inst("drawn").instanceId;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("vorvomon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard?.cardId === "EX7-007");

    expect(s.state.memory).toBe(3);
    expect(s.perm("base").topCard?.cardId).toBe("EX7-007");
    expect(s.perm("base").stack.map((card) => card.cardId)).toEqual(["BT1-002"]);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([drawnInstanceId]);
    expect(s.state.players[0]!.deck).toHaveLength(0);
    expect(s.perm("base").currentDP).toBe(1000);
  });

  it("rejects an illegal level 3 source for the level 2 evolution requirement", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-009", as: "illegal" }],
          hand: [{ card: "EX7-007", as: "vorvomon" }],
          security: ["BT1-009"],
        },
        1: { security: ["BT1-010"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 3;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("illegal").permanentId,
        instanceId: s.inst("vorvomon").instanceId,
      }),
    ).toEqual({ ok: false, reason: "invalid-evolution" });
    expect(s.perm("illegal").topCard?.cardId).toBe("BT1-009");
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toEqual(["EX7-007"]);
    expect(s.state.memory).toBe(3);
  });
});
