// @vitest-environment jsdom
import { CardOpenerProvider } from "@/game/cardLinks";
import { useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { I18nProvider, translator, type Locale } from "../../../i18n";
import { DecisionCandidateGrid } from "./DecisionCandidateGrid";
import type { DecisionCandidate } from "./decisionTypes";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function grid(candidates: DecisionCandidate[], maxTotalDP?: number) {
  const pick = vi.fn<(instanceId: string) => void>();
  render(
    <I18nProvider>
      <DecisionCandidateGrid
        candidates={candidates}
        picks={[]}
        min={0}
        max={1}
        selectedPlayCost={0}
        withinPlayCostBudget
        selectedDP={0}
        maxTotalDP={maxTotalDP}
        onTogglePick={pick}
      />
    </I18nProvider>,
  );
  return pick;
}

it.each(["en", "pt-BR", "es", "it"] as Locale[])(
  "shows localized visible copy labels and exact pending-source badge (%s)",
  (locale) => {
    localStorage.setItem("aegis:locale", locale);
    const pick = grid([
      { instanceId: "old", cardId: "EX7-071", zone: "trash" },
      { instanceId: "new", cardId: "EX7-071", zone: "trash", pendingEffect: true },
    ]);
    const t = translator(locale);
    const old = screen.getByRole("button", { name: /copy 1|cópia 1|copia 1/ });
    const pending = screen.getByRole("button", { name: /copy 2|cópia 2|copia 2/ });
    expect(within(old).getByText(t("overlay.cardCopy", { index: 1, total: 2 }))).toBeTruthy();
    expect(within(pending).getByText(t("overlay.cardCopy", { index: 2, total: 2 }))).toBeTruthy();
    expect(within(old).queryByText(t("overlay.pendingEffect"))).toBeNull();
    expect(within(pending).getByText(t("overlay.pendingEffect"))).toBeTruthy();
    fireEvent.click(old);
    fireEvent.click(pending);
    expect(pick.mock.calls).toEqual([["old"], ["new"]]);
  },
);

it("does not show a pending badge for concealed identities or cards outside trash", () => {
  grid([
    { instanceId: "blind", zone: "trash", pendingEffect: true },
    { instanceId: "hand", cardId: "EX7-071", zone: "hand", pendingEffect: true },
  ]);
  expect(screen.queryByText("Pending effect")).toBeNull();
});

it("marks the digivolution card whose inherited effect was used this turn", () => {
  grid([
    { instanceId: "spent", cardId: "EX12-064", zone: "digivolutionCards", oncePerTurnUsed: true },
    { instanceId: "fresh", cardId: "EX12-064", zone: "digivolutionCards" },
  ]);
  const spent = screen.getByRole("button", { name: /copy 1/ });
  const fresh = screen.getByRole("button", { name: /copy 2/ });
  expect(spent.getAttribute("aria-label")).toContain("Inherited used");
  expect(within(spent).getByText("Inherited used")).toBeTruthy();
  expect(within(fresh).queryByText("Inherited used")).toBeNull();
});

function BlindHandSelection() {
  const [picks, setPicks] = useState<string[]>([]);
  return (
    <DecisionCandidateGrid
      candidates={[{ instanceId: "hidden-hand-card" }]}
      picks={picks}
      min={1}
      max={1}
      selectedPlayCost={0}
      withinPlayCostBudget
      selectedDP={0}
      onTogglePick={(instanceId) => setPicks((current) => (current.includes(instanceId) ? [] : [instanceId]))}
    />
  );
}

it("highlights a selected opponent hand back and clears the highlight without exposing its identity", () => {
  render(
    <I18nProvider>
      <BlindHandSelection />
    </I18nProvider>,
  );
  const candidate = screen.getByRole("button", { name: "Card" });
  const back = candidate.querySelector("div");
  const concealedMarkup = back!.innerHTML;
  expect(candidate.getAttribute("aria-pressed")).toBe("false");
  expect(back!.style.boxShadow).not.toContain("--ds-rim-attention");
  fireEvent.click(candidate);
  expect(candidate.getAttribute("aria-pressed")).toBe("true");
  expect(back!.style.boxShadow).toContain("--ds-rim-attention");
  expect(back!.innerHTML).toBe(concealedMarkup);
  expect(candidate.querySelector("[data-card-id]")).toBeNull();
  fireEvent.click(candidate);
  expect(candidate.getAttribute("aria-pressed")).toBe("false");
  expect(back!.style.boxShadow).not.toContain("--ds-rim-attention");
  expect(back!.innerHTML).toBe(concealedMarkup);
});

function SingleCardSelection() {
  const [picks, setPicks] = useState<string[]>([]);
  return (
    <DecisionCandidateGrid
      candidates={[{ instanceId: "trash-lucemon", cardId: "BT1-010", zone: "trash" }]}
      picks={picks}
      min={0}
      max={1}
      selectedPlayCost={0}
      withinPlayCostBudget
      selectedDP={0}
      onTogglePick={(instanceId) => setPicks((current) => (current.includes(instanceId) ? [] : [instanceId]))}
    />
  );
}

it("marks a single-pick card as unchosen until it is clicked, then shows a check", () => {
  render(
    <I18nProvider>
      <SingleCardSelection />
    </I18nProvider>,
  );
  const candidate = screen.getByRole("button", { name: "Agumon" });
  const mark = () => candidate.querySelector(".decision-overlay__pick-mark");
  expect(mark()?.getAttribute("data-picked")).toBe("false");
  expect(mark()?.querySelector("svg")).toBeNull();
  fireEvent.click(candidate);
  expect(mark()?.getAttribute("data-picked")).toBe("true");
  expect(mark()?.querySelector("svg")).not.toBeNull();
  fireEvent.click(candidate);
  expect(mark()?.getAttribute("data-picked")).toBe("false");
});

it("places eligible cards first in each zone without changing their relative order", () => {
  const candidates: DecisionCandidate[] = [
    { instanceId: "hand-disabled", cardId: "BT1-010", zone: "hand", selectable: false },
    { instanceId: "hand-first", cardId: "BT1-010", zone: "hand" },
    { instanceId: "hand-second", cardId: "BT1-010", zone: "hand", selectable: true },
    { instanceId: "trash-disabled", cardId: "BT1-010", zone: "trash", selectable: false },
    { instanceId: "trash-first", cardId: "BT1-010", zone: "trash", selectable: true },
  ];
  const originalOrder = candidates.map((candidate) => candidate.instanceId);
  const pick = grid(candidates);
  const buttons = screen.getAllByRole("button").filter((button) => button.hasAttribute("data-instance-id"));
  expect(buttons.map((button) => button.dataset.instanceId)).toEqual([
    "hand-first",
    "hand-second",
    "hand-disabled",
    "trash-first",
    "trash-disabled",
  ]);
  fireEvent.click(buttons[0]!);
  expect(pick).toHaveBeenCalledWith("hand-first");
  expect(candidates.map((candidate) => candidate.instanceId)).toEqual(originalOrder);
});

it("places cards within the DP budget before cards that cannot be selected", () => {
  grid(
    [
      { instanceId: "over-budget", cardId: "BT1-010", currentDP: 9000 },
      { instanceId: "within-budget", cardId: "BT1-010", currentDP: 3000 },
    ],
    5000,
  );
  const buttons = screen.getAllByRole("button").filter((button) => button.hasAttribute("data-instance-id"));
  expect(buttons.map((button) => button.dataset.instanceId)).toEqual(["within-budget", "over-budget"]);
  expect((buttons[0] as HTMLButtonElement).disabled).toBe(false);
  expect((buttons[1] as HTMLButtonElement).disabled).toBe(true);
});

it.each([false, true])(
  "names revealed cards and opens them from an icon without selecting or exposing hidden cards: %s",
  (sourcePicker) => {
    const open = vi.fn<(cardId: string, artId?: string) => void>();
    const pick = vi.fn<(instanceId: string) => void>();
    render(
      <I18nProvider>
        <CardOpenerProvider onOpenCard={open}>
          <DecisionCandidateGrid
            candidates={[
              { instanceId: "revealed", cardId: "EX7-071", artId: "alternate" },
              { instanceId: "security:1", zone: "security" },
            ]}
            picks={[]}
            min={0}
            max={1}
            selectedPlayCost={0}
            withinPlayCostBudget
            selectedDP={0}
            sourcePicker={sourcePicker}
            onTogglePick={pick}
          />
        </CardOpenerProvider>
      </I18nProvider>,
    );
    const buttons = screen.getAllByRole("button", { name: /Open.*Hurricane/i });
    expect(buttons).toHaveLength(1);
    expect(buttons[0]!.querySelector("svg")).not.toBeNull();
    expect(buttons[0]!.textContent?.trim()).toBe("");
    expect(document.querySelectorAll(".decision-overlay__candidate-name")).toHaveLength(1);
    fireEvent.click(buttons[0]!);
    expect(open).toHaveBeenCalledWith("EX7-071", "alternate");
    expect(pick).not.toHaveBeenCalled();
  },
);
