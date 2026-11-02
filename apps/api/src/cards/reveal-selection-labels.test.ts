import type { Action } from "@aegis/shared";
import { getCardDefinition } from "@aegis/shared/cards/registry";
import { compiledEffects } from "@aegis/shared/effects/data";
import { describe, expect, it } from "vitest";
import { printedPassage } from "#api/engine/decisions/printedPassage";

type RevealAddAction = Extract<Action, { kind: "RevealAdd" }>;

function collectRevealAdds(value: unknown, found: RevealAddAction[] = []): RevealAddAction[] {
  if (Array.isArray(value)) {
    for (const item of value) collectRevealAdds(item, found);
    return found;
  }
  if (value === null || typeof value !== "object") return found;
  const record = value as { kind?: unknown };
  if (record.kind === "RevealAdd") found.push(value as RevealAddAction);
  for (const nested of Object.values(value)) collectRevealAdds(nested, found);
  return found;
}

const multiSlotReveals = Object.entries(compiledEffects).flatMap(([cardId, card]) =>
  collectRevealAdds(card)
    .filter((action) => action.add.length >= 2)
    .map((action, index) => ({ name: `${cardId} #${index + 1}`, cardId, action })),
);

describe("reveal selection labels", () => {
  it("covers every multi-category reveal", () => {
    expect(multiSlotReveals.length).toBeGreaterThan(0);
  });

  it.each(multiSlotReveals)("$name names each category with its printed words", ({ cardId, action }) => {
    const definition = getCardDefinition(cardId);
    const printed = [definition?.effectText, definition?.inheritedEffectText, definition?.securityEffectText]
      .filter((text) => text !== undefined)
      .join("\n");
    const labels = action.add.map((slot) => slot.effectTextPart);

    for (const label of labels) {
      expect(label).toBeDefined();
      expect(printedPassage(printed, label!)).toBeDefined();
    }
    expect(new Set(labels).size).toBe(labels.length);
  });
});
