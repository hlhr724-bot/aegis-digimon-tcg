import { describe, expect, it } from "vitest";
import type { Seat } from "@aegis/shared";
import { setupEngine, settle, type EngineSetup } from "../../engine/testkit/harness.js";
import { buildBotView } from "../view.js";
import { createEvaluationPolicy, type BotPolicy } from "../policy.js";
import { mainActionReady, mainActions } from "./actions.js";
import { createAsyncTrainingPolicy, type TrainingWindow } from "./policy.js";
import "../../cards/index.js";
import { requireCardDefinition } from "@aegis/shared";

type Choose = (window: TrainingWindow) => number;

async function resolveMain(
  setup: EngineSetup,
  seat: Seat,
  choose: Choose,
  teacher?: BotPolicy,
): Promise<TrainingWindow[]> {
  const windows: TrainingWindow[] = [];
  const policy = createAsyncTrainingPolicy(
    setup.engine,
    seat,
    async (window) => {
      await Promise.resolve();
      windows.push(window);
      const index = choose(window);
      expect({ kind: window.kind, index }).not.toEqual({ kind: window.kind, index: -1 });
      return index;
    },
    teacher,
  );
  expect(setup.engine.applyIntent(seat, await policy.chooseMainAction(buildBotView(setup.state, seat)!))).toEqual({
    ok: true,
  });
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
  await settle(() => mainActionReady(setup.engine));
  expect(mainActionReady(setup.engine)).toBe(true);
  expect(setup.state.pendingDecision).toBeUndefined();
  expect(setup.events.filter((event) => event.kind === "actionRejected")).toEqual([]);
  return windows;
}

const declineOther = (window: TrainingWindow): number =>
  Math.max(
    0,
    window.actions.findIndex(({ label }) => ["Decline", "Don't use", "Finish selection"].includes(label)),
  );

const materialWindows = (windows: TrainingWindow[]) =>
  windows.filter(({ actions }) => actions.some(({ label }) => /Assembly/.test(label) && label !== "Assembly play"));

