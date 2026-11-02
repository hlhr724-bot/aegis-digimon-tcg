// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { DecisionRequest, DecisionResponse } from "@aegis/shared";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import { decisionVisibleCards } from "./decisionModel";
import { DecisionOverlay } from "./overlay";

afterEach(cleanup);

it.each(["BT13-033", "EX10-059"])(
  "keeps %s concealed hand choices independent of remembered identities",
  (sourceCardId) => {
    const ids = Array.from({ length: 10 }, (_, i) => `opponent-hand-${i}`);
    const request: DecisionRequest = {
      decisionId: "mirage-hidden-hand",
      seat: 0,
      kind: "selectCards",
      sourceCardId,
      promptText: "Choose without looking",
      options: { candidateInstanceIds: ids, visibleInstanceIds: [], visibleCards: [], min: 2, max: 2 },
    };
    const onRespond = vi.fn<(response: DecisionResponse) => void>();
    const remembered = new Map(ids.map((id) => [id, "BT1-010"]));
    function Prompt() {
      const [picks, setPicks] = useState<string[]>([]);
      return (
        <I18nProvider>
          <DecisionOverlay
            request={request}
            sourceCardId={request.sourceCardId}
            candidates={decisionVisibleCards(request.options, remembered)}
            picks={picks}
            onTogglePick={(id) => setPicks((old) => (old.includes(id) ? old.filter((p) => p !== id) : [...old, id]))}
            onRespond={onRespond}
          />
        </I18nProvider>
      );
    }
    const { container } = render(<Prompt />);
    const tiles = container.querySelectorAll<HTMLButtonElement>(".decision-overlay__candidate");
    expect(tiles).toHaveLength(10);
    expect(container.querySelector('img[src*="BT1-010"]')).toBeNull();
    fireEvent.click(tiles[7]!);
    fireEvent.click(tiles[2]!);
    fireEvent.click(screen.getByRole("button", { name: "Confirm targets" }));
    expect(onRespond).toHaveBeenCalledWith({ kind: "selectCards", instanceIds: [ids[7], ids[2]] });
  },
);

it("keeps revealed nonselectable inspection cards and concealed selectable candidates together", () => {
  expect(
    decisionVisibleCards(
      {
        candidateInstanceIds: ["hidden"],
        visibleInstanceIds: ["inspection"],
        visibleCards: [{ instanceId: "inspection", cardId: "BT1-009" }],
      },
      new Map([["hidden", "BT1-010"]]),
    ),
  ).toEqual([
    { instanceId: "inspection", cardId: "BT1-009" },
    { instanceId: "hidden", cardId: undefined },
  ]);
});

it("lets the activator reorder concealed cards after the owner's private inspection", () => {
  const request: DecisionRequest = {
    decisionId: "mirage-order",
    seat: 0,
    kind: "orderCards",
    promptText: "Choose the card order",
    sourceCardId: "BT13-033",
    options: { candidateInstanceIds: ["first", "second"], visibleInstanceIds: [], orderDestination: "deckBottom" },
  };
  const onRespond = vi.fn<(response: DecisionResponse) => void>();
  const { container } = render(
    <I18nProvider>
      <DecisionOverlay
        request={request}
        candidates={decisionVisibleCards(request.options, new Map([["first", "BT1-010"]]))}
        picks={[]}
        onTogglePick={vi.fn<(instanceId: string) => void>()}
        onRespond={onRespond}
      />
    </I18nProvider>,
  );
  expect(container.querySelectorAll(".decision-overlay__order-row")).toHaveLength(2);
  expect(container.querySelector('img[src*="BT1-010"]')).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Move card down, Card, 1" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm order" }));
  expect(onRespond).toHaveBeenCalledWith({ kind: "orderCards", order: ["second", "first"] });
});
