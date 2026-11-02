// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DECISION_KINDS, type DecisionKind, type DecisionRequest, type DecisionResponse } from "@aegis/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import { DecisionOverlay } from "./overlay";
import type { DecisionCandidate } from "./overlay/choice/decisionTypes";
import { decisionAllowsPick } from "./screen/model/decisionPicks";

afterEach(() => cleanup());

const GAME_DIR = dirname(fileURLToPath(import.meta.url));

type DecisionOptionKey = keyof NonNullable<DecisionRequest["options"]>;

/**
 * The web module that reads each option the engine can send. A new option added to
 * `DecisionRequest.options` fails typecheck here until someone names its consumer, so the
 * engine cannot ship a constraint the UI silently ignores (as `maxTotalDP` once was).
 * `null` marks an option no UI reads, with the reason beside it.
 */
const OPTION_CONSUMERS: Record<DecisionOptionKey, string | null> = {
  canCancelActivation: "overlay/choice/DecisionOverlay.tsx",
  singleHandCostBenefit: null,
  selectionGoal: null,
  effectControllerSeat: null,
  effectSummary: null,
  choiceSummaries: null,
  triggerSummaries: null,
  triggerControllerSeats: null,
  candidateInstanceIds: "screen/model/decisionView.ts",
  visibleInstanceIds: "decisionModel.ts",
  visibleCards: "decisionModel.ts",
  pendingEffectInstanceIds: "decisionModel.ts",
  min: "decisionPresentation.ts",
  max: "overlay/choice/DecisionOverlay.tsx",
  maxTotalPlayCost: "screen/model/decisionView.ts",
  maxTotalDP: "screen/model/decisionView.ts",
  differentColors: "screen/model/decisionView.ts",
  distinctCardIds: "screen/model/decisionView.ts",
  distinctNames: "screen/model/decisionView.ts",
  allowedTargetCombinations: "screen/model/decisionView.ts",
  selectionContext: "trackingArrow.ts",
  orderDestination: "overlay/choice/DecisionOverlay.tsx",
  choices: "overlay/choice/DecisionOverlay.tsx",
  topBottomZone: "overlay/choice/DecisionOverlay.tsx",
  digivolveCostChoice: "overlay/choice/DecisionOverlay.tsx",
  choiceEffects: "overlay/choice/DecisionOverlay.tsx",
  choiceClauses: "overlay/choice/DecisionOverlay.tsx",
  declineIndex: "overlay/choice/DecisionOverlay.tsx",
  activation: "overlay/choice/DecisionOverlay.tsx",
  triggerKeys: "screen/model/triggerDetails.ts",
  triggerCardIds: "screen/model/triggerDetails.ts",
  triggerTimings: "screen/model/triggerDetails.ts",
  triggerDescriptions: "screen/model/triggerDetails.ts",
  triggerReasons: "overlay/choice/DecisionOverlay.tsx",
  triggerIsInherited: "screen/model/triggerDetails.ts",
  triggerIsOptional: "overlay/choice/DecisionOverlay.tsx",
  waitingTriggerCardIds: "overlay/choice/DecisionOverlay.tsx",
  waitingTriggerDescriptions: "overlay/choice/DecisionOverlay.tsx",
  waitingTriggerIsInherited: "overlay/choice/DecisionOverlay.tsx",
  acceptsIndexedResolutionPlan: "overlay/choice/DecisionOverlay.tsx",
  acceptsResolutionPlan: "overlay/choice/DecisionOverlay.tsx",
  timing: "screen/model/triggerDetails.ts",
  effectText: "notices.ts",
  effectTextPart: "notices.ts",
  effectTextEmphasis: "overlay/choice/DecisionOverlay.tsx",
  effectTextCardId: "overlay/choice/DecisionOverlay.tsx",
  // Diagnostic provenance identifies initial consent separately from later choices. It
  // changes no pick constraint; the engine publishes accepted activation for the UI.
  effectKey: null,
  activationConfirmation: null,
  isInherited: "screen/layout/DecisionPrompts.tsx",
  targetFate: "pendingFate.ts",
  affectedPermanentIds: "pendingFate.ts",
  promptKey: "overlay/choice/DecisionOverlay.tsx",
  // Tells an automated seat that an empty selection forfeits the clause; the human UI
  // already offers the same No Selection answer for every min-0 prompt.
  purpose: "decisionPresentation.ts",
  declinesCost: "overlay/choice/DecisionOverlay.tsx",
  assemblyCardId: "screen/layout/DecisionPrompts.tsx",
  playCostReductionBlocked: "screen/layout/DecisionPrompts.tsx",
  digiXrosCardId: "screen/layout/DecisionPrompts.tsx",
  digiXrosMaterialLimits: "screen/layout/DecisionPrompts.tsx",
  digiXrosRuleTrashInstanceIds: "decisionModel.ts",
};

