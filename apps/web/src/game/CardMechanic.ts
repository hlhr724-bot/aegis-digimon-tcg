export const CardMechanic = {
  DNA_DIGIVOLUTION: {
    name: "DNA_DIGIVOLUTION",
    value: "dnaDigivolution",
    rule: "8-2",
    pattern: /^DNA Digivol(?:ve|ution)$/i,
    reminder:
      "Stack the named Digimon from your battle area in the order shown, then digivolve them into this card from your hand by paying the cost. The new Digimon is unsuspended.",
  },
  APP_FUSION: {
    name: "APP_FUSION",
    value: "appFusion",
    rule: "8-4",
    pattern: /^App Fusion$/i,
    reminder:
      "Choose a linked pair of the named cards in your battle area. Place the link card on top of its Digimon, then digivolve them into this card from your hand by paying the cost.",
  },
  DIGIXROS: {
    name: "DIGIXROS",
    value: "digiXros",
    rule: "7-2",
    pattern: /^DigiXros\s*-\d+$/i,
    reminder:
      "When you play this card, you may place any of the named cards from your hand or battle area under it. Each card placed reduces the play cost by the amount shown.",
  },
  ASSEMBLY: {
    name: "ASSEMBLY",
    value: "assembly",
    rule: "7-3",
    pattern: /^Assembly\s*-\d+$/i,
    reminder:
      "When you play this card, you may place the stated number of named cards from your trash under it to reduce the play cost by the amount shown.",
  },
} as const;

export type CardMechanic = (typeof CardMechanic)[keyof typeof CardMechanic]["value"];
