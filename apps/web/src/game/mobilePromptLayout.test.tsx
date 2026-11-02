// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { buildTriggerKey, getCardDefinition, type DecisionRequest, type DecisionResponse } from "@aegis/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import { BoardAlliancePrompt, BoardSelectionRail } from "./BoardDecisionRail";
import { DecisionOverlay } from "./overlay";
import type { DecisionCandidate } from "./overlay/choice/decisionTypes";
import { BattleZones } from "./screen/layout/BattleZones";
import {
  cascadedValue,
  cascadeWinner,
  matchesMediaQuery,
  PHONE_VIEWPORTS,
  type Viewport,
} from "./style/viewportCascade";

/*
 * Long prompts on a phone. jsdom cannot lay anything out, so each case checks the
 * structural guarantees the stylesheet relies on, evaluated for the viewport under
 * test: the list that grows is a scroll container, the panel around it is capped,
 * and the control that answers the prompt sits outside the scroller so
 * no amount of content can push it off screen.
 */

function stubViewport(viewport: Viewport) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: viewport.width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: viewport.height });
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: matchesMediaQuery(query, viewport),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
}

/** The winning value with the rule it came from, so a failure names the rule to fix. */
function explain(element: Element, property: string, viewport: Viewport): string {
  const winner = cascadeWinner(element, property, viewport);
  return winner
    ? `${property}: ${winner.value.replace(/\s+/g, " ")} from ${winner.source}`
    : `${property}: not declared`;
}

function expectCapped(element: Element, viewport: Viewport) {
  expect(explain(element, "max-height", viewport)).toMatch(/^max-height: (?!none )\S.* from /);
}

function expectScrolls(element: Element, axis: "x" | "y", viewport: Viewport) {
  expect(explain(element, `overflow-${axis}`, viewport)).toMatch(/^overflow-[xy]: (auto|scroll) from /);
}

/**
 * The panel is a capped flex column, or a capped grid on short landscape screens: the
 * scroller shrinks into what the header and footer leave. Either `hidden` or `auto` on the panel keeps it inside its cap; the
 * phone sheet picks `auto` so a header and footer that alone outgrow a short
 * landscape screen still scroll instead of clipping.
 */
function expectCappedPanel(panel: HTMLElement, viewport: Viewport) {
  expectCapped(panel, viewport);
  const display = explain(panel, "display", viewport);
  expect(display).toMatch(/^display: (flex|grid) from /);
  if (display.startsWith("display: flex")) {
    expect(explain(panel, "flex-direction", viewport)).toMatch(/^flex-direction: column from /);
  }
  expect(explain(panel, "overflow-y", viewport)).toMatch(/^overflow-y: (hidden|auto) from /);
}

function expectAnswerOutsideScroller({
  panel,
  scroller,
  answer,
  footerSelector,
  viewport,
}: {
  panel: HTMLElement;
  scroller: HTMLElement;
  answer: HTMLElement;
  footerSelector: string;
  viewport: Viewport;
}) {
  expectScrolls(scroller, "y", viewport);
  expect(explain(scroller, "min-height", viewport)).toMatch(/^min-height: 0 from /);
  expect(panel.contains(answer)).toBe(true);
  expect(scroller.contains(answer)).toBe(false);
  const footer = answer.closest<HTMLElement>(footerSelector);
  expect(footer).not.toBeNull();
  // A footer that may shrink is squeezed to nothing by a tall list.
  expect(explain(footer!, "flex", viewport)).toMatch(/^flex: none from /);
}

function renderDecision(
  request: DecisionRequest,
  candidates: DecisionCandidate[] = [],
  onRespond: (response: DecisionResponse) => void = () => {},
) {
  render(
    <I18nProvider>
      <DecisionOverlay
        request={request}
        sourceCardId={request.sourceCardId}
        candidates={candidates}
        picks={[]}
        onTogglePick={() => {}}
        onRespond={onRespond}
      />
    </I18nProvider>,
  );
  return screen.getByRole("dialog");
}

