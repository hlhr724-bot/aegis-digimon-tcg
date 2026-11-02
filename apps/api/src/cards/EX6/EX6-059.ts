import { getCompiledCard, type CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const generated = getCompiledCard("EX6-059")!;

export const compiled: CompiledCard = {
  ...generated,
  effects: generated.effects.map((effect) =>
    effect.trigger === "AllTurns"
      ? {
          ...effect,
          actions: [
            {
              kind: "SubTrigger",
              event: "whenHandTrashed",
              handTrashedController: "opponent",
              actions: [
                {
                  kind: "PlayWithoutCost",
                  target: {
                    filter: {
                      controller: "mine",
                      zone: "trash",
                      kind: ["Digimon", "Tamer"],
                      colors: ["Purple"],
                      playCostLte: 10,
                      playCostLteScaling: {
                        per: 1,
                        bonus: -1,
                        filter: { zone: "hand", controller: "opponent" },
                        unit: "cards",
                      },
                    },
                    count: 1,
                  },
                  from: ["trash"],
                  payCost: false,
                  optional: true,
                  raw: "you may play 1 purple card with a play cost of 10 or less from your trash without paying the cost",
                },
              ],
              raw: "When a card is trashed from your opponent's hand, you may play 1 purple card with a play cost of 10 or less from your trash without paying the cost",
            },
          ],
        }
      : {
          ...effect,
          actions: effect.actions.map((action) => (action.kind === "Trash" ? { ...action, blind: true } : action)),
        },
  ),
  coverage: "full",
  residual: [],
};

registerIrCard("EX6-059", compiled);
