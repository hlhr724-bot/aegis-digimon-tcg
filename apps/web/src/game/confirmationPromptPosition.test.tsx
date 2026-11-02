// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { DecisionRequest } from "@aegis/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/I18nProvider";
import { setEffectPromptPosition } from "@/game/effectPromptPosition";
import { BoardOptionalPrompt } from "@/game/BoardDecisionRail";
import { DecisionOverlay } from "@/game/overlay/choice/DecisionOverlay";
import { ActionConfirmationOverlay } from "@/game/overlay/choice/ActionConfirmationOverlay";
import { KeywordSavePrompt } from "@/game/overlay/combat/KeywordSavePrompt";
import { BlockOverlay } from "@/game/overlay/combat/BlockOverlay";
import type { DecisionCandidate } from "@/game/overlay/choice/decisionTypes";

beforeEach(() => {
  localStorage.setItem("aegis.locale", "en");
  setEffectPromptPosition("left");
});
afterEach(() => {
  cleanup();
  setEffectPromptPosition("left");
});

function renderWithI18n(node: ReactNode) {
  return render(<I18nProvider>{node}</I18nProvider>);
}

function renderDecision(request: DecisionRequest, candidates: DecisionCandidate[] = []) {
  renderWithI18n(
    <DecisionOverlay
      request={request}
      sourceCardId={request.sourceCardId}
      candidates={candidates}
      picks={[]}
      onTogglePick={vi.fn<() => void>()}
      onRespond={vi.fn<() => void>()}
    />,
  );
  return screen.getByRole("dialog");
}

const securityChoice: DecisionRequest = {
  decisionId: "security-choice",
  seat: 0,
  kind: "selectCards",
  promptText: "Choose a security stack.",
  options: { candidateInstanceIds: ["mine"], min: 1, max: 1 },
};

const emphasizedOptional: DecisionRequest = {
  decisionId: "emphasized-optional",
  seat: 0,
  kind: "optional",
  sourceCardId: "P-187",
  promptText: "Use this effect?",
  options: {
    timing: "WhenDigivolving",
    effectText: "[When Digivolving] By trashing your top security card, you may play 1 Digimon card.",
    effectTextEmphasis: "By trashing your top security card",
  },
};

const costConfirmation: DecisionRequest = {
  decisionId: "cost-confirmation",
  seat: 0,
  kind: "optional",
  promptText: "Pay the cost?",
  options: { purpose: "cost" },
};

const digivolveCostChoice: DecisionRequest = {
  decisionId: "digivolve-cost-choice",
  seat: 0,
  kind: "chooseOption",
  promptText: "WereGarurumon",
  sourceCardId: "EX12-032",
  options: {
    choices: ["Printed digivolution requirement (cost 4)", "Alternate digivolution requirement (cost 3)"],
    digivolveCostChoice: { fromCardId: "EX12-032", intoCardId: "EX12-035", costs: [4, 3], costDelta: -2 },
  },
};

describe("confirmation prompts follow the effect prompt position", () => {
  it.each(["left", "center"] as const)("places a security stack choice at the chosen %s position", (position) => {
    setEffectPromptPosition(position);
    const dialog = renderDecision(securityChoice, [{ instanceId: "mine", selectable: true }]);
    expect(dialog.classList.contains("decision-overlay--security-choice")).toBe(true);
    expect(dialog.dataset.promptSurface).toBe(position);
  });

  it.each(["left", "center"] as const)(
    "places an optional effect with an emphasized step at the chosen %s position",
    (position) => {
      setEffectPromptPosition(position);
      expect(renderDecision(emphasizedOptional).dataset.promptSurface).toBe(position);
    },
  );

  it.each(["left", "center"] as const)("places a cost confirmation dialog at the chosen %s position", (position) => {
    setEffectPromptPosition(position);
    expect(renderDecision(costConfirmation).dataset.promptSurface).toBe(position);
  });

  it.each(["left", "center"] as const)("places a digivolution cost choice at the chosen %s position", (position) => {
    setEffectPromptPosition(position);
    const dialog = renderDecision(digivolveCostChoice);
    expect(dialog.dataset.promptSurface).toBe(position);
    expect(dialog.classList.contains("decision-overlay--side")).toBe(position === "left");
  });

  it.each(["left", "center"] as const)("places a board yes/no prompt at the chosen %s position", (position) => {
    setEffectPromptPosition(position);
    renderWithI18n(<BoardOptionalPrompt onUse={vi.fn<() => void>()} onDecline={vi.fn<() => void>()} />);
    expect(screen.getByTestId("board-prompt").dataset.promptSurface).toBe(position);
  });

  it.each(["left", "center"] as const)("places a keyword save prompt at the chosen %s position", (position) => {
    setEffectPromptPosition(position);
    renderWithI18n(
      <KeywordSavePrompt
        keyword="Evade"
        rulesText="When this Digimon would be deleted, you may suspend it to prevent that deletion."
        onAccept={vi.fn<() => void>()}
        onDecline={vi.fn<() => void>()}
      />,
    );
    expect(screen.getByTestId("board-prompt").dataset.promptSurface).toBe(position);
  });

  it.each(["left", "center"] as const)("places an action confirmation at the chosen %s position", (position) => {
    setEffectPromptPosition(position);
    renderWithI18n(
      <ActionConfirmationOverlay
        cardId="BT1-010"
        title="Play this card?"
        detail="Pay 3 memory."
        confirmLabel="Play"
        onConfirm={vi.fn<() => void>()}
        onCancel={vi.fn<() => void>()}
      />,
    );
    expect(screen.getByRole("dialog").dataset.promptSurface).toBe(position);
  });

  it.each(["left", "center"] as const)("places an empty block window at the chosen %s position", (position) => {
    setEffectPromptPosition(position);
    renderWithI18n(<BlockOverlay blockers={[]} onBlock={vi.fn<() => void>()} onDecline={vi.fn<() => void>()} />);
    expect(screen.getByRole("dialog").dataset.promptSurface).toBe(position);
  });

  it("keeps the blocker gallery centered when the left position is chosen", () => {
    renderWithI18n(
      <BlockOverlay
        blockers={[{ permanentId: "blocker", cardId: "BT1-010", currentDP: 3000, sourceCount: 0 }]}
        onBlock={vi.fn<() => void>()}
        onDecline={vi.fn<() => void>()}
      />,
    );
    expect(screen.getByRole("dialog").dataset.promptSurface).toBe("center");
  });

  it("keeps a card gallery centered when the left position is chosen", () => {
    const dialog = renderDecision(
      {
        decisionId: "trash-gallery",
        seat: 0,
        kind: "selectCards",
        promptText: "Select 1 card to trash.",
        options: { candidateInstanceIds: ["card-1", "card-2"], min: 1, max: 1 },
      },
      [
        { instanceId: "card-1", cardId: "BT1-010", selectable: true },
        { instanceId: "card-2", cardId: "BT1-011", selectable: true },
      ],
    );
    expect(dialog.dataset.promptSurface).toBe("center");
  });
});