describe("Assembly through the asynchronous training policy", () => {
  it.each([0, 1] as const)("Shakamon with the 39-material timeout witness remains responsive seat=%s", async (seat) => {
    // Actual trash candidate order at learner seed 5984189, turn 23. Repeated names used to
    // be rejected only at complete eight-card leaves, exhausting the inference deadline.
    const materials = [
      "EX12-065",
      "EX12-074",
      "EX12-026",
      "EX12-076",
      "EX12-046",
      "EX12-062",
      "EX12-004",
      "EX12-061",
      "EX12-031",
      "EX12-036",
      "BT26-012",
      "EX12-009",
      "EX12-026",
      "EX12-074",
      "EX12-009",
      "EX12-004",
      "EX12-061",
      "EX12-062",
      "EX12-046",
      "EX12-070",
      "EX12-046",
      "EX12-070",
      "EX12-065",
      "BT26-008",
      "EX12-004",
      "EX12-061",
      "EX12-062",
      "EX12-070",
      "EX12-047",
      "EX12-047",
      "EX12-036",
      "EX12-004",
      "EX12-061",
      "EX12-065",
      "EX12-074",
      "BT26-014",
      "EX12-009",
      "EX12-026",
      "EX12-076",
    ];
    const setup = setupEngine({
      [seat]: {
        hand: [{ card: "EX12-076", as: "played" }],
        trash: materials.map((card, index) => ({ card, as: `material-${index}` })),
      },
    });
    setup.state.turnSeat = seat;
    setup.state.memory = 8;
    await setup.ready();
    const started = performance.now();
    const windows = await resolveMain(setup, seat, (window) => {
      if (window.kind === "main") return window.actions.findIndex(({ label }) => label === "Assembly play");
      const material = window.actions.findIndex(({ label }) => label === "Assembly material");
      if (material >= 0) return material;
      const finish = window.actions.findIndex(({ label }) => label === "Finish Assembly");
      return finish >= 0 ? finish : declineOther(window);
    });
    expect(performance.now() - started).toBeLessThan(1000);
    expect(materialWindows(windows)[0]!.actions.filter(({ label }) => label === "Assembly material")).toHaveLength(39);
    const player = setup.state.players[seat]!;
    const played = player.battleArea.find(({ topCard }) => topCard.instanceId === setup.inst("played").instanceId)!;
    expect(played.stack).toHaveLength(8);
    expect(new Set(played.stack.map(({ cardId }) => requireCardDefinition(cardId).nameEn)).size).toBe(8);
    expect(player.trash).toHaveLength(31);
    expect(setup.state.memory).toBe(1);
  });

  const abbadomonRecipes = [
    { card: "EX9-047", materials: ["EX9-048", "BT7-069", "EX9-048", "BT7-069"], cost: 4 },
    { card: "EX9-055", materials: ["EX9-005", "EX9-005", "EX9-005", "EX9-005"], cost: 5 },
  ];

  it.each(
    abbadomonRecipes.flatMap((recipe) =>
      ([0, 1] as const).flatMap((seat) => [false, true].map((reverse) => ({ ...recipe, seat, reverse }))),
    ),
  )(
    "$card requires four exact-name materials seat=$seat reverse=$reverse",
    async ({ card, materials, cost, seat, reverse }) => {
      const setup = setupEngine({
        [seat]: {
          hand: [{ card, as: "played" }],
          trash: [
            ...materials.map((material, index) => ({ card: material, as: `material-${index}` })),
            { card: "EX9-046", as: "negamon-text-only" },
            { card: "ST15-14", as: "tamer" },
          ],
        },
      });
      setup.state.turnSeat = seat;
      setup.state.memory = 10;
      await setup.ready();
      const eligible = materials.map((_, index) => setup.inst(`material-${index}`).instanceId);
      const picks = reverse ? [...eligible].reverse() : eligible;
      const windows = await resolveMain(setup, seat, (window) => {
        if (window.kind === "main") return window.actions.findIndex(({ label }) => label === "Assembly play");
        if (materialWindows([window]).length === 0) return declineOther(window);
        const next = picks[window.selected.length];
        return next === undefined
          ? window.actions.findIndex(({ label }) => label === "Finish Assembly")
          : window.actions.findIndex(({ sourceId }) => sourceId === next);
      });
      expect(windows[0]!.actions.find(({ label }) => label === "Assembly play")?.projectedCost).toBe(cost);
      expect(
        materialWindows(windows).map(({ selected, actions }) => ({
          selected,
          offered: actions.map(({ label, sourceId }) => (label === "Assembly material" ? sourceId : label)),
        })),
      ).toEqual([
        ...picks.map((_, index) => ({
          selected: picks.slice(0, index),
          offered: eligible.filter((id) => !picks.slice(0, index).includes(id)),
        })),
        { selected: picks, offered: ["Finish Assembly"] },
      ]);
      const player = setup.state.players[seat]!;
      const played = setup.inst("played").instanceId;
      expect(
        player.battleArea
          .find(({ topCard }) => topCard.instanceId === played)
          ?.stack.map(({ instanceId }) => instanceId),
      ).toEqual([...picks].reverse());
      expect(player.hand.map(({ instanceId }) => instanceId)).not.toContain(played);
      expect(player.trash.map(({ instanceId }) => instanceId)).toEqual([
        setup.inst("negamon-text-only").instanceId,
        setup.inst("tamer").instanceId,
      ]);
      expect(setup.state.memory).toBe(10 - cost);
    },
  );

  it.each(abbadomonRecipes.flatMap((recipe) => ([0, 1] as const).map((seat) => ({ ...recipe, seat }))))(
    "$card omits Assembly with only three exact-name materials seat=$seat",
    async ({ card, materials, seat }) => {
      const setup = setupEngine({
        [seat]: {
          hand: [{ card, as: "played" }],
          trash: [...materials.slice(0, 3), "EX9-046", "ST15-14"],
        },
      });
      setup.state.turnSeat = seat;
      setup.state.memory = 10;
      await setup.ready();
      expect(mainActions(setup.engine, seat).map(({ label }) => label)).toEqual(["End main phase", "Play or use card"]);
    },
  );

  it.each(([0, 1] as const).flatMap((seat) => [0, 1].map((material) => ({ seat, material }))))(
    "BT26-073 main-phase Assembly seat=$seat material=$material",
    async ({ seat, material }) => {
      const setup = setupEngine({
        [seat]: {
          hand: [{ card: "BT26-073", as: "played" }],
          trash: [
            { card: "BT25-008", as: "material-0" },
            { card: "BT26-015", as: "level-five" },
            { card: "BT26-011", as: "material-1" },
            { card: "BT26-092", as: "tamer" },
          ],
        },
      });
      setup.state.turnSeat = seat;
      setup.state.memory = 10;
      await setup.ready();
      const played = setup.inst("played").instanceId;
      const materials = [setup.inst("material-0").instanceId, setup.inst("material-1").instanceId];
      const windows = await resolveMain(setup, seat, (window) => {
        if (window.kind === "main") return window.actions.findIndex(({ label }) => label === "Assembly play");
        if (materialWindows([window]).length === 0) return declineOther(window);
        if (window.selected.length === 0)
          return window.actions.findIndex(({ sourceId }) => sourceId === materials[material]);
        return window.actions.findIndex(({ label }) => label === "Finish Assembly");
      });
      const main = windows[0]!;
      expect(
        main.actions
          .filter(({ sourceId }) => sourceId === played)
          .map(({ label, projectedCost }) => ({ label, projectedCost })),
      ).toEqual([
        { label: "Play or use card", projectedCost: 8 },
        { label: "Assembly play", projectedCost: 6 },
      ]);
      expect(
        materialWindows(windows).map((window) => ({
          selected: window.selected,
          offered: window.actions.map(({ label, sourceId }) => (label === "Assembly material" ? sourceId : label)),
        })),
      ).toEqual([
        { selected: [], offered: materials },
        { selected: [materials[material]], offered: ["Finish Assembly"] },
      ]);
      const unit = setup.state.players[seat]!.battleArea.find(({ topCard }) => topCard.instanceId === played)!;
      expect(unit.stack.map(({ instanceId }) => instanceId)).toEqual([materials[material]]);
      expect(setup.state.memory).toBe(4);
      expect(setup.state.players[seat]!.trash.map(({ instanceId }) => instanceId)).toEqual(
        [
          setup.inst("material-0").instanceId,
          setup.inst("level-five").instanceId,
          setup.inst("material-1").instanceId,
          setup.inst("tamer").instanceId,
        ].filter((id) => id !== materials[material]),
      );
    },
  );

  it.each([0, 1] as const)("BT26-085 requires five different levels seat=%s", async (seat) => {
    const setup = setupEngine({
      [seat]: {
        hand: [{ card: "BT26-085", as: "played" }],
        trash: [
          { card: "BT26-001", as: "level-2" },
          { card: "BT26-009", as: "level-3" },
          { card: "BT25-008", as: "no-chronomon-text" },
          { card: "BT24-034", as: "level-4" },
          { card: "BT26-011", as: "same-level-4" },
          { card: "BT26-015", as: "level-5" },
          { card: "BT26-016", as: "level-6" },
          { card: "BT26-092", as: "tamer" },
        ],
      },
    });
    setup.state.turnSeat = seat;
    setup.state.memory = 10;
    await setup.ready();
    const id = (alias: string) => setup.inst(alias).instanceId;
    const picks = ["level-4", "level-2", "level-3", "level-5", "level-6"].map(id);
    const windows = await resolveMain(setup, seat, (window) => {
      if (window.kind === "main") return window.actions.findIndex(({ label }) => label === "Assembly play");
      if (materialWindows([window]).length === 0) return declineOther(window);
      const next = picks[window.selected.length];
      return next === undefined
        ? window.actions.findIndex(({ label }) => label === "Finish Assembly")
        : window.actions.findIndex(({ sourceId }) => sourceId === next);
    });
    const offered = materialWindows(windows).map((window) =>
      window.actions.map(({ label, sourceId }) => (label === "Assembly material" ? sourceId : label)),
    );
    const eligible = ["level-2", "level-3", "level-4", "same-level-4", "level-5", "level-6"].map(id);
    expect(offered[0]).toEqual(eligible);
    expect(offered[1]).toEqual(
      eligible.filter((candidate) => candidate !== picks[0] && candidate !== id("same-level-4")),
    );
    expect(offered.slice(1, 5).every((choices) => !choices.includes("Finish Assembly"))).toBe(true);
    expect(offered[5]).toEqual(["Finish Assembly"]);
    const unit = setup.state.players[seat]!.battleArea.find(({ topCard }) => topCard.instanceId === id("played"))!;
    expect(new Set(unit.stack.map(({ instanceId }) => instanceId))).toEqual(new Set(picks));
    expect(setup.state.memory).toBe(3);
    expect(setup.state.players[seat]!.trash.map(({ instanceId }) => instanceId)).toEqual([
      id("no-chronomon-text"),
      id("same-level-4"),
      id("tamer"),
    ]);
  });

  it("omits Assembly when the trash cannot complete a recipe", async () => {
    const setup = setupEngine({
      0: {
        hand: [{ card: "BT26-085", as: "played" }],
        trash: [
          { card: "BT26-009", as: "level-3" },
          { card: "BT24-034", as: "level-4" },
          { card: "BT26-011", as: "same-level-4" },
          { card: "BT26-015", as: "level-5" },
          { card: "BT26-016", as: "level-6" },
        ],
      },
    });
    setup.state.memory = 10;
    await setup.ready();
    expect(mainActions(setup.engine, 0).map(({ label }) => label)).toEqual(["End main phase", "Play or use card"]);
  });

  it.each(
    ([0, 1] as const).flatMap((seat) => [
      { seat, assemble: true, useTeacher: false },
      { seat, assemble: false, useTeacher: false },
      { seat, assemble: false, useTeacher: true },
    ]),
  )(
    "BT26-096 effect play offers BT26-073 Assembly seat=$seat assemble=$assemble teacher=$useTeacher",
    async ({ seat, assemble, useTeacher }) => {
      const setup = setupEngine({
        [seat]: {
          hand: [{ card: "BT26-073", as: "played" }],
          battleArea: [{ card: "BT26-096", as: "kosuke" }],
          trash: [
            { card: "BT25-008", as: "material" },
            { card: "BT26-015", as: "level-five" },
          ],
          deck: [{ card: "BT26-009", as: "deck" }],
        },
      });
      setup.state.turnSeat = seat;
      setup.state.memory = 10;
      await setup.ready();
      const played = setup.inst("played").instanceId;
      const material = setup.inst("material").instanceId;
      const windows = await resolveMain(
        setup,
        seat,
        (window) => {
          if (window.kind === "main") return window.actions.findIndex(({ intent }) => intent.type === "activateEffect");
          if (materialWindows([window]).length > 0) {
            if (useTeacher) return window.teacher?.action ?? -1;
            if (!assemble) return window.actions.findIndex(({ label }) => label === "Decline Assembly");
            return window.selected.length === 0
              ? window.actions.findIndex(({ sourceId }) => sourceId === material)
              : window.actions.findIndex(({ label }) => label === "Finish Assembly");
          }
          if (window.request?.sourceCardId === "BT26-096" && window.kind !== "optional")
            return window.selected.length === 0
              ? window.actions.findIndex(({ sourceId }) => sourceId === played)
              : window.actions.findIndex(({ label }) => label === "Finish selection");
          if (window.request?.sourceCardId === "BT26-096")
            return window.actions.findIndex(({ label }) => label === "Accept");
          return declineOther(window);
        },
        useTeacher ? createEvaluationPolicy() : undefined,
      );
      expect(
        materialWindows(windows).map((window) =>
          window.actions.map(({ label, sourceId }) => (label === "Assembly material" ? sourceId : label)),
        ),
      ).toEqual(assemble ? [[material, "Decline Assembly"], ["Finish Assembly"]] : [[material, "Decline Assembly"]]);
      expect(materialWindows(windows).map((window) => window.teacher?.action)).toEqual(
        useTeacher ? [1] : assemble ? [undefined, undefined] : [undefined],
      );
      const unit = setup.state.players[seat]!.battleArea.find(({ topCard }) => topCard.instanceId === played)!;
      expect(unit.stack.map(({ instanceId }) => instanceId)).toEqual(assemble ? [material] : []);
      expect(setup.state.memory).toBe(assemble ? 6 : 4);
      expect(setup.state.players[seat]!.deck.at(-1)?.instanceId).toBe(setup.inst("kosuke").instanceId);
    },
  );
});
