import prepared0 from "./execute-replacement.fixture.js";
import prepared1 from "./ordinary-replacement.fixture.js";
import { fixtureVariant, fixtureInstanceId } from "../scenario/references.js";

import { expect, it } from "vitest";

import { Phase, type DecisionResponse, type ServerEvent } from "@aegis/shared";
import { setupEngine, settle, type EngineSetup } from "../testkit/harness.js";
import { advance } from "../testkit/advance.js";
import { layScenarioFixture } from "../scenario/fixture.js";
import { observe } from "../testkit/observe.js";
import "../../cards/index.js";

const preparedFixtures = { "execute-replacement": prepared0, "ordinary-replacement": prepared1 };

// Exact production Assembly recipe, ordered from the bottom of the resulting stack.
const MATERIALS = ["BT26-001", "BT24-034", "BT26-009", "BT26-015", "BT26-016"];

function assertHolyContext(s: EngineSetup): void {
  const host = s.state.players[0]!.battleArea[0]!;
  expect(host.topCard.cardId).toBe("BT26-060");
  expect(host.stack.map((c) => c.cardId)).toEqual([...MATERIALS, "BT26-085"]);
  expect(observe(s.engine).hasKeyword(host, "Execute")).toBe(true);
}

async function resolve(
  s: EngineSetup,
  holyProtection: boolean,
  done: () => boolean,
  battleProtection = true,
): Promise<void> {
  for (let n = 0; n < 50; n++) {
    await settle(() => Boolean(s.state.pendingDecision || s.state.combatWindow) || done());
    if (done()) return;
    const combat = s.state.combatWindow;
    if (combat) {
      const intent =
        combat.kind === "counter"
          ? { type: "respondCounter" as const }
          : combat.kind === "barrier"
            ? { type: "respondBarrier" as const, permanentId: combat.permanentId, accept: false }
            : {
                type: "declareBlock" as const,
                blockerPermanentId: s.state.players[1]!.battleArea.find((p) => p.topCard.cardId === "AD1-025")!
                  .permanentId,
              };
      // The real combat window determines which public response is legal.
      // eslint-disable-next-line vitest/no-conditional-expect
      expect(s.engine.applyIntent(combat.seat, intent)).toEqual({ ok: true });
      continue;
    }
    const { seat, req } = s.decisions.findLast(
      ({ req: candidate }) => candidate.decisionId === s.state.pendingDecision!.decisionId,
    )!;
    let response: DecisionResponse;
    if (req.kind === "optional") {
      const holy = req.sourceCardId === "BT26-016" && req.promptText === "Prevent leaving the battle area?";
      if (holy) assertHolyContext(s);
      response = {
        kind: "optional",
        accept:
          req.sourceCardId === "BT26-078" ||
          (req.sourceCardId === "BT26-085" &&
            (req.promptText !== "Prevent leaving the battle area?" || battleProtection)) ||
          (holy && holyProtection),
      };
    } else if (req.kind === "orderTriggers")
      response = { kind: "orderTriggers", order: req.options?.triggerKeys?.slice(0, 1) ?? [] };
    else if (req.kind === "orderCards")
      response = { kind: "orderCards", order: req.options?.candidateInstanceIds ?? [] };
    else if (req.kind === "chooseOption") response = { kind: "chooseOption", optionIndex: 0 };
    else if (req.kind === "selectCards" || req.kind === "chooseTargets") {
      const ids = req.options?.candidateInstanceIds ?? [];
      const count = req.options?.selectionContext === "attackTarget" ? 1 : (req.options?.min ?? 1);
      let instanceIds = ids.slice(0, count);
      if (count > 0 && ids.includes("player")) {
        instanceIds = ["player"];
      }
      response = { kind: req.kind, instanceIds };
    } else throw new Error(`Unhandled decision ${req.kind}`);
    expect(s.engine.applyIntent(seat, { type: "respondDecision", decisionId: req.decisionId, response })).toEqual({
      ok: true,
    });
  }
  throw new Error("Unsettled Execute sequence");
}

