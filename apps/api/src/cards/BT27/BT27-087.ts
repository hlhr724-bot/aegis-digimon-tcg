import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import type { Filter, Target } from "@aegis/shared/effects/ir/filters/filter";
import { registerIrCard } from "#api/engine/effects/interpreter";

const self: Target = { filter: { isSelfRef: true }, count: 1, isSelf: true };
const chronicle = { tokens: ["Chronicle"], match: "trait" as const };
const chronicleDigimonInPlay: Filter = {
  controllerDefault: "mine",
  zone: "battleArea",
  kind: ["Digimon"],
  nameOrTrait: [chronicle],
};
const xAntibodyOrChronicleCard: Filter = {
  controllerDefault: "mine",
  nameOrTrait: [{ tokens: ["X Antibody"], match: "nameExact" }, chronicle],
};
const levelThreeChronicleDigimon: Filter = {
  controller: "mine",
  zone: "hand",
  kind: ["Digimon"],
  levelComparison: { op: "eq", value: 3 },
  nameOrTrait: [chronicle],
};

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "StartOfYourMainPhase",
      actions: [
        {
          kind: "GainMemory",
          amount: 1,
          condition: { kind: "youHave", filter: chronicleDigimonInPlay },
        },
      ],
    },
    {
      trigger: "OnPlay",
      actions: [
        {
          kind: "Modal",
          choose: 1,
          labels: [
            "Reveal 3 for an [X Antibody] or [Chronicle] card",
            "Play a level 3 [Chronicle] Digimon to breeding",
          ],
          options: [
            [
              {
                kind: "RevealAdd",
                effectTextPart:
                  "Reveal the top 3 cards of your deck. Add 1 [X Antibody] or [Chronicle] trait card among them to the hand. Trash the rest.",
                revealCount: 3,
                add: [{ filter: xAntibodyOrChronicleCard, count: 1, to: "hand" }],
                rest: "trash",
              },
            ],
            [
              {
                kind: "PlayWithoutCost",
                effectTextPart:
                  "You may play 1 level 3 [Chronicle] trait Digimon card from your hand to your breeding area without paying the cost.",
                target: { filter: levelThreeChronicleDigimon, count: 1 },
                from: ["hand"],
                payCost: false,
                breeding: true,
                optional: true,
              },
            ],
          ],
        },
      ],
    },
    {
      trigger: "Security",
      isSecurity: true,
      actions: [{ kind: "PlayWithoutCost", target: self, payCost: false }],
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT27-087", compiled);
