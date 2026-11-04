import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { buildBotView } from "../view.js";
import { mainActionReady } from "./actions.js";
import { createAsyncTrainingPolicy, type TrainingWindow } from "./policy.js";
import "../../cards/index.js";

describe("EX9-054 De-Digivolve through the asynchronous policy", () => {
  it.each(
    ([0, 1] as const).flatMap((seat) =>
      ["play", "evolve"].flatMap((entry) => [0, 1].map((target) => ({ seat, entry, target }))),
    ),
  )("seat=$seat entry=$entry target=$target", async ({ seat, entry, target }) => {
    const opponent = seat === 0 ? 1 : 0;
    const evolve = entry === "evolve";
    const setup = setupEngine({
      [seat]: {
        battleArea: evolve ? [{ card: "EX9-048", as: "host" }] : [],
        hand: [{ card: "EX9-054", as: "source" }],
        deck: [{ card: "EX9-046", as: "draw" }],
      },
      [opponent]: {
        battleArea: [
          { card: "BT10-065", as: "target-0", under: [{ card: "BT10-062", as: "base-0" }] },
          { card: "BT2-064", as: "target-1", under: [{ card: "BT10-064", as: "base-1" }] },
          { card: "BT6-090", as: "ineligible" },
        ],
        breeding: { card: "EX9-055", as: "breeding", under: ["EX9-005"] },
      },
    });
    setup.state.turnSeat = seat;
    setup.state.memory = 10;
    await setup.ready();
    const sourceId = setup.inst("source").instanceId;
    const targetIds = [0, 1].map((index) => setup.perm(`target-${index}`).permanentId);
    const windows: TrainingWindow[] = [];
    const policy = createAsyncTrainingPolicy(setup.engine, seat, async (window) => {
      await Promise.resolve();
      if (window.kind === "main")
        return window.actions.findIndex(({ intent }) =>
          evolve
            ? intent.type === "digivolve" &&
              intent.instanceId === sourceId &&
              intent.permanentId === setup.perm("host").permanentId
            : intent.type === "playCard" && intent.instanceId === sourceId,
        );
      windows.push(window);
      if (window.selected.length) return window.actions.findIndex((action) => action.label === "Finish selection");
      return window.actions.findIndex((action) => action.sourceId === targetIds[target]);
    });
    expect(setup.engine.applyIntent(seat, await policy.chooseMainAction(buildBotView(setup.state, seat)!))).toEqual({
      ok: true,
    });
    for (let step = 0; step < 12; step++) {
      await settle(() => setup.state.pendingDecision !== undefined || mainActionReady(setup.engine));
      const pending = setup.state.pendingDecision;
      if (!pending) break;
      const request = setup.decisions.findLast(({ req }) => req.decisionId === pending.decisionId)!.req;
      expect(request.seat).toBe(seat);
      expect(request.sourceCardId).toBe("EX9-054");
      expect(
        setup.engine.applyIntent(seat, await policy.answerDecision(buildBotView(setup.state, seat), request)),
      ).toEqual({
        ok: true,
      });
    }
    expect(mainActionReady(setup.engine)).toBe(true);
    expect(setup.state.pendingDecision).toBeUndefined();
    expect(setup.events.filter((event) => event.kind === "actionRejected")).toEqual([]);
    expect(
      windows
        .filter((window) => window.selected.length === 0)
        .map((window) => window.actions.map((action) => action.sourceId)),
    ).toEqual([targetIds]);
    expect(setup.state.players[seat]!.battleArea.map((unit) => unit.topCard.instanceId)).toEqual([sourceId]);
    expect(setup.state.players[seat]!.battleArea[0]!.stack.map((card) => card.instanceId)).toEqual(
      evolve ? [setup.inst("host").instanceId] : [],
    );
    expect(setup.state.players[seat]!.hand.map((card) => card.instanceId)).toEqual(
      evolve ? [setup.inst("draw").instanceId] : [],
    );
    expect(setup.state.players[seat]!.deck.map((card) => card.instanceId)).toEqual(
      evolve ? [] : [setup.inst("draw").instanceId],
    );
    for (const index of [0, 1]) {
      expect(setup.perm(`target-${index}`).topCard.instanceId).toBe(
        setup.inst(index === target ? `base-${index}` : `target-${index}`).instanceId,
      );
      expect(setup.perm(`target-${index}`).stack.map((card) => card.instanceId)).toEqual(
        index === target ? [] : [setup.inst(`base-${index}`).instanceId],
      );
    }
    expect(setup.state.players[opponent]!.trash.map((card) => card.instanceId)).toEqual([
      setup.inst(`target-${target}`).instanceId,
    ]);
    expect(setup.state.players[opponent]!.breeding?.topCard.instanceId).toBe(setup.inst("breeding").instanceId);
    expect(setup.perm("ineligible").topCard.cardId).toBe("BT6-090");
    expect(setup.state.memory).toBe(evolve ? 7 : 3);
  });
});