/* EX13 Craniamon blocking into a board with Giromon and two ST Tai Kamiya: the
   player report that opened this plan item had six or more effects pending at once. */
const PENDING_TRIGGER_CARDS = [
  { permanentId: "craniamon", cardId: "EX13-062", effectId: "EX13-062/ir-0", timing: "OpponentsTurn" },
  { permanentId: "craniamon", cardId: "EX13-062", effectId: "EX13-062/ir-1", timing: "OnBlock" },
  { permanentId: "giromon", cardId: "EX13-056", effectId: "EX13-056/ir-0", timing: "OnDeletion" },
  { permanentId: "tai-st1", cardId: "ST1-12", effectId: "ST1-12/ir-0", timing: "OpponentsTurn" },
  { permanentId: "tai-st15", cardId: "ST15-14", effectId: "ST15-14/ir-0", timing: "OpponentsTurn" },
  { permanentId: "giromon-2", cardId: "BT13-071", effectId: "BT13-071/ir-0", timing: "OnDeletion" },
  { permanentId: "craniamon-2", cardId: "BT13-077", effectId: "BT13-077/ir-0", timing: "OpponentsTurn" },
];

function orderTriggersRequest(descriptions: readonly string[]): DecisionRequest {
  const cards = PENDING_TRIGGER_CARDS.slice(0, descriptions.length);
  return {
    decisionId: `order-${descriptions.length}`,
    seat: 0,
    kind: "orderTriggers",
    promptText: "Choose the next pending effect to resolve.",
    options: {
      triggerKeys: cards.map((card) => buildTriggerKey(card.permanentId, card.effectId)),
      triggerCardIds: cards.map((card) => card.cardId),
      triggerTimings: cards.map((card) => card.timing),
      triggerDescriptions: [...descriptions],
    },
  };
}

function normalizeSpace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** The longest bracketed clauses these cards print, each with the card it belongs to. */
function longestPrintedClauses(cardIds: readonly string[], count: number) {
  return [...new Set(cardIds)]
    .flatMap((cardId) =>
      (getCardDefinition(cardId)?.effectText ?? "")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith("["))
        .map((clause) => ({ cardId, clause })),
    )
    .sort((left, right) => right.clause.length - left.clause.length)
    .slice(0, count);
}

function manyCandidates(count: number, zone?: DecisionCandidate["zone"]): DecisionCandidate[] {
  const cardIds = ["EX13-062", "EX13-056", "BT13-071", "BT13-077", "BT3-068", "BT3-075", "BT23-058", "BT26-055"];
  return Array.from({ length: count }, (_, index) => ({
    instanceId: `${zone ?? "card"}-${index}`,
    cardId: cardIds[index % cardIds.length],
    zone,
  }));
}

