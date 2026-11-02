import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter";

const battle: Action = {
  kind: "Battle",
  effectTextPart:
    "[On Play] [When Digivolving] [When Attacking] [Once Per Turn] This Digimon may battle 1 of your opponent's Digimon.",
  attacker: { filter: { isSelfRef: true }, count: 1, isSelf: true },
  target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
  optional: true,
};
const play: Action = {
  kind: "CostGatedBlock",
  effectTextPart:
    "[On Play] [When Digivolving] By trashing 2 bottom face-down cards from under any of your Tamers, you may play or use 1 play or use cost 6 or lower [Glowing Dawn] trait card from your hand or your Digimon's digivolution cards without paying the cost.",
  optional: true,
  cost: { kind: "trashBottomFaceDownUnderTamer", controller: "mine", count: 2 },
  actions: [
    {
      kind: "PlayWithoutCost",
      chooseDualMode: true,
      target: {
        filter: {
          controller: "mine",
          kind: ["Digimon", "Tamer", "Option"],
          playCostLte: 6,
          hostFilter: { kind: ["Digimon"] },
          nameOrTrait: [{ tokens: ["Glowing Dawn"], match: "trait" }],
        },
        count: 1,
      },
      from: ["hand", "digivolutionCards"],
      payCost: false,
      optional: true,
    },
  ],
};
export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [],
      keywords: [{ keyword: "SecurityAttack", amount: 1 }, { keyword: "Reboot" }, { keyword: "Blocker" }],
    },
    { trigger: "OnPlay", frequency: "OncePerTurn", sharedUseKey: "battle", actions: [battle] },
    { trigger: "WhenDigivolving", frequency: "OncePerTurn", sharedUseKey: "battle", actions: [battle] },
    { trigger: "WhenAttacking", frequency: "OncePerTurn", sharedUseKey: "battle", actions: [battle] },
    { trigger: "OnPlay", actions: [play] },
    { trigger: "WhenDigivolving", actions: [play] },
  ],
  digivolutionRequirement: [
    { level: 5, traits: ["Glowing Dawn"], cost: 4, isAlternate: true },
    { namesExact: ["Atratusmon"], baseWithoutPlayCost: true, cost: 2, isAlternate: true },
  ],
  assemblyRequirement: [
    {
      materials: [5, 4, 3].map((level) => ({
        count: 1,
        level,
        nameOrTrait: [{ tokens: ["Glowing Dawn"], match: "trait" as const }],
      })),
      reduceCost: 5,
    },
  ],
  coverage: "full",
  residual: [],
};
registerIrCard("BT27-052", compiled);
