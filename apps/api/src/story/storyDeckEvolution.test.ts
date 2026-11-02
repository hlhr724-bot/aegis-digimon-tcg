import { describe, expect, it } from "vitest";
import { canDigivolveOntoWithAlternates, definitionOf } from "#api/engine/cards/cardData";
import { Phase } from "@aegis/shared/schema/enums";
import { storyBattles } from "@aegis/shared/story/storyBattles";
import "#api/cards/index";
import { getStoryScenario } from "#api/story/getStoryScenario";
import { getStorySeatDeck } from "#api/story/getStorySeatDeck";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";

const lines = [
  {
    battle: "world-championship-finals",
    seat: 1,
    egg: "BT21-001",
    cards: ["BT21-007", "BT21-017", "BT24-016", "BT21-026"],
  },
  { battle: "altea-shinjuku", seat: 0, egg: "EX11-004", cards: ["EX11-037", "EX11-039", "EX11-041", "BT20-055"] },
  { battle: "altea-mistymon", seat: 0, egg: "EX11-004", cards: ["EX11-037", "EX11-039", "EX11-041", "BT20-055"] },
  { battle: "altea-mistymon", seat: 1, egg: "EX13-004", cards: ["EX13-025", "BT18-036", "BT18-039", "EX13-037"] },
  {
    battle: "altea-shinjuku",
    seat: 1,
    egg: "BT15-006",
    cards: ["EX9-058", "BT18-013", "BT18-015", "BT18-073", "BT18-019"],
  },
  { battle: "ryutaro-heroes", seat: 1, egg: "EX10-004", cards: ["EX6-018", "EX10-052", "AD1-018"] },
  ...["yuuki-temple-priest-loss", "winr-good-game"].map((battle) => ({
    battle,
    seat: 1,
    egg: "EX8-004",
    cards: ["EX7-038", "EX7-041", "EX7-045", "EX7-047", "EX7-037"],
  })),
  ...[
    "guardians-deep-shoto",
    "guardians-deep-owen",
    "guardians-deep-close",
    "yuuki-emerald-npc",
    "winr-village-defence",
    "yuuki-cross-connectia-npcs",
  ].map((battle) => ({ battle, seat: 1, egg: "EX8-002", cards: ["EX8-018", "EX8-021", "EX8-024", "EX8-027"] })),
] as const;

describe("story deck evolution routes", () => {
  it.each(lines)("supports the supplied breeding line for $battle seat $seat", async ({ battle, seat, egg, cards }) => {
    const fixture = getStoryScenario(battle)!;
    const actingSeat = seat as 0 | 1;
    const deck = getStorySeatDeck({ fixture, seat: actingSeat });
    expect(deck.eggDeck).toContain(egg);
    for (const card of cards) {
      expect(deck.mainDeck).toContain(card);
    }
    fixture.turnSeat = actingSeat;
    fixture.memory = 10;
    fixture.isFirstPlayersFirstTurn = true;
    fixture.board[actingSeat]!.hand = [...cards];
    fixture.board[actingSeat]!.breeding = { card: egg };
    const s = setupScenario(fixture, { autoDeclineOptional: true });
    await s.ready();
    const loop = s.engine.runOneTurn();
    try {
      await settle(() => s.state.phase === Phase.Breeding);
      const player = s.state.players[actingSeat]!;
      const host = player.breeding!;
      for (const cardId of cards) {
        s.state.memory = 10;
        const card = player.hand.find((entry) => entry.cardId === cardId)!;
        expect(
          s.engine.applyIntent(actingSeat, {
            type: "digivolve",
            permanentId: host.permanentId,
            instanceId: card.instanceId,
          }),
        ).toEqual({ ok: true });
        await settle(() => host.topCard.cardId === cardId);
      }
      expect(host.stack.map((card) => card.cardId)).toEqual([egg, ...cards.slice(0, -1)]);
    } finally {
      s.engine.applyIntent(s.state.turnSeat, { type: "surrender" });
      await loop;
    }
  });

  it("preserves Altea and Chitose's starting security counts in Shinjuku", () => {
    const fixture = getStoryScenario("altea-shinjuku")!;
    expect(fixture.board[0]!.security).toHaveLength(2);
    expect(fixture.board[1]!.security).toHaveLength(4);
  });

  it.each(storyBattles.filter((battle) => battle.playable))(
    "supplies a legal starting breeding stack for $id",
    ({ id }) => {
      const fixture = getStoryScenario(id)!;
      for (const seat of [0, 1] as const) {
        const permanent = fixture.board[seat]!.breeding;
        if (!permanent) {
          continue;
        }
        const top = typeof permanent === "string" ? permanent : permanent.card;
        if (definitionOf(top).level === 2) {
          continue;
        }
        const under = typeof permanent === "string" ? [] : (permanent.under ?? []);
        const cards = [...under.map((card) => (typeof card === "string" ? card : card.card)), top];
        expect(definitionOf(cards[0]!).level).toBe(2);
        for (let index = 1; index < cards.length; index++) {
          expect(canDigivolveOntoWithAlternates(cards[index]!, cards[index - 1]!)).toBe(true);
        }
      }
    },
  );

  it.each(storyBattles.filter((battle) => battle.playable))(
    "places active Delay options on the battle area for $id",
    ({ id }) => {
      const fixture = getStoryScenario(id)!;
      for (const seat of [0, 1] as const) {
        expect(fixture.board[seat]!.delayZone ?? []).toEqual([]);
      }
    },
  );
});
