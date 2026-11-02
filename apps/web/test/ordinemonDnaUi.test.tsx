// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import type { DecisionRequest } from "@aegis/shared";
import { cleanup, fireEvent, render, screen, within } from "./scenarioHarness/testingLibrary";
import { ActionConfirmationOverlay, DecisionOverlay } from "../src/game/overlay";

afterEach(() => cleanup());

it("offers both normal and DNA digivolution when Ordinemon can use either route", () => {
  const onConfirm = vi.fn();
  const onAlternate = vi.fn();
  const onCancel = vi.fn();

  render(
    <ActionConfirmationOverlay
      cardId="BT9-082"
      title="DNA Digivolution available"
      detail="Two Ophanimon Falldown Mode satisfy Ordinemon's DNA requirements."
      confirmLabel="DNA Digivolve"
      alternateLabel="Digivolve normally"
      onConfirm={onConfirm}
      onAlternate={onAlternate}
      onCancel={onCancel}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: /digivolve normally/i }));
  expect(onAlternate).toHaveBeenCalledOnce();
  expect(onConfirm).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: /^dna digivolve$/i }));
  expect(onConfirm).toHaveBeenCalledOnce();
});

it("keeps two identical Ophanimon candidates distinguishable by permanent id", () => {
  const onRespond = vi.fn();
  const request: DecisionRequest = {
    decisionId: "st10-04-partner",
    seat: 0,
    kind: "chooseTargets",
    promptText: "Gatomon",
    sourceCardId: "ST10-04",
    options: {
      candidateInstanceIds: ["host-permanent", "partner-permanent"],
      min: 1,
      max: 1,
      timing: "EndOfYourTurn",
    },
  };

  render(
    <DecisionOverlay
      request={request}
      sourceCardId="ST10-04"
      candidates={[
        { instanceId: "host-permanent", cardId: "BT8-082", selectable: true },
        { instanceId: "partner-permanent", cardId: "BT8-082", selectable: true },
      ]}
      picks={["partner-permanent"]}
      onTogglePick={vi.fn()}
      onRespond={onRespond}
    />,
  );

  expect(screen.getAllByRole("button", { name: /^ophanimon falldown mode, copy/i })).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: /confirm target/i }));
  expect(onRespond).toHaveBeenCalledWith({
    kind: "chooseTargets",
    instanceIds: ["partner-permanent"],
  });
});

it("renders Gatomon's inherited end-of-turn activation as an actionable decision", () => {
  const onRespond = vi.fn();
  const request: DecisionRequest = {
    decisionId: "st10-04-inherited",
    seat: 0,
    kind: "optional",
    promptText: "Gatomon",
    sourceCardId: "ST10-04",
    options: { timing: "EndOfYourTurn" },
  };

  render(
    <DecisionOverlay
      request={request}
      sourceCardId="ST10-04"
      candidates={[]}
      picks={[]}
      onTogglePick={vi.fn()}
      onRespond={onRespond}
    />,
  );

  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByText(/dna digivolve this digimon/i)).toBeTruthy();
  fireEvent.click(within(dialog).getByRole("button", { name: /yes, activate/i }));
  expect(onRespond).toHaveBeenCalledWith({ kind: "optional", accept: true });
});
