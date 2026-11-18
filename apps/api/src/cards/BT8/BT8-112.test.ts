import { describe, expect, it } from "vitest";
import { compiled } from "./BT8-112.js";

describe("BT8-112 Imperialdramon: Paladin Mode", () => {
  it("reduces its evolution cost by 4 by returning a white level 7 from trash", () => {
    expect(compiled.effects?.[0]).toMatchObject({
      trigger: "BeforePayCost",
      actions: [
        {
          kind: "Replacement",
          event: "wouldDigivolve",
          into: { cardId: "BT8-112" },
          actions: [
            {
              kind: "Replacement",
              mode: "reduceCost",
              amount: 4,
              cost: {
                kind: "return",
                target: {
                  filter: { zone: "trash", controller: "mine", kind: ["Digimon"], levels: [7], colors: ["White"] },
                  count: 1,
                },
                to: "deckBottom",
              },
            },
          ],
        },
      ],
    });
  });

  it("requires a returned two-color card before trashing an opponent stack", () => {
    const effect = compiled.effects?.find((entry) => entry.trigger === "WhenDigivolving");
    expect(effect?.actions).toMatchObject([
      {
        kind: "TrashDigivolution",
        amount: "all",
        abortOnDecline: true,
        cost: {
          kind: "return",
          target: {
            filter: {
              controller: "mine",
              zone: "digivolutionCards",
              isSelfRef: true,
              multicolor: true,
            },
            count: 1,
          },
          to: "deckBottom",
        },
      },
      {
        kind: "Return",
        to: "deckBottom",
        order: "any",
        target: { filter: { digivolutionCards: "none" }, count: "all" },
      },
    ]);
  });

  it("reuses the same optional stack-removal sequence for When Attacking", () => {
    const digivolving = compiled.effects?.find((entry) => entry.trigger === "WhenDigivolving");
    const attacking = compiled.effects?.find((entry) => entry.trigger === "WhenAttacking");
    expect(attacking?.frequency).toBeUndefined();
    expect(attacking?.actions).toEqual(digivolving?.actions);
  });
});
