export const OFFICIAL_COMPREHENSIVE_RULES_URL = "https://world.digimoncard.com/rule/pdf/general_rule.pdf";

export interface KeywordGlossaryEntry {
  rule: string;
  reminder: string;
}

export const KEYWORD_GLOSSARY: Readonly<Record<string, KeywordGlossaryEntry>> = {
  SecurityAttack: {
    rule: "16-4",
    reminder: "Changes how many security cards this Digimon checks when it attacks.",
  },
  Blocker: {
    rule: "16-5",
    reminder:
      "When an opponent's Digimon attacks, you may suspend this Digimon to force the opponent to attack it instead.",
  },
  Recovery: {
    rule: "16-6",
    reminder: "Place the specified number of cards from the specified area face down on top of your security stack.",
  },
  Piercing: {
    rule: "16-7",
    reminder:
      "When this Digimon attacks and deletes an opponent's Digimon and survives the battle, it performs any security checks it normally would.",
  },
  Draw: { rule: "16-8", reminder: "Draw X card(s) from your deck." },
  Jamming: { rule: "16-9", reminder: "This Digimon can't be deleted in battles against Security Digimon." },
  Digisorption: {
    rule: "16-10",
    reminder:
      "When one of your Digimon digivolves into this card from your hand, you may suspend 1 of your Digimon to reduce the digivolution cost by X.",
  },
  Reboot: { rule: "16-11", reminder: "Unsuspend this Digimon during your opponent's unsuspend phase." },
  DeDigivolve: {
    rule: "16-12",
    reminder:
      "Trash up to X top cards from the chosen Digimon. Stop when it has no digivolution cards or its level is 3 or lower.",
  },
  Retaliation: {
    rule: "16-13",
    reminder: "When this Digimon is deleted after losing a battle, delete the Digimon it was battling.",
  },
  DigiBurst: {
    rule: "16-14",
    reminder: "Trash X of this Digimon's digivolution cards to activate the effect that follows.",
  },
  Rush: { rule: "16-15", reminder: "This Digimon can attack the turn it comes into play." },
  Blitz: {
    rule: "16-16",
    reminder: "When this effect activates, this Digimon may attack if your opponent has 1 or more memory.",
  },
  Delay: {
    rule: "16-17",
    reminder:
      "Trash this card in your battle area to activate the effect that follows. You can't activate it the turn this card enters play.",
  },
  Decoy: {
    rule: "16-18",
    reminder:
      "When one of your other Digimon of the named kind would be deleted by an opponent's effect, you may delete this Digimon to prevent that deletion.",
  },
  ArmorPurge: {
    rule: "16-19",
    reminder:
      "When this Digimon would be deleted, you may trash the top card of this Digimon to prevent that deletion.",
  },
  Save: { rule: "16-20", reminder: "You may place this card under 1 of your Tamers." },
  MaterialSave: {
    rule: "16-21",
    reminder:
      "When this Digimon would be deleted, you may place X cards named in its DigiXros requirements from its digivolution cards under 1 of your Tamers.",
  },
  Evade: {
    rule: "16-22",
    reminder: "When this Digimon would be deleted, you may suspend it to prevent that deletion.",
  },
  Raid: {
    rule: "16-23",
    reminder:
      "When this Digimon attacks, you may switch the attack target to your opponent's unsuspended Digimon with the highest DP.",
  },
  Alliance: {
    rule: "16-24",
    reminder:
      "When this Digimon attacks, you may suspend 1 of your other Digimon. This Digimon gets that Digimon's DP and <Security A. +1> for the attack.",
  },
  Barrier: {
    rule: "16-25",
    reminder:
      "When this Digimon would be deleted in battle, you may trash the top card of your security stack to prevent that deletion.",
  },
  BlastDigivolve: {
    rule: "16-26",
    reminder:
      "One of your Digimon may digivolve into this card in your hand without paying the cost, meeting its requirements.",
  },
  Fortitude: {
    rule: "16-27",
    reminder: "When this Digimon is deleted while it has digivolution cards, play it without paying the cost.",
  },
  MindLink: {
    rule: "16-28",
    reminder: "Place this Tamer in the digivolution cards of one of your Digimon that has no Tamer cards there.",
  },
  Partition: {
    rule: "16-29",
    reminder:
      "When this Digimon would leave the battle area other than by your effects or a battle, you may play 1 of each named card from its digivolution cards without paying the cost.",
  },
  Collision: {
    rule: "16-30",
    reminder: "While this Digimon attacks, all of your opponent's Digimon gain <Blocker> and must block if able.",
  },
  BlastDNADigivolve: {
    rule: "16-31",
    reminder:
      "The named Digimon and a named card in your hand may DNA digivolve into this card in your hand without paying the cost.",
  },
  Scapegoat: {
    rule: "16-32",
    reminder:
      "When this Digimon would be deleted other than by your effects, you may delete 1 of your other Digimon to prevent that deletion.",
  },
  Vortex: {
    rule: "16-33",
    reminder: "At the end of your turn, this Digimon may attack an opponent's Digimon, even the turn it was played.",
  },
  Overclock: {
    rule: "16-34",
    reminder:
      "At the end of your turn, you may delete 1 of your Tokens or 1 of your other named Digimon. If you do, this Digimon attacks a player without suspending.",
  },
  Iceclad: {
    rule: "16-35",
    reminder:
      "In battles other than against Security Digimon, compare digivolution card counts instead of DP. More cards wins.",
  },
  Decode: {
    rule: "16-36",
    reminder:
      "When this Digimon would leave the battle area other than by a battle, you may play 1 named Digimon card from its digivolution cards without paying the cost.",
  },
  Fragment: {
    rule: "16-37",
    reminder: "When this Digimon would be deleted, you may trash X of its digivolution cards to prevent that deletion.",
  },
  Execute: {
    rule: "16-38",
    reminder:
      "At the end of your turn, this Digimon may attack, even an unsuspended Digimon. At the end of that attack, delete it.",
  },
  Progress: {
    rule: "16-39",
    reminder: "While this Digimon attacks, it isn't affected by your opponent's effects.",
  },
  Link: { rule: "16-40", reminder: "This Digimon can have X more link cards." },
  Training: {
    rule: "16-41",
    reminder:
      "[Main] Suspend this Digimon to place the top card of your deck at the bottom of its digivolution cards. Works in the breeding area too.",
  },
  UseReq: {
    rule: "16-42",
    reminder: "You may ignore this card's color requirements when you have the named cards on your field.",
  },
  Ascension: {
    rule: "16-43",
    reminder: "When this card is deleted, you may place it on top of your security stack.",
  },
  Engage: { rule: "16-44", reminder: "At the end of your turn, this Digimon may attack." },
  Guard: {
    rule: "16-45",
    reminder:
      "When another of your Digimon would leave the battle area by an opponent's effect, you may delete this Digimon so it stays.",
  },
  Detach: {
    rule: "16-46",
    reminder:
      "When this Digimon would leave the battle area other than by your effects, you may trash 1 of its named link cards so it stays.",
  },
  Succession: {
    rule: "16-47",
    reminder: "This Digimon gains every effect except <Succession> on its topmost named digivolution card.",
  },
};
