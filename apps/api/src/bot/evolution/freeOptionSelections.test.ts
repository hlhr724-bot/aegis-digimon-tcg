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
          { card: "EX7-070", as: "smaller" },
          { card: "BT24-091", as: "larger" },
        ],
        ...(input.boardTargets
          ? { battleArea: [{ card: "P-235", as: "support" }], breeding: { card: "EX13-053", as: "raising" } }
          : {}),
      },
      ...(input.boardTargets ? { [1 - input.seat]: { battleArea: [{ card: "P-235", as: "opposing" }] } } : {}),
    },
  });
  const cards = [setup.inst("smaller"), setup.inst("larger")];
  const request: DecisionRequest = {
    decisionId: "free-option",
    seat: input.seat,
    kind: "selectCards",
    promptText: "BeelStarmon",
    sourceCardId: "BT25-085",
    options: {
      candidateInstanceIds: cards.map((card) => card.instanceId),
      visibleCards: cards.map((card) => ({ instanceId: card.instanceId, cardId: card.cardId })),
      min: 0,
      max: 1,
      effectText: getCardDefinition("BT25-085")!.effectText,
    },
  };
  const policy = createResidualPolicy({
    engine: setup.engine,
    seat: input.seat,
    seed: 71,
    program: parseHeuristic({
      ...SEED_RESIDUAL,
      ...(input.enabled === undefined ? {} : { preferFreeOptionSelections: input.enabled }),
    }),
  });
  return { setup, policy, request, view: buildBotView(setup.state, input.seat)! };
}

describe("opt-in free Option selections", () => {
  it.each([0, 1] as const)("accepts the first visible free Option in seat %s", (seat) => {
    const { setup, policy, request, view } = prepareSelection({ seat, enabled: true });
    const before = structuredClone(request);
    expect(policy.answerDecision(view, request)).toEqual({
      type: "respondDecision",
      decisionId: request.decisionId,
      response: { kind: "selectCards", instanceIds: [setup.inst("smaller").instanceId] },
    });
    expect(request).toEqual(before);
  });

  it.each([undefined, false])("preserves legacy selection when the preference is %s", (enabled) => {
    const { policy, request, view } = prepareSelection({ seat: 0, enabled });
    expect(policy.answerDecision(view, request)).toMatchObject({ response: { instanceIds: [] } });
  });

  it.each([
    "unknown",
    "multi-card",
    "invisible",
    "cost",
    "missing-view",
    "effect-part",
    "non-option",
    "required",
  ] as const)("preserves the default answer for %s requests", (kind) => {
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
    if (kind === "non-option") {
      request.options = {
        ...request.options,
        visibleCards: request.options?.visibleCards?.map((card) => ({ ...card, cardId: "BT1-010" })),
      };
    }
    if (kind === "required") {
      request.options = { ...request.options, min: 1 };
    }
    const observation = kind === "missing-view" ? undefined : view;
    expect(policy.answerDecision(observation, request)).toEqual(control.answerDecision(observation, request));
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
      candidateInstanceIds: [id],
      visibleCards: [{ instanceId: id, cardId: card.cardId }],
    };
    expect(policy.answerDecision(view, request)).toEqual(control.answerDecision(view, request));
  });

  it.each([true, false])("preserves the serialized preference %s", (preferFreeOptionSelections) => {
    const program = parseHeuristic({ ...SEED_RESIDUAL, preferFreeOptionSelections });
    expect(program).toHaveProperty("preferFreeOptionSelections", preferFreeOptionSelections);
    expect(parseHeuristic(JSON.parse(JSON.stringify(program)))).toEqual(program);
    expect(parseHeuristic(SEED_RESIDUAL)).not.toHaveProperty("preferFreeOptionSelections");
  });

  it.each([null, 1, "true", {}, []].map((value) => ({ value })))(
    "rejects an invalid preference $value",
    ({ value: preferFreeOptionSelections }) => {
      expect(() => parseHeuristic({ ...SEED_RESIDUAL, preferFreeOptionSelections })).toThrow(
        "Invalid free Option selection preference",
      );
    },
  );

  it("requires a projected base for the preference", () => {
    expect(() => parseHeuristic({ ...SEED_RESIDUAL, basePolicy: undefined, preferFreeOptionSelections: true })).toThrow(
      "Invalid free Option selection preference",
    );
  });
});
