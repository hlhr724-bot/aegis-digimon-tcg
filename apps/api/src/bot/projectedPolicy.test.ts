import { expect, it } from "vitest";
import { setupEngine, settle } from "../engine/testkit/harness.js";
import { createEvaluationPolicy } from "./policy.js";
import { createProjectedEvaluationPolicy, projectedBotOptions } from "./projectedPolicy.js";
import { buildBotView } from "./view.js";
import { digiXrosMainActions } from "./training/digiXros.js";
import { validateDigiXros } from "../engine/actions/digiXros.js";
import { digiXrosDeps } from "../engine/gameEngine/actionDeps.js";
import "../cards/index.js";

it("bounds unlimited DigiXros recipes across two copies and a large material pool", async () => {
  const materials = [7, 8, 9, 12, 13, 15, 18, 19, 20, 21, 24, 25, 26, 29, 34, 49, 58, 59, 60, 63].map(
    (number) => `BT10-${String(number).padStart(3, "0")}`,
  );
  const setup = setupEngine({ 0: { hand: ["BT12-112", "BT12-112", ...materials] } });
  setup.state.memory = 10;
  await setup.ready();
  const routes = digiXrosMainActions(setup.engine, 0, { validationBudget: 256 });
  expect(routes.length).toBeGreaterThan(0);
  expect(routes.length).toBeLessThanOrEqual(256);
  for (const action of routes) {
    if (action.intent.type !== "playCard" || !action.intent.digiXros) throw new Error("Expected DigiXros");
    expect(
      validateDigiXros(
        setup.state,
        0,
        { ...action.intent, digiXros: action.intent.digiXros },
        digiXrosDeps(setup.engine),
      ),
    ).toMatchObject({ ok: true, cost: action.projectedCost });
  }
});

it("retains a legal DigiXros declaration under a small live search budget", async () => {
  const setup = setupEngine(
    {
      0: { hand: [{ card: "BT19-063", as: "played" }, "EX10-026", "EX10-027"] },
    },
    { autoDeclineOptional: true, autoSelectCards: true },
  );
  setup.state.memory = 10;
  await setup.ready();
  const complete = digiXrosMainActions(setup.engine, 0);
  const bounded = digiXrosMainActions(setup.engine, 0, { validationBudget: 1 });
  expect(complete.length).toBeGreaterThan(bounded.length);
  expect(bounded).toHaveLength(1);
  expect(bounded[0]).toEqual(complete[0]);
  expect(digiXrosMainActions(setup.engine, 0, { validationBudget: 0 })).toEqual([]);
  expect(setup.engine.applyIntent(0, bounded[0]!.intent)).toEqual({ ok: true });
  await settle(() => setup.state.players[0]!.battleArea.some((unit) => unit.topCard.cardId === "BT19-063"));
  expect(setup.state.players[0]!.battleArea[0]!.stack.map((card) => card.cardId)).toEqual(["EX10-026"]);
  expect(setup.state.memory).toBe(4);
  expect(setup.events.filter((event) => event.kind === "actionRejected")).toEqual([]);
});

it("chooses and executes affordable Assembly when printed play cost is outside the gauge", async () => {
  const setup = setupEngine(
    {
      0: {
        hand: [{ card: "EX9-055", as: "played" }],
        trash: Array.from({ length: 4 }, (_, index) => ({ card: "EX9-005", as: `material-${index}` })),
      },
    },
    { autoDeclineOptional: true, autoSelectCards: true },
  );
  setup.state.memory = 0;
  await setup.ready();
  const view = buildBotView(setup.state, 0)!;
  expect(createEvaluationPolicy().chooseMainAction(view)).toEqual({ type: "endPhase" });
  const policy = createProjectedEvaluationPolicy({ engine: setup.engine, seat: 0 });
  const intent = policy.chooseMainAction(view);
  expect(intent).toMatchObject({ type: "playCard", instanceId: setup.inst("played").instanceId });
  if (intent.type !== "playCard") throw new Error("Expected an Assembly declaration");
  expect(intent.assembly?.materialInstanceIds).toHaveLength(4);
  expect(setup.engine.applyIntent(0, intent)).toEqual({ ok: true });
  await settle(() => setup.state.players[0]!.battleArea.some((unit) => unit.topCard.cardId === "EX9-055"));
  const played = setup.state.players[0]!.battleArea.find((unit) => unit.topCard.cardId === "EX9-055")!;
  expect(played.stack.map((card) => card.instanceId).sort()).toEqual(
    intent.assembly!.materialInstanceIds.slice().sort(),
  );
  expect(setup.state.players[0]!.trash).toHaveLength(0);
  expect(setup.events.filter((event) => event.kind === "actionRejected")).toEqual([]);
});

it("uses projected balanced by default and preserves explicit policy and pacing options", () => {
  const setup = setupEngine({});
  const defaultOptions = projectedBotOptions({ engine: setup.engine, seat: 0, options: { seed: 17, minThinkMs: 9 } });
  expect(defaultOptions.policy?.name).toBe("projected:balanced");
  expect(defaultOptions.minThinkMs).toBe(9);
  expect(defaultOptions.canChooseMainAction?.()).toBe(true);
  setup.engine.mainEntryPending = true;
  expect(defaultOptions.canChooseMainAction?.()).toBe(false);
  setup.engine.mainEntryPending = false;
  expect(defaultOptions.canChooseMainAction?.()).toBe(true);
  const explicit = { policy: createEvaluationPolicy({ seed: 17 }), minThinkMs: 8 };
  expect(projectedBotOptions({ engine: setup.engine, seat: 0, options: explicit })).toBe(explicit);
});
