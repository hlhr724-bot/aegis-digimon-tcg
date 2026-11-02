import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import type { Target } from "@aegis/shared/effects/ir/filters/filter";
import { registerIrCard } from "#api/engine/effects/interpreter";

const self: Target = { filter: { isSelfRef: true }, count: 1, isSelf: true };
const startCost = {
  kind: "place",
  target: {
    filter: { controller: "mine", zone: "hand", nameOrTrait: [{ tokens: ["BEATBREAK"], match: "trait" }] },
    count: 1,
  },
  underFilter: self.filter,
  host: "self",
  destination: "digivolutionStack",
  position: "bottom",
  faceDown: true,
} satisfies Action["cost"];

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "StartOfYourMainPhase",
      actions: [
        {
          kind: "CostGatedBlock",
          cost: startCost,
          optional: true,
          abortOnDecline: true,
          actions: [
            { kind: "Draw", controller: "mine", amount: 1 },
            { kind: "GainMemory", amount: 1 },
          ],
        },
      ],
    },
    {
      trigger: "AllTurns",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenSuspended",
          sourceFilter: { controllerDefault: "any", kind: ["Digimon"] },
          optional: true,
          cost: { kind: "suspend", target: self, raw: "by suspending this Tamer" },
          actions: [
            {
              kind: "PlaceUnder",
              target: { filter: {}, count: 1 },
              fromDeckTop: true,
              position: "bottom",
              faceDown: true,
            },
          ],
          raw: "When any Digimon suspend, by suspending this Tamer, you may place the top card of your deck face down under this Tamer.",
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

registerIrCard("BT27-091", compiled);
