import type { CompiledCard, Filter } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const knightmonInText: Filter = {
  controllerDefault: "mine",
  nameOrTrait: [{ tokens: ["Knightmon"], match: "text" }],
};

const knightmonInName: Filter = {
  controllerDefault: "mine",
  nameOrTrait: [{ tokens: ["Knightmon"], match: "name" }],
};

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "OnPlay",
      actions: [
        {
          kind: "RevealAdd",
          revealCount: 3,
          add: [
            {
              effectTextPart: "Add 1 card with [Knightmon] in its text",
              filter: knightmonInText,
              count: 1,
              to: "hand",
            },
            {
              effectTextPart: "1 card with [Knightmon] in its name among them to the hand.",
              filter: knightmonInName,
              count: 1,
              to: "hand",
            },
          ],
          rest: "deckBottom",
        },
      ],
    },
    {
      trigger: "AllTurns",
      isInherited: true,
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "Replacement",
          event: "wouldLeavePlay",
          mode: "prevent",
          leaveCause: "otherThanYourEffect",
          sourceFilter: { isSelfRef: true },
          actions: [],
          cost: {
            kind: "deleteOwn",
            target: {
              filter: {
                controller: "mine",
                excludeSelf: true,
                kind: ["Digimon"],
                nameOrTrait: [{ tokens: ["Knightmon"], match: "text" }],
              },
              count: 1,
            },
            raw: "by deleting 1 of your other Digimon with [Knightmon] in its text",
          },
          raw: "When this Digimon would leave the battle area other than by your effects, by deleting 1 of your other Digimon with [Knightmon] in its text, it doesn't leave",
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("EX13-048", compiled);
