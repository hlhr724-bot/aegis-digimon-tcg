import prepared0 from "./tomoro-on-play.fixture.js";
import prepared1 from "./tomoro-timing.fixture.js";
import { fixtureVariant, fixtureInstanceId, fixturePermanentId } from "../scenario/references.js";

import { expect, it } from "vitest";
import { Phase } from "@aegis/shared";
import { layScenarioFixture } from "../scenario/fixture.js";

import { advance } from "../testkit/advance.js";
import { setupEngine, settle } from "../testkit/harness.js";
import "../../cards/index.js";

const preparedFixtures = { "tomoro-on-play": prepared0, "tomoro-timing": prepared1 };

async function replyOptional(s: ReturnType<typeof setupEngine>, cardId: string, accept: boolean) {
  await settle(() => s.state.pendingDecision?.kind === "optional");
  const req = s.decisions.at(-1)!.req;
  expect(req.sourceCardId).toBe(cardId);
  expect(
    s.engine.applyIntent(s.state.pendingDecision!.seat, {
      type: "respondDecision",
      decisionId: req.decisionId,
      response: { kind: "optional", accept },
    }),
  ).toEqual({ ok: true });
}

it("Feedback #75: original empty-field On Play passes the turn without memory, then later Start Main gains with a real opponent", async () => {
  const s = setupEngine({ autoAcceptOptional: true, autoSelectCards: true });
  layScenarioFixture(s.state, fixtureVariant(preparedFixtures, "tomoro-on-play"));
  const loop = s.engine.startTurnLoop();
  try {
    await settle(() => s.state.phase === Phase.Breeding);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: fixtureInstanceId("feedback75-tomoro") })).toEqual({
      ok: true,
    });
    await settle(() => s.state.turnSeat === 1 && s.state.phase === Phase.Breeding);
    const tomoro = s.state.players[0]!.battleArea.find(
      (perm) => perm.topCard.instanceId === fixtureInstanceId("feedback75-tomoro"),
    )!;
    expect(tomoro.stack.map((card) => card.instanceId)).toEqual([fixtureInstanceId("feedback75-deck-0-1")]);
    expect(s.state.memory).toBe(4);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(1);
    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: fixtureInstanceId("feedback75-deck-1-0") })).toEqual(
      { ok: true },
    );
    await settle(() => s.engine.mainVerbContinuationsInFlight === 0 && !s.state.pendingDecision);
    expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });
    await settle(() => s.state.turnSeat === 0 && s.state.phase === Phase.Breeding);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);
    await settle(() => s.state.memory === 4 && !s.state.pendingDecision);
    expect(tomoro.stack.map((card) => card.instanceId)).toEqual([
      fixtureInstanceId("feedback75-deck-0-3"),
      fixtureInstanceId("feedback75-deck-0-1"),
    ]);
    expect(
      s.events.flatMap((event) =>
        event.kind === "memoryChanged" && event.reason === "gainMemory" ? [[event.from, event.to]] : [],
      ),
    ).toEqual([[3, 4]]);
  } finally {
    s.engine.applyIntent(0, { type: "surrender" });
    await loop;
  }
});

