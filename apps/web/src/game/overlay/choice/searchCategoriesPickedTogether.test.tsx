// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { DecisionRequest } from "@aegis/shared/protocol/events";
import type { DecisionResponse } from "@aegis/shared/protocol/intents";
import { I18nProvider } from "@/i18n";
import { DecisionOverlay } from "@/game/overlay/choice/DecisionOverlay";

const revealed = [
  { instanceId: "reapermon", cardId: "BT26-077" },
  { instanceId: "palmon", cardId: "EX9-035" },
  { instanceId: "monodramon", cardId: "BT1-009" },
];
const handSlot = "add 1 card with the [DM] trait to the hand";
const underSlot = "place 1 card with the [Ver.4] trait face down as the bottom digivolution card";

const request: DecisionRequest = {
  decisionId: "two-category-search",
  seat: 0,
  kind: "selectCards",
  promptText: "Palmon",
  sourceCardId: "EX9-035",
  options: {
    candidateInstanceIds: ["reapermon", "palmon"],
    visibleInstanceIds: revealed.map((card) => card.instanceId),
    visibleCards: revealed,
    min: 1,
    max: 1,
    selectionSlots: [
      { description: handSlot, candidateInstanceIds: ["reapermon", "palmon"], max: 1, isMandatory: true },
      { description: underSlot, candidateInstanceIds: ["palmon"], max: 1, isMandatory: true },
    ],
  },
};

afterEach(cleanup);

function getCardButton(group: HTMLElement, instanceId: string): HTMLElement {
  return group.querySelector<HTMLElement>(`[data-instance-id="${instanceId}"]`)!;
}

function renderSearch() {
  const onRespond = vi.fn<(response: DecisionResponse) => void>();
  render(
    <I18nProvider>
      <DecisionOverlay
        request={request}
        sourceCardId="EX9-035"
        candidates={revealed.map((card) => ({ ...card, selectable: card.instanceId !== "monodramon" }))}
        picks={[]}
        onTogglePick={() => undefined}
        onRespond={onRespond}
      />
    </I18nProvider>,
  );
  return {
    onRespond,
    hand: screen.getByRole("region", { name: handSlot }),
    under: screen.getByRole("region", { name: underSlot }),
    confirm: screen.getByRole("button", { name: "Confirm targets" }),
  };
}

it("groups the revealed cards by search category and answers every category at once", () => {
  const { onRespond, hand, under, confirm } = renderSearch();
  expect(hand.querySelectorAll("[data-instance-id]")).toHaveLength(2);
  expect(under.querySelectorAll("[data-instance-id]")).toHaveLength(1);
  expect(screen.getByText("Other cards")).toBeTruthy();
  expect(confirm).toHaveProperty("disabled", true);

  fireEvent.click(getCardButton(hand, "reapermon"));
  expect(confirm).toHaveProperty("disabled", true);
  fireEvent.click(getCardButton(under, "palmon"));
  expect(confirm).toHaveProperty("disabled", false);
  fireEvent.click(confirm);

  expect(onRespond).toHaveBeenCalledWith({
    kind: "selectCards",
    instanceIds: ["reapermon"],
    followingSlotInstanceIds: [["palmon"]],
  });
});

it("moves a card that fits two categories to the category picked last", () => {
  const { hand, under, confirm } = renderSearch();
  fireEvent.click(getCardButton(hand, "palmon"));
  expect(getCardButton(hand, "palmon").getAttribute("aria-pressed")).toBe("true");
  expect(confirm).toHaveProperty("disabled", false);

  fireEvent.click(getCardButton(under, "palmon"));
  expect(getCardButton(hand, "palmon").getAttribute("aria-pressed")).toBe("false");
  expect(getCardButton(under, "palmon").getAttribute("aria-pressed")).toBe("true");
  expect(confirm).toHaveProperty("disabled", true);
});
