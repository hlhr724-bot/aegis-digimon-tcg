import type { CompiledCard, Cost, Filter } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const angoramonText: Pick<Filter, "nameOrTrait"> = {
  nameOrTrait: [{ tokens: ["Angoramon"], match: "text" }],
};

const suspendSelf: Cost = {
  kind: "suspend",
  target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
  raw: "by suspending this Digimon",
};

const compiled: CompiledCard = {
  effects: [
    {
      trigger: "YourTurn",
      actions: [
        {
          kind: "Replacement",
          event: "wouldBePlayed",
          sourceFilter: {
            controller: "mine",
            ...angoramonText,
          },
          actions: [
            {
              kind: "Replacement",
              event: "wouldBePlayed",
              mode: "reduceCost",
              amount: 2,
              cost: suspendSelf,
              optional: true,
              abortOnDecline: true,
              raw: "reduce the play cost by 2",
            },
          ],
        },
      ],
    },
    {
      trigger: "YourTurn",
      actions: [
        {
          kind: "Replacement",
          event: "wouldDigivolve",
          sourceFilter: {
            controller: "mine",
            kind: ["Digimon"],
          },
          into: { controllerDefault: "mine", kind: ["Digimon"], ...angoramonText },
          actions: [
            {
              kind: "Replacement",
              event: "wouldDigivolve",
              mode: "reduceCost",
              amount: 2,
              cost: suspendSelf,
              optional: true,
              abortOnDecline: true,
              raw: "reduce the digivolution cost by 2",
            },
          ],
        },
      ],
    },
    {
      trigger: "YourTurn",
      description:
        "[Your Turn] When this Digimon becomes suspended, 1 of your Digimon with [Angoramon] in its text gains ＜Rush＞ (This Digimon can attack the turn it comes into play) for the turn.",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenSuspended",
          sourceFilter: { isSelfRef: true },
          actions: [
            {
              kind: "GainKeyword",
              target: {
                filter: {
                  controller: "mine",
                  kind: ["Digimon"],
                  ...angoramonText,
                },
                count: 1,
              },
              keyword: { keyword: "Rush" },
              duration: "forTheTurn",
            },
          ],
        },
      ],
    },
  ],
  coverage: "full",
  residual: [],
};

registerIrCard("LM-009", compiled);
