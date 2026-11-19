// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { DecisionRequest, DecisionResponse } from "@aegis/shared";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/I18nProvider";
import { setEffectPromptPosition } from "@/game/effectPromptPosition";
import { DecisionOverlay } from "@/game/overlay/choice/DecisionOverlay";
import type { DecisionCandidate } from "@/game/overlay/choice/decisionTypes";

beforeEach(() => {
  localStorage.setItem("aegis.locale", "en");
  setEffectPromptPosition("left");
});
afterEach(cleanup);

const request: DecisionRequest = {
  decisionId: "play-trashed-card",
  seat: 0,
  kind: "optional",
  promptText: "Play with the cost reduced by 2",
  sourceCardId: "BT24-007",
  options: {
    activationConfirmation: true,
    isInherited: true,
    timing: "YourTurn",
    visibleInstanceIds: ["discarded-greymon"],
    visibleCards: [{ instanceId: "discarded-greymon", cardId: "BT24-010" }],
  },
};

const greymon: DecisionCandidate = {
  instanceId: "discarded-greymon",
  cardId: "BT24-010",
  selectable: false,
  zone: "trash",
};

type RenderOptionalParams = {
  optionalRequest: DecisionRequest;
  candidates: DecisionCandidate[];
  onRespond?: (response: DecisionResponse) => void;
};

function renderOptional({
  optionalRequest,
  candidates,
  onRespond = vi.fn<(response: DecisionResponse) => void>(),
}: RenderOptionalParams) {
  render(
    <I18nProvider>
      <DecisionOverlay
        request={optionalRequest}
        sourceCardId="BT24-007"
        candidates={candidates}
        picks={[]}
        onTogglePick={vi.fn<(instanceId: string) => void>()}
        onRespond={onRespond}
      />
    </I18nProvider>,
  );
  return screen.getByRole("dialog");
}

it("shows the card an optional play will play in the docked decision prompt", () => {
  const onRespond = vi.fn<(response: DecisionResponse) => void>();
  const dialog = renderOptional({ optionalRequest: request, candidates: [greymon], onRespond });
  expect(dialog.dataset.promptSurface).toBe("left");
  expect(dialog.classList.contains("decision-overlay--card-choice")).toBe(false);
  expect(dialog.classList.contains("decision-overlay--side")).toBe(true);
  const strip = dialog.querySelector(".decision-overlay__choice-cards");
  expect(strip?.textContent).toContain("Card to play");
  expect(strip?.textContent).toContain("Greymon");
  expect(strip?.textContent).toContain("BT24-010");
  fireEvent.click(screen.getByRole("button", { name: /^Yes, activate$/ }));
  expect(onRespond).toHaveBeenCalledWith({ kind: "optional", accept: true });
});

it("keeps an optional prompt without a previewed card docked as a compact activation prompt", () => {
  const dialog = renderOptional({
    optionalRequest: { ...request, options: { activationConfirmation: true } },
    candidates: [],
  });
  expect(dialog.dataset.promptSurface).toBe("left");
  expect(dialog.dataset.effectActivation).toBe("true");
  expect(dialog.classList.contains("decision-overlay--card-choice")).toBe(false);
  expect(dialog.classList.contains("decision-overlay--side")).toBe(true);
  expect(dialog.querySelector(".decision-overlay__choice-cards")).toBeNull();
});
