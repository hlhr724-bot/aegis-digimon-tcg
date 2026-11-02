import type { Action, CompiledCard, Filter } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const ownDigimon: Filter = { controller: "mine", kind: ["Digimon"] };
const oneOrFewerOwnDigimon = {
  kind: "permanentCount" as const,
  seat: "mine" as const,
  filter: ownDigimon,
  op: "lte" as const,
  value: 1,
};

const playNamed = (name: string, triggerName: string): Action => ({
  kind: "PlayWithoutCost",
  effectTextPart:
    "you may play 1 [Gabumon] if that Digimon has [Greymon] in its name or 1 [Agumon] if it has [Garurumon] in its name from your hand or trash without paying the cost.",
  target: {
    filter: { controller: "mine", zone: ["hand", "trash"], nameOrTrait: [{ tokens: [name], match: "nameExact" }] },
    count: 1,
  },
  from: ["hand", "trash"],
  payCost: false,
  optional: true,
  condition: {
    kind: "triggerSubjectMatchesFilter",
    filter: { kind: ["Digimon"], nameOrTrait: [{ tokens: [triggerName], match: "name" }] },
  },
});

const digivolutionWatcher: Action = {
  kind: "SubTrigger",
  effectTextPart: "by suspending this Tamer",
  event: "whenOneOfYoursDigivolves",
  sourceFilter: { controller: "mine", kind: ["Digimon"] },
  condition: oneOrFewerOwnDigimon,
  cost: { kind: "suspend", target: { filter: { isSelfRef: true }, count: 1, isSelf: true } },
  actions: [playNamed("Gabumon", "Greymon"), playNamed("Agumon", "Garurumon")],
};

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "StartOfYourMainPhase",
      actions: [
        {
          kind: "GainMemory",
          amount: 1,
          condition: { kind: "opponentHas", filter: { controller: "opponent", kind: ["Digimon"] } },
        },
      ],
    },
    {
      trigger: "YourTurn",
      actions: [digivolutionWatcher],
    },
    {
      trigger: "Security",
      isSecurity: true,
      actions: [
        { kind: "PlayWithoutCost", target: { filter: { isSelfRef: true }, count: 1, isSelf: true }, payCost: false },
      ],
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("EX13-067", compiled);
