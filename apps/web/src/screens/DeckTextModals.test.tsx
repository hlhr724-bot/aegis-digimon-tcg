// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import type { DeckListing } from "@/game/decks";
import { en } from "../i18n/en";
import { DeckImportModal } from "./DeckTextModals";
import { DeckExportModal } from "@/screens/DeckExportModal";

describe("deck text modals", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("exposes the import modal as a dialog named by its title", () => {
    render(
      <I18nProvider>
        <DeckImportModal onImport={() => undefined} onClose={() => undefined} />
      </I18nProvider>,
    );

    const dialog = screen.getByRole("dialog", { name: en["deck.importTitle"] });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });

  it("exposes the export modal as a dialog named by its title", () => {
    render(
      <I18nProvider>
        <DeckExportModal text="4 Agumon BT1-009" onClose={() => undefined} />
      </I18nProvider>,
    );

    const dialog = screen.getByRole("dialog", { name: en["deck.exportTitle"] });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });
});

const exportDeck: DeckListing = {
  id: "shopping-deck",
  name: "Shopping deck",
  color: "Red",
  blurb: "",
  mainDeck: ["BT12-038", "BT12-038"],
  eggDeck: ["BT12-003"],
  mainDeckArts: ["BT12-038_P1", "BT12-038_P2"],
};

function renderExport(deck = exportDeck) {
  return render(
    <I18nProvider>
      <DeckExportModal text="original deck list" deck={deck} onClose={() => undefined} />
    </I18nProvider>,
  );
}

function selectTcgplayer() {
  fireEvent.change(screen.getByRole("combobox", { name: en["deck.exportFormat"] }), { target: { value: "tcgplayer" } });
}

describe("deck export formats", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("keeps the existing format by default and copies the displayed shopping list", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    renderExport();
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("original deck list");
    selectTcgplayer();
    const text = "1 Koromon [BT-12]\n2 GeoGreymon [BT-12]";
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(text);
    fireEvent.click(screen.getByRole("button", { name: en["common.copy"] }));
    await screen.findByRole("button", { name: en["common.copied"] });
    expect(writeText).toHaveBeenCalledWith(text);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "digimoncard-io" } });
    expect(screen.getByRole("button", { name: en["common.copy"] })).toBeTruthy();
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("original deck list");
  });

  it("keeps text selectable when clipboard access fails", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockRejectedValue(new Error("Denied"));
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    renderExport();
    selectTcgplayer();
    fireEvent.click(screen.getByRole("button", { name: en["common.copy"] }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const field = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.click(field);
    expect(field.selectionEnd - field.selectionStart).toBe(field.value.length);
    expect(screen.getByRole("button", { name: en["common.copy"] })).toBeTruthy();
  });

  it("does not show copied confirmation for a stale format request", async () => {
    let finishCopy: (() => void) | undefined;
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: () =>
          new Promise<void>((resolve) => {
            finishCopy = resolve;
          }),
      },
    });
    renderExport();
    fireEvent.click(screen.getByRole("button", { name: en["common.copy"] }));
    selectTcgplayer();
    finishCopy?.();
    await waitFor(() => expect(screen.queryByRole("button", { name: en["common.copied"] })).toBeNull());
  });

  it("reports unsupported cards and disables copying partial output", () => {
    renderExport({ ...exportDeck, mainDeck: ["BT12-038", "LM-063"] });
    selectTcgplayer();
    expect(screen.getByRole("alert").textContent).toContain("LM-063");
    expect((screen.getByRole("button", { name: en["common.copy"] }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("disables copying an empty shopping list", () => {
    renderExport({ ...exportDeck, mainDeck: [], eggDeck: [] });
    selectTcgplayer();
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("");
    expect((screen.getByRole("button", { name: en["common.copy"] }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("uses updated editor contents instead of previously saved deck contents", () => {
    const view = renderExport();
    selectTcgplayer();
    view.rerender(
      <I18nProvider>
        <DeckExportModal text="updated" deck={{ ...exportDeck, mainDeck: ["BT12-038"] }} onClose={() => undefined} />
      </I18nProvider>,
    );
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("1 Koromon [BT-12]\n1 GeoGreymon [BT-12]");
  });
});