describe("engine to UI decision contract", () => {
  it.each([true, false])(
    "keeps activation provenance private while an optional prompt remains answerable (%s)",
    (activationConfirmation) => {
      const onRespond = vi.fn<(response: DecisionResponse) => void>();
      render(
        <I18nProvider>
          <DecisionOverlay
            request={{
              decisionId: "consent",
              seat: 0,
              kind: "optional",
              promptText: "Use this effect?",
              options: { effectKey: "private/effect-identity", activationConfirmation },
            }}
            candidates={[]}
            picks={[]}
            onTogglePick={vi.fn<(instanceId: string) => void>()}
            onRespond={onRespond}
          />
        </I18nProvider>,
      );
      expect(screen.queryByText("private/effect-identity")).toBeNull();
      const accept = screen.getByRole("button", { name: /^Yes, activate$/ });
      const decline = screen.getByRole("button", { name: /^No, decline$/ });
      expect((accept as HTMLButtonElement).disabled).toBe(false);
      expect((decline as HTMLButtonElement).disabled).toBe(false);
      fireEvent.click(accept);
      expect(onRespond).toHaveBeenCalledWith({ kind: "optional", accept: true });
      fireEvent.click(decline);
      expect(onRespond).toHaveBeenCalledWith({ kind: "optional", accept: false });
    },
  );

  for (const [key, consumer] of Object.entries(OPTION_CONSUMERS)) {
    if (consumer === null) continue;
    it(`reads options.${key} in ${consumer}`, () => {
      const source = readFileSync(join(GAME_DIR, consumer), "utf8");
      expect(source).toMatch(new RegExp(`\\b${key}\\b`));
    });
  }

  const minimalRequests: Record<Exclude<DecisionKind, "mulligan">, DecisionRequest> = {
    optional: { decisionId: "optional", seat: 0, kind: "optional", promptText: "Use this effect?" },
    chooseTargets: {
      decisionId: "targets",
      seat: 0,
      kind: "chooseTargets",
      promptText: "Choose 1.",
      options: { candidateInstanceIds: ["a"], min: 1, max: 1 },
    },
    selectCards: {
      decisionId: "cards",
      seat: 0,
      kind: "selectCards",
      promptText: "Select 1.",
      options: { candidateInstanceIds: ["a"], min: 1, max: 1 },
    },
    orderCards: {
      decisionId: "order",
      seat: 0,
      kind: "orderCards",
      promptText: "Order the cards.",
      options: { candidateInstanceIds: ["a", "b"], orderDestination: "deckTop" },
    },
    orderTriggers: {
      decisionId: "triggers",
      seat: 0,
      kind: "orderTriggers",
      promptText: "Choose the next effect.",
      options: { triggerKeys: ["first", "second"], triggerCardIds: ["BT1-001", "BT1-001"] },
    },
    chooseOption: {
      decisionId: "option",
      seat: 0,
      kind: "chooseOption",
      promptText: "Choose one.",
      options: { choices: ["First", "Second"] },
    },
  };

  it.each(Object.values(minimalRequests))("renders an answerable $kind prompt", (request) => {
    const candidates: DecisionCandidate[] = (request.options?.candidateInstanceIds ?? []).map((instanceId) => ({
      instanceId,
      cardId: "BT1-001",
    }));
    render(
      <I18nProvider>
        <DecisionOverlay
          request={request}
          candidates={candidates}
          picks={request.kind === "chooseTargets" || request.kind === "selectCards" ? ["a"] : []}
          onTogglePick={vi.fn<(instanceId: string) => void>()}
          onRespond={vi.fn<(response: DecisionResponse) => void>()}
        />
      </I18nProvider>,
    );
    const surface = ["chooseTargets", "selectCards", "orderCards", "orderTriggers"].includes(request.kind)
      ? "center"
      : "left";
    expect(screen.getByRole("dialog").getAttribute("data-prompt-surface")).toBe(surface);
    const enabled = screen.getAllByRole("button").filter((button) => !(button as HTMLButtonElement).disabled);
    expect(enabled.length).toBeGreaterThan(0);
  });

  it("covers every decision kind with an answerable surface", () => {
    const covered = new Set<DecisionKind>([...Object.keys(minimalRequests), "mulligan"] as DecisionKind[]);
    expect([...DECISION_KINDS].filter((kind) => !covered.has(kind))).toEqual([]);
  });
});