describe("EX9-054 deletion play through the asynchronous policy", () => {
  it.each(([0, 1] as const).flatMap((seat) => [-1, 0, 1].map((choice) => ({ seat, choice }))))(
    "seat=$seat choice=$choice",
    async ({ seat, choice }) => {
      const opponent = seat === 0 ? 1 : 0;
      const setup = setupEngine({
        [seat]: {
          battleArea: [{ card: "EX9-054", as: "source", suspended: true }],
          hand: [
            { card: "EX9-047", as: "candidate-0" },
            { card: "EX9-047", as: "candidate-1" },
            { card: "BT1-009", as: "ineligible" },
          ],
        },
        [opponent]: { battleArea: [{ card: "BT1-080", as: "attacker" }] },
      });
      setup.state.turnSeat = opponent;
      setup.state.memory = 5;
      await setup.ready();
      const sourceId = setup.inst("source").instanceId;
      const candidates = [0, 1].map((index) => setup.inst(`candidate-${index}`).instanceId);
      const actor = createAsyncTrainingPolicy(setup.engine, opponent, async (window) =>
        window.actions.findIndex(
          ({ intent }) =>
            intent.type === "attack" &&
            intent.attackerPermanentId === setup.perm("attacker").permanentId &&
            intent.target.kind === "permanent" &&
            intent.target.permanentId === setup.perm("source").permanentId,
        ),
      );
      const windows: TrainingWindow[] = [];
      const policy = createAsyncTrainingPolicy(setup.engine, seat, async (window) => {
        await Promise.resolve();
        windows.push(window);
        if (window.kind === "optional") return choice < 0 ? 1 : 0;
        if (window.selected.length) return window.actions.findIndex((action) => action.label === "Finish selection");
        return window.actions.findIndex((action) => action.sourceId === candidates[choice]);
      });
      expect(
        setup.engine.applyIntent(opponent, await actor.chooseMainAction(buildBotView(setup.state, opponent)!)),
      ).toEqual({ ok: true });
      for (let step = 0; step < 12; step++) {
        await settle(() => setup.state.pendingDecision !== undefined || mainActionReady(setup.engine));
        const pending = setup.state.pendingDecision;
        if (!pending) break;
        const request = setup.decisions.findLast(({ req }) => req.decisionId === pending.decisionId)!.req;
        expect(request.seat).toBe(seat);
        expect(request.sourceCardId).toBe("EX9-054");
        expect(
          setup.engine.applyIntent(seat, await policy.answerDecision(buildBotView(setup.state, seat), request)),
        ).toEqual({ ok: true });
      }
      expect(mainActionReady(setup.engine)).toBe(true);
      expect(setup.engine.combat.isAttacking).toBe(false);
      expect(setup.state.pendingDecision).toBeUndefined();
      expect(setup.events.filter((event) => event.kind === "actionRejected")).toEqual([]);
      expect(windows.filter((window) => window.kind === "optional")).toHaveLength(1);
      expect(
        windows
          .filter((window) => window.kind === "selectCards" && window.selected.length === 0)
          .map((window) => window.actions.map((action) => action.sourceId ?? action.label)),
      ).toEqual(choice < 0 ? [] : [[...candidates, "Finish selection"]]);
      expect(setup.state.players[seat]!.battleArea.map((unit) => unit.topCard.instanceId)).toEqual(
        choice < 0 ? [] : [candidates[choice]],
      );
      expect(setup.state.players[seat]!.hand.map((card) => card.instanceId)).toEqual([
        ...candidates.filter((_, index) => index !== choice),
        setup.inst("ineligible").instanceId,
      ]);
      expect(setup.state.players[seat]!.trash.map((card) => card.instanceId)).toEqual([sourceId]);
      expect(setup.state.players[opponent]!.battleArea.map((unit) => unit.topCard.instanceId)).toEqual([
        setup.inst("attacker").instanceId,
      ]);
      expect(setup.state.memory).toBe(5);
    },
  );

  it.each(
    ([0, 1] as const).flatMap((seat) =>
      [0, 2].flatMap((negamonCount) => [false, true].map((accept) => ({ seat, negamonCount, accept }))),
    ),
  )("seat=$seat Negamon count=$negamonCount accept=$accept", async ({ seat, negamonCount, accept }) => {
    const opponent = seat === 0 ? 1 : 0;
    const setup = setupEngine({
      [seat]: {
        battleArea: [{ card: "EX9-054", as: "source", suspended: true }],
        hand: [{ card: "EX9-054", as: "level-five" }],
        trash: Array.from({ length: negamonCount }, (_, index) => ({ card: "EX9-005", as: `negamon-${index}` })),
      },
      [opponent]: { battleArea: [{ card: "BT1-080", as: "attacker" }] },
    });
    setup.state.turnSeat = opponent;
    setup.state.memory = 5;
    await setup.ready();
    const actor = createAsyncTrainingPolicy(setup.engine, opponent, async (window) =>
      window.actions.findIndex(
        ({ intent }) =>
          intent.type === "attack" &&
          intent.attackerPermanentId === setup.perm("attacker").permanentId &&
          intent.target.kind === "permanent" &&
          intent.target.permanentId === setup.perm("source").permanentId,
      ),
    );
    const windows: TrainingWindow[] = [];
    const policy = createAsyncTrainingPolicy(setup.engine, seat, async (window) => {
      await Promise.resolve();
      windows.push(window);
      if (window.kind === "optional") return accept ? 0 : 1;
      if (window.selected.length) return window.actions.findIndex((action) => action.label === "Finish selection");
      return window.actions.findIndex((action) => action.sourceId === setup.inst("level-five").instanceId);
    });
    expect(
      setup.engine.applyIntent(opponent, await actor.chooseMainAction(buildBotView(setup.state, opponent)!)),
    ).toEqual({ ok: true });
    for (let step = 0; step < 12; step++) {
      await settle(() => setup.state.pendingDecision !== undefined || mainActionReady(setup.engine));
      const pending = setup.state.pendingDecision;
      if (!pending) break;
      const request = setup.decisions.findLast(({ req }) => req.decisionId === pending.decisionId)!.req;
      expect(request.seat).toBe(seat);
      expect(
        setup.engine.applyIntent(seat, await policy.answerDecision(buildBotView(setup.state, seat), request)),
      ).toEqual({ ok: true });
    }
    expect(mainActionReady(setup.engine)).toBe(true);
    expect(setup.state.pendingDecision).toBeUndefined();
    expect(setup.events.filter((event) => event.kind === "actionRejected")).toEqual([]);
    const played = negamonCount === 2 && accept;
    expect(windows.filter((window) => window.kind === "optional")).toHaveLength(negamonCount === 2 ? 1 : 0);
    expect(setup.state.players[seat]!.battleArea.map((unit) => unit.topCard.instanceId)).toEqual(
      played ? [setup.inst("level-five").instanceId] : [],
    );
    expect(setup.state.players[seat]!.hand.map((card) => card.instanceId)).toEqual(
      played ? [] : [setup.inst("level-five").instanceId],
    );
    expect(setup.state.players[seat]!.trash.map((card) => card.instanceId)).toEqual([
      ...Array.from({ length: negamonCount }, (_, index) => setup.inst(`negamon-${index}`).instanceId),
      setup.inst("source").instanceId,
    ]);
    expect(setup.state.memory).toBe(5);
  });
});
