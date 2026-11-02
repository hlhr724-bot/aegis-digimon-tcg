import { botPersonaById } from "#shared/bot/personas/botPersonaById";
import type { BotPersona, BotPersonaDeck } from "#shared/bot/personas/BotPersona";
import { getCardDefinition } from "#shared/cards/registry";
import type { CardDefinition } from "#shared/cards/types";
import { ALL_FAMOUS_DECKS } from "#shared/decks/index";
import type { FamousDeck } from "#shared/decks/types";
import { CardKind } from "#shared/schema/enums";

const families: Readonly<Record<string, string>> = {
  UlforceVeedramon: "rina-shinomiya",
  "Glowing Dawn": "tomoro-and-kyo",
  "Toho Braves": "kunlun",
  Sanmyojin: "kunlun",
  Chronomon: "kosuke-misono",
  Jupitermon: "inori-misono",
  Gallantmon: "takato-matsuki",
  Growlmon: "takato-matsuki",
  ShineGreymon: "marcus-damon",
  MirageGaogamon: "thomas-norstein",
  Loogamon: "eiji-nagasumi",
  "Fenriloogamon Takemikazuchi": "eiji-nagasumi",
  Beelzemon: "ai-and-mako",
  "Purple Beelzemon": "ai-and-mako",
  Sakuyamon: "rika-nonaka",
  Imperialdramon: "davis-and-ken",
  "Veemon Armor": "davis-motomiya",
  WarGreymon: "tai-kamiya",
  "WarGreymon X Antibody": "tai-kamiya",
  "Red WarGreymon X Antibody": "tai-kamiya",
  "Red Greymon X-Antibody": "tai-kamiya",
  "X Antibody (Red)": "tai-kamiya",
  "Yellow WarGreymon": "tai-kamiya",
  BlackWarGreymon: "yuuya-kuga",
  "BlackWarGreymon X": "yuuya-kuga",
  "BlackWarGreymon (Red/Black)": "yuuya-kuga",
  MetalGarurumon: "matt-ishida",
  "Gabumon Bond of Friendship": "matt-ishida",
  Omnimon: "tai-and-matt",
  "Red Omnimon": "tai-and-matt",
  "Red Hybrid": "takuya-kanbara",
  AncientGreymon: "takuya-kanbara",
  "Blue Hybrid": "tommy-himi",
  "Hybrid (Blue)": "tommy-himi",
  AncientGarurumon: "koji-minamoto",
  MagnaGarurumon: "koji-minamoto",
  "Yellow Hybrid": "zoe-orimoto",
  "Green Hybrid": "jp-shibayama",
  "Purple Hybrid": "koichi-kimura",
  "Blue Flare": "kiriha-aonuma",
  "Xros Heart": "taiki-kudo",
  "Red Shoutmon DX": "taiki-kudo",
  Hunters: "tagiru-akashi",
  Arresterdramon: "tagiru-akashi",
  "Purple Arresterdramon": "tagiru-akashi",
  Mastemon: "mirei-mikagura",
  "Mastemon (Yellow/Purple)": "mirei-mikagura",
  Hudiemon: "erika-mishima",
  "Cyber Sleuth": "kyoko-kuremi",
  Alphamon: "kota-domoto",
  Numemon: "satsuki-tamahime",
  "Black Numemon": "satsuki-tamahime",
  "D Brigade": "satsuki-tamahime",
  Machinedramon: "analogman",
  "Black Machinedramon": "analogman",
  Galacticmon: "zenith",
  Diaboromon: "arata-sanada",
  Belphemon: "akihiro-kurata",
  "Armor Vaccine": "tk-takaishi",
  Phoenixmon: "sora-takenouchi",
  Rapidmon: "willis",
  "Alliance Lopmon & Terriermon": "henry-and-shu-chong",
  Galaxy: "koh-and-sayo",
  "MirageGaogamon Galaxy": "koh-and-sayo",
  Gammamon: "hiro-amanokawa",
  Vortexdramon: "shoto-kazama",
  Ryugumon: "shoto-kazama",
  Creepymon: "owen-dreadnought",
  Styracomon: "owen-dreadnought",
  HeavyMetaldramon: "yuuki",
  Magneticdramon: "close",
  Pyramidimon: "close",
  Puppets: "mirai-kinosaki",
  MaloMyotismon: "yukio-oikawa",
  "Royal Base": "winr",
  Dantemon: "kazuki-and-itsuki",
  Rebootmon: "kazuki-and-itsuki",
  Gaiamon: "haru-shinkai",
  Deusmon: "yujin-ozora",
  Plesiomon: "joe-kido",
  "Blue Zudomon": "joe-kido",
  "Zudomon Ace": "joe-kido",
  TyrantKabuterimon: "izzy-izumi",
  Silphymon: "yolei-and-kari",
};