function board() {
  return setupEngine(
    {
      0: {
        eggDeck: ["BT18-004"],
        hand: [{ card: "BT26-085", as: "giant" }, "BT1-009"],
        trash: [
          { card: "BT26-078", as: "cherub" },
          { card: "BT26-060", as: "destroy" },
          ...MATERIALS.map((card, i) => ({ card, as: `material${i}` })),
        ],
        deck: Array(12).fill("BT1-009"),
        security: [{ card: "BT1-009", as: "securityTop" }, "BT1-009", "BT1-009"],
      },
      1: {
        eggDeck: ["BT18-004"],
        battleArea: [{ card: "AD1-025", as: "omni", under: ["AD1-004", "AD1-014"] }],
        hand: ["BT1-009"],
        deck: Array(12).fill("BT1-009"),
        security: 3,
      },
    },
    { autoOrderTriggers: false, autoOrderCards: false },
  );
}

const lifecycle = (e: ServerEvent, kind: "effectTriggered" | "effectResolved", card: string, timing: string) =>
  e.kind === kind && e.sourceCardId === card && e.timing === timing;

it.each([false, true])(
  "Feedback #79: battle prevention precedes a distinct Execute deletion (Holy payment %s)",
  async (holyProtection) => {
    const s = board();
    const giant = s.inst("giant").instanceId;
    const destroy = s.inst("destroy").instanceId;
    const securityTop = s.inst("securityTop").instanceId;
    const sourceIds = MATERIALS.map((_, i) => s.inst(`material${i}`).instanceId);
    const deck = s.state.players[0]!.deck.map((c) => c.instanceId);
    const reserve = s.state.players[0]!.hand[1]!.instanceId;
    s.state.memory = 2;
    const loop = s.engine.startTurnLoop();
    try {
      await settle(() => s.state.phase === Phase.Breeding);
      expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
      await advance(s.engine).waitForMainPhase(0);
      expect(
        s.engine.applyIntent(0, {
          type: "playCard",
          instanceId: giant,
          assembly: { materialInstanceIds: [...sourceIds].reverse() },
        }),
      ).toEqual({ ok: true });
      await resolve(s, holyProtection, () => s.state.turnSeat === 1 && s.state.phase === Phase.Breeding);
      const player = s.state.players[0]!;
      expect(s.state.memory).toBe(5);
      expect(player.battleArea.map((p) => p.topCard.instanceId)).toEqual(holyProtection ? [destroy] : []);
      expect(player.security).toHaveLength(holyProtection ? 2 : 3);
      expect(player.trash.map((c) => c.instanceId)).toEqual(holyProtection ? [] : [...sourceIds, giant, destroy]);
      expect(player.deck.map((c) => c.instanceId)).toEqual([
        ...deck.slice(2),
        s.inst("cherub").instanceId,
        ...(holyProtection ? [securityTop] : []),
      ]);
      expect(player.hand.map((c) => c.instanceId)).toEqual([reserve, ...deck.slice(0, 2)]);
      expect([...player.battleArea].flatMap((p) => p.stack.map((c) => c.instanceId))).toEqual(
        holyProtection ? [...sourceIds, giant] : [],
      );
      const evolved = s.events.filter((e) => e.kind === "digivolved");
      expect(evolved).toHaveLength(1);
      expect(evolved[0]).toMatchObject({ cardId: "BT26-060", permanentId: "perm-1" });
      expect(s.events.filter((e) => e.kind === "memoryChanged" && e.reason === "payCost")).toEqual([
        { kind: "memoryChanged", from: 2, to: -5, reason: "payCost" },
      ]);
      expect(s.events.filter((e) => e.kind === "attackDeclared")).toHaveLength(1);
      expect(s.events.filter((e) => e.kind === "securityChecked")).toHaveLength(0);
      expect(s.events.filter((e) => lifecycle(e, "effectTriggered", "BT26-060", "OnEndAttack"))).toHaveLength(1);
      expect(
        s.decisions.filter(
          ({ req }) => req.sourceCardId === "BT26-016" && req.promptText === "Prevent leaving the battle area?",
        ),
      ).toHaveLength(1);
      expect(s.events.filter((e) => lifecycle(e, "effectTriggered", "AD1-025", "whenLeavesPlay"))).toHaveLength(0);
      expect(s.state.players[1]!.battleArea.some((permanent) => permanent.topCard.cardId === "AD1-025")).toBe(false);
      const battlePrevention = s.events.findIndex((e) => lifecycle(e, "effectResolved", "BT26-085", "AllTurns"));
      const execute = s.events.findIndex((e) => lifecycle(e, "effectTriggered", "BT26-060", "OnEndAttack"));
      const holy = s.events.findIndex((e) => lifecycle(e, "effectResolved", "BT26-016", "AllTurns"));
      const ended = s.events.findIndex((e) => e.kind === "attackEnded");
      for (const index of [battlePrevention, execute, ended]) expect(index).toBeGreaterThanOrEqual(0);
      const evolutionEffect = s.events.findIndex((e) => lifecycle(e, "effectResolved", "BT26-060", "WhenDigivolving"));
      expect(evolutionEffect).toBeGreaterThan(battlePrevention);
      expect(evolutionEffect).toBeLessThan(execute);
      expect(battlePrevention).toBeLessThan(execute);
      const holyOrder = holy === -1 ? [] : [execute < holy, holy < ended];
      expect(holyOrder).toEqual(holyProtection ? [true, true] : []);
      const executeResolved = s.events.findIndex((e) => lifecycle(e, "effectResolved", "BT26-060", "OnEndAttack"));
      const outerResolved = s.events.findIndex((e) => lifecycle(e, "effectResolved", "BT26-085", "OnEndTurn"));
      const turnEnded = s.events.findIndex((e) => e.kind === "turnEnded");
      for (const index of [executeResolved, outerResolved, turnEnded]) expect(index).toBeGreaterThanOrEqual(0);
      expect(executeResolved).toBeLessThan(ended);
      expect(ended).toBeLessThan(outerResolved);
      expect(outerResolved).toBeLessThan(turnEnded);
      expect(s.events.filter((e) => e.kind === "combatResolved")).toEqual([
        { kind: "combatResolved", seat: 0, attackerPermanentId: "perm-1", deletedPermanentIds: [] },
      ]);
    } finally {
      if (s.state.phase === Phase.Breeding) {
        s.engine.applyIntent(s.state.turnSeat, { type: "endPhase" });
        await advance(s.engine).waitForMainPhase(s.state.turnSeat);
      }
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  },
);

it("Feedback #79: declining Giant Slayer's first prevention deletes the original stack without free evolution or Holy payment", async () => {
  const s = board();
  const giant = s.inst("giant").instanceId;
  const destroy = s.inst("destroy").instanceId;
  const security = s.inst("securityTop").instanceId;
  const sourceIds = MATERIALS.map((_, i) => s.inst(`material${i}`).instanceId);
  s.state.memory = 2;
  const loop = s.engine.startTurnLoop();
  try {
    await settle(() => s.state.phase === Phase.Breeding);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);
    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: giant,
        assembly: { materialInstanceIds: [...sourceIds].reverse() },
      }),
    ).toEqual({ ok: true });
    await resolve(s, false, () => s.state.turnSeat === 1 && s.state.phase === Phase.Breeding, false);
    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.trash.map((c) => c.instanceId)).toEqual([destroy, ...sourceIds, giant, security]);
    expect(s.events.filter((e) => e.kind === "digivolved")).toHaveLength(0);
    expect(
      s.decisions.filter(
        ({ req }) => req.sourceCardId === "BT26-016" && req.promptText === "Prevent leaving the battle area?",
      ),
    ).toHaveLength(0);
    expect(s.events.filter((e) => lifecycle(e, "effectTriggered", "AD1-025", "whenLeavesPlay"))).toHaveLength(1);
    expect(s.events.filter((e) => e.kind === "securityChecked")).toHaveLength(0);
    expect(s.state.memory).toBe(5);
  } finally {
    if (s.state.phase === Phase.Breeding) {
      s.engine.applyIntent(s.state.turnSeat, { type: "endPhase" });
      await advance(s.engine).waitForMainPhase(s.state.turnSeat);
    }
    s.engine.applyIntent(0, { type: "surrender" });
    await loop;
  }
});

