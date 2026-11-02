import { describe, expect, it } from "vitest";
import { getCardDefinition } from "@aegis/shared";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { buildBotView } from "../view.js";
import { mainActionReady } from "./actions.js";
import { createAsyncTrainingPolicy, type TrainingWindow } from "./policy.js";
import "../../cards/index.js";

const cases = ([0, 1] as const).flatMap((seat) => [
  { seat, payer: -1, returned: -1 },
  ...[0, 1].flatMap((payer) => [0, 1, 2].map((returned) => ({ seat, payer, returned }))),
]);

describe("Chiropmon payment followed by retrieval through the asynchronous policy", () => {
  it.each(cases)("seat=$seat payer=$payer returned=$returned", async ({ seat, payer, returned }) => {
    const opponent = seat === 0 ? 1 : 0;
    const setup = setupEngine({
      [seat]: {
        hand: [{ card: "ST23-12", as: "source" }],
        battleArea: [
          ...[0, 1].map((index) => ({
            card: "ST23-13",
            as: `tamer-${index}`,
            suspended: true,
            under: [
              { card: "ST23-06", as: `visible-${index}`, faceUp: true },
              { card: "BT26-025", as: `cost-${index}`, faceUp: false },
              { card: "BT25-032", as: `keep-${index}`, faceUp: false },
            ],
          })),
          { card: "ST23-13", as: "empty-tamer", suspended: true },
        ],
        trash: [
          { card: "BT25-032", as: "return-0" },
          { card: "ST23-06", as: "return-1" },
          { card: "ST23-13", as: "wrong-kind" },
          { card: "EX9-046", as: "wrong-trait" },
          { card: "ST23-01", as: "egg" },
        ],
      },
      [opponent]: {
        battleArea: [
          {
            card: "ST23-13",
            as: "opponent-tamer",
            suspended: true,
            under: [{ card: "BT26-025", as: "opponent-cost", faceUp: false }],
          },
        ],
        trash: [{ card: "ST23-06", as: "opponent-trash" }],
      },
    });
    setup.state.turnSeat = seat;
    setup.state.memory = 10;
    await setup.ready();
    const source = setup.inst("source").instanceId;
    const payerIds = [0, 1].map((index) => setup.inst(`tamer-${index}`).instanceId);
    const costs = [0, 1].map((index) => setup.inst(`cost-${index}`).instanceId);
    const eligible = [setup.inst("return-0").instanceId, setup.inst("return-1").instanceId, costs[payer]];
    const originalTrash = setup.state.players[seat]!.trash.map((card) => card.instanceId);
    const paymentWindows: TrainingWindow[] = [];
    const retrievalWindows: TrainingWindow[] = [];
    const optionals: TrainingWindow[] = [];
    const policy = createAsyncTrainingPolicy(setup.engine, seat, async (window) => {
      await Promise.resolve();
      if (window.kind === "main")
        return window.actions.findIndex(({ intent }) => intent.type === "playCard" && intent.instanceId === source);
      if (window.kind === "optional") {
        optionals.push(window);
        return payer < 0 ? 1 : 0;
      }
      if (window.selected.length) return window.actions.findIndex((action) => action.label === "Finish selection");
      if (window.actions.some((action) => payerIds.includes(action.sourceId ?? ""))) {
        paymentWindows.push(window);
        return window.actions.findIndex((action) => action.sourceId === payerIds[payer]);
      }
      retrievalWindows.push(window);
      return window.actions.findIndex((action) => action.sourceId === eligible[returned]);
    });
    expect(setup.engine.applyIntent(seat, await policy.chooseMainAction(buildBotView(setup.state, seat)!))).toEqual({
      ok: true,
    });
    for (let step = 0; step < 16; step++) {
      await settle(() => setup.state.pendingDecision !== undefined || mainActionReady(setup.engine));
      const pending = setup.state.pendingDecision;
      if (!pending) break;
      const request = setup.decisions.findLast(({ req }) => req.decisionId === pending.decisionId)!.req;
      expect(request.seat).toBe(seat);
      expect(
        setup.engine.applyIntent(seat, await policy.answerDecision(buildBotView(setup.state, seat), request)),
      ).toEqual({ ok: true });
    }
    await settle(() => mainActionReady(setup.engine));
    expect(mainActionReady(setup.engine)).toBe(true);
    expect(setup.state.pendingDecision).toBeUndefined();
    expect(optionals).toHaveLength(payer < 0 ? 1 : 2);
    expect(paymentWindows.map((window) => window.actions.map((action) => action.sourceId))).toEqual(
      payer < 0 ? [] : [payerIds],
    );
    expect(retrievalWindows.map((window) => window.actions.map((action) => action.sourceId))).toEqual(
      payer < 0 ? [] : [eligible],
    );
    expect(setup.state.players[seat]!.hand.map((card) => card.instanceId)).toEqual(
      payer < 0 ? [] : [eligible[returned]],
    );
    expect(setup.state.players[seat]!.trash.map((card) => card.instanceId)).toEqual(
      [...originalTrash, ...(payer < 0 ? [] : [costs[payer]])].filter((id) => id !== eligible[returned]),
    );
    for (const index of [0, 1])
      expect(setup.perm(`tamer-${index}`).stack.map((card) => ({ id: card.instanceId, faceUp: card.faceUp }))).toEqual([
        { id: setup.inst(`visible-${index}`).instanceId, faceUp: true },
        ...(payer === index ? [] : [{ id: costs[index], faceUp: false }]),
        { id: setup.inst(`keep-${index}`).instanceId, faceUp: false },
      ]);
    expect(setup.state.players[seat]!.battleArea.map((unit) => unit.topCard.instanceId)).toEqual([
      ...payerIds,
      setup.inst("empty-tamer").instanceId,
      source,
    ]);
    expect(setup.perm("opponent-tamer").stack.map((card) => card.instanceId)).toEqual([
      setup.inst("opponent-cost").instanceId,
    ]);
    expect(setup.state.players[opponent]!.trash.map((card) => card.instanceId)).toEqual([
      setup.inst("opponent-trash").instanceId,
    ]);
    expect(setup.state.memory).toBe(10 - getCardDefinition("ST23-12")!.playCost);
    expect(setup.events.filter((event) => event.kind === "actionRejected")).toEqual([]);
  });
});
