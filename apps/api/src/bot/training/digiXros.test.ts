import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { buildBotView } from "../view.js";
import { mainActions, mainActionReady } from "./actions.js";
import { chooseDecisionIntent } from "./decisions.js";
import { createAsyncTrainingPolicy } from "./policy.js";
import "../../cards/index.js";

const cases = ([0, 1] as const).flatMap((seat) =>
  ["EX10-031", "BT19-063"].flatMap((card) => [1, 2].map((count) => ({ seat, card, count }))),
);
describe("DigiXros candidate declarations", () => {
  it.each([0, 1] as const)("executes effect-driven DigiXros through async selection for seat %s", async (seat) => {
    const s = setupEngine({
      [seat]: {
        hand: [
          { card: "BT10-084", as: "tactimon" },
          { card: "BT10-076", as: "material" },
        ],
        trash: [{ card: "BT10-077", as: "played" }],
      },
    });
    s.state.turnSeat = seat;
    s.state.memory = 20;
    await s.ready();
    let materialWindows = 0;
    const policy = createAsyncTrainingPolicy(s.engine, seat, async (window) => {
      if (window.request?.options?.digiXrosCardId !== undefined) {
        materialWindows++;
        expect(window.request.options.digiXrosMaterialLimits).toBeDefined();
        return window.selected.length === 0
          ? window.actions.findIndex((action) => action.sourceId === s.inst("material").instanceId)
          : window.actions.findIndex((action) => action.label === "Finish selection");
      }
      return 0;
    });
    expect(s.engine.applyIntent(seat, { type: "playCard", instanceId: s.inst("tactimon").instanceId })).toEqual({
      ok: true,
    });
    for (let index = 0; index < 30; index++) {
      await settle(() => s.state.pendingDecision !== undefined || mainActionReady(s.engine));
      if (s.state.pendingDecision === undefined) break;
      const pending = s.state.pendingDecision;
      const request = s.decisions.findLast(({ req }) => req.decisionId === pending.decisionId)!.req;
      expect(s.engine.applyIntent(seat, await policy.answerDecision(buildBotView(s.state, seat), request))).toEqual({
        ok: true,
      });
    }
    await settle(() => mainActionReady(s.engine));
    const played = s.state.players[seat]!.battleArea.find((permanent) => permanent.topCard.cardId === "BT10-077");
    expect(played?.stack.map((card) => card.cardId)).toEqual(["BT10-076"]);
    expect(materialWindows).toBe(2);
    expect(s.events.filter((event) => event.kind === "actionRejected")).toEqual([]);
  });
  it.each(cases)("plays $card with $count materials for seat $seat", async ({ seat, card, count }) => {
    const s = setupEngine(
      {
        [seat]: {
          hand: [
            { card, as: "played" },
            { card: "EX10-026", as: "skull" },
            { card: "EX10-027", as: "axe" },
          ],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = seat;
    s.state.memory = 10;
    await s.ready();
    const policy = createAsyncTrainingPolicy(s.engine, seat, async (window) =>
      window.actions.findIndex(
        (action) =>
          action.intent.type === "playCard" &&
          action.intent.instanceId === s.inst("played").instanceId &&
          action.intent.digiXros?.materialInstanceIds.length === count,
      ),
    );
    const intent = await policy.chooseMainAction(buildBotView(s.state, seat)!);
    expect(s.engine.applyIntent(seat, intent)).toEqual({ ok: true });
    await settle(() => s.state.players[seat]!.battleArea.some((p) => p.topCard.cardId === card));
    const result = s.state.players[seat]!.battleArea.find((p) => p.topCard.cardId === card)!;
    expect(result.stack.map((c) => c.cardId)).toEqual(count === 1 ? ["EX10-026"] : ["EX10-027", "EX10-026"]);
    expect(s.state.memory).toBe(10 - (card === "EX10-031" ? 7 - count : 8 - 2 * count));
  });

  it("retains affordable multi-material plays even when each single-material prefix is unaffordable", async () => {
    const s = setupEngine({
      0: { hand: [{ card: "BT19-063", as: "result" }, "EX10-026", "EX10-027", "EX10-026"], trash: ["EX10-027"] },
    });
    s.state.memory = -5;
    await s.ready();
    const routes = mainActions(s.engine, 0).filter(
      ({ intent }) => intent.type === "playCard" && intent.digiXros !== undefined,
    );
    expect(routes).toHaveLength(2);
    expect(routes.every((route) => route.projectedCost === 4 && route.materialIds?.length === 2)).toBe(true);
    expect(routes.flatMap((route) => route.materialIds ?? [])).not.toContain(s.state.players[0]!.trash[0]!.instanceId);
  });

  it("bounds material combinations by default so a crowded hand cannot stall the bot", async () => {
    const materials = Array.from({ length: 30 }, (_, index) => (index % 2 === 0 ? "EX10-026" : "EX10-027"));
    const s = setupEngine({ 0: { hand: [{ card: "BT19-063", as: "result" }, ...materials] } });
    s.state.memory = 10;
    await s.ready();
    const digiXros = (budget?: number) =>
      mainActions(s.engine, 0, budget === undefined ? {} : { digiXrosValidationBudget: budget }).filter(
        ({ intent }) => intent.type === "playCard" && intent.digiXros !== undefined,
      );
    const bounded = digiXros();
    expect(bounded.length).toBeGreaterThan(0);
    expect(bounded.length).toBeLessThanOrEqual(256);
    expect(digiXros(Number.POSITIVE_INFINITY).length).toBeGreaterThan(bounded.length);
  });

  it("effect selections exclude duplicate slots and respect authorized material-group quotas", () => {
    const cards = new Map([
      ["skull", { cardId: "EX10-026" }],
      ["duplicate", { cardId: "EX10-026" }],
      ["axe", { cardId: "EX10-027" }],
    ]);
    const offered: string[][] = [];
    const result = chooseDecisionIntent(
      {
        decisionId: "xros",
        seat: 0,
        kind: "selectCards",
        promptText: "DigiXros",
        options: {
          candidateInstanceIds: [...cards.keys()],
          min: 0,
          max: 2,
          digiXrosCardId: "BT19-063",
          digiXrosMaterialLimits: [{ candidateInstanceIds: ["skull", "axe"], max: 1 }],
        },
      },
      cards,
      (step) => {
        offered.push(step.choices.map((choice) => choice.key));
        return step.selected.length === 0
          ? step.choices.findIndex((choice) => choice.key === "skull")
          : step.choices.findIndex((choice) => choice.key === "finish");
      },
    );
    expect(offered).toEqual([["skull", "duplicate", "axe", "finish"], ["finish"]]);
    expect(result).toEqual({
      type: "respondDecision",
      decisionId: "xros",
      response: { kind: "selectCards", instanceIds: ["skull"] },
    });
  });
});
