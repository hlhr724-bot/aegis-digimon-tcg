import { getDeckFeaturedCardId } from "#api/accounts/getDeckFeaturedCardId";
import type { UsedDeck } from "@aegis/shared/decks/UsedDeck";
import { isDigimonWorldAvatarId } from "@aegis/shared/account/avatars";
import { getCardDefinition } from "@aegis/shared/cards/registry";
import type { LiveMatchPlayerPreview } from "@aegis/shared/protocol/LiveMatchPlayerPreview";
import type { PlayerState } from "@aegis/shared/schema/PlayerState";

type Params = {
  player: PlayerState;
  avatarUrl?: string;
  deck?: Pick<UsedDeck, "mainDeck" | "eggDeck" | "mainDeckArts" | "eggDeckArts">;
  preferredCardId?: string;
};

export function getLiveMatchPlayerPreview({
  player,
  avatarUrl,
  deck,
  preferredCardId,
}: Params): LiveMatchPlayerPreview {
  const candidates = [
    ...player.battleArea.map((permanent) => permanent.topCard),
    ...(player.breeding ? [player.breeding.topCard] : []),
    ...player.trash,
  ].filter((card) => card.faceUp && getCardDefinition(card.cardId));
  const card = candidates.sort(
    (first, second) => (getCardDefinition(second.cardId)?.level ?? 0) - (getCardDefinition(first.cardId)?.level ?? 0),
  )[0];
  let cardId = card?.cardId;
  let artId = card?.artId;
  if (deck && !player.hideIdentityFromSpectators) {
    const selected =
      preferredCardId && [...deck.mainDeck, ...deck.eggDeck].includes(preferredCardId)
        ? preferredCardId
        : getDeckFeaturedCardId(deck);
    if (selected && getCardDefinition(selected)) {
      cardId = selected;
      const index = deck.mainDeck.indexOf(selected);
      artId = index >= 0 ? deck.mainDeckArts?.[index] : deck.eggDeckArts?.[deck.eggDeck.indexOf(selected)];
    }
  }
  return {
    ...(!player.hideIdentityFromSpectators && isDigimonWorldAvatarId(player.avatarId)
      ? { avatarId: player.avatarId }
      : {}),
    ...(!player.hideIdentityFromSpectators && avatarUrl ? { avatarUrl } : {}),
    ...(cardId ? { cardId, ...(artId ? { artId } : {}) } : {}),
  };
}
