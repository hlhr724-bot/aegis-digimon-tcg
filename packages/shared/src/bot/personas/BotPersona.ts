export interface BotPersona {
  readonly id: string;
  readonly displayName: string;
  readonly portraitCardId?: string;
  readonly portraitArtId?: string;
}

export interface BotPersonaDeck {
  readonly mainDeck: readonly string[];
  readonly eggDeck: readonly string[];
}
