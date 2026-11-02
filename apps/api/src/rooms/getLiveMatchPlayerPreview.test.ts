import { describe, expect, it } from "vitest";
import { CardInstance } from "@aegis/shared/schema/CardInstance";
import { Permanent } from "@aegis/shared/schema/Permanent";
import { PlayerState } from "@aegis/shared/schema/PlayerState";
import { getLiveMatchPlayerPreview } from "#api/rooms/getLiveMatchPlayerPreview";

function createCard(cardId: string, faceUp = true): CardInstance {
  return Object.assign(new CardInstance(), { cardId, faceUp });
}

describe("live player previews", () => {
  it("shows the strongest public card with its chosen printing and player portrait", () => {
    const player = new PlayerState();
    player.avatarId = "greymon";
    const card = Object.assign(createCard("BT1-010"), { artId: "BT1-010_P1" });
    player.battleArea.push(Object.assign(new Permanent(), { topCard: card }));
    player.trash.push(createCard("BT1-001"));
    expect(getLiveMatchPlayerPreview({ player, avatarUrl: "/account/avatar/player/image?v=1" })).toEqual({
      avatarId: "greymon",
      avatarUrl: "/account/avatar/player/image?v=1",
      cardId: "BT1-010",
      artId: "BT1-010_P1",
    });
  });

  it("uses the saved favorite ahead of stronger cards and preserves its selected printing", () => {
    const player = new PlayerState();
    player.battleArea.push(Object.assign(new Permanent(), { topCard: createCard("BT1-084") }));
    expect(
      getLiveMatchPlayerPreview({
        player,
        preferredCardId: "BT1-010",
        deck: { mainDeck: ["BT1-010", "BT1-084"], eggDeck: [], mainDeckArts: ["BT1-010_P1", "BT1-084"] },
      }),
    ).toEqual({ cardId: "BT1-010", artId: "BT1-010_P1" });
  });

  it("ignores a favorite that is not in the played deck", () => {
    expect(
      getLiveMatchPlayerPreview({
        player: new PlayerState(),
        preferredCardId: "BT1-001",
        deck: { mainDeck: ["BT1-010", "BT1-084"], eggDeck: [] },
      }),
    ).toEqual({ cardId: "BT1-084" });
  });

  it("never takes a card from the deck, hand, security or a face-down public card", () => {
    const player = new PlayerState();
    player.deck.push(createCard("BT1-010"));
    player.hand.push(createCard("BT1-010"));
    player.security.push(createCard("BT1-010"));
    player.battleArea.push(Object.assign(new Permanent(), { topCard: createCard("BT1-010", false) }));
    player.trash.push(createCard("BT1-010", false));
    expect(getLiveMatchPlayerPreview({ player })).toEqual({});
  });

  it("redacts both avatar sources when spectator identity is hidden", () => {
    const player = new PlayerState();
    player.avatarId = "greymon";
    player.hideIdentityFromSpectators = true;
    player.breeding = Object.assign(new Permanent(), { topCard: createCard("BT1-001") });
    expect(getLiveMatchPlayerPreview({ player, avatarUrl: "https://cdn.discordapp.com/avatar.png" })).toEqual({
      cardId: "BT1-001",
    });
  });
});