it.each([true, false])(
  "Feedback #75: real-turn own buff acceptance %s persists only through the opponent's turn",
  async (accept) => {
    const s = setupEngine({
      autoSelectCards: true,
      preferInstanceIds: [fixturePermanentId("dev-perm-0-feedback75-glowing")],
    });
    layScenarioFixture(s.state, fixtureVariant(preparedFixtures, "tomoro-timing"));
    const loop = s.engine.startTurnLoop();
    try {
      await settle(() => s.state.phase === Phase.Breeding);
      expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
      await replyOptional(s, "ST23-13", false);
      await settle(() => s.state.memory === 4 && !s.state.pendingDecision);
      const tomoro = s.state.players[0]!.battleArea.find(
        (perm) => perm.permanentId === fixturePermanentId("dev-perm-0-feedback75-tomoro"),
      )!;
      const glowing = s.state.players[0]!.battleArea.find(
        (perm) => perm.permanentId === fixturePermanentId("dev-perm-0-feedback75-glowing"),
      )!;
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: fixtureInstanceId("feedback75-chirop") })).toEqual(
        { ok: true },
      );
      await replyOptional(s, "ST23-12", true);
      await replyOptional(s, "ST23-12", true);
      await replyOptional(s, "ST23-13", accept);
      await settle(() => !s.state.pendingDecision && s.engine.mainVerbContinuationsInFlight === 0);
      expect(s.state.memory).toBe(1);
      expect(tomoro.isSuspended).toBe(accept);
      expect(glowing.currentDP).toBe(accept ? 7000 : 4000);
      expect(tomoro.stack.map((card) => card.instanceId)).toEqual([
        fixtureInstanceId("dev-stack-0-feedback75-tomoro-1"),
      ]);
      expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toEqual([
        fixtureInstanceId("dev-stack-0-feedback75-tomoro-0"),
      ]);
      expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(fixtureInstanceId("feedback75-return"));
      const tomoroDecisions = s.decisions.filter(({ req }) => req.sourceCardId === "ST23-13").length;
      expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
      await settle(() => s.state.turnSeat === 1 && s.state.phase === Phase.Breeding);
      expect(glowing.currentDP).toBe(accept ? 7000 : 4000);
      expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });
      await advance(s.engine).waitForMainPhase(1);
      expect(
        s.engine.applyIntent(1, {
          type: "attack",
          attackerPermanentId: fixturePermanentId("dev-perm-1-feedback75-attacker"),
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await replyOptional(s, "BT26-003", true);
      await settle(
        () =>
          s.state.players[1]!.trash.some(
            (card) => card.instanceId === fixtureInstanceId("dev-field-1-feedback75-attacker"),
          ) && !s.state.pendingDecision,
      );
      expect(tomoro.stack).toHaveLength(0);
      expect(tomoro.isSuspended).toBe(accept);
      expect(glowing.currentDP).toBe(accept ? 7000 : 4000);
      expect(s.decisions.filter(({ req }) => req.sourceCardId === "ST23-13")).toHaveLength(tomoroDecisions);
      expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toEqual([
        fixtureInstanceId("dev-stack-0-feedback75-tomoro-0"),
        fixtureInstanceId("dev-stack-0-feedback75-tomoro-1"),
      ]);
      expect(s.state.players[0]!.security).toHaveLength(3);
      expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });
      await settle(() => s.state.turnSeat === 0 && s.state.phase === Phase.Breeding);
      expect(glowing.currentDP).toBe(4000);
      expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
      await replyOptional(s, "ST23-13", false);
      await settle(() => !s.state.pendingDecision);
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  },
);

it.each([
  ["empty", true, -4, 1],
  ["empty", false, -4, 0],
  ["digimon", true, -3, 1],
  ["digimon", false, -3, 0],
  ["breeding", true, -4, 1],
  ["tamer", true, -4, 1],
] as const)(
  "Feedback #75: On Play with opponent %s, placement %s leaves memory %s",
  async (opponent, accept, memory, sources) => {
    const s = setupEngine(
      {
        0: { hand: [{ card: "ST23-13", as: "tomoro" }], deck: [{ card: "BT1-009", as: "top" }, "BT1-009"] },
        1: {
          battleArea:
            opponent === "digimon"
              ? [{ card: "BT17-020", as: "opponent" }]
              : opponent === "tamer"
                ? [{ card: "ST23-13", as: "opponent" }]
                : [],
          breeding: opponent === "breeding" ? { card: "BT17-020", as: "bred" } : undefined,
        },
      },
      { autoAcceptOptional: accept, autoDeclineOptional: !accept, autoSelectCards: true },
    );
    s.state.memory = 0;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("tomoro").instanceId })).toEqual({
      ok: true,
    });
    await settle(
      () =>
        s.state.players[0]!.battleArea.some((perm) => perm.topCard.instanceId === s.inst("tomoro").instanceId) &&
        !s.state.pendingDecision &&
        s.engine.mainVerbContinuationsInFlight === 0,
    );
    const tomoro = s.state.players[0]!.battleArea[0]!;
    expect(s.state.memory).toBe(memory);
    expect(tomoro.stack.map((card) => card.instanceId)).toEqual(sources ? [s.inst("top").instanceId] : []);
    expect(tomoro.stack.every((card) => !card.faceUp)).toBe(true);
    expect(s.state.players[0]!.hand).toHaveLength(0);
    expect(s.state.players[0]!.trash).toHaveLength(0);
    expect(s.state.players[0]!.deck).toHaveLength(2 - sources);
    expect(
      s.events
        .filter((event) => event.kind === "memoryChanged" && event.reason === "payCost")
        .map((event) => (event.kind === "memoryChanged" ? [event.from, event.to] : [])),
    ).toEqual([[0, -4]]);
  },
);