const keyDigimon: Readonly<Record<string, readonly string[]>> = {
  "rina-shinomiya": ["UlforceVeedramon"],
  "takato-matsuki": ["Guilmon", "Growlmon", "WarGrowlmon", "Gallantmon"],
  "marcus-damon": ["ShineGreymon"],
  "thomas-norstein": ["MirageGaogamon"],
  "ai-and-mako": ["Beelzemon"],
  "rika-nonaka": ["Sakuyamon"],
  "davis-and-ken": ["Imperialdramon"],
  "davis-motomiya": ["Flamedramon", "Magnamon"],
  "tai-kamiya": ["WarGreymon"],
  "yuuya-kuga": ["BlackWarGreymon"],
  "matt-ishida": ["MetalGarurumon"],
  "tai-and-matt": ["Omnimon"],
  "takuya-kanbara": ["AncientGreymon", "EmperorGreymon"],
  "koji-minamoto": ["AncientGarurumon", "MagnaGarurumon"],
  "taiki-kudo": ["Shoutmon"],
  "tagiru-akashi": ["Arresterdramon"],
  "mirei-mikagura": ["Mastemon"],
  analogman: ["Machinedramon"],
  zenith: ["Galacticmon"],
  "arata-sanada": ["Diaboromon"],
  "akihiro-kurata": ["Belphemon"],
  "sora-takenouchi": ["Phoenixmon"],
  "hiro-amanokawa": ["Gammamon"],
  "kazuki-and-itsuki": ["Dantemon", "Rebootmon"],
  "haru-shinkai": ["Gaiamon"],
  "joe-kido": ["Zudomon", "Plesiomon"],
  "izzy-izumi": ["TyrantKabuterimon"],
  "yolei-and-kari": ["Silphymon"],
};

function compactName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function hasKeyDigimon(cards: readonly CardDefinition[], personaId: string): boolean {
  const keys = (keyDigimon[personaId] ?? []).map(compactName);
  return cards.some(
    (card) => card.kinds.includes(CardKind.Digimon) && keys.some((key) => compactName(card.nameEn).startsWith(key)),
  );
}

function signature(cards: readonly string[]): string {
  return [...cards].sort().join(",");
}

function matches(deck: BotPersonaDeck, preset: FamousDeck): boolean {
  return (
    signature(deck.mainDeck) === signature(preset.decklist.mainDeck) &&
    signature(deck.eggDeck) === signature(preset.decklist.eggDeck)
  );
}

function characterName(name: string): string {
  return name
    .replaceAll("&amp;", "&")
    .toLowerCase()
    .split("&")
    .map((part) => part.trim())
    .sort()
    .join("&");
}

function presetPersona(preset: FamousDeck): BotPersona {
  const cards = new Set(preset.decklist.mainDeck);
  let personaId = families[preset.archetype];
  if (preset.archetype === "Magnamon") {
    personaId = cards.has("BT14-084") || cards.has("BT1-087") ? "tk-takaishi" : "davis-motomiya";
  }
  if (preset.archetype === "Alphamon" && cards.has("BT22-101")) personaId = "kyoko-kuremi";
  if (preset.archetype === "Phoenixmon" && !cards.has("BT15-082") && cards.has("BT11-089")) personaId = "akiho-rindou";
  if (preset.archetype === "Rapidmon" && cards.has("EX2-061")) personaId = "henry-wong";
  if (preset.archetype === "BeelStarmon" && cards.has("BT24-088")) personaId = "asuna-shiroki";
  if (preset.archetype === "GraceNovamon" && cards.has("EX5-064")) personaId = "koh-and-sayo";
  if (preset.archetype === "Millenniummon" && cards.has("EX11-055")) personaId = "chitose-horaiji";
  const persona = botPersonaById(personaId);
  const definitions = [...cards].map(getCardDefinition).filter((card): card is CardDefinition => card !== undefined);
  const featuresCharacter =
    persona &&
    definitions.some(
      (card) =>
        card.kinds.includes(CardKind.Tamer) && characterName(card.nameEn) === characterName(persona.displayName),
    );
  const supportsDigiPolice =
    preset.archetype !== "D Brigade" || definitions.some((card) => card.types?.includes("DigiPolice"));
  if (persona && (featuresCharacter || hasKeyDigimon(definitions, persona.id)) && supportsDigiPolice) return persona;
  const archetype = compactName(preset.archetype);
  const digimon = definitions.filter((card) => card.kinds.includes(CardKind.Digimon));
  digimon.sort((left, right) => {
    const leftMatch = compactName(left.nameEn).includes(archetype);
    const rightMatch = compactName(right.nameEn).includes(archetype);
    return (
      Number(rightMatch) - Number(leftMatch) ||
      (right.level ?? 0) - (left.level ?? 0) ||
      (right.playCost ?? 0) - (left.playCost ?? 0) ||
      left.cardId.localeCompare(right.cardId)
    );
  });
  return botPersonaById(digimon[0] ? `digimon:${digimon[0].cardId}` : "aegis")!;
}

export function botPersonaForDeck({ deckId, deck }: { deckId?: string; deck?: BotPersonaDeck }): BotPersona {
  const requested = ALL_FAMOUS_DECKS.find((preset) => preset.deckId === deckId || preset.deckVersion === deckId);
  const preset =
    requested && (!deck || matches(deck, requested))
      ? requested
      : deck
        ? ALL_FAMOUS_DECKS.find((entry) => matches(deck, entry))
        : undefined;
  return preset ? presetPersona(preset) : botPersonaById("aegis")!;
}
