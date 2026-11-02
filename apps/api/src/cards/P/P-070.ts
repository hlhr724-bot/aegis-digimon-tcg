import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Security",
      timing: "endOfBattle",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenSecurityBattleEnded",
          once: true,
          raw: "at the end of the battle",
          actions: [
            {
              kind: "RevealAdd",
              effectTextPart:
                "[Security] At the end of the battle, reveal the top card of your deck. If it’s a black Digimon card with a play cost of 4 or less, you may play it without paying its memory cost. Add the remaining cards to your hand.",
              revealCount: 1,
              add: [
                {
                  effectTextPart:
                    "a black Digimon card with a play cost of 4 or less, you may play it without paying its memory cost.",
                  filter: {
                    controllerDefault: "mine",
                    kind: ["Digimon"],
                    colors: ["Black"],
                    playCostLte: 4,
                  },
                  count: 1,
                  to: "play",
                  optional: true,
                },
                {
                  effectTextPart: "Add the remaining cards to your hand.",
                  filter: { controllerDefault: "mine" },
                  count: "all",
                  to: "hand",
                },
              ],
              rest: "deckBottom",
            },
            { kind: "AddToHandSelf", effectTextPart: "Then, add this card to its owner’s hand." },
          ],
        },
      ],
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("P-070", compiled);
