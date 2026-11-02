import type { CompiledCard } from "@aegis/shared/effects/ir/card";
import { registerIrCard } from "#api/engine/effects/interpreter";

const activateText = "[When Digivolving] [When Attacking] You may activate 1 [Main] effect on this card's Option side.";
const unsuspendText =
  "[All Turns] [Once Per Turn] When your opponent's hand is trashed from, this Digimon may unsuspend.";
const discardText = "[Main] Your opponent trashes any 1 card from their hand or security stack.";
const deleteText =
  "Then, delete 1 of their Digimon with a level as high as the number of cards in their hand or higher.";

export const compiled: CompiledCard = {
  effects: [
    { trigger: "Static", actions: [], keywords: [{ keyword: "Piercing" }, { keyword: "Blocker" }] },
    {
      trigger: "Static",
      actions: [
        {
          kind: "WaiveColorRequirement",
          condition: {
            kind: "youHave",
            filter: { controller: "mine", nameOrTrait: [{ tokens: ["DATA SQUAD"], match: "trait" }] },
          },
        },
      ],
    },
    { trigger: "WhenDigivolving", optional: true, actions: [{ kind: "ActivateMain", effectTextPart: activateText }] },
    { trigger: "WhenAttacking", optional: true, actions: [{ kind: "ActivateMain", effectTextPart: activateText }] },
    {
      trigger: "AllTurns",
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "SubTrigger",
          effectTextPart: unsuspendText,
          event: "whenHandTrashed",
          handTrashedController: "opponent",
          actions: [
            {
              kind: "Unsuspend",
              effectTextPart: unsuspendText,
              optional: true,
              target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
            },
          ],
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          kind: "Trash",
          effectTextPart: discardText,
          target: { filter: { controller: "opponent", zone: ["hand", "security"] }, count: 1 },
          chooser: "opponent",
        },
        {
          kind: "Delete",
          effectTextPart: deleteText,
          target: {
            filter: {
              controller: "opponent",
              kind: ["Digimon"],
              levelComparison: {
                op: "gte",
                value: 0,
                scaling: { per: 1, unit: "cards", filter: { controller: "opponent", zone: "hand" } },
              },
            },
            count: 1,
          },
        },
      ],
    },
  ],
  digivolutionRequirement: [
    { level: 6, traits: ["DATA SQUAD"], cost: 5, isAlternate: true },
    {
      namesExact: ["Ravemon"],
      cost: 0,
      isAlternate: true,
      burstDigivolve: { returnTamerNamesExact: ["Keenan Crier"] },
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT27-085", compiled);
