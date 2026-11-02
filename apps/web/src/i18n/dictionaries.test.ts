import { describe, expect, it } from "vitest";
import { en } from "@/i18n/en";
import { loadDictionary } from "@/i18n/loadDictionary";
import { LOCALES, type Locale } from "@/i18n/locales";
import type { Dictionary } from "@/i18n/translationTypes";

const translatedLocales = LOCALES.filter((locale): locale is Exclude<Locale, "en"> => locale !== "en");
const dictionaries = Object.fromEntries(
  await Promise.all(translatedLocales.map(async (locale) => [locale, await loadDictionary(locale)] as const)),
) as Record<Exclude<Locale, "en">, Dictionary>;

function placeholders(text: string): string[] {
  return [...new Set([...text.matchAll(/\{\w+\}/g)].map(([placeholder]) => placeholder))].sort();
}

describe.each(translatedLocales)("%s dictionary", (locale) => {
  const dictionary: Record<string, string> = dictionaries[locale];

  it("has exactly the English keys", () => {
    expect(Object.keys(dictionary).sort()).toEqual(Object.keys(en).sort());
  });

  it("has a non-empty string for every key", () => {
    const empty = Object.entries(dictionary)
      .filter(([, value]) => typeof value !== "string" || value.trim() === "")
      .map(([key]) => key);
    expect(empty).toEqual([]);
  });

  it("preserves whitespace used to join translated fragments", () => {
    const mismatches = Object.entries(en)
      .filter(
        ([key, value]) =>
          value.match(/^\s*/)?.[0] !== dictionary[key]?.match(/^\s*/)?.[0] ||
          value.match(/\s*$/)?.[0] !== dictionary[key]?.match(/\s*$/)?.[0],
      )
      .map(([key]) => key);
    expect(mismatches).toEqual([]);
  });

  it("uses the same placeholders as English", () => {
    const mismatches = Object.entries(en)
      .filter(([key, value]) => placeholders(dictionary[key] ?? "").join() !== placeholders(value).join())
      .map(([key, value]) => ({ key, en: placeholders(value), [locale]: placeholders(dictionary[key] ?? "") }));
    expect(mismatches).toEqual([]);
  });
});

const literalChineseMistranslations =
  /甲板|火柴|沃尔沃|沃爾沃|主菜(?!单)|繁殖|育种|育種|养殖|養殖|数码兽|數碼獸|数字进化|數位進化|数字革命|數位革命|宙斯盾|神盾|套牌|牌组|牌組|抽奖|抽獎|节省|拦截者|攔截者/;
const pauseKeys = new Set(["rollback.waiting", "replay.pause", "lobby.timer.rules", "game.timer.paused"]);
const inGameKey = /^(game|overlay|log|notice|panel|showcase|reject|mobile\.overlay|mobile\.board|redesign\.arena)\./;

describe.each(["zh-CN", "zh-TW"] as const)("%s game terminology", (locale) => {
  it("avoids literal mistranslations of deck, match, Digivolve, breeding and Digimon", () => {
    const mistranslated = Object.entries(dictionaries[locale])
      .filter(([, value]) => literalChineseMistranslations.test(value))
      .map(([key, value]) => ({ key, value }));
    expect(mistranslated).toEqual([]);
  });

  it("uses pause wording only for pausing, not for suspending cards", () => {
    const misused = Object.entries(dictionaries[locale])
      .filter(([key, value]) => /暂停|暫停/.test(value) && !pauseKeys.has(key))
      .map(([key, value]) => ({ key, value }));
    expect(misused).toEqual([]);
  });

  it("uses the card-game term, not file deletion, for deleting Digimon", () => {
    const misused = Object.entries(dictionaries[locale])
      .filter(([key, value]) => inGameKey.test(key) && /删除|刪除/.test(value))
      .map(([key, value]) => ({ key, value }));
    expect(misused).toEqual([]);
  });
});

const literalFrenchMistranslations =
  /\b(?:[Pp]onts?|[Tt]errasses?|[Pp]latines?|[Tt]rappe|[Pp]oubelle|[Rr]eproduction|[Cc]orrespondance|[Dd]ompteurs?|[Rr]ediffusions?|[Pp]ieux?|[Rr]ebondir|[Tt]irages)\b|Digi-(?:Egg|[Oo]euf)/;
const informalFrenchAddress = /(?<!\p{L})(?:[Tt]u|[Tt]on|[Tt]a|[Tt]es|[Tt]oi)(?!\p{L})/u;
const informalFrenchImperative =
  /(?<!\p{L})(?:réessaie|réessaye)(?!\p{L})|(?:^|[.!?]\s+)(?:patiente|choisis|sélectionne|clique|appuie|vérifie|essaie|essaye|consulte|saisis|reconnecte|actualise|rafraîchis|contacte|attends|rejoins|apprends|reviens|maintiens|fais|mets|prends|viens)(?!\p{L})/iu;
