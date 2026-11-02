// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import type { DecisionRequest } from "@aegis/shared";
import { cleanup, fireEvent, render, screen } from "./scenarioHarness/testingLibrary";
import { DecisionOverlay } from "../src/game/overlay";

afterEach(() => cleanup());

const request: DecisionRequest = {
  decisionId: "st10-04-search",
  seat: 0,
  kind: "selectCards",
  promptText: "Select 1 target",
  sourceCardId: "ST10-04",
  options: {
    candidateInstanceIds: ["yellow-digimon"],
    visibleInstanceIds: ["yellow-digimon", "purple-option"],
    min: 1,
    max: 1,
  },
};

const candidates = [
  { instanceId: "yellow-digimon", cardId: "ST10-05", selectable: true },
  { instanceId: "purple-option", cardId: "ST10-15", selectable: false },
];

it("shows revealed cards that are not eligible as disabled", () => {
  render(
    <DecisionOverlay
      request={request}
      sourceCardId="ST10-04"
      candidates={candidates}
      picks={[]}
      onTogglePick={vi.fn()}
      onRespond={vi.fn()}
    />,
  );

  expect(screen.getByRole("button", { name: /^angewomon/i })).toBeTruthy();
  expect(screen.getByRole("button", { name: /^darkness wave/i }).hasAttribute("disabled")).toBe(true);
});

const orderRequest: DecisionRequest = {
  decisionId: "red-memory-boost-order",
  seat: 0,
  kind: "orderCards",
  promptText: "Choose the card order",
  sourceCardId: "P-035",
  options: {
    candidateInstanceIds: ["first", "second"],
    visibleInstanceIds: ["first", "second"],
    min: 2,
    max: 2,
  },
};

it("lets the player reorder cards before confirming deck bottom", () => {
  const onRespond = vi.fn();
  render(
    <DecisionOverlay
      request={orderRequest}
      sourceCardId="P-035"
      candidates={[
        { instanceId: "first", cardId: "BT1-009", selectable: true },
        { instanceId: "second", cardId: "BT1-010", selectable: true },
      ]}
      picks={[]}
      onTogglePick={vi.fn()}
      onRespond={onRespond}
    />,
  );

  fireEvent.click(screen.getAllByRole("button", { name: /move card down/i })[0]!);
  fireEvent.click(screen.getByRole("button", { name: /confirm order/i }));
  expect(onRespond).toHaveBeenCalledWith({ kind: "orderCards", order: ["second", "first"] });
});

const budgetRequest: DecisionRequest = {
  decisionId: "bt8-106-budget",
  seat: 0,
  kind: "selectCards",
  promptText: "Senbon Dokkān",
  sourceCardId: "BT8-106",
  options: {
    candidateInstanceIds: ["cheap", "expensive"],
    visibleInstanceIds: ["cheap", "expensive"],
    min: 0,
    max: 2,
    maxTotalPlayCost: 15,
  },
};

const budgetCandidates = [
  { instanceId: "cheap", cardId: "BT8-065", selectable: true },
  { instanceId: "expensive", cardId: "BT8-068", selectable: true },
];

it("shows the play-cost total and blocks an over-budget selection", () => {
  render(
    <DecisionOverlay
      request={budgetRequest}
      sourceCardId="BT8-106"
      candidates={budgetCandidates}
      picks={["cheap", "expensive"]}
      onTogglePick={vi.fn()}
      onRespond={vi.fn()}
    />,
  );

  expect(screen.getByText("Play cost: 17 / 15")).toBeTruthy();
  expect(screen.getByRole("button", { name: /confirm targets/i }).hasAttribute("disabled")).toBe(true);
});

it("applies the play-cost budget to battlefield target decisions", () => {
  const targetRequest: DecisionRequest = {
    decisionId: "bt8-070-budget",
    seat: 0,
    kind: "chooseTargets",
    promptText: "BlackWarGreymon",
    sourceCardId: "BT8-070",
    options: {
      candidateInstanceIds: ["digimon", "tamer"],
      min: 0,
      max: 2,
      maxTotalPlayCost: 6,
    },
  };

  render(
    <DecisionOverlay
      request={targetRequest}
      sourceCardId="BT8-070"
      candidates={[
        { instanceId: "digimon", cardId: "BT1-015", selectable: true },
        { instanceId: "tamer", cardId: "BT8-093", selectable: true },
      ]}
      picks={["digimon", "tamer"]}
      onTogglePick={vi.fn()}
      onRespond={vi.fn()}
    />,
  );

  expect(screen.getByText("Play cost: 7 / 6")).toBeTruthy();
  expect(screen.getByRole("button", { name: /confirm targets/i }).hasAttribute("disabled")).toBe(true);
});

it("exposes trigger selection state without confusing it with overlay actions", () => {
  const onRespond = vi.fn();
  const triggerRequest: DecisionRequest = {
    decisionId: "brave-shield-trigger",
    seat: 0,
    kind: "orderTriggers",
    promptText: "Choose the next effect",
    sourceCardId: "BT1-095",
    options: {
      triggerKeys: ["BT1-095/main"],
      triggerCardIds: ["BT1-095"],
    },
  };

  render(
    <DecisionOverlay
      request={triggerRequest}
      sourceCardId="BT1-095"
      candidates={[]}
      picks={[]}
      onTogglePick={vi.fn()}
      onRespond={onRespond}
    />,
  );

  const trigger = screen.getByRole("button", { pressed: false });
  const resolve = screen.getByRole("button", { name: /resolve effect/i });
  expect(resolve.hasAttribute("disabled")).toBe(true);

  fireEvent.click(trigger);

  expect(screen.getByRole("button", { pressed: true })).toBe(trigger);
  expect(resolve.hasAttribute("disabled")).toBe(false);
  fireEvent.click(resolve);
  expect(onRespond).toHaveBeenCalledWith({
    kind: "orderTriggers",
    order: ["BT1-095/main"],
  });
});
