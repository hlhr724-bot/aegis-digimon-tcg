import { CardInstance, Permanent } from "@aegis/shared";
import { expect, it } from "vitest";
import { findDnaMaterialCombination, getDigivolveCostOptions, handCardEvolutionRoute } from "./digivolveModel";
import { dnaFieldChoice } from "./screen/model/dnaMaterialSelection";

it("GitHub #5273: identical Ouryumon cards remain two selectable physical DNA materials", () => {
  const copies = ["first-ouryumon", "second-ouryumon"].map((id) =>
    Object.assign(new Permanent(), {
      permanentId: id,
      topCard: Object.assign(new CardInstance(), { instanceId: `${id}-top`, cardId: "BT20-018" }),
    }),
  );
  const ids = copies.map((p) => p.permanentId);
  const routes = [{ materialPermanentIds: ids, projectedCost: 0 }];
  expect(findDnaMaterialCombination("BT20-060", copies)).toEqual(ids);
  expect(handCardEvolutionRoute("BT20-060", copies, true, routes, ids[1])).toEqual({
    kind: "both",
    materialPermanentIds: ids,
  });
  const first = dnaFieldChoice(routes, copies, [ids[0]!]);
  expect([...first.candidates]).toEqual(ids);
  expect(first.selected).toBeUndefined();
  expect(dnaFieldChoice(routes, copies, ids).selected).toEqual(routes[0]);
  expect(dnaFieldChoice(routes, copies.slice(0, 1), ids).selected).toBeUndefined();
});

it("GitHub #5393: ZeigGreymon offers AD1-006 Shoutmon X7's [Blue Flare] digivolve for cost 2", () => {
  // BT11-031's catalog record spells the trait "BlueFlare"; Shoutmon X7 prints [Blue Flare].
  const zeigGreymon = Object.assign(new Permanent(), {
    permanentId: "zeiggreymon",
    topCard: Object.assign(new CardInstance(), { instanceId: "zeiggreymon-top", cardId: "BT11-031" }),
  });
  expect(getDigivolveCostOptions("AD1-006", zeigGreymon)).toContainEqual(
    expect.objectContaining({ type: "alternate", cost: 2 }),
  );
});

it("offers only the cost-two text route for BlackGatomon over red ToyAgumon", () => {
  const toyAgumon = Object.assign(new Permanent(), {
    permanentId: "toy-agumon",
    topCard: Object.assign(new CardInstance(), { instanceId: "toy-agumon-top", cardId: "EX7-008" }),
  });
  expect(getDigivolveCostOptions("BT25-082", toyAgumon)).toEqual([
    expect.objectContaining({ type: "alternate", cost: 2, alternateRequirementIndex: 2 }),
  ]);
});
