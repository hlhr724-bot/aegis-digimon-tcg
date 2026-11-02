import { expect, it } from "vitest";
import { getDecisionMaterialSelectionOrder } from "@/game/screen/model/getDecisionMaterialSelectionOrder";

const allowedTargetCombinations = [
  ["alphamon", "ouryumon"],
  ["other-alphamon", "ouryumon"],
];

it("shows the picked material number then the server-provided stack order for the complete pair", () => {
  expect(getDecisionMaterialSelectionOrder({ allowedTargetCombinations, picks: ["ouryumon"] })).toEqual(
    new Map([["ouryumon", 1]]),
  );
  expect(getDecisionMaterialSelectionOrder({ allowedTargetCombinations, picks: ["ouryumon", "alphamon"] })).toEqual(
    new Map([
      ["alphamon", 1],
      ["ouryumon", 2],
    ]),
  );
});

it("updates the numbers after deselecting and replacing a material", () => {
  expect(
    getDecisionMaterialSelectionOrder({ allowedTargetCombinations, picks: ["ouryumon", "other-alphamon"] }),
  ).toEqual(
    new Map([
      ["other-alphamon", 1],
      ["ouryumon", 2],
    ]),
  );
  expect(getDecisionMaterialSelectionOrder({ allowedTargetCombinations, picks: [] })).toEqual(new Map());
});

it("leaves ordinary field target selections without material numbers", () => {
  expect(
    getDecisionMaterialSelectionOrder({ allowedTargetCombinations: undefined, picks: ["target"] }),
  ).toBeUndefined();
});
