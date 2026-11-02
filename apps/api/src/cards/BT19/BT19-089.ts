import type { CompiledCard, Filter } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const ownDigimon: Filter = { controller: "mine", kind: ["Digimon"] };
const compiled: CompiledCard = {
  effects: [
    {
      trigger: "Static",
      actions: [
        {
          kind: "WaiveColorRequirement",
          target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          condition: {
            kind: "opponentHas",
            filter: { controllerDefault: "opponent", colors: ["White"], kind: ["Digimon", "Tamer"] },
            raw: "your opponent has a white Digimon or Tamer",
          },
        },
      ],
    },
    {
      trigger: "Main",
      actions: [
        {
          effectTextPart:
            "[Main] Until the end of your opponent's turn, 1 of your Digimon isn't affected by the effects of your opponent's Option cards and it can't have its DP reduced.",
          kind: "Restrict",
          target: { filter: ownDigimon, count: 1 },
          restriction: "beAffected",
          fromSourceKind: ["Option"],
          byOpponentEffectsOnly: true,
          duration: "untilOpponentTurnEnd",
        },
        {
          effectTextPart:
            "[Main] Until the end of your opponent's turn, 1 of your Digimon isn't affected by the effects of your opponent's Option cards and it can't have its DP reduced.",
          kind: "Restrict",
          target: { filter: ownDigimon, count: 1, sameTarget: true },
          restriction: "dpImmune",
          duration: "untilOpponentTurnEnd",
        },
      ],
    },
    { trigger: "Security", actions: [{ kind: "AddToHandSelf" }], isSecurity: true },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT19-089", compiled);
