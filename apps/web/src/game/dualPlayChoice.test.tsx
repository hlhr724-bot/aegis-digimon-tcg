// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { I18nProvider, translator } from "../i18n";
import { DualPlayChoiceOverlay } from "./overlay/choice/DualPlayChoiceOverlay";

afterEach(cleanup);

it("offers Option use without offering to play a Dual card as a Digimon", () => {
  const onChoose = vi.fn<(useAs: "digimon" | "option") => void>();
  render(
    <I18nProvider>
      <DualPlayChoiceOverlay cardId="EX13-066" onChoose={onChoose} onCancel={vi.fn<() => void>()} />
    </I18nProvider>,
  );
  const t = translator("en");
  expect(screen.queryByRole("button", { name: t("overlay.playAsDigimon") })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: t("overlay.useAsOption") }));
  expect(onChoose).toHaveBeenCalledWith("option");
});

function renderDualChoice(cardId: string) {
  return render(
    <I18nProvider>
      <DualPlayChoiceOverlay
        cardId={cardId}
        onChoose={vi.fn<(useAs: "digimon" | "option") => void>()}
        onCancel={vi.fn<() => void>()}
      />
    </I18nProvider>,
  ).container.querySelector(".action-confirmation__detail")!;
}

it("shows the Option effect without its use requirement and emphasizes Final Judgment's immediate passage", () => {
  const detail = renderDualChoice("BT25-057");
  expect(detail.textContent).not.toContain("Use Req.");
  expect(detail.textContent).toContain("Then, it may attack.");
  expect(detail.querySelector(".decision-overlay__effect-step")?.textContent).toBe(
    "[Main] 1 of your Digimon gains ＜Rush＞ , ＜Security A. +1＞ and +5000 DP for the turn.",
  );
});

it("drops the use requirement without emphasizing other DUAL Options", () => {
  const detail = renderDualChoice("ST24-07");
  expect(detail.textContent).not.toContain("Use Req.");
  expect(detail.textContent).toContain("[Main] 1 of your opponent's Digimon gets -6000 DP");
  expect(detail.querySelector(".decision-overlay__effect-step")).toBeNull();
});

it("shows only VictoryGreymon's Option effect in its use confirmation", () => {
  const detail = renderDualChoice("EX14-012");
  expect(detail.textContent).toBe("[Main] Delete up to 15000 DP total worth of your opponent's Digimon.");
});

it("shows only Jupitermon's Main effect in its use confirmation", () => {
  const detail = renderDualChoice("BT26-033");
  expect(detail.textContent).toBe(
    "[Main] Delete all of your opponent's Digimon with the lowest DP. Then, ＜Recovery +1＞",
  );
});
