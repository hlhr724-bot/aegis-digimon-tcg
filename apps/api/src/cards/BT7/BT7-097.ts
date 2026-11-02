import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

type CardAction = CompiledCard["effects"][number]["actions"][number];

const playFromStack: CardAction = {
  effectTextPart:
    "[Main] Choose up to 2 Digimon cards in the digivolution cards of one of your Digimon and play them as other Digimon without paying their memory costs.",
  kind: "PlayWithoutCost",
  target: {
    filter: {
      controller: "mine",
      zone: "digivolutionCards",
      kind: ["Digimon"],
      hostFilter: { boundRef: "chosenHost" },
    },
    count: 2,
    upTo: true,
  },
  from: ["digivolutionCards"],
  payCost: false,
  suspended: false,
  raw: "Play up to 2 Digimon cards from one of your Digimon's digivolution cards without paying their memory costs.",
};

const selectStackHost: CardAction = {
  effectTextPart:
    "[Main] Choose up to 2 Digimon cards in the digivolution cards of one of your Digimon and play them as other Digimon without paying their memory costs.",
  kind: "SelectBind",
  target: {
    filter: {
      controller: "mine",
      kind: ["Digimon"],
      digivolutionCards: "hasAny",
    },
    count: 1,
    bindAs: "chosenHost",
  },
};

export const compiled: CompiledCard = {
  effects: [
    { trigger: "Main", actions: [selectStackHost, playFromStack] },
    { trigger: "Security", isSecurity: true, actions: [{ kind: "ActivateMain" }] },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("BT7-097", compiled);
