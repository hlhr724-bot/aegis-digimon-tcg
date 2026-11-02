export function getPanelScoringWindow({ window, activationMemoryCosts, decisionContext = true }) {
  if (activationMemoryCosts && decisionContext) {
    return window;
  }
  let scoring = window;
  if (!activationMemoryCosts && window.kind === "main") {
    scoring = {
      ...scoring,
      actions: window.actions.map((action) => {
        if (action.intent.type !== "activateEffect") {
          return action;
        }
        const historical = { ...action };
        delete historical.activationMemoryCost;
        delete historical.projectedCost;
        return historical;
      }),
    };
  }
  if (!decisionContext && window.request?.options !== undefined) {
    const options = { ...window.request.options };
    for (const key of [
      "singleHandCostBenefit",
      "selectionGoal",
      "effectControllerSeat",
      "effectSummary",
      "choiceSummaries",
      "triggerSummaries",
      "triggerControllerSeats",
    ]) {
      delete options[key];
    }
    scoring = { ...scoring, request: { ...window.request, options } };
  }
  return scoring;
}