const platinumTierKeys = new Set(["ranked.tier.platinum"]);
const googleDriveTrashKeys = new Set([
  "replay.trashOffer",
  "replay.trashConfirm",
  "replay.trashDone",
  "replay.trashFailed",
]);

describe("fr game terminology", () => {
  it("avoids literal mistranslations of deck, hatch, breeding, trash, match and Tamer", () => {
    const mistranslated = Object.entries(dictionaries.fr)
      .filter(([key, value]) =>
        literalFrenchMistranslations.test(platinumTierKeys.has(key) ? value.replace(/\bPlatine\b/, "") : value),
      )
      .map(([key, value]) => ({ key, value }));
    expect(mistranslated).toEqual([]);
  });

  it("uses défausse for the card-game trash and keeps corbeille for Google Drive", () => {
    const misused = Object.entries(dictionaries.fr)
      .filter(([key, value]) => /[Cc]orbeille/.test(value) && !googleDriveTrashKeys.has(key))
      .map(([key, value]) => ({ key, value }));
    expect(misused).toEqual([]);
  });

  it("addresses the player with vous", () => {
    const informal = Object.entries(dictionaries.fr)
      .filter(([, value]) => informalFrenchAddress.test(value) || informalFrenchImperative.test(value))
      .map(([key, value]) => ({ key, value }));
    expect(informal).toEqual([]);
  });
});

const literalGermanMistranslations =
  /Streichh|Übereinstimmung|Luke|Müll|Brut(?:gebiet|bereich|phase)|\bZucht|Bändiger|Zähmer|Ärmel|Wiederholung|[Dd]igitalisier|Eierdeck|Sicherheit|\bSpeicher\b|Wirbelangriff|\[(?:Zähler|Gegen|Haupt)\]/;
const informalGermanAddress = /(?<!\p{L})(?:[Dd]u|[Dd]ein(?:e|en|em|er|es)?|[Dd]ich|[Dd]ir)(?!\p{L})/u;
const informalGermanImperative =
  /(?<!\p{L})(?:versuche es|öffne|wähle|klicke|tippe|prüfe|überprüfe|warte|verbinde|gib|schau|nutze|verwende|füge|lade|starte|schließe|lege|bestätige|aktualisiere|entferne|melde)(?!\p{L})/iu;
const tamerCommandKey = /^chat\.emote\./;

describe("de game terminology", () => {
  it("avoids literal mistranslations of match, hatch, breeding, trash, security, memory and replay", () => {
    const mistranslated = Object.entries(dictionaries.de)
      .filter(([, value]) => literalGermanMistranslations.test(value))
      .map(([key, value]) => ({ key, value }));
    expect(mistranslated).toEqual([]);
  });

  it("uses Ablage for the card-game trash and keeps Papierkorb for Google Drive", () => {
    const misused = Object.entries(dictionaries.de)
      .filter(([key, value]) => /Papierkorb/.test(value) && !googleDriveTrashKeys.has(key))
      .map(([key, value]) => ({ key, value }));
    expect(misused).toEqual([]);
  });

  it("addresses the player with Sie outside Tamer commands", () => {
    const informal = Object.entries(dictionaries.de)
      .filter(
        ([key, value]) =>
          !tamerCommandKey.test(key) && (informalGermanAddress.test(value) || informalGermanImperative.test(value)),
      )
      .map(([key, value]) => ({ key, value }));
    expect(informal).toEqual([]);
  });
});

const literalJapaneseMistranslations =
  /デジボル|デジボリューション|デジエッグ|エッグデッキ|卵|繁殖|飼育|ハッチ|パイル|サスペンド|一時停止|防犯|調教師|試合|プレーヤー|イージス|アイギス|＜/;

describe("ja game terminology", () => {
  it("avoids literal mistranslations of Digivolve, Digi-Egg, breeding, hatch, suspend, match and Aegis", () => {
    const mistranslated = Object.entries(dictionaries.ja)
      .filter(([key, value]) => literalJapaneseMistranslations.test(value) && !pauseKeys.has(key))
      .map(([key, value]) => ({ key, value }));
    expect(mistranslated).toEqual([]);
  });

  it("uses トラッシュ for the card-game trash and keeps ゴミ箱 for Google Drive", () => {
    const misused = Object.entries(dictionaries.ja)
      .filter(([key, value]) => /ゴミ/.test(value) && !googleDriveTrashKeys.has(key))
      .map(([key, value]) => ({ key, value }));
    expect(misused).toEqual([]);
  });

  it("uses 消滅 for deleting Digimon, not file deletion", () => {
    const misused = Object.entries(dictionaries.ja)
      .filter(([key, value]) => inGameKey.test(key) && /削除|消去/.test(value))
      .map(([key, value]) => ({ key, value }));
    expect(misused).toEqual([]);
  });
});

