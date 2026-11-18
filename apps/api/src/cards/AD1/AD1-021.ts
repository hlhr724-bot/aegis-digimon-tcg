import type { CompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

type Actions = CompiledCard["effects"][number]["actions"];

const marcusTarget = {
  filter: {
    controller: "mine",
    nameOrTrait: [{ tokens: ["Marcus Damon"], match: "name" }],
  },
  count: 1,
};
const chosenMarcusTarget = {
  filter: {},
  count: 1,
  fromSelectionRef: "chosenMarcus",
};

const agumonGate = {
  kind: "youHave",
  filter: {
    controllerDefault: "mine",
    kind: ["Digimon"],
    colors: ["Yellow"],
    nameOrTrait: [{ tokens: ["Agumon", "Greymon"], match: "name" }],
  },
  raw: "you have a yellow Digimon with [Agumon] or [Greymon] in its name",
};

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "YourTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenSuspended",
          sourceFilter: { isSelfRef: true },
          actions: [
            {
              effectTextPart: "[Your Turn] When this Tamer suspends, ＜Draw 1＞",
              kind: "Draw",
              controller: "mine",
              amount: 1,
            },
            {
              effectTextPart:
                "Then, 1 of your Digimon may digivolve into a yellow Digimon card with [Greymon] in its name in the hand with the digivolution cost reduced by 3.",
              kind: "Digivolve",
              target: {
                filter: {
                  controller: "mine",
                  kind: ["Digimon"],
                },
                count: 1,
              },
              into: {
                controllerDefault: "mine",
                kind: ["Digimon"],
                colors: ["Yellow"],
                nameOrTrait: [{ tokens: ["Greymon"], match: "name" }],
              },
              from: ["hand"],
              reduceCost: 3,
              payCost: true,
              optional: true,
            },
          ],
        },
      ] as unknown as Actions,
    },
    {
      trigger: "EndOfYourTurn",
      actions: [
        {
          kind: "SelectBind",
          target: { ...marcusTarget, bindAs: "chosenMarcus" },
          condition: agumonGate,
        },
        {
          kind: "GrantStatic",
          target: chosenMarcusTarget,
          grant: "kinds",
          tokens: ["Digimon"],
          duration: "forTheTurn",
        },
        {
          kind: "SetBaseDP",
          target: chosenMarcusTarget,
          value: 6000,
          duration: "forTheTurn",
        },
        {
          effectTextPart:
            "[End of Your Turn] [Once Per Turn] If you have a yellow Digimon with [Agumon] or [Greymon] in its name, for the turn, 1 of your [Marcus Damon]s is also treated as a 6000 DP Digimon, gains ＜Rush＞ and can't digivolve.",
          kind: "GainKeyword",
          target: chosenMarcusTarget,
          keyword: {
            keyword: "Rush",
            raw: "＜Rush＞",
          },
          duration: "forTheTurn",
        },
        {
          kind: "Restrict",
          target: chosenMarcusTarget,
          restriction: "digivolve",
          duration: "forTheTurn",
        },
        {
          effectTextPart: "Then, 1 of your Digimon may attack.",
          kind: "Attack",
          target: {
            filter: {
              controller: "mine",
              kind: ["Digimon"],
            },
            count: 1,
          },
          withoutSuspending: false,
          optional: true,
        },
      ] as unknown as Actions,
      frequency: "OncePerTurn",
    },
    {
      trigger: "Security",
      actions: [
        {
          kind: "PlayWithoutCost",
          target: {
            filter: { isSelfRef: true },
            count: 1,
            isSelf: true,
          },
          payCost: false,
        },
      ] as unknown as Actions,
      isSecurity: true,
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("AD1-021", compiled);