describe.each(PHONE_VIEWPORTS)("long prompts on a phone at $name", (viewport) => {
  beforeEach(() => stubViewport(viewport));
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("scrolls seven triggers and resolves a late choice while keeping Resolve outside the list", () => {
    const onRespond = vi.fn<(response: DecisionResponse) => void>();
    const request = orderTriggersRequest(PENDING_TRIGGER_CARDS.map(() => ""));
    const panel = renderDecision(request, [], onRespond);
    const list = panel.querySelector<HTMLElement>(".trigger-chooser")!;
    const choices = within(list).getAllByRole("button");
    expect(choices).toHaveLength(7);
    expectCappedPanel(panel, viewport);
    expectAnswerOutsideScroller({
      panel,
      scroller: list,
      answer: within(panel).getByRole("button", { name: /resolve next effect/i }),
      footerSelector: ".trigger-chooser__footer",
      viewport,
    });
    // An option that may shrink is crushed to a sliver instead of making the list scroll.
    for (const option of list.querySelectorAll<HTMLElement>(".trigger-chooser__option")) {
      expect(cascadedValue(option, "flex", viewport)).toBe("none");
    }
    fireEvent.click(choices[6]!);
    expect(choices[6]!.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(panel).getByRole("button", { name: /resolve next effect/i }));
    if (request.kind !== "orderTriggers") throw new Error("expected orderTriggers request");
    const selectedKey = request.options?.triggerKeys?.[6];
    expect(selectedKey).toBeDefined();
    expect(onRespond).toHaveBeenCalledWith({ kind: "orderTriggers", order: [selectedKey] });
  });

  it("shows each long trigger clause whole inside the scrolling list", () => {
    const longClauses = longestPrintedClauses(["EX13-062", "EX13-056", "BT23-058", "BT13-077"], 3);
    expect(longClauses.every(({ clause }) => clause.length > 120)).toBe(true);
    const panel = renderDecision({
      decisionId: "order-long-clauses",
      seat: 0,
      kind: "orderTriggers",
      promptText: "Choose the next pending effect to resolve.",
      options: {
        triggerKeys: longClauses.map(({ cardId }, index) => buildTriggerKey(`permanent-${index}`, `${cardId}/ir-0`)),
        triggerCardIds: longClauses.map(({ cardId }) => cardId),
        triggerDescriptions: longClauses.map(({ clause }) => clause),
      },
    });
    const clauses = [...panel.querySelectorAll<HTMLElement>(".trigger-chooser__effect-text")];
    expect(clauses).toHaveLength(3);
    clauses.forEach((clause, index) => {
      const printed = normalizeSpace(longClauses[index]!.clause.replace(/[[\]＜＞<>]/g, ""));
      expect(normalizeSpace(clause.textContent!.replace(/[[\]＜＞<>]/g, ""))).toContain(printed.slice(-60));
      expect(explain(clause, "max-height", viewport)).toMatch(/^max-height: (none from .*|not declared)$/);
      expect(cascadedValue(clause, "-webkit-line-clamp", viewport)).toBeUndefined();
      expect(cascadedValue(clause, "overflow-y", viewport) ?? "visible").toBe("visible");
    });
    expectAnswerOutsideScroller({
      panel,
      scroller: panel.querySelector<HTMLElement>(".trigger-chooser")!,
      answer: within(panel).getByRole("button", { name: /resolve next effect/i }),
      footerSelector: ".trigger-chooser__footer",
      viewport,
    });
  });

  it("scrolls twelve chooseTargets candidates and keeps Confirm outside them", () => {
    const panel = renderDecision(
      {
        decisionId: "choose-twelve",
        seat: 0,
        kind: "chooseTargets",
        promptText: "Choose 1 of your opponent's Digimon.",
        sourceCardId: "EX13-062",
        options: { min: 1, max: 1, candidateInstanceIds: manyCandidates(12).map((card) => card.instanceId) },
      },
      manyCandidates(12),
    );
    const grid = panel.querySelector<HTMLElement>(".decision-overlay__grid")!;
    expect(grid.querySelectorAll(".decision-overlay__candidate")).toHaveLength(12);
    expect(grid.classList.contains("decision-overlay__grid--scroll")).toBe(true);
    expectScrolls(grid, "x", viewport);
    expectCappedPanel(panel, viewport);
    expectAnswerOutsideScroller({
      panel,
      scroller: panel.querySelector<HTMLElement>(".decision-overlay__selection")!,
      answer: within(panel).getByRole("button", { name: /confirm target/i }),
      footerSelector: ".decision-overlay__footer",
      viewport,
    });
  });

  it("keeps a selectCards prompt over ten revealed cards and a trash inside the sheet", () => {
    const revealed = manyCandidates(10).map((card, index) => ({ ...card, selectable: index % 3 === 0 }));
    const trash = manyCandidates(11, "trash");
    const panel = renderDecision(
      {
        decisionId: "select-revealed",
        seat: 0,
        kind: "selectCards",
        promptText: "Reveal the top 10 cards of your deck. Add 1 card with [Royal Knight] among them to the hand.",
        sourceCardId: "EX13-062",
        options: {
          min: 0,
          max: 1,
          candidateInstanceIds: [...revealed, ...trash]
            .filter((card) => card.selectable !== false)
            .map((card) => card.instanceId),
          visibleInstanceIds: [...revealed, ...trash].map((card) => card.instanceId),
        },
      },
      [...revealed, ...trash],
    );
    const grids = panel.querySelectorAll<HTMLElement>(".decision-overlay__grid");
    expect(grids).toHaveLength(2);
    for (const grid of grids) {
      expect(grid.classList.contains("decision-overlay__grid--scroll")).toBe(true);
      expectScrolls(grid, "x", viewport);
    }
    expect(within(panel).getAllByRole("button", { name: /Craniamon/ }).length).toBeGreaterThan(0);
    expectCappedPanel(panel, viewport);
    const selection = panel.querySelector<HTMLElement>(".decision-overlay__selection")!;
    for (const answer of [
      within(panel).getByRole("button", { name: /confirm target/i }),
      within(panel).getByRole("button", { name: /^none$/i }),
    ]) {
      expectAnswerOutsideScroller({
        panel,
        scroller: selection,
        answer,
        footerSelector: ".decision-overlay__footer",
        viewport,
      });
    }
  });

  it("caps a hand-selection rail with a long clause so End Selection stays reachable", () => {
    const { clause } = longestPrintedClauses(["EX13-062", "EX13-056", "BT23-058", "BT13-077"], 1)[0]!;
    render(
      <I18nProvider>
        <BoardSelectionRail
          sourceCardId="EX13-062"
          prompt="Select up to 10 cards to trash."
          clause={clause}
          min={0}
          max={10}
          pickCount={0}
          canConfirm={false}
          onConfirm={() => {}}
          onNoSelection={() => {}}
        />
      </I18nProvider>,
    );
    const rail = screen.getByTestId("board-prompt");
    expect(within(rail).getByText(clause)).toBeTruthy();
    fireEvent.click(within(rail).getByRole("button", { name: "Hide effect" }));
    expect(within(rail).queryByText(clause)).toBeNull();
    fireEvent.click(within(rail).getByRole("button", { name: "View effect" }));
    expect(within(rail).getByText(clause)).toBeTruthy();
    const endSelection = within(rail).getByRole("button", { name: /end selection/i });
    expect(endSelection.closest(".board-prompt__actions")).not.toBeNull();
    expectScrolls(rail, "y", viewport);
    expectCapped(rail, viewport);
  });

  it("Discord 1557581905220730932: reserves the physical hand after all corner and phone overrides", () => {
    render(
      <I18nProvider>
        <BoardSelectionRail
          sourceCardId="BT20-091"
          prompt="Select 1 card from your hand."
          min={0}
          max={1}
          pickCount={0}
          canConfirm={false}
          onConfirm={() => {}}
          onNoSelection={() => {}}
        />
      </I18nProvider>,
    );
    const rail = screen.getByTestId("board-prompt");
    expect(explain(rail, "bottom", viewport)).toContain("--decision-hand-clearance");
    expect(explain(rail, "max-height", viewport)).toContain("--decision-hand-clearance");
    expectScrolls(rail, "y", viewport);
  });

  it("keeps Pass reachable beside an alliance with five eligible allies", () => {
    render(
      <I18nProvider>
        <BattleZones>
          <div data-testid="opponent-row" />
          <div data-testid="memory-band" />
          <div data-testid="viewer-row">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} data-testid="ally" />
            ))}
          </div>
        </BattleZones>
        <BoardAlliancePrompt attackerCardId="EX13-062" onPass={() => {}} />
      </I18nProvider>,
    );
    const rail = screen.getByTestId("board-prompt");
    const pass = within(rail).getByRole("button", { name: /pass/i });
    expect(pass.closest(".board-prompt__actions")).not.toBeNull();
    // The rail is the only scroller: its own actions ride inside it, so a capped rail
    // that did not scroll would clip the one control that declines the alliance.
    expectScrolls(rail, "y", viewport);
    expectCapped(rail, viewport);
    // Five allies outgrow a phone row, so the row pans sideways instead of clipping them.
    const viewerRow = screen.getByTestId("viewer-row");
    expectScrolls(viewerRow, "x", viewport);
  });
});
