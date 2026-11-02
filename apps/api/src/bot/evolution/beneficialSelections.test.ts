import { describe, expect, it } from "vitest";
import type { DecisionRequest } from "@aegis/shared/protocol/events";
import type { Seat } from "@aegis/shared/schema/enums";
import { getCardDefinition } from "@aegis/shared/cards/registry";
import { setupScenario } from "#api/engine/testkit/scenario";
import { buildBotView } from "#api/bot/view";
import { parseHeuristic } from "#api/bot/evolution/heuristic";
import { createResidualPolicy, SEED_RESIDUAL } from "#api/bot/evolution/residualPolicy";

interface SelectionSetupInput {
  seat: Seat;
  enabled?: boolean;
  zone?: "hand" | "trash";
  boardTargets?: boolean;
}

function prepareSelection(input: SelectionSetupInput) {
  const setup = setupScenario({
    memory: input.seat === 0 ? 3 : -3,
    turnSeat: input.seat,
    turnCount: 0,
    isFirstPlayersFirstTurn: false,
    board: {
      [input.seat]: {
        [input.zone ?? "hand"]: [
          { card: "EX13-053", as: "smaller" },
          { card: "EX13-059", as: "larger" },
        ],
        ...(input.boardTargets
          ? { battleArea: [{ card: "EX13-063", as: "support" }], breeding: { card: "EX13-053", as: "raising" } }
          : {}),
      },
      ...(input.boardTargets ? { [1 - input.seat]: { battleArea: [{ card: "BT1-010", as: "opposing" }] } } : {}),
    },
  });
  const cards = [setup.inst("smaller"), setup.inst("larger")];
  const request: DecisionRequest = {
    decisionId: "free-revealed-digimon",
    seat: input.seat,
    kind: "selectCards",
    promptText: "PrinceMamemon",
    sourceCardId: "EX13-063",
    options: {
      candidateInstanceIds: cards.map((card) => card.instanceId),
      visibleCards: cards.map((card) => ({ instanceId: card.instanceId, cardId: card.cardId })),
      min: 0,
      max: 1,
      effectText: getCardDefinition("EX13-063")!.effectText,
    },
  };
  const policy = createResidualPolicy({
    engine: setup.engine,
    seat: input.seat,
    seed: 71,
    program: parseHeuristic({
      ...SEED_RESIDUAL,
      ...(input.enabled === undefined ? {} : { preferBeneficialSelections: input.enabled }),
    }),
  });
  return { setup, policy, request, view: buildBotView(setup.state, input.seat)! };
}

