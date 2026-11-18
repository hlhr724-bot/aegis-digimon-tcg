// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { DecisionRequest, DecisionResponse } from "@aegis/shared";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/I18nProvider";
import { DecisionOverlay } from "@/game/overlay/choice/DecisionOverlay";

beforeEach(() => localStorage.setItem("aegis.locale", "en"));
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

it("shows the card an optional play will play before the player accepts", () => {
  const onRespond = vi.fn<(response: DecisionResponse) => void>();
  const { container } = render(
    <I18nProvider>
      <DecisionOverlay
        request={request}
        sourceCardId="BT24-007"
        candidates={[{ instanceId: "discarded-greymon", cardId: "BT24-010", selectable: false, zone: "trash" }]}
        picks={[]}
        onTogglePick={vi.fn<(instanceId: string) => void>()}
        onRespond={onRespond}
      />
    </I18nProvider>,
  );
  const strip = container.querySelector(".decision-overlay__choice-cards");
  expect(strip?.textContent).toContain("Card to play");
  expect(strip?.textContent).toContain("Greymon");
  expect(strip?.textContent).toContain("BT24-010");
  fireEvent.click(screen.getByRole("button", { name: /^Yes, activate$/ }));
  expect(onRespond).toHaveBeenCalledWith({ kind: "optional", accept: true });
});

it("keeps an optional prompt without a previewed card free of the card strip", () => {
  const { container } = render(
    <I18nProvider>
      <DecisionOverlay
        request={{ ...request, options: { activationConfirmation: true } }}
        sourceCardId="BT24-007"
        candidates={[]}
        picks={[]}
        onTogglePick={vi.fn<(instanceId: string) => void>()}
        onRespond={vi.fn<(response: DecisionResponse) => void>()}
      />
    </I18nProvider>,
  );
  expect(container.querySelector(".decision-overlay__choice-cards")).toBeNull();
});
