/** Activatable [Main] effect of a permanent, one entry per effect. */
export interface CardActionEffect {
  label: string;
  sourceCardId?: string;
  onActivate: () => void;
}

/** Link this permanent's top card to another of the player's Digimon (§6-5-1-4). */
export interface CardActionLink {
  onLink: () => void;
}

/** Extra action for a breeding-area card (hatch / move to the battle area). */
export interface CardActionPromote {
  label: string;
  onPromote: () => void;
}
