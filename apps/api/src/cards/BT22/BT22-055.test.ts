import { describe, expect, it } from "vitest";
import { observe } from "../../engine/testkit/observe.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { compiled } from "./BT22-055.js";
import "./index.js";

describe("BT22-055 Recomon", () => {
  it("trashes an Appmon Digimon from hand to draw two", () => {
    expect(compiled.digivolutionRequirement).toEqual([
      { level: 2, colors: ["Black"], cost: 0, isAlternate: false },
      { level: 2, traits: ["Appmon"], cost: 0, isAlternate: true },
    ]);
    expect(compiled.linkRequirement).toEqual([{ traits: ["Appmon"], cost: 1 }]);
    const onPlay = compiled.effects.find((entry) => entry.trigger === "OnPlay");
    expect(onPlay?.actions[0]).toMatchObject({
      kind: "Draw",
      controller: "mine",
      amount: 2,
      optional: true,
      cost: {
        kind: "trash",
        target: {
          filter: {
            zone: "hand",
            controller: "mine",
            kind: ["Digimon"],
            nameOrTrait: [{ tokens: ["Appmon"], match: "trait" }],
          },
          count: 1,
        },
      },
    });
  });

  it("pays the Appmon hand cost and draws exactly 2 through the public play flow", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: "BT22-055", as: "recomon" },
            { card: "BT22-058", as: "cost" },
          ],
          deck: ["BT1-009", "BT1-010"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 3;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("recomon").instanceId })).toEqual({
      ok: true,
    });
    await settle();

    expect(s.state.players[0]!.trash.some((card) => card.cardId === "BT22-058")).toBe(true);
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toEqual(expect.arrayContaining(["BT1-009", "BT1-010"]));
  });

  it("links to an Appmon for 1 and grants Blocker to the host", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT21-009", as: "host" }], hand: [{ card: "BT22-055", as: "recomon" }] },
    });
    s.state.memory = 2;

    expect(
      s.engine.applyIntent(0, {
        type: "linkCard",
        instanceId: s.inst("recomon").instanceId,
        targetPermanentId: s.perm("host").permanentId,
      }),
    ).toEqual({ ok: true });
    await settle(() => observe(s.engine).hasKeyword(s.perm("host"), "Blocker"));

    expect(s.state.memory).toBe(1);
    expect(observe(s.engine).hasKeyword(s.perm("host"), "Blocker")).toBe(true);
  });
});