describe("summed DP budget (maxTotalDP)", () => {
  const request: DecisionRequest = {
    decisionId: "dp-budget",
    seat: 0,
    kind: "chooseTargets",
    promptText: "Delete Digimon with 6000 total DP or less.",
    options: { candidateInstanceIds: ["small", "large"], min: 1, max: 2, maxTotalDP: 6000 },
  };
  const candidates: DecisionCandidate[] = [
    { instanceId: "small", cardId: "EX3-039", currentDP: 4000 },
    { instanceId: "large", cardId: "EX1-073", currentDP: 5000 },
  ];

  it("shows the budget and blocks a dialog pick that would exceed it", () => {
    const onTogglePick = vi.fn<(instanceId: string) => void>();
    render(
      <I18nProvider>
        <DecisionOverlay
          request={request}
          candidates={candidates}
          picks={["small"]}
          onTogglePick={onTogglePick}
          onRespond={vi.fn<(response: DecisionResponse) => void>()}
        />
      </I18nProvider>,
    );
    expect(screen.getByText("Total DP: 4,000 / 6,000")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /5,000 DP/ }));
    expect(onTogglePick).not.toHaveBeenCalled();
  });

  it("blocks a board pick that would exceed it and keeps deselection possible", () => {
    const allows = (instanceId: string, picks: string[]) =>
      decisionAllowsPick({
        instanceId,
        picks,
        decisionSelectable: new Set(["small", "large"]),
        decisionInstanceColors: new Map(),
        decisionDifferentColors: false,
        decisionVisibleCardIds: new Map(),
        decisionDistinctCardIds: false,
        decisionMaxTotalDP: 6000,
        decisionCandidateDP: new Map([
          ["small", 4000],
          ["large", 5000],
        ]),
      });
    expect(allows("large", ["small"])).toBe(false);
    expect(allows("large", [])).toBe(true);
    expect(allows("small", ["small"])).toBe(true);
  });
});

// Discord 1556322403456520223 / 1556323133361750088: the board must enforce
// the same aggregate play-cost constraint as the target-selection dialog.
describe("Hades Force board target budget", () => {
  const cardIds = new Map([
    ["hexeblau", "EX7-023"],
    ["thomas", "BT4-093"],
    ["gaomon", "EX4-015"],
  ]);
  const allows = (instanceId: string, picks: string[]) =>
    decisionAllowsPick({
      instanceId,
      picks,
      decisionSelectable: new Set(cardIds.keys()),
      decisionInstanceColors: new Map(),
      decisionDifferentColors: false,
      decisionVisibleCardIds: cardIds,
      decisionDistinctCardIds: false,
      decisionMaxTotalPlayCost: 12,
    });

  it("only enables targets that fit the remaining budget and always permits deselection", () => {
    expect(allows("hexeblau", [])).toBe(true);
    expect(allows("hexeblau", ["thomas"])).toBe(false);
    expect(allows("thomas", ["hexeblau"])).toBe(false);
    expect(allows("gaomon", ["hexeblau"])).toBe(false);
    expect(allows("gaomon", ["thomas"])).toBe(true);
    expect(allows("hexeblau", ["hexeblau"])).toBe(true);
    expect(allows("thomas", ["thomas", "gaomon"])).toBe(true);
    expect(allows("hexeblau", [])).toBe(true);
  });
});

it("keeps the Hades Force budget visible and lets a central pick be deselected", () => {
  const onTogglePick = vi.fn<(instanceId: string) => void>();
  const candidates: DecisionCandidate[] = [
    { instanceId: "hexeblau", cardId: "EX7-023" },
    { instanceId: "thomas", cardId: "BT4-093" },
    { instanceId: "gaomon", cardId: "EX4-015" },
  ];
  render(
    <I18nProvider>
      <DecisionOverlay
        request={{
          decisionId: "hades-budget",
          seat: 0,
          kind: "chooseTargets",
          promptText: "Delete Digimon and Tamers with a combined play cost of 12 or less.",
          options: {
            candidateInstanceIds: candidates.map((candidate) => candidate.instanceId),
            min: 0,
            max: 3,
            maxTotalPlayCost: 12,
          },
        }}
        candidates={candidates}
        picks={["hexeblau"]}
        onTogglePick={onTogglePick}
        onRespond={vi.fn<(response: DecisionResponse) => void>()}
      />
    </I18nProvider>,
  );
  expect(screen.getByRole("dialog").getAttribute("data-prompt-surface")).toBe("center");
  expect(screen.getByText("Play cost: 12 / 12")).toBeTruthy();
  const blocked = screen.getByRole("button", { name: /^Thomas H/ }) as HTMLButtonElement;
  expect(blocked.disabled).toBe(true);
  fireEvent.click(blocked);
  expect(onTogglePick).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /Hexeblaumon.*selected/ }));
  expect(onTogglePick).toHaveBeenCalledExactlyOnceWith("hexeblau");
});
