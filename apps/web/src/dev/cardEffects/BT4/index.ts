import type { CardEffectsFixtureBuilder } from "../fixture";
import { effectBt3Demo, vanillaBt3Demo } from "../vanilla";

export const bt4Fixtures: Record<string, CardEffectsFixtureBuilder> = {
  "BT4-001": (cardId) =>
    effectBt3Demo(cardId, "Sakuttomon", 0, "Sakuttomon gained 1 memory when its level 7 host attacked."),
  "BT4-002": (cardId) =>
    effectBt3Demo(
      cardId,
      "Bukamon",
      0,
      "Bukamon trashed the bottom source of an opposing level 4 or lower Digimon when attacking.",
    ),
  "BT4-003": (cardId) =>
    effectBt3Demo(
      cardId,
      "Koromon",
      0,
      "Koromon gave an opposing Digimon -1000 DP when its host attacked at 3 security.",
    ),
  "BT4-004": (cardId) => effectBt3Demo(cardId, "Budmon", 0, "Budmon gave its host +1000 DP while it had Digi-Burst."),
  "BT4-005": (cardId) =>
    effectBt3Demo(cardId, "Missimon", 0, "Missimon gave its D-Brigade host +1000 DP during its turn."),
  "BT4-006": (cardId) =>
    effectBt3Demo(
      cardId,
      "Xiaomon",
      0,
      "Xiaomon granted Retaliation to its host while there were at least 10 cards in trash.",
    ),
  "BT4-007": (cardId) => vanillaBt3Demo(cardId, "Otamamon", 5000),
  "BT4-008": (cardId) =>
    effectBt3Demo(
      cardId,
      "Agumon",
      2000,
      "Agumon returned itself to hand after being trashed for its host's Digi-Burst.",
    ),
  "BT4-009": (cardId) =>
    effectBt3Demo(
      cardId,
      "Flamemon",
      2000,
      "Flamemon revealed cards and added a Hybrid Digimon and a red Tamer to hand.",
    ),
  "BT4-010": (cardId) => vanillaBt3Demo(cardId, "Fugamon", 3000),
  "BT4-011": (cardId) =>
    effectBt3Demo(cardId, "Agunimon", 5000, "Agunimon digivolved from a red Tamer for 2 memory and drew a card."),
  "BT4-012": (cardId) =>
    effectBt3Demo(
      cardId,
      "GeoGreymon",
      5000,
      "GeoGreymon trashed two sources to delete an opposing Digimon with 4000 DP or less.",
    ),
  "BT4-013": (cardId) =>
    effectBt3Demo(
      cardId,
      "BurningGreymon",
      6000,
      "BurningGreymon digivolved onto a red Tamer and gained +3000 DP during its turn.",
    ),
  "BT4-014": (cardId) => vanillaBt3Demo(cardId, "Vermilimon", 8000),
  "BT4-015": (cardId) =>
    effectBt3Demo(cardId, "Volcdramon", 7000, "Volcdramon granted Security Attack +1 to its host."),
  "BT4-016": (cardId) =>
    effectBt3Demo(
      cardId,
      "Aldamon",
      7000,
      "Aldamon gained Security Attack +1 and +4000 DP with a Hybrid or red Tamer source.",
    ),
  "BT4-017": (cardId) =>
    effectBt3Demo(
      cardId,
      "RizeGreymon",
      7000,
      "RizeGreymon was treated as yellow, Digi-Bursted to play a Tamer, and reduced an opposing Digimon by 2000 DP.",
    ),
  "BT4-018": (cardId) => effectBt3Demo(cardId, "Spinomon", 10000, "Spinomon gained +3000 DP during its turn."),
  "BT4-019": (cardId) =>
    effectBt3Demo(
      cardId,
      "VictoryGreymon",
      12000,
      "VictoryGreymon Digi-Bursted 2 to delete an opposing Digimon with 8000 DP or less.",
    ),
  "BT4-020": (cardId) =>
    effectBt3Demo(
      cardId,
      "ShineGreymon",
      11000,
      "ShineGreymon gained Security Attack +1 for each suspended red or yellow Tamer.",
    ),
  "BT4-021": (cardId) =>
    effectBt3Demo(cardId, "Gaomon", 2000, "Gaomon returned itself to hand after being trashed for Digi-Burst."),
  "BT4-022": (cardId) => vanillaBt3Demo(cardId, "Sangomon", 4000),
  "BT4-023": (cardId) =>
    effectBt3Demo(
      cardId,
      "Strabimon",
      2000,
      "Strabimon revealed cards and added a Hybrid Digimon and blue Tamer to hand.",
    ),
  "BT4-024": (cardId) => vanillaBt3Demo(cardId, "Tobiumon", 3000),
  "BT4-025": (cardId) =>
    effectBt3Demo(cardId, "Lobomon", 5000, "Lobomon digivolved from a blue Tamer for 2 memory and drew a card."),
  "BT4-026": (cardId) =>
    effectBt3Demo(cardId, "GaoGamon", 5000, "GaoGamon trashed two sources for Digi-Burst to draw a card."),
  "BT4-027": (cardId) =>
    effectBt3Demo(
      cardId,
      "KendoGarurumon",
      6000,
      "KendoGarurumon digivolved from a blue Tamer and returned a level 3 Digimon while trashing its sources.",
    ),
  "BT4-028": (cardId) =>
    effectBt3Demo(
      cardId,
      "Piranimon",
      7000,
      "Piranimon trashed the top source of an opposing Digimon when its host attacked.",
    ),
  "BT4-029": (cardId) => vanillaBt3Demo(cardId, "Gusokumon", 10000),
  "BT4-030": (cardId) => vanillaBt3Demo(cardId, "Beowolfmon", 7000),
  "BT4-031": (cardId) =>
    effectBt3Demo(
      cardId,
      "MarineChimairamon",
      7000,
      "MarineChimairamon returned another own Digimon as cost and returned an opposing Digimon without sources.",
    ),
  "BT4-032": (cardId) =>
    effectBt3Demo(
      cardId,
      "MachGaogamon",
      7000,
      "MachGaogamon Digi-Bursted 2 to return a level 4 Digimon after trashing its sources.",
    ),
  "BT4-033": (cardId) =>
    effectBt3Demo(
      cardId,
      "ZeedGarurumon",
      12000,
      "ZeedGarurumon Digi-Bursted 2 to return a level 5 Digimon and trash its sources.",
    ),
  "BT4-034": (cardId) =>
    effectBt3Demo(
      cardId,
      "Regalecusmon",
      11000,
      "Regalecusmon trashed its bottom source, then drew 1 and gained 1 memory when attacking.",
    ),
  "BT4-035": (cardId) =>
    effectBt3Demo(
      cardId,
      "MirageGaogamon",
      12000,
      "MirageGaogamon gained memory for cards in the opponent's hand and was unblockable during its turn.",
    ),
  "BT4-036": (cardId) => vanillaBt3Demo(cardId, "Falcomon", 5000),
  "BT4-037": (cardId) =>
    effectBt3Demo(
      cardId,
      "Kudamon",
      2000,
      "Kudamon trashed the top security card to give an opposing Digimon -2000 DP.",
    ),
  "BT4-038": (cardId) =>
    effectBt3Demo(cardId, "BushiAgumon", 3000, "BushiAgumon has Rush and can attack during the turn it was played."),
  "BT4-039": (cardId) =>
    effectBt3Demo(cardId, "Growlmon", 4000, "Growlmon gave its host +1000 DP while you had 3 or fewer security cards."),
  "BT4-040": (cardId) => vanillaBt3Demo(cardId, "Diatrymon", 6000),
  "BT4-041": (cardId) =>
    effectBt3Demo(
      cardId,
      "Meicoomon",
      3000,
      "Meicoomon gave an opposing Digimon -4000 DP when its owner had 3 or fewer security cards.",
    ),
  "BT4-042": (cardId) =>
    effectBt3Demo(cardId, "Piddomon", 4000, "Piddomon has Blocker and loses 2 memory when it attacks."),
  "BT4-043": (cardId) => vanillaBt3Demo(cardId, "Crowmon", 8000),
  "BT4-044": (cardId) =>
    effectBt3Demo(
      cardId,
      "HippoGryphonmon",
      10000,
      "HippoGryphonmon gave an opposing Digimon -3000 DP when attacking at 3 or fewer security.",
    ),
  "BT4-045": (cardId) =>
    effectBt3Demo(
      cardId,
      "Maycrackmon",
      7000,
      "Maycrackmon gave your Security Digimon +4000 DP during the opponent's turn at 3 or fewer security.",
    ),
  "BT4-046": (cardId) =>
    effectBt3Demo(
      cardId,
      "WarGrowlmon",
      7000,
      "WarGrowlmon Digi-Bursted 2 to give an opposing Digimon -4000 DP and boosted its host.",
    ),
  "BT4-047": (cardId) =>
    effectBt3Demo(
      cardId,
      "Rasielmon",
      12000,
      "Rasielmon recovered 2 cards when digivolving and trashed the top security card at the opponent's turn end.",
    ),
  "BT4-048": (cardId) =>
    effectBt3Demo(
      cardId,
      "WarGreymon",
      12000,
      "WarGreymon took the top security card to hand, unsuspended, and applied -6000 DP once per turn.",
    ),
  "BT4-049": (cardId) =>
    effectBt3Demo(cardId, "Varodurumon", 12000, "Varodurumon Digi-Bursted 3 to give all opposing Digimon -4000 DP."),
  "BT4-050": (cardId) => vanillaBt3Demo(cardId, "Liollmon", 5000),
  "BT4-051": (cardId) =>
    effectBt3Demo(cardId, "DoKunemon", 2000, "DoKunemon revealed cards and added a Digimon with Digi-Burst to hand."),
  "BT4-052": (cardId) =>
    effectBt3Demo(cardId, "Lalamon", 2000, "Lalamon returned itself to hand after being trashed for Digi-Burst."),
  "BT4-053": (cardId) => vanillaBt3Demo(cardId, "Roachmon", 3000),
  "BT4-054": (cardId) =>
    effectBt3Demo(
      cardId,
      "Sunflowmon",
      5000,
      "Sunflowmon Digi-Bursted 2 to stop a suspended opposing Digimon from unsuspending.",
    ),
  "BT4-055": (cardId) =>
    effectBt3Demo(
      cardId,
      "Leomon",
      5000,
      "Leomon suspended an opposing Digimon with 3000 DP or less when digivolving.",
    ),
  "BT4-056": (cardId) => vanillaBt3Demo(cardId, "SkullScorpiomon", 6000),
  "BT4-057": (cardId) => effectBt3Demo(cardId, "GrapLeomon", 6000, "GrapLeomon gained 1 memory when attacking."),
  "BT4-058": (cardId) =>
    effectBt3Demo(cardId, "Orochimon", 8000, "Orochimon gave one of your Digimon Piercing for the turn."),
  "BT4-059": (cardId) =>
    effectBt3Demo(
      cardId,
      "Lilamon",
      7000,
      "Lilamon Digi-Bursted 2 to suspend an opposing Digimon and suspended one when its host attacked with a Tamer.",
    ),
  "BT4-060": (cardId) =>
    effectBt3Demo(cardId, "Lotosmon", 12000, "Lotosmon suspended a level 4 or lower Digimon played by either player."),
  "BT4-061": (cardId) =>
    effectBt3Demo(cardId, "BanchoLeomon", 11000, "BanchoLeomon suspended up to 2 opposing Digimon when deleted."),
  "BT4-062": (cardId) =>
    effectBt3Demo(
      cardId,
      "Nidhoggmon",
      13000,
      "Nidhoggmon Digi-Bursted 4 to bottom-deck all suspended opposing Digimon.",
    ),
  "BT4-063": (cardId) =>
    effectBt3Demo(
      cardId,
      "Commandramon",
      1000,
      "Commandramon revealed 3 cards and could play a Commandramon for free when deleted.",
    ),
  "BT4-064": (cardId) =>
    effectBt3Demo(
      cardId,
      "Sunarizamon",
      2000,
      "Sunarizamon returned itself to hand after being trashed for Digi-Burst.",
    ),
  "BT4-065": (cardId) => vanillaBt3Demo(cardId, "Gotsumon", 6000),
  "BT4-066": (cardId) =>
    effectBt3Demo(cardId, "Golemon", 3000, "Golemon gave itself and your other black Digimon +1000 DP."),
  "BT4-067": (cardId) =>
    effectBt3Demo(cardId, "Sealsdramon", 6000, "Sealsdramon has Blocker and loses 2 memory when attacking."),
  "BT4-068": (cardId) =>
    effectBt3Demo(
      cardId,
      "Baboongamon",
      4000,
      "Baboongamon Digi-Bursted 2 to De-Digivolve 1 an opposing Digimon with play cost 7 or less.",
    ),
  "BT4-069": (cardId) => vanillaBt3Demo(cardId, "Blimpmon", 7000),
  "BT4-070": (cardId) =>
    effectBt3Demo(cardId, "Meteormon", 8000, "Meteormon has Reboot and remains suspended after attacking."),
  "BT4-071": (cardId) =>
    effectBt3Demo(
      cardId,
      "Tankdramon",
      7000,
      "Tankdramon revealed 2 cards and could play a Commandramon when another D-Brigade Digimon was deleted.",
    ),
  "BT4-072": (cardId) =>
    effectBt3Demo(
      cardId,
      "Gogmamon",
      7000,
      "Gogmamon Digi-Bursted 1 to give an own Digimon +2000 DP through the opponent's turn and grants its host +1000 DP.",
    ),
  "BT4-073": (cardId) =>
    effectBt3Demo(
      cardId,
      "BanchoGolemon",
      11000,
      "BanchoGolemon has Blocker and gains +3000 DP during the opponent's turn while they have 3 Digimon.",
    ),
  "BT4-074": (cardId) =>
    effectBt3Demo(
      cardId,
      "Darkdramon",
      11000,
      "Darkdramon returned D-Brigade Digimon from trash to the deck top, gained memory, and has Rush.",
    ),
  "BT4-075": (cardId) =>
    effectBt3Demo(
      cardId,
      "Blastmon",
      13000,
      "Blastmon has Security Attack +1 and lets the opponent redirect its attack to an unsuspended Digimon.",
    ),
  "BT4-076": (cardId) => vanillaBt3Demo(cardId, "Gabumon", 4000),
  "BT4-077": (cardId) =>
    effectBt3Demo(cardId, "Ghostmon", 2000, "Ghostmon returned to hand after being trashed for its host's Digi-Burst."),
  "BT4-078": (cardId) =>
    effectBt3Demo(
      cardId,
      "Soundbirdmon",
      1000,
      "Soundbirdmon could trash an Option from hand when attacking to gain 1 memory.",
    ),
  "BT4-079": (cardId) =>
    effectBt3Demo(cardId, "Labramon", 2000, "Labramon drew one card and then trashed one card from hand."),
  "BT4-080": (cardId) => vanillaBt3Demo(cardId, "Bakemon", 6000),
  "BT4-081": (cardId) =>
    effectBt3Demo(cardId, "Devimon", 5000, "Devimon Digi-Bursted 2 to delete an opposing level 3 Digimon."),
  "BT4-082": (cardId) => vanillaBt3Demo(cardId, "Dobermon", 7000),
  "BT4-083": (cardId) =>
    effectBt3Demo(cardId, "Cerberusmon", 6000, "Cerberusmon drew 2 cards and then trashed 1 card when deleted."),
  "BT4-084": (cardId) =>
    effectBt3Demo(
      cardId,
      "NeoDevimon",
      7000,
      "NeoDevimon gained 3 memory when the opponent played a Tamer and its inherited effect gained memory when one became suspended.",
    ),
  "BT4-085": (cardId) => vanillaBt3Demo(cardId, "Phantomon", 10000),
  "BT4-086": (cardId) =>
    effectBt3Demo(
      cardId,
      "Cerberusmon: Werewolf Mode",
      9000,
      "Werewolf Mode could delete a Cerberusmon to gain 9 memory and has Rush.",
    ),
  "BT4-087": (cardId) =>
    effectBt3Demo(
      cardId,
      "Anubismon",
      10000,
      "Anubismon played a level 3 Digimon from trash for free and gave it Rush.",
    ),
  "BT4-088": (cardId) =>
    effectBt3Demo(
      cardId,
      "DanDevimon",
      12000,
      "DanDevimon trashed the opponent's top security when one of yours was removed and made them trash 2 cards when deleted.",
    ),
  "BT4-089": (cardId) =>
    effectBt3Demo(
      cardId,
      "Plutomon",
      12000,
      "Plutomon drew two cards and used a purple Option costing 6 or less for free.",
    ),
  "BT4-090": (cardId) =>
    effectBt3Demo(
      cardId,
      "Chaosmon",
      14000,
      "Chaosmon has Piercing, unsuspends when digivolving, and attacks an unsuspended Digimon.",
    ),
  "BT4-091": (cardId) =>
    effectBt3Demo(
      cardId,
      "Chaosmon: Valdur Arm",
      14000,
      "Chaosmon: Valdur Arm applied -7000 DP twice when digivolving and gains 3 memory when deleted.",
    ),
  "BT4-092": (cardId) =>
    effectBt3Demo(
      cardId,
      "Marcus Damon",
      0,
      "Marcus Damon set memory to 3 at turn start, could suspend for memory when an eligible Greymon attacked, and plays from security.",
    ),
  "BT4-093": (cardId) =>
    effectBt3Demo(
      cardId,
      "Thomas H. Norstein",
      0,
      "Thomas H. Norstein drew on play, could unsuspend a Gao Digimon, and plays from security.",
    ),
  "BT4-094": (cardId) =>
    effectBt3Demo(
      cardId,
      "Tai Kamiya",
      0,
      "Tai Kamiya gave own Digimon +1000 DP at 3 or fewer security and could suspend for memory after a battle deletion.",
    ),
  "BT4-095": (cardId) =>
    effectBt3Demo(
      cardId,
      "Yoshino Fujieda",
      0,
      "Yoshino Fujieda returned a Digi-Egg from trash and could reduce a Digi-Burst digivolution cost.",
    ),
  "BT4-096": (cardId) =>
    effectBt3Demo(
      cardId,
      "Izzy Izumi",
      0,
      "Izzy Izumi set memory to 3 and could reveal 3 black cards to gain memory and return them to the deck.",
    ),
  "BT4-097": (cardId) =>
    effectBt3Demo(
      cardId,
      "Kari Kamiya",
      0,
      "Kari Kamiya could suspend to gain 1 memory when a card left your security and plays from security.",
    ),
  "BT4-098": (cardId) =>
    effectBt3Demo(
      cardId,
      "Atomic Inferno",
      0,
      "Atomic Inferno boosted a Hybrid with +3000 DP and Security Attack +1, and its Security effect boosted all own Digimon.",
    ),
  "BT4-099": (cardId) =>
    effectBt3Demo(
      cardId,
      "Heir of Dragons",
      0,
      "Heir of Dragons drew 2 and deleted a 4000 DP Digimon while Greymon was present, including from security.",
    ),
  "BT4-100": (cardId) =>
    effectBt3Demo(
      cardId,
      "Trident Revolver",
      0,
      "Trident Revolver deleted a 6000 DP Digimon and played a cost-4 Tamer, including from security.",
    ),
};
