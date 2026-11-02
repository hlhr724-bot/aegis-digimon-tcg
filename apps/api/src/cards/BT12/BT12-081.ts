import { getCompiledCard } from "@aegis/shared";
import { registerIrCard } from "../../engine/effects/interpreter.js";

const compiled = structuredClone(getCompiledCard("BT12-081")!);
const whenDigivolving = compiled.effects.find((effect) => effect.trigger === "WhenDigivolving");
const playFromTamer = whenDigivolving?.actions.find((action) => action.kind === "PlayWithoutCost");
if (whenDigivolving !== undefined && playFromTamer?.kind === "PlayWithoutCost") {
  whenDigivolving.actions = [
    {
      kind: "Modal",
      choose: 1,
      optional: true,
      labels: [
        "Play 1 level 4 or lower Digimon card with ＜Save＞ from under one of your Tamers",
        "Digivolve into [Quartzmon] in your hand or under one of your Tamers with the cost reduced by 3",
      ],
      options: [
        [{ ...playFromTamer, from: ["digivolutionCardsUnderTamers"], optional: false }],
        [
          {
            kind: "Digivolve",
            target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
            into: {
              controllerDefault: "mine",
              kind: ["Digimon"],
              nameOrTrait: [{ tokens: ["Quartzmon"], match: "name" }],
            },
            from: ["hand", "digivolutionCardsUnderTamers"],
            payCost: true,
            costDelta: -3,
          },
        ],
      ],
      optionConditions: [null, { kind: "selfDigivolutionCountAtLeast", value: 4 }],
    },
  ];
}
const saveRequirement = compiled.digivolutionRequirement?.find((requirement) => requirement.traits?.includes("Save"));
if (saveRequirement !== undefined) saveRequirement.colors = ["Yellow", "Green", "Purple"];
const inherited = compiled.effects.find((effect) => effect.trigger === "WhenAttacking");
const draw = inherited?.actions[0];
if (draw?.kind === "Draw") {
  draw.condition = { kind: "selfTopHasText", filter: { nameOrTrait: [{ tokens: ["Save"], match: "text" }] } };
}
compiled.coverage = "full";
compiled.residual = [];
registerIrCard("BT12-081", compiled);