it("Feedback #79: an established Giant Slayer's ordinary battle has one deletion attempt and survives free evolution", async () => {
  const s = setupEngine(
    {
      0: {
        eggDeck: ["BT18-004"],
        battleArea: [{ card: "BT26-085", as: "giant", under: MATERIALS }],
        hand: ["BT1-009"],
        trash: [{ card: "BT26-060", as: "destroy" }],
        deck: Array(12).fill("BT1-009"),
        security: 3,
      },
      1: {
        eggDeck: ["BT18-004"],
        battleArea: [{ card: "AD1-025", as: "omni", under: ["AD1-004", "AD1-014"] }],
        hand: ["BT1-009"],
        deck: Array(12).fill("BT1-009"),
        security: 3,
      },
    },
    { autoOrderTriggers: false, autoOrderCards: false },
  );
  const host = s.perm("giant");
  const permanentId = host.permanentId;
  const seven = [...host.stack.map((c) => c.instanceId), host.topCard.instanceId, s.inst("destroy").instanceId];
  s.state.memory = 3;
  const loop = s.engine.startTurnLoop();
  try {
    await settle(() => s.state.phase === Phase.Breeding);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);
    expect(observe(s.engine).hasKeyword(host, "Execute")).toBe(false);
    expect(
      s.engine.applyIntent(0, { type: "attack", attackerPermanentId: permanentId, target: { kind: "player" } }),
    ).toEqual({ ok: true });
    await resolve(
      s,
      false,
      () =>
        s.events.some((e) => e.kind === "attackEnded") &&
        !s.state.pendingDecision &&
        !s.state.combatWindow &&
        s.engine.mainVerbContinuationsInFlight === 0,
    );
    expect(s.perm("giant").permanentId).toBe(permanentId);
    expect([...host.stack.map((c) => c.instanceId), host.topCard.instanceId]).toEqual(seven);
    expect(host.topCard.cardId).toBe("BT26-060");
    expect(s.state.players[0]!.trash).toHaveLength(0);
    expect(s.state.players[0]!.security).toHaveLength(3);
    expect(s.state.memory).toBe(3);
    expect(
      s.decisions.filter(
        ({ req }) => req.sourceCardId === "BT26-016" && req.promptText === "Prevent leaving the battle area?",
      ),
    ).toHaveLength(0);
    expect(s.events.filter((e) => lifecycle(e, "effectTriggered", "BT26-060", "OnEndAttack"))).toHaveLength(0);
    expect(s.events.filter((e) => lifecycle(e, "effectTriggered", "AD1-025", "whenLeavesPlay"))).toHaveLength(0);
    expect(s.events.filter((e) => e.kind === "securityChecked")).toHaveLength(0);
    expect(s.events.filter((e) => e.kind === "digivolved")).toHaveLength(1);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await settle(() => s.state.turnSeat === 1 && s.state.phase === Phase.Breeding);
    expect(s.state.memory).toBe(3);
  } finally {
    if (s.state.phase === Phase.Breeding) {
      s.engine.applyIntent(s.state.turnSeat, { type: "endPhase" });
      await advance(s.engine).waitForMainPhase(s.state.turnSeat);
    }
    s.engine.applyIntent(0, { type: "surrender" });
    await loop;
  }
});

