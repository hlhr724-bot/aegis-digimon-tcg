// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { I18nProvider } from "@/i18n/I18nProvider";
import { createBlankDeck, type DeckListing } from "@/game/decks";
import { DeckEditor } from "@/screens/DeckEditor";

afterEach(() => cleanup());

const deck: DeckListing = {
  ...createBlankDeck([], "Red", "Sheet deck"),
  mainDeck: ["BT1-009", "BT1-009", "BT1-009", "BT1-009", "BT1-084", "BT1-085", "BT1-085", "BT1-090"],
  eggDeck: ["BT1-001", "BT1-001", "BT1-001", "BT1-001", "BT1-001"],
};

function renderEditor(editorDeck: DeckListing = deck) {
  render(
    <I18nProvider>
      <DeckEditor deck={editorDeck} onSave={() => undefined} onClose={() => undefined} onNav={() => undefined} />
    </I18nProvider>,
  );
}

describe("deck sheet bar", () => {
  it("shows the main and Digi-Egg counts and opens the deck sheet with its stats", () => {
    renderEditor();
    const bar = screen.getByRole("button", { name: /^View deck/ });
    expect(bar).toHaveProperty("textContent", expect.stringContaining("Main 8/50"));
    expect(bar).toHaveProperty("textContent", expect.stringContaining("Egg 5/5"));
    expect(bar.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(bar);

    expect(bar.getAttribute("aria-expanded")).toBe("true");
    const sheet = screen.getByRole("complementary", { name: "Deck information" });
    expect(sheet.className).toContain("deck-current--open");
    expect(within(sheet).getByText("Cost curve")).toBeTruthy();
    const typeCounts = Object.fromEntries(
      within(sheet)
        .getAllByRole("term")
        .map((term) => [term.textContent, term.nextElementSibling?.textContent]),
    );
    expect(typeCounts).toEqual({ Digimon: "5", Tamer: "2", Option: "1", "Digi-Egg": "5" });
  });

  it("keeps add and remove working from the open sheet", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: /^View deck/ }));
    const sheet = screen.getByRole("complementary", { name: "Deck information" });

    fireEvent.click(within(sheet).getByRole("button", { name: "Remove Tai Kamiya" }));

    expect(screen.getByRole("button", { name: /^View deck/ }).textContent).toContain("Main 7/50");
    fireEvent.click(within(sheet).getByRole("button", { name: "Add Tai Kamiya" }));
    expect(screen.getByRole("button", { name: /^View deck/ }).textContent).toContain("Main 8/50");
  });
});

describe("limited cards in historical deck pools", () => {
  it.each([
    ["LM-001", "Siriusmon", "BT15"],
    ["LM-051", "Alexandrite Memory Boost!", "EX13"],
  ] as const)("selects and adds copies of %s from its historical pool", async (cardId, name, format) => {
    renderEditor({ ...deck, mainDeck: [], eggDeck: [], format });
    fireEvent.change(screen.getByRole("textbox", { name: "Search name, number or text…" }), {
      target: { value: cardId },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Add" }));
    fireEvent.click(screen.getByRole("button", { name: /^View deck/ }));
    const sheet = screen.getByRole("complementary", { name: "Deck information" });
    const add = within(sheet).getByRole("button", { name: `Add ${name}` });
    expect(add).toHaveProperty("disabled", false);
    fireEvent.click(add);
    expect(screen.getByRole("button", { name: /^View deck/ }).textContent).toContain("Main 2/50");
  });

  it("keeps later limited cards unavailable in an earlier pool", () => {
    renderEditor({ ...deck, mainDeck: ["LM-051"], eggDeck: [], format: "BT13" });
    fireEvent.click(screen.getByRole("button", { name: /^View deck/ }));
    const sheet = screen.getByRole("complementary", { name: "Deck information" });
    expect(within(sheet).getByRole("button", { name: "Add Alexandrite Memory Boost!" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByRole("button", { name: /^View deck/ }).textContent).toContain("Main 1/50");
  });
});

describe("deck cover selection", () => {
  it("changes the cover from the header without opening card details", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Change cover" }));
    const picker = screen.getByRole("dialog", { name: "Change cover" });
    expect(within(picker).getAllByRole("button", { name: /Monodramon · BT1-009/ })).toHaveLength(1);
    fireEvent.click(within(picker).getByRole("button", { name: "Tai Kamiya · BT1-085" }));
    expect(screen.queryByRole("dialog", { name: "Change cover" })).toBeNull();
    const header = document.querySelector(".deck-current__cover-name");
    expect(header?.textContent).toContain("Tai Kamiya");
    fireEvent.click(screen.getByRole("button", { name: "Change cover" }));
    expect(screen.getByRole("button", { name: "Tai Kamiya · BT1-085" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("closes without changing the cover and disables selection for an empty deck", () => {
    renderEditor();
    const before = document.querySelector(".deck-current__cover-name")?.textContent;
    fireEvent.click(screen.getByRole("button", { name: "Change cover" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Change cover" })).getByRole("button", { name: "Close" }),
    );
    expect(document.querySelector(".deck-current__cover-name")?.textContent).toBe(before);
    cleanup();
    renderEditor({ ...deck, mainDeck: [], eggDeck: [] });
    expect(screen.getByRole("button", { name: "Change cover" })).toHaveProperty("disabled", true);
  });
});
