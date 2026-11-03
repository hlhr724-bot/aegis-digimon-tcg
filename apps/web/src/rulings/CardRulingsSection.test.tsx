// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CardRulings } from "@aegis/shared/cards/CardRulings";
import { I18nProvider } from "@/i18n";
import { CardRulingsSection } from "@/rulings/CardRulingsSection";

const fetchCardRulings = vi.hoisted(() => vi.fn<(cardId: string) => Promise<CardRulings>>());
vi.mock("@/rulings/fetchCardRulings", () => ({ fetchCardRulings }));

function renderSection(cardId = "BT20-016") {
  return render(
    <I18nProvider>
      <CardRulingsSection cardId={cardId} />
    </I18nProvider>,
  );
}

afterEach(() => {
  cleanup();
  fetchCardRulings.mockReset();
});

describe("CardRulingsSection", () => {
  it("lists each official question with its answer behind it", async () => {
    fetchCardRulings.mockResolvedValue({
      cardId: "BT20-016",
      errata: null,
      questions: [
        {
          qno: "Q4297",
          question: "Can I choose not to attack?",
          answer: "Yes, you can.",
          date: "2025-01-24",
          related: [],
        },
      ],
    });
    renderSection();

    expect(await screen.findByText("Official rulings · 1 Q&A")).toBeTruthy();
    const summary = screen.getByText("Can I choose not to attack?", { exact: false });
    fireEvent.click(summary);
    expect(screen.getByText("Yes, you can.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Official Q&A in English on digimoncard.com" }).getAttribute("href")).toBe(
      "https://world.digimoncard.com/rule/?card_no=BT20-016",
    );
  });

  it("shows the printed and corrected text of an errata", async () => {
    fetchCardRulings.mockResolvedValue({
      cardId: "EX4-072",
      errata: { date: "2026-05-29", changes: [{ before: "Old text", after: "New text" }] },
      questions: [],
    });
    renderSection("EX4-072");

    expect(await screen.findByText("Errata · 2026-05-29")).toBeTruthy();
    expect(screen.getByText("Old text").tagName).toBe("DEL");
    expect(screen.getByText("New text")).toBeTruthy();
  });

  it("says so when a card has no rulings", async () => {
    fetchCardRulings.mockResolvedValue({ cardId: "BT1-001", errata: null, questions: [] });
    renderSection("BT1-001");

    expect(await screen.findByText("No official Q&A or errata for this card.")).toBeTruthy();
  });

  it("reports a failed load instead of staying on loading", async () => {
    fetchCardRulings.mockRejectedValue(new Error("offline"));
    renderSection();

    expect(screen.getByText("Loading rulings…")).toBeTruthy();
    expect(await screen.findByText("Couldn't load the rulings.")).toBeTruthy();
  });
});
