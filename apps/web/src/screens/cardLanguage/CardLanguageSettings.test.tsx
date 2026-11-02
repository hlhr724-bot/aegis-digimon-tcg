import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/i18n/I18nProvider";
import { CardLanguageSettings } from "@/screens/cardLanguage/CardLanguageSettings";
import type { DeckListing } from "@/game/decks";

const deck: DeckListing = { id: "deck", name: "Deck", color: "Red", blurb: "", mainDeck: ["BT1-010"], eggDeck: [] };

afterEach(() => {
  cleanup();
  localStorage.clear();
});

it("blocks application until loaded and while saving, then reports the result", async () => {
  let finish: () => void = () => undefined;
  const onSave = vi.fn<(deck: DeckListing) => Promise<void>>(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const { rerender } = render(
    <I18nProvider>
      <CardLanguageSettings decks={[deck]} ready={false} onSave={onSave} />
    </I18nProvider>,
  );
  const button = screen.getByRole("button", { name: "Apply to all my decks" });
  expect((button as HTMLButtonElement).disabled).toBe(true);
  rerender(
    <I18nProvider>
      <CardLanguageSettings decks={[deck]} ready onSave={onSave} />
    </I18nProvider>,
  );
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "ja" } });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(onSave).toHaveBeenCalledOnce();
  expect((button as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole("status").textContent).toContain("Updating decks: 0/1");
  finish();
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Decks updated: 1. Failed: 0."));
  expect((button as HTMLButtonElement).disabled).toBe(false);
});

it("disables the action for an empty collection", () => {
  render(
    <I18nProvider>
      <CardLanguageSettings decks={[]} ready onSave={vi.fn<(deck: DeckListing) => Promise<void>>()} />
    </I18nProvider>,
  );
  expect((screen.getByRole("button", { name: "Apply to all my decks" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole("status").textContent).toBe("No personal decks to update.");
});

it("shows the effective default and remembers a selection even without decks", () => {
  localStorage.setItem("aegis:locale", "ja");
  const onSave = vi.fn<(deck: DeckListing) => Promise<void>>();
  const first = render(
    <I18nProvider>
      <CardLanguageSettings decks={[]} ready onSave={onSave} />
    </I18nProvider>,
  );
  expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("en");
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "ja" } });
  expect(localStorage.getItem("aegis:cardImageLanguage")).toBe("ja");
  first.unmount();
  render(
    <I18nProvider>
      <CardLanguageSettings decks={[]} ready onSave={onSave} />
    </I18nProvider>,
  );
  expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("ja");
  expect(onSave).not.toHaveBeenCalled();
});
