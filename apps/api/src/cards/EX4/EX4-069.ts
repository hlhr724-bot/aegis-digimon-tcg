import type { Action, CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const deleteExceptHighest = (controller: "mine" | "opponent"): Action => ({
  effectTextPart: "[Main] Choose 1 of each player's Digimon with the highest play cost. Delete all other Digimon.",
  kind: "Delete",
  target: {
    filter: { controller, kind: ["Digimon"] },
    count: "all",
    except: {
      filter: { controller, kind: ["Digimon"] },
      count: 1,
      selector: "highestPlayCost",
    },
  },
});

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Main",
      actions: [deleteExceptHighest("mine"), deleteExceptHighest("opponent")],
    },
    { trigger: "Security", actions: [{ kind: "ActivateMain" }], isSecurity: true },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("EX4-069", compiled);
