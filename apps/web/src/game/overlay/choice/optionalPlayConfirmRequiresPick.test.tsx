// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { DecisionRequest, DecisionResponse } from "@aegis/shared";
import { I18nProvider } from "../../../i18n";
import { DecisionOverlay } from "./DecisionOverlay";

const trash = [
  { instanceId: "kotemon", cardId: "EX13-048", selectable: true },
  { instanceId: "monitamon", cardId: "BT19-055", selectable: true },
  { instanceId: "deadlyAxemon", cardId: "EX10-027", selectable: true },
  { instanceId: "skullKnightmon", cardId: "EX10-026", selectable: true },
  { instanceId: "darkKnightmon", cardId: "BT19-063", selectable: false },
  { instanceId: "lordKnightmon", cardId: "EX13-064", selectable: false },
];

const request: DecisionRequest = {
  decisionId: "dark-knightmon-on-deletion",
  seat: 1,
  kind: "selectCards",
  promptText: "DarkKnightmon",
  sourceCardId: "BT19-063",
  options: {
    candidateInstanceIds: trash.filter((card) => card.selectable).map((card) => card.instanceId),
    visibleInstanceIds: trash.map((card) => card.instanceId),
    visibleCards: trash.map(({ instanceId, cardId }) => ({ instanceId, cardId })),
    min: 0,
    max: 1,
    timing: "OnDeletion",
    isInherited: true,
    purpose: "acceptedOptional",
    effectText:
      "[On Deletion] You may play 1 level 4 or lower Digimon card with [Knightmon] in its text from your trash without paying the cost.",
  },
};

afterEach(cleanup);

function Gallery({ onRespond }: { onRespond: (response: DecisionResponse) => void }) {
  const [picks, setPicks] = useState<string[]>([]);
  return (
    <I18nProvider>
      <DecisionOverlay
        request={request}
        sourceCardId="BT19-063"
        candidates={trash.map((card) => ({ ...card, zone: "trash" as const }))}
        picks={picks}
        onTogglePick={(instanceId) => setPicks((current) => (current.includes(instanceId) ? [] : [instanceId]))}
        onRespond={onRespond}
      />
    </I18nProvider>
  );
}

it("keeps Confirm disabled until a card is picked when an optional play has candidates", () => {
  const onRespond = vi.fn<(response: DecisionResponse) => void>();
  render(<Gallery onRespond={onRespond} />);
  const confirm = screen.getByRole("button", { name: "Confirm targets" });

  expect(confirm.hasAttribute("disabled")).toBe(true);
  fireEvent.click(confirm);
  expect(onRespond).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: /^SkullKnightmon/ }));
  expect(confirm.hasAttribute("disabled")).toBe(false);
  fireEvent.click(confirm);
  expect(onRespond).toHaveBeenCalledWith({ kind: "selectCards", instanceIds: ["skullKnightmon"] });
});

it("still answers an optional play with no card through None", () => {
  const onRespond = vi.fn<(response: DecisionResponse) => void>();
  render(<Gallery onRespond={onRespond} />);

  fireEvent.click(screen.getByRole("button", { name: "None" }));
  expect(onRespond).toHaveBeenCalledWith({ kind: "selectCards", instanceIds: [] });
});