it.each(["accept", "decline", "suspended"] as const)(
  "Feedback #75: own-turn source payment %s preserves Tomoro's optional suspend cost",
  async (mode) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "ST23-13", as: "tomoro", under: [{ card: "BT1-009", as: "cost", faceUp: false }] },
            { card: "ST23-11", as: "glowing" },
          ],
          hand: [{ card: "ST23-12", as: "chirop" }],
          trash: [{ card: "ST23-03", as: "return" }],
          deck: ["BT1-009", "BT1-009"],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 10;
    s.perm("tomoro").isSuspended = mode === "suspended";
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("chirop").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const cost = s.decisions.at(-1)!.req;
    expect(cost.sourceCardId).toBe("ST23-12");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: cost.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await replyOptional(s, "ST23-12", true);
    await settle(() => s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("return").instanceId));
    if (mode !== "suspended") await replyOptional(s, "ST23-13", mode === "accept");
    await settle(() => !s.state.pendingDecision && s.engine.mainVerbContinuationsInFlight === 0);
    expect(s.perm("tomoro").isSuspended).toBe(mode !== "decline");
    expect(s.perm("glowing").currentDP).toBe(mode === "accept" ? 7000 : 4000);
    expect(s.perm("tomoro").stack).toHaveLength(0);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toEqual([s.inst("cost").instanceId]);
    expect(s.state.memory).toBe(7);
  },
);

it("Feedback #75: opponent attack paying Kyaromon's under-Tamer cost does not activate Tomoro's Your Turn buff", async () => {
  const s = setupEngine(
    {
      0: {
        battleArea: [
          { card: "ST23-13", as: "tomoro", under: [{ card: "BT1-009", as: "cost", faceUp: false }] },
          { card: "ST23-11", as: "glowing", under: [{ card: "BT26-003", as: "egg" }] },
        ],
        deck: ["BT1-009", "BT1-009"],
        security: ["BT1-009", "BT1-009"],
      },
      1: {
        battleArea: [{ card: "BT1-009", as: "attacker" }],
        deck: ["BT1-009", "BT1-009"],
        security: ["BT1-009", "BT1-009"],
      },
    },
    { autoAcceptOptional: true, autoSelectCards: true },
  );
  s.state.turnSeat = 1;
  s.state.memory = 3;
  await s.ready();
  expect(
    s.engine.applyIntent(1, {
      type: "attack",
      attackerPermanentId: s.perm("attacker").permanentId,
      target: { kind: "player" },
    }),
  ).toEqual({ ok: true });
  await settle(() => s.state.players[1]!.trash.some((card) => card.instanceId === s.inst("attacker").instanceId));
  expect(s.perm("tomoro").stack).toHaveLength(0);
  expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toEqual([s.inst("cost").instanceId]);
  expect(s.perm("tomoro").isSuspended).toBe(false);
  expect(s.perm("glowing").currentDP).toBe(4000);
  expect(s.events.filter((event) => event.kind === "effectTriggered" && event.sourceCardId === "ST23-13")).toHaveLength(
    0,
  );
});
