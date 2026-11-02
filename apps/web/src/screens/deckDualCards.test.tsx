// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "@/i18n";
import { DeckKindCounts, DeckLevelCurve } from "@/screens/deckPreview";

const digimonLevel3 = "BT1-009";
const option = "BT1-090";
const dualLevel5 = "BT25-057";

afterEach(cleanup);

function levelColumnCount(label: string): string | null {
  const column = screen.getByText(label).closest(".deck-level-curve__column");
  return column?.firstElementChild?.textContent ?? null;
}

describe("dual cards in the deck ratio", () => {
  it("shows Digimon/Option dual cards as their own count", () => {
    render(
      <I18nProvider>
        <DeckKindCounts main={{ [digimonLevel3]: 4, [option]: 2, [dualLevel5]: 3 }} />
      </I18nProvider>,
    );

    expect(screen.getByText("Digimon").textContent).toBe("Digimon 4");
    expect(screen.getByText("Option").textContent).toBe("Option 2");
    expect(screen.getByText("Dual").textContent).toBe("Dual 3");
  });

  it("hides the dual count when the deck has no dual cards", () => {
    render(
      <I18nProvider>
        <DeckKindCounts main={{ [digimonLevel3]: 4 }} />
      </I18nProvider>,
    );

    expect(screen.queryByText("Dual")).toBeNull();
  });

  it("includes dual cards in the level distribution", () => {
    render(
      <I18nProvider>
        <DeckLevelCurve main={{ [digimonLevel3]: 4, [option]: 2, [dualLevel5]: 3 }} />
      </I18nProvider>,
    );

    expect(levelColumnCount("Lv.3")).toBe("4");
    expect(levelColumnCount("Lv.5")).toBe("3");
  });
});