it.each([false, true])("Feedback #79 playable Execute arena: exact Holy payment outcome %s", async (holyProtection) => {
  const s = setupEngine({}, { autoOrderTriggers: false, autoOrderCards: false });
  layScenarioFixture(s.state, fixtureVariant(preparedFixtures, "execute-replacement"));
  const loop = s.engine.startTurnLoop();
  try {
    await settle(() => s.state.phase === Phase.Breeding);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);
    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: fixtureInstanceId("feedback79-giant"),
        assembly: {
          materialInstanceIds: MATERIALS.map((_, i) => fixtureInstanceId(`feedback79-material-${i}`)).reverse(),
        },
      }),
    ).toEqual({ ok: true });
    await resolve(s, holyProtection, () => s.state.turnSeat === 1 && s.state.phase === Phase.Breeding);
    const player = s.state.players[0]!;
    expect(player.battleArea.map((p) => p.topCard.instanceId)).toEqual(
      holyProtection ? [fixtureInstanceId("feedback79-destroy")] : [],
    );
    expect(player.trash.map((c) => c.instanceId)).toEqual(
      holyProtection
        ? []
        : [
            ...MATERIALS.map((_, i) => fixtureInstanceId(`feedback79-material-${i}`)),
            fixtureInstanceId("feedback79-giant"),
            fixtureInstanceId("feedback79-destroy"),
          ],
    );
    expect(player.deck.slice(holyProtection ? -2 : -1).map((c) => c.instanceId)).toEqual(
      holyProtection
        ? [fixtureInstanceId("feedback79-cherub"), fixtureInstanceId("feedback79-security-0-0")]
        : [fixtureInstanceId("feedback79-cherub")],
    );
    expect(s.state.memory).toBe(5);
  } finally {
    if (s.state.phase === Phase.Breeding) {
      s.engine.applyIntent(s.state.turnSeat, { type: "endPhase" });
      await advance(s.engine).waitForMainPhase(s.state.turnSeat);
    }
    s.engine.applyIntent(0, { type: "surrender" });
    await loop;
  }
});

