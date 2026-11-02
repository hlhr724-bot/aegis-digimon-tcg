import type { DecisionResponse } from "@aegis/shared/protocol/intents";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { DecisionRequest } from "@aegis/shared/protocol/events";
import { I18nProvider } from "@/i18n/I18nProvider";
import { DecisionOverlay } from "@/game/overlay/choice/DecisionOverlay";

afterEach(cleanup);

function renderTargetDecision(canCancelActivation = true) {
  const onRespond = vi.fn<(response: DecisionResponse) => void>();
  const request: DecisionRequest = {
    decisionId: "uncommitted-targets",
    seat: 0,
    kind: "chooseTargets",
    promptText: "Select two Digimon",
    options: { min: 2, max: 2, candidateInstanceIds: ["first", "second"], canCancelActivation },
  };
  render(
    <I18nProvider>
      <DecisionOverlay
        request={request}
        sourceCardId="ST1-03"
        candidates={[
          { instanceId: "first", cardId: "ST1-03", zone: "opponentBattle" },
          { instanceId: "second", cardId: "ST1-03", zone: "opponentBattle" },
        ]}
        picks={["first"]}
        onTogglePick={() => {}}
        onRespond={onRespond}
      />
    </I18nProvider>,
  );
  return onRespond;
}

it("offers explicit cancellation while preserving mandatory target confirmation", () => {
  const onRespond = renderTargetDecision();
  expect(screen.getByRole("button", { name: "Confirm targets" }).hasAttribute("disabled")).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Cancel effect" }));
  expect(onRespond).toHaveBeenCalledWith({ kind: "chooseTargets", instanceIds: [] });
});

it("does not offer cancellation without the server capability", () => {
  renderTargetDecision(false);
  expect(screen.queryByRole("button", { name: "Cancel effect" })).toBeNull();
  expect(screen.queryByRole("button", { name: "None" })).toBeNull();
});
