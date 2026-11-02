import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import type { Filter, Target } from "@aegis/shared/effects/ir/filters/filter";
import { registerIrCard } from "#api/engine/effects/interpreter";

const self: Target = { filter: { isSelfRef: true }, count: 1, isSelf: true };
const ravemonOption: Filter = {
  controllerDefault: "mine",
  zone: "trash",
  kind: ["Option"],
  nameOrTrait: [{ tokens: ["Ravemon"], match: "text" }],
};

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "StartOfYourTurn",
      actions: [
        {
          kind: "SetMemory",
          value: 3,
          condition: { kind: "memoryAtMost", value: 2, controller: "mine" },
        },
      ],
    },
    {
      trigger: "AllTurns",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenHandTrashed",
          fireCondition: { kind: "triggerHandTrashedSeat", seat: "any" },
          optional: true,
          cost: { kind: "suspend", target: self, raw: "by suspending this Tamer" },
          actions: [
            { kind: "PlaceUnder", target: { filter: {}, count: 1 }, fromDeckTop: true, position: "bottom" },
            { kind: "PlaceUnder", target: { filter: {}, count: 1 }, fromDeckTop: true, position: "bottom" },
          ],
          raw: "When hands are trashed from, by suspending this Tamer, you may place the top 2 cards of your deck face down under this Tamer.",
        },
      ],
    },
    {
      trigger: "Main",
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "UseOptionWithoutCost",
          effectTextPart:
            "By trashing 5 bottom face-down cards from under any of your Tamers, you may use 1 Option card with [Ravemon] in its text from your trash without paying the cost.",
          filter: ravemonOption,
          target: { filter: ravemonOption, count: 1 },
          from: ["trash"],
          payCost: false,
          optional: true,
          payCostBeforeOptional: true,
          cost: {
            kind: "trashBottomFaceDownUnderTamer",
            controller: "mine",
            count: 5,
            raw: "By trashing 5 bottom face-down cards from under any of your Tamers",
          },
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

registerIrCard("BT27-096", compiled);