const literalKoreanMistranslations =
  /데크|갑판|해치|파일 수|디지볼|디지털화|디지털 진화|계란|번식|사육|쓰레기|보안|성냥|일치 항목|Digi-?Egg|플레이 비용|진화 비용|당신|귀하|[<＜〈]/;

describe("ko game terminology", () => {
  it("avoids literal mistranslations of deck, hatch, pile, Digivolve, Digi-Egg, breeding, trash and security", () => {
    const mistranslated = Object.entries(dictionaries.ko)
      .filter(([, value]) => literalKoreanMistranslations.test(value))
      .map(([key, value]) => ({ key, value }));
    expect(mistranslated).toEqual([]);
  });

  it("uses 트래시 for the card-game trash and keeps 휴지통 for Google Drive", () => {
    const misused = Object.entries(dictionaries.ko)
      .filter(([key, value]) => /휴지통/.test(value) && !googleDriveTrashKeys.has(key))
      .map(([key, value]) => ({ key, value }));
    expect(misused).toEqual([]);
  });

  it("uses 레스트 for suspending cards and keeps pause wording for pausing", () => {
    const misused = Object.entries(dictionaries.ko)
      .filter(([key, value]) => /일시 ?정지|일시 ?중/.test(value) && !pauseKeys.has(key))
      .map(([key, value]) => ({ key, value }));
    expect(misused).toEqual([]);
  });

  it("uses 소멸 for deleting Digimon, not file deletion", () => {
    const misused = Object.entries(dictionaries.ko)
      .filter(([key, value]) => inGameKey.test(key) && /삭제/.test(value))
      .map(([key, value]) => ({ key, value }));
    expect(misused).toEqual([]);
  });
});

const literalIndonesianMistranslations =
  /(?<!\p{L})(?:[Dd]ek|[Tt]elur|[Kk]eamanan|[Pp]emblokir|[Pp]enjinak|[Pp]erselisihan|[Ss]elongsong|[Kk]ecocokan|[Dd]igivolusi|[Pp]embiakan|[Pp]erkembangbiakan|[Dd]itangguhkan|[Pp]enangguhan|[Tt]ayangan ulang|[Pp]emutaran ulang)(?!\p{L})|\[Penghitung\]/u;
const informalIndonesianAddress =
  /(?<!\p{L})(?:[Kk]amu|[Aa]ku|[Kk]au|[Ee]ngkau)(?!\p{L})|(?<!\p{L})(?!(?:[Tt]amu|[Ii]lmu|[Jj]amu|(?:[Bb]er)?[Tt]emu)(?!\p{L}))\p{L}+-?mu(?!\p{L})|(?<!\p{L})(?!(?:\p{L}*laku|[Bb]uku|[Kk]uku|[Ss]aku|[Ss]uku|[Pp]aku|[Bb]aku|[Ss]iku)(?!\p{L}))\p{L}+-?ku(?!\p{L})/u;
const eggPlaceNameKey = "redesign.foundation.battlefield.egg-village";

describe("id game terminology", () => {
  it("avoids literal mistranslations of deck, Digi-Egg, security, Blocker, Tamer, Discord, sleeve, match and suspend", () => {
    const mistranslated = Object.entries(dictionaries.id)
      .filter(([key, value]) => key !== eggPlaceNameKey && literalIndonesianMistranslations.test(value))
      .map(([key, value]) => ({ key, value }));
    expect(mistranslated).toEqual([]);
  });

  it("uses trash for the card-game trash and keeps sampah for Google Drive", () => {
    const misused = Object.entries(dictionaries.id)
      .filter(([key, value]) => /[Ss]ampah/.test(value) && !googleDriveTrashKeys.has(key))
      .map(([key, value]) => ({ key, value }));
    expect(misused).toEqual([]);
  });

  it("addresses the player with Anda", () => {
    const informal = Object.entries(dictionaries.id)
      .filter(([, value]) => informalIndonesianAddress.test(value))
      .map(([key, value]) => ({ key, value }));
    expect(informal).toEqual([]);
  });

  it("uses delete for deleting Digimon, not file removal", () => {
    const misused = Object.entries(dictionaries.id)
      .filter(([key, value]) => inGameKey.test(key) && /[Hh]apus|[Hh]ancurkan/.test(value))
      .map(([key, value]) => ({ key, value }));
    expect(misused).toEqual([]);
  });
});
