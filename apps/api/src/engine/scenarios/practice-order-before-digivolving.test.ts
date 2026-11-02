import { describe, expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/practice-order-before-digivolving.fixture";
import { advance } from "#api/engine/testkit/advance";
import { finishTurnLoop } from "#api/engine/testkit/finishTurnLoop";
import { settle, type EngineSetup } from "#api/engine/testkit/harness";
import { runFixtureBotTurn } from "#api/engine/testkit/runFixtureBotTurn";
import { setupScenario } from "#api/engine/testkit/scenario";

type ResolveAttackParams = { setup: EngineSetup; firstEffect: string };

async function resolveAttack({ setup, firstEffect }: ResolveAttackParams): Promise<void> {
  const ended = setup.events.filter((event) => event.kind === "attackEnded").length;
  let first = true;
  for (let step = 0; step < 8; step += 1) {
    await settle(
      () =>
        setup.state.pendingDecision?.kind === "orderTriggers" ||
        setup.state.gameOver ||
        setup.events.filter((event) => event.kind === "attackEnded").length > ended,
    );
    const pending = setup.state.pendingDecision;
    if (!pending || setup.state.gameOver) {
      return;
    }
    const request = setup.decisions.find(({ req }) => req.decisionId === pending.decisionId)!.req;
    const keys = request.options!.triggerKeys!;
    const selectedIndex = (request.options?.triggerDescriptions ?? []).findIndex((text) => text.includes(firstEffect));
    const selected = first ? keys[selectedIndex] : keys[0];
    expect(selected).toBeDefined();
    expect(
      setup.engine.applyIntent(pending.seat, {
        type: "respondDecision",
        decisionId: pending.decisionId,
        response: { kind: "orderTriggers", order: [selected!] },
      }),
    ).toEqual({ ok: true });
    first = false;
  }
  throw new Error("The attack did not finish after resolving its triggered effects");
}

describe("ordering effects before digivolving practice", () => {
  it("draws the Jamming evolution before resolving the other attack effect and wins with the surviving Digimon", async () => {
    const preferred: string[] = [];
    const s = setupScenario(fixture, {
      autoAcceptOptional: true,
      autoSelectCards: true,
      autoChooseOption: true,
      autoOrderTriggers: false,
      preferInstanceIds: preferred,
    });
    await s.ready();
    preferred.push(s.inst("attack-draw").instanceId);
    const player = s.state.players[0]!;
    const opponent = s.state.players[1]!;
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      const attacker = s.perm("kendogarurumon");
      expect(player.hand.some((card) => card.cardId === "BT4-030")).toBe(false);
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: attacker.permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await resolveAttack({ setup: s, firstEffect: "Draw 1" });
      const draw = s.events.findIndex(
        (event) =>
          event.kind === "effectTriggered" &&
          event.sourceCardId === "BT17-023" &&
          event.isInherited !== true &&
          event.description.includes("Draw 1"),
      );
      const evolved = s.events.findIndex((event) => event.kind === "digivolved" && event.cardId === "BT4-030");
      expect(draw).toBeGreaterThanOrEqual(0);
      expect(evolved).toBeGreaterThan(draw);
      expect(attacker.topCard.cardId).toBe("BT4-030");
      expect(attacker.currentDP).toBe(7000);
      expect(player.battleArea).toContain(attacker);
      expect(opponent.trash.map((card) => card.cardId)).toEqual(["ST2-10"]);
      expect(opponent.security).toHaveLength(0);
      expect(s.state.gameOver).toBe(false);
      expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
      await runFixtureBotTurn({ setup: s, fixture });
      await advance(s.engine).waitForMainPhase(0);
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: attacker.permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await resolveAttack({ setup: s, firstEffect: "Draw 1" });
      expect(
        s.events.some(
          (event) =>
            event.kind === "effectTriggered" && event.sourceCardId === "BT17-023" && event.isInherited === true,
        ),
      ).toBe(true);
      expect(s.state.gameOver).toBe(true);
      expect(s.state.winnerSeat).toBe(0);
    } finally {
      await finishTurnLoop({ setup: s, loop });
    }
  });

  it("loses the old normal Draw trigger when digivolving first and cannot survive the security battle", async () => {
    const preferred: string[] = [];
    const s = setupScenario(fixture, {
      autoAcceptOptional: true,
      autoSelectCards: true,
      autoChooseOption: true,
      autoOrderTriggers: false,
      preferInstanceIds: preferred,
    });
    await s.ready();
    preferred.push(s.inst("alternative").instanceId);
    const player = s.state.players[0]!;
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: s.perm("kendogarurumon").permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await resolveAttack({ setup: s, firstEffect: "digivolve" });
      expect(
        s.events.some(
          (event) =>
            event.kind === "effectTriggered" &&
            event.sourceCardId === "BT17-023" &&
            event.isInherited !== true &&
            event.description.includes("Draw 1"),
        ),
      ).toBe(false);
      expect(s.events.some((event) => event.kind === "digivolved" && event.cardId === "BT7-024")).toBe(true);
      expect(player.hand.some((card) => card.cardId === "BT4-030")).toBe(true);
      expect(player.battleArea).toHaveLength(0);
      expect(player.trash.map((card) => card.cardId)).toEqual(
        expect.arrayContaining(["BT1-029", "BT17-023", "BT7-024"]),
      );
      expect(s.state.players[1]!.security).toHaveLength(0);
      expect(s.state.gameOver).toBe(false);
    } finally {
      await finishTurnLoop({ setup: s, loop });
    }
  });
});
