import { expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import { getCardDefinition } from "@aegis/shared/cards/registry";
import "#api/cards/index";
import { getStoryScenario } from "#api/story/getStoryScenario";
import { getStorySeatDeck } from "#api/story/getStorySeatDeck";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";

it.each(["BT21-008", "BT24-008", "EX11-008"])("lets Owen digivolve %s onto his starting egg", async (rookie) => {
  const fixture = getStoryScenario("guardians-deep-owen")!;
  const player = fixture.board[0]!;
  const deck = getStorySeatDeck({ fixture, seat: 0 });
  expect(deck.mainDeck).toContain(rookie);
  player.hand = [rookie];
  const s = setupScenario(fixture, { autoDeclineOptional: true });
  await s.ready();
  const loop = s.engine.runOneTurn();
  try {
    await settle(() => s.state.phase === Phase.Breeding);
    const egg = s.state.players[0]!.breeding!;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: egg.permanentId,
        instanceId: s.state.players[0]!.hand.find((card) => card.cardId === rookie)!.instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => egg.topCard.cardId === rookie);
  } finally {
    s.engine.applyIntent(s.state.turnSeat, { type: "surrender" });
    await loop;
  }
});

it.each([
  ["BT21-008", "BT21-017", "BT24-016", "BT24-017"],
  ["BT24-008", "BT24-012", "BT24-016", "EX11-012"],
])("gives Owen a playable evolution line beginning with %s", async (...line) => {
  const fixture = getStoryScenario("guardians-deep-owen")!;
  const deck = getStorySeatDeck({ fixture, seat: 0 });
  for (const card of line) {
    expect(deck.mainDeck).toContain(card);
  }
  fixture.memory = 10;
  fixture.board[0]!.hand = line;
  const s = setupScenario(fixture, { autoDeclineOptional: true });
  await s.ready();
  const loop = s.engine.runOneTurn();
  try {
    await settle(() => s.state.phase === Phase.Breeding);
    const permanent = s.state.players[0]!.breeding!;
    for (const cardId of line) {
      const card = s.state.players[0]!.hand.find((entry) => entry.cardId === cardId)!;
      expect(
        s.engine.applyIntent(0, { type: "digivolve", permanentId: permanent.permanentId, instanceId: card.instanceId }),
      ).toEqual({ ok: true });
      await settle(() => permanent.topCard.cardId === cardId);
    }
    expect(permanent.stack.map((card) => card.cardId)).toEqual(["BT21-001", ...line.slice(0, -1)]);
  } finally {
    s.engine.applyIntent(s.state.turnSeat, { type: "surrender" });
    await loop;
  }
});

it("gives Close and the Deep Savers opponent complete breeding evolution stacks", async () => {
  const fixture = getStoryScenario("guardians-deep-close")!;
  const s = setupScenario(fixture);
  await s.ready();
  for (const seat of [0, 1] as const) {
    const permanent = s.state.players[seat]!.breeding!;
    const cards = [...permanent.stack, permanent.topCard].map((card) => card.cardId);
    for (let index = 1; index < cards.length; index++) {
      const base = getCardDefinition(cards[index - 1]!)!;
      expect(
        getCardDefinition(cards[index]!)!.evoCosts.some(
          (cost) => cost.level === base.level && base.colors.includes(cost.color),
        ),
      ).toBe(true);
    }
    const levels = cards.map((card) => getCardDefinition(card)!.level);
    expect(levels).toEqual(
      Array.from({ length: getCardDefinition(permanent.topCard.cardId)!.level! - 1 }, (_, i) => i + 2),
    );
  }
  expect(s.state.players[0]!.breeding!.topCard.cardId).toBe("EX8-051");
});

it("lets Violet raise Ghostmon and evolve through Soulmon and Phantomon into Necromon", async () => {
  const fixture = getStoryScenario("black-emperor-dragon")!;
  const deck = getStorySeatDeck({ fixture, seat: 0 });
  for (const card of ["BT20-063", "BT20-067", "BT20-072", "BT20-079", "BT20-088", "BT20-098"]) {
    expect(deck.mainDeck).toContain(card);
  }
  const s = setupScenario(fixture, { autoSelectCards: true, autoDeclineOptional: true });
  await s.ready();
  const loop = s.engine.runOneTurn();
  try {
    await settle(() => s.state.phase === Phase.Breeding);
    const ghost = s.state.players[0]!.breeding!;
    expect(s.engine.applyIntent(0, { type: "moveFromBreeding", permanentId: ghost.permanentId })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);
    for (const cardId of ["BT20-067", "BT20-072", "BT20-079"]) {
      const card = s.state.players[0]!.hand.find((entry) => entry.cardId === cardId)!;
      expect(
        s.engine.applyIntent(0, { type: "digivolve", permanentId: ghost.permanentId, instanceId: card.instanceId }),
      ).toEqual({ ok: true });
      await settle(() => ghost.topCard.cardId === cardId && !s.state.pendingDecision);
    }
    expect(ghost.stack.map((card) => card.cardId)).toEqual(["BT20-006", "BT20-063", "BT20-067", "BT20-072"]);
  } finally {
    s.engine.applyIntent(s.state.turnSeat, { type: "surrender" });
    await loop;
  }
});

it("gives Owen the opening turn before Shoto can attack with his three starting Digimon", async () => {
  const fixture = getStoryScenario("dragonkin-aggro")!;
  expect(fixture.turnSeat).toBe(1);
  expect(fixture.isFirstPlayersFirstTurn).toBe(false);
  const s = setupScenario(fixture, { autoDeclineOptional: true, autoOrderTriggers: true, autoSelectCards: true });
  await s.ready();
  const loop = s.engine.runOneTurn();
  try {
    await settle(() => s.engine.breeding.isOpen);
    const lamiamon = s.state.players[1]!.breeding!;
    expect(lamiamon.topCard.cardId).toBe("BT21-025");
    expect(s.engine.applyIntent(1, { type: "moveFromBreeding", permanentId: lamiamon.permanentId })).toEqual({
      ok: true,
    });
    await advance(s.engine).waitForMainPhase(1);
    expect(s.state.players[1]!.battleArea).toContain(lamiamon);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.state.players[0]!.battleArea[0]!.permanentId,
        target: { kind: "player" },
      }).ok,
    ).toBe(false);
    expect(s.state.turnSeat).toBe(1);
    expect(s.state.gameOver).toBe(false);
  } finally {
    s.engine.applyIntent(s.state.turnSeat, { type: "surrender" });
    await loop;
  }
});
