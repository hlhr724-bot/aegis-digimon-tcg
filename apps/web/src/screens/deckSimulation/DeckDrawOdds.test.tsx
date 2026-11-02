import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "@/i18n/I18nProvider";
import { DeckDrawOdds } from "@/screens/deckSimulation/DeckDrawOdds";

const FULL_DECK = { "BT1-009": 4, "BT1-010": 4, "BT1-085": 4, "BT1-090": 2, "BT1-084": 36 };

function renderOdds(main: Record<string, number>) {
  return render(
    <I18nProvider>
      <DeckDrawOdds main={main} />
    </I18nProvider>,
  );
}

describe("DeckDrawOdds", () => {
  afterEach(cleanup);

  it("adds a key card and shows its chance for the opening hand and every turn", () => {
    renderOdds(FULL_DECK);
    fireEvent.change(screen.getByRole("combobox", { name: "Add a key card" }), { target: { value: "BT1-090" } });
    const row = screen.getByRole("row", { name: /Gravity Crush ×2/ });
    expect(within(row).getAllByRole("cell")).toHaveLength(7);
    expect(within(row).getAllByRole("cell")[0]!.textContent).toBe("35%");
    expect(screen.getByText(/Gravity Crush by T3: \d+% now, \d+% with one more copy/)).toBeTruthy();
  });

  it("moves the one-more-copy comparison to the turn the player picks", () => {
    renderOdds(FULL_DECK);
    fireEvent.change(screen.getByRole("combobox", { name: "Add a key card" }), { target: { value: "BT1-090" } });
    fireEvent.click(screen.getByRole("button", { name: "T5" }));
    expect(screen.getByRole("button", { name: "T5" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/Gravity Crush by T5:/)).toBeTruthy();
  });

  it("removes a key card when its chip is pressed", () => {
    renderOdds(FULL_DECK);
    fireEvent.change(screen.getByRole("combobox", { name: "Add a key card" }), { target: { value: "BT1-090" } });
    fireEvent.click(screen.getByRole("button", { name: "Remove Gravity Crush from key cards" }));
    expect(screen.queryByRole("row", { name: /Gravity Crush/ })).toBeNull();
    expect(screen.getByText("Pick key cards to see your chance to have them by each turn.")).toBeTruthy();
  });
});
