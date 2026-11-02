import { getCompiledCard, type Action, type CardEffect, type CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const generated = getCompiledCard("EX6-073")!;
const deletedCountSource = "ex6-073-deleted";
const placedCountSource = "ex6-073-placed";

export const compiled: CompiledCard = {
  ...generated,
  effects: generated.effects.map((effect): CardEffect => ({
    ...effect,
    actions: effect.actions
      .filter((action) => !(action.kind === "RawUnparsed" && action.text.includes("reduce the cards trashed by 1")))
      .map((action): Action => {
        if (action.kind === "PlaceUnder") {
          return {
            ...action,
            target: { ...action.target, distinctNames: true },
            trackCount: placedCountSource,
            trackDistinctNames: placedCountSource,
          };
        }
        if (
          action.kind === "Delete" &&
          (action.condition?.kind === "raw" || action.condition?.kind === "namedCountAtLeast")
        ) {
          return {
            ...action,
            condition: { kind: "namedCountAtLeast", countSource: placedCountSource, count: 4 },
          };
        }
        if (action.kind === "Delete") {
          return {
            effectTextPart:
              "[When Attacking] By returning 7 cards with different names and the [Seven Great Demon Lords] trait " +
              "from this Digimon's digivolution cards to the bottom of the deck, " +
              "delete 7 of your opponent's Digimon or Tamers.",
            ...action,
            target: action.target,
            cost:
              action.cost?.kind === "return" && action.cost.target
                ? {
                    ...action.cost,
                    position: "bottom",
                    target: {
                      ...action.cost.target,
                      isSelfRef: true,
                      distinctNames: true,
                      filter: {
                        ...action.cost.target.filter,
                        kind: undefined,
                        zone: "digivolutionCards",
                        sameHost: true,
                      },
                    },
                  }
                : action.cost,
            trackCount: deletedCountSource,
          };
        }
        if (action.kind === "SecurityManipulation" && action.op === "trashTop") {
          return {
            effectTextPart:
              "Then, trash the top 7 cards of your opponent's security stack. " +
              "For each card deleted by this effect, reduce the cards trashed by 1.",
            ...action,
            amount: undefined,
            amountFromNamedCount: { base: 7, countSource: deletedCountSource, per: -1, floor: 0 },
          };
        }
        return action;
      }),
  })),
  coverage: "full",
  residual: [],
};

registerIrCard("EX6-073", compiled);
