type CardIdentity = {
  cardId: string;
  artId?: string;
};

export function getPackCardKey(card: CardIdentity): string {
  return card.artId ?? card.cardId;
}