it("Feedback #79 playable ordinary arena: only battle deletion is prevented and the turn may pass normally", async () => {
  const s = setupEngine({}, { autoOrderTriggers: false, autoOrderCards: false });
  layScenarioFixture(s.state, fixtureVariant(preparedFixtures, "ordinary-replacement"));
  const loop = s.engine.startTurnLoop();
  try {
    await settle(() => s.state.phase === Phase.Breeding);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);
    const host = s.state.players[0]!.battleArea[0]!;
    expect(
      s.engine.applyIntent(0, { type: "attack", attackerPermanentId: host.permanentId, target: { kind: "player" } }),
    ).toEqual({ ok: true });
    await resolve(
      s,
      false,
      () =>
        s.events.some((e) => e.kind === "attackEnded") &&
        !s.state.pendingDecision &&
        !s.state.combatWindow &&
        s.engine.mainVerbContinuationsInFlight === 0,
    );
    expect(host.topCard.instanceId).toBe(fixtureInstanceId("feedback79-destroy"));
    expect(host.stack.map((c) => c.instanceId)).toEqual([
      ...MATERIALS.map((_, i) => fixtureInstanceId(`feedback79-material-${i}`)),
      fixtureInstanceId("feedback79-giant"),
    ]);
    expect(s.state.players[0]!.trash).toHaveLength(0);
    expect(s.state.players[0]!.security).toHaveLength(3);
    expect(s.state.memory).toBe(3);
    expect(
      s.decisions.filter(
        ({ req }) => req.sourceCardId === "BT26-016" && req.promptText === "Prevent leaving the battle area?",
      ),
    ).toHaveLength(0);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await settle(() => s.state.turnSeat === 1 && s.state.phase === Phase.Breeding);
    expect(s.state.memory).toBe(3);
  } finally {
    if (s.state.phase === Phase.Breeding) {
      s.engine.applyIntent(s.state.turnSeat, { type: "endPhase" });
      await advance(s.engine).waitForMainPhase(s.state.turnSeat);
    }
    s.engine.applyIntent(0, { type: "surrender" });
    await loop;
  }
});
