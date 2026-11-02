import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "StartOfYourMainPhase",
      actions: [
        {
          kind: "SecurityManipulation",
          effectTextPart:
            "[Start of Your Main Phase] If you have 3 or more security cards, you may add the top card of your security stack to the hand.",
          op: "toHand",
          controller: "mine",
          amount: 1,
          condition: {
            kind: "securityAtLeast",
            value: 3,
          },
          optional: true,
        },
        {
          kind: "SecurityManipulation",
          effectTextPart:
            "If you have 2 or fewer, you may place 1 yellow Digimon card with the [Vaccine] trait from your hand at the top or bottom of your security stack.",
          op: "placeAsSecurity",
          controller: "mine",
          source: {
            filter: {
              controllerDefault: "mine",
              kind: ["Digimon"],
              colors: ["Yellow"],
              nameOrTrait: [
                {
                  tokens: ["Vaccine"],
                  match: "trait",
                },
              ],
            },
            count: 1,
          },
          from: ["hand"],
          position: "choice",
          condition: {
            kind: "securityAtMost",
            value: 2,
            raw: "you have 2 or fewer",
          },
          optional: true,
        },
      ],
    },
    {
      trigger: "AllTurns",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenSecurityRemoved",
          sourceFilter: { controller: "mine" },
          actions: [
            {
              kind: "ModifyDP",
              target: {
                filter: {
                  controller: "opponent",
                  kind: ["Digimon"],
                },
                count: 1,
              },
              amount: -2000,
              duration: "forTheTurn",
            },
          ],
        },
      ],
      isInherited: true,
      frequency: "OncePerTurn",
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT15-034", compiled);
export { compiled };
