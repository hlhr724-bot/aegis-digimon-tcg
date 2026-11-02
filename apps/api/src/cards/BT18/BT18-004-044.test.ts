import { describe, expect, it } from "vitest";
import { compiled as puroromon } from "./BT18-004.js";
import { compiled as agunimon } from "./BT18-011.js";
import { compiled as ancientVolcanomon } from "./BT18-017.js";
import { compiled as penguinmon } from "./BT18-021.js";
import { compiled as kumamon } from "./BT18-022.js";
import { compiled as funBeemon } from "./BT18-044.js";

describe("BT18 targeted fidelity checks", () => {
  it("requires Puroromon/FunBeemon's Royal Base card to come from hand", () => {
    expect(puroromon.effects?.[0]?.actions?.[0]).toMatchObject({
      cost: {
        kind: "place",
        target: { filter: { zone: "hand", nameOrTrait: [{ tokens: ["Royal Base"], match: "trait" }] } },
      },
    });
    expect(funBeemon.effects?.[1]?.actions?.[0]).toMatchObject({
      cost: {
        kind: "place",
        target: { filter: { zone: "hand", nameOrTrait: [{ tokens: ["Royal Base"], match: "trait" }] } },
      },
    });
  });

  it("lets Agunimon recover either a Hybrid or Ten Warriors card or an inherited-effect Tamer", () => {
    expect(agunimon.effects?.[0]?.actions?.[0]).toMatchObject({
      kind: "Return",
      target: {
        filter: {
          or: [
            { nameOrTrait: [{ tokens: ["Hybrid", "Ten Warriors"], match: "trait" }] },
            { kind: ["Tamer"], hasInheritedEffects: true },
          ],
        },
      },
      to: "hand",
    });
  });

  it("offers AncientVolcanomon's return-to-hand or play-from-stack choice", () => {
    const replacement = ancientVolcanomon.effects?.[2]?.actions?.[0];
    expect(replacement).toMatchObject({
      kind: "Replacement",
      event: "wouldLeavePlay",
      actions: [{ kind: "Modal", choose: 1 }],
    });
    const modal = (
      replacement as unknown as {
        actions?: Array<{ options?: Array<Array<{ kind?: string; to?: string; fromOwnDigivolutionStack?: boolean }>> }>;
      }
    ).actions?.[0];
    expect(modal?.options?.[0]?.[0]).toMatchObject({ kind: "Return", to: "hand" });
    expect(modal?.options?.[1]?.[0]).toMatchObject({ kind: "PlayWithoutCost", fromOwnDigivolutionStack: true });
  });

  it("limits Penguinmon's digivolution-cost replacement to itself or Tamers", () => {
    expect(penguinmon.effects?.[0]?.actions?.[0]).toMatchObject({
      sourceFilter: { or: [{ isSelfRef: true }, { kind: ["Tamer"] }] },
    });
  });

  it("does not replace Kumamon leaving play from its owner's effects", () => {
    expect(kumamon.effects?.[3]?.actions?.[0]).toMatchObject({
      kind: "Replacement",
      leaveCause: "otherThanYourEffect",
    });
  });
});
