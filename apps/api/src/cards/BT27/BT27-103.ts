import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter";

const deleteAndRecover: Action[] = [
  {
    kind: "Delete",
    effectTextPart: "You may delete 1 of your opponent's Digimon.",
    target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
    optional: true,
  },
  {
    kind: "Recover",
    effectTextPart: "Then, if DNA digivolving, ＜Recovery +2＞.",
    amount: 2,
    condition: { kind: "isDnaDigivolving" },
  },
];

export const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [],
      keywords: [
        { keyword: "Piercing" },
        { keyword: "SecurityAttack", amount: 1 },
        { keyword: "Blocker" },
        { keyword: "Partition", raw: "＜Partition ([Alphamon] & [Ouryumon])＞" },
      ],
    },
    { trigger: "WhenDigivolving", frequency: "OncePerTurn", sharedUseKey: "delete-recover", actions: deleteAndRecover },
    { trigger: "WhenAttacking", frequency: "OncePerTurn", sharedUseKey: "delete-recover", actions: deleteAndRecover },
    {
      trigger: "AllTurns",
      condition: { kind: "duringAttack" },
      actions: [
        {
          kind: "GrantStatic",
          target: { filter: { isSelfRef: true }, count: 1 },
          grant: "immuneToOpponentEffects",
          duration: "permanent",
        },
      ],
    },
    {
      trigger: "Main",
      description:
        "[Main] Delete 1 of your opponent's Digimon. Then, 2 of your Digimon may DNA digivolve into this card.",
      actions: [
        {
          kind: "Delete",
          effectTextPart: "Delete 1 of your opponent's Digimon.",
          target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
        },
        {
          kind: "DnaDigivolve",
          effectTextPart: "Then, 2 of your Digimon may DNA digivolve into this card.",
          materials: [
            { zone: "battleArea", filter: { controller: "mine", kind: ["Digimon"] }, count: 1 },
            { zone: "battleArea", filter: { controller: "mine", kind: ["Digimon"] }, count: 1 },
          ],
          into: { isSelfRef: true },
          payCost: true,
          optional: true,
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
  dnaDigivolveRequirement: [{ cost: 0, materials: [{ namesExact: ["Alphamon"] }, { namesExact: ["Ouryumon"] }] }],
};

registerIrCard("BT27-103", compiled);