describe("opt-in beneficial card selections", () => {
  it.each([0, 1] as const)("accepts a visible free reveal and prefers the stronger body in seat %s", (seat) => {
    const { setup, policy, request, view } = prepareSelection({ seat, enabled: true });
    const before = structuredClone(request);
    expect(policy.answerDecision(view, request)).toEqual({
      type: "respondDecision",
      decisionId: request.decisionId,
      response: { kind: "selectCards", instanceIds: [setup.inst("larger").instanceId] },
    });
    expect(request).toEqual(before);
  });

  it.each([undefined, false])("preserves legacy selection when the preference is %s", (enabled) => {
    const { policy, request, view } = prepareSelection({ seat: 0, enabled });
    expect(policy.answerDecision(view, request)).toMatchObject({ response: { instanceIds: [] } });
  });

  it.each(["optionalTarget", "acceptedOptional"] as const)("ranks a free-play %s benefit", (purpose) => {
    const { setup, policy, request, view } = prepareSelection({ seat: 0, enabled: true });
    request.options = { ...request.options, purpose };
    expect(policy.answerDecision(view, request)).toMatchObject({
      response: { instanceIds: [setup.inst("larger").instanceId] },
    });
  });

  it("ranks an accepted return from trash without changing cost payments", () => {
    const { setup, policy, request, view } = prepareSelection({ seat: 0, enabled: true, zone: "trash" });
    request.options = {
      ...request.options,
      purpose: "acceptedOptional",
      effectText: "Return 1 Digimon card from your trash to your hand.",
    };
    expect(policy.answerDecision(view, request)).toMatchObject({
      response: { instanceIds: [setup.inst("larger").instanceId] },
    });
    request.options = { ...request.options, purpose: "cost" };
    expect(policy.answerDecision(view, request)).toMatchObject({
      response: { instanceIds: [setup.inst("smaller").instanceId] },
    });
  });

  it.each(["unknown", "multi-card", "invisible", "cost", "missing-view", "effect-part"] as const)(
    "preserves the default answer for %s requests",
    (kind) => {
      const { policy, request, view } = prepareSelection({ seat: 0, enabled: true });
      const control = prepareSelection({ seat: 0 }).policy;
      if (kind === "unknown") {
        request.options = { ...request.options, effectText: "Unrecognized effect" };
      }
      if (kind === "multi-card") {
        request.options = { ...request.options, max: 2 };
      }
      if (kind === "invisible") {
        request.options = { ...request.options, visibleCards: [] };
      }
      if (kind === "cost") {
        request.options = { ...request.options, purpose: "cost" };
      }
      if (kind === "effect-part") {
        request.options = { ...request.options, effectTextPart: "Draw 1 card." };
      }
      const observation = kind === "missing-view" ? undefined : view;
      expect(policy.answerDecision(observation, request)).toEqual(control.answerDecision(observation, request));
    },
  );

  it.each([undefined, false])("keeps the original accepted-card ranking when the preference is %s", (enabled) => {
    const { setup, policy, request, view } = prepareSelection({ seat: 0, enabled });
    request.options = { ...request.options, purpose: "acceptedOptional" };
    expect(policy.answerDecision(view, request)).toMatchObject({
      response: { instanceIds: [setup.inst("smaller").instanceId] },
    });
  });

  it.each(
    ["support", "opposing", "raising"].flatMap((alias) =>
      ["permanent", "instance"].map((identifier) => ({ alias, identifier })),
    ),
  )("preserves board selection for $alias using a $identifier ID", ({ alias, identifier }) => {
    const { setup, policy, request, view } = prepareSelection({ seat: 0, enabled: true, boardTargets: true });
    const control = createResidualPolicy({ engine: setup.engine, seat: 0, seed: 71, program: SEED_RESIDUAL });
    const card = setup.inst(alias);
    const id = identifier === "instance" ? card.instanceId : setup.perm(alias).permanentId;
    request.options = {
      ...request.options,
      purpose: "optionalTarget",
      candidateInstanceIds: [id],
      visibleCards: [{ instanceId: id, cardId: card.cardId }],
    };
    expect(policy.answerDecision(view, request)).toEqual(control.answerDecision(view, request));
  });

  it.each([true, false])("preserves the serialized preference %s", (preferBeneficialSelections) => {
    const program = parseHeuristic({ ...SEED_RESIDUAL, preferBeneficialSelections });
    expect(program).toHaveProperty("preferBeneficialSelections", preferBeneficialSelections);
    expect(parseHeuristic(JSON.parse(JSON.stringify(program)))).toEqual(program);
    expect(parseHeuristic(SEED_RESIDUAL)).not.toHaveProperty("preferBeneficialSelections");
  });

  it.each([null, 1, "true", {}, []].map((value) => ({ value })))(
    "rejects an invalid preference $value",
    ({ value: preferBeneficialSelections }) => {
      expect(() => parseHeuristic({ ...SEED_RESIDUAL, preferBeneficialSelections })).toThrow(
        "Invalid beneficial selection preference",
      );
    },
  );

  it("requires a projected base for the preference", () => {
    expect(() => parseHeuristic({ ...SEED_RESIDUAL, basePolicy: undefined, preferBeneficialSelections: true })).toThrow(
      "Invalid beneficial selection preference",
    );
  });
});
